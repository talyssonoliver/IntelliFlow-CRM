/**
 * @vitest-environment jsdom
 *
 * Tests for /appointments list page — parallel surface to /calendar list mode
 * introduced in Phase 1 of the appointments/calendar split migration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// ─── next/navigation ────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/appointments',
  useParams: () => ({}),
}));

// ─── @/lib/auth/AuthContext ─────────────────────────────────────────
const mockAuthState = { isLoading: false, isAuthenticated: true };
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockAuthState,
}));

// ─── @/lib/api ──────────────────────────────────────────────────────
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

const mockListData: { appointments: unknown[]; total: number } = {
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

vi.mock('@/lib/api', () => ({
  api: {
    appointments: {
      list: {
        useQuery: () => ({ data: mockListData, isLoading: false }),
      },
      stats: {
        useQuery: () => ({ data: mockStatsData }),
      },
    },
  },
}));

// ─── @/hooks/useAppointmentFilters ──────────────────────────────────
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
    setViewMode: vi.fn(),
    setCalendarView: vi.fn(),
  }),
}));

// ─── @intelliflow/ui ────────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ─── @/components/shared ────────────────────────────────────────────
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

// ─── @/components/appointments ──────────────────────────────────────
vi.mock('@/components/appointments', () => ({
  AppointmentList: ({
    appointments,
    total,
    stats,
    onRowClick,
  }: Readonly<{
    appointments: Array<{ id: string }>;
    total: number;
    stats: { upcoming: number; overdue: number };
    onRowClick: (id: string) => void;
  }>) => (
    <div
      data-testid="appointment-list"
      data-count={appointments.length}
      data-total={total}
      data-upcoming={stats.upcoming}
      data-overdue={stats.overdue}
    >
      <button
        data-testid="row-click"
        onClick={() => appointments[0] && onRowClick(appointments[0].id)}
      >
        Click Row
      </button>
    </div>
  ),
}));

// ─── SUT ────────────────────────────────────────────────────────────
import AppointmentsListPage from '../page';
import { render, screen, cleanup } from '@testing-library/react';

describe('AppointmentsListPage (/appointments)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });
  afterEach(cleanup);

  it('renders the page header with "Appointments" title', () => {
    render(<AppointmentsListPage />);
    expect(screen.getByRole('heading', { name: /appointments/i })).toBeDefined();
  });

  it('exposes "Calendar View" and "New Appointment" actions', () => {
    render(<AppointmentsListPage />);
    expect(screen.getByTestId('action-calendar-view')).toBeDefined();
    expect(screen.getByTestId('action-new-appointment')).toBeDefined();
  });

  it('renders AppointmentList with appointments and appointment-only stats', () => {
    render(<AppointmentsListPage />);
    const list = screen.getByTestId('appointment-list');
    expect(list.getAttribute('data-count')).toBe('1');
    expect(list.getAttribute('data-total')).toBe('1');
    // Stats should be the appointment-only numbers (no task merging)
    expect(list.getAttribute('data-upcoming')).toBe('4');
    expect(list.getAttribute('data-overdue')).toBe('1');
  });

  it('row click routes to /appointments/[id]', () => {
    render(<AppointmentsListPage />);
    const btn = screen.getByTestId('row-click');
    btn.click();
    expect(mockPush).toHaveBeenCalledWith('/appointments/appt-1');
  });
});
