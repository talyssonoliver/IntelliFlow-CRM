/**
 * Non-throwing module entitlement check for code that is shared with the core CRM and so cannot sit
 * behind `moduleTenantProcedure`: a contact's Tickets tab, global search, RAG search over tickets.
 *
 * It asks the same single resolver as the `requireModule` guard (`moduleAccess.isModuleEnabled`), so a
 * module that is not part of the workspace is neither shown nor reachable here either. Fails CLOSED:
 * a missing service or a thrown lookup means "not enabled".
 */
import type { ModuleId } from '@intelliflow/domain';

interface ModuleAccessLike {
  isModuleEnabled?: (tenantId: string, moduleId: ModuleId) => Promise<boolean> | boolean;
}

export interface ModuleCheckCtx {
  container?: { get: <T>(name: string) => T } | null;
}

export async function isModuleEnabledForTenant(
  ctx: ModuleCheckCtx,
  tenantId: string,
  moduleId: ModuleId
): Promise<boolean> {
  const moduleAccess = ctx.container?.get<ModuleAccessLike | undefined>('moduleAccess');
  if (!moduleAccess || typeof moduleAccess.isModuleEnabled !== 'function') return false;
  try {
    return (await moduleAccess.isModuleEnabled(tenantId, moduleId)) !== false;
  } catch {
    return false;
  }
}
