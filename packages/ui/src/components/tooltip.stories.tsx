import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { Button } from './button';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Add to library</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Positions: Story = {
  render: () => (
    <div className="flex items-center justify-center gap-4 py-20">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Top</Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Tooltip on top</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Right</Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Tooltip on right</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Tooltip on bottom</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Left</Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Tooltip on left</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const WithCustomContent: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Advanced</Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-center">
          <p className="font-bold">Advanced Settings</p>
          <p className="text-xs text-muted-foreground">Click to configure</p>
        </div>
      </TooltipContent>
    </Tooltip>
  ),
};

export const DelayedOpen: Story = {
  render: () => (
    <Tooltip delayDuration={700}>
      <TooltipTrigger asChild>
        <Button variant="outline">Slow tooltip</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This takes 700ms to appear</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const OnIcon: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon">
          ?
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Need help?</p>
      </TooltipContent>
    </Tooltip>
  ),
};
