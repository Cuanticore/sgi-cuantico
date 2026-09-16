// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 removed the `eslint` key: `next build` no longer lints at all,
  // so the previous ignoreDuringBuilds flag has no equivalent and no effect.
  typescript: { ignoreBuildErrors: true },
  output: 'standalone',

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
