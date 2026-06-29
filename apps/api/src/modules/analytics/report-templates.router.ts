/**
 * Report Templates Router - PG-200
 *
 * tRPC router for /analytics/report-templates page.
 * Provides: list, get, create, update, delete for saveable report layouts.
 *
 * Follows the direct-Prisma pattern from report-settings.router.ts (PG-187).
 * $transaction is required for update and delete (module-settings-playbook §req).
 * Multi-tenant isolation via ctx.tenant.tenantId — never from user input.
 */

import { TRPCError } from '@trpc/server';
import type { Prisma, ReportTemplate } from '@intelliflow/db';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createReportTemplateSchema,
  updateReportTemplateSchema,
  deleteReportTemplateSchema,
  getReportTemplateSchema,
  type ReportTemplateView,
} from '@intelliflow/validators';

function normalizeRow(row: ReportTemplate): ReportTemplateView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdBy: row.createdBy,
    name: row.name,
    description: row.description ?? null,
    filterSet: (row.filterSet ?? {}) as Record<string, unknown>,
    selectedColumns: (row.selectedColumns as string[]) ?? [],
    chartType: row.chartType,
    defaultPeriod: row.defaultPeriod,
    sharingScope: row.sharingScope,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const reportTemplatesRouter = createTRPCRouter({
  /**
   * List report templates visible to the caller:
   * - Templates the caller created (regardless of sharingScope)
   * - Templates with sharingScope != 'private' in the same tenant
   *
   * Private templates from other users in the same tenant are NOT returned.
   * See spec §6.4 + plan W3 fix.
   */
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;

    const rows = await ctx.prismaWithTenant.reportTemplate.findMany({
      where: {
        tenantId,
        OR: [{ createdBy: userId }, { sharingScope: { not: 'private' } }],
      },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map(normalizeRow);
  }),

  /**
   * Get a single report template by id (tenant-scoped, visibility-filtered).
   * Throws NOT_FOUND if absent, belongs to another tenant, or is private and
   * belongs to a different user — mirrors the list() visibility predicate.
   */
  get: tenantProcedure.input(getReportTemplateSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;

    const template = await ctx.prismaWithTenant.reportTemplate.findFirst({
      where: {
        id: input.id,
        tenantId,
        OR: [{ createdBy: userId }, { sharingScope: { not: 'private' } }],
      },
    });

    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Report template not found.' });
    }

    return normalizeRow(template);
  }),

  /**
   * Create a new report template.
   * Pre-checks for duplicate name within tenant before inserting.
   */
  create: tenantProcedure.input(createReportTemplateSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;

    const existing = await ctx.prismaWithTenant.reportTemplate.findFirst({
      where: { tenantId, name: input.name },
      select: { id: true },
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `A report template named "${input.name}" already exists.`,
      });
    }

    try {
      const created = await ctx.prismaWithTenant.reportTemplate.create({
        data: {
          tenantId,
          createdBy: userId,
          name: input.name,
          description: input.description,
          selectedColumns: input.selectedColumns as unknown as Prisma.InputJsonValue,
          chartType: input.chartType ?? 'table',
          defaultPeriod: input.defaultPeriod ?? '30d',
          sharingScope: input.sharingScope ?? 'private',
          filterSet: (input.filterSet ?? {}) as unknown as Prisma.InputJsonValue,
        },
      });
      return normalizeRow(created);
    } catch (err: unknown) {
      const prismaError = err as { code?: string };
      if (prismaError.code === 'P2002') {
        // Concurrent duplicate-name insert (TOCTOU race on pre-check).
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A report template named "${input.name}" already exists.`,
        });
      }
      throw err;
    }
  }),

  /**
   * Update a report template (partial fields).
   * Scoped to caller's tenant via $transaction.
   */
  update: tenantProcedure.input(updateReportTemplateSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;
    const { id, ...fields } = input;

    // Ownership guard: only the creator can modify a template.
    // sharingScope controls who can *see* the template (via list()), not who
    // can mutate it. Shared templates are read-only for non-owners.
    const editable = await ctx.prismaWithTenant.reportTemplate.findFirst({
      where: { id, tenantId, createdBy: userId },
      select: { id: true },
    });
    if (!editable) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Report template not found.' });
    }

    // Pre-check name uniqueness when renaming (same invariant as create).
    if (fields.name !== undefined) {
      const collision = await ctx.prismaWithTenant.reportTemplate.findFirst({
        where: { tenantId, name: fields.name, NOT: { id } },
        select: { id: true },
      });
      if (collision) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A report template named "${fields.name}" already exists.`,
        });
      }
    }

    try {
      const updated = await ctx.prisma.$transaction(async (tx) => {
        return tx.reportTemplate.update({
          where: { id, tenantId },
          data: {
            ...(fields.name !== undefined && { name: fields.name }),
            ...(fields.description !== undefined && { description: fields.description }),
            ...(fields.selectedColumns !== undefined && {
              selectedColumns: fields.selectedColumns as unknown as Prisma.InputJsonValue,
            }),
            ...(fields.chartType !== undefined && { chartType: fields.chartType }),
            ...(fields.defaultPeriod !== undefined && { defaultPeriod: fields.defaultPeriod }),
            ...(fields.sharingScope !== undefined && { sharingScope: fields.sharingScope }),
            ...(fields.filterSet !== undefined && {
              filterSet: fields.filterSet as unknown as Prisma.InputJsonValue,
            }),
          },
        });
      });
      return normalizeRow(updated);
    } catch (err: unknown) {
      const prismaError = err as { code?: string };
      if (prismaError.code === 'P2025') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report template not found.' });
      }
      if (prismaError.code === 'P2002') {
        // Unique constraint fallback (belt-and-suspenders for concurrent renames).
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A report template with that name already exists.',
        });
      }
      throw err;
    }
  }),

  /**
   * Delete a report template (tenant-scoped $transaction).
   * Returns { deleted: true } on success; throws NOT_FOUND when no row deleted.
   *
   * Ownership model: only the creator can delete their template — consistent
   * with update(). sharingScope governs visibility (list()), not mutability.
   */
  delete: tenantProcedure.input(deleteReportTemplateSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.tenant.userId;

    // Creator-only delete: mirrors the update ownership guard.
    // A user who can *see* a shared template (via list()) cannot delete it
    // if they are not the creator.
    const result = await ctx.prisma.$transaction(async (tx) => {
      return tx.reportTemplate.deleteMany({
        where: { id: input.id, tenantId, createdBy: userId },
      });
    });

    if (result.count === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Report template not found.' });
    }

    return { deleted: true };
  }),
});
