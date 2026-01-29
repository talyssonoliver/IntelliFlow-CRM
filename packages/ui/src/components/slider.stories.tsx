import type { Meta, StoryObj } from '@storybook/react';
import { Slider } from './slider';
import { Label } from './label';

const meta: Meta<typeof Slider> = {
  title: 'Components/Slider',
  component: Slider,
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  render: () => <Slider defaultValue={[50]} max={100} step={1} className="w-[60%]" />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-4 w-[60%]">
      <div className="flex justify-between">
        <Label>Volume</Label>
        <span className="text-sm text-muted-foreground">50%</span>
      </div>
      <Slider defaultValue={[50]} max={100} step={1} />
    </div>
  ),
};

export const Range: Story = {
  render: () => (
    <div className="space-y-2 w-[60%]">
      <Label>Price Range</Label>
      <Slider defaultValue={[25, 75]} max={100} step={1} />
    </div>
  ),
};

export const Steps: Story = {
  render: () => (
    <div className="space-y-4 w-[60%]">
      <div className="space-y-2">
        <Label>Step: 1 (default)</Label>
        <Slider defaultValue={[50]} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <Label>Step: 10</Label>
        <Slider defaultValue={[50]} max={100} step={10} />
      </div>
      <div className="space-y-2">
        <Label>Step: 25</Label>
        <Slider defaultValue={[50]} max={100} step={25} />
      </div>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Slider defaultValue={[50]} max={100} step={1} disabled className="w-[60%]" />
  ),
};

export const CustomRange: Story = {
  render: () => (
    <div className="space-y-4 w-[60%]">
      <div className="space-y-2">
        <Label>Temperature (0-40C)</Label>
        <Slider defaultValue={[20]} min={0} max={40} step={1} />
      </div>
      <div className="space-y-2">
        <Label>Year (2000-2024)</Label>
        <Slider defaultValue={[2015]} min={2000} max={2024} step={1} />
      </div>
    </div>
  ),
};
