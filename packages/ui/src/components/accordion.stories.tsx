import type { Meta, StoryObj } from '@storybook/react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

const meta: Meta<typeof Accordion> = {
  title: 'Components/Accordion',
  component: Accordion,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Accordion>;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>
          Yes. It adheres to the WAI-ARIA design pattern.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that match the other components.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It's animated by default, but you can disable it if you prefer.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>Section 1</AccordionTrigger>
        <AccordionContent>
          Content for section 1. You can open multiple sections at once.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Section 2</AccordionTrigger>
        <AccordionContent>
          Content for section 2. Try opening this while section 1 is open.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Section 3</AccordionTrigger>
        <AccordionContent>
          Content for section 3. All sections can be open simultaneously.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const DefaultOpen: Story = {
  render: () => (
    <Accordion type="single" collapsible defaultValue="item-2" className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>First Item</AccordionTrigger>
        <AccordionContent>
          This is closed by default.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Second Item (Default Open)</AccordionTrigger>
        <AccordionContent>
          This is open by default.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>Active Item</AccordionTrigger>
        <AccordionContent>
          This item can be expanded.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" disabled>
        <AccordionTrigger>Disabled Item</AccordionTrigger>
        <AccordionContent>
          You should not be able to see this.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const FAQ: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1">
          <AccordionTrigger>What payment methods do you accept?</AccordionTrigger>
          <AccordionContent>
            We accept all major credit cards (Visa, MasterCard, American Express),
            PayPal, and bank transfers for enterprise customers.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>How do I cancel my subscription?</AccordionTrigger>
          <AccordionContent>
            You can cancel your subscription at any time from your account settings.
            Navigate to Settings &gt; Billing &gt; Cancel Subscription.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-3">
          <AccordionTrigger>Do you offer a free trial?</AccordionTrigger>
          <AccordionContent>
            Yes! We offer a 14-day free trial with full access to all features.
            No credit card required to start.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-4">
          <AccordionTrigger>How can I contact support?</AccordionTrigger>
          <AccordionContent>
            You can reach our support team via email at support@example.com,
            through the in-app chat, or by calling 1-800-EXAMPLE.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};
