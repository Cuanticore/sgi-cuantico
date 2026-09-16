// lib/sig/scorm-manifiesto.ts
//
// Del `imsmanifest.xml` a lo que la aplicación necesita saber: edición, SCO de entrada, y
// —lo que más importa— si el curso está EN el paquete o lo entrega un tercero (D-1).
//
// Puro: recibe el XML y la lista de archivos, y devuelve un veredicto. La descompresión
// vive en `scorm-paquete.ts`.

import { XMLParser } from 'fast-xml-parser';

export type ClasePaquete = 'AUTOCONTENIDO' | 'DESPACHO';

export interface PaqueteAnalizado {
  edicion: string;
  organizacionId: string;
  tituloOrganizacion: string;
  entradaHref: string;
  clase: ClasePaquete;
  /// Los orígenes que el paquete necesita. Poblado ACÁ, al analizar, y no adivinado en
  /// tiempo de ejecución: la CSP de un curso es una decisión que se toma al subirlo (D-5).
  dominiosExternos: string[];
}

export type Resultado =
  | { ok: true; paquete: PaqueteAnalizado }
  | { ok: false; motivo: string };

const EDICIONES_SOPORTADAS = ['2004 2nd Edition', '2004 3rd Edition', '2004 4th Edition'];

/// P7 · sin entidades. Un manifiesto con `<!ENTITY x SYSTEM "file:///etc/passwd">` es el
/// ataque XXE, y acá el archivo lo sube una persona.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  processEntities: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

function comoArreglo<T>(valor: T | T[] | undefined): T[] {
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

const ORIGEN_EXTERNO = /https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?/g;

/// Hosts que aparecen como URL y NO son orígenes de contenido: son identificadores de
/// namespace XML. Nadie descarga nada de `www.w3.org/2000/svg` — la URL identifica un
/// vocabulario, no un servidor.
///
/// Sin este filtro, un paquete con un SVG inline o un comentario que cite el esquema se
/// clasificaría como «DESPACHO que comparte correo y nombre con w3.org». Eso es una
/// afirmación falsa ante un auditor, y además le abre el dominio en la CSP.
const NAMESPACES = [
  'www.w3.org',
  'w3.org',
  'www.imsglobal.org',
  'www.imsproject.org',
  'www.adlnet.org',
  'ltsc.ieee.org',
  'schemas.xmlsoap.org',
];

function esNamespace(origen: string): boolean {
  const host = origen.replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
  return NAMESPACES.includes(host);
}

/// Los orígenes que aparecen en un texto. Heurística deliberada y acotada: no pretende
/// encontrar todo lo que un curso pueda cargar en tiempo de ejecución — para eso está la
/// CSP, que bloquea lo no declarado y lo hace visible (P18).
export function dominiosDe(texto: string): string[] {
  const encontrados = (texto.match(ORIGEN_EXTERNO) ?? []).filter((o) => !esNamespace(o));
  return [...new Set(encontrados)].sort();
}

const SCRIPT_SRC = /<script[^>]+src\s*=\s*["']([^"']+)["']/gi;

/// Las rutas de los `<script src>` LOCALES del SCO, resueltas contra su carpeta.
///
/// Se miran porque un despacho no está obligado a poner la URL del proveedor en el HTML:
/// puede armarla dentro de su propio `.js`, y entonces el paquete se clasificaría como
/// autocontenido mientras el correo y el nombre salen igual.
///
/// Sólo los que el SCO CARGA, no todos los `.js` del zip: un archivo que nadie referencia no
/// corre nunca, y meterlo en la CSP sería abrirle un dominio a código muerto.
export function scriptsLocalesDe(html: string, entradaHref: string): string[] {
  const carpeta = entradaHref.includes('/') ? entradaHref.replace(/\/[^/]*$/, '/') : '';
  const rutas: string[] = [];
  for (const [, src] of html.matchAll(SCRIPT_SRC)) {
    // Los absolutos ya los encontró `dominiosDe` sobre el HTML.
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) continue;
    const limpio = src.split(/[?#]/)[0];
    rutas.push(normalizarRuta(limpio.startsWith('/') ? limpio.slice(1) : carpeta + limpio));
  }
  return [...new Set(rutas)];
}

/// Resuelve `.` y `..` sin salir de la raíz. Un `../` de más se queda en la raíz en vez de
/// producir una ruta con `..` que nunca casaría con ningún archivo del paquete.
function normalizarRuta(ruta: string): string {
  const salida: string[] = [];
  for (const parte of ruta.split('/')) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') salida.pop();
    else salida.push(parte);
  }
  return salida.join('/');
}

export function analizarManifiesto(
  xml: string,
  archivos: string[],
  contenidos: Record<string, string> = {},
): Resultado {
  let raiz: Record<string, unknown>;
  try {
    raiz = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, motivo: `el imsmanifest.xml no es XML válido: ${String(e)}` };
  }

  const manifest = raiz['manifest'] as Record<string, unknown> | undefined;
  if (manifest === undefined) {
    return { ok: false, motivo: 'el archivo no tiene un elemento <manifest>: no es un paquete SCORM' };
  }

  const metadata = manifest['metadata'] as Record<string, unknown> | undefined;
  const edicion = String(metadata?.['schemaversion'] ?? '').trim();
  if (edicion === '') {
    return { ok: false, motivo: 'el manifiesto no declara <schemaversion>' };
  }
  if (!edicionSoportada(edicion)) {
    return {
      ok: false,
      motivo:
        `este player soporta SCORM 2004 y el paquete declara «${edicion}». ` +
        'SCORM 1.2 usa otro modelo de datos (cmi.core.*) y otra API: agregarlo «de paso» ' +
        'es la vía rápida a un player que cumple mal los dos.',
    };
  }

  const organizaciones = manifest['organizations'] as Record<string, unknown> | undefined;
  const lista = comoArreglo(organizaciones?.['organization'] as Record<string, unknown>[]);
  const predeterminada = String(organizaciones?.['@default'] ?? '');
  const organizacion =
    lista.find((o) => String(o['@identifier']) === predeterminada) ?? lista[0];
  if (organizacion === undefined) {
    return { ok: false, motivo: 'el manifiesto no tiene ninguna <organization>' };
  }

  const items = comoArreglo(organizacion['item'] as Record<string, unknown>[]);
  const conRecurso = items.filter((i) => i['@identifierref'] !== undefined);
  if (conRecurso.length === 0) {
    return { ok: false, motivo: 'la organización no tiene ningún <item> con recurso asociado' };
  }
  // D-3 · fase 1 es un solo SCO.
  if (conRecurso.length > 1) {
    return {
      ok: false,
      motivo:
        `el paquete trae ${conRecurso.length} SCO y esta versión ejecuta uno solo. ` +
        'Se rechaza en vez de ejecutar el primero: cerrar la asignación con medio curso ' +
        'visto es peor que no aceptar el paquete.',
    };
  }

  const recursos = manifest['resources'] as Record<string, unknown> | undefined;
  const referencia = String(conRecurso[0]['@identifierref']);
  const recurso = comoArreglo(recursos?.['resource'] as Record<string, unknown>[]).find(
    (r) => String(r['@identifier']) === referencia,
  );
  if (recurso === undefined) {
    return { ok: false, motivo: `el item apunta al recurso «${referencia}», que no existe` };
  }

  const href = String(recurso['@href'] ?? '').trim();
  if (href === '') {
    return { ok: false, motivo: `el recurso «${referencia}» no declara href de entrada` };
  }
  if (!archivos.includes(href)) {
    return {
      ok: false,
      motivo: `el manifiesto declara «${href}» como entrada y ese archivo no está en el paquete`,
    };
  }

  // El HTML del SCO, más los scripts locales que ese HTML carga. Es lo que efectivamente
  // corre cuando la persona abre el curso.
  const htmlEntrada = contenidos[href] ?? '';
  const aRevisar = [htmlEntrada, ...scriptsLocalesDe(htmlEntrada, href).map((r) => contenidos[r] ?? '')];
  const dominios = [...new Set(aRevisar.flatMap(dominiosDe))].sort();
  const titulo = String(
    (organizacion['title'] as string | undefined) ?? conRecurso[0]['title'] ?? 'Curso sin título',
  );

  return {
    ok: true,
    paquete: {
      edicion,
      organizacionId: String(organizacion['@identifier'] ?? 'sin-id'),
      tituloOrganizacion: titulo,
      entradaHref: href,
      // D-1 · si el SCO de entrada apunta afuera, el contenido NO está en el paquete y su
      // huella no congela nada. La etiqueta es lo que permite decir qué se puede afirmar
      // ante un auditor.
      clase: dominios.length > 0 ? 'DESPACHO' : 'AUTOCONTENIDO',
      dominiosExternos: dominios,
    },
  };
}

function edicionSoportada(edicion: string): boolean {
  return EDICIONES_SOPORTADAS.includes(edicion);
}
