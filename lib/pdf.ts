import 'server-only';

// lib/pdf.ts
//
// El ÚNICO módulo que toca puppeteer. Vive aislado para que Chromium no entre al grafo de
// módulos de nadie más: cualquier archivo que lo importe arrastra el navegador entero, y en un
// proyecto con `output: standalone` eso cambia lo que se empaqueta.
//
// ── ES `puppeteer-core` MÁS EL CHROMIUM DEL SISTEMA, Y NO ES UNA PREFERENCIA ─────────────
//
// `puppeteer` a secas descarga su propio Chromium, enlazado contra glibc. El runtime de esta
// aplicación es `node:22-alpine` (Dockerfile) y ahí ese binario **no arranca**: falla al
// ejecutarse, no al instalarse, así que el fallo aparece la primera vez que alguien pide un
// PDF en producción y no en el build. La forma que funciona en Alpine es el paquete `chromium`
// del sistema, apuntado con `PUPPETEER_EXECUTABLE_PATH`.
//
// ── UNA SOLA INSTANCIA, UNA RENDERIZACIÓN A LA VEZ ───────────────────────────────────────
//
// Este servidor ya mató un proceso por falta de memoria una vez —la cicatriz de `rowCount`
// inflado, en HARNESS.md—. Cada Chromium son ~120 MB, y lanzar uno por petición repite
// exactamente esa falla: el navegador se reutiliza entre peticiones y las peticiones hacen
// fila.

import puppeteer, { type Browser } from 'puppeteer-core';

/// `--no-sandbox` es necesario porque el contenedor corre como usuario no privilegiado y sin
/// capacidades adicionales, y el sandbox de Chromium las necesita.
///
/// Es aceptable **porque este módulo sólo renderiza HTML que genera esta misma aplicación**,
/// nunca contenido de terceros ni nada que venga de un formulario. Queda escrito acá para que
/// quien lo vea en una revisión no lo tome por descuido: el día que alguien quiera renderizar
/// HTML ajeno con esta función, esta línea es la que lo prohíbe.
const ARGUMENTOS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

/// En Alpine el paquete `chromium` instala aquí. En desarrollo sobre Windows o macOS hay que
/// apuntar la variable al Chrome local, porque no hay ninguna ruta por defecto que valga para
/// las tres plataformas y adivinarla haría que el fallo dijera algo distinto de lo que pasa.
function rutaDelNavegador(): string {
  const ruta = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (ruta) return ruta;
  return '/usr/bin/chromium-browser';
}

let navegador: Browser | null = null;
/// La cola. Una promesa encadenada es toda la exclusión mutua que hace falta acá: el proceso
/// de Node es de un solo hilo, así que no hay carrera entre el `then` y el siguiente encolado.
let fila: Promise<unknown> = Promise.resolve();

async function obtenerNavegador(): Promise<Browser> {
  if (navegador !== null && navegador.connected) return navegador;
  navegador = await puppeteer.launch({
    executablePath: rutaDelNavegador(),
    args: ARGUMENTOS,
    headless: true,
  });
  return navegador;
}

/// Convierte HTML en un PDF tamaño carta. Las peticiones se serializan: la segunda espera a
/// que termine la primera.
export async function htmlAPdf(html: string): Promise<Buffer> {
  const mio = fila.then(async () => {
    const b = await obtenerNavegador();
    const pagina = await b.newPage();
    try {
      await pagina.setContent(
        `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`,
        { waitUntil: 'load', timeout: 30_000 },
      );
      const bytes = await pagina.pdf({
        format: 'letter',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
        timeout: 30_000,
      });
      return Buffer.from(bytes);
    } finally {
      await pagina.close();
    }
  });
  // La fila avanza pase lo que pase. Sin este `catch`, un PDF que falla dejaría la cola
  // rechazada para siempre y ningún acta posterior se podría generar hasta reiniciar.
  fila = mio.catch(() => undefined);
  return mio;
}
