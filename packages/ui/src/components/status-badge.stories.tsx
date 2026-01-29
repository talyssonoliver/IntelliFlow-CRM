import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './status-badge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'text',
      description: 'The status value',
    },
    type: {
      control: 'select',
      options: ['lead', 'document', 'ticket', 'deal', 'task', 'custom'],
      description: 'Predefined status type for built-in configurations',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Badge size',
    },
    variant: {
      control: 'select',
      options: ['default', 'muted', 'success', 'warning', 'destructive', 'info'],
      description: 'Variant override',
    },
    showIcon: {
      control: 'boolean',
      description: 'Show status icon',
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

// Default story
export const Default: Story = {
  args: {
    status: 'NEW',
    type: 'lead',
  },
};

// Lead Status Stories
export const LeadStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="NEW" type="lead" showIcon />
      <StatusBadge status="CONTACTED" type="lead" showIcon />
      <StatusBadge status="QUALIFIED" type="lead" showIcon />
      <StatusBadge status="UNQUALIFIED" type="lead" showIcon />
      <StatusBadge status="NEGOTIATING" type="lead" showIcon />
      <StatusBadge status="CONVERTED" type="lead" showIcon />
      <StatusBadge status="LOST" type="lead" showIcon />
    </div>
  ),
};

// Document Status Stories
export const DocumentStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="DRAFT" type="document" showIcon />
      <StatusBadge status="UNDER_REVIEW" type="document" showIcon />
      <StatusBadge status="PENDING_APPROVAL" type="document" showIcon />
      <StatusBadge status="APPROVED" type="document" showIcon />
      <StatusBadge status="PENDING_SIGNATURE" type="document" showIcon />
      <StatusBadge status="SIGNED" type="document" showIcon />
      <StatusBadge status="ARCHIVED" type="document" showIcon />
      <StatusBadge status="REJECTED" type="document" showIcon />
    </div>
  ),
};

// Ticket Status Stories
export const TicketStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="OPEN" type="ticket" showIcon />
      <StatusBadge status="IN_PROGRESS" type="ticket" showIcon />
      <StatusBadge status="WAITING_ON_CUSTOMER" type="ticket" showIcon />
      <StatusBadge status="WAITING_ON_THIRD_PARTY" type="ticket" showIcon />
      <StatusBadge status="RESOLVED" type="ticket" showIcon />
      <StatusBadge status="CLOSED" type="ticket" showIcon />
      <StatusBadge status="REOPENED" type="ticket" showIcon />
    </div>
  ),
};

// Deal Status Stories
export const DealStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="QUALIFICATION" type="deal" showIcon />
      <StatusBadge status="NEEDS_ANALYSIS" type="deal" showIcon />
      <StatusBadge status="PROPOSAL" type="deal" showIcon />
      <StatusBadge status="NEGOTIATION" type="deal" showIcon />
      <StatusBadge status="CLOSED_WON" type="deal" showIcon />
      <StatusBadge status="CLOSED_LOST" type="deal" showIcon />
    </div>
  ),
};

// Task Status Stories
export const TaskStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="TODO" type="task" showIcon />
      <StatusBadge status="IN_PROGRESS" type="task" showIcon />
      <StatusBadge status="BLOCKED" type="task" showIcon />
      <StatusBadge status="COMPLETED" type="task" showIcon />
      <StatusBadge status="CANCELLED" type="task" showIcon />
    </div>
  ),
};

// Sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <StatusBadge status="QUALIFIED" type="lead" size="sm" showIcon />
      <StatusBadge status="QUALIFIED" type="lead" size="md" showIcon />
      <StatusBadge status="QUALIFIED" type="lead" size="lg" showIcon />
    </div>
  ),
};

// Variants
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="DEFAULT" variant="default" />
      <StatusBadge status="MUTED" variant="muted" />
      <StatusBadge status="SUCCESS" variant="success" />
      <StatusBadge status="WARNING" variant="warning" />
      <StatusBadge status="DESTRUCTIVE" variant="destructive" />
      <StatusBadge status="INFO" variant="info" />
    </div>
  ),
};

// Without Icons
export const WithoutIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="CONTACTED" type="lead" showIcon={false} />
      <StatusBadge status="QUALIFIED" type="lead" showIcon={false} />
      <StatusBadge status="CONVERTED" type="lead" showIcon={false} />
    </div>
  ),
};

// Custom Configuration
export const CustomConfiguration: Story = {
  render: () => {
    const customConfig = {
      PENDING: { label: 'Pending Review', icon: 'schedule', variant: 'warning' as const },
      ACTIVE: { label: 'Active', icon: 'play_circle', variant: 'success' as const },
      INACTIVE: { label: 'Inactive', icon: 'pause_circle', variant: 'muted' as const },
      CRITICAL: { label: 'Critical', icon: 'error', variant: 'destructive' as const },
    };

    return (
      <div className="flex flex-wrap gap-2">
        <StatusBadge status="PENDING" config={customConfig} showIcon />
        <StatusBadge status="ACTIVE" config={customConfig} showIcon />
        <StatusBadge status="INACTIVE" config={customConfig} showIcon />
        <StatusBadge status="CRITICAL" config={customConfig} showIcon />
      </div>
    );
  },
};

// In a Table Context
export const InTableContext: Story = {
  render: () => (
    <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Priority</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <td className="px-4 py-3 text-sm text-foreground">John Doe</td>
            <td className="px-4 py-3"><StatusBadge status="QUALIFIED" type="lead" showIcon /></td>
            <td className="px-4 py-3"><StatusBadge status="IN_PROGRESS" type="task" showIcon /></td>
          </tr>
          <tr>
            <td className="px-4 py-3 text-sm text-foreground">Jane Smith</td>
            <td className="px-4 py-3"><StatusBadge status="CONVERTED" type="lead" showIcon /></td>
            <td className="px-4 py-3"><StatusBadge status="COMPLETED" type="task" showIcon /></td>
          </tr>
          <tr>
            <td className="px-4 py-3 text-sm text-foreground">Bob Wilson</td>
            <td className="px-4 py-3"><StatusBadge status="CONTACTED" type="lead" showIcon /></td>
            <td className="px-4 py-3"><StatusBadge status="BLOCKED" type="task" showIcon /></td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};
