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
import {
  emailVisibilityWhere,
  mailViewerOf,
  visibleEmailWhere,
  type MailViewer,
} from '@intelliflow/db';
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

/**
 * Who is reading mail (register #64): the active tenant and the signed-in user. Fails closed: with
 * no user there is no mail to show, never a filter that silently matches everyone.
 */
export function emailViewerOf(ctx: unknown): MailViewer {
  const c = ctx as {
    tenant?: { tenantId?: string; userId?: string; role?: string | null; teamMemberIds?: string[] };
    user?: { userId?: string } | null;
  };
  const userId = c.user?.userId ?? c.tenant?.userId;
  if (!c.tenant?.tenantId || !userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to read mail.' });
  }
  return mailViewerOf({ ...c.tenant, tenantId: c.tenant.tenantId, userId });
}

/**
 * THE where fragment every read of email_records ANDs in (register #64, owner decision 26/11):
 * personal-mailbox mail is its owner's; mail logged to a lead or contact the caller can see, the
 * company mailbox and unowned inbound mail are the tenant's; drafts are the writer's. No admin
 * override. The policy itself is packages/db/src/email-visibility.ts.
 */
export async function visibleMail(ctx: unknown, only?: readonly string[]) {
  return visibleEmailWhere((ctx as { prisma: never }).prisma, emailViewerOf(ctx), only);
}

/**
 * What a caller may CHANGE (archive, delete, forward, mark read, label, log): only mail in a mailbox
 * that is theirs or the company's, never mail they can merely read because it is logged to a lead
 * they can see. Same fail-closed form of the policy, without the logged-mail ids.
 */
export function ownMail(ctx: unknown) {
  return emailVisibilityWhere(emailViewerOf(ctx).userId);
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

/** The email-attachments storage, for attachment download links. */
export function emailAttachmentStorage(
  ctx: EmailRouterCtx
): Pick<EmailAttachmentStoragePort, 'emailAttachmentDownloadUrl'> | null {
  return (ctx.adapters?.storageService as EmailAttachmentStoragePort | undefined) ?? null;
}

/** The Prisma error code of `err` (e.g. `P2002`), if any. */
export function prismaErrorCode(err: unknown): string | undefined {
  return err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
}
