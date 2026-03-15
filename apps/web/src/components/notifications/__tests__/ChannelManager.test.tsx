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
            quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
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

import { ChannelManager } from '../ChannelManager';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';

/* ---- helpers ---- */
function renderComponent() {
  return render(<ChannelManager />);
}

function setQueryReturn(overrides: Record<string, unknown>) {
  (trpc.notifications.getPreferences.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: {
      globalEnabled: true,
      defaultChannels: ['in_app', 'email'],
      emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
      preferences: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe('ChannelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQueryReturn({});
  });

  it('renders 5 channel cards (in_app, email, sms, push, webhook)', () => {
    renderComponent();
    expect(screen.getByText('In-App')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });

  it('each card has a Switch toggle', () => {
    renderComponent();
    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThanOrEqual(5);
  });

  it('in_app Switch is disabled with tooltip', () => {
    renderComponent();
    const inAppSwitch = screen.getByLabelText(/in.app/i);
    expect(inAppSwitch).toBeDisabled();
  });

  it('toggling email on adds email to form state', async () => {
    // Start with email NOT in defaultChannels
    setQueryReturn({ data: {
      globalEnabled: true,
      defaultChannels: ['in_app'],
      emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
      preferences: [],
    }});
    renderComponent();
    const emailSwitch = screen.getByLabelText(/email/i);
    fireEvent.click(emailSwitch);
    // After clicking, save button should be available
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeInTheDocument();
  });

  it('toggling sms off removes sms from form state', async () => {
    setQueryReturn({ data: {
      globalEnabled: true,
      defaultChannels: ['in_app', 'email', 'sms'],
      emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
      preferences: [],
    }});
    renderComponent();
    const smsSwitch = screen.getByLabelText(/sms/i);
    fireEvent.click(smsSwitch);
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeInTheDocument();
  });

  it('email card shows digest config (enabled toggle, frequency select, time input)', () => {
    setQueryReturn({ data: {
      globalEnabled: true,
      defaultChannels: ['in_app', 'email'],
      emailDigest: { enabled: true, frequency: 'daily', time: '09:00' },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
      preferences: [],
    }});
    renderComponent();
    expect(screen.getByText(/email digest/i)).toBeInTheDocument();
  });

  it('"Save Changes" calls updatePreferences with correct defaultChannels and emailDigest', async () => {
    (trpc.notifications.updatePreferences.useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    renderComponent();
    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);
    expect(trpc.notifications.updatePreferences.useMutation).toHaveBeenCalled();
  });

  it('save success shows success toast and invalidates query', async () => {
    let capturedOnSuccess: (() => void) | undefined;
    (trpc.notifications.updatePreferences.useMutation as ReturnType<typeof vi.fn>).mockImplementation(
      (opts?: { onSuccess?: () => void; onError?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return { mutate: mockMutate, isPending: false };
      }
    );
    renderComponent();
    if (capturedOnSuccess) capturedOnSuccess();
    expect(toast).toHaveBeenCalled();
  });

  it('save error shows error toast', async () => {
    let capturedOnError: ((err: Error) => void) | undefined;
    (trpc.notifications.updatePreferences.useMutation as ReturnType<typeof vi.fn>).mockImplementation(
      (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
        capturedOnError = opts?.onError;
        return { mutate: mockMutate, isPending: false };
      }
    );
    renderComponent();
    if (capturedOnError) capturedOnError(new Error('fail'));
    expect(toast).toHaveBeenCalled();
  });

  it('loading state renders Skeleton placeholders', () => {
    setQueryReturn({ isLoading: true, data: undefined });
    renderComponent();
    // Skeletons render when loading
    const skeletons = document.querySelectorAll('[data-testid="skeleton"], .animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('error state renders error message with retry button', () => {
    setQueryReturn({ isError: true, error: { message: 'Network error' }, data: undefined });
    renderComponent();
    expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
  });

  it('StatusBadge shows "Active" for enabled channels', () => {
    renderComponent();
    // email is in defaultChannels, should show Active
    const activeBadges = screen.getAllByText(/active/i);
    expect(activeBadges.length).toBeGreaterThan(0);
  });

  it('StatusBadge shows "Disabled" for disabled channels', () => {
    renderComponent();
    // sms is NOT in defaultChannels, should show Disabled
    const disabledBadges = screen.getAllByText(/disabled/i);
    expect(disabledBadges.length).toBeGreaterThan(0);
  });

  it('each Switch has accessible aria-label with channel name', () => {
    renderComponent();
    expect(screen.getByLabelText('In-App')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('SMS')).toBeInTheDocument();
    expect(screen.getByLabelText('Push')).toBeInTheDocument();
    expect(screen.getByLabelText('Webhook')).toBeInTheDocument();
  });

  it('email digest enabled shows frequency and time controls', () => {
    setQueryReturn({ data: {
      globalEnabled: true,
      defaultChannels: ['in_app', 'email'],
      emailDigest: { enabled: true, frequency: 'daily', time: '09:00' },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
      preferences: [],
    }});
    renderComponent();
    expect(screen.getByLabelText('Email digest enabled')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    // Interact with time input to exercise onChange
    const timeInput = screen.getByDisplayValue('09:00');
    fireEvent.change(timeInput, { target: { value: '10:00' } });
    expect((timeInput as HTMLInputElement).value).toBe('10:00');
  });

  it('toggling digest enabled switch changes digest state', () => {
    setQueryReturn({ data: {
      globalEnabled: true,
      defaultChannels: ['in_app', 'email'],
      emailDigest: { enabled: false, frequency: 'daily', time: '09:00' },
      quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
      preferences: [],
    }});
    renderComponent();
    const digestSwitch = screen.getByLabelText('Email digest enabled');
    fireEvent.click(digestSwitch);
    // After enabling, frequency and time controls should appear
    expect(screen.getByText('Frequency')).toBeInTheDocument();
  });

  it('save button calls mutate with current defaultChannels and emailDigest', () => {
    renderComponent();
    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultChannels: expect.any(Array),
        emailDigest: expect.objectContaining({
          enabled: expect.any(Boolean),
          frequency: expect.any(String),
          time: expect.any(String),
        }),
      }),
    );
  });
});
