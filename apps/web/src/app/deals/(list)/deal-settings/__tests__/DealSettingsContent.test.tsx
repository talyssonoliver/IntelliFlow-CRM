import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

vi.mock('@/lib/trpc', () => {
  const queryCache = new Map<string, unknown>();
  const mutationCache = new Map<string, unknown>();
  const invalidateCache = new Map<string, unknown>();

  const mkQuery = (key: string, data: unknown) => {
    if (!queryCache.has(key)) {
      queryCache.set(key, { data, isLoading: false, error: null, refetch: vi.fn() });
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
      invalidateCache.set(key, { invalidate: vi.fn() });
    }
    return invalidateCache.get(key);
  };

  const automationData = {
    autoMergeOnExactNameAccount: false,
    notifyOnDuplicate: true,
    restrictTagCreationToAdmins: false,
    normalizeCurrency: true,
    autoCapitalizeDealNames: true,
    preventDeleteWithOpenTasks: true,
    notifyOnOwnerChange: false,
    notifyOnStageChange: false,
    notifyOnHighValueStageMove: false,
    highValueThreshold: 50000,
    aiDuplicateDetection: false,
    aiDealScoring: false,
    aiNextStepRecommendation: false,
    aiTagSuggestions: false,
    aiInsightGeneration: false,
    aiWinLossPrediction: false,
    updatedAt: new Date(),
  };

  const utilsRef = {
    dealSettings: {
      winLossReasons: { list: mkInvalidate('u.winLoss.list') },
      scoringRules: { list: mkInvalidate('u.scoring.list') },
      duplicateRules: { getAll: mkInvalidate('u.dup.getAll') },
      requiredFields: { getAll: mkInvalidate('u.req.getAll') },
      tags: { list: mkInvalidate('u.tags.list') },
      automation: { get: mkInvalidate('u.auto.get') },
    },
    pipelineConfig: { getAll: mkInvalidate('u.pipe.getAll') },
  };

  return {
    trpc: {
      useUtils: () => utilsRef,
      pipelineConfig: {
        getAll: { useQuery: mkQuery('pipe.getAll', { stages: [] }) },
        updateStage: { useMutation: mkMutation('pipe.updateStage') },
        resetToDefaults: { useMutation: mkMutation('pipe.reset') },
      },
      dealSettings: {
        winLossReasons: {
          list: { useQuery: mkQuery('winLoss.list', []) },
          create: { useMutation: mkMutation('winLoss.create') },
          update: { useMutation: mkMutation('winLoss.update') },
          delete: { useMutation: mkMutation('winLoss.delete') },
          resetToDefaults: { useMutation: mkMutation('winLoss.reset') },
        },
        scoringRules: {
          list: { useQuery: mkQuery('scoring.list', []) },
          create: { useMutation: mkMutation('scoring.create') },
          update: { useMutation: mkMutation('scoring.update') },
          delete: { useMutation: mkMutation('scoring.delete') },
          resetToDefaults: { useMutation: mkMutation('scoring.reset') },
        },
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
    },
  };
});

import DealSettingsContent from '../DealSettingsContent';

describe('DealSettingsContent (PG-184)', () => {
  it('renders PageHeader and every anchor ID', () => {
    const { container } = render(<DealSettingsContent />);
    const headings = Array.from(document.querySelectorAll('h1')).map((el) => el.textContent);
    expect(headings).toContain('Deal Settings');
    for (const id of [
      'pipeline',
      'required-fields',
      'duplicate-detection',
      'win-loss',
      'scoring',
      'tags',
      'automation',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('renders the 7 card section headings', () => {
    render(<DealSettingsContent />);
    // Use H3 selector to disambiguate from content labels that reuse the text.
    const h3s = Array.from(document.querySelectorAll('h3')).map((el) => el.textContent);
    expect(h3s).toContain('Pipeline Stages');
    expect(h3s).toContain('Required Fields');
    expect(h3s).toContain('Duplicate Detection');
    expect(h3s).toContain('Win / Loss Reasons');
    expect(h3s).toContain('Scoring Rules');
    expect(h3s).toContain('Tags');
    expect(h3s).toContain('Automation');
  });
});
