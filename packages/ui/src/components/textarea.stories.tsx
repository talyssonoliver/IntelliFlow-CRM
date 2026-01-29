import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './textarea';
import { Label } from './label';

const meta: Meta<typeof Textarea> = {
  title: 'Components/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: 'Type your message here.',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea placeholder="Type your message here." id="message" />
    </div>
  ),
};

export const WithHelpText: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="message-with-help">Your message</Label>
      <Textarea placeholder="Type your message here." id="message-with-help" />
      <p className="text-sm text-muted-foreground">
        Your message will be copied to the support team.
      </p>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled textarea',
    disabled: true,
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: 'This is some pre-filled text in the textarea. You can edit it.',
  },
};

export const CustomRows: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="grid w-full gap-1.5">
        <Label>Small (2 rows)</Label>
        <Textarea rows={2} placeholder="Small textarea" />
      </div>
      <div className="grid w-full gap-1.5">
        <Label>Default (3 rows)</Label>
        <Textarea rows={3} placeholder="Default textarea" />
      </div>
      <div className="grid w-full gap-1.5">
        <Label>Large (6 rows)</Label>
        <Textarea rows={6} placeholder="Large textarea" />
      </div>
    </div>
  ),
};
