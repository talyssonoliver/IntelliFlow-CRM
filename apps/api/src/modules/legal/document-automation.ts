/**
 * Document Automation Enforcement - PG-186
 *
 * Loads a tenant's `DocumentAutomationSetting` row and exposes helpers that
 * apply the hygiene and guard toggles to document create/update/delete flows.
 *
 * Mirrors the PG-183 `account-automation.ts` pattern. Policy rows are owned
 * by the document-settings router; this module is the runtime consumer that
 * turns those preferences into actual behavior.
 */

import { TRPCError } from '@trpc/server';

export interface DocumentAutomationFlags {
  // Category 1 — wired in this PR
  normalizeFilename: boolean;
  preventDeleteIfReferenced: boolean;
  restrictTagCreationToAdmins: boolean;
  // Category 2 — wiring landing in IFC-310 (duplicate-detection runtime)
  // and IFC-311 (reassign endpoint). Toggles persist; consumers ship later.
  notifyOnDuplicate: boolean;
  notifyOnOwnerChange: boolean;
  // Category 2 — AI / follow-up (IFC-310 / IFC-312)
  autoVersionOnCollision: boolean;
  autoDetectDuplicates: boolean;
  autoExtractText: boolean;
  autoClassifyCategory: boolean;
  autoDetectPii: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
}

export const AUTOMATION_FACTORY_DEFAULTS: DocumentAutomationFlags = {
  // Category 1 — data hygiene on by default (matches spec)
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  notifyOnDuplicate: true,
  // Category 1 — off by default (opt-in)
  notifyOnOwnerChange: false,
  restrictTagCreationToAdmins: false,
  // Category 2 — AI / follow-up — ALL off by default (opt-in)
  autoVersionOnCollision: false,
  autoDetectDuplicates: false,
  autoExtractText: false,
  autoClassifyCategory: false,
  autoDetectPii: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    documentAutomationSetting: {
      findUnique(args: { where: { tenantId: string } }): Promise<
        | (DocumentAutomationFlags & {
            id: string;
            tenantId: string;
            createdAt: Date;
            updatedAt: Date;
          })
        | null
      >;
    };
  };
}

/**
 * Load the tenant's document automation row, falling back to factory defaults
 * when no row has been seeded yet. Read-only; safe to call in every create/
 * update/delete hot path.
 */
export async function loadDocumentAutomation(
  ctx: HasTenantContext
): Promise<DocumentAutomationFlags> {
  const row = await ctx.prismaWithTenant.documentAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });

  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };

  return {
    normalizeFilename: row.normalizeFilename,
    preventDeleteIfReferenced: row.preventDeleteIfReferenced,
    notifyOnOwnerChange: row.notifyOnOwnerChange,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    notifyOnDuplicate: row.notifyOnDuplicate,
    autoVersionOnCollision: row.autoVersionOnCollision,
    autoDetectDuplicates: row.autoDetectDuplicates,
    autoExtractText: row.autoExtractText,
    autoClassifyCategory: row.autoClassifyCategory,
    autoDetectPii: row.autoDetectPii,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
  };
}

// ─── Hygiene transforms ─────────────────────────────────────────────────────

/**
 * Normalize a filename when `normalizeFilename` is on.
 * Lowercases, replaces spaces with underscores, strips unsafe chars.
 */
export function normalizeFilename(
  raw: string,
  flags: Pick<DocumentAutomationFlags, 'normalizeFilename'>
): string {
  if (!flags.normalizeFilename) return raw;
  return raw
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.-]/g, '');
}

// ─── Delete-guard ───────────────────────────────────────────────────────────

interface DeleteGuardPrisma {
  caseDocument: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: { relatedCaseId: true; relatedContactId: true };
    }): Promise<{ relatedCaseId: string | null; relatedContactId: string | null } | null>;
  };
}

interface DeleteGuardContext {
  tenant: { tenantId: string };
  prismaWithTenant: DeleteGuardPrisma;
}

/**
 * Assert that a document is not referenced by a case or contact when the
 * `preventDeleteIfReferenced` toggle is on. Throws PRECONDITION_FAILED when
 * the document is currently linked to either a case or a contact — those
 * references would otherwise be silently broken by a soft-delete.
 *
 * Returns `void` (no-op) when the toggle is off. Returns `void` when the
 * document is not found (the caller is expected to throw NOT_FOUND first).
 */
export async function assertNotDeleteGuarded(
  ctx: DeleteGuardContext,
  documentId: string,
  flags: Pick<DocumentAutomationFlags, 'preventDeleteIfReferenced'>
): Promise<void> {
  if (!flags.preventDeleteIfReferenced) return;

  const row = await ctx.prismaWithTenant.caseDocument.findFirst({
    where: { id: documentId, tenantId: ctx.tenant.tenantId },
    select: { relatedCaseId: true, relatedContactId: true },
  });

  if (!row) return;

  const refs: string[] = [];
  if (row.relatedCaseId) refs.push('a case');
  if (row.relatedContactId) refs.push('a contact');

  if (refs.length === 0) return;

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Cannot delete: document is referenced by ${refs.join(' and ')}. Disable "Prevent delete if referenced" in Document Settings, or detach the references first.`,
  });
}

// ─── Admin-only tag creation ────────────────────────────────────────────────

interface UserRoleContext {
  user?: { role?: string | null } | null;
}

/**
 * Enforce the `restrictTagCreationToAdmins` toggle on the
 * documentSettings.tags.create procedure.
 */
export function assertCanCreateDocumentTag(
  ctx: UserRoleContext,
  flags: Pick<DocumentAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  const role = ctx.user?.role ?? '';
  if (role === 'ADMIN' || role === 'OWNER') return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to workspace admins. Ask an admin or disable "Restrict tag creation to admins" in Document Settings.',
  });
}

// ─── Owner-change notification helper ───────────────────────────────────────

export interface DocumentOwnerChangeNotification {
  tenantId: string;
  documentId: string;
  documentTitle: string;
  previousOwnerId: string;
  nextOwnerId: string;
  actingUserId: string;
}

type NotificationCreator = (args: {
  userId: string;
  tenantId: string;
  type: 'document_reassigned';
  title: string;
  body: string;
  priority?: 'high' | 'normal' | 'low';
  entityType?: string;
  entityId?: string;
  entityName?: string;
  actionUrl?: string;
}) => Promise<unknown>;

/**
 * Emit "document_reassigned" notifications to both the previous and the
 * next owner when the `notifyOnOwnerChange` flag is on. Callers pass in the
 * bound notification-creator so this module stays free of an import-time
 * dependency on the notifications router.
 */
export async function notifyDocumentReassignment(
  args: DocumentOwnerChangeNotification,
  flags: Pick<DocumentAutomationFlags, 'notifyOnOwnerChange'>,
  createNotification: NotificationCreator
): Promise<void> {
  if (!flags.notifyOnOwnerChange) return;
  if (args.previousOwnerId === args.nextOwnerId) return;

  const commonPayload = {
    tenantId: args.tenantId,
    type: 'document_reassigned' as const,
    entityType: 'document',
    entityId: args.documentId,
    entityName: args.documentTitle,
    actionUrl: `/documents/${args.documentId}`,
    priority: 'normal' as const,
  };

  await Promise.all([
    createNotification({
      ...commonPayload,
      userId: args.previousOwnerId,
      title: `Document reassigned: ${args.documentTitle}`,
      body: `You are no longer the owner of "${args.documentTitle}". Hand over outstanding items to the new owner.`,
    }),
    createNotification({
      ...commonPayload,
      userId: args.nextOwnerId,
      title: `You now own: ${args.documentTitle}`,
      body: `A document was assigned to you. Review it before reaching out.`,
    }),
  ]);
}
