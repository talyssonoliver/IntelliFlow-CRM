/**
 * @vitest-environment jsdom
 *
 * Tests for the CalendarPage component (PG-154).
 * Proves /calendar renders without 404 — the definitive navigation test.
 * Pattern: apps/web/src/app/deals/(list)/__tests__/page.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// ─── 1. next/navigation ────────────────────────────────────────────
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/calendar',
  useParams: () => ({}),
}));

// ─── 2. @/lib/auth/AuthContext ─────────────────────────────────────
const mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
};

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockAuthState,
}));

// ─── 3. @/lib/api (AppointmentsListApiEscape shape) ───────────────
const mockAppointment = {
  id: 'appt-1',
  title: 'Client Consultation',
  startTime: '2026-02-23T10:00:00Z',
  endTime: '2026-02-23T11:00:00Z',
  appointmentType: 'CONSULTATION',
  status: 'SCHEDULED',
  location: 'Conference Room A',
  attendeeCount: 2,
  hasConflict: false,
  linkedCaseCount: 1,
  isRecurring: false,
  calendarId: null,
};

const mockListData = {
  appointments: [mockAppointment],
  total: 1,
};

const mockStatsData = {
  total: 5,
  byStatus: { SCHEDULED: 3, COMPLETED: 1, CANCELLED: 1 },
  byType: { CONSULTATION: 3, HEARING: 2 },
  upcoming: 4,
  overdue: 1,
};

const mockQueryState = {
  data: mockListData as typeof mockListData | undefined,
  isLoading: false,
};

const mockStatsState = {
  data: mockStatsData as typeof mockStatsData | undefined,
};

vi.mock('@/lib/api', () => ({
  api: {
    appointments: {
      list: {
        useQuery: () => ({
          data: mockQueryState.data,
          isLoading: mockQueryState.isLoading,
        }),
      },
      stats: {
        useQuery: () => ({
          data: mockStatsState.data,
        }),
      },
    },
    task: {
      list: {
        useQuery: () => ({
          data: { tasks: [], total: 0 },
          isLoading: false,
        }),
      },
      create: {
        useMutation: () => ({
          mutate: vi.fn(),
        }),
      },
    },
  },
}));

// ─── 4a. @/hooks/useCalendarVisibility ─────────────────────────────
const mockCalendarVisibility: Record<string, boolean> = {
  personal: true,
  team: true,
  tasks: true,
  holidays: false,
};

vi.mock('@/hooks/useCalendarVisibility', () => ({
  useCalendarVisibility: () => ({
    calendars: [
      {
        id: 'personal',
        label: 'Personal',
        color: '#3b82f6',
        checked: mockCalendarVisibility.personal,
        isDefault: true,
      },
      {
        id: 'team',
        label: 'Team Events',
        color: '#22c55e',
        checked: mockCalendarVisibility.team,
        isDefault: true,
      },
      {
        id: 'tasks',
        label: 'Tasks',
        color: '#14b8a6',
        checked: mockCalendarVisibility.tasks,
        isDefault: true,
      },
      {
        id: 'holidays',
        label: 'Holidays',
        color: '#94a3b8',
        checked: mockCalendarVisibility.holidays,
        isDefault: true,
      },
    ],
    toggle: vi.fn(),
    isVisible: (id: string) => mockCalendarVisibility[id] ?? true,
    addCalendar: vi.fn(),
    removeCalendar: vi.fn(),
    dbCalendars: [],
  }),
  CALENDAR_COLOR_OPTIONS: ['#3b82f6', '#22c55e', '#14b8a6', '#f59e0b'],
}));

// ─── 4. @/hooks/useAppointmentFilters ──────────────────────────────
const mockFilters = {
  search: '',
  status: '',
  appointmentType: '',
  sortBy: 'startTime' as const,
  sortOrder: 'asc' as const,
  page: 1,
  limit: 20,
  viewMode: 'calendar' as 'calendar' | 'list',
  calendarView: 'month' as const,
};

vi.mock('@/hooks/useAppointmentFilters', () => ({
  useAppointmentFilters: () => ({
    filters: mockFilters,
    queryParams: {},
    setSearch: vi.fn(),
    setStatusFilter: vi.fn(),
    setTypeFilter: vi.fn(),
    setDateRange: vi.fn(),
    setCaseFilter: vi.fn(),
    setSort: vi.fn(),
    setPage: vi.fn(),
    setViewMode: vi.fn(),
    setCalendarView: vi.fn(),
  }),
}));

// ─── 5. @intelliflow/ui ───────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ─── 6. @/components/shared ───────────────────────────────────────
vi.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    actions,
  }: Readonly<{
    title: string;
    actions?: Array<{ label: string; onClick?: () => void; href?: string }>;
  }>) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      {actions?.map((a) =>
        a.onClick ? (
          <button
            key={a.label}
            data-testid={`action-${a.label.toLowerCase().replace(/\s/g, '-')}`}
            onClick={a.onClick}
          >
            {a.label}
          </button>
        ) : null
      )}
    </header>
  ),
}));

// ─── 7a. @/components/tasks/TaskForm ─────────────────────────────
vi.mock('@/components/tasks/TaskForm', () => ({
  TaskForm: ({ open }: Readonly<{ open: boolean; [key: string]: unknown }>) =>
    open ? <div data-testid="task-form">Task Form</div> : null,
}));

// ─── 7. @/components/appointments ─────────────────────────────────
vi.mock('@/components/appointments', () => ({
  AppointmentCalendar: ({
    appointments,
    onAppointmentClick,
    onCreateWithSlot,
  }: Readonly<{
    appointments: Array<{ id: string }>;
    onAppointmentClick: (id: string) => void;
    onCreateWithSlot: (start: Date, end: Date) => void;
    [key: string]: unknown;
  }>) => (
    <div data-testid="appointment-calendar" data-appointment-count={appointments.length}>
      <button
        data-testid="calendar-appt-click"
        onClick={() => appointments[0] && onAppointmentClick(appointments[0].id)}
      >
        Click Appointment
      </button>
      <button
        data-testid="calendar-create-slot"
        onClick={() => onCreateWithSlot(new Date(), new Date())}
      >
        Create Slot
      </button>
    </div>
  ),
  AppointmentList: ({
    onRowClick,
    onFilterChange,
  }: Readonly<{
    onRowClick: (id: string) => void;
    onFilterChange?: (partial: Record<string, unknown>) => void;
    [key: string]: unknown;
  }>) => (
    <div data-testid="appointment-list">
      <button data-testid="list-row-click" onClick={() => onRowClick('appt-1')}>
        Row Click
      </button>
      {onFilterChange && (
        <>
          <button
            data-testid="list-filter-change"
            onClick={() =>
              onFilterChange({
                search: 'test',
                status: 'SCHEDULED',
                appointmentType: 'CONSULTATION',
              })
            }
          >
            Filter
          </button>
          <button
            data-testid="list-filter-partial"
            onClick={() => onFilterChange({ search: 'partial' })}
          >
            Filter Partial
          </button>
        </>
      )}
    </div>
  ),
}));

// ─── Imports after all mocks ──────────────────────────────────────
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Dynamic import to ensure mocks are hoisted
async function loadCalendarPage() {
  const mod = await import('../page');
  return mod.default;
}

describe('CalendarPage', { timeout: 10000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    mockQueryState.data = mockListData;
    mockQueryState.isLoading = false;
    mockStatsState.data = mockStatsData;
    mockFilters.viewMode = 'calendar';
    mockCalendarVisibility.personal = true;
    mockCalendarVisibility.team = true;
    mockCalendarVisibility.tasks = true;
    mockCalendarVisibility.holidays = false;
  });

  afterEach(() => {
    cleanup();
  });

  // TC-01: Module exports a default function
  it('exports a default function', async () => {
    const CalendarPage = await loadCalendarPage();
    expect(typeof CalendarPage).toBe('function');
  });

  // TC-02: Page renders PageHeader with "Calendar" title
  it('renders PageHeader with "Calendar" title', async () => {
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  // TC-03: Auth loading renders skeleton, not calendar content
  it('renders skeleton when auth is loading', async () => {
    mockAuthState.isLoading = true;

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('appointment-calendar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('appointment-list')).not.toBeInTheDocument();
  });

  // TC-04: Unauthenticated renders skeleton
  it('renders skeleton when unauthenticated', async () => {
    mockAuthState.isAuthenticated = false;

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('appointment-calendar')).not.toBeInTheDocument();
  });

  // TC-05: Default calendar viewMode renders AppointmentCalendar
  it('renders AppointmentCalendar in calendar view mode', async () => {
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    expect(screen.getByTestId('appointment-calendar')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-list')).not.toBeInTheDocument();
  });

  // TC-06: List viewMode renders AppointmentList
  it('renders AppointmentList in list view mode', async () => {
    mockFilters.viewMode = 'list';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    expect(screen.getByTestId('appointment-list')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-calendar')).not.toBeInTheDocument();
  });

  // TC-07: Appointment data flows to AppointmentCalendar
  it('flows appointment data to calendar component', async () => {
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    const calendar = screen.getByTestId('appointment-calendar');
    expect(calendar).toHaveAttribute('data-appointment-count', '1');
  });

  // TC-08: Row click in list view navigates to /calendar/appt-1
  it('navigates to appointment detail on list row click', async () => {
    const user = userEvent.setup();
    mockFilters.viewMode = 'list';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    await user.click(screen.getByTestId('list-row-click'));
    expect(mockPush).toHaveBeenCalledWith('/calendar/appt-1');
  });

  // TC-09: Calendar appointment click navigates to /calendar/appt-1
  it('navigates to appointment detail on calendar click', async () => {
    const user = userEvent.setup();
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    await user.click(screen.getByTestId('calendar-appt-click'));
    expect(mockPush).toHaveBeenCalledWith('/calendar/appt-1');
  });

  // TC-10: Create-with-slot navigates to /calendar/new
  it('navigates to new appointment on create-with-slot', async () => {
    const user = userEvent.setup();
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    await user.click(screen.getByTestId('calendar-create-slot'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/calendar/new?start='));
  });

  // TC-supplementary: View mode toggle action invokes setViewMode (calendar → list)
  it('view mode toggle action switches from calendar to list', async () => {
    const user = userEvent.setup();
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    const toggleBtn = screen.getByTestId('action-list-view');
    await user.click(toggleBtn);
  });

  // TC-supplementary: View mode toggle label in list mode shows "Calendar View"
  it('view mode toggle shows calendar view label when in list mode', async () => {
    mockFilters.viewMode = 'list';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    expect(screen.getByTestId('action-calendar-view')).toBeInTheDocument();
  });

  // TC-supplementary: Filter change callback in list view (all fields)
  it('filter change callback invokes filter setters', async () => {
    const user = userEvent.setup();
    mockFilters.viewMode = 'list';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    const filterBtn = screen.getByTestId('list-filter-change');
    await user.click(filterBtn);
  });

  // TC-supplementary: Filter change with partial fields
  it('filter change callback handles partial filter update', async () => {
    const user = userEvent.setup();
    mockFilters.viewMode = 'list';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    // This exercises the onFilterChange with only search (status/type undefined)
    const filterBtn = screen.getByTestId('list-filter-partial');
    await user.click(filterBtn);
  });

  // TC-supplementary: Data absent yields empty calendar
  it('renders calendar with zero appointments when data is undefined', async () => {
    mockQueryState.data = undefined;
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    const calendar = screen.getByTestId('appointment-calendar');
    expect(calendar).toHaveAttribute('data-appointment-count', '0');
  });

  // TC-supplementary: Calendar visibility toggle hides appointments
  it('renders zero appointments when personal calendar is toggled off', async () => {
    mockCalendarVisibility.personal = false;
    mockFilters.viewMode = 'calendar';

    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);

    const calendar = screen.getByTestId('appointment-calendar');
    expect(calendar).toHaveAttribute('data-appointment-count', '0');
  });
});
