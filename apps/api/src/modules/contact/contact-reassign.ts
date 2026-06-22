/**
 * Contact Reassign Helpers — IFC-311
 *
 * Mirror of account-reassign.ts for contacts. See the account-reassign
 * docstring for the full rationale (kept in a dedicated module so coverage
 * scopes cleanly to IFC-311's added code).
 */

import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import { notifyContactReassignment, type ContactAutomationFlags } from './contact-automation';
import {
  createNotification,
  type CreateNotificationParams,
} from '../notifications/notifications.router';

export const REASSIGN_ADMIN_ROLES = new Set(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN']);

export type ContactReassignVerdict =
  | { kind: 'OK'; previousOwnerId: string; contactName: string; newOwnerId: string }
  | { kind: 'SKIPPED'; currentOwnerId: string; contactName: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'TARGET_USER_NOT_FOUND' }
  | { kind: 'FORBIDDEN' };

export async function performContactReassign(
  ctx: Context,
  input: { id: string; ownerId: string }
): Promise<ContactReassignVerdict> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;

  // Read-only early exits run OUTSIDE $transaction (Finding 2).
  const existing = await typedCtx.prismaWithTenant.contact.findFirst({
    where: { id: input.id, tenantId },
    select: { id: true, ownerId: true, firstName: true, lastName: true },
  });

  if (!existing) return { kind: 'NOT_FOUND' as const };

  const callerRole = ctx.user?.role ?? '';
  const isAdmin = REASSIGN_ADMIN_ROLES.has(callerRole);
  const isCurrentOwner = existing.ownerId === typedCtx.tenant.userId;
  if (!isAdmin && !isCurrentOwner) {
    return { kind: 'FORBIDDEN' as const };
  }

  const contactName = `${existing.firstName} ${existing.lastName}`.trim();

  if (existing.ownerId === input.ownerId) {
    return {
      kind: 'SKIPPED' as const,
      currentOwnerId: existing.ownerId,
      contactName,
    };
  }

  return typedCtx.prismaWithTenant.$transaction(async (tx) => {
    const targetUser = await tx.user.findFirst({
      where: { id: input.ownerId, tenantId },
      select: { id: true },
    });
    if (!targetUser) return { kind: 'TARGET_USER_NOT_FOUND' as const };

    const { count } = await tx.contact.updateMany({
      where: { id: input.id, tenantId },
      data: { ownerId: input.ownerId },
    });
    if (count === 0) return { kind: 'NOT_FOUND' as const };

    return {
      kind: 'OK' as const,
      previousOwnerId: existing.ownerId,
      contactName,
      newOwnerId: input.ownerId,
    };
  });
}

function buildContactBoundNotificationCreator(ctx: Context) {
  return (params: CreateNotificationParams) =>
    createNotification(ctx.prisma, params, ctx.services?.notificationOrchestrator);
}

// Exported for direct test coverage — see contact.reassign.test.ts
export function logAuditFailure(err: unknown): void {
  console.error('[contact.reassign] Audit log failed:', err);
}

export async function emitContactReassignSideEffects(
  ctx: Context,
  args: {
    id: string;
    contactName: string;
    previousOwnerId: string;
    newOwnerId: string;
    flags: Pick<ContactAutomationFlags, 'notifyOnOwnerChange'>;
  }
): Promise<{ notified: boolean }> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;
  const actorId = typedCtx.tenant.userId;

  // IFC-255: single audit point for owner reassignment (single + bulk). Canonical
  // eventType so the audit trail distinguishes a reassign from a generic update.
  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'contact', args.id, tenantId, {
      actorId,
      eventType: 'ContactReassigned',
      dataClassification: 'CONFIDENTIAL',
      beforeState: { ownerId: args.previousOwnerId },
      afterState: { ownerId: args.newOwnerId },
    })
    .catch(logAuditFailure);

  if (!args.flags.notifyOnOwnerChange) return { notified: false };
  if (args.previousOwnerId === args.newOwnerId) return { notified: false };

  try {
    await notifyContactReassignment(
      {
        tenantId,
        contactId: args.id,
        contactName: args.contactName,
        previousOwnerId: args.previousOwnerId,
        nextOwnerId: args.newOwnerId,
        actingUserId: actorId,
      },
      args.flags,
      buildContactBoundNotificationCreator(ctx)
    );
    return { notified: true };
  } catch (err) {
    console.error('[contact.reassign] Notification failed:', err);
    return { notified: false };
  }
}

export function logContactReassignPermissionDenied(ctx: Context, id: string, reason: string): void {
  const typedCtx = getTenantContext(ctx);
  getAuditLogger(ctx.prisma)
    .logPermissionDenied('contact', id, reason, typedCtx.tenant.tenantId, {
      actorId: typedCtx.tenant.userId,
    })
    .catch(logAuditFailure);
}
