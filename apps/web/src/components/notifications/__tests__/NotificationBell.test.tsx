// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Hoisted mock values — must be before vi.mock
const {
  mockUseQuery,
  mockListUseQuery,
  mockUseSubscription,
  mockInvalidate,
  mockRouterPush,
  mockMarkAsReadMutate,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListUseQuery: vi.fn(),
  mockUseSubscription: vi.fn(),
  mockInvalidate: vi.fn(),
  mockRouterPush: vi.fn(),
  mockMarkAsReadMutate: vi.fn(),
}));

let markAsReadMutationOnSuccess: (() => void) | undefined;

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
        useMutation: vi.fn((opts?: { onSuccess?: () => void }) => {
          if (opts?.onSuccess) {
            (markAsReadMutationOnSuccess as any) = opts.onSuccess;
          }
          return { mutate: mockMarkAsReadMutate, isLoading: false };
        }),
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

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockRouterPush })),
}));

// Mock Next.js server action — revalidateTag requires static generation store
// which doesn't exist in vitest jsdom environment
vi.mock('@/app/notifications/actions', () => ({
  revalidateNotifications: vi.fn().mockResolvedValue(undefined),
  revalidateActivityFeed: vi.fn().mockResolvedValue(undefined),
}));

import { NotificationBell } from '../NotificationBell';

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAsReadMutationOnSuccess = undefined;
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
    // NotificationBell renders `<EmptyState entity="notifications" />` which
    // surfaces the canonical copy from packages/ui's entity config
    // (entity-empty-state-config.ts: notifications → "No notifications").
    expect(screen.getByText('No notifications')).toBeInTheDocument();
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

  // ---------------------------------------------------------------------------
  // PG-161: Branch coverage gap closure (9 tests)
  // ---------------------------------------------------------------------------

  // 2.1 — Clicking unread notification calls markAsRead.mutate with notification ID
  it('clicking unread notification calls markAsRead.mutate with correct IDs', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        notifications: [
          { id: 'n1', type: 'lead_assigned', title: 'Lead', isRead: false, createdAt: new Date() },
        ],
      },
      isLoading: false,
    });
    render(<NotificationBell />);
    const notification = screen.getByText('Lead');
    fireEvent.click(notification.closest('button')!);
    expect(mockMarkAsReadMutate).toHaveBeenCalledWith({ notificationIds: ['n1'] });
  });

  // 2.2 — Clicking read notification does NOT call markAsRead.mutate
  it('clicking read notification does NOT call markAsRead.mutate', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: 'n2',
            type: 'task_assigned',
            title: 'Read Item',
            isRead: true,
            createdAt: new Date(),
          },
        ],
      },
      isLoading: false,
    });
    render(<NotificationBell />);
    const notification = screen.getByText('Read Item');
    fireEvent.click(notification.closest('button')!);
    expect(mockMarkAsReadMutate).not.toHaveBeenCalled();
  });

  // 2.3 — Clicking notification closes popover (setIsOpen(false))
  it('clicking notification exercises popover close path', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: 'n3',
            type: 'lead_assigned',
            title: 'Close Test',
            isRead: false,
            createdAt: new Date(),
          },
        ],
      },
      isLoading: false,
    });
    render(<NotificationBell />);
    const notification = screen.getByText('Close Test');
    // Click triggers handleNotificationClick which calls setIsOpen(false)
    fireEvent.click(notification.closest('button')!);
    // Since our Popover mock always renders, we verify the click handler runs without error
    expect(notification).toBeInTheDocument();
  });

  // 2.4 — router.push called with actionUrl when present
  it('router.push called with actionUrl when present', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: 'n4',
            type: 'lead_assigned',
            title: 'Navigate',
            isRead: false,
            createdAt: new Date(),
            actionUrl: '/leads/123',
          },
        ],
      },
      isLoading: false,
    });
    render(<NotificationBell />);
    const notification = screen.getByText('Navigate');
    fireEvent.click(notification.closest('button')!);
    expect(mockRouterPush).toHaveBeenCalledWith('/leads/123');
  });

  // 2.5 — router.push NOT called when actionUrl is null/undefined
  it('router.push NOT called when actionUrl is null', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        notifications: [
          {
            id: 'n5',
            type: 'lead_assigned',
            title: 'No URL',
            isRead: false,
            createdAt: new Date(),
            actionUrl: null,
          },
        ],
      },
      isLoading: false,
    });
    render(<NotificationBell />);
    const notification = screen.getByText('No URL');
    fireEvent.click(notification.closest('button')!);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  // 2.6 — markAsRead.onSuccess invalidates getUnreadCount and list
  it('markAsRead.onSuccess invalidates getUnreadCount and list caches', () => {
    render(<NotificationBell />);
    expect(markAsReadMutationOnSuccess).toBeDefined();
    markAsReadMutationOnSuccess!();
    expect(mockInvalidate).toHaveBeenCalled();
  });

  // 2.7 — Bell button aria-label is "Notifications, N unread" when count > 0
  it('bell button aria-label is "Notifications, N unread" when count > 0', () => {
    mockUseQuery.mockReturnValue({
      data: { total: 5, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByLabelText('Notifications, 5 unread')).toBeInTheDocument();
  });

  // 2.8 — Bell button aria-label is "Notifications" when count is 0
  it('bell button aria-label is "Notifications" when count is 0', () => {
    mockUseQuery.mockReturnValue({
      data: { total: 0, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  // 2.9 — list.useQuery enabled only when isAuthenticated && isOpen
  it('list.useQuery enabled only when isAuthenticated and isOpen', () => {
    render(<NotificationBell />);
    // Since isOpen starts as false, list query should be disabled
    const listCallArgs = mockListUseQuery.mock.calls[0];
    expect(listCallArgs[1]?.enabled).toBe(false);
  });
});
