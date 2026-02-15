/**
 * @vitest-environment happy-dom
 * Supplementary tests for user-menu.tsx
 *
 * Covers: UserMenu component - menu open/close, keyboard escape,
 * click outside, logout action, profile/settings navigation,
 * user info display, avatar vs initials, auth context usage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mockLogout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockIsLoggingOut = vi.hoisted(() => ({ value: false }));
const mockAuthUser = vi.hoisted(() => ({
  value: null as null | {
    id: string;
    email: string;
    name: string | null;
    role: string;
    avatar: null;
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: ({ name, fallbackText }: { name: string; fallbackText?: string }) => (
    <div>{fallbackText || name}</div>
  ),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser.value,
  }),
}));

vi.mock('@/hooks/useLogout', () => ({
  useLogout: () => ({
    logout: mockLogout,
    isLoggingOut: mockIsLoggingOut.value,
  }),
}));

import { UserMenu } from '../user-menu';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserMenu', () => {
  beforeEach(() => {
    mockLogout.mockClear();
    mockLogout.mockResolvedValue(undefined);
    mockIsLoggingOut.value = false;
    mockAuthUser.value = null;
  });

  it('renders user name from props when no auth user', () => {
    render(
      <UserMenu
        user={{ name: 'John Doe', email: 'john@example.com', role: 'Admin' }}
      />
    );

    expect(screen.getByText('John Doe')).toBeDefined();
  });

  it('renders initials when no avatar is provided', () => {
    render(
      <UserMenu user={{ name: 'John Doe', email: 'john@example.com' }} />
    );

    expect(screen.getByText('JD')).toBeDefined();
  });

  it('falls back to Guest when no user prop and no auth user', () => {
    render(<UserMenu />);

    expect(screen.getByText('G')).toBeDefined();
  });

  it('uses auth context user when available', () => {
    mockAuthUser.value = {
      id: 'user-1',
      email: 'auth@example.com',
      name: 'Auth User',
      role: 'USER',
      avatar: null,
    };

    render(<UserMenu />);

    expect(screen.getByText('Auth User')).toBeDefined();
  });

  it('uses email prefix as name when auth user has no name', () => {
    mockAuthUser.value = {
      id: 'user-2',
      email: 'noname@example.com',
      name: null,
      role: 'USER',
      avatar: null,
    };

    render(<UserMenu />);

    expect(screen.getByText('noname')).toBeDefined();
  });

  it('opens dropdown menu on click', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button', { expanded: false });
    fireEvent.click(trigger);

    // The dropdown menu should now be visible
    expect(screen.getByText('Profile')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Governance')).toBeDefined();
    expect(screen.getByText('Sign out')).toBeDefined();
  });

  it('closes menu on second click (toggle)', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger); // open
    expect(screen.getByText('Profile')).toBeDefined();

    fireEvent.click(trigger); // close
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('closes menu on Escape key', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByText('Profile')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('closes menu on click outside', () => {
    render(
      <div>
        <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
        <div data-testid="outside">Outside</div>
      </div>
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByText('Profile')).toBeDefined();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('calls logout and closes menu on Sign out click', async () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const signOutBtn = screen.getByText('Sign out');
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows "Signing out..." when isLoggingOut is true', () => {
    mockIsLoggingOut.value = true;

    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getByText('Signing out...')).toBeDefined();
  });

  it('disables sign out button when isLoggingOut is true', () => {
    mockIsLoggingOut.value = true;

    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const signOutBtn = screen.getByText('Signing out...');
    expect(signOutBtn.closest('button')?.disabled).toBe(true);
  });

  it('displays user email in dropdown', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getByText('jane@test.com')).toBeDefined();
  });

  it('displays user role badge in dropdown', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com', role: 'Admin' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getByText('Admin')).toBeDefined();
  });

  it('closes menu when Profile link is clicked', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    fireEvent.click(screen.getByText('Profile'));
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('closes menu when Settings link is clicked', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    fireEvent.click(screen.getByText('Settings'));
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('closes menu when Governance link is clicked', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    fireEvent.click(screen.getByText('Governance'));
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(
      <UserMenu
        user={{ name: 'Jane', email: 'jane@test.com' }}
        className="test-class"
      />
    );

    expect(container.firstElementChild?.className).toContain('test-class');
  });

  it('shows expand_more icon when closed and expand_less when open', () => {
    render(
      <UserMenu user={{ name: 'Jane', email: 'jane@test.com' }} />
    );

    expect(screen.getByText('expand_more')).toBeDefined();

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getByText('expand_less')).toBeDefined();
  });

  it('generates single-letter initials for single-word name', () => {
    render(<UserMenu user={{ name: 'Admin', email: 'admin@test.com' }} />);

    expect(screen.getByText('A')).toBeDefined();
  });

  it('truncates initials to 2 characters for long names', () => {
    render(
      <UserMenu
        user={{ name: 'John Michael Smith', email: 'jms@test.com' }}
      />
    );

    // Should take first letter of each word then slice(0, 2)
    expect(screen.getByText('JM')).toBeDefined();
  });
});
