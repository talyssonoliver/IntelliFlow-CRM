/**
 * The leads list filter "Waiting for reply" (MVP-014). It narrows lead.list's `ids` to the leads
 * pickWaiting returns, so the list and the dashboard card are built from the same rows.
 */

import { createTenantWhereClause, type TenantAwareContext } from '../../security/tenant-context';
import { loadWaiting } from './waiting-load';

/** `ids` unchanged when the filter is off; otherwise only the waiting leads (within any `ids`). */
export async function narrowToWaiting(
  ctx: TenantAwareContext,
  filters: { ids?: string[] | undefined; waitingForReply?: boolean | undefined }
): Promise<string[] | undefined> {
  if (!filters.waitingForReply) return filters.ids;
  const { tenantId } = ctx.tenant;
  const waiting = await loadWaiting(
    ctx.prismaWithTenant,
    tenantId,
    createTenantWhereClause(ctx.tenant),
    { tenantId, id: { in: [] } }
  );
  const ids = waiting.filter((w) => w.kind === 'lead').map((w) => w.id);
  const allowed = filters.ids ? new Set(filters.ids) : undefined;
  return allowed ? ids.filter((id) => allowed.has(id)) : ids;
}
