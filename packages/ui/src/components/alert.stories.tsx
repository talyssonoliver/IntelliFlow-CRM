import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

// Material Symbol icon component for stories
const MaterialIcon = ({ name, className }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className || ''}`} aria-hidden="true">
    {name}
  </span>
);

const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'success', 'warning'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert>
      <MaterialIcon name="info" className="text-base" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <MaterialIcon name="error" className="text-base" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please log in again.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert variant="success">
      <MaterialIcon name="check_circle" className="text-base" />
      <AlertTitle>Success!</AlertTitle>
      <AlertDescription>
        Your changes have been saved successfully.
      </AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  render: () => (
    <Alert variant="warning">
      <MaterialIcon name="warning" className="text-base" />
      <AlertTitle>Warning</AlertTitle>
      <AlertDescription>
        Your subscription is about to expire.
      </AlertDescription>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Note</AlertTitle>
    </Alert>
  ),
};

export const DescriptionOnly: Story = {
  render: () => (
    <Alert>
      <AlertDescription>
        This is a simple alert with only a description.
      </AlertDescription>
    </Alert>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <Alert>
        <MaterialIcon name="info" className="text-base" />
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is an informational alert.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <MaterialIcon name="error" className="text-base" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>This is an error alert.</AlertDescription>
      </Alert>
      <Alert variant="success">
        <MaterialIcon name="check_circle" className="text-base" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>This is a success alert.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <MaterialIcon name="warning" className="text-base" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>This is a warning alert.</AlertDescription>
      </Alert>
    </div>
  ),
};
