// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 removed the `eslint` key: `next build` no longer lints at all,
  // so the previous ignoreDuringBuilds flag has no equivalent and no effect.
  typescript: { ignoreBuildErrors: true },
  output: 'standalone',

  // EL TECHO REAL DE UNA SUBIDA DE PAQUETE SCORM, Y POR QUÉ VIVE ACÁ.
  //
  // Subir un curso va por una Server Action, y Next las limita a **1 MB por omisión**. Hasta
  // el 21/09/2026 esta clave no existía, así que ése era el techo que regía — mientras `.env`
  // declaraba `SCORM_TAMANO_MAX_MB=200` y `app/sig/acciones/scorm.ts` validaba contra 200. La
  // validación de la acción era código muerto para cualquier cosa sobre un megabyte: **la
  // petición nunca llegaba**. Se descubrió subiendo un curso de 3,3 MB; ninguno de los cuatro
  // checks lo atrapa, porque ninguno ejecuta una subida.
  //
  // El `+ 1` no es margen por las dudas: la documentación de Next 16.3.2 avisa que el límite
  // se aplica al cuerpo HTTP CRUDO, «including the bytes that multipart/form-data adds for
  // boundaries, part headers, and field metadata», y recomienda dejar 10–20 KB de sobra.
  //
  // **El número vive en `lib/sig/limite-paquete.ts`**, que es TypeScript y este archivo es
  // CommonJS: no se pueden compartir sin inventar un puente. Lo que impide que se separen es
  // `lib/sig/__tests__/limite-paquete.test.ts`, que lee los dos y falla si dejan de decir lo
  // mismo — la misma medicina que `despliegue-verificado.test.ts` usa con los comandos de
  // verificación. **Si cambiás este número, cambiá el otro.**
  experimental: {
    serverActions: { bodySizeLimit: '26mb' },
  },

  // SÓLO DESARROLLO. El player SCORM sirve el contenido desde un origen distinto al de la
  // aplicación (P3): en local eso es `127.0.0.1:3000` mientras la app vive en `localhost:3000`
  // —el mismo servidor de Next, dos orígenes para el navegador—. Next 16 bloquea con 403 las
  // peticiones a `/_next/*` que llegan de un origen fuera de esta lista (por omisión sólo
  // `localhost`), así que el runner cargaba pero SUS PROPIOS CHUNKS quedaban prohibidos y el
  // player se quedaba en «Cargando el curso…» para siempre. Autorizar `127.0.0.1` deja que el
  // runner hidrate. No afecta a producción: `next build`/`start` ignoran esta clave y ahí los
  // dos orígenes son servidores separados con sus propios recursos.
  allowedDevOrigins: ['127.0.0.1'],

  // REQ-SIG-19 · P12 · la ruta pública de firma lleva el token EN LA RUTA.
  //
  // Una página no puede fijar cabeceras de respuesta por sí misma, y `/firmar` no pasa por el
  // `matcher` del middleware a propósito (P10), así que la cabecera se emite acá.
  //
  // `Referrer-Policy: no-referrer` es la que importa: sin ella, cualquier recurso o enlace de
  // tercero que la página llegara a cargar se llevaría la URL completa —token incluido— en la
  // cabecera `Referer`. La página no carga ninguno, pero la cabecera no depende de que eso se
  // mantenga cierto en la próxima edición.
  //
  // `X-Robots-Tag: noindex` acompaña: una URL con un token indexada es un token publicado.
  // Mejora y Auditoría se mudaron de `/sig/*` a `/sgsi/*` el 15/09/2026, porque son parte
  // del sistema de gestión y no de la operación diaria de tareas.
  //
  // LAS REDIRECCIONES NO SON OPCIONALES. Las URLs viejas están en actas, en correos de
  // notificación ya enviados y en los favoritos de quien trabaja ahí todos los días. Un 404
  // sobre `/sig/hallazgos` no le dice a nadie que la pantalla existe con otra dirección: le
  // dice que la pantalla ya no está.
  //
  // `permanent: false` (307) y no 308: un permanente se queda cacheado en el navegador de
  // cada persona y sobrevive a que alguna vez decidamos volver atrás.
  redirects() {
    return ['hallazgos', 'mejora', 'auditorias', 'tablero-auditoria', 'normas'].flatMap((r) => [
      { source: `/sig/${r}`, destination: `/sgsi/${r}`, permanent: false },
      { source: `/sig/${r}/:path*`, destination: `/sgsi/${r}/:path*`, permanent: false },
    ]);
  },

  headers() {
    return [
      {
        source: '/firmar/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
