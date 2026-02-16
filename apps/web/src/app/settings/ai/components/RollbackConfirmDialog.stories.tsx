import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button } from '@intelliflow/ui';
import { RollbackConfirmDialog } from './RollbackConfirmDialog';
import type { ChainVersionSummary } from '@intelliflow/validators';

const mockVersion: ChainVersionSummary = {
  id: 'v1-uuid-1234-5678-9abc',
  chainType: 'SCORING',
  status: 'DEPRECATED',
  model: 'gpt-4',
  description: 'Lead scoring chain',
  rolloutStrategy: 'IMMEDIATE',
  rolloutPercent: null,
  createdAt: new Date('2025-01-01'),
  createdBy: 'admin@intelliflow.com',
};

const meta: Meta<typeof RollbackConfirmDialog> = {
  title: 'Settings/AI/RollbackConfirmDialog',
  component: RollbackConfirmDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Confirmation dialog for rolling back to a previous chain version. Requires a reason to be provided.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof RollbackConfirmDialog>;

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    targetVersion: mockVersion,
    onConfirm: async () => {},
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Default dialog state with empty reason field.',
      },
    },
  },
};

export const Loading: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    targetVersion: mockVersion,
    onConfirm: async () => {},
    isLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Loading state while rollback is being processed.',
      },
    },
  },
};

export const Interactive: Story = {
  render: function InteractiveRollback() {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async (reason: string) => {
      setIsLoading(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsLoading(false);
      setOpen(false);
      console.log('Rollback confirmed with reason:', reason);
    };

    return (
      <div>
        <Button onClick={() => setOpen(true)}>Open Rollback Dialog</Button>
        <RollbackConfirmDialog
          open={open}
          onOpenChange={setOpen}
          targetVersion={mockVersion}
          onConfirm={handleConfirm}
          isLoading={isLoading}
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive example with button to open dialog.',
      },
    },
  },
};

export const DifferentChainTypes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <RollbackConfirmDialog
        open={true}
        onOpenChange={() => {}}
        targetVersion={{ ...mockVersion, chainType: 'SCORING' }}
        onConfirm={async () => {}}
        isLoading={false}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Dialog showing different chain types.',
      },
    },
  },
};
