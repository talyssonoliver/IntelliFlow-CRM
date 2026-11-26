/**
 * Whole-workspace data export (agreement clause 5: a standalone copy of the customer's data
 * within 14 days of leaving).
 *
 * Every procedure is `adminTenantProcedure` (workspace administrators only) and acts on the
 * context tenant: another tenant's request id is NOT_FOUND. The export itself runs in the
 * ai-worker (BullMQ queue `intelliflow-workspace-export`); this router creates the audit row,
 * queues the job, lists requests and issues a fresh signed link. A link is never stored and never
 * returned by `list`; the audit rows hold ids and counts only.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  ExportLinkError,
  storedPartsOf,
  SupabaseExportStorage,
  issueDownloadLink,
  requestWorkspaceExport,
} from '@intelliflow/adapters';
import { adminTenantProcedure, createTRPCRouter } from '../../trpc';
import { getAuditLogger } from '../../security/audit-logger';
import { enqueueWorkspaceExport } from './workspace-export.queue';

let archiveStorage: SupabaseExportStorage | null = null;

/** The private export bucket, reached with the service key (never exposed to a browser). */
function getArchiveStorage(): SupabaseExportStorage {
  if (archiveStorage) return archiveStorage;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Data export storage is not configured.',
    });
  }
  archiveStorage = new SupabaseExportStorage(url, key);
  return archiveStorage;
}

/** One export request as the settings page sees it: counts and dates, never a path or a link. */
export interface WorkspaceExportDto {
  id: string;
  trigger: 'ADMIN' | 'SUBSCRIPTION_ENDED';
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
  requestedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  emailedAt: Date | null;
  fileCount: number | null;
  archiveBytes: number | null;
  archiveSha256: string | null;
  /** How many ZIP parts the export has (1 for a small one). */
  partCount: number;
  totalRows: number | null;
  skippedFiles: number;
}

/** The audit row's counts are Json; the page gets plain numbers (an explicit contract). */
function countsOf(value: unknown): { totalRows: number | null; skippedFiles: number } {
  const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    totalRows: typeof o.totalRows === 'number' ? o.totalRows : null,
    skippedFiles: typeof o.skippedFiles === 'number' ? o.skippedFiles : 0,
  };
}

const requestIdInput = z.object({ requestId: z.string().min(1).max(64) });

export const workspaceExportRouter = createTRPCRouter({
  /** "Export all workspace data": one per day, one at a time. */
  request: adminTenantProcedure.mutation(async ({ ctx }) => {
    const outcome = await requestWorkspaceExport(
      ctx.prismaWithTenant,
      { tenantId: ctx.tenant.tenantId, requestedById: ctx.tenant.userId },
      enqueueWorkspaceExport
    );
    switch (outcome.kind) {
      case 'already_running':
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'An export of this workspace is already running. The link is emailed when it is ready.',
        });
      case 'rate_limited':
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `A workspace export can be requested once a day. Try again after ${outcome.retryAfter.toISOString()}.`,
        });
      case 'created': {
        getAuditLogger(ctx.prisma)
          .logAction('EXPORT', 'system', outcome.requestId, ctx.tenant.tenantId, {
            actorId: ctx.tenant.userId,
            metadata: { kind: 'workspace_export', trigger: 'ADMIN' },
          })
          .catch((error: unknown) =>
            console.error('[workspace-export] Audit log failed', {
              error: error instanceof Error ? error.name : 'unknown',
            })
          );
        return { requestId: outcome.requestId };
      }
      default:
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Export could not be requested.',
        });
    }
  }),

  /** The latest requests of this workspace: status, counts and expiry. No links. */
  list: adminTenantProcedure.query(async ({ ctx }): Promise<WorkspaceExportDto[]> => {
    const rows = await ctx.prismaWithTenant.workspaceExportRequest.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: { requestedAt: 'desc' },
      take: 10,
    });
    return rows.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      requestedAt: r.requestedAt,
      completedAt: r.completedAt,
      expiresAt: r.expiresAt,
      emailedAt: r.emailedAt,
      fileCount: r.fileCount,
      archiveBytes: r.archiveBytes === null ? null : Number(r.archiveBytes),
      archiveSha256: r.archiveSha256,
      partCount: storedPartsOf(r).items.length || 1,
      ...countsOf(r.rowCounts),
    }));
  }),

  /** A fresh link for a READY export, valid until its 14 days are over. */
  downloadLink: adminTenantProcedure.input(requestIdInput).mutation(async ({ ctx, input }) => {
    try {
      const link = await issueDownloadLink(ctx.prismaWithTenant, getArchiveStorage(), {
        tenantId: ctx.tenant.tenantId,
        requestId: input.requestId,
      });
      getAuditLogger(ctx.prisma)
        .logAction('EXPORT', 'system', input.requestId, ctx.tenant.tenantId, {
          actorId: ctx.tenant.userId,
          metadata: { kind: 'workspace_export', action: 'LINK_ISSUED' },
        })
        .catch(() => undefined);
      return link;
    } catch (err) {
      if (err instanceof ExportLinkError) {
        throw new TRPCError({
          code: err.reason === 'not_found' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: err.message,
        });
      }
      throw err;
    }
  }),
});
