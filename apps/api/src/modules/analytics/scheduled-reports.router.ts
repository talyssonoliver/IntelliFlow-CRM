/**
 * Scheduled Reports Router — PG-201
 *
 * tRPC router for /analytics/scheduled-reports over the existing `report_schedules`
 * table (owner ruling 2026-10-13: evolved in place, nothing dropped). Each schedule
 * has a cron expression + IANA timezone (BullMQ `pattern` + `tz`), recipients, a
 * delivery format, a PG-200 template reference, tags and a colour label.
 *
 * PG-201 adds no scheduler. IFC-308's BullMQ cron reads active rows (ADR-075), so
 * `isActive` has no runtime effect until IFC-308 ships (category-2 toggle).
 *
 * - Reads: any tenant user with the ANALYTICS entitlement (ADR-070).
 * - Writes: ADMIN / MANAGER / OWNER / SUPER_ADMIN only — a schedule sends tenant
 *   data to email recipients.
 * - tenantId comes only from ctx; every write is scoped by { id, tenantId } and
 *   every destructive write runs in $transaction (module-settings-playbook §5).
 */

import { TRPCError } from '@trpc/server';
import type { Prisma } from '@intelliflow/db';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '@intelliflow/domain';
import {
  createScheduledReportSchema,
  updateScheduledReportSchema,
  scheduledReportIdSchema,
  setScheduledReportActiveSchema,
  createReportScheduleTagSchema,
  updateReportScheduleTagSchema,
  deleteReportScheduleTagSchema,
  SCHEDULE_LIMITS,
  type ScheduledReportView,
  type ReportScheduleTagView,
} from '@intelliflow/validators';
import { createTRPCRouter, moduleTenantProcedure } from '../../trpc';
import type { TenantAwareContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import {
  buildScheduleColumns,
  computeNextRun,
  isIntervalAllowed,
  normalizeScheduleRow,
  InvalidCronError,
  SCHEDULE_TEMPLATE_SELECT,
  type ScheduleColumns,
} from './scheduled-reports.schedule';

// ADR-070: server-side ANALYTICS entitlement (same as report templates/settings).
const tenantProcedure = moduleTenantProcedure('ANALYTICS');

type ScheduleCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user' | 'prisma'>;
type ScheduleDb = ScheduleCtx['prismaWithTenant'];
type ScheduleTx = Parameters<Parameters<ScheduleDb['$transaction']>[0]>[0];

const SCHEDULE_MANAGER_ROLES: ReadonlySet<string> = new Set(ACCOUNT_OWNER_ADMIN_ROLES);
const SCHEDULE_INCLUDE = { template: { select: SCHEDULE_TEMPLATE_SELECT } } as const;

function assertScheduleManager(ctx: Pick<ScheduleCtx, 'user'>): void {
  if (SCHEDULE_MANAGER_ROLES.has(ctx.user?.role ?? '')) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only admins and managers can change scheduled reports.',
  });
}

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

function rethrowScheduleWriteError(err: unknown): never {
  switch (prismaCode(err)) {
    case 'P2002':
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A scheduled report with this name already exists.',
      });
    case 'P2003':
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Report template not found.' });
    case 'P2025':
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Scheduled report not found.' });
    default:
      throw err;
  }
}

function rethrowTagWriteError(err: unknown): never {
  switch (prismaCode(err)) {
    case 'P2002':
      throw new TRPCError({ code: 'CONFLICT', message: 'A tag with this name already exists.' });
    case 'P2025':
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found.' });
    default:
      throw err;
  }
}

function scheduleNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Scheduled report not found.' });
}

/** The template must exist in this tenant and be visible to the caller (PG-200 rule). */
async function assertTemplateVisible(ctx: ScheduleCtx, templateId: string): Promise<void> {
  const template = await ctx.prismaWithTenant.reportTemplate.findFirst({
    where: {
      id: templateId,
      tenantId: ctx.tenant.tenantId,
      OR: [{ createdBy: ctx.tenant.userId }, { sharingScope: { not: 'private' } }],
    },
    select: { id: true },
  });
  if (!template) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Report template not found.' });
  }
}

/** Every tag must be an active tag of this tenant's catalogue. */
async function assertTagsExist(ctx: ScheduleCtx, tags: string[] | undefined): Promise<void> {
  if (!tags || tags.length === 0) return;
  const found = await ctx.prismaWithTenant.reportScheduleTag.findMany({
    where: { tenantId: ctx.tenant.tenantId, isActive: true, name: { in: tags } },
    select: { name: true },
  });
  const known = new Set(found.map((t) => t.name));
  const unknown = tags.filter((t) => !known.has(t));
  if (unknown.length > 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown tag: ${unknown.join(', ')}.` });
  }
}

async function assertActiveCapacity(ctx: ScheduleCtx, excludeId?: string): Promise<void> {
  const active = await ctx.prismaWithTenant.reportSchedule.count({
    where: {
      tenantId: ctx.tenant.tenantId,
      isActive: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (active >= SCHEDULE_LIMITS.maxActivePerTenant) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `A workspace can have at most ${SCHEDULE_LIMITS.maxActivePerTenant} active scheduled reports.`,
    });
  }
}

/**
 * Validate a cron in its timezone and return its next run. Rejects unreadable
 * expressions and anything firing more often than the minimum interval.
 */
function checkedNextRun(cron: string | null, timezone: string, now: Date): Date {
  if (!cron) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set a schedule before activating it.' });
  }
  try {
    if (!isIntervalAllowed(cron, timezone, now)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A report can run at most once every ${SCHEDULE_LIMITS.minIntervalMinutes} minutes.`,
      });
    }
    return computeNextRun(cron, timezone, now);
  } catch (err) {
    if (err instanceof InvalidCronError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'That cron expression is not valid.' });
    }
    throw err;
  }
}

function assertReferenced(templateId: string | null, reportId: string | null): void {
  if (templateId || reportId) return;
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Choose a report template before activating this schedule.',
  });
}

function logScheduleAudit(
  ctx: ScheduleCtx,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  id: string,
  state: Record<string, unknown>
): void {
  // Recipient COUNT only — addresses are personal data and stay out of the audit trail.
  getAuditLogger(ctx.prisma)
    .logAction(action, 'report_schedule', id, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      afterState: state,
    })
    .catch((err: unknown) => console.error('[scheduled-reports.router] Audit log failed:', err));
}

function auditState(view: ScheduledReportView): Record<string, unknown> {
  return { recipientCount: view.recipients.length, format: view.format, isActive: view.isActive };
}

function sameRecipients(a: string[], b: Prisma.JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Replace (rename) or remove (delete) a tag name on every tenant schedule that carries it. */
async function rewriteScheduleTags(
  tx: ScheduleTx,
  tenantId: string,
  oldName: string,
  newName: string | null
): Promise<void> {
  const schedules = await tx.reportSchedule.findMany({
    where: { tenantId, tags: { has: oldName } },
    select: { id: true, tags: true },
  });
  for (const schedule of schedules) {
    const replacement = newName ? [newName] : [];
    const next = schedule.tags.flatMap((t) => (t === oldName ? replacement : [t]));
    await tx.reportSchedule.update({
      where: { id: schedule.id, tenantId },
      data: { tags: [...new Set(next)] },
    });
  }
}

function toTagView(row: {
  id: string;
  name: string;
  colorToken: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}): ReportScheduleTagView {
  return {
    id: row.id,
    name: row.name,
    colorToken: row.colorToken,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

// ─── Tags sub-router ─────────────────────────────────────────────────────────

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<ReportScheduleTagView[]> => {
    const rows = await ctx.prismaWithTenant.reportScheduleTag.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toTagView);
  }),

  create: tenantProcedure
    .input(createReportScheduleTagSchema)
    .mutation(async ({ ctx, input }): Promise<ReportScheduleTagView> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      const max = await ctx.prismaWithTenant.reportScheduleTag.aggregate({
        where: { tenantId },
        _max: { sortOrder: true },
      });
      try {
        const row = await ctx.prismaWithTenant.reportScheduleTag.create({
          data: {
            tenantId,
            name: input.name,
            colorToken: input.colorToken ?? 'slate',
            description: input.description ?? null,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
        });
        return toTagView(row);
      } catch (err) {
        rethrowTagWriteError(err);
      }
    }),

  update: tenantProcedure
    .input(updateReportScheduleTagSchema)
    .mutation(async ({ ctx, input }): Promise<ReportScheduleTagView> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      const { id, ...fields } = input;
      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          const existing = await tx.reportScheduleTag.findFirst({ where: { id, tenantId } });
          if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found.' });
          const updated = await tx.reportScheduleTag.update({
            where: { id, tenantId },
            data: {
              ...(fields.name !== undefined && { name: fields.name }),
              ...(fields.colorToken !== undefined && { colorToken: fields.colorToken }),
              ...(fields.description !== undefined && { description: fields.description }),
              ...(fields.isActive !== undefined && { isActive: fields.isActive }),
            },
          });
          if (fields.name !== undefined && fields.name !== existing.name) {
            await rewriteScheduleTags(tx, tenantId, existing.name, fields.name);
          }
          return updated;
        });
        return toTagView(row);
      } catch (err) {
        rethrowTagWriteError(err);
      }
    }),

  delete: tenantProcedure
    .input(deleteReportScheduleTagSchema)
    .mutation(async ({ ctx, input }): Promise<{ deleted: true }> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        const existing = await tx.reportScheduleTag.findFirst({
          where: { id: input.id, tenantId },
        });
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found.' });
        await rewriteScheduleTags(tx, tenantId, existing.name, null);
        await tx.reportScheduleTag.delete({ where: { id: input.id, tenantId } });
      });
      return { deleted: true };
    }),
});

// ─── Schedules ───────────────────────────────────────────────────────────────

export const scheduledReportsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<ScheduledReportView[]> => {
    const rows = await ctx.prismaWithTenant.reportSchedule.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      include: SCHEDULE_INCLUDE,
      orderBy: [{ name: 'asc' }],
      take: 500,
    });
    return rows.map((row) => normalizeScheduleRow(row, ctx.tenant.userId));
  }),

  get: tenantProcedure
    .input(scheduledReportIdSchema)
    .query(async ({ ctx, input }): Promise<ScheduledReportView> => {
      const row = await ctx.prismaWithTenant.reportSchedule.findFirst({
        where: { id: input.id, tenantId: ctx.tenant.tenantId },
        include: SCHEDULE_INCLUDE,
      });
      if (!row) throw scheduleNotFound();
      return normalizeScheduleRow(row, ctx.tenant.userId);
    }),

  create: tenantProcedure
    .input(createScheduledReportSchema)
    .mutation(async ({ ctx, input }): Promise<ScheduledReportView> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      await assertTemplateVisible(ctx, input.templateId);
      await assertTagsExist(ctx, input.tags);

      const isActive = input.isActive ?? true;
      const columns = buildScheduleColumns(input);
      // Validated for every schedule; stored only while active.
      const nextRun = checkedNextRun(columns.cronExpression, input.timezone, new Date());
      if (isActive) await assertActiveCapacity(ctx);

      let view: ScheduledReportView;
      try {
        const row = await ctx.prismaWithTenant.reportSchedule.create({
          data: {
            tenantId,
            createdBy: ctx.tenant.userId,
            templateId: input.templateId,
            name: input.name,
            description: input.description ?? null,
            ...columns,
            timezone: input.timezone,
            recipients: input.recipients,
            format: input.format,
            colorToken: input.colorToken ?? 'slate',
            tags: input.tags ?? [],
            isActive,
            nextRunAt: isActive ? nextRun : null,
          },
          include: SCHEDULE_INCLUDE,
        });
        view = normalizeScheduleRow(row, ctx.tenant.userId);
      } catch (err) {
        rethrowScheduleWriteError(err);
      }
      logScheduleAudit(ctx, 'CREATE', view.id, auditState(view));
      return view;
    }),

  update: tenantProcedure
    .input(updateScheduledReportSchema)
    .mutation(async ({ ctx, input }): Promise<ScheduledReportView> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      const { id, cadence, dayOfWeek, dayOfMonth, timeOfDay, cronExpression, ...fields } = input;

      const existing = await ctx.prismaWithTenant.reportSchedule.findFirst({
        where: { id, tenantId },
      });
      if (!existing) throw scheduleNotFound();
      if (fields.templateId !== undefined) await assertTemplateVisible(ctx, fields.templateId);
      await assertTagsExist(ctx, fields.tags);

      const columns: ScheduleColumns | null = cadence
        ? buildScheduleColumns({ cadence, dayOfWeek, dayOfMonth, timeOfDay, cronExpression })
        : null;
      const timezone = fields.timezone ?? existing.timezone;
      const cron = columns ? columns.cronExpression : existing.cronExpression;
      const isActive = fields.isActive ?? existing.isActive;
      const templateId = fields.templateId ?? existing.templateId;
      const now = new Date();

      if (isActive) {
        assertReferenced(templateId, existing.reportId);
        if (!existing.isActive) {
          if (fields.templateId === undefined && templateId) {
            await assertTemplateVisible(ctx, templateId);
          }
          await assertActiveCapacity(ctx, id);
        }
      }
      const scheduleChanged = columns !== null || fields.timezone !== undefined;
      const nextRun =
        scheduleChanged || isActive !== existing.isActive
          ? checkedNextRun(cron, timezone, now)
          : null;

      let view: ScheduledReportView;
      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) =>
          tx.reportSchedule.update({
            where: { id, tenantId },
            data: {
              ...(fields.name !== undefined && { name: fields.name }),
              ...(fields.description !== undefined && { description: fields.description }),
              ...(fields.templateId !== undefined && { templateId: fields.templateId }),
              ...(columns ?? {}),
              ...(fields.timezone !== undefined && { timezone: fields.timezone }),
              ...(fields.recipients !== undefined && { recipients: fields.recipients }),
              ...(fields.format !== undefined && { format: fields.format }),
              ...(fields.colorToken !== undefined && { colorToken: fields.colorToken }),
              ...(fields.tags !== undefined && { tags: fields.tags }),
              ...(fields.isActive !== undefined && { isActive: fields.isActive }),
              ...(nextRun !== null && { nextRunAt: isActive ? nextRun : null }),
            },
            include: SCHEDULE_INCLUDE,
          })
        );
        view = normalizeScheduleRow(row, ctx.tenant.userId);
      } catch (err) {
        rethrowScheduleWriteError(err);
      }
      if (
        fields.recipients !== undefined &&
        !sameRecipients(fields.recipients, existing.recipients)
      ) {
        logScheduleAudit(ctx, 'UPDATE', id, auditState(view));
      }
      return view;
    }),

  setActive: tenantProcedure
    .input(setScheduledReportActiveSchema)
    .mutation(async ({ ctx, input }): Promise<ScheduledReportView> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      const existing = await ctx.prismaWithTenant.reportSchedule.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) throw scheduleNotFound();

      let nextRunAt: Date | null = null;
      if (input.isActive) {
        assertReferenced(existing.templateId, existing.reportId);
        if (existing.templateId) await assertTemplateVisible(ctx, existing.templateId);
        nextRunAt = checkedNextRun(existing.cronExpression, existing.timezone, new Date());
        if (!existing.isActive) await assertActiveCapacity(ctx, input.id);
      }

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) =>
          tx.reportSchedule.update({
            where: { id: input.id, tenantId },
            data: { isActive: input.isActive, nextRunAt },
            include: SCHEDULE_INCLUDE,
          })
        );
        return normalizeScheduleRow(row, ctx.tenant.userId);
      } catch (err) {
        rethrowScheduleWriteError(err);
      }
    }),

  delete: tenantProcedure
    .input(scheduledReportIdSchema)
    .mutation(async ({ ctx, input }): Promise<{ deleted: true }> => {
      assertScheduleManager(ctx);
      const tenantId = ctx.tenant.tenantId;
      const result = await ctx.prismaWithTenant.$transaction(async (tx) =>
        tx.reportSchedule.deleteMany({ where: { id: input.id, tenantId } })
      );
      if (result.count === 0) throw scheduleNotFound();
      logScheduleAudit(ctx, 'DELETE', input.id, {});
      return { deleted: true };
    }),

  tags: tagsRouter,
});
