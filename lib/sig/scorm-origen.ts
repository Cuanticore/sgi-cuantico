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
///
/// `origenApp` es el origen de la aplicación (`SCORM_ORIGEN_APP`), y va en `frame-ancestors`.
/// No es opcional por gusto: la cadena de embebido es app → runner → contenido, y los dos
/// primeros son de ORÍGENES DISTINTOS por diseño (P3) — en producción `sig.cuantico.com`
/// embebe `cursos.sig.cuantico.com`. `frame-ancestors` valida TODA la cadena de ancestros,
/// no sólo el padre inmediato: con `'self'` a secas el abuelo —la aplicación— queda fuera y
/// el navegador bloquea el iframe del curso antes de cargar nada. Ése era el defecto que
/// dejaba el player en «Cargando el curso…» para siempre, en local y en producción, y que no
/// se vio porque el player nunca se corrió de punta a punta (§16.4). Sin `origenApp` la
/// directiva se queda en `'self'` —el comportamiento viejo—, para no cambiar en silencio la
/// CSP de un llamador que todavía no lo pase.
export function cspDelPaquete(dominios: readonly string[], origenApp?: string): string {
  // Sin repetidos: el mismo dominio puede venir del HTML del SCO y de su driver, y una CSP
  // con el origen tres veces es válida pero ilegible justo cuando alguien la está leyendo
  // porque el curso no carga.
  const externos = [...new Set(dominios)].join(' ');
  const con = (base: string) => (externos === '' ? base : `${base} ${externos}`);

  // El origen de la app en `frame-ancestors`, junto a `'self'` (el runner, mismo origen que
  // el contenido). Se normaliza a `esquema://host[:puerto]` y se descarta si es basura: un
  // valor inválido acá abriría o rompería la directiva en silencio.
  let ancestros = "'self'";
  if (origenApp !== undefined && origenApp.trim() !== '') {
    try {
      ancestros = `'self' ${new URL(origenApp).origin}`;
    } catch {
      ancestros = "'self'";
    }
  }
  return [
    "default-src 'none'",
    con("script-src 'self' 'unsafe-inline' 'unsafe-eval'"),
    con("style-src 'self' 'unsafe-inline'"),
    con("img-src 'self' data: blob:"),
    con("media-src 'self' data: blob:"),
    con("font-src 'self' data:"),
    con("connect-src 'self'"),
    con("frame-src 'self'"),
    // Declarada, porque sin ella caía a `default-src 'none'` y un curso con Web Worker
    // moría sin un error que dijera por qué. NO lleva los dominios externos: un worker corre
    // con el origen del documento que lo crea, así que `'self'` y `blob:` es todo lo que
    // puede necesitar, y sumarle el tercero no habilitaría nada real.
    "worker-src 'self' blob:",
    `frame-ancestors ${ancestros}`,
    "base-uri 'none'",
    // Se queda en `'none'` a propósito: un curso no tiene por qué enviar formularios a
    // ningún lado. Si alguno lo necesitara, es algo que hay que ver y decidir, no permitir
    // de entrada para todos.
    "form-action 'none'",
  ].join('; ');
}
