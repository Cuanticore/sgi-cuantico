// lib/sig/scorm-origen.ts
//
// P3 · el contenido del curso se sirve desde un origen DISTINTO al de la aplicación, y las
// rutas de ese origen no deben responder en el origen de la aplicación.
//
// Puro para que la regla se escriba una vez y la usen la ruta de archivos, el runner y sus
// pruebas. El `sandbox` del iframe no sustituye esto: sin `allow-same-origin` el SCO no
// puede alcanzar `API_1484_11` por la cadena de padres —que es como funciona SCORM— y con
// `allow-same-origin` el sandbox queda anulado por definición del estándar.

export function hostDe(origen: string | undefined): string | null {
  if (origen === undefined || origen.trim() === '') return null;
  try {
    return new URL(origen).host.toLowerCase();
  } catch {
    return null;
  }
}

/// `true` cuando la petición llegó al host del origen de contenido. Si la variable no está
/// configurada, devuelve `false`: sin origen aislado el player no corre, y correrlo en el
/// origen de la aplicación sería darle a un tercero el JavaScript de la sesión.
export function esOrigenDeContenido(hostDeLaPeticion: string | null, origenContenido: string | undefined): boolean {
  const esperado = hostDe(origenContenido);
  if (esperado === null || hostDeLaPeticion === null) return false;
  return hostDeLaPeticion.toLowerCase() === esperado;
}

/// La CSP del contenido de un paquete. `default-src 'none'` y sólo lo que el paquete
/// declaró: en un AUTOCONTENIDO no se permite ningún dominio externo, y en un DESPACHO
/// exactamente los suyos (D-5).
export function cspDelPaquete(dominios: readonly string[]): string {
  const externos = dominios.join(' ');
  const con = (base: string) => (externos === '' ? base : `${base} ${externos}`);
  return [
    "default-src 'none'",
    con("script-src 'self' 'unsafe-inline' 'unsafe-eval'"),
    con("style-src 'self' 'unsafe-inline'"),
    con("img-src 'self' data: blob:"),
    con("media-src 'self' data: blob:"),
    con("font-src 'self' data:"),
    con("connect-src 'self'"),
    con("frame-src 'self'"),
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
