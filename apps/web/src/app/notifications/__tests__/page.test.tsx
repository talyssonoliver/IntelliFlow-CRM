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

// Capture SearchFilterBar props for assertions
const mockSearchFilterBarProps = vi.hoisted(() => vi.fn());

// Mock @/components/shared — SearchFilterBar + PageHeader
vi.mock('@/components/shared', () => ({
  PageHeader: vi.fn(({ title, actions }: { title: string; actions?: Array<{ label: string; onClick?: () => void }> }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actions?.map((a, i) => (
        a.onClick ? (
          <button key={i} data-testid={`action-${a.label.toLowerCase().replace(/\s+/g, '-')}`} onClick={a.onClick}>
            {a.label}
          </button>
        ) : (
          <span key={i}>{a.label}</span>
        )
      ))}
    </div>
  )),
  SearchFilterBar: vi.fn((props: Record<string, unknown>) => {
    mockSearchFilterBarProps(props);
    const onSearchChange = props.onSearchChange as (v: string) => void;
    const filters = props.filters as Array<{
      id: string;
      onChange: (v: string) => void;
    }>;
    const filterChips = props.filterChips as {
      value: string;
      onChange: (v: string) => void;
    } | undefined;

    const typeFilter = filters?.find((f) => f.id === 'type');
    const priorityFilter = filters?.find((f) => f.id === 'priority');

    return (
      <div data-testid="search-filter-bar">
        <input
          data-testid="search-input"
          value={props.searchValue as string}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {typeFilter && (
          <button data-testid="type-change" onClick={() => typeFilter.onChange('lead_assigned')}>
            Type
          </button>
        )}
        {priorityFilter && (
          <button data-testid="priority-change" onClick={() => priorityFilter.onChange('high')}>
            Priority
          </button>
        )}
        {filterChips && (
          <>
            <button data-testid="tab-unread" onClick={() => filterChips.onChange('unread')}>
              Unread
            </button>
            <button data-testid="tab-all" onClick={() => filterChips.onChange('all')}>
              All
            </button>
            <span data-testid="active-tab">{filterChips.value}</span>
          </>
        )}
      </div>
    );
  }),
}));

// Mock @/components/notifications
vi.mock('@/components/notifications', () => ({
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
  getTypeFilterOptions: vi.fn(() => [
    { value: 'lead_assigned', label: 'Lead Assigned' },
    { value: 'deal_won', label: 'Deal Won' },
  ]),
}));

// Import the component under test
import NotificationsPage from '../page';

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params
    mockSearchParams.delete('filter');
  });

  it('renders SearchFilterBar component', () => {
    render(<NotificationsPage />);
    expect(screen.getByTestId('search-filter-bar')).toBeInTheDocument();
  });

  it('renders NotificationList component', () => {
    render(<NotificationsPage />);
    expect(screen.getByTestId('notification-list')).toBeInTheDocument();
  });

  it('renders page header with "Notifications" title', () => {
    render(<NotificationsPage />);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('passes correct props to SearchFilterBar', () => {
    render(<NotificationsPage />);
    expect(mockSearchFilterBarProps).toHaveBeenCalled();
    const props = mockSearchFilterBarProps.mock.calls[0][0];
    expect(props.searchValue).toBe('');
    expect(props.searchPlaceholder).toBe('Search notifications...');
    expect(props.filters).toHaveLength(2);
    expect(props.filters[0].id).toBe('type');
    expect(props.filters[1].id).toBe('priority');
    expect(props.filterChips).toBeDefined();
    expect(props.filterChips.options).toHaveLength(3);
  });

  it('manages search filter state', () => {
    render(<NotificationsPage />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'test search' } });
    expect(input).toHaveValue('test search');
  });

  it('manages type filter via SearchFilterBar', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('type-change'));
    // After clicking, SearchFilterBar re-renders with updated type value
    const latestProps = mockSearchFilterBarProps.mock.calls.at(-1)![0];
    const typeFilter = latestProps.filters.find((f: { id: string }) => f.id === 'type');
    expect(typeFilter.value).toBe('lead_assigned');
  });

  it('manages priority filter via SearchFilterBar', () => {
    render(<NotificationsPage />);
    fireEvent.click(screen.getByTestId('priority-change'));
    const latestProps = mockSearchFilterBarProps.mock.calls.at(-1)![0];
    const priorityFilter = latestProps.filters.find((f: { id: string }) => f.id === 'priority');
    expect(priorityFilter.value).toBe('high');
  });

  it('manages tab state via filterChips', () => {
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
      const latestProps = mockSearchFilterBarProps.mock.calls.at(-1)![0];
      const typeFilter = latestProps.filters.find((f: { id: string }) => f.id === 'type');
      expect(typeFilter.value).toBe('ai_insight');
    });

    it('?filter=mentions sets typeFilter to team_mention', () => {
      mockSearchParams.set('filter', 'mentions');
      render(<NotificationsPage />);
      const latestProps = mockSearchFilterBarProps.mock.calls.at(-1)![0];
      const typeFilter = latestProps.filters.find((f: { id: string }) => f.id === 'type');
      expect(typeFilter.value).toBe('team_mention');
    });

    it('?filter=sla-alerts sets typeFilter to system_alert', () => {
      mockSearchParams.set('filter', 'sla-alerts');
      render(<NotificationsPage />);
      const latestProps = mockSearchFilterBarProps.mock.calls.at(-1)![0];
      const typeFilter = latestProps.filters.find((f: { id: string }) => f.id === 'type');
      expect(typeFilter.value).toBe('system_alert');
    });

    it('?filter=system sets typeFilter to system_alert', () => {
      mockSearchParams.set('filter', 'system');
      render(<NotificationsPage />);
      const latestProps = mockSearchFilterBarProps.mock.calls.at(-1)![0];
      const typeFilter = latestProps.filters.find((f: { id: string }) => f.id === 'type');
      expect(typeFilter.value).toBe('system_alert');
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

  it('filter chips include All, Unread (3), and High Priority (1)', () => {
    render(<NotificationsPage />);
    const props = mockSearchFilterBarProps.mock.calls.at(-1)![0];
    const chips = props.filterChips.options;
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips[1]).toEqual({ id: 'unread', label: 'Unread (3)' });
    expect(chips[2]).toEqual(
      expect.objectContaining({ id: 'high', label: 'High Priority (1)' })
    );
  });
});
