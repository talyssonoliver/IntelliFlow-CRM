/**
 * Case Settings Router — PG-190 v2.
 *
 * Five sub-routers under `caseSettings`:
 *   general        — case prefix, default priority, auto-assign (v1)
 *   duplicateRules — CaseDuplicateRule[]  (CRUD-via-replace per sibling pattern)
 *   requiredFields — CaseRequiredField[]  (CRUD-via-replace)
 *   tags           — CaseTag[]            (list / create / update / delete)
 *   automation     — CaseAutomationSetting singleton (get / update / resetToDefaults)
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  updateCaseSettingsSchema,
  updateCaseDuplicateRulesSchema,
  updateCaseRequiredFieldsSchema,
  createCaseTagSchema,
  updateCaseTagSchema,
  deleteCaseTagSchema,
  updateCaseAutomationSettingsSchema,
  DEFAULT_CASE_AUTOMATION,
  DEFAULT_CASE_DUPLICATE_RULES,
  DEFAULT_CASE_REQUIRED_FIELDS,
} from '@intelliflow/validators';
import { assertTenantContext } from '../../security/tenant-context';
import { loadCaseAutomation, assertCanCreateTag } from './case-automation';

// ─── General ────────────────────────────────────────────────────────────────

const GENERAL_DEFAULTS = {
  casePrefix: 'CASE-',
  defaultPriority: 'MEDIUM' as const,
  autoAssignEnabled: false,
  autoAssignUserId: null,
} as const;

const USER_SELECT = { select: { id: true, name: true, email: true } };

const generalRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...GENERAL_DEFAULTS },
      update: {},
      include: { autoAssignUser: USER_SELECT },
    });
  }),

  update: tenantProcedure.input(updateCaseSettingsSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const normalized = {
      ...input,
      autoAssignUserId: input.autoAssignEnabled ? input.autoAssignUserId : null,
    };
    return ctx.prismaWithTenant.caseSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...GENERAL_DEFAULTS, ...normalized },
      update: normalized,
      include: { autoAssignUser: USER_SELECT },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...GENERAL_DEFAULTS },
      update: GENERAL_DEFAULTS,
    });
  }),
});

// ─── Duplicate Rules ────────────────────────────────────────────────────────

const duplicateRulesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.caseDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length > 0) return existing;
    // Seed with defaults on first read (matches peer sibling pattern)
    await ctx.prismaWithTenant.caseDuplicateRule.createMany({
      data: DEFAULT_CASE_DUPLICATE_RULES.map((r) => ({ tenantId, ...r })),
    });
    return ctx.prismaWithTenant.caseDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  update: tenantProcedure.input(updateCaseDuplicateRulesSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.caseDuplicateRule.deleteMany({ where: { tenantId } });
      if (input.rules.length > 0) {
        await tx.caseDuplicateRule.createMany({
          data: input.rules.map((r) => ({ tenantId, ...r })),
        });
      }
      return tx.caseDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.caseDuplicateRule.deleteMany({ where: { tenantId } });
      await tx.caseDuplicateRule.createMany({
        data: DEFAULT_CASE_DUPLICATE_RULES.map((r) => ({ tenantId, ...r })),
      });
      return tx.caseDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }),
});

// ─── Required Fields ────────────────────────────────────────────────────────

const requiredFieldsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.caseRequiredField.findMany({
      where: { tenantId },
    });
    if (existing.length > 0) return existing;
    await ctx.prismaWithTenant.caseRequiredField.createMany({
      data: DEFAULT_CASE_REQUIRED_FIELDS.map((f) => ({ tenantId, ...f })),
    });
    return ctx.prismaWithTenant.caseRequiredField.findMany({ where: { tenantId } });
  }),

  update: tenantProcedure.input(updateCaseRequiredFieldsSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.$transaction(async (tx) => {
      for (const f of input.fields) {
        await tx.caseRequiredField.upsert({
          where: { tenantId_fieldKey: { tenantId, fieldKey: f.fieldKey } },
          create: { tenantId, ...f },
          update: { isRequired: f.isRequired },
        });
      }
      return tx.caseRequiredField.findMany({ where: { tenantId } });
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.caseRequiredField.deleteMany({ where: { tenantId } });
      await tx.caseRequiredField.createMany({
        data: DEFAULT_CASE_REQUIRED_FIELDS.map((f) => ({ tenantId, ...f })),
      });
      return tx.caseRequiredField.findMany({ where: { tenantId } });
    });
  }),
});

// ─── Tags ───────────────────────────────────────────────────────────────────

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseTag.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: tenantProcedure.input(createCaseTagSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    // Wire the `restrictTagCreationToAdmins` toggle — loaded per-request so
    // the enforcement flips immediately when an admin changes the setting.
    const flags = await loadCaseAutomation(ctx);
    assertCanCreateTag(ctx, flags);
    return ctx.prismaWithTenant.caseTag.create({
      data: {
        tenantId,
        name: input.name,
        colorToken: input.colorToken,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }),

  update: tenantProcedure.input(updateCaseTagSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const { id, ...rest } = input;
    const existing = await ctx.prismaWithTenant.caseTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
    // tenant check done by the findFirst above; RLS is the real enforcement.
    return ctx.prismaWithTenant.caseTag.update({
      where: { id },
      data: rest,
    });
  }),

  delete: tenantProcedure.input(deleteCaseTagSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.caseTag.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
    await ctx.prismaWithTenant.caseTag.delete({ where: { id: input.id } });
    return { success: true };
  }),
});

// ─── Automation ─────────────────────────────────────────────────────────────

const automationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseAutomationSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_CASE_AUTOMATION },
      update: {},
    });
  }),

  update: tenantProcedure
    .input(updateCaseAutomationSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      const tenantId = ctx.tenant.tenantId;
      return ctx.prismaWithTenant.caseAutomationSetting.upsert({
        where: { tenantId },
        create: { tenantId, ...DEFAULT_CASE_AUTOMATION, ...input },
        update: input,
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseAutomationSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_CASE_AUTOMATION },
      update: DEFAULT_CASE_AUTOMATION,
    });
  }),
});

// ─── Combined router ────────────────────────────────────────────────────────

export const caseSettingsRouter = createTRPCRouter({
  general: generalRouter,
  duplicateRules: duplicateRulesRouter,
  requiredFields: requiredFieldsRouter,
  tags: tagsRouter,
  automation: automationRouter,
});
