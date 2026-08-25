// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 removed the `eslint` key: `next build` no longer lints at all,
  // so the previous ignoreDuringBuilds flag has no equivalent and no effect.
  typescript: { ignoreBuildErrors: true },
  output: 'standalone',
};
module.exports = nextConfig;
