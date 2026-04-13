import { describe, it, expect, beforeEach } from 'vitest';
import {
  CustomActionHandlerRegistry,
  getCustomActionHandlerRegistry,
  resetCustomActionHandlerRegistry,
} from '../custom-action-handler-registry';

const TENANT = 'tenant-a';

describe('CustomActionHandlerRegistry', () => {
  beforeEach(() => resetCustomActionHandlerRegistry());

  it('hydrates from prisma and persists descriptors', async () => {
    const registry = new CustomActionHandlerRegistry();
    const prisma = {
      customActionHandler: {
        findMany: async () =>
          [
            {
              id: 'h1',
              tenantId: TENANT,
              actionTypeId: 'hubspot_sync',
              label: 'HubSpot sync',
              description: null,
              endpointUrl: 'https://example.com/hook',
              authHeader: 'Bearer secret',
              timeoutMs: 15000,
              inputSchema: [],
              outputSchema: [],
              isActive: true,
            },
          ] as never,
      },
    };
    await registry.loadTenant(prisma as never, TENANT);
    expect(registry.get(TENANT, 'hubspot_sync')?.timeoutMs).toBe(15000);
  });

  it('getById() finds by internal id', () => {
    const registry = new CustomActionHandlerRegistry();
    registry.register(TENANT, {
      id: 'abc',
      actionTypeId: 'ping',
      label: 'Ping',
      endpointUrl: 'https://example.com/p',
      timeoutMs: 30000,
      inputSchema: [],
      outputSchema: [],
      isActive: true,
    });
    expect(registry.getById(TENANT, 'abc')?.actionTypeId).toBe('ping');
    expect(registry.getById(TENANT, 'nope')).toBeUndefined();
  });

  it('invalidate + reload reads again', async () => {
    const registry = new CustomActionHandlerRegistry();
    let calls = 0;
    const prisma = {
      customActionHandler: {
        findMany: async () => {
          calls++;
          return [] as never;
        },
      },
    };
    await registry.loadTenant(prisma as never, TENANT);
    registry.invalidateTenant(TENANT);
    await registry.loadTenant(prisma as never, TENANT);
    expect(calls).toBe(2);
  });

  it('getCustomActionHandlerRegistry() returns a singleton', () => {
    const a = getCustomActionHandlerRegistry();
    const b = getCustomActionHandlerRegistry();
    expect(a).toBe(b);
  });

  it('rejects malformed row (non-URL endpoint)', async () => {
    const registry = new CustomActionHandlerRegistry();
    const prisma = {
      customActionHandler: {
        findMany: async () =>
          [
            {
              id: 'bad',
              tenantId: TENANT,
              actionTypeId: 'bad_handler',
              label: 'Bad',
              description: null,
              endpointUrl: 'not-a-url',
              authHeader: null,
              timeoutMs: 1000,
              inputSchema: [],
              outputSchema: [],
              isActive: true,
            },
          ] as never,
      },
    };
    await registry.loadTenant(prisma as never, TENANT);
    expect(registry.list(TENANT)).toHaveLength(0);
  });
});
