import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint 9 flat config: TypeScript correctness remains enforced by the dedicated typecheck gate.
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  tseslint.configs.eslintRecommended,
];
