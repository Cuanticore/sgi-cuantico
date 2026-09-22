// lib/sig/limite-paquete.ts
//
// Cuánto puede pesar un paquete SCORM, y por qué ese número no es libre.
//
// El techo NO lo decide esta aplicación sola: lo decide, aguas arriba, el límite del cuerpo
// de una Server Action, que se fija en `next.config.js`. Si esta constante subiera por
// encima de aquél, la acción aceptaría un archivo que Next ya rechazó — y el rechazo de Next
// ocurre ANTES de que corra una sola línea nuestra, así que la persona vería un error de
// plataforma en vez del mensaje que explica qué pasa.
//
// Eso fue exactamente lo que pasó el 21/09/2026: `.env` decía 200 MB, la acción validaba
// contra 200 MB, y `next.config.js` no configuraba nada, así que regía el 1 MB por omisión
// de Next. `lib/sig/__tests__/limite-paquete.test.ts` es lo que impide que vuelvan a
// separarse.
//
// ── POR QUÉ 25 Y NO 200 ─────────────────────────────────────────────────────────────────
//
// `limiteDescomprimido` (`scorm-zip.ts`) es CUATRO VECES el techo del zip, y `extraer`
// acumula todas las entradas en memoria antes de escribir nada. Con 200 MB el costo de una
// sola subida concurrente era del orden de 1,2 GB: el cuerpo que Next almacena, la copia de
// `arrayBuffer()`, y los 800 MB del acumulado. El límite de 1 MB de Next era, por accidente,
// lo único que lo impedía.
//
// 25 MB dan 100 MB descomprimidos, que es holgado para un curso con video —el de
// `gestionar-leads` pesa 3,3 MB con un `.mp4` de 2,2— y acotado en memoria. Subirlo es
// mover DOS números y volver a mirar esa cuenta, no uno.

/// El techo, en megabytes. `next.config.js` fija el límite del cuerpo en este valor más la
/// holgura del sobre multiparte.
export const MAX_PAQUETE_MB = 25;

/// El techo que rige, dado lo que diga `SCORM_TAMANO_MAX_MB`.
///
/// La variable puede BAJARLO —una instalación con poca memoria tiene derecho a ser más
/// estricta— y **nunca subirlo**: el límite del cuerpo se fija al construir la imagen y una
/// variable se lee al arrancarla, así que un valor mayor sólo lograría que la acción
/// prometiera algo que la plataforma ya cortó.
///
/// Un valor inválido cae al máximo y no a cero. Un techo de cero rechazaría todo paquete con
/// un mensaje sobre tamaños, y mandaría a buscar el problema en el archivo en vez de en la
/// configuración.
export function techoEfectivoMb(crudo: string | undefined): number {
  const n = Number(crudo);
  if (crudo === undefined || crudo.trim() === '' || !Number.isFinite(n) || n <= 0) {
    return MAX_PAQUETE_MB;
  }
  return Math.min(n, MAX_PAQUETE_MB);
}
