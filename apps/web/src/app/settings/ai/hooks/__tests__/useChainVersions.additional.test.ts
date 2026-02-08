/**
 * Additional tests for useChainVersions.ts
 * Covers error states, loading states, and active version data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react', () => ({
  useState: vi.fn((i: unknown) => [i, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn: unknown) => fn),
  useMemo: vi.fn((fn: () => unknown) => fn()),
  useRef: vi.fn((i: unknown) => ({ current: i })),
}));

const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});
const mockInvalidate = vi.fn();
const mockQuery = vi.fn();
const mockToast = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      chainVersion: {
        list: { invalidate: mockInvalidate },
        getActive: { invalidate: mockInvalidate },
        getStats: { invalidate: mockInvalidate },
        getAuditLog: { invalidate: mockInvalidate },
      },
      client: { chainVersion: { compare: { query: mockQuery } } },
    }),
    chainVersion: {
      list: { useQuery: vi.fn(() => ({
        data: undefined, isLoading: false, error: { message: 'Network error' }, refetch: mockRefetch,
      })) },
      getActive: { useQuery: vi.fn(() => ({
        data: { version: { id: 'v-active', chainType: 'SCORING', status: 'ACTIVE' } },
        isLoading: false, error: null, refetch: mockRefetch,
      })) },
      getStats: { useQuery: vi.fn(() => ({
        data: { totalVersions: 10, activeVersions: 4 },
        isLoading: true, error: null, refetch: mockRefetch,
      })) },
      create: { useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })) },
      update: { useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })) },
      activate: { useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: true })) },
      deprecate: { useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })) },
      archive: { useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })) },
      rollback: { useMutation: vi.fn(() => ({ mutateAsync: mockMutateAsync, isPending: false })) },
      getAuditLog: { useQuery: vi.fn(() => ({
        data: [{ id:'a1', action:'ACTIVATE' }], isLoading: false, error: null, refetch: mockRefetch,
      })) },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@intelliflow/domain', () => ({}));
vi.mock('@intelliflow/validators', () => ({}));

import { useChainVersions, useVersionAudit, useZepBudget } from '../useChainVersions';

describe('useChainVersions additional', () => {
  beforeEach(() => vi.clearAllMocks());

  it('wraps query error in Error', () => {
    const r = useChainVersions();
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error?.message).toBe('Network error');
  });

  it('isLoadingStats from stats query', () => {
    expect(useChainVersions().isLoadingStats).toBe(true);
  });

  it('isActivating when pending', () => {
    expect(useChainVersions().isActivating).toBe(true);
  });

  it('maps active version data', () => {
    expect(useChainVersions().activeVersions.SCORING).toBeDefined();
  });

  it('returns stats', () => {
    expect(useChainVersions().stats).toBeDefined();
  });

  it('createVersion passes to mutateAsync', async () => {
    mockMutateAsync.mockResolvedValue({ id:'new' });
    await useChainVersions().createVersion({ chainType:'SCORING' } as any);
    expect(mockMutateAsync).toHaveBeenCalledWith({ chainType:'SCORING' });
  });
});

describe('useVersionAudit additional', () => {
  it('returns audit data', () => {
    expect(useVersionAudit({ versionId:'v-1' }).auditLog).toBeDefined();
  });
});

describe('useZepBudget additional', () => {
  it('budget fields', () => {
    const r = useZepBudget();
    expect(r.budget?.warningThreshold).toBe(800);
    expect(r.budget?.limitThreshold).toBe(950);
    expect(r.budget?.isPersisted).toBe(false);
  });
  it('percent used 0', () => expect(useZepBudget().percentUsed).toBe(0));
});
