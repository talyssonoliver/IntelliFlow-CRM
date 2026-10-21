/**
 * Email Signatures Router — PG-207 (owner rulings Q2, Q5).
 *
 * Users manage their own signatures (scope USER, owner from ctx — never from
 * input); EMAIL_SETTINGS_ADMIN_ROLES manage the organisation's (scope ORG).
 * Names are unique per owner scope: the shared `buildSignatureNameSchema`
 * superRefine runs against the stored names, and the DB unique index catches
 * a race (P2002 → CONFLICT). One default per owner scope, swapped inside a
 * transaction. HTML is sanitised on save and again in `resolveDefault`, which
 * feeds the compose prefill (the server never appends a signature to mail).
 */
import { TRPCError } from '@trpc/server';
import { EMAIL_LIMITS, resolveDefaultSignature } from '@intelliflow/domain';
import {
  buildSignatureNameSchema,
  createEmailSignatureInputSchema,
  deleteSignatureInputSchema,
  setDefaultSignatureInputSchema,
  updateEmailSignatureInputSchema,
  type EmailSignatureDto,
  type EmailSignatureListDto,
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
import { toSignatureDto } from './email-dto';
import { sanitizeSignatureHtml } from './signature-sanitizer';

const RESOURCE: EmailAuditResource = 'email_signature';
const NAME_CONFLICT = 'A signature with this name already exists. Choose a different name.';

interface SignatureRow {
  id: string;
  tenantId: string;
  scope: string;
  userId: string | null;
  name: string;
  html: string;
  isDefault: boolean;
  updatedAt: Date;
}

function ownerWhere(ctx: EmailRouterCtx, scope: string) {
  return scope === 'ORG'
    ? { tenantId: ctx.tenant.tenantId, scope: 'ORG', userId: null }
    : { tenantId: ctx.tenant.tenantId, scope: 'USER', userId: ctx.tenant.userId };
}

/**
 * A signature the caller may change: in the tenant, and either their own
 * personal one or (admins only) an org one. Another user's personal signature
 * is NOT_FOUND (its existence is not revealed).
 */
async function findChangeable(
  ctx: EmailRouterCtx,
  id: string,
  action: string
): Promise<SignatureRow> {
  const row: SignatureRow | null = await ctx.prismaWithTenant.emailSignature.findFirst({
    where: { id, tenantId: ctx.tenant.tenantId },
  });
  if (!row || (row.scope === 'USER' && row.userId !== ctx.tenant.userId)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Signature not found' });
  }
  if (row.scope === 'ORG') assertEmailAdmin(ctx, RESOURCE, action);
  return row;
}

async function assertNameFree(
  ctx: EmailRouterCtx,
  scope: string,
  name: string,
  selfId?: string
): Promise<void> {
  const siblings: Array<{ id: string; name: string }> =
    await ctx.prismaWithTenant.emailSignature.findMany({
      where: ownerWhere(ctx, scope),
      select: { id: true, name: true },
    });
  if (!buildSignatureNameSchema(siblings ?? [], selfId).safeParse({ name }).success) {
    throw new TRPCError({ code: 'CONFLICT', message: NAME_CONFLICT });
  }
}

function conflictOnDuplicate(err: unknown): never {
  if (prismaErrorCode(err) === 'P2002')
    throw new TRPCError({ code: 'CONFLICT', message: NAME_CONFLICT });
  throw err;
}

export const emailSignaturesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<EmailSignatureListDto> => {
    assertTenantContext(ctx);
    const c = ctx as unknown as EmailRouterCtx;
    const rows: SignatureRow[] = await c.prismaWithTenant.emailSignature.findMany({
      where: {
        tenantId: c.tenant.tenantId,
        OR: [{ scope: 'USER', userId: c.tenant.userId }, { scope: 'ORG' }],
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return {
      mine: rows.filter((r) => r.scope === 'USER').map(toSignatureDto),
      org: rows.filter((r) => r.scope === 'ORG').map(toSignatureDto),
      canManageOrg: isEmailAdmin(c),
    };
  }),

  create: tenantProcedure
    .input(createEmailSignatureInputSchema)
    .mutation(async ({ ctx, input }): Promise<EmailSignatureDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      if (input.scope === 'ORG') assertEmailAdmin(c, RESOURCE, 'create');
      const owner = ownerWhere(c, input.scope);
      const count: number = await c.prismaWithTenant.emailSignature.count({ where: owner });
      if (count >= EMAIL_LIMITS.maxSignaturesPerScope) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `You can keep at most ${EMAIL_LIMITS.maxSignaturesPerScope} signatures here.`,
        });
      }
      await assertNameFree(c, input.scope, input.name);
      try {
        const row: SignatureRow = await c.prismaWithTenant.$transaction(async (tx: any) => {
          if (input.isDefault) {
            await tx.emailSignature.updateMany({
              where: { ...owner, isDefault: true },
              data: { isDefault: false },
            });
          }
          return tx.emailSignature.create({
            data: {
              tenantId: owner.tenantId,
              scope: owner.scope,
              userId: owner.userId,
              name: input.name,
              html: sanitizeSignatureHtml(input.html),
              isDefault: input.isDefault,
            },
          });
        });
        auditEmail(c, 'CREATE', RESOURCE, row.id, { scope: row.scope });
        return toSignatureDto(row);
      } catch (err) {
        conflictOnDuplicate(err);
      }
    }),

  update: tenantProcedure
    .input(updateEmailSignatureInputSchema)
    .mutation(async ({ ctx, input }): Promise<EmailSignatureDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const existing = await findChangeable(c, input.id, 'update');
      if (input.name !== undefined)
        await assertNameFree(c, existing.scope, input.name, existing.id);
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.html !== undefined) data.html = sanitizeSignatureHtml(input.html);
      try {
        const row: SignatureRow = await c.prismaWithTenant.emailSignature.update({
          where: { id: existing.id },
          data,
        });
        auditEmail(c, 'UPDATE', RESOURCE, row.id, { changedFields: Object.keys(data) });
        return toSignatureDto(row);
      } catch (err) {
        conflictOnDuplicate(err);
      }
    }),

  delete: tenantProcedure
    .input(deleteSignatureInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ deleted: true }> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const existing = await findChangeable(c, input.id, 'delete');
      await c.prismaWithTenant.$transaction(async (tx: any) =>
        tx.emailSignature.delete({ where: { id: existing.id } })
      );
      auditEmail(c, 'DELETE', RESOURCE, existing.id, { scope: existing.scope });
      return { deleted: true };
    }),

  setDefault: tenantProcedure
    .input(setDefaultSignatureInputSchema)
    .mutation(async ({ ctx, input }): Promise<EmailSignatureDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const existing = await findChangeable(c, input.id, 'setDefault');
      const row: SignatureRow = await c.prismaWithTenant.$transaction(async (tx: any) => {
        await tx.emailSignature.updateMany({
          where: { ...ownerWhere(c, existing.scope), isDefault: true },
          data: { isDefault: false },
        });
        return tx.emailSignature.update({ where: { id: existing.id }, data: { isDefault: true } });
      });
      auditEmail(c, 'UPDATE', RESOURCE, row.id, { changedFields: ['isDefault'] });
      return toSignatureDto(row);
    }),

  /** The signature prefilled in a new message: user default, else org default (Q5). */
  resolveDefault: tenantProcedure.query(
    async ({ ctx }): Promise<{ id: string; html: string } | null> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const rows: SignatureRow[] = await c.prismaWithTenant.emailSignature.findMany({
        where: {
          tenantId: c.tenant.tenantId,
          isDefault: true,
          OR: [{ scope: 'USER', userId: c.tenant.userId }, { scope: 'ORG' }],
        },
      });
      const chosen = resolveDefaultSignature(
        rows.filter((r) => r.scope === 'USER'),
        rows.filter((r) => r.scope === 'ORG')
      );
      return chosen ? { id: chosen.id, html: sanitizeSignatureHtml(chosen.html) } : null;
    }
  ),
});
