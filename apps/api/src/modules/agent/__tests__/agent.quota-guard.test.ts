/**
 * Per-tenant metering: agent.executeTool must respect the `aiSpendCentsPerMonth` budget.
 * The guard only asserts; spend is recorded where the cost becomes known (not here).
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestContext, mockServices, TEST_UUIDS } from '../../../test/setup';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const getForTenantMock = vi.hoisted(() => vi.fn());

vi.mock('../../../agent/tools', () => ({
  ToolDisabledError: class ToolDisabledError extends Error {},
  getForTenant: getForTenantMock,
  getAvailableToolNames: () => [],
  getAgentTool: vi.fn(),
  getToolsRequiringApproval: () => [],
  getToolsNotRequiringApproval: () => [],
  toolMetadata: { categories: {} },
}));

vi.mock('../../../agent/approval-workflow', () => ({
  approvalWorkflowService: {},
  pendingActionsStore: { add: vi.fn() },
}));

vi.mock('../../../agent/authorization', () => ({
  agentAuthorizationService: { authorizeToolExecution: vi.fn() },
  buildAuthContext: vi.fn(),
}));

vi.mock('../../../agent/logger', () => ({ agentLogger: { log: vi.fn() } }));

import { agentRouter } from '../agent.router';

const input = { toolName: 'search_leads', input: {} };

describe('agent.executeTool quota guard', () => {
  it('rejects before resolving the tool when the AI budget is exhausted', async () => {
    getForTenantMock.mockReset();
    const ctx = createTestContext({
      services: { ...mockServices, quota: overQuota('aiSpendCentsPerMonth', 0, 0) as never },
    });

    await expect(agentRouter.createCaller(ctx).executeTool(input)).rejects.toMatchObject(
      quotaRejection('aiSpendCentsPerMonth', 0, 0)
    );
    expect(getForTenantMock).not.toHaveBeenCalled();
  });

  it('continues into tool resolution when the budget has headroom', async () => {
    getForTenantMock.mockReset();
    getForTenantMock.mockResolvedValue(null);
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    await expect(agentRouter.createCaller(ctx).executeTool(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(quota.assertWithinQuota).toHaveBeenCalledWith(
      TEST_UUIDS.tenant,
      'aiSpendCentsPerMonth',
      1
    );
    expect(getForTenantMock).toHaveBeenCalledTimes(1);
  });
});
