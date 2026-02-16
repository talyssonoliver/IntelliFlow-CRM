import type { Meta, StoryObj } from '@storybook/react';
import { ChainVersionsDashboard } from './ChainVersionsDashboard';
import type { ChainVersionSummary } from '@intelliflow/validators';

const baseVersion: ChainVersionSummary = {
  id: 'v1',
  chainType: 'SCORING',
  status: 'ACTIVE',
  model: 'gpt-4',
  description: 'Lead scoring chain',
  rolloutStrategy: 'IMMEDIATE',
  rolloutPercent: null,
  createdAt: new Date('2025-01-01'),
  createdBy: 'admin@intelliflow.com',
};

const mockAllActive: Record<
  'SCORING' | 'QUALIFICATION' | 'EMAIL_WRITER' | 'FOLLOWUP',
  ChainVersionSummary | null
> = {
  SCORING: {
    ...baseVersion,
    id: 'v1',
    chainType: 'SCORING',
    model: 'gpt-4',
  },
  QUALIFICATION: {
    ...baseVersion,
    id: 'v2',
    chainType: 'QUALIFICATION',
    model: 'gpt-4-turbo',
    description: 'Lead qualification chain',
  },
  EMAIL_WRITER: {
    ...baseVersion,
    id: 'v3',
    chainType: 'EMAIL_WRITER',
    model: 'gpt-4',
    description: 'Email writer chain',
  },
  FOLLOWUP: {
    ...baseVersion,
    id: 'v4',
    chainType: 'FOLLOWUP',
    model: 'gpt-3.5-turbo',
    description: 'Follow-up chain',
  },
};

const mockPartialActive: Record<
  'SCORING' | 'QUALIFICATION' | 'EMAIL_WRITER' | 'FOLLOWUP',
  ChainVersionSummary | null
> = {
  SCORING: mockAllActive.SCORING,
  QUALIFICATION: null,
  EMAIL_WRITER: mockAllActive.EMAIL_WRITER,
  FOLLOWUP: null,
};

const mockNoneActive: Record<
  'SCORING' | 'QUALIFICATION' | 'EMAIL_WRITER' | 'FOLLOWUP',
  ChainVersionSummary | null
> = {
  SCORING: null,
  QUALIFICATION: null,
  EMAIL_WRITER: null,
  FOLLOWUP: null,
};

const meta: Meta<typeof ChainVersionsDashboard> = {
  title: 'Settings/AI/ChainVersionsDashboard',
  component: ChainVersionsDashboard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Dashboard grid showing active versions for all four chain types.',
      },
    },
  },
  argTypes: {
    onViewVersion: { action: 'onViewVersion' },
  },
};

export default meta;
type Story = StoryObj<typeof ChainVersionsDashboard>;

export const AllActive: Story = {
  args: {
    activeVersions: mockAllActive,
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'All four chain types have active versions.',
      },
    },
  },
};

export const PartialActive: Story = {
  args: {
    activeVersions: mockPartialActive,
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Some chain types have active versions, others do not.',
      },
    },
  },
};

export const NoneActive: Story = {
  args: {
    activeVersions: mockNoneActive,
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'No chain types have active versions.',
      },
    },
  },
};

export const Loading: Story = {
  args: {
    activeVersions: mockNoneActive,
    isLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Loading state with skeleton placeholders.',
      },
    },
  },
};
