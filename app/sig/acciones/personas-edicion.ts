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
import { planificarGeneracion, type AsignacionACrear } from '@/lib/sig/generacion';
import {
  desglosarPorOrigen,
  frasesDelDesglose,
  totalDelDesglose,
  type ObligacionDelDesglose,
  type RenglonDelDesglose,
} from '@/lib/sig/pertenencias';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';

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
}

const VACIO = {
  asignadas: 0,
  desglose: [] as RenglonDelDesglose[],
  frases: [] as string[],
  pendientesDelAreaAnterior: 0,
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
  gruposInteres: { where: { hasta: null }, select: { grupoId: true, desde: true } },
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
      gruposDesde: persona.gruposInteres,
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
    };
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

    return {
      ok: true,
      mensaje: partes.join(' '),
      asignadas: r.asignadas,
      desglose: r.desglose,
      frases: frasesDelDesglose(r.desglose),
      pendientesDelAreaAnterior: r.pendientesDelAreaAnterior,
    };
  });
}
