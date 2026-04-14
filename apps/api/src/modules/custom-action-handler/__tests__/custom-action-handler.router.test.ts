/**
 * Custom Action Handler Router Tests (IFC-031 FU-012)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { customActionHandlerRouter } from '../custom-action-handler.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createPublicContext,
} from '../../../test/setup';
import { resetCustomActionHandlerRegistry } from '../../../workflow/registries/custom-action-handler-registry';

describe('customActionHandlerRouter', () => {
  beforeEach(() => resetCustomActionHandlerRegistry());
  afterEach(() => vi.restoreAllMocks());

  describe('list', () => {
    it('redacts authHeader via hasAuthHeader boolean', async () => {
      const ctx = createTestContext();
      prismaMock.customActionHandler.findMany.mockResolvedValue([
        {
          id: 'h1',
          actionTypeId: 'slack_ping',
          label: 'Slack Ping',
          description: null,
          endpointUrl: 'https://example.com/hook',
          authHeader: 'Bearer secret',
          timeoutMs: 30000,
          inputSchema: [],
          outputSchema: [],
          isActive: true,
          tenantId: (ctx.tenant as { tenantId: string }).tenantId,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never,
      ]);
      const caller = customActionHandlerRouter.createCaller(ctx);
      const result = await caller.list();
      expect(result.items[0]).toMatchObject({ hasAuthHeader: true });
      expect((result.items[0] as unknown as { authHeader?: string }).authHeader).toBeUndefined();
    });
  });

  describe('create', () => {
    const payload = {
      actionTypeId: 'hubspot_sync',
      label: 'HubSpot',
      endpointUrl: 'https://hooks.example.com/hubspot',
      timeoutMs: 30000,
      inputSchema: [],
      outputSchema: [],
      isActive: true,
    };

    it('rejects non-admin', async () => {
      const ctx = createTestContext();
      const caller = customActionHandlerRouter.createCaller(ctx);
      await expect(caller.create(payload)).rejects.toThrow(/Admin/i);
    });

    it('rejects reserved actionTypeId', async () => {
      const ctx = createAdminContext();
      const caller = customActionHandlerRouter.createCaller(ctx);
      await expect(
        caller.create({ ...payload, actionTypeId: 'send_notification' })
      ).rejects.toThrow(/reserved/i);
    });

    it('rejects private-IP endpointUrl (SSRF guard)', async () => {
      const ctx = createAdminContext();
      const caller = customActionHandlerRouter.createCaller(ctx);
      await expect(
        caller.create({ ...payload, endpointUrl: 'http://192.168.0.1/hook' })
      ).rejects.toThrow();
    });

    it('creates for admin with public URL', async () => {
      const ctx = createAdminContext();
      prismaMock.customActionHandler.create.mockResolvedValue({
        id: 'h42',
        actionTypeId: 'hubspot_sync',
        authHeader: null,
      } as never);
      const caller = customActionHandlerRouter.createCaller(ctx);
      const result = await caller.create(payload);
      expect(result.id).toBe('h42');
    });

    it('rejects UNAUTHORIZED when no user present', async () => {
      const ctx = createPublicContext();
      const caller = customActionHandlerRouter.createCaller(ctx);
      await expect(caller.create(payload)).rejects.toThrow();
    });
  });

  describe('test', () => {
    it('POSTs to the endpoint and returns summary', async () => {
      const ctx = createAdminContext();
      prismaMock.customActionHandler.findFirst.mockResolvedValue({
        id: 'h1',
        endpointUrl: 'https://httpbin.org/post',
        authHeader: 'Bearer abc',
        timeoutMs: 5000,
        actionTypeId: 'test',
      } as never);
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () => '{"ok":true}',
      });
      vi.stubGlobal('fetch', fetchMock);

      const caller = customActionHandlerRouter.createCaller(ctx);
      const result = await caller.test({ id: 'h1' });
      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://httpbin.org/post',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('captures fetch error message', async () => {
      const ctx = createAdminContext();
      prismaMock.customActionHandler.findFirst.mockResolvedValue({
        id: 'h1',
        endpointUrl: 'https://example.com/nope',
        authHeader: null,
        timeoutMs: 1000,
        actionTypeId: 'test',
      } as never);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network down'))
      );

      const caller = customActionHandlerRouter.createCaller(ctx);
      const result = await caller.test({ id: 'h1' });
      expect(result.errorMessage).toBe('network down');
      expect(result.ok).toBe(false);
    });
  });
});
