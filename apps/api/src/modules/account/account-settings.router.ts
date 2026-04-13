/**
 * Account Settings Router - PG-183
 *
 * tRPC router for account hierarchy config, industry taxonomy, and
 * custom fields. Uses direct Prisma access via `tenantProcedure`
 * (mirrors leadSettingsRouter pattern).
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  accountHierarchyConfigSchema,
  createAccountIndustryOptionSchema,
  updateAccountIndustryOptionSchema,
  deleteAccountIndustryOptionSchema,
  createAccountCustomFieldSchema,
  updateAccountCustomFieldSchema,
  deleteAccountCustomFieldSchema,
  generateIndustryKey,
  DEFAULT_ACCOUNT_INDUSTRIES,
} from '@intelliflow/validators';

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateFieldKey(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HIERARCHY_DEFAULTS = {
  maxDepth: 5,
  requireParentForTiers: [] as string[],
  preventCycles: true,
};

// ─── Hierarchy Sub-Router ───────────────────────────────────────────────────

const hierarchyRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.accountHierarchyConfig.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    return ctx.prismaWithTenant.accountHierarchyConfig.create({
      data: { tenantId, ...HIERARCHY_DEFAULTS },
    });
  }),

  update: tenantProcedure.input(accountHierarchyConfigSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.accountHierarchyConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: input,
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.accountHierarchyConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...HIERARCHY_DEFAULTS },
      update: HIERARCHY_DEFAULTS,
    });
  }),
});

// ─── Industry Sub-Router ────────────────────────────────────────────────────

const industryRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.accountIndustryOption.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  create: tenantProcedure
    .input(createAccountIndustryOptionSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const key = generateIndustryKey(input.label);
      if (key.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Label must contain at least one alphanumeric character',
        });
      }

      const conflict = await ctx.prismaWithTenant.accountIndustryOption.findUnique({
        where: { tenantId_key: { tenantId, key } },
      });
      if (conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `An industry with key "${key}" already exists`,
        });
      }

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const maxSort = await ctx.prismaWithTenant.accountIndustryOption.aggregate({
          where: { tenantId },
          _max: { sortOrder: true },
        });
        sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
      }

      return ctx.prismaWithTenant.accountIndustryOption.create({
        data: {
          tenantId,
          label: input.label,
          key,
          sortOrder,
          isActive: input.isActive ?? true,
        },
      });
    }),

  update: tenantProcedure
    .input(updateAccountIndustryOptionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const tenantId = ctx.tenant.tenantId;
      const existing = await ctx.prismaWithTenant.accountIndustryOption.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Industry option not found' });
      }
      // Key is immutable — only label/sortOrder/isActive are updatable.
      return ctx.prismaWithTenant.accountIndustryOption.update({
        where: { id },
        data: rest,
      });
    }),

  delete: tenantProcedure
    .input(deleteAccountIndustryOptionSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const existing = await ctx.prismaWithTenant.accountIndustryOption.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Industry option not found' });
      }

      const referenced = await ctx.prismaWithTenant.account.count({
        where: { tenantId, industry: existing.label },
      });

      if (referenced > 0) {
        const updated = await ctx.prismaWithTenant.accountIndustryOption.update({
          where: { id: input.id },
          data: { isActive: false },
        });
        return { softDeleted: true, record: updated };
      }

      await ctx.prismaWithTenant.accountIndustryOption.delete({ where: { id: input.id } });
      return { softDeleted: false, record: existing };
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;

    return ctx.prismaWithTenant.$transaction(async (tx) => {
      // Upsert canonical industries
      for (let i = 0; i < DEFAULT_ACCOUNT_INDUSTRIES.length; i += 1) {
        const { label, key } = DEFAULT_ACCOUNT_INDUSTRIES[i];
        await tx.accountIndustryOption.upsert({
          where: { tenantId_key: { tenantId, key } },
          create: {
            tenantId,
            label,
            key,
            sortOrder: i,
            isActive: true,
          },
          update: {
            label,
            sortOrder: i,
            isActive: true,
          },
        });
      }

      // Deactivate any non-canonical entries
      const canonicalKeys = DEFAULT_ACCOUNT_INDUSTRIES.map((d) => d.key);
      await tx.accountIndustryOption.updateMany({
        where: { tenantId, key: { notIn: canonicalKeys } },
        data: { isActive: false },
      });

      return tx.accountIndustryOption.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }),
});

// ─── Custom Fields Sub-Router ───────────────────────────────────────────────

const customFieldsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.accountCustomField.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  create: tenantProcedure.input(createAccountCustomFieldSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const fieldKey = generateFieldKey(input.fieldName);
    if (fieldKey.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Field name must contain at least one alphanumeric character',
      });
    }

    const existing = await ctx.prismaWithTenant.accountCustomField.findUnique({
      where: { tenantId_fieldKey: { tenantId, fieldKey } },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `A field with key "${fieldKey}" already exists`,
      });
    }

    const maxSort = await ctx.prismaWithTenant.accountCustomField.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    return ctx.prismaWithTenant.accountCustomField.create({
      data: {
        tenantId,
        fieldName: input.fieldName,
        fieldKey,
        dataType: input.dataType,
        options: input.options ?? undefined,
        isRequired: input.isRequired ?? false,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }),

  update: tenantProcedure.input(updateAccountCustomFieldSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.accountCustomField.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom field not found' });
    }

    return ctx.prismaWithTenant.accountCustomField.update({
      where: { id },
      data: {
        fieldName: data.fieldName,
        dataType: data.dataType,
        options: data.options ?? undefined,
        isRequired: data.isRequired ?? existing.isRequired,
      },
    });
  }),

  delete: tenantProcedure.input(deleteAccountCustomFieldSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.accountCustomField.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom field not found' });
    }
    return ctx.prismaWithTenant.accountCustomField.update({
      where: { id: input.id },
      data: { isActive: false },
    });
  }),
});

// ─── Combined Export ────────────────────────────────────────────────────────

export const accountSettingsRouter = createTRPCRouter({
  hierarchy: hierarchyRouter,
  industry: industryRouter,
  customFields: customFieldsRouter,
});
