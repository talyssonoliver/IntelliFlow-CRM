import type { Meta, StoryObj } from '@storybook/react';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Label } from './label';

const meta: Meta<typeof RadioGroup> = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="option-one" />
        <Label htmlFor="option-one">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="option-two" />
        <Label htmlFor="option-two">Option Two</Label>
      </div>
    </RadioGroup>
  ),
};

export const Vertical: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="default" id="r1" />
        <Label htmlFor="r1">Default</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="comfortable" id="r2" />
        <Label htmlFor="r2">Comfortable</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="compact" id="r3" />
        <Label htmlFor="r3">Compact</Label>
      </div>
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="card" className="flex space-x-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="card" id="card" />
        <Label htmlFor="card">Card</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="paypal" id="paypal" />
        <Label htmlFor="paypal">PayPal</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="apple" id="apple" />
        <Label htmlFor="apple">Apple Pay</Label>
      </div>
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup disabled defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="d1" />
        <Label htmlFor="d1">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="d2" />
        <Label htmlFor="d2">Option Two</Label>
      </div>
    </RadioGroup>
  ),
};

export const DisabledItem: Story = {
  render: () => (
    <RadioGroup defaultValue="small">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="small" id="small" />
        <Label htmlFor="small">Small</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="medium" id="medium" />
        <Label htmlFor="medium">Medium</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="large" id="large" disabled />
        <Label htmlFor="large" className="text-muted-foreground">
          Large (Out of stock)
        </Label>
      </div>
    </RadioGroup>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <RadioGroup defaultValue="startup" className="space-y-4">
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="startup" id="startup" className="mt-1" />
        <div>
          <Label htmlFor="startup" className="font-medium">
            Startup
          </Label>
          <p className="text-sm text-muted-foreground">
            Perfect for small teams getting started.
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="business" id="business" className="mt-1" />
        <div>
          <Label htmlFor="business" className="font-medium">
            Business
          </Label>
          <p className="text-sm text-muted-foreground">
            For growing companies with advanced needs.
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="enterprise" id="enterprise" className="mt-1" />
        <div>
          <Label htmlFor="enterprise" className="font-medium">
            Enterprise
          </Label>
          <p className="text-sm text-muted-foreground">
            Unlimited features for large organizations.
          </p>
        </div>
      </div>
    </RadioGroup>
  ),
};
