// lib/sig/scorm-zip.ts
//
// Qué entrada de un .zip es aceptable. Puro: el módulo que descomprime no decide, obedece.

/// Un curso normal trae decenas o cientos de archivos. Dos mil es holgado y a la vez corta
/// un paquete con 40 000 entradas, que no es un curso sino un problema.
export const LIMITE_ARCHIVOS = 2000;

/// Cuatro veces el techo del zip. Un curso comprime bien (HTML, JS, imágenes ya
/// comprimidas), así que 4× cubre el caso legítimo y deja fuera la bomba.
export function limiteDescomprimido(maxZipMb: number): number {
  return maxZipMb * 1024 * 1024 * 4;
}

export function excedeElTotal(acumulado: number, limite: number): boolean {
  return acumulado > limite;
}

/// La ruta normalizada, o `null` si la entrada no se puede aceptar. Devuelve la ruta y no un
/// booleano a propósito: quien descomprime debe usar SIEMPRE la versión normalizada, y si
/// tuviera que normalizar por su cuenta habría dos implementaciones de la misma regla.
export function rutaSegura(nombre: string): string | null {
  if (/\u0000/.test(nombre)) return null;

  const normalizada = nombre.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (normalizada === '') return null;

  // Absolutas: POSIX y Windows.
  if (normalizada.startsWith('/') || /^[A-Za-z]:/.test(normalizada)) return null;

  const partes = normalizada.split('/');
  if (partes.some((p) => p === '..')) return null;

  return normalizada;
}
