import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = build output. .claude/worktrees = checkouts isolados de agents
  // (duplicariam todo lint 1x por worktree ativa). node_modules é default.
  globalIgnores(['dist', '.claude/**', 'node_modules/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      // react-hooks 5.2.0: `configs.flat` não existe — o flat config moderno é
      // `recommended-latest`. (`configs.flat.recommended` quebrava com
      // "Cannot read properties of undefined (reading 'recommended')".)
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Convenção universal: variável/arg/catch com prefixo `_` é descarte
      // intencional (ex: destructuring `const { tagId: _tagId, ...body } = s`).
      // `warn` (não error) pra não bloquear CI em código morto residual —
      // visível pra cleanup gradual. ignoreRestSiblings cobre o pattern
      // `const { x: _x, ...rest } = obj`.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Tipagem gradual — `any` é débito conhecido em código MVP rápido.
      // warn mantém visibilidade sem travar deploy.
      '@typescript-eslint/no-explicit-any': 'warn',
      // react-refresh só afeta DX do HMR (Fast Refresh), não prod. warn.
      'react-refresh/only-export-components': 'warn',
      // exhaustive-deps tem falsos positivos em hooks com deps estáveis
      // (ex: setters do useState). warn — revisar caso a caso.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Backend workers/ rodam em Node (não browser) — globals diferentes +
  // console é legítimo (logs estruturados pro Easypanel stdout).
  {
    files: ['workers/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
