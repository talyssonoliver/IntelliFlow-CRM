import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'Components/Separator',
  component: Separator,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Radix Primitives</h4>
        <p className="text-sm text-muted-foreground">
          An open-source UI component library.
        </p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" />
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <div>Blog</div>
      <Separator orientation="vertical" />
      <div>Docs</div>
      <Separator orientation="vertical" />
      <div>Source</div>
    </div>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="w-[300px] rounded-lg border p-4">
      <div className="font-medium">My Account</div>
      <Separator className="my-4" />
      <div className="space-y-4">
        <div className="text-sm">Settings</div>
        <div className="text-sm">Notifications</div>
        <div className="text-sm">Privacy</div>
      </div>
      <Separator className="my-4" />
      <div className="text-sm text-muted-foreground">Logout</div>
    </div>
  ),
};

export const Styled: Story = {
  render: () => (
    <div className="space-y-4">
      <Separator className="bg-red-500" />
      <Separator className="bg-blue-500" />
      <Separator className="bg-green-500" />
      <Separator className="h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
    </div>
  ),
};
