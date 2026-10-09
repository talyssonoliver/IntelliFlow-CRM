import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: {
    aiMonitoring: {
      getActiveAgents: { useQuery: vi.fn() },
      getStatus: { useQuery: vi.fn() },
    },
  },
}));

import { api } from '@/lib/api';
import { useActiveAgentsDashboard } from '../hooks';

const mockAgents = api.aiMonitoring.getActiveAgents.useQuery as ReturnType<typeof vi.fn>;
const mockStatus = api.aiMonitoring.getStatus.useQuery as ReturnType<typeof vi.fn>;

function setup(agentsRefetch: ReturnType<typeof vi.fn>, statusRefetch: ReturnType<typeof vi.fn>) {
  mockAgents.mockReturnValue({
    data: { agents: [], totalActive: 0 },
    isLoading: false,
    error: null,
    refetch: agentsRefetch,
  });
  mockStatus.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: statusRefetch,
  });
}

describe('useActiveAgentsDashboard refetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes both the agents and the status queries', () => {
    const agentsRefetch = vi.fn().mockResolvedValue(undefined);
    const statusRefetch = vi.fn().mockResolvedValue(undefined);
    setup(agentsRefetch, statusRefetch);

    useActiveAgentsDashboard().refetch();

    expect(agentsRefetch).toHaveBeenCalledTimes(1);
    expect(statusRefetch).toHaveBeenCalledTimes(1);
  });

  it('logs when a refresh rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('network down');
    setup(vi.fn().mockResolvedValue(undefined), vi.fn().mockRejectedValue(failure));

    useActiveAgentsDashboard().refetch();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[useActiveAgentsDashboard] Failed to refresh:',
        failure
      )
    );
  });
});
