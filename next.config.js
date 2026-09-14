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
