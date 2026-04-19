import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ user: { id: 'u1' }, isLoading: false, isAuthenticated: true }),
}));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

vi.mock('@/lib/trpc', () => {
  const queryCache = new Map<string, unknown>();
  const mutationCache = new Map<string, unknown>();
  const invalidateCache = new Map<string, { invalidate: () => Promise<void> }>();

  const mkQuery = (key: string, data: unknown) => {
    if (!queryCache.has(key)) {
      queryCache.set(key, {
        data,
        isPending: false,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    }
    return () => queryCache.get(key);
  };
  const mkMutation = (key: string) => {
    if (!mutationCache.has(key)) {
      mutationCache.set(key, { mutateAsync: vi.fn(async () => ({})), isPending: false });
    }
    return () => mutationCache.get(key);
  };
  const mkInvalidate = (key: string) => {
    if (!invalidateCache.has(key)) {
      invalidateCache.set(key, { invalidate: vi.fn(async () => {}) });
    }
    return invalidateCache.get(key)!;
  };

  const automationData = {
    defaultSlaPolicyId: null,
    autoCloseIdleDays: 7,
    autoCloseAppliesToWaitingCustomer: true,
    autoCloseAppliesToResolved: true,
    autoCloseNotifyCustomer: true,
    autoMergeOnExactContactSubject: false,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    normalizeSubjectCasing: true,
    trimDescriptionWhitespace: true,
    preventDeleteWithOpenChildren: true,
    notifyOnAssigneeChange: true,
    notifyOnSlaBreach: true,
    notifyOnSlaWarning: false,
    notifyOnStatusResolved: false,
    notifyOnEscalation: true,
    aiDuplicateDetection: false,
    aiAutoCategorization: false,
    aiSentimentAnalysis: false,
    aiNextStepRecommendation: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
  };

  const utilsRef = {
    ticketSettings: {
      duplicateRules: { getAll: mkInvalidate('u.dup.get') },
      requiredFields: { getAll: mkInvalidate('u.req.get') },
      tags: { list: mkInvalidate('u.tags.list') },
      automation: { get: mkInvalidate('u.auto.get') },
    },
    ticketConfig: {
      slaPolicy: { list: mkInvalidate('u.sla.list') },
    },
  };

  return {
    trpc: {
      useUtils: () => utilsRef,
      ticketSettings: {
        duplicateRules: {
          getAll: { useQuery: mkQuery('dup.getAll', []) },
          updateAll: { useMutation: mkMutation('dup.updateAll') },
          resetToDefaults: { useMutation: mkMutation('dup.reset') },
        },
        requiredFields: {
          getAll: { useQuery: mkQuery('req.getAll', []) },
          updateAll: { useMutation: mkMutation('req.updateAll') },
          resetToDefaults: { useMutation: mkMutation('req.reset') },
        },
        tags: {
          list: { useQuery: mkQuery('tags.list', []) },
          create: { useMutation: mkMutation('tags.create') },
          update: { useMutation: mkMutation('tags.update') },
          delete: { useMutation: mkMutation('tags.delete') },
        },
        automation: {
          get: { useQuery: mkQuery('auto.get', automationData) },
          update: { useMutation: mkMutation('auto.update') },
          resetToDefaults: { useMutation: mkMutation('auto.reset') },
        },
      },
      ticketConfig: {
        slaPolicy: {
          list: { useQuery: mkQuery('sla.list', []) },
          setDefault: { useMutation: mkMutation('sla.setDefault') },
        },
      },
    },
  };
});

import TicketSettingsContent from '../TicketSettingsContent';

describe('TicketSettingsContent', () => {
  it('renders the 5 bento cards with the playbook anchor IDs', () => {
    const { container } = render(<TicketSettingsContent />);
    expect(container.querySelector('#sla-policies')).toBeTruthy();
    expect(container.querySelector('#duplicate-detection')).toBeTruthy();
    expect(container.querySelector('#required-fields')).toBeTruthy();
    expect(container.querySelector('#tags')).toBeTruthy();
    expect(container.querySelector('#automation')).toBeTruthy();
  });

  it('renders the PageHeader title', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByRole('heading', { name: /sla policies & settings/i })).toBeTruthy();
  });

  it('shows the expected card section titles (AC-T2)', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByRole('heading', { name: /^sla policies$/i })).toBeTruthy();
    expect(
      screen.getAllByRole('heading', { name: /^duplicate detection$/i }).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /^required fields$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^tags$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^automation$/i })).toBeTruthy();
  });

  it('exposes Save Changes and Reset to Defaults actions (AC-T1, AC-T8)', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeTruthy();
  });

  it('New Tag button is present in TagsCard SectionHeader action slot (AC-T6)', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByRole('button', { name: /create new ticket tag/i })).toBeTruthy();
  });

  it('Automation card renders 7 grouped section headings (AC-T7)', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByText(/^default sla$/i)).toBeTruthy();
    expect(screen.getByText(/^auto-close$/i)).toBeTruthy();
    expect(screen.getByText(/^rbac$/i)).toBeTruthy();
    expect(screen.getByText(/^data hygiene$/i)).toBeTruthy();
    expect(screen.getByText(/^notifications$/i)).toBeTruthy();
    expect(screen.getByText(/^ai & intelligence$/i)).toBeTruthy();
  });

  it('Automation card shows IFC-310 + IFC-312 runtime-hint notes', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByText(/runtime delivered by ifc-310/i)).toBeTruthy();
    expect(screen.getByText(/runtime delivered by ifc-312/i)).toBeTruthy();
  });

  it('Add Rule button is present in duplicate detection card (AC-T4, playbook §3)', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByRole('button', { name: /add duplicate detection rule/i })).toBeTruthy();
  });

  it('shows breadcrumbs (Dashboard / Tickets / SLA Policies & Settings)', () => {
    render(<TicketSettingsContent />);
    expect(screen.getByText(/dashboard/i)).toBeTruthy();
    // 'Tickets' also appears in a heading — assert at least one Tickets text exists
    expect(screen.getAllByText(/tickets/i).length).toBeGreaterThan(0);
  });
});
