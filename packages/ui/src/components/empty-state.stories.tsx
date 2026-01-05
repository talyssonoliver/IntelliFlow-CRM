import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './empty-state';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    icon: { control: 'text' },
    title: { control: 'text' },
    description: { control: 'text' },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    iconColorClass: { control: 'text' },
    iconBgClass: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

// Default
export const Default: Story = {
  args: {
    title: 'No items found',
    description: 'There are no items to display at the moment.',
  },
};

// With Action
export const WithAction: Story = {
  args: {
    icon: 'person_add',
    title: 'No contacts yet',
    description: 'Start building your network by adding your first contact.',
    action: {
      label: 'Add Contact',
      icon: 'add',
      onClick: () => alert('Add contact clicked'),
    },
  },
};

// With Link Action
export const WithLinkAction: Story = {
  args: {
    icon: 'folder_open',
    title: 'No documents',
    description: 'Your document library is empty.',
    action: {
      label: 'Upload Document',
      icon: 'upload',
      href: '/documents/upload',
    },
  },
};

// With Two Actions
export const WithTwoActions: Story = {
  args: {
    icon: 'group',
    title: 'No leads found',
    description: 'Get started by creating your first lead or importing from a file.',
    action: {
      label: 'Create Lead',
      icon: 'add',
      onClick: () => alert('Create clicked'),
    },
    secondaryAction: {
      label: 'Import CSV',
      icon: 'upload_file',
      onClick: () => alert('Import clicked'),
    },
  },
};

// Sizes
export const Sizes: Story = {
  render: () => (
    <div className="space-y-8">
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="inbox"
          title="Small Size"
          description="Compact empty state for constrained spaces."
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="md"
          icon="inbox"
          title="Medium Size (Default)"
          description="Standard empty state for most use cases."
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="lg"
          icon="inbox"
          title="Large Size"
          description="Prominent empty state for full-page contexts."
        />
      </div>
    </div>
  ),
};

// Search Results Empty
export const SearchResultsEmpty: Story = {
  args: {
    icon: 'search_off',
    title: 'No results found',
    description: 'Try adjusting your search terms or filters.',
    action: {
      label: 'Clear Filters',
      onClick: () => alert('Filters cleared'),
    },
  },
};

// Error State (Can be used as error fallback)
export const ErrorFallback: Story = {
  args: {
    icon: 'error_outline',
    title: 'Something went wrong',
    description: 'We encountered an error loading this content. Please try again.',
    iconColorClass: 'text-destructive',
    iconBgClass: 'bg-destructive/10',
    action: {
      label: 'Retry',
      icon: 'refresh',
      onClick: () => alert('Retry clicked'),
    },
  },
};

// Different Icons
export const DifferentIcons: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="mail"
          title="No emails"
          description="Your inbox is empty."
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="event"
          title="No events"
          description="No upcoming events."
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="notifications_off"
          title="No notifications"
          description="You're all caught up!"
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="shopping_cart"
          title="Cart is empty"
          description="Add items to get started."
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="chat_bubble_outline"
          title="No messages"
          description="Start a conversation."
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          size="sm"
          icon="history"
          title="No history"
          description="Your activity will appear here."
        />
      </div>
    </div>
  ),
};

// Custom Colors
export const CustomColors: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="border border-border rounded-lg">
        <EmptyState
          icon="check_circle"
          title="All tasks complete"
          description="Great job! You've finished everything."
          iconColorClass="text-green-600 dark:text-green-400"
          iconBgClass="bg-green-100 dark:bg-green-900"
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          icon="warning"
          title="Attention needed"
          description="Some items require your review."
          iconColorClass="text-amber-600 dark:text-amber-400"
          iconBgClass="bg-amber-100 dark:bg-amber-900"
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          icon="info"
          title="Getting started"
          description="Here's how to begin using this feature."
          iconColorClass="text-blue-600 dark:text-blue-400"
          iconBgClass="bg-blue-100 dark:bg-blue-900"
        />
      </div>
      <div className="border border-border rounded-lg">
        <EmptyState
          icon="star"
          title="No favorites"
          description="Star items to save them here."
          iconColorClass="text-primary"
          iconBgClass="bg-primary/10"
        />
      </div>
    </div>
  ),
};

// In Card Context
export const InCardContext: Story = {
  render: () => (
    <div className="max-w-md p-4 border border-border rounded-lg bg-card">
      <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
      <EmptyState
        size="sm"
        icon="history"
        title="No activity yet"
        description="Your recent actions will appear here."
      />
    </div>
  ),
};

// Full Page Empty State
export const FullPageContext: Story = {
  render: () => (
    <div className="min-h-[400px] flex items-center justify-center border border-dashed border-border rounded-lg bg-muted/20">
      <EmptyState
        size="lg"
        icon="folder_open"
        title="No projects yet"
        description="Create your first project to start organizing your work and collaborating with your team."
        action={{
          label: 'Create Project',
          icon: 'add',
          onClick: () => alert('Create project clicked'),
        }}
        secondaryAction={{
          label: 'Learn More',
          href: '/docs/projects',
        }}
      />
    </div>
  ),
};

// Minimal (Title Only)
export const Minimal: Story = {
  args: {
    icon: 'inbox',
    title: 'Nothing here',
  },
};
