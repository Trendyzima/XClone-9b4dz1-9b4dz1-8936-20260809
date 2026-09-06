import js from '@eslint/js';
import globals from 'globals';

// TypeScript/TSX correctness is enforced by `npm run typecheck`.
// ESLint is intentionally scoped to JavaScript tooling/configuration so it does not
// parse TS/TSX with Espree or report Node globals as browser errors.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.ts',
      '**/*.tsx',
      '_*.cjs',
      'vite-fix-loader.mjs',
      'vite.config.cjs',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: js.configs.recommended.rules,
  },
];
