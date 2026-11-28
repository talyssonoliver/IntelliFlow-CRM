/**
 * A read-only, tenant-pinned view of Prisma for the export worker.
 *
 * The API gets its tenant boundary from createTenantScopedPrisma (apps/api/src/security), which a
 * worker cannot import. The export only reads, so the worker's boundary is this small extension:
 * every operation on a tenant-owned model gets `tenantId` ANDed into its `where`, the Tenant
 * model is pinned to the one id, and any write is refused outright. The export also states the
 * tenant in each `where` itself, so a query is scoped twice.
 *
 * Users are not tenant-filtered (a member can live in another home tenant): the export reads them
 * with its own explicit home-or-member predicate and an allow-list of columns.
 */
import { TENANT_MODELS } from '@intelliflow/db';

const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const UNIQUE_READS = new Set(['findUnique', 'findUniqueOrThrow']);

/** Raw SQL bypasses the tenant filter, so the guard refuses it outright. */
const RAW_OPERATIONS = [
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
] as const;

type Args = Record<string, unknown> | undefined;

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** `args` with the tenant added to its filter. Pure. */
export function pinReadArgsToTenant(
  model: string,
  args: Args,
  tenantId: string,
  operation = 'findMany'
): Record<string, unknown> {
  const base = (args ?? {}) as Record<string, unknown>;
  let condition: Record<string, unknown> | null = null;
  if (model === 'Tenant') condition = { id: tenantId };
  else if (model !== 'User') {
    const info = TENANT_MODELS[model];
    if (info && !info.defaulted) condition = { tenantId };
  }
  if (!condition) return base;
  const where = base.where as Record<string, unknown> | undefined;
  if (UNIQUE_READS.has(operation)) {
    // A unique read needs its unique key at the top level of `where`: the tenant rides along in AND.
    const existing = where?.AND;
    const and = toArray(existing);
    return { ...base, where: { ...where, AND: [...and, condition] } };
  }
  return {
    ...base,
    where: where && Object.keys(where).length > 0 ? { AND: [where, condition] } : condition,
  };
}

/** Wrap a PrismaClient so it can only read, and only inside `tenantId`. */
export function createTenantReadGuard<T extends { $extends: (ext: any) => any }>(
  prisma: T,
  tenantId: string
): Record<string, any> {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: Args;
          query: (a: unknown) => Promise<unknown>;
        }) {
          if (!READ_OPERATIONS.has(operation)) {
            throw new Error(`Workspace export is read-only: ${model}.${operation} refused`);
          }
          return query(pinReadArgsToTenant(model, args, tenantId, operation));
        },
      },
      ...Object.fromEntries(
        RAW_OPERATIONS.map((op) => [
          op,
          () => {
            throw new Error(`Workspace export is read-only and tenant-pinned: ${op} refused`);
          },
        ])
      ),
    },
  });
}
