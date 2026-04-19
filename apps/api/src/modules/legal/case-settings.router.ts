import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { updateCaseSettingsSchema } from '@intelliflow/validators';
import { assertTenantContext } from '../../security/tenant-context';

const DEFAULT_SETTINGS = {
  casePrefix: 'CASE-',
  defaultPriority: 'MEDIUM' as const,
  autoAssignEnabled: false,
  autoAssignUserId: null,
} as const;

const USER_SELECT = { select: { id: true, name: true, email: true } };

export const caseSettingsRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_SETTINGS },
      update: {},
      include: { autoAssignUser: USER_SELECT },
    });
  }),

  update: tenantProcedure.input(updateCaseSettingsSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_SETTINGS, ...input },
      update: input,
      include: { autoAssignUser: USER_SELECT },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.caseSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_SETTINGS },
      update: DEFAULT_SETTINGS,
    });
  }),
});
