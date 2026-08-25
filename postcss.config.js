// postcss.config.js
// Tailwind 4 ships a single PostCSS plugin and vendor-prefixes internally,
// so autoprefixer was removed.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
