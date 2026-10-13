/**
 * Deal File Helpers — #421 (IFC-280 deferred): attach / list / remove
 * DealFile attachments on a deal.
 *
 * Reuses the EXISTING StorageServicePort quarantine-then-promote pipeline
 * (ctx.adapters.storageService + ctx.adapters.avScanner) rather than a new
 * storage provider — the same pipeline IngestionOrchestrator uses for
 * CaseDocument. Size/type validation mirrors IngestionOrchestrator's
 * existing policy (50MB cap, an explicit MIME allow-list) instead of
 * inventing a new one.
 *
 * Kept in a dedicated module so coverage scopes cleanly, mirroring
 * deal-reassign.ts / deal-automation.ts.
 */

import { TRPCError } from '@trpc/server';
import type { StorageServicePort, AVScannerPort } from '@intelliflow/application';
import type { Context } from '../../context';
import { getTenantContext } from '../../security/tenant-context';

/** Mirrors IngestionOrchestrator.MAX_FILE_SIZE — the existing size policy. */
export const MAX_DEAL_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** DealFile.fileType enum values a successful upload can resolve to. */
type UploadableDealFileType = 'PDF' | 'DOC' | 'DOCX' | 'XLS' | 'XLSX' | 'IMAGE';

/**
 * Explicit MIME allow-list (reject unknown types rather than falling back to
 * OTHER) — mirrors IngestionOrchestrator.ALLOWED_MIME_TYPES's deny-by-default
 * posture, extended with the spreadsheet types DealFile.FileType already
 * declares (XLS/XLSX) that the case-document pipeline has no use for.
 */
const ALLOWED_MIME_TYPES: Record<string, UploadableDealFileType> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/gif': 'IMAGE',
};

export function resolveDealFileType(mimeType: string): UploadableDealFileType | null {
  return ALLOWED_MIME_TYPES[mimeType] ?? null;
}

/** "2.4 MB" style human-readable size, matching DealFile.size's doc comment. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function decodeBase64(content: string): Buffer {
  return Buffer.from(content, 'base64');
}

function requireStorageAdapters(ctx: Context): {
  storage: StorageServicePort;
  scanner: AVScannerPort;
} {
  const storage = ctx.adapters?.storageService;
  const scanner = ctx.adapters?.avScanner;
  if (!storage || !scanner) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Storage service not available',
    });
  }
  return { storage, scanner };
}

async function findDealOrThrow(ctx: Context, opportunityId: string): Promise<{ id: string }> {
  const typedCtx = getTenantContext(ctx);
  const deal = await typedCtx.prismaWithTenant.opportunity.findFirst({
    where: { id: opportunityId, deletedAt: null } as any,
    select: { id: true },
  });
  if (!deal) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Deal not found: ${opportunityId}` });
  }
  return deal;
}

export interface AttachDealFileInput {
  opportunityId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: string; // base64
}

/**
 * Validate, scan and persist a deal file through the quarantine-then-promote
 * pipeline. Throws TRPCError on any validation/scan failure — the router
 * procedure lets it propagate (mirrors how other mutations in this module
 * throw rather than return a Result for request-shape failures).
 */
export async function attachDealFile(ctx: Context, input: AttachDealFileInput) {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;

  await findDealOrThrow(ctx, input.opportunityId);

  const fileType = resolveDealFileType(input.mimeType);
  if (!fileType) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `File type "${input.mimeType}" is not allowed`,
    });
  }

  const buffer = decodeBase64(input.content);
  if (buffer.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'File content is empty' });
  }
  // Re-validate the DECODED buffer length — the Zod-checked sizeBytes is
  // caller-supplied and could lie; this is the number that actually matters.
  if (buffer.length > MAX_DEAL_FILE_SIZE_BYTES) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `File size ${buffer.length} bytes exceeds the ${MAX_DEAL_FILE_SIZE_BYTES} byte limit`,
    });
  }

  const { storage, scanner } = requireStorageAdapters(ctx);

  const quarantineKey = await storage.uploadToQuarantine(buffer, input.name, tenantId);

  const scanResult = await scanner.scan(buffer);
  if (!scanResult.clean) {
    await storage.deleteFromQuarantine(quarantineKey);
    const threatSuffix = scanResult.threatName ? ` (${scanResult.threatName})` : '';
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `File rejected: virus detected${threatSuffix}`,
    });
  }

  const safeName = input.name.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
  const primaryKey = `${tenantId}/opportunities/${input.opportunityId}/${Date.now()}-${safeName}`;
  const storageKey = await storage.moveToPrimary(quarantineKey, primaryKey);

  return typedCtx.prismaWithTenant.dealFile.create({
    data: {
      name: input.name,
      size: formatFileSize(buffer.length),
      sizeBytes: buffer.length,
      fileType: fileType as never,
      url: storageKey,
      opportunityId: input.opportunityId,
      uploadedById: typedCtx.tenant.userId,
      tenantId,
    },
  });
}

/**
 * List a deal's files with a fresh signed download URL per file (the stored
 * `url` is the permanent storage key, not a URL — signing it on every read
 * means a long-lived link is never persisted or cached stale).
 */
export async function listDealFiles(ctx: Context, opportunityId: string) {
  const typedCtx = getTenantContext(ctx);
  await findDealOrThrow(ctx, opportunityId);

  const files = await typedCtx.prismaWithTenant.dealFile.findMany({
    where: { opportunityId },
    orderBy: { uploadedAt: 'desc' },
  });

  const storage = ctx.adapters?.storageService;
  return Promise.all(
    files.map(async (file) => {
      let downloadUrl: string | null = null;
      if (storage && file.url) {
        try {
          downloadUrl = await storage.getSignedUrl(file.url, 3600);
        } catch (err) {
          console.error('[deal-files] getSignedUrl failed:', err);
        }
      }
      return { ...file, downloadUrl };
    })
  );
}

/**
 * Remove a deal file. Deletes the DealFile record only — StorageServicePort
 * has no primary-bucket delete method (only `deleteFromQuarantine`, for the
 * pre-scan reject path), and no caller in this codebase deletes a
 * primary-stored object today; adding one would be a new capability on the
 * shared storage port, not "use the existing StorageServicePort". The
 * now-unreferenced blob is the same cleanup gap the rest of the storage
 * pipeline already has, not a new one introduced here.
 */
export async function removeDealFile(ctx: Context, id: string): Promise<{ opportunityId: string }> {
  const typedCtx = getTenantContext(ctx);
  const tenantId = typedCtx.tenant.tenantId;

  // Read first (not just deleteMany's count) so the caller can audit-log
  // against the file's deal, not just the file id.
  const existing = await typedCtx.prismaWithTenant.dealFile.findFirst({
    where: { id, tenantId },
    select: { id: true, opportunityId: true },
  });
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Deal file not found: ${id}` });
  }

  await typedCtx.prismaWithTenant.dealFile.delete({ where: { id } });

  return { opportunityId: existing.opportunityId };
}
