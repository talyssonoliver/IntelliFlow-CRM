/**
 * Per-tenant metering: active workflows must respect the `workflowsActive` quota.
 */

import { describe, it, expect, vi } from 'vitest';
import { workflowRouter } from '../workflow.router';
import { createTestContext, mockServices, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const workflowId = TEST_UUIDS.task1;
const baseWorkflow = {
  id: workflowId,
  name: 'Lead Routing',
  isActive: false,
  deletedAt: null,
  tenantId: TEST_UUIDS.tenant,
};

const findFirst = () => prismaMock.workflowDefinition.findFirst as ReturnType<typeof vi.fn>;
const update = () => prismaMock.workflowDefinition.update as ReturnType<typeof vi.fn>;

describe('workflow.setActive quota guard', () => {
  it('rejects activating an inactive workflow when the tenant is at its limit', async () => {
    findFirst().mockResolvedValue(baseWorkflow);
    const ctx = createTestContext({
      services: { ...mockServices, quota: overQuota('workflowsActive', 3, 3) as never },
    });

    await expect(
      workflowRouter.createCaller(ctx).setActive({ id: workflowId, isActive: true })
    ).rejects.toMatchObject(quotaRejection('workflowsActive', 3, 3));
    expect(update()).not.toHaveBeenCalled();
  });

  it('activates when under the limit', async () => {
    findFirst().mockResolvedValue(baseWorkflow);
    update().mockResolvedValue({ ...baseWorkflow, isActive: true });
    const quota = underQuota();
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await workflowRouter
      .createCaller(ctx)
      .setActive({ id: workflowId, isActive: true });

    expect(result.isActive).toBe(true);
    expect(quota.assertWithinQuota).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'workflowsActive', 1);
  });

  it('never blocks deactivation, even when the tenant is over its limit', async () => {
    findFirst().mockResolvedValue({ ...baseWorkflow, isActive: true });
    update().mockResolvedValue({ ...baseWorkflow, isActive: false });
    const quota = overQuota('workflowsActive', 9, 3);
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    const result = await workflowRouter
      .createCaller(ctx)
      .setActive({ id: workflowId, isActive: false });

    expect(result.isActive).toBe(false);
    expect(quota.assertWithinQuota).not.toHaveBeenCalled();
  });

  it('does not count re-activating an already-active workflow', async () => {
    findFirst().mockResolvedValue({ ...baseWorkflow, isActive: true });
    update().mockResolvedValue({ ...baseWorkflow, isActive: true });
    const quota = overQuota('workflowsActive', 3, 3);
    const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

    await workflowRouter.createCaller(ctx).setActive({ id: workflowId, isActive: true });

    expect(quota.assertWithinQuota).not.toHaveBeenCalled();
  });
});

describe('workflow.create quota guard', () => {
  const createInput = {
    name: 'New workflow',
    category: 'lead',
    triggerType: 'manual',
    triggerConfig: {},
    steps: [
      { id: 1, type: 'start', config: {} },
      { id: 2, type: 'action', config: { actionType: 'send_notification' } },
      { id: 3, type: 'end', config: {} },
    ],
    edges: [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-2', target: 'node-3' },
    ],
  };

  it('rejects creating an (active by default) workflow when the tenant is at its limit', async () => {
    const create = prismaMock.workflowDefinition.create as ReturnType<typeof vi.fn>;
    const ctx = createTestContext({
      services: { ...mockServices, quota: overQuota('workflowsActive', 0, 0) as never },
    });

    await expect(
      workflowRouter.createCaller(ctx).create(createInput as never)
    ).rejects.toMatchObject(quotaRejection('workflowsActive', 0, 0));
    expect(create).not.toHaveBeenCalled();
  });
});
