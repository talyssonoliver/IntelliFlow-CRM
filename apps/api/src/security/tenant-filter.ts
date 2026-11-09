/**
 * Tenant filters on every query of the tenant-scoped client.
 *
 * `ctx.prismaWithTenant` used to rely on each router remembering `tenantId` in its `where`.
 * One forgotten filter returns or changes another tenant's rows, because the database session
 * variable is not a dependable boundary on its own (see createTenantScopedPrisma). This module
 * makes the filter structural: every operation on a tenant-owned model gets the request's
 * tenant added to its `where`, and every write is checked or stamped with it.
 *
 * Tenant-owned models come from the schema (TENANT_MODELS in @intelliflow/db, generated from
 * prisma/schema.prisma), not from a hand-kept list.
 *
 *  - Filtered reads and bulk writes (findFirst, findMany, count, aggregate, groupBy,
 *    updateMany, deleteMany, ...): `where` becomes `AND: [<caller's where>, { tenantId }]`.
 *    A caller that already filters by the same tenant is unaffected; one that asks for
 *    another tenant gets nothing back.
 *  - Unique operations (findUnique, update, delete, upsert): the tenant is added to the unique
 *    `where` (Prisma accepts extra filters there), so a row of another tenant is "not found".
 *  - create / createMany / upsert: `tenantId` is set when missing; a different tenant throws.
 *  - update / updateMany / upsert: moving a row to another tenant throws.
 *  - Models whose `tenantId` is nullable hold shared rows (`tenantId = null`) that every
 *    tenant may read. Reads include them; writes never touch them.
 *  - Models whose `tenantId` has a column default (a sentinel such as 'global') are
 *    platform-wide and are not filtered.
 *
 * Not covered, so still filtered by hand: raw SQL (`$queryRaw`, `$executeRaw`), nested writes
 * and relation filters inside one query, and anything that uses the unscoped `ctx.prisma`
 * (listed by tools/scripts/check-unscoped-prisma.mjs).
 */

import { TRPCError } from '@trpc/server';
import { Prisma, TENANT_MODELS, type TenantModelInfo } from '@intelliflow/db';

/**
 * Tenant-owned models the filter deliberately leaves alone, with the reason.
 * Keep this short: every entry is a model whose queries must carry their own tenant logic.
 */
export const TENANT_FILTER_EXCLUDED_MODELS: Readonly<Record<string, string>> = {
  User:
    'A user row belongs to its home tenant, while members of a tenant can live elsewhere ' +
    '(ADR-071). User queries use the membership predicates in @intelliflow/db instead.',
};

type Args = Record<string, unknown>;

/** Operations whose `where` is a filter: the tenant is ANDed onto it. */
const FILTER_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

/** Operations whose `where` is unique: the tenant is added alongside the unique key. */
const UNIQUE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
]);

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'findUnique',
  'findUniqueOrThrow',
]);

/** Keys that mark a relation write inside `data` (Prisma's checked create/update input). */
const RELATION_WRITE_KEYS = new Set([
  'connect',
  'connectOrCreate',
  'create',
  'createMany',
  'disconnect',
  'set',
  'upsert',
]);

function violation(): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message: 'Cannot access a resource of another tenant',
  });
}

function isPlainObject(value: unknown): value is Args {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/** The tenant model info for `model`, or null when the filter does not apply to it. */
export function tenantModelInfo(model: string | undefined): TenantModelInfo | null {
  if (!model || model in TENANT_FILTER_EXCLUDED_MODELS) return null;
  const info = TENANT_MODELS[model];
  // A `tenantId` with a column default (a sentinel such as 'global') marks platform-wide rows,
  // e.g. the Zep episode budget: not one tenant's data, so not filtered by tenant.
  return info && !info.defaulted ? info : null;
}

function tenantCondition(info: TenantModelInfo, tenantId: string, read: boolean): Args {
  return info.nullable && read ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId };
}

function andWhere(where: unknown, condition: Args): Args {
  return isPlainObject(where) && Object.keys(where).length > 0
    ? { AND: [where, condition] }
    : condition;
}

function addToUniqueWhere(where: unknown, condition: Args): Args {
  const base = isPlainObject(where) ? where : {};
  const existing: unknown[] = [];
  if (Array.isArray(base.AND)) existing.push(...base.AND);
  else if (base.AND !== undefined) existing.push(base.AND);
  return { ...base, AND: [...existing, condition] };
}

function usesRelationWrites(data: Args): boolean {
  return Object.values(data).some(
    (value) => isPlainObject(value) && Object.keys(value).some((k) => RELATION_WRITE_KEYS.has(k))
  );
}

/** Throws when `data` names a tenant other than `tenantId`. */
function assertSameTenant(data: Args, info: TenantModelInfo, tenantId: string): void {
  if ('tenantId' in data) {
    const value = data.tenantId;
    const target = isPlainObject(value) && 'set' in value ? value.set : value;
    if (target !== undefined && target !== tenantId) throw violation();
  }
  if (info.relation && data[info.relation] !== undefined) {
    const rel = data[info.relation];
    const connectId = isPlainObject(rel) && isPlainObject(rel.connect) ? rel.connect.id : undefined;
    if (connectId !== tenantId) throw violation();
  }
}

/**
 * A create payload with the request's tenant on it.
 *
 * Only adds the tenant when the caller gave neither `tenantId` nor the tenant relation. For a
 * model with a required `tenantId` and no default (defaulted models are skipped above), such a
 * create could not succeed before, so stamping cannot break one that did. For a model with a
 * nullable `tenantId`, it would have created a row shared by every tenant, which a tenant's
 * client must not do; the row becomes the tenant's own.
 * Whether to stamp the column or connect the relation follows the input style Prisma requires:
 * relation writes in `data` mean the checked input, where only the relation is accepted.
 */
function stampCreate(data: unknown, info: TenantModelInfo, tenantId: string): unknown {
  if (!isPlainObject(data)) return data;
  assertSameTenant(data, info, tenantId);
  if (data.tenantId !== undefined || (info.relation && data[info.relation] !== undefined))
    return data;
  if (info.relation && usesRelationWrites(data)) {
    return { ...data, [info.relation]: { connect: { id: tenantId } } };
  }
  return { ...data, tenantId };
}

/**
 * The `args` of one Prisma operation with the tenant filter applied.
 * Pure: returns new objects and leaves `args` untouched.
 */
export function scopeTenantArgs(
  model: string | undefined,
  operation: string,
  args: unknown,
  tenantId: string
): unknown {
  const info = tenantModelInfo(model);
  if (!info) return args;
  const next: Args = isPlainObject(args) ? { ...args } : {};
  const condition = tenantCondition(info, tenantId, READ_OPERATIONS.has(operation));

  if (FILTER_OPERATIONS.has(operation)) {
    next.where = andWhere(next.where, condition);
  } else if (UNIQUE_OPERATIONS.has(operation)) {
    next.where = addToUniqueWhere(next.where, condition);
  }

  switch (operation) {
    case 'create':
      next.data = stampCreate(next.data, info, tenantId);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      next.data = Array.isArray(next.data)
        ? next.data.map((row) => stampCreate(row, info, tenantId))
        : stampCreate(next.data, info, tenantId);
      break;
    case 'upsert':
      next.create = stampCreate(next.create, info, tenantId);
      if (isPlainObject(next.update)) assertSameTenant(next.update, info, tenantId);
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      if (isPlainObject(next.data)) assertSameTenant(next.data, info, tenantId);
      break;
    default:
      break;
  }
  return next;
}

/** A Prisma client extension that applies {@link scopeTenantArgs} to every model operation. */
export function tenantFilterExtension(tenantId: string) {
  return Prisma.defineExtension({
    name: 'tenant-filter',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeTenantArgs(model, operation, args, tenantId) as typeof args);
        },
      },
    },
  });
}
