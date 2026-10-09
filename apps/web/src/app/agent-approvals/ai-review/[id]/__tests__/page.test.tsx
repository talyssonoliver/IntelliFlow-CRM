/**
 * AI review detail page - mutation handling (SonarCloud S9383).
 *
 * - Handlers use mutate(): failures are reported once by each mutation's
 *   onError toast instead of floating as an unhandled mutateAsync rejection.
 * - onSuccess toasts immediately, then returns the invalidations so the
 *   mutation stays pending until fresh data has loaded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

type Opts = {
  onSuccess?: (data?: unknown) => unknown;
  onError?: (err: { message: string }) => void;
};

const toastMock = vi.hoisted(() => vi.fn());
const invalidate = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  stats: vi.fn(),
}));
const mutate = vi.hoisted(() => ({
  claim: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  escalate: vi.fn(),
}));
const captured = vi.hoisted(() => ({}) as Record<string, Opts | undefined>);
const state = vi.hoisted(() => ({
  review: {
    id: 'rev-12345678',
    status: 'PENDING',
    outputType: 'LEAD_SCORING',
    outputPayload: {},
    confidence: 0.9,
    slaDeadline: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedBy: 'user-1' as string | null,
    escalationDepth: 0,
  },
  detail: { data: undefined as unknown, isLoading: false, isError: false },
  utils: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'rev-12345678' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));
vi.mock('@/lib/ai-review/hooks', () => ({ useReviewDetail: () => state.detail }));
vi.mock('@/lib/shared/date-utils', () => ({
  formatSlaClock: () => ({ text: '1h', isBreached: false }),
  formatTimeAgo: () => 'just now',
}));

function mutation(name: keyof typeof mutate) {
  const result = { mutate: mutate[name], isPending: false };
  return { useMutation: (opts: Opts) => ((captured[name] = opts), result) };
}

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => state.utils,
    aiReview: {
      claim: mutation('claim'),
      approve: mutation('approve'),
      reject: mutation('reject'),
      escalate: mutation('escalate'),
    },
  },
}));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useToast: () => ({ toast: toastMock }),
    StatusBadge: () => null,
    ConfidenceIndicator: () => null,
  };
});

import AIReviewDetailPage from '../page';

function showInReview(rerender: (ui: React.ReactElement) => void) {
  state.detail = {
    data: { ...state.review, status: 'IN_REVIEW' },
    isLoading: false,
    isError: false,
  };
  rerender(<AIReviewDetailPage />);
}

describe('AIReviewDetailPage mutations', () => {
  beforeEach(() => {
    for (const key of Object.keys(captured)) delete captured[key];
    toastMock.mockReset();
    for (const fn of [...Object.values(invalidate), ...Object.values(mutate)]) fn.mockReset();
    invalidate.get.mockResolvedValue(undefined);
    invalidate.list.mockResolvedValue(undefined);
    invalidate.stats.mockResolvedValue(undefined);
    state.detail = { data: state.review, isLoading: false, isError: false };
    state.utils = {
      aiReview: {
        get: { invalidate: invalidate.get },
        list: { invalidate: invalidate.list },
        stats: { invalidate: invalidate.stats },
      },
    };
  });

  it('claim uses mutate() with the review id', () => {
    render(<AIReviewDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: /claim review/i }));

    expect(mutate.claim).toHaveBeenCalledWith({ reviewId: 'rev-12345678' });
  });

  it.each([
    ['claim', 'Review claimed'],
    ['approve', 'Review approved'],
    ['reject', 'Review rejected'],
    ['escalate', 'Review escalated'],
  ])('%s onSuccess toasts first, then returns the invalidations', async (name, title) => {
    render(<AIReviewDetailPage />);

    let returned: unknown;
    act(() => {
      returned = captured[name]?.onSuccess?.({ lockToken: 'tok-1' });
    });

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title }));
    expect(returned).toBeInstanceOf(Promise);
    await returned;
    expect(invalidate.get).toHaveBeenCalledWith({ reviewId: 'rev-12345678' });
    expect(invalidate.list).toHaveBeenCalledTimes(1);
    expect(invalidate.stats).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['claim', 'Failed to claim'],
    ['approve', 'Failed to approve'],
    ['reject', 'Failed to reject'],
    ['escalate', 'Failed to escalate'],
  ])('%s onError shows a destructive toast', (name, title) => {
    render(<AIReviewDetailPage />);

    captured[name]?.onError?.({ message: 'lock lost' });

    expect(toastMock).toHaveBeenCalledWith({
      title,
      description: 'lock lost',
      variant: 'destructive',
    });
  });

  it('approve, reject and escalate call mutate() with the lock token', () => {
    const { rerender } = render(<AIReviewDetailPage />);
    act(() => {
      captured.claim?.onSuccess?.({ lockToken: 'tok-1' });
    });
    showInReview(rerender);

    fireEvent.click(screen.getByRole('button', { name: /^approve/i }));
    expect(mutate.approve).toHaveBeenCalledWith({ reviewId: 'rev-12345678', lockToken: 'tok-1' });

    fireEvent.click(screen.getByRole('button', { name: /^reject/i }));
    fireEvent.change(screen.getByLabelText('Rejection notes'), {
      target: { value: ' too risky ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(mutate.reject).toHaveBeenCalledWith({
      reviewId: 'rev-12345678',
      lockToken: 'tok-1',
      notes: 'too risky',
    });

    fireEvent.click(screen.getByRole('button', { name: /^escalate/i }));
    fireEvent.change(screen.getByLabelText('Escalation reason'), {
      target: { value: ' needs legal ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Escalation' }));
    expect(mutate.escalate).toHaveBeenCalledWith({
      reviewId: 'rev-12345678',
      lockToken: 'tok-1',
      reason: 'needs legal',
    });
  });
});
