// lib/sig/autor.ts
//
// **D2 · el autor se pasa; no se adivina.**
//
// Hoy la identidad se resuelve DENTRO de la función de dominio: `yo()` en
// `app/mi-sig/acciones/mis-datos.ts` y `autorConPermiso()` en `app/sgsi/acciones/sesion.ts`
// llaman `getServerSession()` por su cuenta. Eso hace imposible que una ruta de API —sin
// sesión, con un token— invoque la misma regla de dominio sin fabricar una sesión falsa.
//
// Este módulo define el tipo que cierra esa brecha: `Autor` tiene dos clases, persona y
// servicio, y las funciones de dominio (Fase 4) lo reciben como PRIMER parámetro, obligatorio.
// La Server Action lo arma desde la sesión; la ruta de `/api/v1` lo arma desde el token
// validado por `conToken`. Las dos llaman a la misma función de `lib/sig/desarrollo.ts`.
//
// **D10 · un agente diligencia; una persona cierra.** El alcance de un token (`Permiso[]`) NO
// distingue «responder un requisito» de «cerrar una puerta de control»: el vocabulario de
// `lib/sgsi/permisos.ts` es por módulo, no por acción. Por eso la barrera de D10 no puede vivir
// en `autorizado()` — viviría en el mismo permiso que ya autoriza diligenciar, y un token con
// `tecnologia:escribir` colaría por ahí. Vive en la CLASE del autor: `exigirAutorPersona` exige
// `clase: 'persona'` sin mirar el alcance, así que ningún token —por amplio que sea su
// alcance— puede cerrar una puerta, aprobar o prorrogar una excepción, ni cerrar la hoja de
// vida. `PuertaSistema` ya separa `verificadoPorId` de `autorizaId` por la misma razón: son dos
// autoridades que `PRO-TEC-04` asigna a roles distintos, y una identidad de máquina no es
// ninguno de los dos.

import { puede, type Permiso, type Rol } from '@/lib/sgsi/permisos';

/// Quien actúa. Persona autenticada por Azure AD, o una identidad de máquina con alcance
/// acotado por `TokenServicio.alcance`.
///
/// El `alcance` es `readonly Permiso[]` y no un `Set`: llega del token ya resuelto por
/// `conToken`, que lo lee de una columna `String[]` de Postgres — un arreglo, no un conjunto.
export type Autor =
  | { clase: 'persona'; personaId: number; correo: string; rol: Rol }
  | { clase: 'servicio'; tokenId: number; nombre: string; alcance: readonly Permiso[] };

/// ¿Este autor puede ejercer este permiso?
///
/// Una persona se evalúa contra su `Rol` —lo que ya hace `puede()` con los permisos que sus
/// grupos del Directorio otorgan—. Un servicio se evalúa contra su propio alcance, que no sale
/// de ningún grupo: un token no pertenece a `Líderes SIG` ni a ningún otro grupo del
/// Directorio, por amplio que sea lo que se le concedió al emitirlo.
export function autorizado(autor: Autor, permiso: Permiso): boolean {
  if (autor.clase === 'persona') return puede(autor.rol, permiso);
  return autor.alcance.includes(permiso);
}

/// Lo que se escribe en `Bitacora.usuario`. `api:robot-mintrace`, nunca el token ni su hash
/// (regla heredada de `lib/sig/firma-por-enlace.ts:51-62`): el prefijo `api:` es lo que le dice
/// a quien lea la bitácora que el acto lo hizo una máquina y no una persona, igual que
/// `enlace:` ya le dice que no hubo sesión.
export function etiquetaDeBitacora(autor: Autor): string {
  return autor.clase === 'persona' ? autor.correo : `api:${autor.nombre}`;
}

/// **D10.** Se lanza cuando una acción que exige una persona recibe un autor de clase
/// servicio. El mensaje nombra la acción porque quien lo lee —el log del servidor, o la
/// pantalla que traduce el error— necesita saber CUÁL cierre se intentó, no sólo que algo se
/// rechazó.
export class SoloPersonaError extends Error {
  constructor(accion: string) {
    super(
      `${accion} exige un autor de clase persona. Un token de servicio no puede cerrar una ` +
        'puerta de control, aprobar ni prorrogar una excepción, ni cerrar la hoja de vida — ' +
        'sin importar el alcance que tenga.',
    );
    this.name = 'SoloPersonaError';
  }
}

/// La barrera de D10. No mira el alcance porque el alcance no es lo que separa estas dos
/// autoridades: una persona con `tecnologia:escribir` y un token con el mismo permiso cerrarían
/// la misma puerta si la barrera estuviera ahí. Está en la clase.
export function exigirAutorPersona(autor: Autor, accion: string): void {
  if (autor.clase !== 'persona') throw new SoloPersonaError(accion);
}
