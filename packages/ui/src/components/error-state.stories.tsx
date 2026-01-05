import type { Meta, StoryObj } from '@storybook/react';
import { ErrorState } from './error-state';

const meta: Meta<typeof ErrorState> = {
  title: 'Components/ErrorState',
  component: ErrorState,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    message: { control: 'text' },
    retryLabel: { control: 'text' },
    variant: {
      control: 'select',
      options: ['error', 'warning', 'info'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    icon: { control: 'text' },
    details: { control: 'text' },
    showDetails: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorState>;

// Default
export const Default: Story = {
  args: {
    message: 'We encountered an unexpected error. Please try again.',
    onRetry: () => console.log('Retry clicked'),
  },
};

// Custom Title
export const CustomTitle: Story = {
  args: {
    title: 'Connection Failed',
    message: 'Unable to connect to the server. Please check your internet connection.',
    onRetry: () => console.log('Retry clicked'),
  },
};

// Variants
export const Variants: Story = {
  render: () => (
    <div className="space-y-4">
      <ErrorState
        variant="error"
        title="Error"
        message="An error occurred while processing your request."
        onRetry={() => console.log('Retry')}
      />
      <ErrorState
        variant="warning"
        title="Warning"
        message="Some data could not be loaded. Showing partial results."
        onRetry={() => console.log('Retry')}
      />
      <ErrorState
        variant="info"
        title="Information"
        message="This feature is temporarily unavailable for maintenance."
      />
    </div>
  ),
};

// Sizes
export const Sizes: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2">Small</p>
        <ErrorState
          size="sm"
          message="Failed to load data."
          onRetry={() => console.log('Retry')}
        />
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">Medium (default)</p>
        <ErrorState
          size="md"
          message="Failed to load data."
          onRetry={() => console.log('Retry')}
        />
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">Large</p>
        <ErrorState
          size="lg"
          message="Failed to load data."
          onRetry={() => console.log('Retry')}
        />
      </div>
    </div>
  ),
};

// With Details
export const WithDetails: Story = {
  args: {
    title: 'API Error',
    message: 'Failed to fetch user data from the server.',
    details: `Error: NetworkError
Status: 500
Endpoint: /api/users
Timestamp: 2024-01-15T10:30:00Z
Request ID: abc-123-def-456`,
    onRetry: () => console.log('Retry clicked'),
  },
};

// With Details Open
export const WithDetailsOpen: Story = {
  args: {
    title: 'API Error',
    message: 'Failed to fetch user data from the server.',
    details: `Error: NetworkError
Status: 500
Endpoint: /api/users
Timestamp: 2024-01-15T10:30:00Z
Request ID: abc-123-def-456`,
    showDetails: true,
    onRetry: () => console.log('Retry clicked'),
  },
};

// Without Retry
export const WithoutRetry: Story = {
  args: {
    title: 'Access Denied',
    message: 'You do not have permission to view this resource. Contact your administrator.',
    variant: 'error',
  },
};

// Custom Icon
export const CustomIcon: Story = {
  args: {
    icon: 'wifi_off',
    title: 'No Internet Connection',
    message: 'Please check your network settings and try again.',
    onRetry: () => console.log('Retry clicked'),
  },
};

// Network Errors
export const NetworkErrors: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ErrorState
        icon="wifi_off"
        title="Offline"
        message="You appear to be offline."
        onRetry={() => console.log('Retry')}
      />
      <ErrorState
        icon="cloud_off"
        title="Server Unavailable"
        message="The server is not responding."
        onRetry={() => console.log('Retry')}
      />
      <ErrorState
        icon="timer_off"
        title="Request Timeout"
        message="The request took too long."
        onRetry={() => console.log('Retry')}
      />
      <ErrorState
        icon="sync_problem"
        title="Sync Failed"
        message="Unable to sync your data."
        onRetry={() => console.log('Retry')}
      />
    </div>
  ),
};

// Permission Errors
export const PermissionErrors: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ErrorState
        icon="lock"
        title="Unauthorized"
        message="You need to log in to access this."
        variant="warning"
      />
      <ErrorState
        icon="block"
        title="Forbidden"
        message="You don't have access to this resource."
        variant="error"
      />
    </div>
  ),
};

// Custom Retry Label
export const CustomRetryLabel: Story = {
  args: {
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
    retryLabel: 'Log In Again',
    onRetry: () => console.log('Login clicked'),
  },
};

// In Card Context
export const InCardContext: Story = {
  render: () => (
    <div className="max-w-md p-4 border border-border rounded-lg bg-card">
      <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
      <ErrorState
        size="sm"
        message="Failed to load activity feed."
        onRetry={() => console.log('Retry')}
      />
    </div>
  ),
};

// Full Page Error
export const FullPageError: Story = {
  render: () => (
    <div className="min-h-[400px] flex items-center justify-center">
      <ErrorState
        size="lg"
        title="Page Not Found"
        message="The page you're looking for doesn't exist or has been moved."
        icon="search_off"
        variant="info"
      />
    </div>
  ),
};

// Form Submission Error
export const FormSubmissionError: Story = {
  args: {
    size: 'sm',
    title: 'Submission Failed',
    message: 'We couldn\'t save your changes. Please check your input and try again.',
    variant: 'error',
    onRetry: () => console.log('Retry clicked'),
    retryLabel: 'Retry Submission',
  },
};
