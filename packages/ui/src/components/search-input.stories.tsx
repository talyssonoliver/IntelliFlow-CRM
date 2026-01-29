import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SearchInput } from './search-input';
import { Label } from './label';

const meta: Meta<typeof SearchInput> = {
  title: 'Components/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  argTypes: {
    icon: {
      control: 'text',
      description: 'Material Symbols icon name',
    },
    showClear: {
      control: 'boolean',
      description: 'Show clear button when input has value',
    },
    isLoading: {
      control: 'boolean',
      description: 'Loading state',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = {
  args: {
    placeholder: 'Search...',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="search">Search leads</Label>
      <SearchInput id="search" placeholder="Search by name, email, or company..." />
    </div>
  ),
};

export const WithClearButton: Story = {
  render: function Render() {
    const [value, setValue] = useState('John Doe');
    return (
      <div className="w-full max-w-sm">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
          showClear
          placeholder="Search contacts..."
        />
      </div>
    );
  },
};

export const Loading: Story = {
  args: {
    placeholder: 'Searching...',
    isLoading: true,
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Search disabled',
    disabled: true,
  },
};

export const CustomIcon: Story = {
  args: {
    placeholder: 'Filter results...',
    icon: 'filter_list',
  },
};

export const LeadsSearch: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="w-full max-w-md">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
          showClear
          placeholder="Search leads by name, email, or company..."
          aria-label="Search leads"
        />
      </div>
    );
  },
};

export const ContactsSearch: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="w-full max-w-md">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
          showClear
          placeholder="Search contacts..."
          aria-label="Search contacts"
        />
      </div>
    );
  },
};

export const DocumentsSearch: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="w-full max-w-md">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
          showClear
          placeholder="Search documents..."
          icon="description"
          aria-label="Search documents"
        />
      </div>
    );
  },
};

export const FullWidth: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="w-full">
        <SearchInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue('')}
          showClear
          placeholder="Global search..."
          containerClassName="max-w-none"
        />
      </div>
    );
  },
};
