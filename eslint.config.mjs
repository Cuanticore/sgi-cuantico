// eslint.config.mjs
// Flat config: eslint-config-next 16 ships flat by default and `next lint` was
// removed, so linting runs through the ESLint CLI (`npm run lint`).

import next from 'eslint-config-next';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'lib/generated/**',
      'coverage/**',
      // Design handoff artefacts, not source. `docs/handoff_*/design/*` is standalone HTML
      // with inline styles and its own bundled React — the work package is explicit that it
      // exists «para copiar valores exactos, no para importar como componente». Nothing here
      // is imported, built or shipped, so linting it only reported rules the application can
      // never violate (a ReactDOM.render inside support.js) while keeping `npm run lint` red
      // and therefore ignored.
      'docs/**',
    ],
  },
  ...next,
];
