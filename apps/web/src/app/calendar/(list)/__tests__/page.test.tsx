/**
 * @vitest-environment jsdom
 *
 * Tests for the CalendarPage component.
 *
 * After the appointments/calendar split (Phase 2 of the migration),
 * /calendar renders ONLY the visual calendar grid. The list/table view
 * now lives at /appointments — tested separately in
 * apps/web/src/app/appointments/(list)/__tests__/page.test.tsx.
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

// ─── 3. @/lib/api ──────────────────────────────────────────────────
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

const mockQueryState = {
  data: mockListData as typeof mockListData | undefined,
  isLoading: false,
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

// ─── 4. @/hooks/useCalendarVisibility ──────────────────────────────
const mockCalendarVisibility: Record<string, boolean> = {
  personal: true,
  team: true,
  tasks: true,
  holidays: false,
};

vi.mock('@/hooks/useCalendarVisibility', () => ({
  useCalendarVisibility: () => ({
    calendars: [],
    toggle: vi.fn(),
    isVisible: (id: string) => mockCalendarVisibility[id] ?? true,
    setOnlyVisible: vi.fn(),
    addCalendar: vi.fn(),
    removeCalendar: vi.fn(),
    dbCalendars: [],
  }),
  CALENDAR_COLOR_OPTIONS: ['#3b82f6', '#22c55e', '#14b8a6', '#f59e0b'],
}));

// ─── 5. @/hooks/useAppointmentFilters ──────────────────────────────
const mockFilters = {
  search: '',
  status: '',
  appointmentType: '',
  sortBy: 'startTime' as const,
  sortOrder: 'asc' as const,
  page: 1,
  limit: 20,
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
    setCalendarView: vi.fn(),
  }),
}));

// ─── 6. @intelliflow/ui ────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ─── 7. @/components/shared ────────────────────────────────────────
vi.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    actions,
  }: Readonly<{
    title: string;
    actions?: Array<{ label: string; href?: string; onClick?: () => void }>;
  }>) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      {actions?.map((a) => (
        <a
          key={a.label}
          href={a.href}
          onClick={a.onClick}
          data-testid={`action-${a.label.toLowerCase().replace(/\s/g, '-')}`}
        >
          {a.label}
        </a>
      ))}
    </header>
  ),
}));

// ─── 8. @/components/tasks/TaskForm ────────────────────────────────
vi.mock('@/components/tasks/TaskForm', () => ({
  TaskForm: ({ open }: Readonly<{ open: boolean; [key: string]: unknown }>) =>
    open ? <div data-testid="task-form">Task Form</div> : null,
}));

// ─── 9. @/components/appointments ──────────────────────────────────
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
}));

// ─── Imports after all mocks ──────────────────────────────────────
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    mockCalendarVisibility.personal = true;
    mockCalendarVisibility.team = true;
    mockCalendarVisibility.tasks = true;
    mockCalendarVisibility.holidays = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('exports a default function', async () => {
    const CalendarPage = await loadCalendarPage();
    expect(typeof CalendarPage).toBe('function');
  });

  it('renders PageHeader with "Calendar" title', async () => {
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('renders skeleton when auth is loading', async () => {
    mockAuthState.isLoading = true;
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('appointment-calendar')).not.toBeInTheDocument();
  });

  it('renders skeleton when unauthenticated', async () => {
    mockAuthState.isAuthenticated = false;
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('appointment-calendar')).not.toBeInTheDocument();
  });

  it('renders AppointmentCalendar with appointments', async () => {
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    const calendar = screen.getByTestId('appointment-calendar');
    expect(calendar).toBeInTheDocument();
    expect(calendar).toHaveAttribute('data-appointment-count', '1');
  });

  it('does NOT render AppointmentList (that lives at /appointments)', async () => {
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    expect(screen.queryByTestId('appointment-list')).not.toBeInTheDocument();
  });

  it('navigates to appointment detail on calendar click', async () => {
    const user = userEvent.setup();
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    await user.click(screen.getByTestId('calendar-appt-click'));
    expect(mockPush).toHaveBeenCalledWith('/appointments/appt-1');
  });

  it('navigates to new appointment on create-with-slot', async () => {
    const user = userEvent.setup();
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    await user.click(screen.getByTestId('calendar-create-slot'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/appointments/new?start='));
  });

  it('exposes "Appointments List" and "New Appointment" actions', async () => {
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    expect(screen.getByTestId('action-appointments-list')).toBeInTheDocument();
    expect(screen.getByTestId('action-new-appointment')).toBeInTheDocument();
  });

  it('renders calendar with zero appointments when data is undefined', async () => {
    mockQueryState.data = undefined;
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    const calendar = screen.getByTestId('appointment-calendar');
    expect(calendar).toHaveAttribute('data-appointment-count', '0');
  });

  it('renders zero appointments when personal calendar is toggled off', async () => {
    mockCalendarVisibility.personal = false;
    const CalendarPage = await loadCalendarPage();
    render(<CalendarPage />);
    const calendar = screen.getByTestId('appointment-calendar');
    expect(calendar).toHaveAttribute('data-appointment-count', '0');
  });
});
