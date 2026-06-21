/**
 * Document Settings Router - PG-186
 *
 * tRPC router for document file-type config, antivirus settings, duplicate
 * detection rules, required fields, tags, automation toggles, and retention
 * policies. Uses direct Prisma access via `tenantProcedure` (mirrors
 * accountSettingsRouter pattern).
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, moduleTenantProcedure } from '../../trpc';
import {
  documentGeneralConfigSchema,
  updateDocumentDuplicateRulesSchema,
  updateDocumentRequiredFieldsSchema,
  createDocumentTagSchema,
  updateDocumentTagSchema,
  deleteDocumentTagSchema,
  createDocumentTypeDefinitionSchema,
  updateDocumentTypeDefinitionSchema,
  deleteDocumentTypeDefinitionSchema,
  documentAutomationSettingsSchema,
  updateDocumentRetentionPoliciesSchema,
} from '@intelliflow/validators';
import {
  loadDocumentAutomation,
  assertCanCreateDocumentTag,
  AUTOMATION_FACTORY_DEFAULTS,
} from './document-automation';

// LEGAL is a Professional+ paid add-on (MODULE_PLAN_MAP). Gate every procedure on
// the tenant's plan including the module — same pattern as documents.router.ts.
// Without this a lower-tier tenant could call these endpoints directly and bypass
// the paywall (the frontend <ModuleGate> only hides the UI, not the API).
const tenantProcedure = moduleTenantProcedure('LEGAL');

// ─── Factory Defaults ────────────────────────────────────────────────────────

const DEFAULT_GENERAL = {
  allowedMimeTypes: [] as string[],
  maxUploadSizeMb: 50,
  defaultRetentionDays: 365,
  enableAntivirusScan: true,
  quarantineOnDetect: true,
  blockOnScanFailure: true,
};

const DEFAULT_DUPLICATE_RULES = [
  {
    field: 'content_hash',
    matchStrategy: 'exact',
    collisionAction: 'warn',
    isActive: true,
    sortOrder: 0,
  },
  {
    field: 'filename_normalized',
    matchStrategy: 'normalized',
    collisionAction: 'warn',
    isActive: true,
    sortOrder: 1,
  },
];

const DEFAULT_REQUIRED_FIELDS = [
  { fieldKey: 'title', isRequired: true },
  { fieldKey: 'description', isRequired: false },
  { fieldKey: 'category', isRequired: false },
  { fieldKey: 'tags', isRequired: false },
  { fieldKey: 'expiresAt', isRequired: false },
];

const DEFAULT_RETENTION_POLICIES = [
  {
    categoryKey: 'default',
    retentionDays: 365,
    autoArchive: false,
    legalHoldOverride: false,
  },
];

// ─── General Sub-Router ──────────────────────────────────────────────────────

const generalRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentGeneralConfig.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    return ctx.prismaWithTenant.documentGeneralConfig.create({
      data: { tenantId, ...DEFAULT_GENERAL },
    });
  }),

  update: tenantProcedure.input(documentGeneralConfigSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentGeneralConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: input,
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentGeneralConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_GENERAL },
      update: DEFAULT_GENERAL,
    });
  }),
});

// ─── Duplicate Rules Sub-Router ──────────────────────────────────────────────

const duplicateRulesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.documentDuplicateRule.createMany({
        data: DEFAULT_DUPLICATE_RULES.map((rule) => ({ ...rule, tenantId })),
      });
    });
    return ctx.prismaWithTenant.documentDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  updateAll: tenantProcedure
    .input(updateDocumentDuplicateRulesSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.documentDuplicateRule.deleteMany({ where: { tenantId } });
        await tx.documentDuplicateRule.createMany({
          data: input.rules.map((rule) => ({ ...rule, tenantId })),
        });
      });
      return ctx.prismaWithTenant.documentDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.documentDuplicateRule.deleteMany({ where: { tenantId } });
      await tx.documentDuplicateRule.createMany({
        data: DEFAULT_DUPLICATE_RULES.map((rule) => ({ ...rule, tenantId })),
      });
    });
    return ctx.prismaWithTenant.documentDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),
});

// ─── Required Fields Sub-Router ──────────────────────────────────────────────

const requiredFieldsRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentRequiredField.findMany({
      where: { tenantId },
      orderBy: { fieldKey: 'asc' },
    });
    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await Promise.all(
        DEFAULT_REQUIRED_FIELDS.map((field) =>
          tx.documentRequiredField.upsert({
            where: { tenantId_fieldKey: { tenantId, fieldKey: field.fieldKey } },
            create: { tenantId, ...field },
            update: { isRequired: field.isRequired },
          })
        )
      );
    });
    return ctx.prismaWithTenant.documentRequiredField.findMany({
      where: { tenantId },
      orderBy: { fieldKey: 'asc' },
    });
  }),

  updateAll: tenantProcedure
    .input(updateDocumentRequiredFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      return ctx.prismaWithTenant.$transaction(async (tx) => {
        // NP-026 fix: full-set replacement in 2 statements instead of N upserts.
        await tx.documentRequiredField.deleteMany({ where: { tenantId } });
        await tx.documentRequiredField.createMany({
          data: input.fields.map((field) => ({ tenantId, ...field })),
        });
        return tx.documentRequiredField.findMany({
          where: { tenantId },
          orderBy: { fieldKey: 'asc' },
        });
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.$transaction(async (tx) => {
      const results = await Promise.all(
        DEFAULT_REQUIRED_FIELDS.map((field) =>
          tx.documentRequiredField.upsert({
            where: { tenantId_fieldKey: { tenantId, fieldKey: field.fieldKey } },
            create: { tenantId, ...field },
            update: { isRequired: field.isRequired },
          })
        )
      );
      return results;
    });
  }),
});

// ─── Tags Sub-Router ─────────────────────────────────────────────────────────

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.documentTag.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  create: tenantProcedure.input(createDocumentTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const flags = await loadDocumentAutomation(ctx);
    assertCanCreateDocumentTag(ctx, flags);

    // If a soft-deleted row already owns this (tenantId, name), reactivate
    // it instead of hitting the unique-constraint failure. This keeps the
    // "delete when unreferenced / soft-delete when referenced" contract
    // honest: users can always recreate a tag name they previously removed.
    const existing = await ctx.prismaWithTenant.documentTag.findFirst({
      where: { tenantId, name: input.name },
    });
    if (existing && !existing.isActive) {
      return ctx.prismaWithTenant.documentTag.update({
        where: { id: existing.id },
        data: { ...input, isActive: true },
      });
    }

    return ctx.prismaWithTenant.documentTag.create({
      data: { tenantId, ...input },
    });
  }),

  update: tenantProcedure.input(updateDocumentTagSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const tenantId = ctx.tenant.tenantId;

    const existing = await ctx.prismaWithTenant.documentTag.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
    }

    return ctx.prismaWithTenant.documentTag.update({
      where: { id },
      data,
    });
  }),

  delete: tenantProcedure.input(deleteDocumentTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const existing = await ctx.prismaWithTenant.documentTag.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
    }

    // Spec §4.3: hard-delete when no document still references the tag
    // name, soft-delete when at least one does. CaseDocument stores tags
    // as a String[] (not a FK), so we count membership via Postgres
    // array-contains (`tags ? name`). Running inside a $transaction keeps
    // the reference check + write atomic across concurrent uploads.
    const result = await ctx.prismaWithTenant.$transaction(async (tx) => {
      const referencingCount = await tx.caseDocument.count({
        where: { tenantId, tags: { has: existing.name } },
      });

      if (referencingCount === 0) {
        const tag = await tx.documentTag.delete({ where: { id: input.id } });
        return { softDeleted: false as const, tag };
      }

      const tag = await tx.documentTag.update({
        where: { id: input.id },
        data: { isActive: false },
      });
      return { softDeleted: true as const, tag };
    });

    return result;
  }),
});

// ─── Custom Document Types Sub-Router ────────────────────────────────────────

const documentTypesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prismaWithTenant.documentTypeDefinition.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: tenantProcedure
    .input(createDocumentTypeDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      return ctx.prismaWithTenant.documentTypeDefinition.create({
        data: { tenantId, ...input },
      });
    }),

  update: tenantProcedure
    .input(updateDocumentTypeDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const tenantId = ctx.tenant.tenantId;

      const existing = await ctx.prismaWithTenant.documentTypeDefinition.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document type not found' });
      }

      return ctx.prismaWithTenant.documentTypeDefinition.update({
        where: { id },
        data,
      });
    }),

  delete: tenantProcedure
    .input(deleteDocumentTypeDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      const existing = await ctx.prismaWithTenant.documentTypeDefinition.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document type not found' });
      }

      return ctx.prismaWithTenant.documentTypeDefinition.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),
});

// ─── Automation Sub-Router ───────────────────────────────────────────────────

const automationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentAutomationSetting.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    return ctx.prismaWithTenant.documentAutomationSetting.create({
      data: { tenantId, ...AUTOMATION_FACTORY_DEFAULTS },
    });
  }),

  update: tenantProcedure
    .input(documentAutomationSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      return ctx.prismaWithTenant.documentAutomationSetting.upsert({
        where: { tenantId },
        create: { tenantId, ...input },
        update: input,
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentAutomationSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...AUTOMATION_FACTORY_DEFAULTS },
      update: AUTOMATION_FACTORY_DEFAULTS,
    });
  }),
});

// ─── Retention Policies Sub-Router ──────────────────────────────────────────

const retentionPoliciesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentRetentionPolicy.findMany({
      where: { tenantId },
      orderBy: { categoryKey: 'asc' },
    });
    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.documentRetentionPolicy.createMany({
        data: DEFAULT_RETENTION_POLICIES.map((policy) => ({ ...policy, tenantId })),
      });
    });
    return ctx.prismaWithTenant.documentRetentionPolicy.findMany({
      where: { tenantId },
      orderBy: { categoryKey: 'asc' },
    });
  }),

  updateAll: tenantProcedure
    .input(updateDocumentRetentionPoliciesSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.documentRetentionPolicy.deleteMany({ where: { tenantId } });
        await tx.documentRetentionPolicy.createMany({
          data: input.policies.map((policy) => ({ ...policy, tenantId })),
        });
      });
      return ctx.prismaWithTenant.documentRetentionPolicy.findMany({
        where: { tenantId },
        orderBy: { categoryKey: 'asc' },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.documentRetentionPolicy.deleteMany({ where: { tenantId } });
      await tx.documentRetentionPolicy.createMany({
        data: DEFAULT_RETENTION_POLICIES.map((policy) => ({ ...policy, tenantId })),
      });
    });
    return ctx.prismaWithTenant.documentRetentionPolicy.findMany({
      where: { tenantId },
      orderBy: { categoryKey: 'asc' },
    });
  }),
});

// ─── Root Router ─────────────────────────────────────────────────────────────

export const documentSettingsRouter = createTRPCRouter({
  general: generalRouter,
  duplicateRules: duplicateRulesRouter,
  requiredFields: requiredFieldsRouter,
  tags: tagsRouter,
  documentTypes: documentTypesRouter,
  automation: automationRouter,
  retentionPolicies: retentionPoliciesRouter,
});
