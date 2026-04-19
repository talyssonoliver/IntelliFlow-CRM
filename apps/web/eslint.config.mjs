import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    rules: {
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Disable rules that are too strict for now
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Accessibility rules (WCAG 2.1 AA)
      // -- Hard errors: prevent new regressions
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
      // -- Warnings: pre-existing violations, upgrade to error once cleaned up
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      // PG-195 / ADR-046: Material Symbols Outlined is the ONLY icon library.
      // Foreign icon packages defeat the subsetted font (234 KB, 359 glyphs)
      // and re-introduce the Lighthouse ≥90 regression this task fixed.
      // See docs/design/ICON_USAGE.md for the full policy.
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'lucide-react',
            message: 'Use Material Symbols: <span className="material-symbols-outlined">name</span>. See docs/design/ICON_USAGE.md + ADR-046.',
          },
          {
            name: '@heroicons/react',
            message: 'Use Material Symbols instead. See docs/design/ICON_USAGE.md + ADR-046.',
          },
          {
            name: 'react-icons',
            message: 'Use Material Symbols instead. See docs/design/ICON_USAGE.md + ADR-046.',
          },
          {
            name: '@radix-ui/react-icons',
            message: 'Use Material Symbols instead. See docs/design/ICON_USAGE.md + ADR-046.',
          },
          {
            name: 'react-feather',
            message: 'Use Material Symbols instead. See docs/design/ICON_USAGE.md + ADR-046.',
          },
        ],
        patterns: [
          {
            group: ['@heroicons/react/*', 'react-icons/*', '@radix-ui/react-icons/*'],
            message: 'Use Material Symbols. See docs/design/ICON_USAGE.md + ADR-046.',
          },
        ],
      }],
    },
  },
  // Timezone Safety: prevent server/browser-local time usage
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString'][arguments.length=0]",
          message:
            'Bare toLocaleDateString() uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatDate().',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString'][arguments.length=0]",
          message:
            'Bare toLocaleTimeString() uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatTime().',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString'][arguments.length=0]",
          message:
            'Bare toLocaleString() on Date uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatDateTime().',
        },
      ],
    },
  },
  // Test files — allow `any` for mock flexibility (consistent with root config)
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'build/**',
      'coverage/**',
    ],
  },
];
