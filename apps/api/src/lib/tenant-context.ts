/**
 * Tenant Context Utility — Fix #18
 *
 * Sets the PostgreSQL session variable `app.current_tenant_id` before every
 * Prisma query so that Supabase RLS policies can call `get_current_tenant_id()`
 * and enforce row-level tenant isolation.
 *
 * Usage:
 *   const scopedPrisma = withTenantContext(prisma, tenantId);
 *   await scopedPrisma.lead.findMany(); // SET LOCAL runs before each query
 *
 * Implementation note:
 *   `SET LOCAL` scopes the variable to the current transaction. For
 *   non-transactional queries Prisma issues individual auto-committed
 *   statements, so we use `SET` (session-scoped) to ensure the variable
 *   persists across implicit transactions within the same connection.
 *   This is safe with PgBouncer in session mode or a direct pg connection;
 *   review your pooler configuration if you use transaction-mode pooling.
 */

import type { PrismaClient } from '@intelliflow/db';

/**
 * Returns a Prisma client extended with a `$allOperations` query extension
 * that prepends `SET app.current_tenant_id = '<tenantId>'` before every
 * database operation.
 *
 * @param prisma    - Base PrismaClient instance
 * @param tenantId  - Tenant UUID for the current request
 */
export function withTenantContext(
  prisma: PrismaClient,
  tenantId: string
): PrismaClient {
  if (!tenantId) {
    // No tenant — return unscoped client (e.g. public endpoints or tests
    // where tenant isolation is not applicable).
    return prisma;
  }

  // Sanitise: tenant IDs are UUIDs — reject anything with special chars
  // to prevent SQL injection via the SET command.
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
    throw new Error(`withTenantContext: invalid tenantId format: "${tenantId}"`);
  }

  return (prisma as any).$extends({
    query: {
      $allOperations({ args, query }: { args: unknown; query: (args: unknown) => Promise<unknown> }) {
        // Use raw SQL to set the session variable before the actual query.
        // We intentionally do NOT use `SET LOCAL` here because Prisma 7 with
        // the pg adapter may not wrap every operation in an explicit transaction,
        // meaning `SET LOCAL` would be a no-op between implicit transactions.
        return prisma.$executeRawUnsafe(
          `SET app.current_tenant_id = '${tenantId}'`
        ).then(() => query(args));
      },
    },
  }) as unknown as PrismaClient;
}
