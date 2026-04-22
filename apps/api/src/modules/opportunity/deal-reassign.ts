/**
 * Deal Reassign Helpers — PG-184 Cat-2 follow-through.
 *
 * Mirrors apps/api/src/modules/account/account-reassign.ts so the
 * opportunity.router.ts `reassign` / `bulkReassign` procedures wire
 * `notifyOnOwnerChange` through the existing `notifyDealReassignment`
 * helper. Kept in a dedicated module so coverage scopes cleanly.
 */

import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import {
  notifyDealReassignment,
  type DealAutomationFlags,
  type DealNotifier,
} from './deal-automation';
import { createNotification } from '../notifications/notifications.router';

export const REASSIGN_ADMIN_ROLES = new Set(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN']);

export type DealReassignVerdict =
  | { kind: 'OK'; previousOwnerId: string; dealName: string; newOwnerId: string }
  | { kind: 'SKIPPED'; currentOwnerId: string; dealName: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'TARGET_USER_NOT_FOUND' }
  | { kind: 'FORBIDDEN' };

export async function performDealReassign(
  ctx: Context,
  input: { id: string; ownerId: string },
): Promise<DealReassignVerdict> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;

  const existing = await typedCtx.prismaWithTenant.opportunity.findFirst({
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
      dealName: existing.name,
    };
  }

  return typedCtx.prismaWithTenant.$transaction(async (tx) => {
    const targetUser = await tx.user.findFirst({
      where: { id: input.ownerId, tenantId },
      select: { id: true },
    });
    if (!targetUser) return { kind: 'TARGET_USER_NOT_FOUND' as const };

    const { count } = await tx.opportunity.updateMany({
      where: { id: input.id, tenantId },
      data: { ownerId: input.ownerId },
    });
    if (count === 0) return { kind: 'NOT_FOUND' as const };

    return {
      kind: 'OK' as const,
      previousOwnerId: existing.ownerId,
      dealName: existing.name,
      newOwnerId: input.ownerId,
    };
  });
}

export function logDealAuditFailure(err: unknown): void {
  console.error('[deal.reassign] Audit log failed:', err);
}

/**
 * Build a DealNotifier bound to this request's ctx + notification pipeline.
 * The notifier wraps `createNotification` with the single-notification-per-
 * user fan-out the notifyDealReassignment helper expects.
 */
function buildDealBoundNotifier(ctx: Context): DealNotifier {
  return {
    async send(input) {
      for (const userId of input.toUserIds) {
        await createNotification(
          ctx.prisma,
          {
            tenantId: ctx.user?.tenantId ?? '',
            userId,
            type: input.type,
            title: `Deal ${input.type.replace(/_/g, ' ')}`,
            body: `Deal update — ${input.type}`,
            priority: 'normal',
            entityType: 'deal',
            entityId: (input.payload.opportunityId as string | undefined) ?? null,
            metadata: input.payload,
          } as never,
          ctx.services?.notificationOrchestrator,
        );
      }
    },
  };
}

export async function emitDealReassignSideEffects(
  ctx: Context,
  args: {
    id: string;
    dealName: string;
    previousOwnerId: string;
    newOwnerId: string;
    flags: Pick<DealAutomationFlags, 'notifyOnOwnerChange'>;
  },
): Promise<{ notified: boolean }> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;
  const actorId = typedCtx.tenant.userId;

  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'opportunity', args.id, tenantId, {
      actorId,
      beforeState: { ownerId: args.previousOwnerId },
      afterState: { ownerId: args.newOwnerId },
    })
    .catch(logDealAuditFailure);

  if (!args.flags.notifyOnOwnerChange) return { notified: false };
  if (args.previousOwnerId === args.newOwnerId) return { notified: false };

  try {
    await notifyDealReassignment(
      buildDealBoundNotifier(ctx),
      {
        opportunityId: args.id,
        previousOwnerId: args.previousOwnerId,
        newOwnerId: args.newOwnerId,
        actorId,
      },
      args.flags,
    );
    return { notified: true };
  } catch (err) {
    console.error('[deal.reassign] Notification failed:', err);
    return { notified: false };
  }
}

export function logDealReassignPermissionDenied(
  ctx: Context,
  id: string,
  reason: string,
): void {
  const typedCtx = getTenantContext(ctx);
  getAuditLogger(ctx.prisma)
    .logPermissionDenied('opportunity', id, reason, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
    })
    .catch(logDealAuditFailure);
}
