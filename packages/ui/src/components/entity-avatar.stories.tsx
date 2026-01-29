import type { Meta, StoryObj } from '@storybook/react';
import { EntityAvatar } from './entity-avatar';

const meta: Meta<typeof EntityAvatar> = {
  title: 'Components/EntityAvatar',
  component: EntityAvatar,
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'text',
      description: 'Full name for initials extraction',
    },
    imageUrl: {
      control: 'text',
      description: 'Image URL (optional)',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: 'Avatar size',
    },
    shape: {
      control: 'select',
      options: ['circle', 'rounded'],
      description: 'Avatar shape',
    },
    colorHash: {
      control: 'boolean',
      description: 'Use consistent color hashing',
    },
    maxInitials: {
      control: 'number',
      description: 'Maximum number of initials to show',
    },
  },
};

export default meta;
type Story = StoryObj<typeof EntityAvatar>;

// Default
export const Default: Story = {
  args: {
    name: 'John Doe',
  },
};

// With Image
export const WithImage: Story = {
  args: {
    name: 'John Doe',
    imageUrl: 'https://i.pravatar.cc/150?img=1',
  },
};

// Sizes
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <EntityAvatar name="John Doe" size="xs" />
      <EntityAvatar name="John Doe" size="sm" />
      <EntityAvatar name="John Doe" size="md" />
      <EntityAvatar name="John Doe" size="lg" />
      <EntityAvatar name="John Doe" size="xl" />
    </div>
  ),
};

// Shapes
export const Shapes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar name="John Doe" shape="circle" />
      <EntityAvatar name="John Doe" shape="rounded" />
    </div>
  ),
};

// Color Variations
export const ColorVariations: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <EntityAvatar name="Alice Brown" />
      <EntityAvatar name="Bob Smith" />
      <EntityAvatar name="Carol Davis" />
      <EntityAvatar name="David Wilson" />
      <EntityAvatar name="Emma Johnson" />
      <EntityAvatar name="Frank Miller" />
      <EntityAvatar name="Grace Lee" />
      <EntityAvatar name="Henry Taylor" />
      <EntityAvatar name="Ivy Chen" />
      <EntityAvatar name="Jack White" />
    </div>
  ),
};

// Without Color Hash
export const WithoutColorHash: Story = {
  args: {
    name: 'John Doe',
    colorHash: false,
  },
};

// Different Name Formats
export const NameFormats: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <EntityAvatar name="John Doe" />
        <span className="text-sm text-muted-foreground">John Doe</span>
      </div>
      <div className="flex items-center gap-4">
        <EntityAvatar name="john.doe@example.com" />
        <span className="text-sm text-muted-foreground">john.doe@example.com</span>
      </div>
      <div className="flex items-center gap-4">
        <EntityAvatar name="Mary-Jane Watson" />
        <span className="text-sm text-muted-foreground">Mary-Jane Watson (hyphenated)</span>
      </div>
      <div className="flex items-center gap-4">
        <EntityAvatar name="JohnDoe" />
        <span className="text-sm text-muted-foreground">JohnDoe (PascalCase)</span>
      </div>
      <div className="flex items-center gap-4">
        <EntityAvatar name="john_doe" />
        <span className="text-sm text-muted-foreground">john_doe (snake_case)</span>
      </div>
      <div className="flex items-center gap-4">
        <EntityAvatar name="John" />
        <span className="text-sm text-muted-foreground">John (single name)</span>
      </div>
    </div>
  ),
};

// Three Initials
export const ThreeInitials: Story = {
  args: {
    name: 'John Michael Doe',
    maxInitials: 3,
    size: 'lg',
  },
};

// In a List Context
export const InListContext: Story = {
  render: () => (
    <div className="space-y-3 max-w-md">
      {[
        { name: 'Alice Brown', email: 'alice@example.com', role: 'Admin' },
        { name: 'Bob Smith', email: 'bob@example.com', role: 'User' },
        { name: 'Carol Davis', email: 'carol@example.com', role: 'Manager' },
        { name: 'David Wilson', email: 'david@example.com', role: 'Developer' },
      ].map((user) => (
        <div
          key={user.email}
          className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
        >
          <EntityAvatar name={user.name} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <span className="text-xs text-muted-foreground">{user.role}</span>
        </div>
      ))}
    </div>
  ),
};

// With Images in List
export const WithImagesInList: Story = {
  render: () => (
    <div className="space-y-3 max-w-md">
      {[
        { name: 'Alice Brown', img: 'https://i.pravatar.cc/150?img=1' },
        { name: 'Bob Smith', img: 'https://i.pravatar.cc/150?img=2' },
        { name: 'Carol Davis', img: null },
        { name: 'David Wilson', img: 'https://i.pravatar.cc/150?img=3' },
        { name: 'Emma Johnson', img: null },
      ].map((user) => (
        <div
          key={user.name}
          className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
        >
          <EntityAvatar name={user.name} imageUrl={user.img || undefined} />
          <span className="text-sm font-medium text-foreground">{user.name}</span>
        </div>
      ))}
    </div>
  ),
};

// Avatar Group
export const AvatarGroup: Story = {
  render: () => (
    <div className="flex -space-x-2">
      <EntityAvatar
        name="Alice Brown"
        className="ring-2 ring-background"
        imageUrl="https://i.pravatar.cc/150?img=1"
      />
      <EntityAvatar
        name="Bob Smith"
        className="ring-2 ring-background"
        imageUrl="https://i.pravatar.cc/150?img=2"
      />
      <EntityAvatar name="Carol Davis" className="ring-2 ring-background" />
      <EntityAvatar name="David Wilson" className="ring-2 ring-background" />
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-2 ring-background">
        +5
      </div>
    </div>
  ),
};

// Custom Fallback
export const CustomFallback: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <EntityAvatar
        name="Company Logo"
        fallback={
          <span className="material-symbols-outlined text-xl text-muted-foreground">
            business
          </span>
        }
        colorHash={false}
      />
      <EntityAvatar
        name="Unknown User"
        fallback={
          <span className="material-symbols-outlined text-xl text-muted-foreground">
            person
          </span>
        }
        colorHash={false}
      />
    </div>
  ),
};
