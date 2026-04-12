import type { Meta, StoryObj } from '@storybook/react';
import { ChainVersionCard } from './ChainVersionCard';

const baseArgs = {
  id: 'v1-active-uuid-1234',
  chainType: 'SCORING' as const,
  status: 'ACTIVE' as const,
  model: 'gpt-4',
  description: 'Lead scoring chain',
  createdAt: new Date('2025-01-01'),
  createdBy: 'admin@intelliflow.com',
  isLoading: false,
};

const meta: Meta<typeof ChainVersionCard> = {
  title: 'Settings/AI/ChainVersionCard',
  component: ChainVersionCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Card component displaying chain version information with status badge and actions.',
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
  argTypes: {
    onSelect: { action: 'onSelect' },
    onActivate: { action: 'onActivate' },
    onDeprecate: { action: 'onDeprecate' },
    onArchive: { action: 'onArchive' },
    onEdit: { action: 'onEdit' },
  },
};

export default meta;
type Story = StoryObj<typeof ChainVersionCard>;

export const Active: Story = {
  args: {
    ...baseArgs,
    status: 'ACTIVE',
  },
  parameters: {
    docs: {
      description: {
        story: 'Active version with green status badge.',
      },
    },
  },
};

export const Draft: Story = {
  args: {
    ...baseArgs,
    id: 'v2-draft-uuid-5678',
    chainType: 'QUALIFICATION',
    status: 'DRAFT',
    model: 'gpt-4-turbo',
    description: 'Lead qualification chain',
    createdBy: 'developer@intelliflow.com',
  },
  parameters: {
    docs: {
      description: {
        story: 'Draft version pending activation.',
      },
    },
  },
};

export const Deprecated: Story = {
  args: {
    ...baseArgs,
    id: 'v3-deprecated-uuid-9abc',
    chainType: 'EMAIL_WRITER',
    status: 'DEPRECATED',
    model: 'gpt-3.5-turbo',
    description: 'Email writer chain',
    createdAt: new Date('2024-12-01'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Deprecated version that was previously active.',
      },
    },
  },
};

export const Archived: Story = {
  args: {
    ...baseArgs,
    id: 'v4-archived-uuid-def0',
    chainType: 'FOLLOWUP',
    status: 'ARCHIVED',
    model: 'gpt-3.5-turbo',
    description: 'Follow-up chain',
    createdAt: new Date('2024-11-01'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Archived version hidden from normal views.',
      },
    },
  },
};

export const WithActions: Story = {
  args: {
    ...baseArgs,
    status: 'DRAFT',
    onActivate: () => console.log('Activate clicked'),
    onEdit: () => console.log('Edit clicked'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Draft version with available actions.',
      },
    },
  },
};

export const Selected: Story = {
  args: {
    ...baseArgs,
    isSelected: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Selected version with ring highlight.',
      },
    },
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ChainVersionCard {...baseArgs} status="ACTIVE" onSelect={() => {}} />
      <ChainVersionCard
        {...baseArgs}
        id="v2-draft"
        chainType="QUALIFICATION"
        status="DRAFT"
        model="gpt-4-turbo"
        createdBy="developer@intelliflow.com"
        onSelect={() => {}}
        onActivate={() => {}}
        onEdit={() => {}}
      />
      <ChainVersionCard
        {...baseArgs}
        id="v3-deprecated"
        chainType="EMAIL_WRITER"
        status="DEPRECATED"
        model="gpt-3.5-turbo"
        onSelect={() => {}}
        onDeprecate={() => {}}
      />
      <ChainVersionCard
        {...baseArgs}
        id="v4-archived"
        chainType="FOLLOWUP"
        status="ARCHIVED"
        model="gpt-3.5-turbo"
        onSelect={() => {}}
        onArchive={() => {}}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All version statuses displayed together.',
      },
    },
  },
};
