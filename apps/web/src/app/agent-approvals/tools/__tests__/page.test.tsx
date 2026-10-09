/**
 * Agent tools page - "Test Execute" invalidation handling (SonarCloud S9383).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mutateAsync = vi.hoisted(() => vi.fn());
const invalidatePending = vi.hoisted(() => vi.fn());
const invalidateCount = vi.hoisted(() => vi.fn());

const stable = vi.hoisted(() => {
  const tool = {
    name: 'send_email',
    description: 'Sends an email',
    actionType: 'EMAIL',
    entityTypes: ['LEAD'],
  };
  return {
    tool,
    listTools: {
      isLoading: false,
      error: null,
      refetch: () => undefined,
      data: {
        requiringApproval: [tool],
        noApproval: [],
        all: [tool],
        metadata: undefined,
      },
    },
    count: { data: { count: 0 } },
    detail: {
      isLoading: false,
      error: null,
      data: {
        name: 'send_email',
        description: 'Sends an email',
        actionType: 'EMAIL',
        entityTypes: ['LEAD'],
        requiresApproval: true,
      },
    },
    executeMutation: {
      isPending: false,
      isSuccess: false,
      error: null,
      mutateAsync: null as unknown,
    },
    utils: null as unknown,
  };
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    agent: {
      listTools: { useQuery: () => stable.listTools },
      getPendingCount: { useQuery: () => stable.count },
      getTool: { useQuery: () => stable.detail },
      executeTool: { useMutation: () => stable.executeMutation },
    },
    useUtils: () => stable.utils,
  },
}));

import AgentToolsPage from '../page';

async function runTestExecute() {
  render(<AgentToolsPage />);
  fireEvent.click(screen.getByText('send_email'));
  fireEvent.click(await screen.findByRole('button', { name: /test execute/i }));
}

describe('AgentToolsPage Test Execute', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    invalidatePending.mockReset().mockResolvedValue(undefined);
    invalidateCount.mockReset().mockResolvedValue(undefined);
    stable.executeMutation.mutateAsync = mutateAsync;
    stable.utils = {
      agent: {
        getPendingApprovals: { invalidate: invalidatePending },
        getPendingCount: { invalidate: invalidateCount },
      },
    };
  });

  it('refreshes the approval queue and count when execution needs approval', async () => {
    mutateAsync.mockResolvedValue({ requiresApproval: true });

    await runTestExecute();

    await waitFor(() => {
      expect(invalidatePending).toHaveBeenCalledTimes(1);
      expect(invalidateCount).toHaveBeenCalledTimes(1);
    });
    expect(mutateAsync).toHaveBeenCalledWith({ toolName: 'send_email', input: {} });
  });

  it('does not invalidate when no approval is required', async () => {
    mutateAsync.mockResolvedValue({ requiresApproval: false });

    await runTestExecute();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(invalidatePending).not.toHaveBeenCalled();
    expect(invalidateCount).not.toHaveBeenCalled();
  });

  it('leaves the failure to the mutation error state when execution rejects', async () => {
    mutateAsync.mockRejectedValue(new Error('exec failed'));

    await runTestExecute();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(invalidatePending).not.toHaveBeenCalled();
  });
});
