/**
 * DOC-008: Accessibility test suite using axe-core
 *
 * Tests IntelliFlow CRM components for WCAG 2.1 AA compliance using
 * vitest-axe in a jsdom environment.
 *
 * Limitations (documented per spec):
 * - Cannot detect color contrast (F-011) — jsdom cannot compute CSS; Lighthouse CI covers this
 * - Cannot detect focus trap correctness (F-009) — requires Playwright E2E
 * - Cannot detect skip link presence (F-001) — not axe-core's scope
 * - Cannot detect missing page titles (F-002) — component-level rendering
 * - Cannot detect missing autocomplete (F-012) — axe checks invalid values, not absence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';

// ============================================================================
// Mocks — required for components with external dependencies
// ============================================================================

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}));

// Mock tRPC hooks used by NotificationBell
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      notifications: {
        getUnreadCount: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    notifications: {
      getUnreadCount: {
        useQuery: () => ({ data: { total: 3 } }),
      },
      list: {
        useQuery: () => ({ data: { notifications: [] } }),
      },
      markAsRead: {
        useMutation: () => ({ mutate: vi.fn() }),
      },
    },
  },
}));

// Mock auth context
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 'test' } }),
}));

// Mock notification subscription hook
vi.mock('@/components/notifications/hooks/useNotificationSubscription', () => ({
  useNotificationSubscription: vi.fn(),
}));

// ============================================================================
// Tier 1: Shell Components (highest impact — always rendered)
// ============================================================================

describe('Tier 1: Shell Components', () => {
  it('NotificationBell has no accessibility violations', async () => {
    const { NotificationBell } = await import('@/components/notifications/NotificationBell');
    const { container } = render(React.createElement(NotificationBell));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('MainNav has no accessibility violations', async () => {
    const { MainNav } = await import('@/components/header/main-nav');
    const routes = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Leads', href: '/leads' },
      { label: 'Contacts', href: '/contacts' },
    ];
    const { container } = render(React.createElement(MainNav, { routes }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('SearchBar has no accessibility violations', async () => {
    const { SearchBar } = await import('@/components/header/search-bar');
    const { container } = render(React.createElement(SearchBar));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ============================================================================
// Tier 2: Page Skeletons (high-traffic pages)
// ============================================================================

describe('Tier 2: Page Skeletons', () => {
  it('Login form has no accessibility violations', async () => {
    // Render a representative login form structure
    const LoginForm = () =>
      React.createElement(
        'form',
        { 'aria-label': 'Sign in to your account' },
        React.createElement('div', null,
          React.createElement('label', { htmlFor: 'email' }, 'Email'),
          React.createElement('input', {
            id: 'email',
            type: 'email',
            name: 'email',
            autoComplete: 'email',
            required: true,
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { htmlFor: 'password' }, 'Password'),
          React.createElement('input', {
            id: 'password',
            type: 'password',
            name: 'password',
            autoComplete: 'current-password',
            required: true,
          })
        ),
        React.createElement('button', { type: 'submit' }, 'Sign in')
      );

    const { container } = render(React.createElement(LoginForm));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Notification list structure has no accessibility violations', async () => {
    const NotificationList = () =>
      React.createElement(
        'div',
        { role: 'region', 'aria-label': 'Notifications' },
        React.createElement('h2', null, 'Notifications'),
        React.createElement(
          'ul',
          { 'aria-label': 'Notification list' },
          React.createElement(
            'li',
            null,
            React.createElement('span', null, 'New lead assigned'),
            React.createElement('time', { dateTime: '2026-02-24T00:00:00Z' }, '1 hour ago')
          ),
          React.createElement(
            'li',
            null,
            React.createElement('span', null, 'Deal updated'),
            React.createElement('time', { dateTime: '2026-02-23T23:00:00Z' }, '2 hours ago')
          )
        )
      );

    const { container } = render(React.createElement(NotificationList));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Data table skeleton has no accessibility violations', async () => {
    const DataTableSkeleton = () =>
      React.createElement(
        'div',
        { role: 'region', 'aria-label': 'Leads' },
        React.createElement(
          'table',
          null,
          React.createElement(
            'thead',
            null,
            React.createElement(
              'tr',
              null,
              React.createElement('th', { scope: 'col' }, 'Name'),
              React.createElement('th', { scope: 'col' }, 'Email'),
              React.createElement('th', { scope: 'col' }, 'Status')
            )
          ),
          React.createElement(
            'tbody',
            null,
            React.createElement(
              'tr',
              null,
              React.createElement('td', null, 'John Doe'),
              React.createElement('td', null, 'john@example.com'),
              React.createElement('td', null, 'Active')
            )
          )
        )
      );

    const { container } = render(React.createElement(DataTableSkeleton));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ============================================================================
// Tier 3: Interactive Components
// ============================================================================

describe('Tier 3: Interactive Components', () => {
  it('Button with icon has no accessibility violations', async () => {
    const { Button } = await import('@intelliflow/ui');
    const { container } = render(
      React.createElement(
        'div',
        null,
        React.createElement(Button, { 'aria-label': 'Delete item', variant: 'destructive' },
          React.createElement('span', { 'aria-hidden': 'true' }, '🗑'),
          ' Delete'
        ),
        React.createElement(Button, null, 'Submit')
      )
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Form with error message has no accessibility violations', async () => {
    // Test aria-live on error messages (FormMessage pattern)
    const FormWithError = () =>
      React.createElement(
        'form',
        { 'aria-label': 'Contact form' },
        React.createElement('div', null,
          React.createElement('label', { htmlFor: 'name' }, 'Name'),
          React.createElement('input', {
            id: 'name',
            type: 'text',
            'aria-describedby': 'name-error',
            'aria-invalid': 'true',
          }),
          React.createElement('p', {
            id: 'name-error',
            role: 'alert',
            'aria-live': 'polite',
            className: 'text-sm text-destructive',
          }, 'Name is required')
        ),
        React.createElement('button', { type: 'submit' }, 'Submit')
      );

    const { container } = render(React.createElement(FormWithError));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
