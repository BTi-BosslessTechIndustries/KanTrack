import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

// Note: In ESLint flat config, file patterns are resolved relative to the
// config file's directory. This file lives in config/, so all patterns use
// ../ to point back to the project root.

export default [
  // App source files — browser environment
  {
    files: ['../scripts/**/*.{js,ts}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // crypto is in browser globals but also available as a Node global;
        // explicit declaration avoids ambiguity.
        crypto: 'readonly',
      },
    },
    rules: {
      // Downgrade no-unused-vars to warn — existing code has intentional
      // catch-all patterns; TypeScript's strict mode catches real issues.
      'no-unused-vars': 'warn',
    },
  },
  // TypeScript files — additional overrides (tsc handles type checking)
  {
    files: ['../**/*.ts'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  // Config files in this directory — Node.js globals
  {
    files: ['*.config.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Test files — browser-like globals + Vitest test globals
  {
    files: ['../tests/**/*.{js,ts}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        // Vitest globals (enabled via vitest config `globals: true`)
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
  // Disable ESLint formatting rules that conflict with Prettier
  prettierConfig,
  // Global ignores
  {
    // TypeScript files are type-checked by `tsc --noEmit` (npm run typecheck).
    // Skip them here to avoid needing @typescript-eslint/parser.
    ignores: ['../dist/**', '../node_modules/**', '../**/*.ts'],
  },
];
