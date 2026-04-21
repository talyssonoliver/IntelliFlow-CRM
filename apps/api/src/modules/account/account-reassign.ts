/**
 * Account Reassign Helpers — IFC-311
 *
 * Owner-change implementation shared by `account.assignOwner` (legacy alias)
 * and the new `account.reassign` / `account.bulkReassign` procedures. Kept
 * in a dedicated module so coverage scopes cleanly to IFC-311's added code,
 * and so future reassign-adjacent tasks (e.g. a deal-reassign follow-up) can
 * mirror the pattern.
 */

import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import { notifyAccountReassignment, type AccountAutomationFlags } from './account-automation';
import {
  createNotification,
  type CreateNotificationParams,
} from '../notifications/notifications.router';

export const REASSIGN_ADMIN_ROLES = new Set(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN']);

export type AccountReassignVerdict =
  | { kind: 'OK'; previousOwnerId: string; accountName: string; newOwnerId: string }
  | { kind: 'SKIPPED'; currentOwnerId: string; accountName: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'TARGET_USER_NOT_FOUND' }
  | { kind: 'FORBIDDEN' };

/**
 * Internal owner-change implementation. Handles tenant-scoped lookup, caller
 * authz, idempotency (self-reassign), target-user verification, TOCTOU-safe
 * updateMany. Returns a tagged verdict the caller maps to its response shape.
 *
 * Does NOT load `AccountAutomationFlags` — the calling procedure loads them
 * once and passes them post-tx to `emitAccountReassignSideEffects`. Keeps
 * `bulkReassign` from re-reading the AutomationSetting row per id.
 */
export async function performAccountReassign(
  ctx: Context,
  input: { id: string; ownerId: string }
): Promise<AccountReassignVerdict> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;

  return typedCtx.prismaWithTenant.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({
      where: { id: input.id, tenantId },
      select: { id: true, ownerId: true, name: true },
    });

    if (!existing) return { kind: 'NOT_FOUND' as const };

    const callerRole = ctx.user?.role ?? '';
    const isAdmin = REASSIGN_ADMIN_ROLES.has(callerRole);
    const isCurrentOwner = existing.ownerId === typedCtx.tenant.userId;
    if (!isAdmin && !isCurrentOwner) {
      return { kind: 'FORBIDDEN' as const };
    }

    if (existing.ownerId === input.ownerId) {
      return {
        kind: 'SKIPPED' as const,
        currentOwnerId: existing.ownerId,
        accountName: existing.name,
      };
    }

    const targetUser = await tx.user.findFirst({
      where: { id: input.ownerId, tenantId },
      select: { id: true },
    });
    if (!targetUser) return { kind: 'TARGET_USER_NOT_FOUND' as const };

    const { count } = await tx.account.updateMany({
      where: { id: input.id, tenantId },
      data: { ownerId: input.ownerId },
    });
    if (count === 0) return { kind: 'NOT_FOUND' as const };

    return {
      kind: 'OK' as const,
      previousOwnerId: existing.ownerId,
      accountName: existing.name,
      newOwnerId: input.ownerId,
    };
  });
}

function buildAccountBoundNotificationCreator(ctx: Context) {
  return (params: CreateNotificationParams) =>
    createNotification(ctx.prisma, params, ctx.services?.notificationOrchestrator);
}

// Exported for direct test coverage — see account.reassign.test.ts
// (the audit-logger short-circuits on invalid test tenantIds, so the
// .catch handler cannot otherwise be exercised through the procedure path).
export function logAuditFailure(err: unknown): void {
  console.error('[account.reassign] Audit log failed:', err);
}

/**
 * Post-tx side-effects for a successful account reassign: audit log +
 * notification (best-effort — neither failure rolls back the owner write).
 */
export async function emitAccountReassignSideEffects(
  ctx: Context,
  args: {
    id: string;
    accountName: string;
    previousOwnerId: string;
    newOwnerId: string;
    flags: Pick<AccountAutomationFlags, 'notifyOnOwnerChange'>;
  }
): Promise<{ notified: boolean }> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;
  const actorId = typedCtx.tenant.userId;

  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'account', args.id, tenantId, {
      actorId,
      beforeState: { ownerId: args.previousOwnerId },
      afterState: { ownerId: args.newOwnerId },
    })
    .catch(logAuditFailure);

  if (!args.flags.notifyOnOwnerChange) return { notified: false };
  if (args.previousOwnerId === args.newOwnerId) return { notified: false };

  try {
    await notifyAccountReassignment(
      {
        tenantId,
        accountId: args.id,
        accountName: args.accountName,
        previousOwnerId: args.previousOwnerId,
        nextOwnerId: args.newOwnerId,
        actingUserId: actorId,
      },
      args.flags,
      buildAccountBoundNotificationCreator(ctx)
    );
    return { notified: true };
  } catch (err) {
    console.error('[account.reassign] Notification failed:', err);
    return { notified: false };
  }
}

export function logAccountReassignPermissionDenied(
  ctx: Context,
  id: string,
  reason: string
): void {
  const typedCtx = getTenantContext(ctx);
  getAuditLogger(ctx.prisma)
    .logPermissionDenied('account', id, reason, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
    })
    .catch(logAuditFailure);
}

