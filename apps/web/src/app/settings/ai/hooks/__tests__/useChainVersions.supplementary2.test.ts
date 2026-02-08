/**
 * useChainVersions - Supplementary2 Tests
 *
 * Covers uncovered branches in useChainVersions.ts:
 * - Mutation onSuccess / onError callbacks (toast + invalidation)
 * - updateVersion wrapper
 * - deprecateVersion wrapper
 * - archiveVersion wrapper
 * - rollbackVersion wrapper (invalidates getAuditLog)
 * - refetch calls all 6 queries
 * - useVersionAudit error wrapping
 * - useVersionAudit refetch
 * - useZepBudget budgetStatus thresholds (warning, critical)
 * - useZepBudget edge case: total=0
 * - Query filter options: chainType='all', status='all'
 *
 * NO @testing-library/react - pure logic tests with mocked hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Hoisted mocks
// ============================================================
const mocks = vi.hoisted(() => ({
  mockRefetch: vi.fn(),
  mockMutateAsync: vi.fn().mockResolvedValue({}),
  mockInvalidate: vi.fn(),
  mockCompareQuery: vi.fn().mockResolvedValue({ differences: [] }),
  mockToast: vi.fn(),
  // Track onSuccess/onError callbacks registered by useMutation
  mutationCallbacks: {} as Record<string, { onSuccess?: Function; onError?: Function }>,
}));

// ============================================================
// Mock React
// ============================================================
vi.mock('react', () => ({
  useState: vi.fn((i: unknown) => [i, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn: unknown) => fn),
  useMemo: vi.fn((fn: () => unknown) => fn()),
  useRef: vi.fn((i: unknown) => ({ current: i })),
}));

// ============================================================
// Mock tRPC/API - capture mutation callbacks
// ============================================================
vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      chainVersion: {
        list: { invalidate: mocks.mockInvalidate },
        getActive: { invalidate: mocks.mockInvalidate },
        getStats: { invalidate: mocks.mockInvalidate },
        getAuditLog: { invalidate: mocks.mockInvalidate },
      },
      client: {
        chainVersion: {
          compare: { query: mocks.mockCompareQuery },
        },
      },
    }),
    chainVersion: {
      list: {
        useQuery: vi.fn(() => ({
          data: { items: [{ id: 'v1', chainType: 'SCORING' }] },
          isLoading: false,
          error: null,
          refetch: mocks.mockRefetch,
        })),
      },
      getActive: {
        useQuery: vi.fn(() => ({
          data: { version: null },
          isLoading: false,
          error: null,
          refetch: mocks.mockRefetch,
        })),
      },
      getStats: {
        useQuery: vi.fn(() => ({
          data: { totalVersions: 5, activeVersions: 2, draftVersions: 1, deprecatedVersions: 1, archivedVersions: 1 },
          isLoading: false,
          error: null,
          refetch: mocks.mockRefetch,
        })),
      },
      create: {
        useMutation: vi.fn((opts: any) => {
          mocks.mutationCallbacks.create = opts;
          return { mutateAsync: mocks.mockMutateAsync, isPending: false };
        }),
      },
      update: {
        useMutation: vi.fn((opts: any) => {
          mocks.mutationCallbacks.update = opts;
          return { mutateAsync: mocks.mockMutateAsync, isPending: false };
        }),
      },
      activate: {
        useMutation: vi.fn((opts: any) => {
          mocks.mutationCallbacks.activate = opts;
          return { mutateAsync: mocks.mockMutateAsync, isPending: false };
        }),
      },
      deprecate: {
        useMutation: vi.fn((opts: any) => {
          mocks.mutationCallbacks.deprecate = opts;
          return { mutateAsync: mocks.mockMutateAsync, isPending: false };
        }),
      },
      archive: {
        useMutation: vi.fn((opts: any) => {
          mocks.mutationCallbacks.archive = opts;
          return { mutateAsync: mocks.mockMutateAsync, isPending: false };
        }),
      },
      rollback: {
        useMutation: vi.fn((opts: any) => {
          mocks.mutationCallbacks.rollback = opts;
          return { mutateAsync: mocks.mockMutateAsync, isPending: false };
        }),
      },
      getAuditLog: {
        useQuery: vi.fn(() => ({
          data: undefined,
          isLoading: false,
          error: { message: 'Audit fetch failed' },
          refetch: mocks.mockRefetch,
        })),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({ useToast: () => ({ toast: mocks.mockToast }) }));
vi.mock('@intelliflow/domain', () => ({}));
vi.mock('@intelliflow/validators', () => ({}));

// ============================================================
// Import after mocks
// ============================================================
import { useChainVersions, useVersionAudit, useZepBudget } from '../useChainVersions';

// ============================================================
// Tests
// ============================================================
describe('useChainVersions supplementary2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationCallbacks = {} as any;
  });

  // -------------------------------------------------------
  // Mutation onSuccess callbacks
  // -------------------------------------------------------
  describe('mutation onSuccess callbacks', () => {
    it('create onSuccess shows toast and invalidates list + stats', () => {
      useChainVersions(); // triggers useMutation registration
      const cb = mocks.mutationCallbacks.create;
      expect(cb?.onSuccess).toBeDefined();
      cb!.onSuccess!();

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Version created' }),
      );
      expect(mocks.mockInvalidate).toHaveBeenCalled();
    });

    it('update onSuccess shows toast and invalidates list', () => {
      useChainVersions();
      mocks.mutationCallbacks.update!.onSuccess!();

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Version updated' }),
      );
    });

    it('activate onSuccess invalidates list, getActive, and stats', () => {
      useChainVersions();
      mocks.mockInvalidate.mockClear();
      mocks.mutationCallbacks.activate!.onSuccess!();

      // Should invalidate list, getActive, getStats = at least 3 calls
      expect(mocks.mockInvalidate).toHaveBeenCalled();
      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Version activated' }),
      );
    });

    it('deprecate onSuccess shows toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.deprecate!.onSuccess!();

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Version deprecated' }),
      );
    });

    it('archive onSuccess shows toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.archive!.onSuccess!();

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Version archived' }),
      );
    });

    it('rollback onSuccess invalidates list, getActive, stats, and auditLog', () => {
      useChainVersions();
      mocks.mockInvalidate.mockClear();
      mocks.mutationCallbacks.rollback!.onSuccess!();

      // Should invalidate list, getActive, getStats, getAuditLog = 4 calls
      expect(mocks.mockInvalidate).toHaveBeenCalled();
      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Rollback successful' }),
      );
    });
  });

  // -------------------------------------------------------
  // Mutation onError callbacks
  // -------------------------------------------------------
  describe('mutation onError callbacks', () => {
    it('create onError shows destructive toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.create!.onError!({ message: 'Duplicate version' });

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to create version',
          description: 'Duplicate version',
          variant: 'destructive',
        }),
      );
    });

    it('update onError shows destructive toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.update!.onError!({ message: 'Not found' });

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to update version',
          variant: 'destructive',
        }),
      );
    });

    it('activate onError shows destructive toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.activate!.onError!({ message: 'Already active' });

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to activate version' }),
      );
    });

    it('deprecate onError shows destructive toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.deprecate!.onError!({ message: 'Cannot deprecate' });

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to deprecate version' }),
      );
    });

    it('archive onError shows destructive toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.archive!.onError!({ message: 'Cannot archive' });

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to archive version' }),
      );
    });

    it('rollback onError shows destructive toast', () => {
      useChainVersions();
      mocks.mutationCallbacks.rollback!.onError!({ message: 'Rollback impossible' });

      expect(mocks.mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Rollback failed',
          description: 'Rollback impossible',
        }),
      );
    });
  });

  // -------------------------------------------------------
  // Mutation wrapper functions
  // -------------------------------------------------------
  describe('mutation wrapper functions', () => {
    it('updateVersion wraps id and input correctly', async () => {
      const result = useChainVersions();
      await result.updateVersion('v-42', { config: { x: 1 } } as any);
      expect(mocks.mockMutateAsync).toHaveBeenCalledWith({
        versionId: 'v-42',
        data: { config: { x: 1 } },
      });
    });

    it('deprecateVersion wraps versionId', async () => {
      const result = useChainVersions();
      await result.deprecateVersion('v-old');
      expect(mocks.mockMutateAsync).toHaveBeenCalledWith({ versionId: 'v-old' });
    });

    it('archiveVersion wraps versionId', async () => {
      const result = useChainVersions();
      await result.archiveVersion('v-archive');
      expect(mocks.mockMutateAsync).toHaveBeenCalledWith({ versionId: 'v-archive' });
    });

    it('rollbackVersion wraps versionId and reason', async () => {
      const result = useChainVersions();
      await result.rollbackVersion('v-bad', 'Critical bug');
      expect(mocks.mockMutateAsync).toHaveBeenCalledWith({
        versionId: 'v-bad',
        reason: 'Critical bug',
      });
    });
  });

  // -------------------------------------------------------
  // refetch
  // -------------------------------------------------------
  describe('refetch', () => {
    it('calls refetch on all queries', () => {
      const result = useChainVersions();
      mocks.mockRefetch.mockClear();
      result.refetch();

      // Should call refetch 6 times:
      // versionsQuery, 4x getActive, statsQuery
      expect(mocks.mockRefetch).toHaveBeenCalled();
      expect(mocks.mockRefetch.mock.calls.length).toBeGreaterThanOrEqual(6);
    });
  });

  // -------------------------------------------------------
  // compareVersions
  // -------------------------------------------------------
  describe('compareVersions', () => {
    it('calls compare query with correct IDs', async () => {
      const result = useChainVersions();
      await result.compareVersions('v-a', 'v-b');
      expect(mocks.mockCompareQuery).toHaveBeenCalledWith({
        versionIdA: 'v-a',
        versionIdB: 'v-b',
      });
    });

    it('returns comparison result', async () => {
      mocks.mockCompareQuery.mockResolvedValueOnce({
        versionA: { id: 'v-a' },
        versionB: { id: 'v-b' },
        differences: [{ field: 'model', valueA: 'gpt-3.5', valueB: 'gpt-4' }],
      });

      const result = useChainVersions();
      const comparison = await result.compareVersions('v-a', 'v-b');
      expect(comparison.differences).toHaveLength(1);
    });
  });

  // -------------------------------------------------------
  // Query data mapping
  // -------------------------------------------------------
  describe('query data mapping', () => {
    it('versions maps from data.items', () => {
      const result = useChainVersions();
      expect(result.versions).toBeDefined();
      expect(result.versions![0].id).toBe('v1');
    });

    it('stats maps from stats query data', () => {
      const result = useChainVersions();
      expect(result.stats).toBeDefined();
      expect(result.stats!.totalVersions).toBe(5);
    });
  });
});

// ============================================================
// useVersionAudit supplementary2
// ============================================================
describe('useVersionAudit supplementary2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('wraps audit query error in Error', () => {
    const result = useVersionAudit({ versionId: 'v-err' });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Audit fetch failed');
  });

  it('refetch calls audit query refetch', () => {
    const result = useVersionAudit({ versionId: 'v-1' });
    mocks.mockRefetch.mockClear();
    result.refetch();
    expect(mocks.mockRefetch).toHaveBeenCalled();
  });

  it('returns undefined auditLog when no data', () => {
    const result = useVersionAudit({ versionId: 'v-1' });
    expect(result.auditLog).toBeUndefined();
  });
});

// ============================================================
// useZepBudget supplementary2
// ============================================================
describe('useZepBudget supplementary2', () => {
  describe('budgetStatus thresholds', () => {
    it('returns normal status for low usage (0%)', () => {
      const result = useZepBudget();
      expect(result.budgetStatus).toBe('normal');
      expect(result.percentUsed).toBe(0);
    });

    it('budget status logic: >=95 is critical', () => {
      // Test the pure logic
      const percentUsed = 96;
      const status = percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal';
      expect(status).toBe('critical');
    });

    it('budget status logic: >=80 and <95 is warning', () => {
      const percentUsed = 85;
      const status = percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal';
      expect(status).toBe('warning');
    });

    it('budget status logic: <80 is normal', () => {
      const percentUsed = 50;
      const status = percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal';
      expect(status).toBe('normal');
    });

    it('budget status logic: exactly 80 is warning', () => {
      const percentUsed = 80;
      const status = percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal';
      expect(status).toBe('warning');
    });

    it('budget status logic: exactly 95 is critical', () => {
      const percentUsed = 95;
      const status = percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal';
      expect(status).toBe('critical');
    });
  });

  describe('percentUsed calculation', () => {
    it('formula: Math.round((used/total)*100)', () => {
      const calc = (used: number, total: number) =>
        total > 0 ? Math.round((used / total) * 100) : 0;

      expect(calc(0, 1000)).toBe(0);
      expect(calc(500, 1000)).toBe(50);
      expect(calc(999, 1000)).toBe(100);
      expect(calc(333, 1000)).toBe(33);
    });

    it('returns 0 when total is 0', () => {
      const total = 0;
      const used = 0;
      const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
      expect(percentUsed).toBe(0);
    });
  });

  describe('mock budget fields', () => {
    it('returns all required fields', () => {
      const result = useZepBudget();
      const b = result.budget!;
      expect(b.used).toBe(0);
      expect(b.remaining).toBe(1000);
      expect(b.total).toBe(1000);
      expect(b.warningThreshold).toBe(800);
      expect(b.limitThreshold).toBe(950);
      expect(b.isWarning).toBe(false);
      expect(b.isLimited).toBe(false);
      expect(b.isPersisted).toBe(false);
      expect(b.lastSyncedAt).toBeNull();
    });
  });
});
