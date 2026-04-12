/**
 * MFA Verification Storybook Stories
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * Stories for the MFA Verification wrapper component.
 *
 * Note: To use these stories with Storybook, add the following to
 * packages/ui/.storybook/main.ts stories array:
 * '../../apps/web/src/components/shared/*.stories.@(js|jsx|mjs|ts|tsx)'
 */

import type { Meta, StoryObj } from '@storybook/react';
import { MfaVerification } from './mfa-verification';

const meta: Meta<typeof MfaVerification> = {
  title: 'Auth/MfaVerification',
  component: MfaVerification,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#0f172a' }],
    },
    // Mock next/navigation
    nextjs: {
      navigation: {
        push: () => {},
        searchParams: new URLSearchParams(),
      },
    },
  },
  argTypes: {
    method: {
      control: 'select',
      options: ['totp', 'sms', 'email', 'backup'],
      description: 'MFA method to use',
    },
    email: {
      control: 'text',
      description: 'User email to display',
    },
    challengeId: {
      control: 'text',
      description: 'Challenge ID for verification',
    },
    redirectUrl: {
      control: 'text',
      description: 'URL to redirect after success',
    },
    onSuccess: { action: 'success' },
    onCancel: { action: 'cancelled' },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md p-6 bg-slate-800/50 rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MfaVerification>;

/**
 * Default TOTP verification state.
 */
export const Default: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
  },
};

/**
 * SMS verification method.
 */
export const SMSVerification: Story = {
  args: {
    method: 'sms',
    email: 'user@example.com',
    maskedPhone: '***-***-1234',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
  },
};

/**
 * Email verification method.
 */
export const EmailVerification: Story = {
  args: {
    method: 'email',
    email: 'user@example.com',
    maskedEmail: 'u***@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
  },
};

/**
 * Backup code entry.
 */
export const BackupCode: Story = {
  args: {
    method: 'backup',
    email: 'user@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
  },
};

/**
 * Single method available (TOTP only).
 */
export const SingleMethod: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    availableMethods: ['totp'],
  },
};

/**
 * With challenge ID from URL.
 */
export const WithChallengeId: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    challengeId: 'abc123-challenge-id',
    redirectUrl: '/dashboard',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
  },
};

/**
 * Enterprise user with custom email.
 */
export const EnterpriseUser: Story = {
  args: {
    method: 'totp',
    email: 'john.smith@enterprise-corp.com',
    availableMethods: ['totp', 'backup'],
  },
};

/**
 * Mobile viewport simulation.
 */
export const MobileView: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/**
 * With cancel handler.
 */
export const WithCancel: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
    onCancel: () => alert('Cancel clicked'),
  },
};

/**
 * Custom styling applied.
 */
export const CustomStyling: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
    className: 'bg-slate-700/50 p-4 rounded-xl',
  },
};

/**
 * Accessibility-focused story with all ARIA labels.
 */
export const AccessibilityFocused: Story = {
  args: {
    method: 'totp',
    email: 'user@example.com',
    availableMethods: ['totp', 'sms', 'email', 'backup'],
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
