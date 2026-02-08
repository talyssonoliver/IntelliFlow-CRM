/**
 * Tests for useChainVersions.ts
 *
 * Tests the exported hooks: useChainVersions, useVersionAudit, useZepBudget
 * and their associated type interfaces.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks
// ---------------------------------------------------------------------------
vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => [init, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn: unknown) => fn),
  useMemo: vi.fn((fn: () => unknown) => fn()),
  useRef: vi.fn((init: unknown) => ({ current: init })),
}));

// ---------------------------------------------------------------------------
// Mock tRPC/API
// ---------------------------------------------------------------------------
const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});
const mockInvalidate = vi.fn();
const mockQuery = vi.fn().mockResolvedValue({});

const mockUseQueryResult = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

const mockUseMutationResult = {
  mutateAsync: mockMutateAsync,
  isPending: false,
};

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      chainVersion: {
        list: { invalidate: mockInvalidate },
        getActive: { invalidate: mockInvalidate },
        getStats: { invalidate: mockInvalidate },
        getAuditLog: { invalidate: mockInvalidate },
      },
      client: {
        chainVersion: {
          compare: { query: mockQuery },
        },
      },
    }),
    chainVersion: {
      list: { useQuery: vi.fn(() => ({ ...mockUseQueryResult })) },
      getActive: { useQuery: vi.fn(() => ({ ...mockUseQueryResult })) },
      getStats: { useQuery: vi.fn(() => ({ ...mockUseQueryResult })) },
      create: { useMutation: vi.fn(() => ({ ...mockUseMutationResult })) },
      update: { useMutation: vi.fn(() => ({ ...mockUseMutationResult })) },
      activate: { useMutation: vi.fn(() => ({ ...mockUseMutationResult })) },
      deprecate: { useMutation: vi.fn(() => ({ ...mockUseMutationResult })) },
      archive: { useMutation: vi.fn(() => ({ ...mockUseMutationResult })) },
      rollback: { useMutation: vi.fn(() => ({ ...mockUseMutationResult })) },
      getAuditLog: { useQuery: vi.fn(() => ({ ...mockUseQueryResult })) },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock @intelliflow/ui
// ---------------------------------------------------------------------------
const mockToast = vi.fn();
vi.mock('@intelliflow/ui', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ---------------------------------------------------------------------------
// Mock domain/validators types
// ---------------------------------------------------------------------------
vi.mock('@intelliflow/domain', () => ({}));
vi.mock('@intelliflow/validators', () => ({}));

// Now import the module under test
import {
  useChainVersions,
  useVersionAudit,
  useZepBudget,
  type UseChainVersionsOptions,
  type ChainVersionStats,
  type VersionComparison,
  type UseChainVersionsReturn,
  type UseVersionAuditOptions,
  type UseVersionAuditReturn,
  type EpisodeBudget,
  type UseZepBudgetReturn,
} from '../useChainVersions';

// ============================================================================
// useChainVersions
// ============================================================================
describe('useChainVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expected shape with default options', () => {
    const result = useChainVersions();

    // Queries
    expect(result).toHaveProperty('versions');
    expect(result).toHaveProperty('activeVersions');
    expect(result).toHaveProperty('stats');

    // Query states
    expect(result).toHaveProperty('isLoading');
    expect(result).toHaveProperty('isLoadingActive');
    expect(result).toHaveProperty('isLoadingStats');
    expect(result).toHaveProperty('error');

    // Mutations
    expect(result).toHaveProperty('createVersion');
    expect(result).toHaveProperty('updateVersion');
    expect(result).toHaveProperty('activateVersion');
    expect(result).toHaveProperty('deprecateVersion');
    expect(result).toHaveProperty('archiveVersion');
    expect(result).toHaveProperty('rollbackVersion');

    // Mutation states
    expect(result).toHaveProperty('isCreating');
    expect(result).toHaveProperty('isUpdating');
    expect(result).toHaveProperty('isActivating');
    expect(result).toHaveProperty('isDeprecating');
    expect(result).toHaveProperty('isArchiving');
    expect(result).toHaveProperty('isRollingBack');

    // Utilities
    expect(result).toHaveProperty('refetch');
    expect(result).toHaveProperty('compareVersions');
  });

  it('returns default loading states as false', () => {
    const result = useChainVersions();
    expect(result.isLoading).toBe(false);
    expect(result.isLoadingActive).toBe(false);
    expect(result.isLoadingStats).toBe(false);
  });

  it('returns null error when no query error', () => {
    const result = useChainVersions();
    expect(result.error).toBeNull();
  });

  it('returns mutation pending states as false initially', () => {
    const result = useChainVersions();
    expect(result.isCreating).toBe(false);
    expect(result.isUpdating).toBe(false);
    expect(result.isActivating).toBe(false);
    expect(result.isDeprecating).toBe(false);
    expect(result.isArchiving).toBe(false);
    expect(result.isRollingBack).toBe(false);
  });

  it('returns undefined versions when no data', () => {
    const result = useChainVersions();
    expect(result.versions).toBeUndefined();
    expect(result.stats).toBeUndefined();
  });

  it('activeVersions has all chain types as null when no data', () => {
    const result = useChainVersions();
    expect(result.activeVersions).toHaveProperty('SCORING');
    expect(result.activeVersions).toHaveProperty('QUALIFICATION');
    expect(result.activeVersions).toHaveProperty('EMAIL_WRITER');
    expect(result.activeVersions).toHaveProperty('FOLLOWUP');
    expect(result.activeVersions.SCORING).toBeNull();
    expect(result.activeVersions.QUALIFICATION).toBeNull();
    expect(result.activeVersions.EMAIL_WRITER).toBeNull();
    expect(result.activeVersions.FOLLOWUP).toBeNull();
  });

  it('createVersion calls mutateAsync', async () => {
    const result = useChainVersions();
    const input = {
      chainType: 'SCORING' as const,
      version: '1.0.0',
      config: {},
    } as any;

    await result.createVersion(input);
    expect(mockMutateAsync).toHaveBeenCalledWith(input);
  });

  it('updateVersion calls mutateAsync with versionId and data', async () => {
    const result = useChainVersions();
    const input = { config: { model: 'gpt-4' } } as any;

    await result.updateVersion('v-1', input);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      versionId: 'v-1',
      data: input,
    });
  });

  it('activateVersion calls mutateAsync with versionId', async () => {
    const result = useChainVersions();
    await result.activateVersion('v-1');
    expect(mockMutateAsync).toHaveBeenCalledWith({ versionId: 'v-1' });
  });

  it('deprecateVersion calls mutateAsync with versionId', async () => {
    const result = useChainVersions();
    await result.deprecateVersion('v-1');
    expect(mockMutateAsync).toHaveBeenCalledWith({ versionId: 'v-1' });
  });

  it('archiveVersion calls mutateAsync with versionId', async () => {
    const result = useChainVersions();
    await result.archiveVersion('v-1');
    expect(mockMutateAsync).toHaveBeenCalledWith({ versionId: 'v-1' });
  });

  it('rollbackVersion calls mutateAsync with versionId and reason', async () => {
    const result = useChainVersions();
    await result.rollbackVersion('v-1', 'Performance regression');
    expect(mockMutateAsync).toHaveBeenCalledWith({
      versionId: 'v-1',
      reason: 'Performance regression',
    });
  });

  it('compareVersions calls client query', async () => {
    const mockComparison = {
      versionA: {},
      versionB: {},
      differences: [],
    };
    mockQuery.mockResolvedValue(mockComparison);

    const result = useChainVersions();
    const comparison = await result.compareVersions('v-1', 'v-2');

    expect(mockQuery).toHaveBeenCalledWith({
      versionIdA: 'v-1',
      versionIdB: 'v-2',
    });
    expect(comparison).toEqual(mockComparison);
  });

  it('refetch calls refetch on all queries', () => {
    const result = useChainVersions();
    result.refetch();
    // refetch should have been called on multiple queries
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('accepts custom options', () => {
    const options: UseChainVersionsOptions = {
      chainType: 'SCORING' as any,
      status: 'ACTIVE' as any,
      limit: 25,
      offset: 10,
    };
    const result = useChainVersions(options);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// useVersionAudit
// ============================================================================
describe('useVersionAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expected shape', () => {
    const result = useVersionAudit();
    expect(result).toHaveProperty('auditLog');
    expect(result).toHaveProperty('isLoading');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('refetch');
  });

  it('returns default state', () => {
    const result = useVersionAudit();
    expect(result.auditLog).toBeUndefined();
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeNull();
  });

  it('refetch is a function', () => {
    const result = useVersionAudit();
    expect(typeof result.refetch).toBe('function');
  });

  it('accepts versionId and limit options', () => {
    const options: UseVersionAuditOptions = {
      versionId: 'v-123',
      limit: 100,
    };
    const result = useVersionAudit(options);
    expect(result).toBeDefined();
  });

  it('works with no options', () => {
    const result = useVersionAudit({});
    expect(result).toBeDefined();
  });
});

// ============================================================================
// useZepBudget
// ============================================================================
describe('useZepBudget', () => {
  it('returns expected shape', () => {
    const result = useZepBudget();
    expect(result).toHaveProperty('budget');
    expect(result).toHaveProperty('isLoading');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('refetch');
    expect(result).toHaveProperty('percentUsed');
    expect(result).toHaveProperty('budgetStatus');
  });

  it('returns mock budget data', () => {
    const result = useZepBudget();
    expect(result.budget).toBeDefined();
    expect(result.budget!.total).toBe(1000);
    expect(result.budget!.remaining).toBe(1000);
    expect(result.budget!.used).toBe(0);
  });

  it('returns 0 percent used when nothing is used', () => {
    const result = useZepBudget();
    expect(result.percentUsed).toBe(0);
  });

  it('returns normal budget status when usage is low', () => {
    const result = useZepBudget();
    expect(result.budgetStatus).toBe('normal');
  });

  it('returns isLoading as false', () => {
    const result = useZepBudget();
    expect(result.isLoading).toBe(false);
  });

  it('returns null error', () => {
    const result = useZepBudget();
    expect(result.error).toBeNull();
  });

  it('refetch is a function', () => {
    const result = useZepBudget();
    expect(typeof result.refetch).toBe('function');
    // Should not throw
    expect(() => result.refetch()).not.toThrow();
  });

  it('budget has expected threshold fields', () => {
    const result = useZepBudget();
    const budget = result.budget!;
    expect(budget.warningThreshold).toBe(800);
    expect(budget.limitThreshold).toBe(950);
    expect(budget.isWarning).toBe(false);
    expect(budget.isLimited).toBe(false);
    expect(budget.isPersisted).toBe(false);
    expect(budget.lastSyncedAt).toBeNull();
  });
});

// ============================================================================
// Type interfaces
// ============================================================================
describe('type interfaces', () => {
  it('ChainVersionStats has expected shape', () => {
    const stats: ChainVersionStats = {
      totalVersions: 10,
      activeVersions: 4,
      draftVersions: 3,
      deprecatedVersions: 2,
      archivedVersions: 1,
      byChainType: { SCORING: 3, QUALIFICATION: 2 },
    };
    expect(stats.totalVersions).toBe(10);
    expect(stats.byChainType.SCORING).toBe(3);
  });

  it('VersionComparison has expected shape', () => {
    const comparison: VersionComparison = {
      versionA: {} as any,
      versionB: {} as any,
      differences: [
        { field: 'model', valueA: 'gpt-3.5', valueB: 'gpt-4' },
      ],
    };
    expect(comparison.differences).toHaveLength(1);
    expect(comparison.differences[0].field).toBe('model');
  });

  it('EpisodeBudget has expected shape', () => {
    const budget: EpisodeBudget = {
      used: 500,
      remaining: 500,
      total: 1000,
      warningThreshold: 800,
      limitThreshold: 950,
      isWarning: false,
      isLimited: false,
      isPersisted: true,
      lastSyncedAt: '2026-01-01T00:00:00Z',
    };
    expect(budget.total).toBe(1000);
    expect(budget.isPersisted).toBe(true);
    expect(budget.lastSyncedAt).toBe('2026-01-01T00:00:00Z');
  });
});
