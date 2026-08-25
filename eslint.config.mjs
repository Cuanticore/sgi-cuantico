// eslint.config.mjs
// Flat config: eslint-config-next 16 ships flat by default and `next lint` was
// removed, so linting runs through the ESLint CLI (`npm run lint`).

import next from 'eslint-config-next';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'lib/generated/**', 'coverage/**'],
  },
  ...next,
];
