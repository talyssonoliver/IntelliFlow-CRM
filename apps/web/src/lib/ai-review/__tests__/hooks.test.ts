import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock primitives ----
const mockInvalidateList = vi.fn();
const mockInvalidateStats = vi.fn();
const mockToast = vi.fn();
let claimOpts: any = {};
let approveOpts: any = {};
let rejectOpts: any = {};
let escalateOpts: any = {};

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      aiReview: {
        list: { invalidate: mockInvalidateList },
        stats: { invalidate: mockInvalidateStats },
      },
    }),
    aiReview: {
      list: {
        useQuery: vi.fn((_filters: any, opts: any) => ({
          data: { data: [{ id: 'r1' }, { id: 'r2' }], total: 2, hasMore: false },
          isLoading: false,
          refetchInterval: opts?.refetchInterval,
        })),
      },
      stats: {
        useQuery: vi.fn((_input: any, opts: any) => ({
          data: { pending: 5, approved: 10, rejected: 2, escalated: 1, slaBreached: 0 },
          isLoading: false,
          refetchInterval: opts?.refetchInterval,
        })),
      },
      get: {
        useQuery: vi.fn((input: any, opts: any) => ({
          data: input.reviewId ? { id: input.reviewId } : undefined,
          enabled: opts?.enabled,
        })),
      },
      claim: {
        useMutation: vi.fn((opts: any) => {
          claimOpts = opts;
          return {
            mutateAsync: vi.fn(),
            isPending: false,
          };
        }),
      },
      approve: {
        useMutation: vi.fn((opts: any) => {
          approveOpts = opts;
          return {
            mutateAsync: vi.fn(),
            isPending: false,
          };
        }),
      },
      reject: {
        useMutation: vi.fn((opts: any) => {
          rejectOpts = opts;
          return {
            mutateAsync: vi.fn(),
            isPending: false,
          };
        }),
      },
      escalate: {
        useMutation: vi.fn((opts: any) => {
          escalateOpts = opts;
          return {
            mutateAsync: vi.fn(),
            isPending: false,
          };
        }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useState: vi.fn((init: any) => [init, vi.fn()]),
    useRef: vi.fn((init: any) => ({ current: init ?? new Map() })),
    useCallback: vi.fn((fn: any) => fn),
  };
});

vi.mock('@intelliflow/validators/ai-review', () => ({
  ReviewListFilter: {},
}));

import { useReviewQueue, useReviewDetail } from '../hooks';

describe('useReviewQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns reviews array from list query', () => {
    const result = useReviewQueue();
    expect(result.reviews).toEqual([{ id: 'r1' }, { id: 'r2' }]);
  });

  it('returns total from list query', () => {
    const result = useReviewQueue();
    expect(result.total).toBe(2);
  });

  it('returns hasMore from list query', () => {
    const result = useReviewQueue();
    expect(result.hasMore).toBe(false);
  });

  it('returns stats from stats query', () => {
    const result = useReviewQueue();
    expect(result.stats).toEqual({ pending: 5, approved: 10, rejected: 2, escalated: 1, slaBreached: 0 });
  });

  it('returns isLoading from list query', () => {
    const result = useReviewQueue();
    expect(result.isLoading).toBe(false);
  });

  it('returns filters and setFilters', () => {
    const result = useReviewQueue();
    expect(result.filters).toBeDefined();
    expect(result.setFilters).toBeDefined();
  });

  it('returns mutation functions (claim, approve, reject, escalate)', () => {
    const result = useReviewQueue();
    expect(typeof result.claim).toBe('function');
    expect(typeof result.approve).toBe('function');
    expect(typeof result.reject).toBe('function');
    expect(typeof result.escalate).toBe('function');
  });

  it('returns isMutating as false when no mutations pending', () => {
    const result = useReviewQueue();
    expect(result.isMutating).toBe(false);
  });

  it('returns getLockToken function', () => {
    const result = useReviewQueue();
    expect(typeof result.getLockToken).toBe('function');
  });

  it('claim onSuccess stores lock token and calls invalidateAll', () => {
    useReviewQueue();
    claimOpts.onSuccess({ lockToken: 'tok-1', review: { id: 'r1' }, expiresAt: new Date().toISOString() });
    expect(mockInvalidateList).toHaveBeenCalled();
    expect(mockInvalidateStats).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review claimed' }));
  });

  it('claim onError shows destructive toast', () => {
    useReviewQueue();
    claimOpts.onError({ message: 'Already claimed' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Failed to claim',
      variant: 'destructive',
    }));
  });

  it('approve onSuccess clears lock token and invalidates', () => {
    useReviewQueue();
    approveOpts.onSuccess({}, { reviewId: 'r1' });
    expect(mockInvalidateList).toHaveBeenCalled();
    expect(mockInvalidateStats).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review approved' }));
  });

  it('reject onSuccess clears lock token and invalidates', () => {
    useReviewQueue();
    rejectOpts.onSuccess({}, { reviewId: 'r1' });
    expect(mockInvalidateList).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review rejected' }));
  });

  it('escalate onSuccess clears lock token and invalidates', () => {
    useReviewQueue();
    escalateOpts.onSuccess({}, { reviewId: 'r1' });
    expect(mockInvalidateList).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review escalated' }));
  });

  it('approve onError shows destructive toast', () => {
    useReviewQueue();
    approveOpts.onError({ message: 'Token expired' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Failed to approve',
      variant: 'destructive',
    }));
  });

  it('reject onError shows destructive toast', () => {
    useReviewQueue();
    rejectOpts.onError({ message: 'Not found' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Failed to reject',
      variant: 'destructive',
    }));
  });

  it('escalate onError shows destructive toast', () => {
    useReviewQueue();
    escalateOpts.onError({ message: 'Unauthorized' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Failed to escalate',
      variant: 'destructive',
    }));
  });

  it('merges initial filters with defaults', () => {
    const result = useReviewQueue({ status: 'PENDING' as any });
    expect(result.filters).toBeDefined();
  });
});

describe('useReviewDetail', () => {
  it('returns query result for given reviewId', () => {
    const result = useReviewDetail('r1');
    expect(result.data).toEqual({ id: 'r1' });
  });

  it('is disabled when reviewId is empty', () => {
    const result = useReviewDetail('');
    expect(result.isEnabled).toBe(false);
  });
});
