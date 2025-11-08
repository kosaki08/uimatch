import eslint from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['packages/uimatch-core/**/*.test.ts', 'packages/uimatch-core/src/**/__tests__/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: path.join(__dirname, 'packages/uimatch-core/tsconfig.test.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: [
      'packages/uimatch-plugin/**/*.test.ts',
      'packages/uimatch-plugin/src/**/__tests__/**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: path.join(__dirname, 'packages/uimatch-plugin/tsconfig.test.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: [
      'packages/uimatch-selector-anchors/**/*.test.ts',
      'packages/uimatch-selector-anchors/src/__tests__/**/*.ts',
      'packages/uimatch-selector-anchors/src/*/__tests__/**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: path.join(__dirname, 'packages/uimatch-selector-anchors/tsconfig.test.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/dist/**',
      'build/**',
      '*.config.js',
      '**/scripts/**',
      '**/fixtures/**',
    ],
  },
];
