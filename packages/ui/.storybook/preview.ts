import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // axe-core configuration
      config: {
        rules: [
          {
            // Enable all WCAG 2.1 AA rules
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
      options: {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    },
  },
  tags: ['autodocs'],
};

export default preview;
