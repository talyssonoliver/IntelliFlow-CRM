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
        get: { useQuery: () => H.makeQueryResult(H.generalData) },
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
        useQuery: () => ({
          data: { users: [{ id: 'u1', name: 'Alice', email: 'alice@test.com' }] },
          isLoading: false,
        }),
      },
    },
  },
}));

import CaseSettingsContent from '../CaseSettingsContent';
import { CaseSettingsLoading } from '../CaseSettingsLoading';

beforeEach(() => {
  vi.clearAllMocks();
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
