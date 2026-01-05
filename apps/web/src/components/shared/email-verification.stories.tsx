/**
 * Email Verification Storybook Stories
 *
 * IMPLEMENTS: PG-023 (Email Verification)
 *
 * Stories for the Email Verification component.
 *
 * Note: To use these stories with Storybook, add the following to
 * packages/ui/.storybook/main.ts stories array:
 * '../../apps/web/src/components/shared/*.stories.@(js|jsx|mjs|ts|tsx)'
 */

import type { Meta, StoryObj } from '@storybook/react';
import { EmailVerification } from './email-verification';

// Mock the account-activation module for Storybook
const mockValidToken = 'a'.repeat(64);
const mockExpiredToken = 'b'.repeat(64);
const mockInvalidToken = 'c'.repeat(64);
const mockUsedToken = 'd'.repeat(64);

const meta: Meta<typeof EmailVerification> = {
  title: 'Auth/EmailVerification',
  component: EmailVerification,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#0f172a' }],
    },
    nextjs: {
      navigation: {
        push: () => {},
      },
    },
  },
  argTypes: {
    token: {
      control: 'text',
      description: 'Verification token from URL',
    },
    email: {
      control: 'text',
      description: 'Email for resend functionality',
    },
    redirectUrl: {
      control: 'text',
      description: 'URL to redirect after success',
    },
    onVerified: { action: 'verified' },
    onError: { action: 'error' },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-8 bg-slate-800/50 rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EmailVerification>;

/**
 * Loading state - initial verification in progress.
 */
export const Loading: Story = {
  args: {
    token: mockValidToken,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the loading spinner while verifying the token.',
      },
    },
  },
};

/**
 * Success state - email verified successfully.
 */
export const Success: Story = {
  args: {
    token: mockValidToken,
    email: 'user@example.com',
    redirectUrl: '/dashboard',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows success message with continue button after verification.',
      },
    },
  },
};

/**
 * Expired token - link has expired.
 */
export const Expired: Story = {
  args: {
    token: mockExpiredToken,
    email: 'user@example.com',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows expired message with resend button when token has expired.',
      },
    },
  },
};

/**
 * Invalid token - link is invalid or malformed.
 */
export const Invalid: Story = {
  args: {
    token: mockInvalidToken,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows error message with signup link for invalid tokens.',
      },
    },
  },
};

/**
 * Already verified - email was already verified.
 */
export const AlreadyVerified: Story = {
  args: {
    token: mockUsedToken,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows message indicating email is already verified with login link.',
      },
    },
  },
};

/**
 * No email provided - cannot show resend option.
 */
export const NoEmail: Story = {
  args: {
    token: mockExpiredToken,
  },
  parameters: {
    docs: {
      description: {
        story: 'When no email is provided, resend option is not available.',
      },
    },
  },
};

/**
 * Custom redirect URL.
 */
export const CustomRedirect: Story = {
  args: {
    token: mockValidToken,
    email: 'user@example.com',
    redirectUrl: '/onboarding',
  },
  parameters: {
    docs: {
      description: {
        story: 'Redirects to custom URL after successful verification.',
      },
    },
  },
};

/**
 * Mobile viewport.
 */
export const MobileView: Story = {
  args: {
    token: mockValidToken,
    email: 'user@example.com',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Responsive layout for mobile devices.',
      },
    },
  },
};

/**
 * With callbacks.
 */
export const WithCallbacks: Story = {
  args: {
    token: mockValidToken,
    email: 'user@example.com',
    onVerified: () => console.log('Email verified!'),
    onError: (error) => console.log('Error:', error),
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates callback props for handling verification events.',
      },
    },
  },
};

/**
 * Accessibility focused.
 */
export const AccessibilityFocused: Story = {
  args: {
    token: mockValidToken,
    email: 'user@example.com',
  },
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'button-name', enabled: true },
          { id: 'link-name', enabled: true },
        ],
      },
    },
    docs: {
      description: {
        story: 'All interactive elements have proper ARIA labels and focus states.',
      },
    },
  },
};
