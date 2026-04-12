// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mock values
// ---------------------------------------------------------------------------

const {
  mockGetUnreadCount,
  mockListQuery,
  mockMarkAsReadMutate,
  mockMarkAllAsReadMutate,
  mockGetUnreadCountInvalidate,
  mockListInvalidate,
} = vi.hoisted(() => ({
  mockGetUnreadCount: vi.fn(),
  mockListQuery: vi.fn(),
  mockMarkAsReadMutate: vi.fn(),
  mockMarkAllAsReadMutate: vi.fn(),
  mockGetUnreadCountInvalidate: vi.fn(),
  mockListInvalidate: vi.fn(),
}));

// Track onSuccess callbacks for cache invalidation tests
let markAsReadOnSuccess: (() => void) | undefined;
let _markAllAsReadOnSuccess: (() => void) | undefined;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      getUnreadCount: { useQuery: mockGetUnreadCount },
      list: { useQuery: mockListQuery },
      markAsRead: {
        useMutation: vi.fn((opts?: { onSuccess?: () => void }) => {
          markAsReadOnSuccess = opts?.onSuccess;
          return { mutate: mockMarkAsReadMutate, isLoading: false };
        }),
      },
      markAllAsRead: {
        useMutation: vi.fn((opts?: { onSuccess?: () => void }) => {
          _markAllAsReadOnSuccess = opts?.onSuccess;
          return { mutate: mockMarkAllAsReadMutate, isLoading: false };
        }),
      },
    },
    useUtils: vi.fn(() => ({
      notifications: {
        getUnreadCount: { invalidate: mockGetUnreadCountInvalidate },
        list: { invalidate: mockListInvalidate },
      },
    })),
  },
}));

// Mock NotificationItem — renders simple clickable div
vi.mock('@/components/notifications', () => ({
  NotificationItem: ({
    notification,
    onMarkAsRead,
    onDismiss,
  }: {
    notification: { id: string; title: string; actionUrl?: string | null };
    onMarkAsRead: (id: string) => void;
    onDismiss: (id: string) => void;
  }) => (
    <div data-testid={`notification-item-${notification.id}`}>
      <span>{notification.title}</span>
      <button
        data-testid={`mark-read-${notification.id}`}
        onClick={() => onMarkAsRead(notification.id)}
      >
        mark read
      </button>
      <button data-testid={`dismiss-${notification.id}`} onClick={() => onDismiss(notification.id)}>
        dismiss
      </button>
    </div>
  ),
  NotificationItemSkeleton: () => <div data-testid="notification-skeleton" />,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

import { NotificationsSummaryWidget } from '../NotificationsSummaryWidget';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockNotifications = [
  {
    id: 'n1',
    type: 'lead_assigned',
    priority: 'normal',
    title: 'New Lead Assigned',
    body: 'A new lead was assigned to you',
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: '/leads/123',
  },
  {
    id: 'n2',
    type: 'task_assigned',
    priority: 'high',
    title: 'Task Due Today',
    body: 'Follow up with client',
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: '/tasks/456',
  },
  {
    id: 'n3',
    type: 'deal_update',
    priority: 'normal',
    title: 'Deal Updated',
    body: 'Deal moved to negotiation stage',
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationsSummaryWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAsReadOnSuccess = undefined;
    _markAllAsReadOnSuccess = undefined;

    mockGetUnreadCount.mockReturnValue({
      data: { total: 3, byPriority: { high: 1, normal: 2, low: 0 } },
      isLoading: false,
    });
    mockListQuery.mockReturnValue({
      data: { notifications: mockNotifications },
      isLoading: false,
    });
  });

  // 1.1 — AC-001
  it('renders widget card with "Notifications" header text', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  // 1.2 — AC-002
  it('shows unread count badge when getUnreadCount returns total > 0', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // 1.3 — AC-002
  it('hides badge when unread count is 0', () => {
    mockGetUnreadCount.mockReturnValue({
      data: { total: 0, byPriority: {} },
      isLoading: false,
    });
    render(<NotificationsSummaryWidget enabled={true} />);
    // Badge should not render "0"
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  // 1.4 — AC-003
  it('renders up to 3 notification items from notifications.list query', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    expect(screen.getByTestId('notification-item-n1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-n2')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-n3')).toBeInTheDocument();
  });

  // 1.5 — AC-007
  it('shows 3 NotificationItemSkeleton placeholders when loading', () => {
    mockGetUnreadCount.mockReturnValue({ data: undefined, isLoading: true });
    mockListQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<NotificationsSummaryWidget enabled={true} />);
    const skeletons = screen.getAllByTestId('notification-skeleton');
    expect(skeletons).toHaveLength(3);
  });

  // 1.6 — AC-008
  it('shows "You\'re all caught up!" empty state when no unread notifications', () => {
    mockGetUnreadCount.mockReturnValue({
      data: { total: 0, byPriority: {} },
      isLoading: false,
    });
    mockListQuery.mockReturnValue({
      data: { notifications: [] },
      isLoading: false,
    });
    render(<NotificationsSummaryWidget enabled={true} />);
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  // 1.7 — AC-004
  it('clicking notification calls markAsRead.mutate with notification ID', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    fireEvent.click(screen.getByTestId('mark-read-n1'));
    expect(mockMarkAsReadMutate).toHaveBeenCalledWith({
      notificationIds: ['n1'],
    });
  });

  // 1.8 — AC-004 (NotificationItem handles routing internally via activateItem())
  it('passes onMarkAsRead that only calls markAsRead without router.push', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    // Click mark-read — should only call mutate, no navigation
    fireEvent.click(screen.getByTestId('mark-read-n1'));
    expect(mockMarkAsReadMutate).toHaveBeenCalledWith({
      notificationIds: ['n1'],
    });
    // Ensure only markAsRead is called, no side effects
    expect(mockMarkAsReadMutate).toHaveBeenCalledTimes(1);
  });

  // 1.9 — AC-005
  it('"Mark all read" button calls markAllAsRead.mutate', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    const markAllButton = screen.getByRole('button', { name: /mark all read/i });
    fireEvent.click(markAllButton);
    expect(mockMarkAllAsReadMutate).toHaveBeenCalled();
  });

  // 1.10 — AC-006
  it('"View all" link has href="/notifications"', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    const viewAllLink = screen.getByText(/view all/i);
    expect(viewAllLink.closest('a')).toHaveAttribute('href', '/notifications');
  });

  // 1.11 — AC-010, NF-003
  it('when enabled=false, queries are not fired', () => {
    render(<NotificationsSummaryWidget enabled={false} />);
    // Verify enabled: false was passed to both queries
    expect(mockGetUnreadCount).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false })
    );
    expect(mockListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, isRead: false }),
      expect.objectContaining({ enabled: false })
    );
  });

  // 1.12 — AC-009
  it('after markAsRead.onSuccess, both getUnreadCount and list caches are invalidated', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    // The onSuccess callback was captured during render
    expect(markAsReadOnSuccess).toBeDefined();
    markAsReadOnSuccess!();
    expect(mockGetUnreadCountInvalidate).toHaveBeenCalled();
    expect(mockListInvalidate).toHaveBeenCalled();
  });

  // Additional — exercises onDismiss no-op for coverage
  it('onDismiss is a no-op that does not throw', () => {
    render(<NotificationsSummaryWidget enabled={true} />);
    // Click dismiss button — the no-op handler should not error
    fireEvent.click(screen.getByTestId('dismiss-n1'));
    // No mutation or side effect expected
    expect(mockMarkAsReadMutate).not.toHaveBeenCalled();
    expect(mockMarkAllAsReadMutate).not.toHaveBeenCalled();
  });
});
