/**
 * Contact Types Router — PG-205 (Module Settings: Contact Types, ADR-080).
 *
 * Tenants start with the six system types and can rename, recolour, add,
 * deactivate and set a default. A type's defaults are applied when a contact is
 * created (contact.create), so changes are restricted to CONTACT_TYPE_ADMIN_ROLES.
 * Reads are open to every tenant user (the New/Edit Contact picker and the list
 * filter need them). Contacts is CORE_CRM, so this is plain `tenantProcedure`
 * (no module gate). `prismaWithTenant` does not inject `tenantId`, so every read
 * and write passes it explicitly, and Prisma `data` objects are built field by
 * field (never an input spread). A type's `key` is generated server-side and
 * never changes; `contacts.contactType` stores it (no FK, ADR-080).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CONTACT_TYPE_LIMITS,
  CONTACT_TYPE_REQUIRED_FIELD_KEYS,
  generateContactTypeKey,
  isContactTypeAdminRole,
  type ContactStatus,
  type ContactTypeOwnerDefault,
  type ContactTypeRequiredFieldKey,
} from '@intelliflow/domain';
import {
  createContactTypeSchema,
  updateContactTypeSchema,
  deleteContactTypeSchema,
  setDefaultContactTypeSchema,
  type ContactTypeDto,
  type ContactTypeListDto,
  type ContactTypeOptionDto,
  type CreateContactTypeInput,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext, type TenantAwareContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';
import {
  assertContactTypeAdmin,
  ensureSystemContactTypes,
  lockTenantContactTypes,
} from './contact-type-resolver';

type ContactTypeCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user' | 'prisma'>;
type ContactTypeTx = Parameters<
  Parameters<ContactTypeCtx['prismaWithTenant']['$transaction']>[0]
>[0];

const NOT_FOUND = 'Contact type not found';
const NAME_CONFLICT = 'A contact type with this name already exists. Choose a different name.';
const DEFAULT_MUST_STAY_ACTIVE =
  'The default contact type must stay active. Choose another default first.';
const TAGS_UNAVAILABLE = 'One or more default tags are not available in this workspace.';
const SORT_ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];
const DEFAULT_TAGS_INCLUDE = {
  defaultTags: {
    orderBy: { createdAt: 'asc' as const },
    select: { contactTag: { select: { id: true, name: true } } },
  },
};

/** The fields a write sets, in DTO order (also the audit "changed fields" vocabulary). */
const EDITABLE_FIELDS = [
  'name',
  'colorToken',
  'isActive',
  'defaultStatus',
  'defaultDepartment',
  'defaultOwner',
  'requiredFields',
] as const;

interface ContactTypeRow {
  id: string;
  key: string;
  name: string;
  colorToken: string;
  isSystem: boolean;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  defaultStatus: ContactStatus | null;
  defaultDepartment: string | null;
  defaultOwner: string;
  requiredFields: string[];
  defaultTags: { contactTag: { id: string; name: string } }[];
}

const REQUIRED_KEYS: ReadonlySet<string> = new Set(CONTACT_TYPE_REQUIRED_FIELD_KEYS);

/** Narrows a stored TEXT[] (DB CHECK-constrained) to the known keys. */
export function toRequiredFieldKeys(values: readonly string[]): ContactTypeRequiredFieldKey[] {
  return values.filter((v): v is ContactTypeRequiredFieldKey => REQUIRED_KEYS.has(v));
}

/** The stored owner rule (DB CHECK-constrained); anything else reads as CREATOR. */
function toOwnerDefault(value: string): ContactTypeOwnerDefault {
  return value === 'ACCOUNT_OWNER' ? 'ACCOUNT_OWNER' : 'CREATOR';
}

function toContactTypeDto(row: ContactTypeRow, contactCount: number): ContactTypeDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    colorToken: row.colorToken,
    isSystem: row.isSystem,
    isActive: row.isActive,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    defaultStatus: row.defaultStatus,
    defaultDepartment: row.defaultDepartment,
    defaultOwner: toOwnerDefault(row.defaultOwner),
    requiredFields: toRequiredFieldKeys(row.requiredFields),
    defaultTags: row.defaultTags.map((link) => ({
      id: link.contactTag.id,
      name: link.contactTag.name,
    })),
    contactCount,
  };
}

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

/** create/update never change isDefault or key, so a P2002 there is the lower(name) index. */
function rethrowNameConflict(err: unknown): never {
  if (prismaCode(err) === 'P2002')
    throw new TRPCError({ code: 'CONFLICT', message: NAME_CONFLICT });
  throw err;
}

async function findOwnedContactType(ctx: ContactTypeCtx, id: string) {
  const existing = await ctx.prismaWithTenant.contactType.findFirst({
    where: { id, tenantId: ctx.tenant.tenantId },
    select: {
      id: true,
      key: true,
      name: true,
      colorToken: true,
      isSystem: true,
      isActive: true,
      isDefault: true,
      defaultStatus: true,
      defaultDepartment: true,
      defaultOwner: true,
      requiredFields: true,
      defaultTags: { select: { contactTagId: true } },
    },
  });
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
  return existing;
}

function fieldsData(input: CreateContactTypeInput) {
  return {
    name: input.name,
    colorToken: input.colorToken,
    isActive: input.isActive,
    defaultStatus: input.defaultStatus,
    defaultDepartment: input.defaultDepartment,
    defaultOwner: input.defaultOwner,
    requiredFields: input.requiredFields,
  };
}

/** Default tags must be active tags of the caller's tenant — one message for foreign/missing/inactive. */
async function assertTagsAvailable(tx: ContactTypeTx, tenantId: string, tagIds: readonly string[]) {
  if (tagIds.length === 0) return;
  const found = await tx.contactTag.count({
    where: { tenantId, id: { in: [...tagIds] }, isActive: true },
  });
  if (found !== tagIds.length)
    throw new TRPCError({ code: 'BAD_REQUEST', message: TAGS_UNAVAILABLE });
}

async function writeDefaultTags(
  tx: ContactTypeTx,
  tenantId: string,
  contactTypeId: string,
  tagIds: readonly string[],
  replace: boolean
): Promise<void> {
  if (replace) await tx.contactTypeDefaultTag.deleteMany({ where: { tenantId, contactTypeId } });
  if (tagIds.length === 0) return;
  await tx.contactTypeDefaultTag.createMany({
    data: tagIds.map((contactTagId) => ({ tenantId, contactTypeId, contactTagId })),
  });
}

function logContactTypeAudit(
  ctx: ContactTypeCtx,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  id: string,
  state: {
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    eventType?: string;
  }
): void {
  // Ids and field names only — never tag names or contact data.
  getAuditLogger(ctx.prisma)
    .logAction(action, 'contact_type', id, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      ...state,
    })
    .catch((err: unknown) => console.error('[contact-types.router] Audit log failed:', err));
}

type OwnedContactType = Awaited<ReturnType<typeof findOwnedContactType>>;

function changedFields(existing: OwnedContactType, input: CreateContactTypeInput): string[] {
  const changed: string[] = EDITABLE_FIELDS.filter(
    (field) => JSON.stringify(existing[field]) !== JSON.stringify(fieldsData(input)[field])
  );
  const before = existing.defaultTags.map((t) => t.contactTagId).sort();
  const after = [...input.defaultTagIds].sort();
  if (JSON.stringify(before) !== JSON.stringify(after)) changed.push('defaultTags');
  return changed;
}

function pluralContacts(count: number): string {
  return count === 1 ? '1 contact uses' : `${count} contacts use`;
}

const listActiveInputSchema = z.object({ includeInactive: z.boolean().optional() }).optional();

// ─── Router ─────────────────────────────────────────────────────────────────

export const contactTypesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<ContactTypeListDto> => {
    assertTenantContext(ctx);
    await ensureSystemContactTypes(ctx);
    const tenantId = ctx.tenant.tenantId;
    const rows: ContactTypeRow[] = await ctx.prismaWithTenant.contactType.findMany({
      where: { tenantId },
      include: DEFAULT_TAGS_INCLUDE,
      orderBy: SORT_ORDER,
    });

    const counts = new Map<string, number>();
    if (rows.length > 0) {
      const grouped = await ctx.prismaWithTenant.contact.groupBy({
        by: ['contactType'],
        where: { tenantId, contactType: { in: rows.map((r) => r.key) } },
        _count: { _all: true },
      });
      for (const group of grouped) {
        if (group.contactType) counts.set(group.contactType, group._count._all);
      }
    }

    return {
      types: rows.map((row) => toContactTypeDto(row, counts.get(row.key) ?? 0)),
      limits: CONTACT_TYPE_LIMITS,
      canEdit: isContactTypeAdminRole(ctx.user?.role),
    };
  }),

  /**
   * Types for the New/Edit Contact picker, the list filter and the type badges.
   * Active only by default; `includeInactive` also returns deactivated types so a
   * stored key still shows its name.
   */
  listActive: tenantProcedure
    .input(listActiveInputSchema)
    .query(async ({ ctx, input }): Promise<ContactTypeOptionDto[]> => {
      assertTenantContext(ctx);
      await ensureSystemContactTypes(ctx);
      const tenantId = ctx.tenant.tenantId;
      const rows = await ctx.prismaWithTenant.contactType.findMany({
        where: input?.includeInactive ? { tenantId } : { tenantId, isActive: true },
        orderBy: SORT_ORDER,
        select: {
          id: true,
          key: true,
          name: true,
          colorToken: true,
          isActive: true,
          isDefault: true,
          isSystem: true,
          requiredFields: true,
        },
      });
      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        colorToken: row.colorToken,
        isActive: row.isActive,
        isDefault: row.isDefault,
        isSystem: row.isSystem,
        requiredFields: toRequiredFieldKeys(row.requiredFields),
      }));
    }),

  create: tenantProcedure
    .input(createContactTypeSchema)
    .mutation(async ({ ctx, input }): Promise<ContactTypeDto> => {
      assertTenantContext(ctx);
      assertContactTypeAdmin(ctx, 'create');
      await ensureSystemContactTypes(ctx);
      const tenantId = ctx.tenant.tenantId;

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          // Cap, key generation and insert are read-then-write: one tenant at a time.
          await lockTenantContactTypes(tx, tenantId);
          const count = await tx.contactType.count({ where: { tenantId } });
          if (count >= CONTACT_TYPE_LIMITS.maxTypesPerTenant) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `A workspace can have at most ${CONTACT_TYPE_LIMITS.maxTypesPerTenant} contact types.`,
            });
          }
          const taken = await tx.contactType.findMany({
            where: { tenantId },
            select: { key: true },
          });
          const key = generateContactTypeKey(input.name, new Set(taken.map((t) => t.key)));
          await assertTagsAvailable(tx, tenantId, input.defaultTagIds);
          const last = await tx.contactType.aggregate({
            where: { tenantId },
            _max: { sortOrder: true },
          });
          const sortOrder = last._max.sortOrder == null ? 0 : last._max.sortOrder + 1;

          const created = await tx.contactType.create({
            data: { tenantId, key, isSystem: false, sortOrder, ...fieldsData(input) },
            select: { id: true },
          });
          await writeDefaultTags(tx, tenantId, created.id, input.defaultTagIds, false);
          return tx.contactType.findFirstOrThrow({
            where: { id: created.id, tenantId },
            include: DEFAULT_TAGS_INCLUDE,
          });
        });
        logContactTypeAudit(ctx, 'CREATE', row.id, {
          afterState: {
            key: row.key,
            colorToken: row.colorToken,
            isActive: row.isActive,
            defaultOwner: row.defaultOwner,
            requiredFields: row.requiredFields,
            defaultTagIds: input.defaultTagIds,
          },
        });
        return toContactTypeDto(row, 0);
      } catch (err) {
        rethrowNameConflict(err);
      }
    }),

  update: tenantProcedure
    .input(updateContactTypeSchema)
    .mutation(async ({ ctx, input }): Promise<ContactTypeDto> => {
      assertTenantContext(ctx);
      assertContactTypeAdmin(ctx, 'update', input.id);
      await ensureSystemContactTypes(ctx);
      const tenantId = ctx.tenant.tenantId;
      const existing = await findOwnedContactType(ctx, input.id);
      if (existing.isDefault && !input.isActive) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: DEFAULT_MUST_STAY_ACTIVE });
      }

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await assertTagsAvailable(tx, tenantId, input.defaultTagIds);
          // Deactivating: the guard is in the write, so a concurrent setDefault cannot
          // leave an inactive type as the default (the row lock re-checks the WHERE).
          const updated = await tx.contactType.updateMany({
            where: { id: input.id, tenantId, ...(input.isActive ? {} : { isDefault: false }) },
            data: fieldsData(input),
          });
          if (updated.count === 0) {
            const stillThere = await tx.contactType.findFirst({
              where: { id: input.id, tenantId },
              select: { id: true },
            });
            if (!stillThere) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: DEFAULT_MUST_STAY_ACTIVE });
          }
          await writeDefaultTags(tx, tenantId, input.id, input.defaultTagIds, true);
          return tx.contactType.findFirstOrThrow({
            where: { id: input.id, tenantId },
            include: DEFAULT_TAGS_INCLUDE,
          });
        });
        const contactCount = await ctx.prismaWithTenant.contact.count({
          where: { tenantId, contactType: existing.key },
        });
        logContactTypeAudit(ctx, 'UPDATE', input.id, {
          afterState: { changedFields: changedFields(existing, input) },
        });
        return toContactTypeDto(row, contactCount);
      } catch (err) {
        rethrowNameConflict(err);
      }
    }),

  /** System types are deactivate-only; a custom type is deleted only when unused and not default. */
  delete: tenantProcedure.input(deleteContactTypeSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    assertContactTypeAdmin(ctx, 'delete', input.id);
    const tenantId = ctx.tenant.tenantId;
    const existing = await findOwnedContactType(ctx, input.id);
    if (existing.isSystem) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Built-in contact types cannot be deleted. Deactivate it instead.',
      });
    }
    if (existing.isDefault) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The default contact type cannot be deleted. Choose another default first.',
      });
    }

    await ctx.prismaWithTenant.$transaction(async (tx) => {
      // No FK from contacts (ADR-080): the in-use count is the guard.
      const used = await tx.contact.count({ where: { tenantId, contactType: existing.key } });
      if (used > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${pluralContacts(used)} this type. Deactivate it instead.`,
        });
      }
      const deleted = await tx.contactType.deleteMany({
        where: { id: input.id, tenantId, isDefault: false, isSystem: false },
      });
      if (deleted.count === 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This contact type changed while you were deleting it. Reload and try again.',
        });
      }
    });
    logContactTypeAudit(ctx, 'DELETE', input.id, { beforeState: { key: existing.key } });
    return { success: true as const };
  }),

  /** `id: null` clears the default. Clear-then-set in one transaction (partial unique index). */
  setDefault: tenantProcedure
    .input(setDefaultContactTypeSchema)
    .mutation(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      assertContactTypeAdmin(ctx, 'setDefault', input.id ?? '-');
      await ensureSystemContactTypes(ctx);
      const tenantId = ctx.tenant.tenantId;
      if (input.id !== null) {
        const target = await findOwnedContactType(ctx, input.id);
        if (!target.isActive) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Activate ${target.name} before making it the default.`,
          });
        }
      }

      try {
        await ctx.prismaWithTenant.$transaction(async (tx) => {
          await tx.contactType.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
          });
          if (input.id !== null) {
            // isActive in the filter: a type deactivated or deleted since the check is not made
            // default, and the transaction rolls back so the previous default stays.
            const updated = await tx.contactType.updateMany({
              where: { id: input.id, tenantId, isActive: true },
              data: { isDefault: true },
            });
            if (updated.count === 0) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'This contact type changed while you were saving. Reload and try again.',
              });
            }
          }
        });
      } catch (err) {
        if (prismaCode(err) === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'The default contact type changed at the same time. Reload and try again.',
          });
        }
        throw err;
      }
      logContactTypeAudit(ctx, 'UPDATE', input.id ?? '-', {
        eventType: 'ContactTypeDefaultChanged',
        afterState: { defaultTypeId: input.id },
      });
      return { success: true as const };
    }),
});
