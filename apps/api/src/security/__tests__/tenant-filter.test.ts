import { describe, expect, it } from 'vitest';
import { TENANT_MODELS } from '@intelliflow/db';
import { TENANT_FILTER_EXCLUDED_MODELS, scopeTenantArgs, tenantModelInfo } from '../tenant-filter';

const T = 'tenant-a';
const OTHER = 'tenant-b';

describe('tenantModelInfo', () => {
  it('applies to tenant-owned models from the schema', () => {
    expect(tenantModelInfo('Opportunity')).toEqual({ nullable: false, relation: 'tenant' });
  });

  it('skips models without a tenantId column, excluded models and model-less calls', () => {
    expect(tenantModelInfo('Tenant')).toBeNull();
    expect(tenantModelInfo('User')).toBeNull();
    expect(tenantModelInfo(undefined)).toBeNull();
  });

  it('only excludes models that really are tenant-owned, each with a reason', () => {
    for (const [model, reason] of Object.entries(TENANT_FILTER_EXCLUDED_MODELS)) {
      expect(TENANT_MODELS[model], model).not.toBeUndefined();
      expect(reason.length, model).toBeGreaterThan(20);
    }
  });
});

describe('scopeTenantArgs: filtered operations', () => {
  it.each([
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
    'updateMany',
    'updateManyAndReturn',
    'deleteMany',
  ])('%s ANDs the tenant onto the caller where', (operation) => {
    const args = { where: { stage: 'WON' } };
    expect(scopeTenantArgs('Opportunity', operation, args, T)).toMatchObject({
      where: { AND: [{ stage: 'WON' }, { tenantId: T }] },
    });
  });

  it('adds a where when the caller has none', () => {
    expect(scopeTenantArgs('Opportunity', 'findMany', undefined, T)).toEqual({
      where: { tenantId: T },
    });
    expect(scopeTenantArgs('Opportunity', 'count', {}, T)).toEqual({ where: { tenantId: T } });
  });

  it('keeps a caller filter on another tenant, so the result is empty, not widened', () => {
    expect(scopeTenantArgs('Opportunity', 'findMany', { where: { tenantId: OTHER } }, T)).toEqual({
      where: { AND: [{ tenantId: OTHER }, { tenantId: T }] },
    });
  });

  it('keeps every other argument and leaves the input untouched', () => {
    const args = { where: { deletedAt: null }, by: ['stage'], _count: true, take: 5 };
    const frozen = JSON.stringify(args);
    const out = scopeTenantArgs('Opportunity', 'groupBy', args, T) as Record<string, unknown>;
    expect(out).toMatchObject({ by: ['stage'], _count: true, take: 5 });
    expect(JSON.stringify(args)).toBe(frozen);
  });
});

describe('scopeTenantArgs: unique operations', () => {
  it.each(['findUnique', 'findUniqueOrThrow', 'update', 'delete'])(
    '%s adds the tenant next to the unique key',
    (operation) => {
      expect(
        scopeTenantArgs('Opportunity', operation, { where: { id: 'o1' }, data: {} }, T)
      ).toMatchObject({ where: { id: 'o1', AND: [{ tenantId: T }] } });
    }
  );

  it('keeps an existing AND, as an object or an array', () => {
    expect(
      scopeTenantArgs('Opportunity', 'findUnique', { where: { id: 'o1', AND: { stage: 'X' } } }, T)
    ).toEqual({ where: { id: 'o1', AND: [{ stage: 'X' }, { tenantId: T }] } });
    expect(
      scopeTenantArgs('Opportunity', 'delete', { where: { id: 'o1', AND: [{ a: 1 }] } }, T)
    ).toEqual({ where: { id: 'o1', AND: [{ a: 1 }, { tenantId: T }] } });
  });

  it('upsert filters the lookup and stamps the create branch', () => {
    expect(
      scopeTenantArgs(
        'Opportunity',
        'upsert',
        { where: { id: 'o1' }, create: { name: 'n' }, update: { name: 'm' } },
        T
      )
    ).toEqual({
      where: { id: 'o1', AND: [{ tenantId: T }] },
      create: { name: 'n', tenantId: T },
      update: { name: 'm' },
    });
  });
});

describe('scopeTenantArgs: writes', () => {
  it('create sets tenantId when the caller left it out', () => {
    expect(scopeTenantArgs('Opportunity', 'create', { data: { name: 'n' } }, T)).toEqual({
      data: { name: 'n', tenantId: T },
    });
  });

  it('create connects the tenant relation when data already uses relation writes', () => {
    const data = { name: 'n', account: { connect: { id: 'acc' } } };
    expect(scopeTenantArgs('Opportunity', 'create', { data }, T)).toEqual({
      data: { ...data, tenant: { connect: { id: T } } },
    });
  });

  it('create accepts the same tenant, as a column or a relation', () => {
    expect(scopeTenantArgs('Opportunity', 'create', { data: { tenantId: T } }, T)).toEqual({
      data: { tenantId: T },
    });
    const viaRelation = { tenant: { connect: { id: T } } };
    expect(scopeTenantArgs('Opportunity', 'create', { data: viaRelation }, T)).toEqual({
      data: viaRelation,
    });
  });

  it.each([
    ['a column', { tenantId: OTHER }],
    ['a relation', { tenant: { connect: { id: OTHER } } }],
    ['a nested tenant create', { tenant: { create: { name: 'x' } } }],
  ])('create refuses another tenant given as %s', (_label, data) => {
    expect(() => scopeTenantArgs('Opportunity', 'create', { data }, T)).toThrow(/another tenant/);
  });

  it('createMany stamps and checks every row', () => {
    expect(
      scopeTenantArgs('Opportunity', 'createMany', { data: [{ name: 'a' }, { tenantId: T }] }, T)
    ).toEqual({ data: [{ name: 'a', tenantId: T }, { tenantId: T }] });
    expect(() =>
      scopeTenantArgs('Opportunity', 'createMany', { data: [{ tenantId: OTHER }] }, T)
    ).toThrow(/another tenant/);
  });

  it.each(['update', 'updateMany', 'upsert'])('%s refuses moving a row to another tenant', (op) => {
    const args =
      op === 'upsert'
        ? { where: { id: 'o1' }, create: {}, update: { tenantId: OTHER } }
        : { where: { id: 'o1' }, data: { tenantId: { set: OTHER } } };
    expect(() => scopeTenantArgs('Opportunity', op, args, T)).toThrow(/another tenant/);
  });
});

describe('scopeTenantArgs: models with shared rows', () => {
  const shared = Object.entries(TENANT_MODELS).find(([, info]) => info.nullable)?.[0];

  it('the schema has at least one model with a nullable tenantId', () => {
    expect(typeof shared).toBe('string');
  });

  it('reads include rows with no tenant', () => {
    expect(scopeTenantArgs(shared, 'findMany', {}, T)).toEqual({
      where: { OR: [{ tenantId: T }, { tenantId: null }] },
    });
  });

  it('writes stay inside the tenant', () => {
    expect(scopeTenantArgs(shared, 'updateMany', { data: {} }, T)).toMatchObject({
      where: { tenantId: T },
    });
    expect(scopeTenantArgs(shared, 'delete', { where: { id: 'x' } }, T)).toEqual({
      where: { id: 'x', AND: [{ tenantId: T }] },
    });
  });
});

describe('scopeTenantArgs: models it does not apply to', () => {
  it('returns args unchanged for non-tenant and excluded models', () => {
    const args = { where: { id: 'u1' } };
    expect(scopeTenantArgs('User', 'findUnique', args, T)).toBe(args);
    expect(scopeTenantArgs('Tenant', 'findMany', args, T)).toBe(args);
  });
});
