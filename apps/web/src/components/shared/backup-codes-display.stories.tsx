/**
 * Backup Codes Display Storybook Stories
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Stories for the Backup Codes Display component used after MFA setup.
 *
 * Note: To use these stories with Storybook, add the following to
 * packages/ui/.storybook/main.ts stories array:
 * '../../apps/web/src/components/shared/*.stories.@(js|jsx|mjs|ts|tsx)'
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BackupCodesDisplay } from './backup-codes-display';

const meta: Meta<typeof BackupCodesDisplay> = {
  title: 'Auth/BackupCodesDisplay',
  component: BackupCodesDisplay,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#0f172a' }],
    },
  },
  argTypes: {
    codes: { control: 'object' },
    email: { control: 'text' },
    generatedAt: { control: 'date' },
    onAcknowledge: { action: 'acknowledged' },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-6 bg-slate-800 rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BackupCodesDisplay>;

// Sample backup codes
const DEMO_CODES = [
  'A1B2C3D4E5',
  'F6G7H8I9J0',
  'K1L2M3N4O5',
  'P6Q7R8S9T0',
  'U1V2W3X4Y5',
  'Z6A7B8C9D0',
  'E1F2G3H4I5',
  'J6K7L8M9N0',
];

/**
 * Default state with 8 backup codes.
 */
export const Default: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date(),
  },
};

/**
 * With a specific generation date.
 */
export const WithGenerationDate: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date('2025-01-01T12:00:00Z'),
  },
};

/**
 * Different number of codes (4 codes).
 */
export const FewCodes: Story = {
  args: {
    codes: DEMO_CODES.slice(0, 4),
    email: 'minimal@example.com',
    generatedAt: new Date(),
  },
};

/**
 * Maximum codes (12 codes).
 */
export const ManyCodes: Story = {
  args: {
    codes: [
      ...DEMO_CODES,
      'X1Y2Z3A4B5',
      'C6D7E8F9G0',
      'H1I2J3K4L5',
      'M6N7O8P9Q0',
    ],
    email: 'poweruser@example.com',
    generatedAt: new Date(),
  },
};

/**
 * Enterprise email format.
 */
export const EnterpriseUser: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'john.smith@acme-corporation.com',
    generatedAt: new Date(),
  },
};

/**
 * Custom styling applied.
 */
export const CustomStyling: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date(),
    className: 'bg-slate-700/50 p-4 rounded-xl',
  },
};

/**
 * Mobile viewport simulation.
 */
export const MobileView: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date(),
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/**
 * Interactive story showing copy/download/print actions.
 */
export const Interactive: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date(),
  },
  play: async ({ canvasElement: _canvasElement }) => {
    // You can add interaction tests here with @storybook/test
    // const canvas = within(_canvasElement);
    // Test clicking copy button, checking acknowledgment, etc.
  },
};

/**
 * Accessibility: All interactive elements testable.
 */
export const AccessibilityFocused: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date(),
  },
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'button-name', enabled: true },
          { id: 'label', enabled: true },
        ],
      },
    },
  },
};

/**
 * Print preview simulation (white background).
 */
export const PrintPreview: Story = {
  args: {
    codes: DEMO_CODES,
    email: 'user@example.com',
    generatedAt: new Date('2025-01-01'),
  },
  parameters: {
    backgrounds: {
      default: 'light',
      values: [{ name: 'light', value: '#ffffff' }],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-6 bg-white rounded-lg text-slate-900">
        <p className="text-sm text-slate-500 mb-4">
          Note: Print preview shows how codes appear when printed.
          Actual print layout uses dedicated print styles.
        </p>
        <Story />
      </div>
    ),
  ],
};
