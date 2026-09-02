import 'server-only';

// app/sgsi/acciones/sesion.ts
//
// Every mutation needs an author: the bitácora records who changed what, and a change
// with no author is a change an auditor cannot accept.
//
// The middleware already gates /sgsi, but a server action is reachable by anyone who can
// form the request, so authorisation is checked again here rather than assumed.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { nombreDelRol, puede, rolDesdeGrupos, type Permiso, type Rol } from '@/lib/sgsi/permisos';

export class SinSesionError extends Error {
  constructor() {
    super('No hay sesión: iniciá sesión para guardar cambios.');
    this.name = 'SinSesionError';
  }
}

/// Un dato que llegó del formulario y no sirve para consultar la base.
///
/// Existe porque el tipo `number` de una firma solo vale en compilación. Los datos llegan
/// de un `<select>`, y uno sin opciones —porque el catálogo está vacío— manda `undefined`.
/// Ese `undefined` viajaba hasta Prisma, que responde «Argument `id` is missing» con el
/// nombre del módulo empaquetado a cuestas: un error de base de datos crudo en pantalla, que
/// no le dice a nadie que primero hay que cargar un catálogo.
export class DatoInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'DatoInvalidoError';
  }
}

/// Exige un identificador utilizable, o corta con un mensaje que la pantalla puede mostrar.
///
/// `queEs` se redacta como lo diría la persona —«el contenido», «la parte interesada»— no
/// como se llama el campo: quien lee el mensaje no conoce el modelo de datos.
export function exigirId(valor: unknown, queEs: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) {
    throw new DatoInvalidoError(`Falta ${queEs}, o el valor recibido no es válido.`);
  }
  return valor;
}

/// Igual, para los que de verdad son opcionales: `undefined` y `null` pasan, un valor
/// presente pero inutilizable no. Sin esto, un `0` o un `NaN` del formulario entra a la base
/// como si fuera una referencia legítima.
export function idOpcional(valor: unknown, queEs: string): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return exigirId(valor, queEs);
}

export class SinPermisoError extends Error {
  constructor(permiso: Permiso, rol: Rol) {
    super(
      `Tu rol (${nombreDelRol(rol)}) no permite esta operación. Requiere ${permiso}. ` +
        'Los permisos vienen de la pertenencia a grupos del Directorio Activo.',
    );
    this.name = 'SinPermisoError';
  }
}

/// Returns the identity to record as the author. Throws rather than falling back to an
/// anonymous label: an unattributed entry in the trail is worse than a failed save.
export async function autorActual(): Promise<string> {
  const session = await getServerSession(authOptions);
  const autor = session?.user?.email ?? session?.user?.name;
  if (!autor) throw new SinSesionError();
  return autor;
}

export async function rolActual(): Promise<Rol> {
  const session = await getServerSession(authOptions);
  return rolDesdeGrupos(session?.user?.grupos);
}

/// The author AND the permission, together: every mutation needs both, and asking for
/// them separately is how one of the two ends up forgotten in a new action.
export async function autorConPermiso(permiso: Permiso): Promise<string> {
  const session = await getServerSession(authOptions);
  const autor = session?.user?.email ?? session?.user?.name;
  if (!autor) throw new SinSesionError();

  const rol = rolDesdeGrupos(session?.user?.grupos);
  if (!puede(rol, permiso)) throw new SinPermisoError(permiso, rol);

  return autor;
}

export interface Resultado {
  ok: boolean;
  mensaje: string;
  /// How many fields the change actually moved, so the interface can say "nothing to
  /// save" instead of claiming success over a no-op.
  cambios?: number;
}

/// Wraps an action so a thrown error becomes a message the screen can show, instead of a
/// stack trace the user cannot act on.
export async function ejecutar<T extends Resultado = Resultado>(
  operacion: () => Promise<T>,
): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    // Estos tres son respuestas, no fallas: la acción hizo su trabajo y dijo que no. No se
    // registran como error para que el log siga sirviendo para encontrar lo que sí falló.
    if (
      error instanceof SinSesionError ||
      error instanceof SinPermisoError ||
      error instanceof DatoInvalidoError
    ) {
      return { ok: false, mensaje: error.message } as T;
    }
    console.error('[sgsi] la acción falló', error);
    return {
      ok: false,
      mensaje: error instanceof Error ? error.message : 'No se pudo guardar el cambio.',
    } as T;
  }
}
