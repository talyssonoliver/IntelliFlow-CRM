/**
 * The leads list filter "Waiting for reply" (MVP-014). It narrows lead.list's `ids` to the leads
 * pickWaiting returns, so the list and the dashboard card are built from the same rows.
 */

import { mailViewerOf } from '@intelliflow/db';
import { createTenantWhereClause, type TenantAwareContext } from '../../security/tenant-context';
import { loadWaiting } from './waiting-load';

/** `ids` unchanged when the filter is off; otherwise only the waiting leads (within any `ids`). */
export async function narrowToWaiting(
  ctx: TenantAwareContext,
  filters: { ids?: string[] | undefined; waitingForReply?: boolean | undefined }
): Promise<string[] | undefined> {
  if (!filters.waitingForReply) return filters.ids;
  // Contacts are loaded with the card's scope: a lead and a contact with one email merge their
  // histories, so the filter and the card decide each lead the same way.
  const waiting = await loadWaiting(
    ctx.prismaWithTenant,
    mailViewerOf(ctx.tenant),
    createTenantWhereClause(ctx.tenant),
    createTenantWhereClause(ctx.tenant)
  );
  const ids = waiting.filter((w) => w.kind === 'lead').map((w) => w.id);
  const allowed = filters.ids ? new Set(filters.ids) : undefined;
  return allowed ? ids.filter((id) => allowed.has(id)) : ids;
}
