/**
 * MFA QR Generator Storybook Stories
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Stories for the MFA QR Generator component used in TOTP setup.
 *
 * Note: To use these stories with Storybook, add the following to
 * packages/ui/.storybook/main.ts stories array:
 * '../../apps/web/src/components/shared/*.stories.@(js|jsx|mjs|ts|tsx)'
 */

import type { Meta, StoryObj } from '@storybook/react';
import { MfaQrGenerator } from './mfa-qr-generator';

const meta: Meta<typeof MfaQrGenerator> = {
  title: 'Auth/MfaQrGenerator',
  component: MfaQrGenerator,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#0f172a' }],
    },
  },
  argTypes: {
    otpauthUrl: { control: 'text' },
    secret: { control: 'text' },
    accountName: { control: 'text' },
    onConfirm: { action: 'confirmed' },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md p-6 bg-slate-800 rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MfaQrGenerator>;

// Sample TOTP secret for demo
const DEMO_SECRET = 'JBSWY3DPEHPK3PXP';
const DEMO_EMAIL = 'user@example.com';
const DEMO_OTPAUTH_URL = `otpauth://totp/IntelliFlow:${DEMO_EMAIL}?secret=${DEMO_SECRET}&issuer=IntelliFlow&algorithm=SHA1&digits=6&period=30`;

/**
 * Default state with QR code and manual entry section collapsed.
 */
export const Default: Story = {
  args: {
    otpauthUrl: DEMO_OTPAUTH_URL,
    secret: DEMO_SECRET,
    accountName: DEMO_EMAIL,
  },
};

/**
 * Different account name example.
 */
export const DifferentAccount: Story = {
  args: {
    otpauthUrl: `otpauth://totp/IntelliFlow:admin@company.com?secret=GEZDGNBVGY3TQOJQ&issuer=IntelliFlow`,
    secret: 'GEZDGNBVGY3TQOJQ',
    accountName: 'admin@company.com',
  },
};

/**
 * Long secret key to test formatting.
 */
export const LongSecret: Story = {
  args: {
    otpauthUrl: `otpauth://totp/IntelliFlow:${DEMO_EMAIL}?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=IntelliFlow`,
    secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    accountName: DEMO_EMAIL,
  },
};

/**
 * Custom className applied to container.
 */
export const CustomStyling: Story = {
  args: {
    otpauthUrl: DEMO_OTPAUTH_URL,
    secret: DEMO_SECRET,
    accountName: DEMO_EMAIL,
    className: 'bg-slate-700/50 p-4 rounded-xl',
  },
};

/**
 * Interactive story showing component with manual section expanded.
 * Use the controls to expand/collapse and test copy functionality.
 */
export const Interactive: Story = {
  args: {
    otpauthUrl: DEMO_OTPAUTH_URL,
    secret: DEMO_SECRET,
    accountName: DEMO_EMAIL,
  },
  play: async ({ canvasElement: _canvasElement }) => {
    // You can add interaction tests here with @storybook/test
    // const canvas = within(_canvasElement);
    // await userEvent.click(canvas.getByText(/Can't scan/));
  },
};

/**
 * Mobile viewport simulation.
 */
export const MobileView: Story = {
  args: {
    otpauthUrl: DEMO_OTPAUTH_URL,
    secret: DEMO_SECRET,
    accountName: DEMO_EMAIL,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/**
 * Accessibility: Component with all aria-labels visible.
 */
export const AccessibilityFocused: Story = {
  args: {
    otpauthUrl: DEMO_OTPAUTH_URL,
    secret: DEMO_SECRET,
    accountName: DEMO_EMAIL,
  },
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'button-name', enabled: true },
        ],
      },
    },
  },
};
