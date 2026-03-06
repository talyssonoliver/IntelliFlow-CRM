// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Hoisted mock values — must be before vi.mock
const { mockSearchParams, mockMutate, mockInvalidate, mockSetData } = vi.hoisted(() => ({
  mockSearchParams: new URLSearchParams(),
  mockMutate: vi.fn(),
  mockInvalidate: vi.fn(),
  mockSetData: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      markAsRead: {
        useMutation: vi.fn(() => ({
          mutate: mockMutate,
          isPending: false,
        })),
      },
      markAllAsRead: {
        useMutation: vi.fn(() => ({
          mutate: mockMutate,
          isPending: false,
        })),
      },
      delete: {
        useMutation: vi.fn(() => ({
          mutate: mockMutate,
          isPending: false,
        })),
      },
      getUnreadCount: {
        useQuery: vi.fn(() => ({
          data: { total: 3, byPriority: { high: 1, normal: 1, low: 1 } },
        })),
      },
      list: {
        setData: mockSetData,
        invalidate: mockInvalidate,
      },
    },
    useUtils: vi.fn(() => ({
      notifications: {
        list: { setData: mockSetData, invalidate: mockInvalidate },
        getUnreadCount: { invalidate: mockInvalidate },
      },
    })),
  },
}));

// Mock useRequireAuth
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1' },
  })),
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1' },
  })),
}));

// Mock useDebounce
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: vi.fn((value: string) => value),
}));

// Capture NotificationFilters props for assertions
const mockNotificationFiltersProps = vi.hoisted(() => vi.fn());

// Mock @/components/shared — PageHeader
vi.mock('@/components/shared', () => ({
  PageHeader: vi.fn(
    ({
      title,
      actions,
    }: {
      title: string;
      actions?: Array<{ label: string; onClick?: () => void }>;
    }) => (
      <div data-testid="page-header">
        <h1>{title}</h1>
        {actions?.map((a, i) =>
          a.onClick ? (
            <button
              key={i}
              data-testid={`action-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ) : (
            <span key={i}>{a.label}</span>
          )
        )}
      </div>
    )
  ),
}));

// Mock @/components/notifications — NotificationFilters + NotificationList
vi.mock('@/components/notifications', () => ({
  NotificationFilters: vi.fn((props: Record<string, unknown>) => {
    mockNotificationFiltersProps(props);
    const onSearchChange = props.onSearchChange as (v: string) => void;
    const onTypeChange = props.onTypeChange as (v: string) => void;
    const onPriorityChange = props.onPriorityChange as (v: string) => void;
    const onTabChange = props.onTabChange as (v: string) => void;
    const onClearFilters = props.onClearFilters as () => void;

    return (
      <div data-testid="notification-filters">
        <input
          data-testid="search-input"
          value={props.searchQuery as string}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button data-testid="type-change" onClick={() => onTypeChange('lead_assigned')}>
          Type
        </button>
        <button data-testid="priority-change" onClick={() => onPriorityChange('high')}>
          Priority
        </button>
        <button data-testid="tab-unread" onClick={() => onTabChange('unread')}>
          Unread
        </button>
        <button data-testid="tab-all" onClick={() => onTabChange('all')}>
          All
        </button>
        <button data-testid="clear-filters" onClick={() => onClearFilters()}>
          Clear
        </button>
        <span data-testid="active-tab">{props.activeTab as string}</span>
        <span data-testid="type-filter">{props.typeFilter as string}</span>
      </div>
    );
  }),
  NotificationList: vi.fn(({ filters, onMarkAsRead, onDismiss }: Record<string, unknown>) => (
    <div data-testid="notification-list">
      <button data-testid="mark-read" onClick={() => (onMarkAsRead as (id: string) => void)('n1')}>
        Mark Read
      </button>
      <button data-testid="dismiss" onClick={() => (onDismiss as (id: string) => void)('n2')}>
        Dismiss
      </button>
      <span data-testid="filters-json">{JSON.stringify(filters)}</span>
    </div>
  )),
}));

// Import the component under test
import NotificationsPage from '../page';

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params
    mockSearchParams.delete('filter');
  });

  it('renders NotificationFilters component', () => {
    render(<NotificationsPage />);
    expect(screen.getByTestId('notification-filters')).toBeInTheDocument();
  });

  it('renders NotificationList component', () => {
    render(<NotificationsPage />);
    expect(screen.getByTestId('notification-list')).toBeInTheDocument();
  });

  it('renders page header with "Notifications" title', () => {
    render(<NotificationsPage />);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('passes correct props to NotificationFilters', () => {
    render(<NotificationsPage />);
    expect(mockNotificationFiltersProps).toHaveBeenCalled();
    const props = mockNotificationFiltersProps.mock.calls[0][0];
    expect(props.searchQuery).toBe('');
    expect(props.typeFilter).toBe('');
    expect(props.priorityFilter).toBe('');
    expect(props.activeTab).toBe('all');
    expect(props.unreadCount).toBe(3);
    expect(props.highPriorityCount).toBe(1);
    expect(props.onSearchChange).toBeDefined();
    expect(props.onTypeChange).toBeDefined();
    expect(props.onPriorityChange).toBeDefined();
    expect(props.onTabChange).toBeDefined();
    expect(props.onClearFilters).toBeDefined();
  });

  it('manages search filter state', () => {
    render(<NotificationsPage />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test search' } });
    expect(input).toHaveValue('test search');
  });

  it('manages type filter via NotificationFilters', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('type-change'));
    const latestProps = mockNotificationFiltersProps.mock.calls.at(-1)![0];
    expect(latestProps.typeFilter).toBe('lead_assigned');
  });

  it('manages priority filter via NotificationFilters', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('priority-change'));
    const latestProps = mockNotificationFiltersProps.mock.calls.at(-1)![0];
    expect(latestProps.priorityFilter).toBe('high');
  });

  it('manages tab state via NotificationFilters', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('tab-unread'));
    expect(screen.getByTestId('active-tab')).toHaveTextContent('unread');
  });

  it('calls markAsRead mutation when onMarkAsRead is triggered', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('mark-read'));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('calls markAllAsRead mutation from page header action', () => {
    render(<NotificationsPage />);
    const markAllBtn = screen.getByTestId('action-mark-all-as-read');
    fireEvent.click(markAllBtn);
    expect(mockMutate).toHaveBeenCalled();
  });

  it('calls delete mutation when onDismiss is triggered', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('dismiss'));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('passes filters to NotificationList', () => {
    render(<NotificationsPage />);
    const filtersJson = screen.getByTestId('filters-json');
    const filters = JSON.parse(filtersJson.textContent || '{}');
    expect(filters).toHaveProperty('searchQuery');
    expect(filters).toHaveProperty('typeFilter');
    expect(filters).toHaveProperty('priorityFilter');
    expect(filters).toHaveProperty('activeTab');
  });

  describe('URL query params', () => {
    it('?filter=unread sets activeTab to unread', () => {
      mockSearchParams.set('filter', 'unread');
      render(<NotificationsPage />);
      expect(screen.getByTestId('active-tab')).toHaveTextContent('unread');
    });

    it('?filter=ai-insights sets typeFilter to ai_insight', () => {
      mockSearchParams.set('filter', 'ai-insights');
      render(<NotificationsPage />);
      expect(screen.getByTestId('type-filter')).toHaveTextContent('ai_insight');
    });

    it('?filter=mentions sets typeFilter to team_mention', () => {
      mockSearchParams.set('filter', 'mentions');
      render(<NotificationsPage />);
      expect(screen.getByTestId('type-filter')).toHaveTextContent('team_mention');
    });

    it('?filter=sla-alerts sets typeFilter to system_alert', () => {
      mockSearchParams.set('filter', 'sla-alerts');
      render(<NotificationsPage />);
      expect(screen.getByTestId('type-filter')).toHaveTextContent('system_alert');
    });

    it('?filter=system sets typeFilter to system_alert', () => {
      mockSearchParams.set('filter', 'system');
      render(<NotificationsPage />);
      expect(screen.getByTestId('type-filter')).toHaveTextContent('system_alert');
    });

    it('no ?filter defaults to activeTab all', () => {
      render(<NotificationsPage />);
      expect(screen.getByTestId('active-tab')).toHaveTextContent('all');
    });
  });

  it('does NOT add page-level mx-auto wrapper', () => {
    const { container } = render(<NotificationsPage />);
    const wrapper = container.firstElementChild;
    const classes = (wrapper?.className || '').split(' ');
    expect(classes).not.toContain('mx-auto');
  });

  it('does NOT add page-level p-6 lg:p-8 padding', () => {
    const { container } = render(<NotificationsPage />);
    const wrapper = container.firstElementChild;
    const classes = (wrapper?.className || '').split(' ');
    expect(classes).not.toContain('p-6');
    expect(classes).not.toContain('lg:p-8');
  });

  it('passes unreadCount and highPriorityCount to NotificationFilters', () => {
    render(<NotificationsPage />);
    const props = mockNotificationFiltersProps.mock.calls.at(-1)![0];
    expect(props.unreadCount).toBe(3);
    expect(props.highPriorityCount).toBe(1);
  });
});
