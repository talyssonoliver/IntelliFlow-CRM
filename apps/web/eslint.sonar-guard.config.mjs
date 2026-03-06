import baseConfig from './eslint.config.mjs';
import reactPlugin from 'eslint-plugin-react';

export default [
  ...baseConfig,
  {
    files: ['src/**/*.tsx'],
    plugins: {
      react: reactPlugin,
    },
    rules: {
      // Sonar accessibility parity for new code in web UI.
      'jsx-a11y/prefer-tag-over-role': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      // Sonar typescript:S6772 parity for ambiguous spacing around inline JSX elements.
      'react/jsx-child-element-spacing': 'error',
    },
  },
];
