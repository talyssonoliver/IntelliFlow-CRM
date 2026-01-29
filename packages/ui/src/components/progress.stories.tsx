import type { Meta, StoryObj } from '@storybook/react';
import { Progress } from './progress';

const meta: Meta<typeof Progress> = {
  title: 'Components/Progress',
  component: Progress,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: {
    value: 60,
  },
};

export const Empty: Story = {
  args: {
    value: 0,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
  },
};

export const ProgressValues: Story = {
  render: () => (
    <div className="space-y-4 w-[400px]">
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>0%</span>
        </div>
        <Progress value={0} />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>25%</span>
        </div>
        <Progress value={25} />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>75%</span>
        </div>
        <Progress value={75} />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="w-[400px]">
      <div className="flex justify-between text-sm mb-2">
        <span>Uploading...</span>
        <span>60%</span>
      </div>
      <Progress value={60} />
    </div>
  ),
};

export const CustomHeight: Story = {
  render: () => (
    <div className="space-y-4 w-[400px]">
      <div>
        <span className="text-sm mb-1">Thin</span>
        <Progress value={40} className="h-1" />
      </div>
      <div>
        <span className="text-sm mb-1">Default</span>
        <Progress value={40} />
      </div>
      <div>
        <span className="text-sm mb-1">Thick</span>
        <Progress value={40} className="h-6" />
      </div>
    </div>
  ),
};
