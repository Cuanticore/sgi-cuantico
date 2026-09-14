// app/firmar/[token]/page.tsx
//
// **REQ-SIG-19 · Task 7 · la única ruta pública del requerimiento** (D-9).
//
// **P10 · esta ruta NO entra al `matcher` del middleware, y eso está dicho allá.** El `matcher`
// enumera lo protegido, así que una ruta nueva nace pública por omisión. Acá eso es deliberado:
// **la autorización es el token**, y no hay ninguna otra. Quien abre esta página no tiene sesión,
// no la obtiene por abrirla, y no llega desde acá a ninguna otra pantalla.
//
// **P12 · `Referrer-Policy: no-referrer`.** El token va **en la ruta**, así que cualquier recurso
// o enlace de tercero se lo llevaría en la cabecera `Referer`. La cabecera se emite en
// `next.config.js` para `/firmar/:path*` —una página no puede fijar cabeceras de respuesta por sí
// misma— y acá se repite como `<meta name="referrer">`, que es lo que rige para las navegaciones
// que el navegador hace después de cargada la página. Las dos, porque cubren momentos distintos.
// Además va `noindex`: una URL con un token indexada es un token publicado.
//
// **P13 · los cuatro casos malos producen la misma página, con el mismo código de estado.**
// Inexistente, expirado, revocado y bloqueado se dibujan desde el mismo valor —lo decide
// `vistaDelEnlace`— y **ninguno llama a `notFound()`**: un 404 para el token que no existe y un
// 200 para el que expiró es exactamente el oráculo que P13 existe para cerrar. Los cuatro
// responden 200 con la misma frase.
//
// **D-5 · abrirlo, cuantas veces haga falta.** Esta página no escribe nada. Lo que se consume una
// sola vez es la firma, que es la Task 8.
//
// **Sobre el registro de accesos (P12):** el repositorio no tiene ninguno. No hay librería de
// registro (`pino`, `winston`, `morgan`), no hay `instrumentation.ts`, no hay servidor propio y
// el único ejemplo de proxy —`deploy/origen-cursos.nginx.example`— no configura `access_log` ni
// cubre este host. Lo que sí queda fuera del repositorio es el registro que escriba el proxy que
// se ponga adelante en producción: ahí el último segmento de `/firmar/<token>` **es** el token, y
// hay que enmascararlo o excluir la ruta. Queda anotado acá y en el reporte, sin inventar una
// configuración que este repositorio no gobierna.

import type { Metadata } from 'next';

import { firmarConEnlace } from '@/app/sig/acciones/enlace-firma';
import { fechaCorta } from '@/lib/sig/correos';
import { vistaDelEnlace } from '@/lib/sig/vista-enlace-publico';
import PanelPublico from './PanelPublico';
import { leerEnlacePublico } from './enlace.query';

/// El enlace se resuelve contra la base en cada visita: su estado cambia con el tiempo —expira—
/// y con lo que pasa en otra parte —se revoca, se usa—. Una página cacheada mostraría «firmá
/// acá» sobre un enlace ya revocado.
export const dynamic = 'force-dynamic';

/// El título no dice de quién es la solicitud ni qué documento es: queda en el historial del
/// navegador junto a la URL, y ahí ya hay bastante con el token.
export const metadata: Metadata = {
  title: 'Firma de documento · Cuantico',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // El token entra, se convierte en hash y se olvida. No se registra, no se imprime y no vuelve a
  // salir más que hacia el componente de firma, que lo necesita para el envío de la Task 8.
  const enlace = await leerEnlacePublico(token);
  const vista = vistaDelEnlace(enlace, new Date());

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {vista.clase === 'NO_DISPONIBLE' && <NoDisponible frase={vista.frase} />}

      {vista.clase === 'FIRMADO' && (
        <Constancia
          nombre={vista.nombre}
          codigoDocumento={vista.documento.codigo}
          tituloDocumento={vista.documento.titulo}
          firmadoEn={vista.firmadoEn}
          acta={vista.acta}
        />
      )}

      {vista.clase === 'PARA_FIRMAR' && (
        // Task 8 · el enganche. `firmarConEnlace` revalida del lado del servidor todo lo que esta
        // pantalla comprueba —y las puertas que la pantalla no puede comprobar: el estado del
        // enlace, el documento de identidad y el tope de intentos—. La pantalla ayuda; no decide.
        <PanelPublico
          token={token}
          nombre={vista.nombre}
          documento={vista.documento}
          firmar={firmarConEnlace}
        />
      )}
    </main>
  );
}

/// **P13 · la misma página para los cuatro casos malos.**
///
/// Sin nombres, sin el código del enlace y sin decir cuál de los cuatro es. Recibe la frase —no
/// la escribe— para que no pueda separarse de la que decide `lib/sig/enlace-firma.ts`.
function NoDisponible({ frase }: { frase: string }) {
  return (
    <div className="w-full max-w-[520px] rounded-modal bg-surface p-6 shadow-xl">
      <h1 className="text-15 font-semibold text-primary">Enlace no disponible</h1>
      <p className="mt-2 text-12_5 leading-relaxed text-secondary [text-wrap:pretty]">{frase}</p>
    </div>
  );
}

/// **La excepción que sí informa:** el enlace ya se usó, así que la firma ocurrió y no queda nada
/// que proteger. Quien vuelve necesita esta constancia, porque `/mi-sig` le está cerrado y no
/// tiene dónde más consultarla.
function Constancia({
  nombre,
  codigoDocumento,
  tituloDocumento,
  firmadoEn,
  acta,
}: {
  nombre: string;
  codigoDocumento: string;
  tituloDocumento: string;
  firmadoEn: Date;
  acta: string | null;
}) {
  return (
    <div className="w-full max-w-[520px] rounded-modal bg-surface p-6 shadow-xl">
      <h1 className="text-15 font-semibold text-primary">Este documento ya está firmado</h1>
      <p className="mt-2 text-12_5 leading-relaxed text-secondary [text-wrap:pretty]">
        {nombre} firmó <strong className="font-semibold text-primary">{codigoDocumento}</strong> —{' '}
        {tituloDocumento} el {fechaCorta(firmadoEn)} de {firmadoEn.getUTCFullYear()}.
      </p>
      <dl className="mt-3 grid gap-1.5 text-11_5">
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted">Acta</dt>
          <dd className="font-mono font-semibold text-primary">
            {/* Sin acta legible se dice que no consta, en vez de inventar un código. Un acta es
                evidencia, y un código inventado en una pantalla de constancia es una mentira
                pequeña en el peor lugar posible. */}
            {acta ?? 'no consta'}
          </dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted">Fecha y hora (UTC)</dt>
          <dd className="font-mono text-primary">{firmadoEn.toISOString()}</dd>
        </div>
      </dl>
      <p className="mt-3 text-11 leading-relaxed text-muted [text-wrap:pretty]">
        No hay nada más que hacer con este enlace: la firma se hace una sola vez. Si necesita el
        acta, escriba a quien le envió la solicitud citando el código de arriba.
      </p>
    </div>
  );
}
