/**
 * Document Automation Enforcement - PG-186
 *
 * Loads a tenant's `DocumentAutomationSetting` row and exposes helpers that
 * apply Cat-1 runtime behaviors (filename normalization, delete-guard).
 *
 * Cat-2 toggles (notifyOnOwnerChange, notifyOnUpload) are stored but UI-disabled
 * with "Pending IFC-310/311" badges until the notification infrastructure lands.
 * Cat-3 AI toggles (aiDocumentClassification, aiSensitiveDataDetection,
 * aiSummarization) default off per the opt-in privacy stance.
 */

import type { DocumentAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface DocumentAutomationFlags {
  normalizeFilename: boolean;
  preventDeleteIfReferenced: boolean;
  notifyOnOwnerChange: boolean;
  notifyOnUpload: boolean;
  aiDocumentClassification: boolean;
  aiSensitiveDataDetection: boolean;
  aiSummarization: boolean;
}

export const AUTOMATION_FACTORY_DEFAULTS: DocumentAutomationFlags = {
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  notifyOnOwnerChange: false,
  notifyOnUpload: false,
  aiDocumentClassification: false,
  aiSensitiveDataDetection: false,
  aiSummarization: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    documentAutomationSetting: {
      findUnique(args: { where: { tenantId: string } }): Promise<DocumentAutomationSetting | null>;
      create(args: {
        data: Partial<DocumentAutomationSetting> & { tenantId: string };
      }): Promise<DocumentAutomationSetting>;
    };
    caseDocument: {
      findFirst(args: {
        where: Record<string, unknown>;
        select?: Record<string, boolean>;
      }): Promise<{ id: string } | null>;
    };
  };
}

/**
 * Load automation flags for the current tenant. Seeds defaults on first access.
 */
export async function loadDocumentAutomation(
  ctx: HasTenantContext
): Promise<DocumentAutomationFlags> {
  const tenantId = ctx.tenant.tenantId;
  const existing = await ctx.prismaWithTenant.documentAutomationSetting.findUnique({
    where: { tenantId },
  });
  if (existing) {
    return extractFlags(existing);
  }
  const created = await ctx.prismaWithTenant.documentAutomationSetting.create({
    data: { tenantId, ...AUTOMATION_FACTORY_DEFAULTS },
  });
  return extractFlags(created);
}

function extractFlags(row: DocumentAutomationSetting): DocumentAutomationFlags {
  return {
    normalizeFilename: row.normalizeFilename,
    preventDeleteIfReferenced: row.preventDeleteIfReferenced,
    notifyOnOwnerChange: row.notifyOnOwnerChange,
    notifyOnUpload: row.notifyOnUpload,
    aiDocumentClassification: row.aiDocumentClassification,
    aiSensitiveDataDetection: row.aiSensitiveDataDetection,
    aiSummarization: row.aiSummarization,
  };
}

/**
 * Cat-1: Normalize filename to lowercase kebab-case when flag is enabled.
 * Preserves extension (lowercased).
 *
 * Examples:
 *   "Hello World.PDF" → "hello-world.pdf"
 *   "Q4 Report (final).docx" → "q4-report-final.docx"
 *   "noext" → "noext"
 */
export function normalizeDocumentFilename(
  filename: string,
  flags: Pick<DocumentAutomationFlags, 'normalizeFilename'>
): string {
  if (!flags.normalizeFilename) return filename;
  if (!filename) return filename;

  const dotIdx = filename.lastIndexOf('.');
  const hasExt = dotIdx > 0 && dotIdx < filename.length - 1;
  const base = hasExt ? filename.slice(0, dotIdx) : filename;
  const ext = hasExt ? filename.slice(dotIdx + 1).toLowerCase() : '';

  const normalizedBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalizedBase) return filename; // fallback if normalization erases everything
  return hasExt ? `${normalizedBase}.${ext}` : normalizedBase;
}

/**
 * Cat-1: Block deletion of a CaseDocument that is linked to a case or contact
 * when the tenant's `preventDeleteIfReferenced` flag is enabled.
 *
 * This is the "real" implementation of the delete-guard. See PG-186 audit
 * (2026-04-16) memory for why this helper must have a production call site —
 * any call-site-free implementation was a Cat-1 fiction.
 *
 * The `documentId` parameter is the CaseDocument's own `id`. The guard checks
 * if the CaseDocument's `relatedCaseId` or `relatedContactId` FK columns are
 * set — these fields directly indicate the document is referenced.
 */
export async function assertNotDeleteGuarded(
  documentId: string,
  ctx: HasTenantContext
): Promise<void> {
  const flags = await loadDocumentAutomation(ctx);
  if (!flags.preventDeleteIfReferenced) return;

  const ref = await ctx.prismaWithTenant.caseDocument.findFirst({
    where: {
      id: documentId,
      OR: [{ relatedCaseId: { not: null } }, { relatedContactId: { not: null } }],
    },
    select: { id: true },
  });

  if (ref) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Cannot delete a document referenced by a case or contact. Disable preventDeleteIfReferenced in document settings to override.',
    });
  }
}
