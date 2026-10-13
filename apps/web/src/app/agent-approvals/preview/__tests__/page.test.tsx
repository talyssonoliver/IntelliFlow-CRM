/**
 * Agent approvals preview page - mutation callbacks return their refetches
 * so the mutation stays pending until the queue has reloaded (S9383).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

type Opts = { onSuccess?: () => unknown };

const refetchPending = vi.hoisted(() => vi.fn());
const refetchCount = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => ({}) as Record<string, Opts | undefined>);
const mutationResults = vi.hoisted(
  () => ({}) as Record<string, { mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean }>
);
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
  mutationResults[name] = result;
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

function pending(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    toolName: 'create_case',
    actionType: 'CREATE',
    entityType: 'CASE',
    preview: {
      summary: 'Create case "Renewal"',
      changes: [],
      affectedEntities: [{ type: 'CASE', id: 'NEW', name: 'Renewal', action: 'CREATE' }],
      estimatedImpact: 'HIGH',
    },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    status: 'PENDING',
    confidence: null,
    estimatedImpact: 'HIGH',
    escalatedAt: null,
    escalatedTo: null,
    executionStatus: null,
    ...overrides,
  };
}

describe('AgentApprovalsPreviewPage queue facts (PG-198)', () => {
  beforeEach(() => {
    stable.pending.refetch = vi.fn().mockResolvedValue({});
    stable.count.refetch = vi.fn().mockResolvedValue({});
  });

  it('shows a dash, never an impact-derived percent, when no confidence was reported (RF-2)', () => {
    stable.pending.data = [pending()];
    render(<AgentApprovalsPreviewPage />);

    expect(screen.getByTestId('no-confidence')).toHaveTextContent('No model confidence reported');
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
    expect(screen.getByTestId('impact-chip')).toHaveTextContent('High impact');
  });

  it('shows the real confidence when the agent reported one', () => {
    stable.pending.data = [pending({ confidence: 87, estimatedImpact: 'LOW' })];
    render(<AgentApprovalsPreviewPage />);

    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.queryByTestId('no-confidence')).not.toBeInTheDocument();
    expect(screen.getByTestId('impact-chip')).toHaveTextContent('Low impact');
  });

  it('marks escalated and interrupted actions', () => {
    stable.pending.data = [
      pending({ id: 'esc', escalatedAt: new Date().toISOString(), escalatedTo: 'm-1' }),
      pending({ id: 'int', status: 'APPROVED', executionStatus: 'EXECUTING' }),
    ];
    render(<AgentApprovalsPreviewPage />);

    expect(screen.getByTestId('escalated-badge')).toHaveTextContent('Escalated');
    expect(screen.getByTestId('interrupted-badge')).toHaveTextContent('Execution interrupted');
  });

  it('counts high-impact actions by impact, not by confidence', () => {
    stable.pending.data = [
      pending({ id: 'h1', confidence: 10 }),
      pending({
        id: 'l1',
        estimatedImpact: 'LOW',
        confidence: 99,
        preview: { ...pending().preview, estimatedImpact: 'LOW' },
      }),
    ];
    render(<AgentApprovalsPreviewPage />);

    const card = screen.getByTestId('metric-highimpact');
    expect(within(card).getByTestId('metric-value')).toHaveTextContent('1');
  });

  it('alerts when an approved action could not be executed (RF-1)', async () => {
    stable.pending.data = [pending()];
    render(<AgentApprovalsPreviewPage />);
    mutationResults.approve!.mutateAsync.mockResolvedValue({
      success: false,
      executionStatus: 'FAILED',
      error: 'Client not found',
    });

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Approved, but the action could not be executed: Client not found'
      )
    );
  });

  it('shows no alert when the approved action ran', async () => {
    stable.pending.data = [pending()];
    render(<AgentApprovalsPreviewPage />);
    mutationResults.approve!.mutateAsync.mockResolvedValue({ success: true });

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(mutationResults.approve!.mutateAsync).toHaveBeenCalled());
    expect(screen.queryByTestId('execution-error')).not.toBeInTheDocument();
  });
});
