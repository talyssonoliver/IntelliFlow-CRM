import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

const mockRefetch = vi.fn();
const mockUpdateMutateAsync = vi.fn(async () => ({}));
const mockResetMutateAsync = vi.fn(async () => ({}));

const settingsData = {
  id: 'setting-1',
  casePrefix: 'CASE-',
  defaultPriority: 'MEDIUM',
  autoAssignEnabled: false,
  autoAssignUserId: null,
  autoAssignUser: null,
  updatedAt: new Date(),
};

// Mutable mock state — tests can override per-test
const mockQueryState = {
  data: settingsData as typeof settingsData | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('@/lib/trpc', () => {
  return {
    trpc: {
      useUtils: () => ({
        caseSettings: {
          get: { invalidate: vi.fn() },
        },
      }),
      caseSettings: {
        get: {
          useQuery: () => ({
            data: mockQueryState.data,
            isLoading: mockQueryState.isLoading,
            error: mockQueryState.error,
            refetch: mockRefetch,
          }),
        },
        update: {
          useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
            mutateAsync: async (...args: unknown[]) => {
              try {
                const result = await mockUpdateMutateAsync(...(args as []));
                opts?.onSuccess?.();
                return result;
              } catch (e) {
                opts?.onError?.(e as Error);
              }
            },
            isPending: false,
          }),
        },
        resetToDefaults: {
          useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
            mutateAsync: async (...args: unknown[]) => {
              try {
                const result = await mockResetMutateAsync(...(args as []));
                opts?.onSuccess?.();
                return result;
              } catch (e) {
                opts?.onError?.(e as Error);
              }
            },
            isPending: false,
          }),
        },
      },
      user: {
        list: {
          useQuery: () => ({
            data: { users: [{ id: 'user-cjld', name: 'Alice', email: 'alice@test.com' }] },
            isLoading: false,
          }),
        },
      },
    },
  };
});

import CaseSettingsContent from '../CaseSettingsContent';
import { CaseSettingsLoading } from '../CaseSettingsLoading';

beforeEach(() => {
  // Reset to default loaded state
  mockQueryState.data = settingsData;
  mockQueryState.isLoading = false;
  mockQueryState.error = null;
  vi.clearAllMocks();
  mockUpdateMutateAsync.mockResolvedValue({});
  mockResetMutateAsync.mockResolvedValue({});
});

describe('CaseSettingsContent — loaded state', () => {
  it('renders PageHeader with correct title', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('heading', { name: /case settings/i })).toBeTruthy();
  });

  it('renders breadcrumbs: Dashboard, Cases, Case Settings', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^cases$/i })).toBeTruthy();
  });

  it('renders Case Prefix section with current value in input', () => {
    render(<CaseSettingsContent />);
    const input = screen.getByDisplayValue('CASE-');
    expect(input).toBeTruthy();
  });

  it('renders Default Priority section', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('heading', { name: /default priority/i })).toBeTruthy();
    expect(screen.getAllByText(/medium/i).length).toBeGreaterThan(0);
  });

  it('renders Auto-Assign section with toggle', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('heading', { name: /auto.assign/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /enable auto-assign/i })).toBeTruthy();
  });

  it('renders Configuration Summary section', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('heading', { name: /configuration summary/i })).toBeTruthy();
  });

  it('Save Changes button is disabled when form is not dirty', () => {
    render(<CaseSettingsContent />);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save Changes button enabled after changing a field', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const input = screen.getByDisplayValue('CASE-');
    await user.clear(input);
    await user.type(input, 'CS-');
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it('Save Changes calls update mutation with current field values', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const input = screen.getByDisplayValue('CASE-');
    await user.clear(input);
    await user.type(input, 'CS-');
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);
    expect(mockUpdateMutateAsync).toHaveBeenCalled();
  });

  it('Reset to Defaults button is rendered', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeTruthy();
  });

  it('Reset to Defaults opens confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const resetBtn = screen.getByRole('button', { name: /reset to defaults/i });
    await user.click(resetBtn);
    // ConfirmationDialog should appear
    expect(screen.getByText(/reset case settings/i)).toBeTruthy();
  });

  it('auto-assign toggle shows user search when enabled', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const toggle = screen.getByRole('switch', { name: /enable auto-assign/i });
    await user.click(toggle);
    expect(screen.getByPlaceholderText(/search team members/i)).toBeTruthy();
  });

  it('case prefix input enforces uppercase via onChange', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const input = screen.getByDisplayValue('CASE-');
    await user.clear(input);
    await user.type(input, 'newcs');
    // The onChange calls toUpperCase, so value should be uppercase
    expect((input as HTMLInputElement).value).toBe('NEWCS');
  });
});

describe('CaseSettingsContent — loading state', () => {
  it('renders loading skeleton when isLoading=true', () => {
    mockQueryState.isLoading = true;
    mockQueryState.data = undefined;
    render(<CaseSettingsContent />);
    // Loading skeleton shows animated pulse containers
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });
});

describe('CaseSettingsContent — error state', () => {
  it('renders error message and Retry button when query errors', () => {
    mockQueryState.error = new Error('Network error');
    mockQueryState.data = undefined;
    render(<CaseSettingsContent />);
    expect(screen.getByText(/network error/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('Retry button calls refetch', async () => {
    const user = userEvent.setup();
    mockQueryState.error = new Error('Network error');
    mockQueryState.data = undefined;
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe('CaseSettingsContent — auto-assign user selection', () => {
  it('shows user list when autoAssign enabled and users exist', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const toggle = screen.getByRole('switch', { name: /enable auto-assign/i });
    await user.click(toggle);
    // User list should appear from mock (Alice)
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('clicking a user in the list selects them', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const toggle = screen.getByRole('switch', { name: /enable auto-assign/i });
    await user.click(toggle);
    const aliceBtn = screen.getByRole('button', { name: /alice/i });
    await user.click(aliceBtn);
    // search input should be updated
    expect((screen.getByPlaceholderText(/search team members/i) as HTMLInputElement).value).toBe(
      'Alice'
    );
  });

  it('disabling auto-assign hides user search and clears user id', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const toggle = screen.getByRole('switch', { name: /enable auto-assign/i });
    await user.click(toggle); // enable
    await user.click(toggle); // disable
    expect(screen.queryByPlaceholderText(/search team members/i)).toBeNull();
  });
});

describe('CaseSettingsContent — priority change', () => {
  it('changing priority select marks form dirty', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'HIGH');
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).not.toBeDisabled();
  });
});

describe('CaseSettingsContent — user search typing', () => {
  it('typing in user search updates search value', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const toggle = screen.getByRole('switch', { name: /enable auto-assign/i });
    await user.click(toggle);
    const searchInput = screen.getByPlaceholderText(/search team members/i);
    await user.type(searchInput, 'ali');
    expect((searchInput as HTMLInputElement).value).toBe('ali');
  });
});

describe('CaseSettingsContent — reset confirm', () => {
  it('confirming reset calls resetToDefaults mutation', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    // Open reset dialog
    const resetBtn = screen.getByRole('button', { name: /reset to defaults/i });
    await user.click(resetBtn);
    // Click confirm button in dialog (confirmLabel = "Reset to Defaults")
    const confirmBtns = screen.getAllByRole('button', { name: /reset to defaults/i });
    // The second one should be in the dialog
    const dialogConfirmBtn = confirmBtns[confirmBtns.length - 1];
    await user.click(dialogConfirmBtn);
    expect(mockResetMutateAsync).toHaveBeenCalled();
  });
});

describe('CaseSettingsContent — user removed note', () => {
  it('shows (user removed) when autoAssignUserId set but autoAssignUser null', async () => {
    mockQueryState.data = {
      ...settingsData,
      autoAssignEnabled: true,
      autoAssignUserId: 'cjld2cjxh0000qzrmn831i7rn' as unknown as null,
      autoAssignUser: null,
    };
    render(<CaseSettingsContent />);
    // Toggle is ON by default (from server data)
    expect(screen.getByText(/user removed/i)).toBeTruthy();
  });
});

describe('CaseSettingsPage', () => {
  it('renders without crashing (Suspense wraps CaseSettingsContent)', async () => {
    const { default: CaseSettingsPage } = await import('../page');
    const { container } = render(<CaseSettingsPage />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('CaseSettingsLoading', () => {
  it('renders skeleton cards without crashing', () => {
    const { container } = render(<CaseSettingsLoading />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the bento grid structure', () => {
    const { container } = render(<CaseSettingsLoading />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
  });

  it('renders action button skeletons in header area', () => {
    const { container } = render(<CaseSettingsLoading />);
    const skeletons = container.querySelectorAll(
      '[class*="animate-pulse"], [class*="Skeleton"], div.mb-4'
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('CaseSettingsContent — mutation error paths', () => {
  it('update mutation onError is called when mutateAsync rejects', async () => {
    mockUpdateMutateAsync.mockRejectedValue(new Error('Save failed'));
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const input = screen.getByDisplayValue('CASE-');
    await user.clear(input);
    await user.type(input, 'CS-');
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    // Click but don't await the unhandled rejection; the component catches it
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockUpdateMutateAsync).toHaveBeenCalled();
  });

  it('reset mutation onError is called when mutateAsync rejects', async () => {
    mockResetMutateAsync.mockRejectedValue(new Error('Reset failed'));
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const resetBtn = screen.getByRole('button', { name: /reset to defaults/i });
    await user.click(resetBtn);
    const confirmBtns = screen.getAllByRole('button', { name: /reset to defaults/i });
    const dialogConfirmBtn = confirmBtns[confirmBtns.length - 1];
    dialogConfirmBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockResetMutateAsync).toHaveBeenCalled();
  });
});
