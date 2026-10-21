/**
 * Shared access helpers for the PG-207 email routers.
 *
 * Tenant settings, the company mailbox, org signatures and the suppression
 * list are changed only by EMAIL_SETTINGS_ADMIN_ROLES (checked in-handler, on
 * tenantProcedure / verifiedTenantProcedure — never adminTenantProcedure,
 * which lacks the CSRF and rate-limit middleware). Denials and changes are
 * audited with ids and field names only — never addresses or secrets.
 */
import { TRPCError } from '@trpc/server';
import { isEmailSettingsAdminRole } from '@intelliflow/domain';
import type { EmailAttachmentStoragePort } from '@intelliflow/application';
import { getAuditLogger } from '../../security/audit-logger';
import type { ResourceType } from '../../security/types';
import type { MailboxTransports } from './mailbox-transport';

export interface EmailRouterCtx {
  prisma: any;
  prismaWithTenant: any;
  tenant: { tenantId: string; userId: string };
  user?: { role?: string | null } | null;
  adapters?: Record<string, unknown>;
  [key: string]: unknown;
}

export function isEmailAdmin(ctx: Pick<EmailRouterCtx, 'user'>): boolean {
  return isEmailSettingsAdminRole(ctx.user?.role);
}

export type EmailAuditResource = Extract<
  ResourceType,
  'email_mailbox' | 'email_settings' | 'email_signature' | 'email_suppression'
>;

/** FORBIDDEN unless the caller is an email admin (fails closed); denials are audited. */
export function assertEmailAdmin(
  ctx: EmailRouterCtx,
  resource: EmailAuditResource,
  action: string
): void {
  if (isEmailAdmin(ctx)) return;
  getAuditLogger(ctx.prisma)
    .logPermissionDenied(
      resource,
      '-',
      `${resource}.${action} requires an admin role`,
      ctx.tenant.tenantId,
      {
        actorId: ctx.tenant.userId,
      }
    )
    .catch((err: unknown) => console.error('[email] Audit log failed:', err));
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only administrators and managers can change this.',
  });
}

/** Fire-and-forget audit entry: ids, field names and counts only. */
export function auditEmail(
  ctx: EmailRouterCtx,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  resource: EmailAuditResource,
  id: string,
  details: Record<string, unknown>
): void {
  getAuditLogger(ctx.prisma)
    .logAction(action, resource, id, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      afterState: details,
    })
    .catch((err: unknown) => console.error('[email] Audit log failed:', err));
}

export interface EmailRuntimeDeps {
  transports: MailboxTransports;
  storage: EmailAttachmentStoragePort;
}

/**
 * The container-built mailbox transports and attachment storage. Fails
 * closed: a missing wiring is a server error, never a silent fallback.
 */
export function emailRuntimeDeps(ctx: EmailRouterCtx): EmailRuntimeDeps {
  const transports = ctx.adapters?.mailboxTransports as MailboxTransports | undefined;
  const storage = ctx.adapters?.storageService as EmailAttachmentStoragePort | undefined;
  if (!transports || !storage) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Email sending is not available on this server.',
    });
  }
  return { transports, storage };
}

/** The Prisma error code of `err` (e.g. `P2002`), if any. */
export function prismaErrorCode(err: unknown): string | undefined {
  return err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
}
