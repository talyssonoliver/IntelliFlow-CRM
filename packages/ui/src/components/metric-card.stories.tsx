import type { Meta, StoryObj } from '@storybook/react';
import { MetricCard } from './metric-card';

const meta: Meta<typeof MetricCard> = {
  title: 'Components/MetricCard',
  component: MetricCard,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    value: { control: 'text' },
    format: {
      control: 'select',
      options: ['number', 'currency', 'percentage', 'compact'],
    },
    icon: { control: 'text' },
    isLoading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

// Default
export const Default: Story = {
  args: {
    title: 'Total Leads',
    value: 1240,
    icon: 'group',
  },
};

// With Change Indicator
export const WithPositiveChange: Story = {
  args: {
    title: 'Total Leads',
    value: 1240,
    icon: 'group',
    change: { value: 12, direction: 'up', label: 'vs last month' },
  },
};

export const WithNegativeChange: Story = {
  args: {
    title: 'Bounce Rate',
    value: 35,
    format: 'percentage',
    icon: 'trending_down',
    iconBgClass: 'bg-red-100 dark:bg-red-900',
    iconColorClass: 'text-red-600 dark:text-red-400',
    change: { value: 8, direction: 'down', label: 'vs last month' },
  },
};

// Format Examples
export const CurrencyFormat: Story = {
  args: {
    title: 'Revenue',
    value: 125000,
    format: 'currency',
    icon: 'payments',
    iconBgClass: 'bg-green-100 dark:bg-green-900',
    iconColorClass: 'text-green-600 dark:text-green-400',
    change: { value: 15, direction: 'up' },
  },
};

export const PercentageFormat: Story = {
  args: {
    title: 'Conversion Rate',
    value: 45,
    format: 'percentage',
    icon: 'conversion_path',
    change: { value: 5, direction: 'up' },
  },
};

export const CompactFormat: Story = {
  args: {
    title: 'Total Users',
    value: 1500000,
    format: 'compact',
    icon: 'people',
  },
};

// Loading State
export const Loading: Story = {
  args: {
    title: 'Total Leads',
    value: 0,
    isLoading: true,
  },
};

// Dashboard Grid
export const DashboardGrid: Story = {
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Total Leads"
        value={1240}
        icon="group"
        change={{ value: 12, direction: 'up', label: 'vs last month' }}
      />
      <MetricCard
        title="Active Deals"
        value={42}
        icon="handshake"
        iconBgClass="bg-blue-100 dark:bg-blue-900"
        iconColorClass="text-blue-600 dark:text-blue-400"
        change={{ value: 8, direction: 'up' }}
      />
      <MetricCard
        title="Revenue"
        value={125000}
        format="currency"
        icon="payments"
        iconBgClass="bg-green-100 dark:bg-green-900"
        iconColorClass="text-green-600 dark:text-green-400"
        change={{ value: 15, direction: 'up' }}
      />
      <MetricCard
        title="Open Tickets"
        value={8}
        icon="confirmation_number"
        iconBgClass="bg-amber-100 dark:bg-amber-900"
        iconColorClass="text-amber-600 dark:text-amber-400"
        change={{ value: 3, direction: 'down' }}
      />
    </div>
  ),
};

// All Loading
export const AllLoading: Story = {
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard title="" value={0} isLoading />
      <MetricCard title="" value={0} isLoading />
      <MetricCard title="" value={0} isLoading />
      <MetricCard title="" value={0} isLoading />
    </div>
  ),
};

// Without Icon
export const WithoutIcon: Story = {
  args: {
    title: 'Sessions',
    value: 3542,
    change: { value: 22, direction: 'up' },
  },
};

// With Description
export const WithDescription: Story = {
  args: {
    title: 'Active Users',
    value: 892,
    icon: 'people',
    description: 'Users active in the last 7 days',
  },
};

// Custom Colors
export const CustomColors: Story = {
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Primary"
        value={100}
        icon="star"
        iconBgClass="bg-primary/10"
        iconColorClass="text-primary"
      />
      <MetricCard
        title="Success"
        value={200}
        icon="check_circle"
        iconBgClass="bg-green-100 dark:bg-green-900"
        iconColorClass="text-green-600 dark:text-green-400"
      />
      <MetricCard
        title="Warning"
        value={300}
        icon="warning"
        iconBgClass="bg-amber-100 dark:bg-amber-900"
        iconColorClass="text-amber-600 dark:text-amber-400"
      />
      <MetricCard
        title="Error"
        value={400}
        icon="error"
        iconBgClass="bg-red-100 dark:bg-red-900"
        iconColorClass="text-red-600 dark:text-red-400"
      />
    </div>
  ),
};

// Change Directions
export const ChangeDirections: Story = {
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard
        title="Increasing"
        value={1500}
        icon="trending_up"
        iconBgClass="bg-green-100 dark:bg-green-900"
        iconColorClass="text-green-600 dark:text-green-400"
        change={{ value: 25, direction: 'up' }}
      />
      <MetricCard
        title="Stable"
        value={1200}
        icon="trending_flat"
        change={{ value: 0, direction: 'neutral' }}
      />
      <MetricCard
        title="Decreasing"
        value={800}
        icon="trending_down"
        iconBgClass="bg-red-100 dark:bg-red-900"
        iconColorClass="text-red-600 dark:text-red-400"
        change={{ value: 15, direction: 'down' }}
      />
    </div>
  ),
};
