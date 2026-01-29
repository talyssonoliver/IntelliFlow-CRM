/**
 * Checkout Form Component Stories
 *
 * IMPLEMENTS: PG-026 (Checkout)
 */

import type { Meta, StoryObj } from '@storybook/react';
import { CheckoutForm } from './checkout-form';

const meta = {
  title: 'Billing/CheckoutForm',
  component: CheckoutForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Payment checkout form with card validation and order summary.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md p-4">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof CheckoutForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    planId: 'professional',
    planName: 'Professional',
    priceMonthly: 7900,
    priceAnnual: 78000,
    billingCycle: 'monthly',
  },
};

export const AnnualBilling: Story = {
  args: {
    planId: 'professional',
    planName: 'Professional',
    priceMonthly: 7900,
    priceAnnual: 78000,
    billingCycle: 'annual',
  },
};

export const StarterPlan: Story = {
  args: {
    planId: 'starter',
    planName: 'Starter',
    priceMonthly: 2900,
    priceAnnual: 28800,
    billingCycle: 'monthly',
  },
};

export const EnterprisePlan: Story = {
  args: {
    planId: 'enterprise',
    planName: 'Enterprise',
    priceMonthly: 19900,
    priceAnnual: 198000,
    billingCycle: 'annual',
  },
};
