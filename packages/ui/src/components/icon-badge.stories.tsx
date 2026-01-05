import type { Meta, StoryObj } from '@storybook/react';
import { IconBadge } from './icon-badge';

const meta: Meta<typeof IconBadge> = {
  title: 'Components/IconBadge',
  component: IconBadge,
  tags: ['autodocs'],
  argTypes: {
    icon: { control: 'text' },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'success', 'warning', 'destructive', 'info', 'muted'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    shape: {
      control: 'select',
      options: ['rounded', 'circle', 'square'],
    },
    label: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof IconBadge>;

// Default
export const Default: Story = {
  args: {
    icon: 'star',
  },
};

// All Variants
export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" variant="primary" />
        <span className="text-xs text-muted-foreground">Primary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="settings" variant="secondary" />
        <span className="text-xs text-muted-foreground">Secondary</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="check_circle" variant="success" />
        <span className="text-xs text-muted-foreground">Success</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="warning" variant="warning" />
        <span className="text-xs text-muted-foreground">Warning</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="error" variant="destructive" />
        <span className="text-xs text-muted-foreground">Destructive</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="info" variant="info" />
        <span className="text-xs text-muted-foreground">Info</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="more_horiz" variant="muted" />
        <span className="text-xs text-muted-foreground">Muted</span>
      </div>
    </div>
  ),
};

// All Sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" size="xs" />
        <span className="text-xs text-muted-foreground">XS</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" size="sm" />
        <span className="text-xs text-muted-foreground">SM</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" size="md" />
        <span className="text-xs text-muted-foreground">MD</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" size="lg" />
        <span className="text-xs text-muted-foreground">LG</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" size="xl" />
        <span className="text-xs text-muted-foreground">XL</span>
      </div>
    </div>
  ),
};

// All Shapes
export const Shapes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" shape="rounded" />
        <span className="text-xs text-muted-foreground">Rounded</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" shape="circle" />
        <span className="text-xs text-muted-foreground">Circle</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconBadge icon="star" shape="square" />
        <span className="text-xs text-muted-foreground">Square</span>
      </div>
    </div>
  ),
};

// Common Use Cases
export const CommonUseCases: Story = {
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
        <IconBadge icon="group" variant="primary" />
        <div>
          <p className="text-sm font-medium">Leads</p>
          <p className="text-xs text-muted-foreground">1,234</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
        <IconBadge icon="handshake" variant="success" />
        <div>
          <p className="text-sm font-medium">Deals</p>
          <p className="text-xs text-muted-foreground">42</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
        <IconBadge icon="confirmation_number" variant="warning" />
        <div>
          <p className="text-sm font-medium">Tickets</p>
          <p className="text-xs text-muted-foreground">8 open</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 border border-border rounded-lg">
        <IconBadge icon="payments" variant="info" />
        <div>
          <p className="text-sm font-medium">Revenue</p>
          <p className="text-xs text-muted-foreground">$125K</p>
        </div>
      </div>
    </div>
  ),
};

// Feature Icons
export const FeatureIcons: Story = {
  render: () => (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-6">
      {[
        { icon: 'speed', label: 'Performance' },
        { icon: 'security', label: 'Security' },
        { icon: 'cloud', label: 'Cloud' },
        { icon: 'analytics', label: 'Analytics' },
        { icon: 'support', label: 'Support' },
        { icon: 'inventory_2', label: 'Inventory' },
        { icon: 'campaign', label: 'Marketing' },
        { icon: 'account_balance', label: 'Finance' },
        { icon: 'psychology', label: 'AI' },
        { icon: 'hub', label: 'Integration' },
      ].map(({ icon, label }) => (
        <div key={icon} className="flex flex-col items-center gap-2">
          <IconBadge icon={icon} size="lg" shape="circle" variant="muted" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  ),
};

// Status Icons
export const StatusIcons: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <IconBadge icon="check_circle" variant="success" shape="circle" label="Success" />
      <IconBadge icon="warning" variant="warning" shape="circle" label="Warning" />
      <IconBadge icon="error" variant="destructive" shape="circle" label="Error" />
      <IconBadge icon="info" variant="info" shape="circle" label="Info" />
      <IconBadge icon="hourglass_empty" variant="muted" shape="circle" label="Pending" />
    </div>
  ),
};

// In List Context
export const InListContext: Story = {
  render: () => (
    <div className="max-w-md space-y-2">
      {[
        { icon: 'person', name: 'John Doe', role: 'Sales Manager', variant: 'primary' as const },
        { icon: 'business', name: 'Acme Corp', role: 'Enterprise Client', variant: 'info' as const },
        { icon: 'task_alt', name: 'Follow-up Call', role: 'Due Today', variant: 'warning' as const },
        { icon: 'paid', name: 'Invoice #1234', role: 'Paid', variant: 'success' as const },
      ].map((item) => (
        <div
          key={item.name}
          className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <IconBadge icon={item.icon} variant={item.variant} size="sm" />
          <div className="flex-1">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">{item.role}</p>
          </div>
          <span className="material-symbols-outlined text-muted-foreground">chevron_right</span>
        </div>
      ))}
    </div>
  ),
};

// Combined with Text
export const CombinedWithText: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconBadge icon="rocket_launch" variant="primary" size="lg" />
      <div>
        <h3 className="font-semibold">Get Started</h3>
        <p className="text-sm text-muted-foreground">
          Launch your first campaign in minutes
        </p>
      </div>
    </div>
  ),
};

// Navigation Icons
export const NavigationIcons: Story = {
  render: () => (
    <div className="flex gap-2">
      {[
        { icon: 'dashboard', active: true },
        { icon: 'group', active: false },
        { icon: 'handshake', active: false },
        { icon: 'confirmation_number', active: false },
        { icon: 'settings', active: false },
      ].map(({ icon, active }) => (
        <IconBadge
          key={icon}
          icon={icon}
          variant={active ? 'primary' : 'muted'}
          size="sm"
          shape="rounded"
        />
      ))}
    </div>
  ),
};
