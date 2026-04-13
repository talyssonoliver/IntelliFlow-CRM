/**
 * Contact Settings Router - PG-182
 *
 * tRPC router for contact duplicate-detection rules, required-field policy,
 * tag vocabulary, and automation settings.
 *
 * Uses direct Prisma access (ticketConfigRouter / leadSettingsRouter pattern).
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  updateContactDuplicateRulesSchema,
  updateContactRequiredFieldsSchema,
  createContactTagSchema,
  updateContactTagSchema,
  deleteContactTagSchema,
  contactAutomationSettingsSchema,
} from '@intelliflow/validators';

// ─── Defaults ───────────────────────────────────────────────────────────────

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
      skipDuplicates: true,
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

      await ctx.prismaWithTenant.contactDuplicateRule.deleteMany({
        where: { tenantId },
      });

      await ctx.prismaWithTenant.contactDuplicateRule.createMany({
        data: input.rules.map((r) => ({ ...r, tenantId })),
        skipDuplicates: true,
      });

      return ctx.prismaWithTenant.contactDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.contactDuplicateRule.deleteMany({ where: { tenantId } });
    await ctx.prismaWithTenant.contactDuplicateRule.createMany({
      data: DEFAULT_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
    });
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
      skipDuplicates: true,
    });

    return ctx.prismaWithTenant.contactRequiredField.findMany({
      where: { tenantId },
    });
  }),

  updateAll: tenantProcedure
    .input(updateContactRequiredFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      await Promise.all(
        input.fields.map((f) =>
          ctx.prismaWithTenant.contactRequiredField.upsert({
            where: { tenantId_fieldKey: { tenantId, fieldKey: f.fieldKey } },
            update: { isRequired: f.isRequired },
            create: { tenantId, fieldKey: f.fieldKey, isRequired: f.isRequired },
          })
        )
      );

      return ctx.prismaWithTenant.contactRequiredField.findMany({
        where: { tenantId },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.contactRequiredField.deleteMany({ where: { tenantId } });
    await ctx.prismaWithTenant.contactRequiredField.createMany({
      data: DEFAULT_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
    });
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

// Export default inputs for tests.
export const __DEFAULT_DUPLICATE_RULES = DEFAULT_DUPLICATE_RULES;
export const __DEFAULT_REQUIRED_FIELDS = DEFAULT_REQUIRED_FIELDS;
export const __DEFAULT_AUTOMATION = DEFAULT_AUTOMATION;

// Silence unused import (z reserved for future Zod transforms).
void z;
