import type { Meta, StoryObj } from '@storybook/react';
import { ZepBudgetGauge } from './ZepBudgetGauge';

const meta: Meta<typeof ZepBudgetGauge> = {
  title: 'Settings/AI/ZepBudgetGauge',
  component: ZepBudgetGauge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Circular gauge component displaying Zep memory budget usage with color-coded thresholds.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ZepBudgetGauge>;

export const Normal: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Budget usage below 80% - shown in green.',
      },
    },
  },
};

export const Warning: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Budget usage between 80-94% - shown in yellow.',
      },
    },
  },
};

export const Critical: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Budget usage at 95% or above - shown in red.',
      },
    },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Normal (20%)</h3>
        <ZepBudgetGauge />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Warning (85%)</h3>
        <ZepBudgetGauge />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Critical (98%)</h3>
        <ZepBudgetGauge />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Shows all three budget states: normal, warning, and critical.',
      },
    },
  },
};
