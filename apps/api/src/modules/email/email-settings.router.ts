/**
 * Email Settings Router — PG-207 (Module Settings: Email, ADR-085).
 *
 * Tenant-wide email settings (company-mailbox fallback, reply-to, tracking —
 * which takes effect with IFC-221 — and bounce rules) plus the suppression
 * list. Every member can read the settings (secret-free); only
 * EMAIL_SETTINGS_ADMIN_ROLES change them, and only they see the suppression
 * list (email addresses are PII). Reset restores the tenant settings only:
 * mailboxes, signatures and suppressions are never touched by it.
 * `prismaWithTenant` does not inject tenantId, so it is passed explicitly.
 */
import { TRPCError } from '@trpc/server';
import { EMAIL_SETTINGS_DEFAULTS } from '@intelliflow/domain';
import {
  addSuppressionInputSchema,
  listSuppressionsInputSchema,
  removeSuppressionInputSchema,
  updateEmailSettingsInputSchema,
  type EmailSettingsDto,
  type SuppressionDto,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext } from '../../security/tenant-context';
import {
  assertEmailAdmin,
  auditEmail,
  isEmailAdmin,
  prismaErrorCode,
  type EmailRouterCtx,
  type EmailAuditResource,
} from './email-access';
import { settingsValues, toEmailSettingsDto, toSuppressionDto } from './email-dto';

const RESOURCE: EmailAuditResource = 'email_settings';
const SUPPRESSION_SELECT = { id: true, email: true, reason: true, source: true, createdAt: true };

async function buildSettingsDto(ctx: EmailRouterCtx, row: unknown): Promise<EmailSettingsDto> {
  const tenantId = ctx.tenant.tenantId;
  const company: { fromAddress: string } | null = await ctx.prismaWithTenant.emailMailbox.findFirst(
    {
      where: { tenantId, scope: 'TENANT', status: 'ACTIVE' },
      select: { fromAddress: true },
    }
  );
  const canEdit = isEmailAdmin(ctx);
  const values = settingsValues(row as never);
  return toEmailSettingsDto(row as never, {
    canEdit,
    companyMailboxAvailable: company !== null,
    // Members see which address their mail would leave from only when the fallback is on.
    companyMailboxAddress:
      company && (canEdit || values.allowTenantMailboxFallback) ? company.fromAddress : null,
  });
}

const suppressionRouter = createTRPCRouter({
  list: tenantProcedure
    .input(listSuppressionsInputSchema)
    .query(
      async ({ ctx, input }): Promise<{ items: SuppressionDto[]; nextCursor: string | null }> => {
        assertTenantContext(ctx);
        const c = ctx as unknown as EmailRouterCtx;
        assertEmailAdmin(c, 'email_suppression', 'list');
        const limit = input?.limit ?? 50;
        const rows = await c.prismaWithTenant.emailSuppression.findMany({
          where: { tenantId: c.tenant.tenantId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          select: SUPPRESSION_SELECT,
        });
        const items = rows.slice(0, limit).map(toSuppressionDto);
        // The next page reads after the last row shown (cursor + skip 1), so the
        // cursor is that row — not the first unshown one, which would be skipped.
        const more = rows.length > limit;
        return { items, nextCursor: more ? (rows[limit - 1].id as string) : null };
      }
    ),

  add: tenantProcedure
    .input(addSuppressionInputSchema)
    .mutation(async ({ ctx, input }): Promise<SuppressionDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertEmailAdmin(c, 'email_suppression', 'add');
      try {
        const row = await c.prismaWithTenant.emailSuppression.create({
          data: {
            tenantId: c.tenant.tenantId,
            email: input.email,
            reason: 'MANUAL',
            source: 'MANUAL',
            createdById: c.tenant.userId,
          },
        });
        auditEmail(c, 'CREATE', 'email_suppression', row.id, { reason: 'MANUAL' });
        return toSuppressionDto(row);
      } catch (err) {
        if (prismaErrorCode(err) === 'P2002') {
          throw new TRPCError({ code: 'CONFLICT', message: 'This address is already suppressed.' });
        }
        throw err;
      }
    }),

  remove: tenantProcedure
    .input(removeSuppressionInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ removed: true }> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertEmailAdmin(c, 'email_suppression', 'remove');
      const tenantId = c.tenant.tenantId;
      await c.prismaWithTenant.$transaction(async (tx: any) => {
        const row = await tx.emailSuppression.findFirst({
          where: { id: input.id, tenantId },
          select: { id: true, email: true },
        });
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Suppression not found' });
        await tx.emailSuppression.delete({ where: { id: row.id } });
        // Soft bounces before the removal no longer count toward a new suppression (CA-15).
        await tx.emailBounceReceipt.updateMany({
          where: { tenantId, recipient: row.email, excludedFromCount: false },
          data: { excludedFromCount: true },
        });
      });
      auditEmail(c, 'DELETE', 'email_suppression', input.id, { reason: 'removed by admin' });
      return { removed: true };
    }),
});

export const emailSettingsRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }): Promise<EmailSettingsDto> => {
    assertTenantContext(ctx);
    const c = ctx as unknown as EmailRouterCtx;
    const row = await c.prismaWithTenant.tenantEmailSettings.findUnique({
      where: { tenantId: c.tenant.tenantId },
    });
    return buildSettingsDto(c, row);
  }),

  update: tenantProcedure
    .input(updateEmailSettingsInputSchema)
    .mutation(async ({ ctx, input }): Promise<EmailSettingsDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      assertEmailAdmin(c, RESOURCE, 'update');
      const tenantId = c.tenant.tenantId;
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) data[key] = value;
      }
      const row = await c.prismaWithTenant.tenantEmailSettings.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      auditEmail(c, 'UPDATE', RESOURCE, tenantId, { changedFields: Object.keys(data) });
      return buildSettingsDto(c, row);
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }): Promise<EmailSettingsDto> => {
    assertTenantContext(ctx);
    const c = ctx as unknown as EmailRouterCtx;
    assertEmailAdmin(c, RESOURCE, 'resetToDefaults');
    const tenantId = c.tenant.tenantId;
    const defaults = { ...EMAIL_SETTINGS_DEFAULTS };
    const row = await c.prismaWithTenant.$transaction(async (tx: any) =>
      tx.tenantEmailSettings.upsert({
        where: { tenantId },
        create: { tenantId, ...defaults },
        update: defaults,
      })
    );
    auditEmail(c, 'UPDATE', RESOURCE, tenantId, { reset: true });
    return buildSettingsDto(c, row);
  }),

  suppression: suppressionRouter,
});
