// lib/sig/personas.ts
//
// Qué cambia en el SIG cuando se lee el Directorio Activo. Puro a propósito: sin Prisma,
// sin sesión y sin red, porque es la lógica que puede apagarle la cuenta a toda la
// organización y tiene que ser probable sin levantar nada.
//
// La identidad es el `oid` de Azure, no el correo. Un matrimonio, un apellido corregido o
// una migración de dominio cambian el UPN sin cambiar a la persona.

export interface EntradaDirectorio {
  oid: string;
  nombre: string;
  correo: string;
}

export interface PersonaExistente extends EntradaDirectorio {
  activa: boolean;
}

export interface CambioPersona {
  oid: string;
  campo: 'nombre' | 'correo';
  anterior: string;
  nuevo: string;
}

/// Una entrada del Directorio con oid DESCONOCIDO cuyo correo YA pertenece a otra persona
/// de la base.
///
/// No es un alta y no es un cambio: es una colisión de identidad. `Persona` tiene dos
/// columnas únicas —`oid` y `correo`— y este módulo solo cruzaba por la primera, así que
/// la entrada se clasificaba como alta y el `create` moría contra el único de correo.
/// Como el alta corre dentro de una transacción, UNA colisión revertía la corrida ENTERA:
/// altas, cambios, bajas y reactivaciones. La sincronización simplemente dejaba de
/// funcionar mientras existiera una fila así.
///
/// Se reporta en vez de resolverse, y es deliberado. Reencadenar el oid al registro
/// existente es lo que casi siempre corresponde —la misma persona recreada en Azure—, pero
/// «casi siempre» no alcanza cuando el caso contrario es pegarle el historial de alguien a
/// otra persona: un correo corporativo reasignado tras una baja. La aplicación registra y
/// señala; quién es quién lo decide un humano.
export interface ConflictoIdentidad {
  /// Lo que trae el Directorio.
  oid: string;
  nombre: string;
  correo: string;
  /// Quién tiene ya ese correo en la base.
  oidExistente: string;
  nombreExistente: string;
  activaExistente: boolean;
}

export interface PlanSincronizacion {
  altas: EntradaDirectorio[];
  cambios: CambioPersona[];
  inactivaciones: PersonaExistente[];
  reactivaciones: EntradaDirectorio[];
  /// Colisiones de identidad: oid nuevo con un correo que ya es de otra persona. No se
  /// aplican — se muestran para que alguien decida.
  conflictos: ConflictoIdentidad[];
  /// Entradas del Directorio descartadas por venir sin oid o sin correo.
  ignoradas: number;
  /// True cuando el plan se descarta entero por no ser confiable. El llamador no debe
  /// aplicar nada.
  abortado: boolean;
  motivo: string | null;
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

const PLAN_VACIO: Omit<PlanSincronizacion, 'abortado' | 'motivo' | 'ignoradas'> = {
  altas: [],
  cambios: [],
  inactivaciones: [],
  reactivaciones: [],
  conflictos: [],
};

/// Compara lo que dice el Directorio contra lo que tiene la base y devuelve qué hacer.
///
/// Nunca borra: quien desaparece se inactiva. Y si el Directorio viene vacío, no devuelve
/// nada que aplicar — una lista vacía es indistinguible de una organización sin gente, y
/// la segunda no ocurre nunca.
export function planificarSincronizacion(
  directorio: readonly EntradaDirectorio[],
  existentes: readonly PersonaExistente[],
): PlanSincronizacion {
  const validas = directorio.filter((e) => e.oid.trim() !== '' && e.correo.trim() !== '');
  const ignoradas = directorio.length - validas.length;

  if (validas.length === 0) {
    return {
      ...PLAN_VACIO,
      ignoradas,
      abortado: true,
      motivo:
        'El Directorio devolvió un listado vacío. No se aplica nada: una lectura vacía ' +
        'no distingue entre un fallo de permisos y una organización sin personas.',
    };
  }

  const porOid = new Map(existentes.map((p) => [p.oid, p]));

  // El segundo índice, por correo normalizado. La base exige único en las DOS columnas, así
  // que un plan que solo mira `oid` propone altas que la base rechaza. Se queda la primera
  // de cada correo: si la base ya tuviera dos, el conflicto es anterior a esta corrida.
  const porCorreo = new Map<string, PersonaExistente>();
  for (const p of existentes) {
    const clave = normalizarCorreo(p.correo);
    if (!porCorreo.has(clave)) porCorreo.set(clave, p);
  }

  const vistos = new Set<string>();

  const altas: EntradaDirectorio[] = [];
  const cambios: CambioPersona[] = [];
  const reactivaciones: EntradaDirectorio[] = [];
  const conflictos: ConflictoIdentidad[] = [];

  for (const cruda of validas) {
    const entrada: EntradaDirectorio = {
      oid: cruda.oid,
      nombre: cruda.nombre.trim(),
      correo: normalizarCorreo(cruda.correo),
    };
    vistos.add(entrada.oid);

    const actual = porOid.get(entrada.oid);
    if (!actual) {
      // Antes de dar por nueva a la persona: ¿su correo ya es de alguien? Incluye a las
      // inactivas — la fila sigue ahí y el único de la base también.
      const duenoDelCorreo = porCorreo.get(entrada.correo);
      if (duenoDelCorreo) {
        conflictos.push({
          oid: entrada.oid,
          nombre: entrada.nombre,
          correo: entrada.correo,
          oidExistente: duenoDelCorreo.oid,
          nombreExistente: duenoDelCorreo.nombre,
          activaExistente: duenoDelCorreo.activa,
        });
        continue;
      }
      altas.push(entrada);
      continue;
    }

    if (actual.nombre !== entrada.nombre) {
      cambios.push({
        oid: entrada.oid,
        campo: 'nombre',
        anterior: actual.nombre,
        nuevo: entrada.nombre,
      });
    }
    if (normalizarCorreo(actual.correo) !== entrada.correo) {
      // Un cambio de correo hacia uno que ya es de OTRA persona choca contra el mismo
      // único, y con el mismo efecto: revierte la corrida entera. Es el caso de dos
      // personas que intercambian alias, raro pero no imposible.
      const duenoDelCorreo = porCorreo.get(entrada.correo);
      if (duenoDelCorreo && duenoDelCorreo.oid !== entrada.oid) {
        conflictos.push({
          oid: entrada.oid,
          nombre: entrada.nombre,
          correo: entrada.correo,
          oidExistente: duenoDelCorreo.oid,
          nombreExistente: duenoDelCorreo.nombre,
          activaExistente: duenoDelCorreo.activa,
        });
      } else {
        cambios.push({
          oid: entrada.oid,
          campo: 'correo',
          anterior: normalizarCorreo(actual.correo),
          nuevo: entrada.correo,
        });
      }
    }
    if (!actual.activa) reactivaciones.push(entrada);
  }

  const inactivaciones = existentes.filter((p) => p.activa && !vistos.has(p.oid));

  return {
    altas,
    cambios,
    inactivaciones,
    reactivaciones,
    conflictos,
    ignoradas,
    abortado: false,
    motivo: null,
  };
}

/// Una fila de bitácora de la tabla `persona`, reducida a lo que distingue un tipo de
/// cambio de otro.
export interface RastroCorrida {
  campo: string | null;
  valorNuevo: string | null;
}

export interface ResumenCorrida {
  altas: number;
  actualizaciones: number;
  inactivaciones: number;
  reactivaciones: number;
}

/// **P28 (REQ-SIG-15) · los campos que una corrida de sincronización escribe, y sólo esos.**
///
/// La franja de `/sig/personas` reconstruye la última corrida buscando la fila más reciente
/// con `tabla: 'persona'` y leyendo las que comparten su `ocurridoEn`. Eso funcionaba porque
/// `app/sig/acciones/personas.ts` era su **único escritor**.
///
/// **Ya no lo es.** `app/sig/acciones/personas-edicion.ts` escribe filas de `tabla: 'persona'`
/// cada vez que alguien guarda la pertenencia de una persona. Sin acotar el rastro, una
/// edición de tres campos se vuelve la «última corrida» —fechada en la edición y con las
/// cuatro cifras en cero— y la franja anuncia una sincronización que nunca ocurrió.
///
/// **Se acota por CAMPO y no por motivo**, y la razón importa: `registrarAlta` no recibe
/// motivo, así que las altas de la sincronización lo tienen en `null`. Filtrar por motivo
/// dejaría las altas afuera, que son justo la cifra que más se mira después de una primera
/// corrida.
///
/// La lista vive **al lado de `resumirCorrida`** a propósito: es exactamente el conjunto de
/// campos que ese resumen sabe contar, y tenerlas juntas es lo que impide que el filtro de la
/// consulta y el resumen se desincronicen. Una prueba lo fija en las dos direcciones.
export const CAMPOS_DE_SINCRONIZACION = ['alta', 'nombre', 'correo', 'baja lógica'] as const;

/// Reconstruye el resultado de una corrida de sincronización desde su rastro en la bitácora.
///
/// El resumen no se guarda en ninguna tabla: la bitácora ya lo contiene entero, y guardarlo
/// aparte sería guardar lo derivable (invariante 1) con la garantía de que las dos copias
/// se separen. Lo que la corrida escribe alcanza para clasificar cada fila: `alta` para un
/// ingreso, el nombre del campo para una actualización, y `baja lógica` para las dos bajas
/// lógicas —inactivar y reactivar escriben el MISMO campo, así que se separan por el valor
/// nuevo, que es el único lugar donde queda la dirección del cambio.
///
/// Una fila que no encaja en ninguna de las cuatro no se cuenta en ninguna: inflar una cifra
/// con lo que no se supo leer es peor que dejarla corta, porque nadie puede notarlo.
export function resumirCorrida(rastro: RastroCorrida[]): ResumenCorrida {
  const resumen: ResumenCorrida = {
    altas: 0,
    actualizaciones: 0,
    inactivaciones: 0,
    reactivaciones: 0,
  };

  for (const fila of rastro) {
    if (fila.campo === 'alta') resumen.altas += 1;
    else if (fila.campo === 'nombre' || fila.campo === 'correo') resumen.actualizaciones += 1;
    else if (fila.campo === 'baja lógica') {
      if (fila.valorNuevo === 'dado de baja') resumen.inactivaciones += 1;
      else if (fila.valorNuevo === 'vigente') resumen.reactivaciones += 1;
    }
  }

  return resumen;
}

export interface PerfilToken {
  oid?: unknown;
  name?: unknown;
  email?: unknown;
  preferred_username?: unknown;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/// La entrada de Directorio que se deduce del token de quien acaba de iniciar sesión.
///
/// Devuelve `null` si falta el object id o el correo: sin identidad no se crea a nadie, y
/// deducirla del nombre es exactamente el atajo que este módulo existe para no tomar.
export function entradaDesdePerfil(perfil: PerfilToken | undefined | null): EntradaDirectorio | null {
  if (!perfil) return null;
  const oid = texto(perfil.oid);
  const correo = texto(perfil.preferred_username) ?? texto(perfil.email);
  if (!oid || !correo) return null;
  return {
    oid,
    nombre: texto(perfil.name) ?? normalizarCorreo(correo),
    correo: normalizarCorreo(correo),
  };
}