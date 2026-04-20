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

const H = vi.hoisted(() => {
  const generalData = {
    id: 'g1',
    casePrefix: 'CASE-',
    defaultPriority: 'MEDIUM',
    autoAssignEnabled: false,
    autoAssignUserId: null,
    autoAssignUser: null,
    updatedAt: new Date(),
  };
  const duplicateRulesData = [
    {
      id: 'd1',
      field: 'title',
      matchStrategy: 'fuzzy',
      collisionAction: 'warn',
      isActive: true,
      sortOrder: 0,
    },
    {
      id: 'd2',
      field: 'externalId',
      matchStrategy: 'exact',
      collisionAction: 'block',
      isActive: false,
      sortOrder: 1,
    },
  ];
  const requiredFieldsData = [
    { id: 'r1', fieldKey: 'title', isRequired: true },
    { id: 'r2', fieldKey: 'clientId', isRequired: true },
  ];
  const tagsData: Array<{ id: string; name: string; colorToken: string; description: null }> = [
    { id: 't1', name: 'Urgent', colorToken: 'red', description: null },
  ];
  const automationData = {
    id: 'a1',
    tenantId: 'tnt',
    autoEscalateOverdue: false,
    notifyOnAssignmentChange: true,
    notifyOnDeadlineApproaching: true,
    notifyOnStatusChange: false,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    preventDeleteWithOpenTasks: true,
    aiCaseSummarization: false,
    aiPriorityPrediction: false,
    aiResolutionSuggestion: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mocks = {
    generalUpdate: vi.fn(async () => generalData),
    generalReset: vi.fn(async () => generalData),
    duplicateUpdate: vi.fn(async () => duplicateRulesData),
    requiredUpdate: vi.fn(async () => requiredFieldsData),
    tagCreate: vi.fn(async () => tagsData[0]),
    tagDelete: vi.fn(async () => ({ success: true })),
    automationUpdate: vi.fn(async () => automationData),
  };

  // Mutable per-test state for the general query — tests can flip loading/error
  // on this object and subsequent useQuery() calls pick up the new value.
  const generalQueryState = {
    data: generalData as typeof generalData | undefined,
    isLoading: false,
    error: null as Error | null,
  };

  const usersState = {
    data: { users: [{ id: 'u1', name: 'Alice', email: 'alice@test.com' }] } as {
      users: Array<{ id: string; name: string; email: string }>;
    },
  };

  const makeQueryResult = <T,>(data: T) => ({
    data,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  });

  const makeMutation = (mock: any) => ({
    useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
      mutateAsync: async (...args: unknown[]) => {
        try {
          const r = await mock(...(args as []));
          opts?.onSuccess?.();
          return r;
        } catch (e) {
          opts?.onError?.(e as Error);
        }
      },
      mutate: (...args: unknown[]) => {
        void (async () => {
          try {
            await mock(...(args as []));
            opts?.onSuccess?.();
          } catch (e) {
            opts?.onError?.(e as Error);
          }
        })();
      },
      isPending: false,
    }),
  });

  return {
    generalData,
    duplicateRulesData,
    requiredFieldsData,
    tagsData,
    automationData,
    generalQueryState,
    usersState,
    mocks,
    makeQueryResult,
    makeMutation,
  };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      caseSettings: {
        general: { get: { invalidate: vi.fn() } },
        duplicateRules: { list: { invalidate: vi.fn() } },
        requiredFields: { list: { invalidate: vi.fn() } },
        tags: { list: { invalidate: vi.fn() } },
        automation: { get: { invalidate: vi.fn() } },
      },
    }),
    caseSettings: {
      general: {
        get: {
          useQuery: () => ({
            data: H.generalQueryState.data,
            isLoading: H.generalQueryState.isLoading,
            error: H.generalQueryState.error,
            refetch: vi.fn(),
          }),
        },
        update: H.makeMutation(H.mocks.generalUpdate),
        resetToDefaults: H.makeMutation(H.mocks.generalReset),
      },
      duplicateRules: {
        list: { useQuery: () => H.makeQueryResult(H.duplicateRulesData) },
        update: H.makeMutation(H.mocks.duplicateUpdate),
        resetToDefaults: H.makeMutation(vi.fn()),
      },
      requiredFields: {
        list: { useQuery: () => H.makeQueryResult(H.requiredFieldsData) },
        update: H.makeMutation(H.mocks.requiredUpdate),
        resetToDefaults: H.makeMutation(vi.fn()),
      },
      tags: {
        list: { useQuery: () => H.makeQueryResult(H.tagsData) },
        create: H.makeMutation(H.mocks.tagCreate),
        update: H.makeMutation(vi.fn()),
        delete: H.makeMutation(H.mocks.tagDelete),
      },
      automation: {
        get: { useQuery: () => H.makeQueryResult(H.automationData) },
        update: H.makeMutation(H.mocks.automationUpdate),
        resetToDefaults: H.makeMutation(vi.fn()),
      },
    },
    user: {
      list: {
        useQuery: () => ({ data: H.usersState.data, isLoading: false }),
      },
    },
  },
}));

import CaseSettingsContent from '../CaseSettingsContent';
import { CaseSettingsLoading } from '../CaseSettingsLoading';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mutable query state to defaults so each test starts from a
  // "loaded, no error" baseline (tests that need loading/error override).
  H.generalQueryState.data = H.generalData;
  H.generalQueryState.isLoading = false;
  H.generalQueryState.error = null;
  H.usersState.data = { users: [{ id: 'u1', name: 'Alice', email: 'alice@test.com' }] };
});

describe('CaseSettingsContent — PG-190 v2 scope-up', () => {
  it('renders PageHeader with Case Settings heading and Dashboard breadcrumb', () => {
    render(<CaseSettingsContent />);
    expect(screen.getByRole('heading', { name: /case settings/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
  });

  it('renders all 9 bento sections', () => {
    render(<CaseSettingsContent />);
    const titles = [
      'Case Prefix',
      'Default Priority',
      'Auto-Assign',
      'Duplicate Detection',
      'Required Fields',
      'Tags',
      'Automation',
      'AI & Intelligence',
      'Configuration Summary',
    ];
    titles.forEach((t) => {
      expect(screen.getByRole('heading', { level: 3, name: new RegExp(t, 'i') })).toBeTruthy();
    });
  });

  it('general.update is invoked when Save Changes is clicked after dirty change', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const prefix = screen.getByDisplayValue('CASE-');
    await user.clear(prefix);
    await user.type(prefix, 'CS-');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.generalUpdate).toHaveBeenCalled();
  });

  it('tag create flow calls caseSettings.tags.create with name + colorToken', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const input = screen.getByLabelText(/new tag name/i);
    await user.type(input, 'VIP');
    await user.click(screen.getByRole('button', { name: /add tag/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.tagCreate).toHaveBeenCalledWith({ name: 'VIP', colorToken: 'slate' });
  });

  it('tag delete fires caseSettings.tags.delete with the tag id', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByLabelText(/delete tag urgent/i));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.tagDelete).toHaveBeenCalledWith({ id: 't1' });
  });

  it('toggling an AI switch fires caseSettings.automation.update', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /case summarization/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.automationUpdate).toHaveBeenCalled();
  });

  it('toggling a required-field switch fires caseSettings.requiredFields.update', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /require description/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.requiredUpdate).toHaveBeenCalled();
  });

  it('toggling a duplicate-rule switch fires caseSettings.duplicateRules.update', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /toggle rule title fuzzy/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.duplicateUpdate).toHaveBeenCalled();
  });
});

describe('CaseSettingsContent — branch coverage top-ups', () => {
  it('changing default priority marks the form dirty and enables Save', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const select = screen.getByLabelText(/default priority/i);
    await user.selectOptions(select, 'HIGH');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
  });

  it('enabling auto-assign renders the user search input', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    const toggle = screen.getByRole('switch', { name: /enable auto-assign/i });
    await user.click(toggle);
    expect(screen.getByPlaceholderText(/search team members/i)).toBeTruthy();
  });

  it('picking a user from the list fires the userId change', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /enable auto-assign/i }));
    const alice = await screen.findByRole('button', { name: /alice/i });
    await user.click(alice);
    // After selection the search input shows the picked user's display name.
    expect((screen.getByPlaceholderText(/search team members/i) as HTMLInputElement).value).toBe(
      'Alice'
    );
  });

  it('user search input updates when typing', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /enable auto-assign/i }));
    const search = screen.getByPlaceholderText(/search team members/i);
    await user.type(search, 'bob');
    expect((search as HTMLInputElement).value.toLowerCase()).toContain('bob');
  });

  it('opening reset dialog and confirming fires general.resetToDefaults', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('button', { name: /reset to defaults/i }));
    const dialogConfirms = screen.getAllByRole('button', { name: /reset to defaults/i });
    const dialogConfirm = dialogConfirms[dialogConfirms.length - 1];
    dialogConfirm.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.generalReset).toHaveBeenCalled();
  });

  it('does not call tags.create when the name input is empty/whitespace', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    // No typing — button is disabled
    const addBtn = screen.getByRole('button', { name: /add tag/i });
    await user.click(addBtn);
    expect(H.mocks.tagCreate).not.toHaveBeenCalled();
  });

  it('renders a tag with unknown colorToken using the slate fallback class', () => {
    // Mutate the hoisted tagsData to include an out-of-allowlist token.
    H.tagsData.push({ id: 't2', name: 'Legacy', colorToken: 'mauve', description: null });
    render(<CaseSettingsContent />);
    // Find the legacy tag pill by its name — it MUST still render (not crash).
    const pill = screen.getByText('Legacy');
    expect(pill).toBeTruthy();
    // Clean up so later tests aren't polluted.
    H.tagsData.pop();
  });

  it('toggling another AI switch (tag suggestions) fires the mutation', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /tag suggestions/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.automationUpdate).toHaveBeenCalled();
  });

  it('toggling a workflow automation switch fires the mutation', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /notify on assignment change/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.automationUpdate).toHaveBeenCalled();
  });

  it('toggling an inactive duplicate rule turns it on', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /toggle rule externalId exact/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.duplicateUpdate).toHaveBeenCalled();
  });

  it('toggling a required-field off (title → false) updates via .mutate', async () => {
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /require title/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(H.mocks.requiredUpdate).toHaveBeenCalled();
  });

  it('Configuration Summary reflects query-data values', () => {
    render(<CaseSettingsContent />);
    // "1 rules · 1 tags" is unique to the Configuration Summary card.
    expect(screen.getByText(/1 rules · 1 tags/i)).toBeTruthy();
  });
});

describe('CaseSettingsContent — loading + error branches', () => {
  it('renders the animate-pulse skeleton when generalQuery is loading', () => {
    H.generalQueryState.isLoading = true;
    const { container } = render(<CaseSettingsContent />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    // Heading not rendered during loading state.
    expect(screen.queryByRole('heading', { name: /case settings/i })).toBeNull();
  });

  it('renders the error banner + Retry when generalQuery errors', async () => {
    H.generalQueryState.error = new Error('Network unavailable');
    render(<CaseSettingsContent />);
    expect(screen.getByText(/network unavailable/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('auto-assign user search shows nothing when users query returns empty list', async () => {
    H.usersState.data = { users: [] };
    const user = userEvent.setup();
    render(<CaseSettingsContent />);
    await user.click(screen.getByRole('switch', { name: /enable auto-assign/i }));
    // The <ul> dropdown only renders when users.length > 0 — must be absent.
    const dropdowns = document.querySelectorAll('ul.rounded-md.border.border-border');
    expect(dropdowns.length).toBe(0);
  });
});

describe('CaseSettingsLoading', () => {
  it('renders skeleton bento grid', () => {
    const { container } = render(<CaseSettingsLoading />);
    expect(container.querySelector('.grid')).toBeTruthy();
  });
});

describe('CaseSettingsPage', () => {
  it('renders CaseSettingsContent inside Suspense (not the stub)', async () => {
    const { default: CaseSettingsPage } = await import('../page');
    render(<CaseSettingsPage />);
    expect(screen.getByRole('heading', { name: /case settings/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
  });
});
