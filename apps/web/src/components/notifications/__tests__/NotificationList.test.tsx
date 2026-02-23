// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Mock function refs — survive vi.clearAllMocks
let intersectionCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null;
const mockDisconnect = vi.fn();
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();

// Mock useNotificationFeed hook
const mockFetchNextPage = vi.fn();
const mockRefetch = vi.fn();

const mockHookReturn = {
  items: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: mockFetchNextPage,
  refetch: mockRefetch,
};

vi.mock('../hooks/useNotificationFeed', () => ({
  useNotificationFeed: vi.fn(() => mockHookReturn),
}));

// Mock NotificationItem and Skeleton
vi.mock('../NotificationItem', () => ({
  NotificationItem: vi.fn(({ notification }: { notification: Record<string, unknown> }) => (
    <div data-testid={`notification-${notification.id}`}>{String(notification.title)}</div>
  )),
}));

vi.mock('../NotificationItemSkeleton', () => ({
  NotificationItemSkeleton: vi.fn(() => <div data-testid="skeleton" />),
}));

// Lazy import so vi.mock is hoisted first
const { NotificationList } = await import('../NotificationList');

const sampleNotifications = [
  {
    id: 'n1',
    type: 'lead_assigned',
    priority: 'high',
    title: 'Lead Assigned',
    body: 'New lead for you',
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    expiresAt: null,
    entityType: null,
    entityId: null,
    entityName: null,
    actionUrl: null,
    actionLabel: null,
    metadata: null,
  },
  {
    id: 'n2',
    type: 'task_completed',
    priority: 'normal',
    title: 'Task Done',
    body: 'Task has been completed',
    isRead: true,
    readAt: new Date(),
    createdAt: new Date(),
    expiresAt: null,
    entityType: null,
    entityId: null,
    entityName: null,
    actionUrl: null,
    actionLabel: null,
    metadata: null,
  },
];

describe('NotificationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intersectionCallback = null;
    mockHookReturn.items = [];
    mockHookReturn.isLoading = false;
    mockHookReturn.isError = false;
    mockHookReturn.error = null;
    mockHookReturn.isFetchingNextPage = false;
    mockHookReturn.hasNextPage = false;

    // Set up IntersectionObserver as a class (must be a constructor)
    globalThis.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback as (entries: IntersectionObserverEntry[]) => void;
      }
      observe = mockObserve;
      unobserve = mockUnobserve;
      disconnect = mockDisconnect;
      root = null;
      rootMargin = '';
      thresholds = [] as number[];
      takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);
    } as unknown as typeof IntersectionObserver;
  });

  it('shows skeleton placeholders when loading', () => {
    mockHookReturn.isLoading = true;
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "You\'re all caught up!" when empty and no filters active', () => {
    mockHookReturn.items = [];
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  it('shows "No notifications match your filters." when empty with active filters', () => {
    mockHookReturn.items = [];
    render(
      <NotificationList
        filters={{ searchQuery: 'xyz', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText('No notifications match your filters.')).toBeInTheDocument();
  });

  it('shows error message with retry button on error', () => {
    mockHookReturn.isError = true;
    mockHookReturn.error = new Error('Network error');
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    const retryBtn = screen.getByText(/retry/i);
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders NotificationItem for each notification', () => {
    mockHookReturn.items = sampleNotifications;
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByTestId('notification-n1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-n2')).toBeInTheDocument();
  });

  it('IntersectionObserver triggers fetchNextPage when sentinel visible', () => {
    mockHookReturn.items = sampleNotifications;
    mockHookReturn.hasNextPage = true;
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(mockObserve).toHaveBeenCalled();

    // Trigger intersection
    act(() => {
      intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    });

    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('does NOT call fetchNextPage when hasNextPage is false', () => {
    mockHookReturn.items = sampleNotifications;
    mockHookReturn.hasNextPage = false;
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    act(() => {
      intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    });

    expect(mockFetchNextPage).not.toHaveBeenCalled();
  });

  it('shows loading indicator when fetching next page', () => {
    mockHookReturn.items = sampleNotifications;
    mockHookReturn.isFetchingNextPage = true;
    mockHookReturn.hasNextPage = true;
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('has id="notification-list" on the container', () => {
    mockHookReturn.items = sampleNotifications;
    render(
      <NotificationList
        filters={{ searchQuery: '', typeFilter: '', priorityFilter: '', activeTab: 'all' }}
        onMarkAsRead={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(document.getElementById('notification-list')).toBeInTheDocument();
  });

  it('passes filters to useNotificationFeed hook', async () => {
    const { useNotificationFeed } = await import('../hooks/useNotificationFeed');
    const filters = {
      searchQuery: 'test',
      typeFilter: 'lead_assigned',
      priorityFilter: 'high',
      activeTab: 'unread' as const,
    };
    render(
      <NotificationList filters={filters} onMarkAsRead={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(useNotificationFeed).toHaveBeenCalledWith(filters);
  });
});
