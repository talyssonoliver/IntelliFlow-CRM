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
            preferences: [
              {
                type: 'task_assigned',
                enabled: true,
                channels: ['in_app', 'email', 'push'],
                frequency: 'instant',
              },
              { type: 'task_due_soon', enabled: true, channels: ['in_app'], frequency: 'instant' },
              {
                type: 'deal_stage_changed',
                enabled: true,
                channels: ['in_app'],
                frequency: 'instant',
              },
              {
                type: 'lead_assigned',
                enabled: true,
                channels: ['in_app', 'email'],
                frequency: 'instant',
              },
              { type: 'ai_insight', enabled: true, channels: ['in_app'], frequency: 'instant' },
              {
                type: 'system_alert',
                enabled: true,
                channels: ['in_app', 'email', 'push', 'sms'],
                frequency: 'instant',
              },
            ],
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

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => ({
    user: { id: 'u1', name: 'Test User' },
    isAuthenticated: true,
    loading: false,
  })),
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    breadcrumbs,
    description,
  }: {
    title: string;
    breadcrumbs?: Array<{ label: string }>;
    description?: string;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {breadcrumbs?.map((b) => (
        <span key={b.label}>{b.label}</span>
      ))}
    </div>
  ),
}));

import NotificationSettingsPage from '../../settings/page';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';

function renderPage() {
  return render(<NotificationSettingsPage />);
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
      preferences: [
        {
          type: 'task_assigned',
          enabled: true,
          channels: ['in_app', 'email', 'push'],
          frequency: 'instant',
        },
        { type: 'task_due_soon', enabled: true, channels: ['in_app'], frequency: 'instant' },
        { type: 'deal_stage_changed', enabled: true, channels: ['in_app'], frequency: 'instant' },
        {
          type: 'lead_assigned',
          enabled: true,
          channels: ['in_app', 'email'],
          frequency: 'instant',
        },
        { type: 'ai_insight', enabled: true, channels: ['in_app'], frequency: 'instant' },
        {
          type: 'system_alert',
          enabled: true,
          channels: ['in_app', 'email', 'push', 'sms'],
          frequency: 'instant',
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe('NotificationSettingsPage (Hub)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQueryReturn({});
  });

  it('renders PageHeader with title and breadcrumbs', () => {
    renderPage();
    expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders "Channels" summary card with enabled channel count and link', () => {
    renderPage();
    expect(screen.getByText('Channels')).toBeInTheDocument();
    const channelLink = screen.getByRole('link', { name: /channels/i });
    expect(channelLink).toHaveAttribute('href', '/notifications/channels');
    expect(screen.getByText(/2 channels enabled/)).toBeInTheDocument();
  });

  it('renders "Quiet Hours" summary card with status and link', () => {
    renderPage();
    expect(screen.getByText(/quiet hours/i)).toBeInTheDocument();
    const qhLink = screen.getByRole('link', { name: /quiet hours/i });
    expect(qhLink).toHaveAttribute('href', '/notifications/quiet-hours');
    expect(screen.getByText(/22:00/)).toBeInTheDocument();
  });

  it('renders all 4 channel column headers (In-App, Email, Push, SMS)', () => {
    renderPage();
    expect(screen.getByText('In-App')).toBeInTheDocument();
    // Email appears in multiple places — column header + summary card
    expect(screen.getAllByText('Email').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
  });

  it('renders category rows with icons and descriptions visible in matrix', () => {
    renderPage();
    expect(screen.getByText('Tasks & Deadlines')).toBeInTheDocument();
    expect(screen.getByText('Deals & Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Leads & Contacts')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('System & Security')).toBeInTheDocument();
  });

  it('category-level checkboxes are visible without expanding', () => {
    renderPage();
    // System & Security has all 4 channels → all 4 category-level checkboxes should be checked
    const sysCheckbox = screen.getByRole('checkbox', { name: /system & security sms/i });
    expect(sysCheckbox).toBeChecked();
  });

  it('expands a category to show individual types with friendly names', () => {
    renderPage();
    fireEvent.click(screen.getByText('Tasks & Deadlines'));
    expect(screen.getByText('Task Assigned')).toBeInTheDocument();
    expect(screen.getByText('Task Due Soon')).toBeInTheDocument();
  });

  it('shows per-type checkboxes across all 4 channels when expanded', () => {
    renderPage();
    fireEvent.click(screen.getByText('Tasks & Deadlines'));
    // Task Assigned has push enabled
    const pushCheckbox = screen.getByRole('checkbox', { name: /task assigned push/i });
    expect(pushCheckbox).toBeChecked();
    // Task Assigned does not have SMS
    const smsCheckbox = screen.getByRole('checkbox', { name: /task assigned sms/i });
    expect(smsCheckbox).not.toBeChecked();
  });

  it('collapses a category when clicked again', () => {
    renderPage();
    const categoryBtn = screen.getByText('Tasks & Deadlines').closest('button')!;
    fireEvent.click(categoryBtn);
    expect(screen.getByText('Task Assigned')).toBeInTheDocument();
    fireEvent.click(categoryBtn);
    expect(screen.queryByText('Task Assigned')).not.toBeInTheDocument();
  });

  it('toggling a category-level checkbox calls mutation', () => {
    renderPage();
    const checkbox = screen.getByRole('checkbox', { name: /tasks & deadlines sms/i });
    fireEvent.click(checkbox);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.any(Array) })
    );
  });

  it('toggling a per-type checkbox calls mutation', () => {
    renderPage();
    fireEvent.click(screen.getByText('Tasks & Deadlines'));
    const checkbox = screen.getByRole('checkbox', { name: /task assigned sms/i });
    fireEvent.click(checkbox);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.any(Array) })
    );
  });

  it('does not show raw type names', () => {
    renderPage();
    fireEvent.click(screen.getByText('Tasks & Deadlines'));
    fireEvent.click(screen.getByText('Deals & Pipeline'));
    expect(screen.queryByText('task_assigned')).not.toBeInTheDocument();
    expect(screen.queryByText('task.assigned')).not.toBeInTheDocument();
    expect(screen.queryByText('deal_stage_changed')).not.toBeInTheDocument();
  });

  it('types matrix loads data from getPreferences query', () => {
    renderPage();
    expect(trpc.notifications.getPreferences.useQuery).toHaveBeenCalled();
  });

  it('save success shows toast', () => {
    let capturedOnSuccess: (() => void) | undefined;
    (
      trpc.notifications.updatePreferences.useMutation as ReturnType<typeof vi.fn>
    ).mockImplementation((opts?: { onSuccess?: () => void }) => {
      capturedOnSuccess = opts?.onSuccess;
      return { mutate: mockMutate, isPending: false };
    });
    renderPage();
    if (capturedOnSuccess) capturedOnSuccess();
    expect(toast).toHaveBeenCalled();
  });

  it('loading state shows skeletons', () => {
    setQueryReturn({ isLoading: true, data: undefined });
    renderPage();
    const skeletons = document.querySelectorAll('[data-testid="skeleton"], .animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('error state shows retry', () => {
    setQueryReturn({ isError: true, error: { message: 'Network error' }, data: undefined });
    renderPage();
    expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('aria-expanded toggles on category buttons', () => {
    renderPage();
    const btn = screen.getByText('Tasks & Deadlines').closest('button')!;
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});
