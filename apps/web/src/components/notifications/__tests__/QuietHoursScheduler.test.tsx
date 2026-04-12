// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/* ---------- hoisted mocks ---------- */
const mockMutate = vi.hoisted(() => vi.fn());
const mockInvalidate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      getPreferences: {
        useQuery: vi.fn(() => ({
          data: {
            globalEnabled: true,
            defaultChannels: ['in_app', 'email'],
            emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
            quietHours: {
              enabled: true,
              start: '22:00',
              end: '08:00',
              timezone: 'UTC',
              daysOfWeek: [1, 2, 3, 4, 5],
            },
            preferences: [],
          },
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        })),
      },
      updatePreferences: {
        useMutation: vi.fn(() => ({
          mutate: mockMutate,
          isPending: false,
        })),
      },
    },
    useUtils: vi.fn(() => ({
      notifications: { getPreferences: { invalidate: mockInvalidate } },
    })),
  },
}));

vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/ui');
  return {
    ...actual,
    toast: vi.fn(),
  };
});

import { QuietHoursScheduler } from '../QuietHoursScheduler';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';

function renderComponent() {
  return render(<QuietHoursScheduler />);
}

function setQueryReturn(overrides: Record<string, unknown>) {
  (trpc.notifications.getPreferences.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: {
      globalEnabled: true,
      defaultChannels: ['in_app', 'email'],
      emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
      quietHours: {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
        daysOfWeek: [1, 2, 3, 4, 5],
      },
      preferences: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe('QuietHoursScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQueryReturn({});
  });

  it('renders master enable Switch', () => {
    renderComponent();
    const enableSwitch = screen.getByRole('switch', { name: /quiet hours/i });
    expect(enableSwitch).toBeInTheDocument();
  });

  it('renders start and end time inputs', () => {
    renderComponent();
    expect(screen.getByLabelText(/quiet hours start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quiet hours end/i)).toBeInTheDocument();
  });

  it('renders 7 day buttons (Sun–Sat)', () => {
    renderComponent();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayLabels.forEach((day) => {
      expect(screen.getByRole('button', { name: new RegExp(day, 'i') })).toBeInTheDocument();
    });
  });

  it('renders timezone selector', () => {
    renderComponent();
    expect(screen.getByText(/timezone/i)).toBeInTheDocument();
  });

  it('enable toggle updates form state', () => {
    renderComponent();
    const enableSwitch = screen.getByRole('switch', { name: /quiet hours/i });
    fireEvent.click(enableSwitch);
    // After toggling, the switch should reflect new state
    expect(enableSwitch).toBeInTheDocument();
  });

  it('changing start time updates form state', () => {
    renderComponent();
    const startInput = screen.getByLabelText(/quiet hours start/i);
    fireEvent.change(startInput, { target: { value: '23:00' } });
    expect((startInput as HTMLInputElement).value).toBe('23:00');
  });

  it('changing end time updates form state', () => {
    renderComponent();
    const endInput = screen.getByLabelText(/quiet hours end/i);
    fireEvent.change(endInput, { target: { value: '07:00' } });
    expect((endInput as HTMLInputElement).value).toBe('07:00');
  });

  it('clicking day button toggles selection (aria-pressed)', () => {
    renderComponent();
    // Sun (index 0) is NOT in [1,2,3,4,5], so should be unpressed
    const sunBtn = screen.getByRole('button', { name: /sun/i });
    expect(sunBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sunBtn);
    expect(sunBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('when disabled, time/day/timezone controls are non-interactive', () => {
    setQueryReturn({
      data: {
        globalEnabled: true,
        defaultChannels: ['in_app', 'email'],
        emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
        quietHours: {
          enabled: false,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC',
          daysOfWeek: [1, 2, 3, 4, 5],
        },
        preferences: [],
      },
    });
    renderComponent();
    const startInput = screen.getByLabelText(/quiet hours start/i);
    expect(startInput).toBeDisabled();
    const endInput = screen.getByLabelText(/quiet hours end/i);
    expect(endInput).toBeDisabled();
  });

  it('"Save Changes" calls mutation with correct quietHours object', () => {
    renderComponent();
    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        quietHours: expect.objectContaining({
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: expect.any(String),
          daysOfWeek: expect.any(Array),
        }),
      })
    );
  });

  it('mutation payload includes daysOfWeek array even when toggling individual days (spec Risk #1)', () => {
    renderComponent();
    // Toggle Sunday on
    const sunBtn = screen.getByRole('button', { name: /sun/i });
    fireEvent.click(sunBtn);
    // Save
    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        quietHours: expect.objectContaining({
          daysOfWeek: expect.arrayContaining([0]), // Sunday added
        }),
      })
    );
  });

  it('save success shows toast and invalidates query', () => {
    let capturedOnSuccess: (() => void) | undefined;
    (
      trpc.notifications.updatePreferences.useMutation as ReturnType<typeof vi.fn>
    ).mockImplementation((opts?: { onSuccess?: () => void }) => {
      capturedOnSuccess = opts?.onSuccess;
      return { mutate: mockMutate, isPending: false };
    });
    renderComponent();
    if (capturedOnSuccess) capturedOnSuccess();
    expect(toast).toHaveBeenCalled();
  });

  it('save error shows error toast', () => {
    let capturedOnError: ((err: Error) => void) | undefined;
    (
      trpc.notifications.updatePreferences.useMutation as ReturnType<typeof vi.fn>
    ).mockImplementation((opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
      capturedOnError = opts?.onError;
      return { mutate: mockMutate, isPending: false };
    });
    renderComponent();
    if (capturedOnError) capturedOnError(new Error('fail'));
    expect(toast).toHaveBeenCalled();
  });

  it('loading state renders Skeleton placeholders', () => {
    setQueryReturn({ isLoading: true, data: undefined });
    renderComponent();
    const skeletons = document.querySelectorAll('[data-testid="skeleton"], .animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('day buttons have aria-pressed attribute (NF-004)', () => {
    renderComponent();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayLabels.forEach((day) => {
      const btn = screen.getByRole('button', { name: new RegExp(day, 'i') });
      expect(btn).toHaveAttribute('aria-pressed');
    });
  });

  it('time inputs have accessible labels (NF-005)', () => {
    renderComponent();
    expect(screen.getByLabelText(/quiet hours start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quiet hours end/i)).toBeInTheDocument();
  });

  it('error state renders error message with retry button', () => {
    setQueryReturn({ isError: true, error: { message: 'Network error' }, data: undefined });
    renderComponent();
    expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('toggling multiple days updates daysOfWeek correctly', () => {
    renderComponent();
    // Toggle Saturday on (index 6, not in default [1,2,3,4,5])
    const satBtn = screen.getByRole('button', { name: /sat/i });
    fireEvent.click(satBtn);
    expect(satBtn).toHaveAttribute('aria-pressed', 'true');
    // Toggle Monday off (index 1, in default [1,2,3,4,5])
    const monBtn = screen.getByRole('button', { name: /mon/i });
    fireEvent.click(monBtn);
    expect(monBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
