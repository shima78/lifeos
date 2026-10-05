import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    // Nest resolves constructor injection from emitted decorator metadata, so injected classes
    // must be value imports. Type-only import enforcement is disabled for the API.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Architecture guard: only repositories, the Prisma module and the seed touch Prisma.
    files: ['apps/api/src/**/*.ts'],
    // Mappers may import Prisma row types (type-only) to convert them into contract DTOs.
    ignores: [
      'apps/api/src/**/*.repository.ts',
      'apps/api/src/**/*.mapper.ts',
      'apps/api/src/prisma/**',
      'apps/api/src/test-utils/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@prisma/client', message: 'Only repositories may use Prisma.' }],
          patterns: [
            {
              group: ['**/prisma/prisma.service'],
              message: 'Only repositories may use PrismaService.',
            },
          ],
        },
      ],
    },
  },
  {
    // Services are transport-independent.
    files: ['apps/api/src/**/*.service.ts'],
    ignores: ['apps/api/src/prisma/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@prisma/client', message: 'Only repositories may use Prisma.' },
            { name: 'express', message: 'Services must not depend on HTTP.' },
            {
              name: '@nestjs/common',
              importNames: [
                'HttpException',
                'NotFoundException',
                'BadRequestException',
                'ConflictException',
                'Req',
                'Res',
              ],
              message: 'Services throw domain errors from common/errors.ts, never HTTP exceptions.',
            },
          ],
          patterns: [
            {
              group: ['**/prisma/prisma.service'],
              message: 'Only repositories may use PrismaService.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  prettier,
);
