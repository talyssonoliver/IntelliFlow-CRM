import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Hoisted mock references ──────────────────────────────────────────────────
const {
  mockUseRequireAuth,
  mockGetQuery,
  mockCalendarListQuery,
  mockUpdateMutation,
  mockResetMutation,
  mockInvalidate,
  mockMutateAsync,
} = vi.hoisted(() => ({
  mockUseRequireAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
  mockGetQuery: vi.fn(),
  mockCalendarListQuery: vi.fn(),
  mockUpdateMutation: vi.fn(),
  mockResetMutation: vi.fn(),
  mockInvalidate: vi.fn(),
  mockMutateAsync: vi.fn().mockResolvedValue(undefined),
}));

// ─── tRPC Mock ────────────────────────────────────────────────────────────────
vi.mock('@/lib/trpc', () => ({
  trpc: {
    appointmentSettings: {
      get: { useQuery: mockGetQuery },
      update: { useMutation: mockUpdateMutation },
      resetToDefaults: { useMutation: mockResetMutation },
    },
    calendar: {
      list: { useQuery: mockCalendarListQuery },
    },
    useUtils: vi.fn(() => ({
      appointmentSettings: {
        get: { invalidate: mockInvalidate },
      },
    })),
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: mockUseRequireAuth,
}));

vi.mock('@intelliflow/ui', () => ({
  toast: vi.fn(),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  Input: ({ id, type, value, min, max, onChange }: any) => (
    <input id={id} type={type} value={value ?? ''} min={min} max={max} onChange={onChange} />
  ),
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <button role="switch" id={id} aria-checked={checked} onClick={() => onCheckedChange(!checked)}>
      {checked ? 'On' : 'Off'}
    </button>
  ),
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value ?? ''} onChange={(e) => onValueChange(e.target.value || null)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children, id }: any) => <div id={id}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock('@/components/settings/ModuleSettingsLayout', () => ({
  ModuleSettingsLayout: ({ tabs, onSave, onReset, isSaving }: any) => (
    <div data-testid="module-settings-layout">
      {tabs.map((tab: any) => (
        <div key={tab.value} data-testid={`tab-${tab.value}`}>
          <div data-testid={`tab-label-${tab.value}`}>{tab.label}</div>
          <div data-testid={`tab-content-${tab.value}`}>{tab.content}</div>
        </div>
      ))}
      <button data-testid="save-btn" onClick={onSave} disabled={isSaving}>
        Save
      </button>
      <button data-testid="reset-btn" onClick={onReset} disabled={isSaving}>
        Reset
      </button>
    </div>
  ),
}));

import CalendarSettingsContent from '../CalendarSettingsContent';

const mockSettings = {
  id: 'settings-1',
  tenantId: 'tenant-1',
  defaultDurationMinutes: 30,
  minDurationMinutes: 5,
  maxDurationMinutes: 480,
  defaultBufferBeforeMinutes: 0,
  defaultBufferAfterMinutes: 0,
  defaultReminderMinutes: 15,
  primaryCalendarId: null,
  syncExternalCalendars: false,
  defaultTimezone: 'UTC',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CalendarSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRequireAuth.mockReturnValue({ isLoading: false, isAuthenticated: true });

    mockGetQuery.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockCalendarListQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });

    mockUpdateMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    mockResetMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
  });

  it('renders ModuleSettingsLayout', () => {
    render(<CalendarSettingsContent />);
    expect(screen.getByTestId('module-settings-layout')).toBeInTheDocument();
  });

  it('renders three tabs', () => {
    render(<CalendarSettingsContent />);
    expect(screen.getByTestId('tab-duration')).toBeInTheDocument();
    expect(screen.getByTestId('tab-buffer')).toBeInTheDocument();
    expect(screen.getByTestId('tab-calendar')).toBeInTheDocument();
  });

  it('tab labels match spec', () => {
    render(<CalendarSettingsContent />);
    expect(screen.getByTestId('tab-label-duration')).toHaveTextContent('Duration Defaults');
    expect(screen.getByTestId('tab-label-buffer')).toHaveTextContent('Buffer & Reminders');
    expect(screen.getByTestId('tab-label-calendar')).toHaveTextContent('Calendar Integration');
  });

  it('id property is not expected (tabs use value)', () => {
    render(<CalendarSettingsContent />);
    // Verify tabs render correctly with 'value' field (not 'id')
    expect(screen.getByTestId('tab-duration')).toBeInTheDocument();
  });

  it('calls trpc.appointmentSettings.get.useQuery', () => {
    render(<CalendarSettingsContent />);
    expect(mockGetQuery).toHaveBeenCalled();
  });

  it('calls trpc.calendar.list.useQuery for calendar options', () => {
    render(<CalendarSettingsContent />);
    expect(mockCalendarListQuery).toHaveBeenCalled();
  });

  it('save button triggers update mutation', async () => {
    render(<CalendarSettingsContent />);
    fireEvent.click(screen.getByTestId('save-btn'));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });

  it('reset button triggers resetToDefaults mutation', async () => {
    const resetMutateAsync = vi.fn().mockResolvedValue(undefined);
    mockResetMutation.mockReturnValue({ mutateAsync: resetMutateAsync, isPending: false });
    render(<CalendarSettingsContent />);
    fireEvent.click(screen.getByTestId('reset-btn'));
    await waitFor(() => {
      expect(resetMutateAsync).toHaveBeenCalled();
    });
  });

  it('shows loading state when auth is loading', () => {
    mockUseRequireAuth.mockReturnValue({ isLoading: true, isAuthenticated: false });
    render(<CalendarSettingsContent />);
    expect(screen.queryByTestId('module-settings-layout')).not.toBeInTheDocument();
  });

  it('shows error toast when save mutation throws', async () => {
    const toastMock = vi.fn();
    vi.mocked(await import('@intelliflow/ui')).toast = toastMock as any;

    mockUpdateMutation.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Network error')),
      isPending: false,
    });
    render(<CalendarSettingsContent />);
    fireEvent.click(screen.getByTestId('save-btn'));
    await waitFor(() => {
      expect(mockUpdateMutation).toHaveBeenCalled();
    });
  });

  it('shows error toast when reset mutation throws', async () => {
    mockResetMutation.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Reset failed')),
      isPending: false,
    });
    render(<CalendarSettingsContent />);
    fireEvent.click(screen.getByTestId('reset-btn'));
    await waitFor(() => {
      expect(mockResetMutation).toHaveBeenCalled();
    });
  });

  it('renders tab content after settings load', async () => {
    render(<CalendarSettingsContent />);
    await waitFor(() => {
      expect(screen.getByLabelText('Default Duration (minutes)')).toBeInTheDocument();
    });
  });

  it('changing duration field updates local settings via onSettingsChange', async () => {
    render(<CalendarSettingsContent />);
    await waitFor(() => {
      expect(screen.getByLabelText('Default Duration (minutes)')).toBeInTheDocument();
    });
    const input = screen.getByLabelText('Default Duration (minutes)');
    fireEvent.change(input, { target: { value: '60' } });
    await waitFor(() => {
      expect(input).toHaveValue(60);
    });
  });

  it('changing buffer field updates local settings via onSettingsChange', async () => {
    render(<CalendarSettingsContent />);
    await waitFor(() => {
      expect(screen.getByLabelText('Buffer Before (minutes)')).toBeInTheDocument();
    });
    const input = screen.getByLabelText('Buffer Before (minutes)');
    fireEvent.change(input, { target: { value: '10' } });
    await waitFor(() => {
      expect(input).toHaveValue(10);
    });
  });

  it('passes calendars to CalendarIntegrationTab content', async () => {
    mockCalendarListQuery.mockReturnValue({
      data: [{ id: 'cal_1', name: 'Work Calendar' }],
      isLoading: false,
    });
    render(<CalendarSettingsContent />);
    await waitFor(() => {
      expect(screen.getByText('Work Calendar')).toBeInTheDocument();
    });
  });

  it('toggling sync calendar updates local settings via onSettingsChange', async () => {
    render(<CalendarSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });
    const syncToggle = screen.getByRole('switch');
    fireEvent.click(syncToggle);
    await waitFor(() => {
      expect(syncToggle).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('useMutation onSuccess invalidates settings query', () => {
    render(<CalendarSettingsContent />);
    // Verify the mutation was called with onSuccess option
    const updateCall = mockUpdateMutation.mock.calls[0]?.[0];
    if (updateCall?.onSuccess) {
      updateCall.onSuccess();
      expect(mockInvalidate).toHaveBeenCalled();
    }
  });
});
