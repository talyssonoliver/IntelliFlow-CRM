import { describe, it, expect, beforeEach } from 'vitest';
import {
  CustomNodeTypeRegistry,
  getCustomNodeTypeRegistry,
  resetCustomNodeTypeRegistry,
} from '../custom-node-type-registry';

const TENANT = 'tenant-1';

function buildMockPrisma(rows: Array<Record<string, unknown>>) {
  return {
    customNodeType: {
      findMany: async () => rows as never,
    },
  };
}

describe('CustomNodeTypeRegistry', () => {
  beforeEach(() => resetCustomNodeTypeRegistry());

  it('hydrates a tenant from Prisma on first load', async () => {
    const registry = new CustomNodeTypeRegistry();
    const prisma = buildMockPrisma([
      {
        id: '1',
        tenantId: TENANT,
        typeId: 'slack_notify',
        label: 'Slack Notify',
        description: 'Post to slack',
        iconKey: 'extension',
        accentClass: 'border-slate-500/60 bg-slate-500/5',
        configSchema: [{ key: 'channel', label: 'Channel', type: 'string' }],
        isActive: true,
      },
    ]);
    await registry.loadTenant(prisma as never, TENANT);
    expect(registry.get(TENANT, 'slack_notify')?.label).toBe('Slack Notify');
  });

  it('is idempotent on repeated loadTenant calls', async () => {
    const registry = new CustomNodeTypeRegistry();
    let calls = 0;
    const prisma = {
      customNodeType: {
        findMany: async () => {
          calls++;
          return [] as never;
        },
      },
    };
    await registry.loadTenant(prisma as never, TENANT);
    await registry.loadTenant(prisma as never, TENANT);
    expect(calls).toBe(1);
  });

  it('register() adds a descriptor directly', () => {
    const registry = new CustomNodeTypeRegistry();
    registry.register(TENANT, {
      typeId: 'pagerduty',
      label: 'PagerDuty',
      iconKey: 'extension',
      accentClass: 'border-rose-500/60 bg-rose-500/5',
      configSchema: [],
      isActive: true,
    });
    expect(registry.get(TENANT, 'pagerduty')?.label).toBe('PagerDuty');
  });

  it('invalidateTenant forces a reload on next lookup', async () => {
    const registry = new CustomNodeTypeRegistry();
    let callCount = 0;
    const prisma = {
      customNodeType: {
        findMany: async () => {
          callCount++;
          return [] as never;
        },
      },
    };
    await registry.loadTenant(prisma as never, TENANT);
    registry.invalidateTenant(TENANT);
    await registry.loadTenant(prisma as never, TENANT);
    expect(callCount).toBe(2);
  });

  it('list() returns all registered descriptors for a tenant', () => {
    const registry = new CustomNodeTypeRegistry();
    registry.register(TENANT, {
      typeId: 'a',
      label: 'A',
      iconKey: 'extension',
      accentClass: '',
      configSchema: [],
      isActive: true,
    });
    registry.register(TENANT, {
      typeId: 'b',
      label: 'B',
      iconKey: 'extension',
      accentClass: '',
      configSchema: [],
      isActive: true,
    });
    expect(registry.list(TENANT)).toHaveLength(2);
  });

  it('get() returns undefined for unknown tenant/typeId', () => {
    const registry = new CustomNodeTypeRegistry();
    expect(registry.get('nope', 'nope')).toBeUndefined();
  });

  it('getCustomNodeTypeRegistry() returns a singleton', () => {
    const a = getCustomNodeTypeRegistry();
    const b = getCustomNodeTypeRegistry();
    expect(a).toBe(b);
  });

  it('skips malformed rows', async () => {
    const registry = new CustomNodeTypeRegistry();
    const prisma = buildMockPrisma([
      {
        id: 'bad',
        tenantId: TENANT,
        typeId: 'Invalid Slug',
        label: '',
        iconKey: 'extension',
        accentClass: '',
        configSchema: [],
        isActive: true,
      },
    ]);
    await registry.loadTenant(prisma as never, TENANT);
    expect(registry.list(TENANT)).toHaveLength(0);
  });
});
