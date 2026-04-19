/**
 * Deal Settings Router - PG-184
 *
 * Composite tRPC router for the /deals/deal-settings page. Seven sub-routers:
 *   - pipeline         — re-export of pipelineConfigRouter (IFC-063), NO duplication.
 *   - winLossReasons   — WON/LOST taxonomy CRUD + resetToDefaults.
 *   - scoringRules     — deterministic scoring rules (runtime engine is IFC-312).
 *   - duplicateRules   — duplicate-detection rules with superRefine dedup.
 *   - requiredFields   — required-field policy (accountId/ownerId always on).
 *   - tags             — tag CRUD (respects restrictTagCreationToAdmins).
 *   - automation       — 16 Boolean toggles + highValueThreshold.
 *
 * Every multi-row write is wrapped in $transaction (playbook §5).
 * No skipDuplicates: true anywhere — Prisma P2002 maps to TRPCError CONFLICT.
 * Mutations use where: { id, tenantId } so a foreign tenant id fails with
 * P2025 (NOT_FOUND).
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  updateDealDuplicateRulesSchema,
  updateDealRequiredFieldsSchema,
  createDealTagSchema,
  updateDealTagSchema,
  deleteDealTagSchema,
  createDealWinLossReasonSchema,
  updateDealWinLossReasonSchema,
  deleteDealWinLossReasonSchema,
  createDealScoringRuleSchema,
  updateDealScoringRuleSchema,
  deleteDealScoringRuleSchema,
  dealAutomationSettingsSchema,
  DEFAULT_DEAL_AUTOMATION,
  DEFAULT_DEAL_DUPLICATE_RULES,
  DEFAULT_DEAL_REQUIRED_FIELDS,
  DEFAULT_DEAL_WIN_REASONS,
  DEFAULT_DEAL_LOSS_REASONS,
  generateDealReasonKey,
} from '@intelliflow/validators';
import { loadDealAutomation, assertCanCreateTag } from './deal-automation';
import { pipelineConfigRouter } from './pipeline-config.router';

// ─── Helpers ────────────────────────────────────────────────────────────────

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string };
  return e.code === 'P2002';
}

function isRecordNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string };
  return e.code === 'P2025';
}

// ─── Duplicate Rules Sub-Router ─────────────────────────────────────────────

const duplicateRulesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.dealDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });

    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.dealDuplicateRule.createMany({
      data: DEFAULT_DEAL_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
    });

    return ctx.prismaWithTenant.dealDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  updateAll: tenantProcedure
    .input(updateDealDuplicateRulesSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      try {
        await ctx.prismaWithTenant.$transaction([
          ctx.prismaWithTenant.dealDuplicateRule.deleteMany({ where: { tenantId } }),
          ctx.prismaWithTenant.dealDuplicateRule.createMany({
            data: input.rules.map((r) => ({ ...r, tenantId })),
          }),
        ]);
      } catch (err: unknown) {
        if (isUniqueConstraintError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'Two deal duplicate rules share the same (field, match strategy) pair. Remove or change one before saving.',
          });
        }
        throw err;
      }

      return ctx.prismaWithTenant.dealDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.dealDuplicateRule.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.dealDuplicateRule.createMany({
        data: DEFAULT_DEAL_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
      }),
    ]);
    return ctx.prismaWithTenant.dealDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),
});

// ─── Required Fields Sub-Router ─────────────────────────────────────────────

const requiredFieldsRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.dealRequiredField.findMany({
      where: { tenantId },
    });

    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.dealRequiredField.createMany({
      data: DEFAULT_DEAL_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
    });

    return ctx.prismaWithTenant.dealRequiredField.findMany({
      where: { tenantId },
    });
  }),

  updateAll: tenantProcedure
    .input(updateDealRequiredFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      await ctx.prismaWithTenant.$transaction(
        input.fields.map((f) =>
          ctx.prismaWithTenant.dealRequiredField.upsert({
            where: { tenantId_fieldKey: { tenantId, fieldKey: f.fieldKey } },
            update: { isRequired: f.isRequired },
            create: { tenantId, fieldKey: f.fieldKey, isRequired: f.isRequired },
          })
        )
      );

      return ctx.prismaWithTenant.dealRequiredField.findMany({ where: { tenantId } });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.dealRequiredField.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.dealRequiredField.createMany({
        data: DEFAULT_DEAL_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
      }),
    ]);
    return ctx.prismaWithTenant.dealRequiredField.findMany({ where: { tenantId } });
  }),
});

// ─── Win / Loss Reasons Sub-Router ──────────────────────────────────────────

const winLossReasonsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.dealWinLossReason.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }),

  create: tenantProcedure.input(createDealWinLossReasonSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const key = generateDealReasonKey(input.label);

    try {
      return await ctx.prismaWithTenant.dealWinLossReason.create({
        data: {
          tenantId,
          category: input.category,
          label: input.label,
          key,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A ${input.category.toLowerCase()} reason with key "${key}" already exists.`,
        });
      }
      throw err;
    }
  }),

  update: tenantProcedure.input(updateDealWinLossReasonSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { id, ...rest } = input;
    try {
      return await ctx.prismaWithTenant.dealWinLossReason.update({
        where: { id, tenantId },
        data: rest,
      });
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Win/loss reason not found in this tenant.',
        });
      }
      throw err;
    }
  }),

  delete: tenantProcedure.input(deleteDealWinLossReasonSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    // Soft-delete path if any Opportunity references the reason key. The
    // FK column (`Opportunity.closeReasonKey`) lands with FOLLOWUP-PG-184-WINLOSS
    // (IFC-310). Until then, this count is always 0 — the mock stubs it in
    // tests so we exercise the branch.
    const referenced = await ((
      ctx.prismaWithTenant as unknown as {
        opportunity?: { count?: (args: unknown) => Promise<number> };
      }
    ).opportunity?.count?.({ where: { tenantId, id: input.id } }) ?? Promise.resolve(0));

    const existing = await ctx.prismaWithTenant.dealWinLossReason.findUnique({
      where: { id: input.id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Win/loss reason not found in this tenant.',
      });
    }

    if (referenced > 0) {
      await ctx.prismaWithTenant.dealWinLossReason.update({
        where: { id: input.id, tenantId },
        data: { isActive: false },
      });
      return { softDeleted: true };
    }

    try {
      await ctx.prismaWithTenant.dealWinLossReason.delete({
        where: { id: input.id, tenantId },
      });
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Win/loss reason not found in this tenant.',
        });
      }
      throw err;
    }
    return { softDeleted: false };
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const allDefaults = [...DEFAULT_DEAL_WIN_REASONS, ...DEFAULT_DEAL_LOSS_REASONS].map(
      (r, index) => ({
        ...r,
        tenantId,
        sortOrder: index,
        isActive: true,
      })
    );

    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.dealWinLossReason.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.dealWinLossReason.createMany({ data: allDefaults }),
    ]);

    return ctx.prismaWithTenant.dealWinLossReason.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }),
});

// ─── Scoring Rules Sub-Router ───────────────────────────────────────────────

const scoringRulesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.dealScoringRule.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: tenantProcedure.input(createDealScoringRuleSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.dealScoringRule.create({
      data: {
        tenantId,
        name: input.name,
        field: input.field,
        operator: input.operator,
        // Validator narrows valueJson.value to `unknown`; Prisma wants
        // InputJsonValue. The payload is validated by Zod at the edge, so
        // the cast is safe.
        valueJson: input.valueJson as unknown as object,
        points: input.points,
        isActive: input.isActive,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }),

  update: tenantProcedure.input(updateDealScoringRuleSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { id, ...rest } = input;
    try {
      return await ctx.prismaWithTenant.dealScoringRule.update({
        where: { id, tenantId },
        // Same InputJsonValue cast as on create.
        data: rest as unknown as Parameters<
          typeof ctx.prismaWithTenant.dealScoringRule.update
        >[0]['data'],
      });
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scoring rule not found in this tenant.',
        });
      }
      throw err;
    }
  }),

  delete: tenantProcedure.input(deleteDealScoringRuleSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    try {
      await ctx.prismaWithTenant.dealScoringRule.delete({
        where: { id: input.id, tenantId },
      });
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scoring rule not found in this tenant.',
        });
      }
      throw err;
    }
    return { success: true };
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    // Reset wipes the tenant's list — admins author their own rules; no
    // opinionated defaults (spec §Defaults).
    await ctx.prismaWithTenant.dealScoringRule.deleteMany({ where: { tenantId } });
    return [];
  }),
});

// ─── Tags Sub-Router ────────────────────────────────────────────────────────

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.dealTag.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: tenantProcedure.input(createDealTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const flags = await loadDealAutomation(ctx);
    assertCanCreateTag(ctx.user?.role, flags);

    try {
      return await ctx.prismaWithTenant.dealTag.create({
        data: {
          tenantId,
          name: input.name,
          colorToken: input.colorToken ?? 'slate',
          description: input.description,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A deal tag named "${input.name}" already exists.`,
        });
      }
      throw err;
    }
  }),

  update: tenantProcedure.input(updateDealTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { id, ...rest } = input;
    try {
      return await ctx.prismaWithTenant.dealTag.update({
        where: { id, tenantId },
        data: rest,
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A deal tag named "${rest.name}" already exists.`,
        });
      }
      if (isRecordNotFoundError(err)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tag not found in this tenant.',
        });
      }
      throw err;
    }
  }),

  delete: tenantProcedure.input(deleteDealTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    try {
      await ctx.prismaWithTenant.dealTag.delete({
        where: { id: input.id, tenantId },
      });
    } catch (err: unknown) {
      if (isRecordNotFoundError(err)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tag not found in this tenant.',
        });
      }
      throw err;
    }
    return { success: true };
  }),
});

// ─── Automation Sub-Router ──────────────────────────────────────────────────

const automationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.dealAutomationSetting.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    return ctx.prismaWithTenant.dealAutomationSetting.create({
      data: { tenantId, ...DEFAULT_DEAL_AUTOMATION },
    });
  }),

  update: tenantProcedure.input(dealAutomationSettingsSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.dealAutomationSetting.upsert({
      where: { tenantId },
      update: input,
      create: { tenantId, ...input },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.dealAutomationSetting.upsert({
      where: { tenantId },
      update: DEFAULT_DEAL_AUTOMATION,
      create: { tenantId, ...DEFAULT_DEAL_AUTOMATION },
    });
  }),
});

// ─── Top-level Router ───────────────────────────────────────────────────────

export const dealSettingsRouter = createTRPCRouter({
  // Re-export: pipeline stage CRUD is owned by IFC-063. No duplication.
  pipeline: pipelineConfigRouter,
  duplicateRules: duplicateRulesRouter,
  requiredFields: requiredFieldsRouter,
  winLossReasons: winLossReasonsRouter,
  scoringRules: scoringRulesRouter,
  tags: tagsRouter,
  automation: automationRouter,
});
