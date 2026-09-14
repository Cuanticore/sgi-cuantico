'use server';

// app/sig/acciones/personas-edicion.ts
//
// **El único camino de escritura de la pertenencia de una persona** (REQ-SIG-15 D-5).
//
// `Persona.areaId` y `Persona.cargoId` existen en el esquema desde REQ-SIG-01 y el generador
// ya los usa (`generacion.ts` resuelve `AREA` y `CARGO` con ellos). Y hasta hoy **ninguna
// acción los escribía**: las 36 filas del censo mostraban «—» en las dos columnas, y por eso
// toda obligación de alcance `AREA` o `CARGO` generaba exactamente cero asignaciones sin
// decirlo — `resolverAlcance` devolvía lista vacía y `planificarGeneracion` hacía `continue`
// sin registrar rechazo, así que en la pantalla de obligaciones una obligación por área se
// veía idéntica a una que ya estaba al día.
//
// ── Las tres reglas que hacen que el número no pueda mentir ───────────────────────────────
//
// **P14 · guardar la pertenencia y generar las asignaciones ocurren en la MISMA transacción**,
// con la bitácora adentro. Si se guardara primero y se generara después, existiría el estado
// «tiene el área pero no las tareas», y ese estado es **indistinguible de «el área no genera
// nada»** — que es precisamente el problema que este requerimiento viene a cerrar.
//
// Nada de esto sale a la red, así que la regla P10 de REQ-SIG-13 —ninguna llamada a Graph
// dentro de una transacción de Prisma— no se viola.
//
// **P15 · se genera sólo para ESA persona, con el núcleo puro.** `planificarGeneracion` recibe
// un arreglo de personas: se le pasa una. No se corre `correrTrabajo('generar-asignaciones')`,
// que generaría para todo el censo y devolvería un total en el que las tareas de esta persona
// quedan sumadas con las de los demás.
//
// **Y la previsión y el guardado comparten `calcular()`.** Es lo que hace imposible que el
// número que el popup muestra antes de guardar difiera del que queda creado: no son dos
// cuentas, es la misma, y una de las dos además escribe. La misma regla del piso rige acá y
// en el cron de las 05:00 (P16-P18), porque las dos llaman a `aplicarPiso` de
// `lib/sig/periodos.ts`; si discreparan, el número informado al guardar sería falso a la
// mañana siguiente.

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { registrar, type Cambio } from '@/lib/sgsi/bitacora';
import { leerLicencias } from '@/lib/sgsi/graph-licencias';
import {
  anomaliasDeLicencia,
  inventarioDeSoftware,
  nombresComerciales,
  resumirSkus,
  PREFIJO_PARAMETRO_SKU,
  type LicenciasDeLaPantalla,
} from '@/lib/sgsi/licencias';
import {
  planificarContactos,
  type ContactoGuardado,
  type ContactoPropuesto,
} from '@/lib/sig/contactos';
import { planificarGeneracion, type AsignacionACrear } from '@/lib/sig/generacion';
import { planificarGrupos, type PlanDeGrupos } from '@/lib/sig/grupos';
import {
  desglosarPorOrigen,
  frasesDelDesglose,
  totalDelDesglose,
  type ObligacionDelDesglose,
  type RenglonDelDesglose,
} from '@/lib/sig/pertenencias';
import {
  autorConPermiso,
  DatoInvalidoError,
  ejecutar,
  exigirId,
  type Resultado,
} from '@/app/sgsi/acciones/sesion';

export interface DatosPertenencia {
  areaId: number | null;
  cargoId: number | null;
  /// **P16 · desde cuándo pertenece**, no cuándo se digitó. Ausente se lee como «hoy», que es
  /// lo más conservador: no le regala periodos a nadie. Quien sabe la fecha real del traslado
  /// la escribe y el piso la respeta.
  areaDesde?: string | null;
  cargoDesde?: string | null;
  /// Los datos de REQ-SIG-09 que tampoco tenían dónde escribirse.
  documentoIdentidad?: string | null;
  tipoContratoId?: number | null;
  fechaIngreso?: string | null;
  telefono?: string | null;
  correoPersonal?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  /// **P9.2 · los contactos de emergencia, la lista entera.** Llega completa y se cruza con
  /// la guardada: el orden de este arreglo es el orden de llamada.
  ///
  /// `undefined` significa «el formulario no trajo la lista» y **no** «la vaciaron»: la
  /// previsión y la pestaña de datos base guardan sin abrir Contactos, y si la ausencia se
  /// leyera como lista vacía, guardar el área de alguien le borraría a quién llamar.
  contactosEmergencia?: ContactoPropuesto[];
  /// **P10 · los grupos de interés marcados, la lista entera.** Son casillas —se pertenece a
  /// varios a la vez— así que llega el conjunto completo y se cruza con las membresías
  /// vigentes: lo que no viene se cierra, lo que viene y no estaba se abre.
  ///
  /// `undefined` significa «el formulario no trajo la lista» y **no** «los desmarcaron a
  /// todos»: la previsión y la pestaña de datos base guardan sin abrir Grupos, y si la
  /// ausencia se leyera como lista vacía, corregir un teléfono sacaría a la persona de todos
  /// sus grupos y le dejaría los pendientes colgando.
  ///
  /// **El grupo derivado no va acá.** Se rechaza en el servidor (`planificarGrupos`), no sólo
  /// con la casilla deshabilitada del popup.
  gruposInteres?: number[];
  /// **P27 · el motivo se exige donde la decisión tiene consecuencia**, y editar un teléfono
  /// no es una de esas. Opcional acá; obligatorio en bloqueo, desbloqueo, anulación y
  /// reasignación. Pedirlo para corregir un teléfono convierte el campo en un trámite y lo
  /// que se obtiene son cien filas que dicen «actualización».
  motivo?: string;
}

export interface ResultadoPertenencia extends Resultado {
  /// Cuántas quedaron creadas. Es un HECHO verificable con un `count(*)`, no una previsión.
  asignadas: number;
  desglose: RenglonDelDesglose[];
  frases: string[];
  /// **P4 · los pendientes que venían del área anterior.** No se borran ni se cierran: se
  /// cuentan y se dicen. Una asignación puede tener un registro de realizado detrás.
  pendientesDelAreaAnterior: number;
  /// **P13 → P4 · los pendientes de los grupos que se desmarcaron.** Mismo trato que el área
  /// anterior: se cuentan y se dicen, no se cierran ni se anulan (R9). Salir de un grupo no
  /// es haber cumplido lo que ese grupo pedía.
  pendientesDeGruposRetirados: number;
}

const VACIO = {
  asignadas: 0,
  desglose: [] as RenglonDelDesglose[],
  frases: [] as string[],
  pendientesDelAreaAnterior: 0,
  pendientesDeGruposRetirados: 0,
};

/// Lo que el generador necesita saber de las obligaciones, más los nombres que el desglose
/// pone en la frase. Se lee una vez y sirve a los dos.
const SELECCION_OBLIGACION = {
  id: true,
  contenidoId: true,
  alcance: true,
  alcancePersonaId: true,
  alcanceCargoId: true,
  alcanceAreaId: true,
  alcanceActivoId: true,
  alcanceTipoActivoId: true,
  alcanceNivelActivoId: true,
  alcanceGrupoInteresId: true,
  responsableSeguimientoId: true,
  periodicidad: true,
  fechaInicio: true,
  plazoDias: true,
  activa: true,
  anclaje: true,
  creadaEn: true,
  alcanceArea: { select: { nombre: true } },
  alcanceCargo: { select: { nombre: true } },
  alcanceTipoActivo: { select: { nombre: true } },
  alcanceGrupoInteres: { select: { nombre: true } },
} as const;

const SELECCION_PERSONA = {
  id: true,
  nombre: true,
  correo: true,
  activa: true,
  areaId: true,
  cargoId: true,
  areaDesde: true,
  cargoDesde: true,
  fechaIngreso: true,
  creadaEn: true,
  documentoIdentidad: true,
  tipoContratoId: true,
  telefono: true,
  correoPersonal: true,
  ciudad: true,
  direccion: true,
  area: { select: { nombre: true } },
  cargo: { select: { nombre: true } },
  // Sólo las VIGENTES. El `id` viaja porque desmarcar **cierra** esa fila con `hasta` y hay
  // que saber cuál: una membresía cerrada sigue contestando quién estaba en el grupo en marzo.
  gruposInteres: { where: { hasta: null }, select: { id: true, grupoId: true, desde: true } },
} as const;

/// El nombre que el desglose pone en la frase, según el alcance.
function destinoDe(o: {
  alcance: string;
  alcanceArea: { nombre: string } | null;
  alcanceCargo: { nombre: string } | null;
  alcanceTipoActivo: { nombre: string } | null;
  alcanceGrupoInteres: { nombre: string } | null;
}): string | null {
  switch (o.alcance) {
    case 'AREA':
      return o.alcanceArea?.nombre ?? null;
    case 'CARGO':
      return o.alcanceCargo?.nombre ?? null;
    case 'ACTIVO':
    case 'TIPO_ACTIVO':
    case 'NIVEL_ACTIVO':
      return o.alcanceTipoActivo?.nombre ?? null;
    case 'GRUPO_INTERES':
      return o.alcanceGrupoInteres?.nombre ?? null;
    default:
      return null;
  }
}

/// Una fecha del formulario a día puro UTC, o `null`. Se trata como día y no como instante
/// por lo mismo que `periodos.ts`: America/Bogotá es UTC−5 sin horario de verano, así que un
/// día UTC es un día Bogotá y la comparación es por año-mes-día.
function dia(valor: string | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor.trim() === '') return null;
  const d = new Date(`${valor.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface Calculo {
  /// `NonNullable` porque `calcular` sólo devuelve `ok: true` cuando la persona existe. Sin
  /// esto el tipo arrastra el `null` de `findUnique` y cada uso pide una comprobación que ya
  /// se hizo — nueve `persona!` que ocultarían el día que la comprobación se caiga.
  persona: NonNullable<Awaited<ReturnType<typeof leerPersona>>>;
  areaDesde: Date | null;
  cargoDesde: Date | null;
  areaCambio: boolean;
  cargoCambio: boolean;
  crear: AsignacionACrear[];
  desglose: RenglonDelDesglose[];
  asignadas: number;
  pendientesDelAreaAnterior: number;
  /// `null` cuando el formulario no trajo la lista de grupos: no hay nada que abrir ni cerrar.
  planGrupos: PlanDeGrupos | null;
  pendientesDeGruposRetirados: number;
}

function leerPersona(personaId: number) {
  return prisma.persona.findUnique({ where: { id: personaId }, select: SELECCION_PERSONA });
}

/// **La cuenta, sin escribir nada.** La comparten la previsión y el guardado, y es lo único
/// que garantiza que digan el mismo número.
async function calcular(
  personaId: number,
  datos: DatosPertenencia,
): Promise<{ ok: false; mensaje: string } | ({ ok: true } & Calculo)> {
  const persona = await leerPersona(personaId);
  if (!persona) return { ok: false, mensaje: 'La persona no existe.' };

  // **P10 · el área y el cargo no se inventan.** El prefijo del área forma el código de un
  // activo y el código es inmutable; y sin cargo, el alcance por activo no resuelve. Si el
  // catálogo no tiene lo que llega, se rechaza con la frase en vez de guardar un id que
  // apunta a nada.
  if (datos.areaId !== null) {
    const area = await prisma.area.findUnique({ where: { id: datos.areaId }, select: { id: true } });
    if (!area) return { ok: false, mensaje: 'El área elegida no existe.' };
  }
  if (datos.cargoId !== null) {
    const cargo = await prisma.cargoResponsable.findUnique({
      where: { id: datos.cargoId },
      select: { id: true },
    });
    if (!cargo) return { ok: false, mensaje: 'El cargo elegido no existe.' };
  }

  const areaCambio = datos.areaId !== persona.areaId;
  const cargoCambio = datos.cargoId !== persona.cargoId;
  const hoy = new Date();

  // P16 · la fecha de pertenencia. Si el área cambió y nadie dijo desde cuándo, es hoy: es lo
  // más conservador, porque no le regala periodos pasados a nadie.
  const areaDesde = areaCambio
    ? (dia(datos.areaDesde) ?? hoy)
    : (dia(datos.areaDesde) ?? persona.areaDesde);
  const cargoDesde = cargoCambio
    ? (dia(datos.cargoDesde) ?? hoy)
    : (dia(datos.cargoDesde) ?? persona.cargoDesde);

  // **P4 · los pendientes del área anterior.** Se cuentan contra el área que la persona tiene
  // AHORA, porque después ya es otra. No se cierran ni se anulan: cada uno puede tener un
  // registro de realizado detrás, y cerrarlos inventaría cumplimiento.
  const pendientesDelAreaAnterior =
    areaCambio && persona.areaId !== null
      ? await prisma.asignacion.count({
          where: {
            personaId,
            estado: 'PENDIENTE',
            obligacion: { alcance: 'AREA', alcanceAreaId: persona.areaId },
          },
        })
      : 0;

  // ── P10 · el plan de los grupos de interés, decidido antes de tocar nada ────────────────
  //
  // **El rechazo del derivado vive acá y no en la pantalla.** La casilla de «Todos» está
  // deshabilitada en el popup, pero eso sólo protege a quien usa el popup: la acción es
  // invocable directamente con el id puesto. Y como el rechazo está en `calcular()`, lo
  // comparten la previsión y el guardado — el popup se entera del error antes de apretar
  // Guardar, y la transacción no llega a abrirse.
  let planGrupos: PlanDeGrupos | null = null;
  if (datos.gruposInteres !== undefined) {
    const catalogo = await prisma.grupoInteres.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, derivado: true },
    });
    planGrupos = planificarGrupos(persona.gruposInteres, datos.gruposInteres, catalogo, hoy);
    if (planGrupos.errores.length > 0) {
      return { ok: false, mensaje: planGrupos.errores.join('; ') + '.' };
    }
  }

  // **P13 → P4 · los pendientes de los grupos que se desmarcan.** Se cuentan contra los grupos
  // de los que la persona sale, igual que con el área anterior, y **no se tocan**: cada uno
  // puede tener un registro de realizado detrás, y cerrarlos inventaría cumplimiento (R9).
  const gruposRetirados = (planGrupos?.cerrar ?? []).map((m) => m.grupoId);
  const pendientesDeGruposRetirados =
    gruposRetirados.length === 0
      ? 0
      : await prisma.asignacion.count({
          where: {
            personaId,
            estado: 'PENDIENTE',
            obligacion: { alcance: 'GRUPO_INTERES', alcanceGrupoInteresId: { in: gruposRetirados } },
          },
        });

  const [obligaciones, existentes, activos] = await Promise.all([
    prisma.obligacion.findMany({ select: SELECCION_OBLIGACION }),
    // Sólo las de esta persona: el plan se calcula para una, y traer el resto sería leer
    // decenas de miles de filas para descartarlas.
    prisma.asignacion.findMany({
      where: { personaId },
      select: {
        obligacionId: true,
        personaId: true,
        periodo: true,
        activoId: true,
        fechaApertura: true,
        fechaCierre: true,
      },
    }),
    prisma.activo.findMany({ select: { id: true, activo: true, tipoId: true, propietarioId: true } }),
  ]);

  // P15 · el censo es UNA persona: la que se está guardando, con la pertenencia NUEVA.
  const censo = [
    {
      id: persona.id,
      activa: persona.activa,
      areaId: datos.areaId,
      cargoId: datos.cargoId,
      ingreso: dia(datos.fechaIngreso) ?? persona.fechaIngreso ?? persona.creadaEn,
      areaDesde,
      cargoDesde,
      // **P16 · la pertenencia NUEVA también para los grupos.** El generador resuelve el
      // alcance `GRUPO_INTERES` con esta lista y con el `desde` de cada membresía; pasarle las
      // vigentes de antes haría que marcar un grupo no moviera el número, y el popup volvería
      // a prometer tareas que no se crean. Cuando el formulario no trajo la lista, las
      // vigentes de antes SON las de después.
      gruposDesde: planGrupos?.vigentesResultantes ?? persona.gruposInteres,
    },
  ];

  const plan = planificarGeneracion(obligaciones, censo, existentes, hoy, 90, activos);

  const paraDesglose: ObligacionDelDesglose[] = obligaciones.map((o) => ({
    id: o.id,
    alcance: o.alcance,
    destino: destinoDe(o),
  }));
  const desglose = desglosarPorOrigen(plan.crear, paraDesglose);

  return {
    ok: true,
    persona,
    areaDesde,
    cargoDesde,
    areaCambio,
    cargoCambio,
    crear: plan.crear,
    desglose,
    asignadas: totalDelDesglose(desglose),
    pendientesDelAreaAnterior,
    planGrupos,
    pendientesDeGruposRetirados,
  };
}

/// **P3 · la previsión bajo los dos `select`.** «Al guardar se le asignarán 47 tareas», con su
/// desglose. No escribe nada, y sale de la misma cuenta que el guardado.
export async function preverPertenencia(
  personaId: number,
  datos: DatosPertenencia,
): Promise<ResultadoPertenencia> {
  return ejecutar<ResultadoPertenencia>(async () => {
    await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const r = await calcular(personaId, datos);
    if (!r.ok) return { ok: false, mensaje: r.mensaje, ...VACIO };

    return {
      ok: true,
      // En futuro, porque todavía no ocurrió. El guardado lo dice en pasado.
      mensaje:
        r.asignadas === 0
          ? 'Al guardar no se le asignaría ninguna tarea nueva.'
          : `Al guardar se le asignarán ${r.asignadas} tarea(s).`,
      asignadas: r.asignadas,
      desglose: r.desglose,
      frases: frasesDelDesglose(r.desglose),
      pendientesDelAreaAnterior: r.pendientesDelAreaAnterior,
      pendientesDeGruposRetirados: r.pendientesDeGruposRetirados,
    };
  });
}

export interface ResultadoGrupos extends Resultado {
  /// Los ids de los grupos a los que la persona pertenece **hoy** (`hasta IS NULL`). El
  /// derivado no está: no tiene filas, su pertenencia se calcula.
  grupos: number[];
}

/// **Las membresías vigentes de una persona, pedidas aparte.**
///
/// Fuera del censo por lo mismo que los contactos de emergencia, aunque el motivo sea otro: la
/// pantalla de personas lee 90 filas y las manda enteras al navegador. Sumarle a cada una sus
/// membresías es una consulta más por fila —o un `include` que multiplica el payload— para un
/// dato que sólo mira quien abre la pestaña Grupos de una persona concreta.
export async function leerGruposDePersona(personaId: number): Promise<ResultadoGrupos> {
  return ejecutar<ResultadoGrupos>(async () => {
    await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const miembros = await prisma.miembroGrupoInteres.findMany({
      where: { personaId, hasta: null },
      select: { grupoId: true },
      orderBy: { grupoId: 'asc' },
    });

    return {
      ok: true,
      mensaje: `${miembros.length} grupo(s) de interés.`,
      grupos: miembros.map((m) => m.grupoId),
    };
  });
}

export interface ResultadoContactos extends Resultado {
  contactos: ContactoGuardado[];
}

/// **P9.3 · los contactos de emergencia se piden aparte y nunca viajan con el censo.**
///
/// La pantalla de personas lee 36 filas con `findMany` y las manda enteras al navegador de
/// quien la abre, tenga o no `personas:administrar`. Un contacto de emergencia es dato
/// personal de un TERCERO que nunca autorizó nada: si viajara en ese payload, estaría en el
/// navegador de todo el censo, y el permiso que lo protege no habría protegido nada.
///
/// Por eso es una acción propia, con su propio `autorConPermiso`, que el popup llama recién
/// cuando alguien abre la pestaña Contactos.
export async function leerContactosEmergencia(personaId: number): Promise<ResultadoContactos> {
  return ejecutar<ResultadoContactos>(async () => {
    await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const contactos = await prisma.contactoEmergencia.findMany({
      where: { personaId },
      // El orden de llamada, que es el dato: «a quién se llama primero». El `id` desempata
      // para que dos contactos con el mismo orden no salgan hoy en un orden y mañana en otro.
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      select: { id: true, nombre: true, parentesco: true, telefono: true, orden: true },
    });

    return { ok: true, mensaje: `${contactos.length} contacto(s) de emergencia.`, contactos };
  });
}

export interface ResultadoLicencias extends Resultado {
  /// **Las dos consultas, cada una con su propio resultado** (P8). Ausente cuando ni siquiera
  /// se llegó a preguntar —sin sesión, sin permiso o sin `oid`—, que no es lo mismo que una
  /// consulta que se hizo y falló.
  licencias?: LicenciasDeLaPantalla;
}

/// **Las licencias de una persona. LEE Y NO ESCRIBE** (REQ-SIG-15 §3.2, D-2).
///
/// Asignar y quitar licencias se sigue haciendo en el portal de Microsoft: la escritura
/// exigiría `LicenseAssignment.ReadWrite.All` sobre todo el tenant, pelea con la licenciación
/// por grupo, y quitar una licencia de Exchange arranca el reloj de 30 días para el borrado
/// del buzón — una consecuencia que no puede vivir detrás de una casilla en un popup del SIG.
///
/// Lo que aporta sin escribir nada es lo que hoy no existe en ninguna parte: el inventario de
/// software por persona que A.5.9 pide, y los dos cruces que el portal no puede hacer porque no
/// sabe quién salió de la organización ni a quién se le está exigiendo una tarea (P7).
///
/// **P8 · cada consulta degrada por separado.** Los dos `ResultadoGraph` viajan enteros a la
/// pantalla: si el inventario del tenant responde 403, la lista de la persona se muestra igual
/// y lo único que falta es el contexto del tenant, dicho con el nombre del recurso y del
/// permiso. Degradar las dos porque una falló pierde información que sí se tiene.
export async function leerLicenciasDePersona(personaId: number): Promise<ResultadoLicencias> {
  return ejecutar<ResultadoLicencias>(async () => {
    await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { oid: true, activa: true },
    });
    if (!persona) throw new DatoInvalidoError('Esa persona no está en el censo.');

    // Los pendientes ABIERTOS, que es el segundo término del cruce «sin licencia y con
    // tareas». Se cuentan acá y no se reciben del cliente: el popup ya trae un conteo en la
    // fila, pero un número que viaja al navegador y vuelve es un número que se puede editar.
    const [pendientes, filasDeParametro] = await Promise.all([
      prisma.asignacion.count({ where: { personaId, estado: 'PENDIENTE' } }),
      // P6 · el nombre comercial sale de la tabla de parámetros, editable sin despliegue.
      prisma.parametro.findMany({
        where: { clave: { startsWith: PREFIJO_PARAMETRO_SKU } },
        select: { clave: true, valor: true },
      }),
    ]);
    const comerciales = nombresComerciales(filasDeParametro);

    // Fuera de cualquier transacción de Prisma, que es la regla P10 de REQ-SIG-13. Acá es
    // trivial cumplirla —esta acción no escribe nada— y se dice igual para que siga siendo
    // cierto si alguien le agrega una escritura mañana.
    const { persona: deLaPersona, tenant } = await leerLicencias(persona.oid);

    // El `map` sobre la rama `ok` es lo que impide afirmar una anomalía sobre una pregunta sin
    // responder: fuera de esta rama no hay lista de la que sacarla.
    const licencias: LicenciasDeLaPantalla = {
      persona: deLaPersona.ok
        ? {
            ok: true,
            datos: (() => {
              const renglones = inventarioDeSoftware(deLaPersona.datos, comerciales);
              return {
                renglones,
                anomalias: anomaliasDeLicencia(renglones, { activa: persona.activa, pendientes }),
              };
            })(),
          }
        : deLaPersona,
      tenant: tenant.ok ? { ok: true, datos: resumirSkus(tenant.datos, comerciales) } : tenant,
    };

    // El mensaje dice qué se pudo leer y qué no. «Se leyeron las licencias» a secas taparía
    // justamente el caso que P8 protege.
    const partes = [
      licencias.persona.ok
        ? `${licencias.persona.datos.renglones.length} licencia(s) de la persona`
        : 'no se pudo leer la lista de la persona',
      licencias.tenant.ok
        ? `${licencias.tenant.datos.length} SKU del tenant`
        : 'no se pudo leer el inventario del tenant',
    ];
    return { ok: true, mensaje: `${partes[0]}; ${partes[1]}.`, licencias };
  });
}

export async function guardarPertenencia(
  personaId: number,
  datos: DatosPertenencia,
): Promise<ResultadoPertenencia> {
  return ejecutar<ResultadoPertenencia>(async () => {
    // P2 · el popup entero exige `personas:administrar`. Sin el permiso la fila abre en solo
    // lectura: el censo es visible para quien entra a la pantalla, pero nada de lo que hay
    // dentro se puede cambiar.
    const autor = await autorConPermiso('personas:administrar');
    exigirId(personaId, 'la persona');

    const r = await calcular(personaId, datos);
    if (!r.ok) return { ok: false, mensaje: r.mensaje, ...VACIO };
    const { persona } = r;

    // **P9.2 · el plan de los contactos de emergencia, decidido antes de abrir nada.** El
    // módulo puro dice qué se crea, qué se actualiza, qué se retira y cómo se anota; acá sólo
    // se ejecuta. Si trae errores no se guarda ni la mitad: una lista de a quién llamar
    // guardada por partes es peor que la que estaba, porque parece completa.
    const propuestos = datos.contactosEmergencia;
    const planContactos =
      propuestos === undefined
        ? null
        : planificarContactos(
            await prisma.contactoEmergencia.findMany({
              where: { personaId },
              orderBy: [{ orden: 'asc' }, { id: 'asc' }],
              select: { id: true, nombre: true, parentesco: true, telefono: true, orden: true },
            }),
            propuestos,
          );
    if (planContactos !== null && planContactos.errores.length > 0) {
      return { ok: false, mensaje: planContactos.errores.join('; ') + '.', ...VACIO };
    }

    // P26 · **cada campo que cambia escribe su propia fila.** Una fila «se editó la persona»
    // no responde qué cambió, que es la única pregunta que alguien le hace a la bitácora. Y
    // el `registroId` es el CORREO, que es la llave con la que la aplicación identifica a la
    // persona, no un entero que dentro de un año nadie va a poder resolver.
    const cambios: Cambio[] = [];
    const anotar = (campo: string, anterior: unknown, nuevo: unknown) => {
      cambios.push({
        tabla: 'persona',
        registroId: persona.correo,
        campo,
        anterior,
        nuevo,
        motivo: datos.motivo ?? null,
      });
    };
    if (r.areaCambio) anotar('área', persona.area?.nombre ?? null, datos.areaId);
    if (r.cargoCambio) anotar('cargo', persona.cargo?.nombre ?? null, datos.cargoId);
    if (datos.documentoIdentidad !== undefined) {
      anotar('documento de identidad', persona.documentoIdentidad, datos.documentoIdentidad);
    }
    if (datos.tipoContratoId !== undefined) {
      anotar('tipo de contrato', persona.tipoContratoId, datos.tipoContratoId);
    }
    if (datos.telefono !== undefined) anotar('teléfono', persona.telefono, datos.telefono);
    if (datos.correoPersonal !== undefined) {
      anotar('correo personal', persona.correoPersonal, datos.correoPersonal);
    }
    if (datos.ciudad !== undefined) anotar('ciudad', persona.ciudad, datos.ciudad);
    if (datos.direccion !== undefined) anotar('dirección', persona.direccion, datos.direccion);
    // Las frases las redactó el módulo puro; acá sólo se pasan al mismo `anotar` que el resto,
    // para que el contacto quede con el mismo `registroId` —el correo— que los demás campos
    // de la persona y una sola consulta a la bitácora cuente la historia completa.
    for (const a of planContactos?.anotaciones ?? []) anotar(a.campo, a.anterior, a.nuevo);
    // Lo mismo con los grupos: las frases las redactó `planificarGrupos`, y entran por el
    // mismo `anotar` para que el alta de una membresía y el cambio de área de la misma persona
    // queden bajo el mismo `registroId` —el correo— y una sola consulta cuente la historia.
    for (const a of r.planGrupos?.anotaciones ?? []) anotar(a.campo, a.anterior, a.nuevo);

    // ── P14 · TODO en una transacción ──────────────────────────────────────────────────
    await prisma.$transaction(
      async (tx) => {
        await tx.persona.update({
          where: { id: personaId },
          data: {
            areaId: datos.areaId,
            cargoId: datos.cargoId,
            areaDesde: r.areaDesde,
            cargoDesde: r.cargoDesde,
            // `undefined` deja el valor como está; `null` lo borra. Es la diferencia entre
            // «el formulario no trajo este campo» y «lo vaciaron a propósito».
            documentoIdentidad: datos.documentoIdentidad,
            tipoContratoId: datos.tipoContratoId,
            fechaIngreso: dia(datos.fechaIngreso) ?? undefined,
            telefono: datos.telefono,
            correoPersonal: datos.correoPersonal,
            ciudad: datos.ciudad,
            direccion: datos.direccion,
          },
        });

        if (planContactos !== null) {
          // **El retiro es un borrado físico, por precedente.** `ContactoEmergencia` no tiene
          // columna de baja lógica, y así se resuelven en este repositorio las colecciones
          // hijas que se editan como conjunto: `app/sig/acciones/tareas.ts:847` borra el
          // `itemVerificacion` que `planificarItems` sacó del plan, y
          // `app/sig/acciones/ciclos.ts:106` borra el `pasoDeColaborador` al desmarcarlo. En
          // los dos casos lo que sobrevive al borrado es la fila de bitácora, escrita en la
          // misma transacción: el invariante 2 se sostiene porque el rastro queda, no porque
          // la fila se quede vacía ocupando lugar.
          for (const id of planContactos.retirar) {
            await tx.contactoEmergencia.delete({ where: { id } });
          }
          for (const a of planContactos.actualizar) {
            await tx.contactoEmergencia.update({
              where: { id: a.id },
              data: {
                nombre: a.nombre,
                parentesco: a.parentesco,
                telefono: a.telefono,
                orden: a.orden,
              },
            });
          }
          for (const c of planContactos.crear) {
            await tx.contactoEmergencia.create({ data: { personaId, ...c } });
          }
        }

        if (r.planGrupos !== null) {
          // **Se CIERRA, no se borra.** `MiembroGrupoInteres.hasta` existe para que «quién
          // estaba en Desarrolladores en marzo» siga teniendo respuesta: un `delete` acá
          // dejaría esa pregunta sin contestar y además borraría el `desde` con el que el
          // generador calculó el piso de los periodos que ya se asignaron. Es deliberadamente
          // lo contrario del retiro de un contacto de emergencia, que sí es físico porque esa
          // tabla no tiene columna de baja.
          for (const m of r.planGrupos.cerrar) {
            await tx.miembroGrupoInteres.update({ where: { id: m.id }, data: { hasta: m.hasta } });
          }
          for (const m of r.planGrupos.crear) {
            // La llave `@@unique([grupoId, personaId])` significa que una membresía cerrada
            // ocupa el lugar de la nueva: volver a marcar un grupo del que alguien salió no
            // puede ser un `create`, tiene que reabrir esa fila. Se reabre con el `desde` de
            // hoy, que es lo que P16 pide — la pertenencia arranca ahora, no cuando arrancó la
            // anterior.
            await tx.miembroGrupoInteres.upsert({
              where: { grupoId_personaId: { grupoId: m.grupoId, personaId } },
              create: { grupoId: m.grupoId, personaId, desde: m.desde },
              update: { desde: m.desde, hasta: null },
            });
          }
        }

        if (cambios.length > 0) await registrar(tx, autor, cambios);

        for (const a of r.crear) {
          const creada = await tx.asignacion.create({
            data: {
              obligacionId: a.obligacionId,
              contenidoId: a.contenidoId,
              personaId: a.personaId,
              periodo: a.periodo,
              fechaApertura: a.fechaApertura,
              fechaLimite: a.fechaLimite,
              activoId: a.activoId,
            },
          });
          await registrar(tx, autor, [
            {
              tabla: 'asignacion',
              registroId: String(creada.id),
              campo: 'alta',
              anterior: null,
              nuevo: `generada · ${a.periodo}`,
              motivo: 'generada al guardar la pertenencia de la persona (REQ-SIG-15 P14)',
            },
          ]);
        }
      },
      // El censo es una persona, pero una obligación por tipo de activo sobre 299 activos
      // produce cientos de filas con su bitácora. El default de 5 s no alcanza.
      { timeout: 120_000 },
    );

    // P18 de REQ-SIG-13 tiene su lista de rutas; acá alcanza con las dos que muestran el
    // número: si la tarjeta sigue diciendo lo de antes, quien guardó lo intenta otra vez.
    revalidatePath('/sig/personas');
    revalidatePath('/sig/tablero-tareas');

    const partes = [
      r.asignadas === 0
        ? 'No quedaron tareas nuevas asignadas.'
        : `Se le asignaron ${r.asignadas} tarea(s).`,
    ];
    if (r.pendientesDelAreaAnterior > 0) {
      // P4 · callarlo dejaría a alguien respondiendo por un área a la que ya no pertenece,
      // que es justo el hallazgo que un auditor levanta.
      partes.push(
        `Quedaron ${r.pendientesDelAreaAnterior} pendiente(s) del área anterior: siguen ` +
          'asignados y hay que reasignarlos o anularlos con motivo.',
      );
    }
    if (r.pendientesDeGruposRetirados > 0) {
      // P13 → P4 · salir de un grupo no es haber cumplido lo que ese grupo pedía. Se dicen
      // por el mismo motivo que los del área: callarlos deja a alguien respondiendo por algo
      // a lo que ya no pertenece, y eso es lo que un auditor levanta.
      partes.push(
        `Quedaron ${r.pendientesDeGruposRetirados} pendiente(s) de grupo(s) del que se ` +
          'retiró: siguen asignados y hay que reasignarlos o anularlos con motivo.',
      );
    }

    return {
      ok: true,
      mensaje: partes.join(' '),
      asignadas: r.asignadas,
      desglose: r.desglose,
      frases: frasesDelDesglose(r.desglose),
      pendientesDelAreaAnterior: r.pendientesDelAreaAnterior,
      pendientesDeGruposRetirados: r.pendientesDeGruposRetirados,
    };
  });
}
