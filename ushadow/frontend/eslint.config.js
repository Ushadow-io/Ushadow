import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        FormData: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        WebSocket: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // TypeScript rules
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // React hooks rules
      ...reactHooks.configs.recommended.rules,

      // React refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // =========================================================================
      // CODE QUALITY - Prevents sprawling files, forces modular code
      // =========================================================================

      // Pages should be max 600 lines - forces extraction to components/hooks
      'max-lines': ['warn', {
        max: 600,
        skipBlankLines: true,
        skipComments: true,
      }],

      // Functions should be focused - max 80 lines
      'max-lines-per-function': ['warn', {
        max: 80,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
      }],

      // Prevent deeply nested code - max 4 levels
      'max-depth': ['warn', 4],

      // Limit complexity - forces simpler logic
      'complexity': ['warn', 15],

      // Prevent console.log in production (warn only)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]
