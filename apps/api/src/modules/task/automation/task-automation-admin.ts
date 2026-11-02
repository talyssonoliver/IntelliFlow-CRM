/**
 * Task automation write gate and audit trail — PG-208 (ADR-084).
 *
 * Rules decide who gets work and who is notified, so writes are limited to the
 * task-automation admin roles, and webhook secrets (create / rotate /
 * regenerate) to the narrower webhook-admin set (no MANAGER). Every denial is
 * audit-logged (the `assertTerritoryAdmin` precedent wrote none). Audit entries
 * carry ids, the operation and field names only — never templates, payloads or
 * secrets.
 */

import { TRPCError } from '@trpc/server';
import { isTaskAutomationAdminRole, isTaskAutomationWebhookAdminRole } from '@intelliflow/domain';
import { getAuditLogger } from '../../../security/audit-logger';
import type { TenantAwareContext } from '../../../security/tenant-context';

export type TaskAutomationCtx = Pick<
  TenantAwareContext,
  'tenant' | 'prismaWithTenant' | 'user' | 'prisma'
>;

export type TaskAutomationScope = 'rules' | 'webhooks';

function logAuditFailure(err: unknown): void {
  console.error('[task-automation] Audit log failed:', err);
}

/** Throws FORBIDDEN (after logging the denial) unless the caller may write in `scope`. */
export function assertTaskAutomationAdmin(
  ctx: TaskAutomationCtx,
  scope: TaskAutomationScope = 'rules',
  resourceId = 'task_automation'
): void {
  const role = ctx.user?.role;
  const allowed =
    scope === 'webhooks' ? isTaskAutomationWebhookAdminRole(role) : isTaskAutomationAdminRole(role);
  if (allowed) return;

  getAuditLogger(ctx.prisma)
    .logPermissionDenied(
      'task',
      resourceId,
      scope === 'webhooks' ? 'task_automation:webhooks' : 'task_automation:write',
      ctx.tenant.tenantId,
      { actorId: ctx.tenant.userId }
    )
    .catch(logAuditFailure);

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      scope === 'webhooks'
        ? 'Only admins can manage webhook rules and their secrets.'
        : 'Only admins and managers can change task automation.',
  });
}

/** Ids, the operation and field names only. */
export function logTaskAutomationAudit(
  ctx: TaskAutomationCtx,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  resourceId: string,
  operation: string,
  afterState?: Record<string, string | number | boolean | string[] | null>
): void {
  getAuditLogger(ctx.prisma)
    .logAction(action, 'task', resourceId, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      actionReason: `task_automation.${operation}`,
      ...(afterState && { afterState }),
    })
    .catch(logAuditFailure);
}
