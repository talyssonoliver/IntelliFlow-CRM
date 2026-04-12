/**
 * Lead Settings Router - PG-178
 *
 * tRPC router for lead stage configuration, scoring rules,
 * custom fields, and automation settings.
 * Uses direct Prisma access (ticketConfigRouter pattern).
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { LEAD_STATUSES } from '@intelliflow/domain';
import {
  updateLeadStagesSchema,
  updateLeadScoringRulesSchema,
  createLeadCustomFieldSchema,
  updateLeadCustomFieldSchema,
  deleteLeadCustomFieldSchema,
  leadAutomationSettingsSchema,
} from '@intelliflow/validators';

// ─── Default Data ───────────────────────────────────────────────────────────

const DEFAULT_STAGE_COLORS: Record<string, string> = {
  NEW: '#3B82F6',
  CONTACTED: '#F59E0B',
  QUALIFIED: '#22C55E',
  NEGOTIATING: '#6366F1',
  UNQUALIFIED: '#64748B',
  CONVERTED: '#EF4444',
  LOST: '#9CA3AF',
};

const DEFAULT_STAGE_DISPLAY_NAMES: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NEGOTIATING: 'Negotiating',
  UNQUALIFIED: 'Unqualified',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

const DEFAULT_SCORING_RULES = [
  { activityType: 'EMAIL_OPEN', points: 10 },
  { activityType: 'EMAIL_CLICK', points: 25 },
  { activityType: 'MEETING_SCHEDULED', points: 50 },
  { activityType: 'FORM_SUBMISSION', points: 15 },
  { activityType: 'WEBSITE_VISIT', points: 5 },
  { activityType: 'CALL_COMPLETED', points: 30 },
];

// ─── Helper: Generate field key from name ───────────────────────────────────

function generateFieldKey(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ─── Stages Sub-Router ──────────────────────────────────────────────────────

const stagesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.leadStageConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (existing.length > 0) return existing;

    // Seed defaults from LEAD_STATUSES
    const defaults = LEAD_STATUSES.map((status, index) => ({
      tenantId,
      stageKey: status,
      displayName: DEFAULT_STAGE_DISPLAY_NAMES[status] ?? status,
      color: DEFAULT_STAGE_COLORS[status] ?? '#6366F1',
      sortOrder: index,
      isDefault: status === 'NEW',
      isActive: true,
    }));

    await ctx.prismaWithTenant.leadStageConfig.createMany({
      data: defaults,
      skipDuplicates: true,
    });

    return ctx.prismaWithTenant.leadStageConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  updateAll: tenantProcedure.input(updateLeadStagesSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { stages } = input;

    // Ensure exactly one default
    const defaultCount = stages.filter((s) => s.isDefault).length;
    if (defaultCount !== 1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Exactly one stage must be marked as default',
      });
    }

    return ctx.prismaWithTenant.$transaction(async (tx) => {
      // Deactivate all existing stages
      await tx.leadStageConfig.updateMany({
        where: { tenantId },
        data: { isActive: false },
      });

      // Upsert each stage
      for (const stage of stages) {
        await tx.leadStageConfig.upsert({
          where: {
            tenantId_stageKey: { tenantId, stageKey: stage.stageKey },
          },
          create: { ...stage, tenantId, isActive: true },
          update: { ...stage, isActive: true },
        });
      }

      return tx.leadStageConfig.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;

    return ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.leadStageConfig.deleteMany({ where: { tenantId } });

      const defaults = LEAD_STATUSES.map((status, index) => ({
        tenantId,
        stageKey: status,
        displayName: DEFAULT_STAGE_DISPLAY_NAMES[status] ?? status,
        color: DEFAULT_STAGE_COLORS[status] ?? '#6366F1',
        sortOrder: index,
        isDefault: status === 'NEW',
        isActive: true,
      }));

      await tx.leadStageConfig.createMany({ data: defaults });

      return tx.leadStageConfig.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }),
});

// ─── Scoring Rules Sub-Router ───────────────────────────────────────────────

const scoringRulesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.leadScoringRule.findMany({
      where: { tenantId, isActive: true },
    });

    if (existing.length > 0) return existing;

    // Seed defaults
    await ctx.prismaWithTenant.leadScoringRule.createMany({
      data: DEFAULT_SCORING_RULES.map((rule) => ({
        ...rule,
        tenantId,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    return ctx.prismaWithTenant.leadScoringRule.findMany({
      where: { tenantId, isActive: true },
    });
  }),

  updateAll: tenantProcedure
    .input(updateLeadScoringRulesSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      return ctx.prismaWithTenant.$transaction(async (tx) => {
        // Deactivate all existing rules
        await tx.leadScoringRule.updateMany({
          where: { tenantId },
          data: { isActive: false },
        });

        // Upsert each rule
        for (const rule of input.rules) {
          await tx.leadScoringRule.upsert({
            where: {
              tenantId_activityType: { tenantId, activityType: rule.activityType },
            },
            create: { ...rule, tenantId, isActive: true },
            update: { ...rule, isActive: true },
          });
        }

        return tx.leadScoringRule.findMany({
          where: { tenantId, isActive: true },
        });
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;

    return ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.leadScoringRule.deleteMany({ where: { tenantId } });

      await tx.leadScoringRule.createMany({
        data: DEFAULT_SCORING_RULES.map((rule) => ({
          ...rule,
          tenantId,
          isActive: true,
        })),
      });

      return tx.leadScoringRule.findMany({
        where: { tenantId, isActive: true },
      });
    });
  }),
});

// ─── Custom Fields Sub-Router ───────────────────────────────────────────────

const customFieldsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.leadCustomField.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  create: tenantProcedure.input(createLeadCustomFieldSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const fieldKey = generateFieldKey(input.fieldName);

    // Check for duplicate
    const existing = await ctx.prismaWithTenant.leadCustomField.findUnique({
      where: { tenantId_fieldKey: { tenantId, fieldKey } },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `A field with key "${fieldKey}" already exists`,
      });
    }

    // Get next sort order
    const maxSort = await ctx.prismaWithTenant.leadCustomField.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    return ctx.prismaWithTenant.leadCustomField.create({
      data: {
        fieldName: input.fieldName,
        fieldKey,
        dataType: input.dataType,
        options: input.options ?? undefined,
        isRequired: input.isRequired ?? false,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        tenantId,
      },
    });
  }),

  update: tenantProcedure.input(updateLeadCustomFieldSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const existing = await ctx.prismaWithTenant.leadCustomField.findFirst({
      where: { id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom field not found' });
    }

    return ctx.prismaWithTenant.leadCustomField.update({
      where: { id },
      data: {
        fieldName: data.fieldName,
        dataType: data.dataType,
        options: data.options ?? undefined,
        isRequired: data.isRequired ?? existing.isRequired,
      },
    });
  }),

  delete: tenantProcedure.input(deleteLeadCustomFieldSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prismaWithTenant.leadCustomField.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom field not found' });
    }

    return ctx.prismaWithTenant.leadCustomField.update({
      where: { id: input.id },
      data: { isActive: false },
    });
  }),
});

// ─── Automation Sub-Router ──────────────────────────────────────────────────

const automationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.leadAutomationSetting.findUnique({
      where: { tenantId },
    });

    if (existing) return existing;

    // Create defaults
    return ctx.prismaWithTenant.leadAutomationSetting.create({
      data: {
        tenantId,
        autoAssignment: true,
        instantNotifications: false,
        leadRecurrence: true,
      },
    });
  }),

  update: tenantProcedure.input(leadAutomationSettingsSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.leadAutomationSetting.upsert({
      where: { tenantId },
      create: { ...input, tenantId },
      update: input,
    });
  }),
});

// ─── Export Combined Router ─────────────────────────────────────────────────

export const leadSettingsRouter = createTRPCRouter({
  stages: stagesRouter,
  scoringRules: scoringRulesRouter,
  customFields: customFieldsRouter,
  automation: automationRouter,
});
