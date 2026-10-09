/**
 * Agent approvals preview page - mutation callbacks return their refetches
 * so the mutation stays pending until the queue has reloaded (S9383).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

type Opts = { onSuccess?: () => unknown };

const refetchPending = vi.hoisted(() => vi.fn());
const refetchCount = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => ({}) as Record<string, Opts | undefined>);
const stable = vi.hoisted(() => ({
  pending: { data: [] as unknown[], isLoading: false, error: null, refetch: null as unknown },
  count: { data: { count: 0 }, refetch: null as unknown },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

function mutation(name: string) {
  const result = { mutateAsync: vi.fn(), isPending: false };
  return { useMutation: (opts: Opts) => ((captured[name] = opts), result) };
}

vi.mock('@/lib/trpc', () => ({
  trpc: {
    agent: {
      getPendingApprovals: { useQuery: () => stable.pending },
      getPendingCount: { useQuery: () => stable.count },
      approveAction: mutation('approve'),
      rejectAction: mutation('reject'),
    },
  },
}));

import AgentApprovalsPreviewPage from '../page';

describe('AgentApprovalsPreviewPage mutation callbacks', () => {
  beforeEach(() => {
    for (const key of Object.keys(captured)) delete captured[key];
    refetchPending.mockReset().mockResolvedValue({ status: 'success' });
    refetchCount.mockReset().mockResolvedValue({ status: 'success' });
    stable.pending.refetch = refetchPending;
    stable.count.refetch = refetchCount;
  });

  it.each(['approve', 'reject'])(
    '%s onSuccess returns a promise that resolves after both refetches',
    async (name) => {
      render(<AgentApprovalsPreviewPage />);

      const returned = captured[name]?.onSuccess?.();

      expect(returned).toBeInstanceOf(Promise);
      await returned;
      expect(refetchPending).toHaveBeenCalledTimes(1);
      expect(refetchCount).toHaveBeenCalledTimes(1);
    }
  );
});
