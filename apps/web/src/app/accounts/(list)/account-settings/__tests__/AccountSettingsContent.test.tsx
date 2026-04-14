import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

vi.mock('@/lib/trpc', () => {
  // Stable references — important, otherwise useEffect/useMemo deps churn every render
  // and cause "Maximum update depth" errors in strict mode.
  const queryCache = new Map<string, unknown>();
  const mutationCache = new Map<string, unknown>();
  const invalidateCache = new Map<string, unknown>();
  const mkQuery = (key: string, data: unknown) => {
    if (!queryCache.has(key)) {
      queryCache.set(key, { data, isLoading: false, error: null, refetch: vi.fn() });
    }
    return () => queryCache.get(key) as { data: unknown; isLoading: boolean; error: null; refetch: () => void };
  };
  const mkMutation = (key: string) => {
    if (!mutationCache.has(key)) {
      mutationCache.set(key, { mutateAsync: vi.fn(async () => ({})), isPending: false });
    }
    return () => mutationCache.get(key);
  };
  const mkInvalidate = (key: string) => {
    if (!invalidateCache.has(key)) {
      invalidateCache.set(key, { invalidate: vi.fn() });
    }
    return invalidateCache.get(key);
  };

  const hierarchyData = {
    id: 'h-1',
    tenantId: 't',
    maxDepth: 5,
    requireParentForTiers: [] as string[],
    preventCycles: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const automationData = {
    autoAssignOwner: false,
    autoLinkContactsByDomain: true,
    preventDeleteWithOpenOpportunities: true,
    notifyOnOwnerChange: false,
    normalizeWebsiteDomain: true,
    autoCapitalizeAccountNames: true,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    aiIndustryInference: true,
    aiEnrichment: false,
    aiTagSuggestions: true,
    aiInsightGeneration: true,
    aiAccountScoring: false,
    updatedAt: new Date(),
  };

  const utilsRef = {
    accountSettings: {
      hierarchy: { get: mkInvalidate('u.hierarchy.get') },
      industry: { list: mkInvalidate('u.industry.list') },
      customFields: { list: mkInvalidate('u.customFields.list') },
      duplicateRules: { getAll: mkInvalidate('u.duplicateRules.getAll') },
      requiredFields: { getAll: mkInvalidate('u.requiredFields.getAll') },
      tags: { list: mkInvalidate('u.tags.list') },
      automation: { get: mkInvalidate('u.automation.get') },
    },
  };

  return {
    trpc: {
      useUtils: () => utilsRef,
      accountSettings: {
        hierarchy: {
          get: { useQuery: mkQuery('hierarchy.get', hierarchyData) },
          update: { useMutation: mkMutation('hierarchy.update') },
          resetToDefaults: { useMutation: mkMutation('hierarchy.reset') },
        },
        industry: {
          list: { useQuery: mkQuery('industry.list', []) },
          create: { useMutation: mkMutation('industry.create') },
          update: { useMutation: mkMutation('industry.update') },
          delete: { useMutation: mkMutation('industry.delete') },
          resetToDefaults: { useMutation: mkMutation('industry.reset') },
        },
        customFields: {
          list: { useQuery: mkQuery('customFields.list', []) },
          create: { useMutation: mkMutation('customFields.create') },
          update: { useMutation: mkMutation('customFields.update') },
          delete: { useMutation: mkMutation('customFields.delete') },
        },
        duplicateRules: {
          getAll: { useQuery: mkQuery('duplicateRules.getAll', []) },
          updateAll: { useMutation: mkMutation('duplicateRules.updateAll') },
          resetToDefaults: { useMutation: mkMutation('duplicateRules.reset') },
        },
        requiredFields: {
          getAll: { useQuery: mkQuery('requiredFields.getAll', []) },
          updateAll: { useMutation: mkMutation('requiredFields.updateAll') },
          resetToDefaults: { useMutation: mkMutation('requiredFields.reset') },
        },
        tags: {
          list: { useQuery: mkQuery('tags.list', []) },
          create: { useMutation: mkMutation('tags.create') },
          update: { useMutation: mkMutation('tags.update') },
          delete: { useMutation: mkMutation('tags.delete') },
        },
        automation: {
          get: { useQuery: mkQuery('automation.get', automationData) },
          update: { useMutation: mkMutation('automation.update') },
        },
      },
    },
  };
});

import AccountSettingsContent from '../AccountSettingsContent';

describe('AccountSettingsContent', () => {
  it('renders the 8 bento sections', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByRole('heading', { name: /^hierarchy$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^duplicate detection$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^required fields$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^automation$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^industry$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /ai & intelligence/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^custom fields$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^tags$/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /configuration summary/i })).toBeTruthy();
  });

  it('shows the breadcrumb trail', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^accounts$/i })).toBeTruthy();
  });

  it('Save button is initially disabled (not dirty)', () => {
    render(<AccountSettingsContent />);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('renders Reset to Defaults action', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeTruthy();
  });
});
