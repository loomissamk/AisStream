import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  // Base for JS/TS files
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: ['dist/**', 'build/**', 'node_modules/**', '.yarn/**', 'coverage/**', 'eslint.config.mjs', 'jest.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        project: [path.resolve(__dirname, 'tsconfig.json')],
        tsconfigRootDir: __dirname,
      },
    },
    linterOptions: {
      noInlineConfig: false,
      reportUnusedDisableDirectives: true,
    },
  },

  // JS recommended
  js.configs.recommended,

  // TypeScript recommended (ESLint 9 + typescript-eslint v8 flat config)
  ...tseslint.configs.recommended,

  // Enable type-aware rules
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...cfg.languageOptions,
      parser: tseslint.parser,
      parserOptions: { 
        project: [path.resolve(__dirname, 'tsconfig.json')],
        tsconfigRootDir: __dirname,
      },
    },
  })),

  // Project rules
  {
    rules: {
      'no-unused-vars': 'off', // TS handles this better
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
];
