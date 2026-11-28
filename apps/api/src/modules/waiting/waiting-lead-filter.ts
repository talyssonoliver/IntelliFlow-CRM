/**
 * The leads list filter "Waiting for reply" (MVP-014). It narrows lead.list's `ids` to the leads
 * the card lists, so the list and the dashboard card are built from the same statement.
 */

import { mailViewerOf } from '@intelliflow/db';
import type { TenantAwareContext } from '../../security/tenant-context';
import { loadWaitingLeadIds } from './waiting-sql';

/** `ids` unchanged when the filter is off; otherwise only the waiting leads (within any `ids`). */
export async function narrowToWaiting(
  ctx: TenantAwareContext,
  filters: { ids?: string[] | undefined; waitingForReply?: boolean | undefined }
): Promise<string[] | undefined> {
  if (!filters.waitingForReply) return filters.ids;
  // Decided in SQL (waiting-sql.ts, the card's statement): only the waiting leads' ids come back,
  // not the tenant's mail. A lead and a contact with one email merge their histories there, so the
  // filter and the card decide each lead the same way.
  const ids = await loadWaitingLeadIds(ctx.prismaWithTenant, mailViewerOf(ctx.tenant));
  const allowed = filters.ids ? new Set(filters.ids) : undefined;
  return allowed ? ids.filter((id) => allowed.has(id)) : ids;
}
