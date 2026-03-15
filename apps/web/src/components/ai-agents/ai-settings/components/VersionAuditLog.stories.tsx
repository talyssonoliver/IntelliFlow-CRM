import type { Meta, StoryObj } from '@storybook/react';
import { VersionAuditLog } from './VersionAuditLog';

const mockAuditLog = [
  {
    id: 'audit-1',
    versionId: 'v1-uuid',
    action: 'ACTIVATED' as const,
    previousState: { status: 'DRAFT' },
    newState: { status: 'ACTIVE' },
    performedBy: 'admin@intelliflow.com',
    performedAt: new Date('2025-01-15T14:30:00'),
    reason: 'Production deployment after successful testing',
  },
  {
    id: 'audit-2',
    versionId: 'v1-uuid',
    action: 'CREATED' as const,
    previousState: null,
    newState: { status: 'DRAFT' },
    performedBy: 'developer@intelliflow.com',
    performedAt: new Date('2025-01-14T10:00:00'),
    reason: null,
  },
  {
    id: 'audit-3',
    versionId: 'v0-uuid',
    action: 'DEPRECATED' as const,
    previousState: { status: 'ACTIVE' },
    newState: { status: 'DEPRECATED' },
    performedBy: 'admin@intelliflow.com',
    performedAt: new Date('2025-01-15T14:30:00'),
    reason: 'Replaced by v1.0.0',
  },
  {
    id: 'audit-4',
    versionId: 'v0-uuid',
    action: 'ROLLED_BACK' as const,
    previousState: { status: 'ACTIVE' },
    newState: { status: 'DEPRECATED' },
    performedBy: 'ops@intelliflow.com',
    performedAt: new Date('2025-01-13T09:15:00'),
    reason: 'Performance regression detected in monitoring',
  },
  {
    id: 'audit-5',
    versionId: 'legacy-uuid',
    action: 'ARCHIVED' as const,
    previousState: { status: 'DEPRECATED' },
    newState: { status: 'ARCHIVED' },
    performedBy: 'admin@intelliflow.com',
    performedAt: new Date('2025-01-10T16:00:00'),
    reason: 'No longer needed after migration',
  },
];

const meta: Meta<typeof VersionAuditLog> = {
  title: 'Settings/AI/VersionAuditLog',
  component: VersionAuditLog,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Paginated table showing version audit log entries with action filtering.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof VersionAuditLog>;

export const Default: Story = {
  args: {
    auditLog: mockAuditLog,
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Audit log with various action types.',
      },
    },
  },
};

export const Empty: Story = {
  args: {
    auditLog: [],
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty state when no audit entries exist.',
      },
    },
  },
};

export const Loading: Story = {
  args: {
    auditLog: undefined,
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

export const ManyEntries: Story = {
  args: {
    auditLog: [
      ...mockAuditLog,
      ...mockAuditLog.map((entry, i) => ({
        ...entry,
        id: `${entry.id}-copy-${i}`,
        performedAt: new Date(entry.performedAt.getTime() - i * 86400000),
      })),
    ],
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Many entries showing pagination.',
      },
    },
  },
};
