/**
 * Custom Node Type Router Tests (IFC-031 FU-011)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { customNodeTypeRouter } from '../custom-node-type.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createPublicContext,
} from '../../../test/setup';
import { resetCustomNodeTypeRegistry } from '../../../workflow/registries/custom-node-type-registry';

describe('customNodeTypeRouter', () => {
  beforeEach(() => resetCustomNodeTypeRegistry());

  describe('list', () => {
    it('returns rows scoped to the tenant', async () => {
      const ctx = createTestContext();
      prismaMock.customNodeType.findMany.mockResolvedValue([
        {
          id: 'n1',
          typeId: 'slack_notify',
          label: 'Slack',
          description: null,
          iconKey: 'extension',
          accentClass: 'border-slate-500/60 bg-slate-500/5',
          configSchema: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: (ctx.tenant as { tenantId: string }).tenantId,
          createdBy: null,
        } as never,
      ]);

      const caller = customNodeTypeRouter.createCaller(ctx);
      const result = await caller.list();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].typeId).toBe('slack_notify');
    });
  });

  describe('create', () => {
    it('rejects non-admin callers with FORBIDDEN', async () => {
      const ctx = createTestContext();
      const caller = customNodeTypeRouter.createCaller(ctx);
      await expect(
        caller.create({
          typeId: 'slack',
          label: 'Slack',
          iconKey: 'extension',
          accentClass: '',
          configSchema: [],
          isActive: true,
        })
      ).rejects.toThrow(/Admin/i);
    });

    it('rejects UNAUTHORIZED when no user present', async () => {
      const ctx = createPublicContext();
      const caller = customNodeTypeRouter.createCaller(ctx);
      await expect(
        caller.create({
          typeId: 'slack',
          label: 'Slack',
          iconKey: 'extension',
          accentClass: '',
          configSchema: [],
          isActive: true,
        })
      ).rejects.toThrow();
    });

    it('rejects reserved typeId', async () => {
      const ctx = createAdminContext();
      const caller = customNodeTypeRouter.createCaller(ctx);
      await expect(
        caller.create({
          typeId: 'start',
          label: 'Start',
          iconKey: 'extension',
          accentClass: '',
          configSchema: [],
          isActive: true,
        })
      ).rejects.toThrow(/reserved/i);
    });

    it('creates a new custom node type for admins', async () => {
      const ctx = createAdminContext();
      prismaMock.customNodeType.create.mockResolvedValue({
        id: 'n99',
        typeId: 'pagerduty',
        label: 'PagerDuty',
      } as never);
      const caller = customNodeTypeRouter.createCaller(ctx);
      const result = await caller.create({
        typeId: 'pagerduty',
        label: 'PagerDuty',
        iconKey: 'extension',
        accentClass: '',
        configSchema: [],
        isActive: true,
      });
      expect(result.id).toBe('n99');
    });
  });

  describe('update', () => {
    it('throws NOT_FOUND when row missing', async () => {
      const ctx = createAdminContext();
      prismaMock.customNodeType.findFirst.mockResolvedValue(null);
      const caller = customNodeTypeRouter.createCaller(ctx);
      await expect(caller.update({ id: 'nope', label: 'x' })).rejects.toThrow(/not found/i);
    });

    it('updates a matching row', async () => {
      const ctx = createAdminContext();
      prismaMock.customNodeType.findFirst.mockResolvedValue({ id: 'n1' } as never);
      prismaMock.customNodeType.update.mockResolvedValue({ id: 'n1', label: 'New' } as never);
      const caller = customNodeTypeRouter.createCaller(ctx);
      const result = await caller.update({ id: 'n1', label: 'New' });
      expect((result as { label: string }).label).toBe('New');
    });
  });

  describe('delete', () => {
    it('soft-deletes via isActive=false', async () => {
      const ctx = createAdminContext();
      prismaMock.customNodeType.findFirst.mockResolvedValue({ id: 'n1' } as never);
      prismaMock.customNodeType.update.mockResolvedValue({ id: 'n1', isActive: false } as never);
      const caller = customNodeTypeRouter.createCaller(ctx);
      const result = await caller.delete({ id: 'n1' });
      expect(result.deleted).toBe(true);
      expect(prismaMock.customNodeType.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
      );
    });
  });
});
