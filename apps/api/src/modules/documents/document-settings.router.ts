/**
 * Document Settings Router - PG-186
 *
 * tRPC router for document file types, size limits, antivirus,
 * retention policy, and automation toggles. Follows the PG-182/PG-183
 * settings-router pattern: tenantProcedure + lazy-init defaults on first get.
 */

import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  documentFileTypeConfigSchema,
  documentSizeLimitConfigSchema,
  documentAntivirusConfigSchema,
  documentRetentionPolicySchema,
  documentAutomationSettingsSchema,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  DEFAULT_ALLOWED_MIME_TYPES,
} from '@intelliflow/validators';
import { AUTOMATION_FACTORY_DEFAULTS } from './document-automation';

// ─── Defaults (tenant-scoped seed rows) ─────────────────────────────────────

const FILE_TYPE_DEFAULTS = {
  allowedExtensions: [...DEFAULT_ALLOWED_EXTENSIONS],
  blockedExtensions: [...DEFAULT_BLOCKED_EXTENSIONS],
  allowedMimeTypes: [...DEFAULT_ALLOWED_MIME_TYPES],
};

const SIZE_LIMIT_DEFAULTS = {
  maxFileSizeMB: 100,
  maxTotalStorageMB: 10240,
  maxFilesPerUpload: 20,
};

const ANTIVIRUS_DEFAULTS = {
  enableAntivirusScan: true,
  quarantineInfected: true,
  notifyAdminOnThreat: true,
};

const RETENTION_DEFAULTS = {
  retentionDays: 365,
  archiveInsteadOfDelete: true,
  preserveVersions: 5,
  isActive: false,
};

// ─── File Types Sub-Router ──────────────────────────────────────────────────

const fileTypesRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentFileTypeConfig.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;
    return ctx.prismaWithTenant.documentFileTypeConfig.create({
      data: { tenantId, ...FILE_TYPE_DEFAULTS },
    });
  }),

  update: tenantProcedure.input(documentFileTypeConfigSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentFileTypeConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: { ...input },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentFileTypeConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...FILE_TYPE_DEFAULTS },
      update: { ...FILE_TYPE_DEFAULTS },
    });
  }),
});

// ─── Size Limits Sub-Router ─────────────────────────────────────────────────

const sizeLimitsRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentSizeLimitConfig.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;
    return ctx.prismaWithTenant.documentSizeLimitConfig.create({
      data: { tenantId, ...SIZE_LIMIT_DEFAULTS },
    });
  }),

  update: tenantProcedure.input(documentSizeLimitConfigSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentSizeLimitConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: { ...input },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentSizeLimitConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...SIZE_LIMIT_DEFAULTS },
      update: { ...SIZE_LIMIT_DEFAULTS },
    });
  }),
});

// ─── Antivirus Sub-Router ───────────────────────────────────────────────────

const antivirusRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentAntivirusConfig.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;
    return ctx.prismaWithTenant.documentAntivirusConfig.create({
      data: { tenantId, ...ANTIVIRUS_DEFAULTS },
    });
  }),

  update: tenantProcedure.input(documentAntivirusConfigSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentAntivirusConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: { ...input },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentAntivirusConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...ANTIVIRUS_DEFAULTS },
      update: { ...ANTIVIRUS_DEFAULTS },
    });
  }),
});

// ─── Retention Policy Sub-Router ────────────────────────────────────────────

const retentionRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.documentRetentionPolicy.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;
    return ctx.prismaWithTenant.documentRetentionPolicy.create({
      data: { tenantId, ...RETENTION_DEFAULTS },
    });
  }),

  update: tenantProcedure.input(documentRetentionPolicySchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentRetentionPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: { ...input },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentRetentionPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...RETENTION_DEFAULTS },
      update: { ...RETENTION_DEFAULTS },
    });
  }),
});

// ─── Automation Sub-Router ──────────────────────────────────────────────────

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
        update: { ...input },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.documentAutomationSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...AUTOMATION_FACTORY_DEFAULTS },
      update: { ...AUTOMATION_FACTORY_DEFAULTS },
    });
  }),
});

// ─── Top-level Router ───────────────────────────────────────────────────────

export const documentSettingsRouter = createTRPCRouter({
  fileTypes: fileTypesRouter,
  sizeLimits: sizeLimitsRouter,
  antivirus: antivirusRouter,
  retention: retentionRouter,
  automation: automationRouter,
});
