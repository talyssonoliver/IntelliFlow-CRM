/**
 * Contact Settings Router - PG-182
 *
 * tRPC router for contact duplicate-detection rules, required-field policy,
 * tag vocabulary, and automation settings.
 *
 * Writes that touch more than one row are wrapped in `$transaction` so a
 * failure mid-operation cannot leave a tenant with partial/zero configuration.
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  updateContactDuplicateRulesSchema,
  updateContactRequiredFieldsSchema,
  createContactTagSchema,
  updateContactTagSchema,
  deleteContactTagSchema,
  contactAutomationSettingsSchema,
} from '@intelliflow/validators';
import { assertCanCreateTag, loadContactAutomation } from './contact-automation';

// ─── Defaults (tenant-scoped seed rows) ─────────────────────────────────────

const DEFAULT_DUPLICATE_RULES = [
  { field: 'email', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
  { field: 'phone', matchStrategy: 'normalized', threshold: 100, isActive: true, sortOrder: 1 },
  {
    field: 'name_company',
    matchStrategy: 'fuzzy',
    threshold: 85,
    isActive: false,
    sortOrder: 2,
  },
];

const DEFAULT_REQUIRED_FIELDS: Array<{ fieldKey: string; isRequired: boolean }> = [
  { fieldKey: 'email', isRequired: true },
  { fieldKey: 'phone', isRequired: false },
  { fieldKey: 'company', isRequired: false },
  { fieldKey: 'jobTitle', isRequired: false },
  { fieldKey: 'ownerId', isRequired: false },
];

const DEFAULT_AUTOMATION = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizePhoneNumbers: true,
  autoCapitalizeNames: true,
  preventDeleteWithOpenDeals: true,
  notifyOnOwnerChange: false,
  aiDuplicateDetection: false,
  aiEnrichment: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiAutoReplyDrafting: false,
};

// ─── Duplicate Rules Sub-Router ─────────────────────────────────────────────

const duplicateRulesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.contactDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });

    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.contactDuplicateRule.createMany({
      data: DEFAULT_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
    });

    return ctx.prismaWithTenant.contactDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  updateAll: tenantProcedure
    .input(updateContactDuplicateRulesSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      // Transactional replace: delete + insert must both succeed, or neither
      // persists. Dropping `skipDuplicates` means any (field, matchStrategy)
      // collision the superRefine let through (e.g. race with another writer)
      // surfaces as a Prisma P2002 and we map it to CONFLICT.
      try {
        await ctx.prismaWithTenant.$transaction([
          ctx.prismaWithTenant.contactDuplicateRule.deleteMany({ where: { tenantId } }),
          ctx.prismaWithTenant.contactDuplicateRule.createMany({
            data: input.rules.map((r) => ({ ...r, tenantId })),
          }),
        ]);
      } catch (err: unknown) {
        if (isUniqueConstraintError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'Two rules share the same (field, match strategy) pair. Remove or change one before saving.',
          });
        }
        throw err;
      }

      return ctx.prismaWithTenant.contactDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.contactDuplicateRule.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.contactDuplicateRule.createMany({
        data: DEFAULT_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
      }),
    ]);
    return ctx.prismaWithTenant.contactDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),
});

// ─── Required Fields Sub-Router ─────────────────────────────────────────────

const requiredFieldsRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.contactRequiredField.findMany({
      where: { tenantId },
    });

    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.contactRequiredField.createMany({
      data: DEFAULT_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
    });

    return ctx.prismaWithTenant.contactRequiredField.findMany({
      where: { tenantId },
    });
  }),

  updateAll: tenantProcedure
    .input(updateContactRequiredFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      // NP-056 fix: full-set replacement in 2 statements instead of N upserts.
      // Atomic (single transaction) so a mid-flight failure cannot leave the UI
      // reporting "saved" with partial server state.
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.contactRequiredField.deleteMany({ where: { tenantId } });
        await tx.contactRequiredField.createMany({
          data: input.fields.map((f) => ({
            tenantId,
            fieldKey: f.fieldKey,
            isRequired: f.isRequired,
          })),
        });
      });

      return ctx.prismaWithTenant.contactRequiredField.findMany({
        where: { tenantId },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.contactRequiredField.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.contactRequiredField.createMany({
        data: DEFAULT_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
      }),
    ]);
    return ctx.prismaWithTenant.contactRequiredField.findMany({ where: { tenantId } });
  }),
});

// ─── Tags Sub-Router ────────────────────────────────────────────────────────

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.contactTag.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: tenantProcedure.input(createContactTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const flags = await loadContactAutomation(ctx);
    assertCanCreateTag(ctx, flags);

    try {
      return await ctx.prismaWithTenant.contactTag.create({
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
          message: `A tag named "${input.name}" already exists.`,
        });
      }
      throw err;
    }
  }),

  update: tenantProcedure.input(updateContactTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { id, ...rest } = input;
    try {
      return await ctx.prismaWithTenant.contactTag.update({
        where: { id, tenantId },
        data: rest,
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A tag named "${rest.name}" already exists.`,
        });
      }
      throw err;
    }
  }),

  delete: tenantProcedure.input(deleteContactTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.contactTag.delete({
      where: { id: input.id, tenantId },
    });
    return { success: true };
  }),
});

// ─── Automation Sub-Router ──────────────────────────────────────────────────

const automationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.contactAutomationSetting.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    return ctx.prismaWithTenant.contactAutomationSetting.create({
      data: { tenantId, ...DEFAULT_AUTOMATION },
    });
  }),

  update: tenantProcedure
    .input(contactAutomationSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      return ctx.prismaWithTenant.contactAutomationSetting.upsert({
        where: { tenantId },
        update: input,
        create: { tenantId, ...input },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.contactAutomationSetting.upsert({
      where: { tenantId },
      update: DEFAULT_AUTOMATION,
      create: { tenantId, ...DEFAULT_AUTOMATION },
    });
  }),
});

// ─── Top-level Router ───────────────────────────────────────────────────────

export const contactSettingsRouter = createTRPCRouter({
  duplicateRules: duplicateRulesRouter,
  requiredFields: requiredFieldsRouter,
  tags: tagsRouter,
  automation: automationRouter,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string };
  return e.code === 'P2002';
}
