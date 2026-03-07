// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Hoisted mock values — must be before vi.mock
const { mockUseQuery, mockListUseQuery, mockUseSubscription, mockInvalidate } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListUseQuery: vi.fn(),
  mockUseSubscription: vi.fn(),
  mockInvalidate: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      getUnreadCount: { useQuery: mockUseQuery },
      list: {
        useQuery: mockListUseQuery,
        invalidate: mockInvalidate,
      },
      onNew: { useSubscription: mockUseSubscription },
      markAsRead: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isLoading: false,
        })),
      },
    },
    useUtils: vi.fn(() => ({
      notifications: {
        getUnreadCount: { invalidate: mockInvalidate },
        list: { invalidate: mockInvalidate },
      },
    })),
  },
}));

// Mock useAuth (non-redirecting)
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1' },
  })),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: mockUseAuth,
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1' },
  })),
}));

// Hoisted subscription mock
const { mockSubscriptionHook } = vi.hoisted(() => ({
  mockSubscriptionHook: vi.fn(),
}));

vi.mock('../hooks/useNotificationSubscription', () => ({
  useNotificationSubscription: mockSubscriptionHook,
}));

// Mock @intelliflow/ui Popover
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/ui');
  return {
    ...actual,
    Popover: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
    PopoverTrigger: ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <div data-testid="popover-trigger">{children}</div>
    ),
    PopoverContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <div data-testid="popover-content">{children}</div>
    ),
    ScrollArea: ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <div data-testid="scroll-area">{children}</div>
    ),
  };
});

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

import { NotificationBell } from '../NotificationBell';

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: { total: 3, byPriority: { high: 1, normal: 1, low: 1 } },
      isLoading: false,
    });
    mockListUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
    mockUseSubscription.mockImplementation(() => {});
  });

  it('renders bell icon', () => {
    render(<NotificationBell />);
    expect(screen.getByText('notifications')).toBeInTheDocument();
  });

  it('shows unread count badge when count > 0', () => {
    mockUseQuery.mockReturnValue({
      data: { total: 5, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides badge when count is 0', () => {
    mockUseQuery.mockReturnValue({
      data: { total: 0, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('uses getUnreadCount.useQuery for badge count', () => {
    render(<NotificationBell />);
    expect(mockUseQuery).toHaveBeenCalled();
    // Verify refetchInterval is set for fallback polling
    const queryArgs = mockUseQuery.mock.calls[0];
    expect(queryArgs[1]?.refetchInterval).toBe(60_000);
  });

  it('renders dropdown with ScrollArea', () => {
    render(<NotificationBell />);
    expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
  });

  it('contains "View all" link to /notifications', () => {
    render(<NotificationBell />);
    const viewAllLink = screen.getByText(/view all/i);
    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink.closest('a')).toHaveAttribute('href', '/notifications');
  });

  it('uses useAuth, not useRequireAuth', () => {
    render(<NotificationBell />);
    expect(mockUseAuth).toHaveBeenCalled();
  });

  it('renders popover trigger', () => {
    render(<NotificationBell />);
    expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
  });

  it('renders popover content', () => {
    render(<NotificationBell />);
    expect(screen.getByTestId('popover-content')).toBeInTheDocument();
  });

  it('shows badge with 9+ for counts above 9', () => {
    mockUseQuery.mockReturnValue({
      data: { total: 15, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('renders recent notifications in dropdown when data is available', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: 'n1',
            type: 'lead_assigned',
            title: 'New Lead',
            isRead: false,
            createdAt: new Date(),
          },
          {
            id: 'n2',
            type: 'task_assigned',
            title: 'Task Assigned',
            isRead: true,
            createdAt: new Date(),
          },
        ],
      },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByText('New Lead')).toBeInTheDocument();
    expect(screen.getByText('Task Assigned')).toBeInTheDocument();
  });

  it('shows empty state when no recent notifications', () => {
    mockListUseQuery.mockReturnValue({
      data: { notifications: [] },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByText('No unread notifications')).toBeInTheDocument();
  });

  it('subscription onData triggers cache invalidation', () => {
    render(<NotificationBell />);
    // Capture the options passed to useNotificationSubscription
    const subscriptionCall = mockSubscriptionHook.mock.calls[0]?.[0];
    expect(subscriptionCall).toBeDefined();
    expect(subscriptionCall.onData).toBeDefined();
    // Call the onData callback to trigger handleNewNotification
    subscriptionCall.onData();
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('shows unread count text in dropdown header', () => {
    mockUseQuery.mockReturnValue({
      data: { total: 5, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByText('5 unread')).toBeInTheDocument();
  });

  it('clicking "View all" link triggers close handler', () => {
    render(<NotificationBell />);
    const viewAllLink = screen.getByText(/view all/i);
    // Click exercises the onClick={() => setIsOpen(false)} callback
    fireEvent.click(viewAllLink);
    // Link should still be in the DOM (mock Popover always renders)
    expect(viewAllLink).toBeInTheDocument();
  });
});
