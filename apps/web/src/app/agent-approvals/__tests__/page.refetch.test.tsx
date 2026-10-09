/**
 * Agent approvals page - refetch handling (SonarCloud S9383).
 *
 * - Mutation onSuccess callbacks return the refetch so each mutation stays
 *   pending until the queues have reloaded.
 * - The error-state Retry button awaits the refetch and surfaces a failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

type Opts = { onSuccess?: () => unknown };

const toastMock = vi.hoisted(() => vi.fn());
const refetches = vi.hoisted(() => ({
  pending: vi.fn(),
  list: vi.fn(),
  stats: vi.fn(),
}));
const captured = vi.hoisted(() => ({}) as Record<string, Opts | undefined>);
const queries = vi.hoisted(() => ({
  toolCount: { data: { count: 0 } },
  pending: {
    data: undefined as unknown,
    error: null as unknown,
    isLoading: false,
    refetch: null as unknown,
  },
  list: {
    data: undefined as unknown,
    error: null as unknown,
    isLoading: false,
    refetch: null as unknown,
  },
  stats: { data: undefined as unknown, refetch: null as unknown },
  assignees: { data: [] as unknown[] },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true, isLoading: false }),
}));
vi.mock('@/components/shared/assign-sheet', () => ({ AssignSheet: () => null }));
vi.mock('@/components/shared/entity-hover-card', () => ({ EntityHoverCard: () => null }));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: toastMock };
});

function mutation(name: string) {
  const result = { mutateAsync: vi.fn(), isPending: false };
  return { useMutation: (opts: Opts) => ((captured[name] = opts), result) };
}

vi.mock('@/lib/trpc', () => ({
  trpc: {
    agent: { getPendingCount: { useQuery: () => queries.toolCount } },
    ticket: { assignees: { useQuery: () => queries.assignees } },
    autoResponse: {
      getPendingForApprover: { useQuery: () => queries.pending },
      list: { useQuery: () => queries.list },
      getStatsByStatus: { useQuery: () => queries.stats },
      approve: mutation('approve'),
      reject: mutation('reject'),
      escalate: mutation('escalate'),
      rollback: mutation('rollback'),
      regenerate: mutation('regenerate'),
    },
  },
}));

import AgentApprovalsPage from '../page';

describe('AgentApprovalsPage refetch handling', () => {
  beforeEach(() => {
    for (const key of Object.keys(captured)) delete captured[key];
    toastMock.mockReset();
    refetches.pending.mockReset().mockResolvedValue({ status: 'success' });
    refetches.list.mockReset().mockResolvedValue({ status: 'success' });
    refetches.stats.mockReset().mockResolvedValue({ status: 'success' });
    queries.pending.refetch = refetches.pending;
    queries.pending.error = null;
    queries.list.refetch = refetches.list;
    queries.list.error = null;
    queries.stats.refetch = refetches.stats;
  });

  it.each(['approve', 'reject', 'escalate', 'rollback', 'regenerate'])(
    '%s onSuccess returns a promise that resolves after all three refetches',
    async (name) => {
      render(<AgentApprovalsPage />);

      const returned = captured[name]?.onSuccess?.();

      expect(returned).toBeInstanceOf(Promise);
      await returned;
      expect(refetches.pending).toHaveBeenCalledTimes(1);
      expect(refetches.list).toHaveBeenCalledTimes(1);
      expect(refetches.stats).toHaveBeenCalledTimes(1);
    }
  );

  describe('error state Retry', () => {
    beforeEach(() => {
      queries.pending.error = new Error('queue unavailable');
    });

    it('refetches the pending and list queries', async () => {
      render(<AgentApprovalsPage />);

      expect(screen.getByText('queue unavailable')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() => {
        expect(refetches.pending).toHaveBeenCalledTimes(1);
        expect(refetches.list).toHaveBeenCalledTimes(1);
      });
      expect(toastMock).not.toHaveBeenCalled();
    });

    it('shows a destructive toast and logs when a refetch rejects', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      refetches.list.mockRejectedValue(new Error('still down'));
      render(<AgentApprovalsPage />);

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          title: 'Retry Failed',
          description: 'still down',
          variant: 'destructive',
        })
      );
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to retry loading approvals:',
        expect.any(Error)
      );
    });

    it('uses a generic description for non-Error rejections', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      refetches.pending.mockRejectedValue('boom');
      render(<AgentApprovalsPage />);

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Retry Failed', description: 'Unknown error' })
        )
      );
    });
  });
});
