import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      // Stubs keep their final signatures; prefix not-yet-used params with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Library modules must stay framework-free (see CLAUDE.md).
    files: [
      'src/measure/**',
      'src/rag/**',
      'src/material/**',
      'src/shape2d/**',
      'src/render3d/**',
      'src/export/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'Library modules must not import React.',
            },
          ],
        },
      ],
    },
  },
  {
    // rag/ and material/ are pure math: no third-party libraries at all.
    files: ['src/rag/**', 'src/material/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^[^./]',
              message: 'rag/ and material/ must not import libraries; keep them pure math.',
            },
          ],
        },
      ],
    },
  },
  prettier,
])
