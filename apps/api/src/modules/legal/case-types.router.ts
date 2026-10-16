/**
 * Case Types Router — PG-204 (Module Settings: Case Types, ADR-076).
 *
 * A case type's defaults are applied when a case is created (cases.create), so
 * changes are restricted to CASE_TYPE_ADMIN_ROLES — stricter than the PG-190
 * settings router. Reads are open to every LEGAL-entitled user (the New Case
 * form needs `listActive`). `prismaWithTenant` does not inject `tenantId`, so
 * every read and write passes it explicitly, and Prisma `data` objects are
 * built field by field (never an input spread).
 */

import { TRPCError } from '@trpc/server';
import {
  CASE_REQUIRED_FIELD_KEYS,
  CASE_TYPE_LIMITS,
  isCaseTypeAdminRole,
  type CasePriority,
  type CaseRequiredFieldKey,
} from '@intelliflow/domain';
import {
  createCaseTypeSchema,
  updateCaseTypeSchema,
  deleteCaseTypeSchema,
  setDefaultCaseTypeSchema,
  type CaseTypeDto,
  type CaseTypeListDto,
  type CaseTypeOptionDto,
  type CreateCaseTypeInput,
} from '@intelliflow/validators';
import { createTRPCRouter, moduleTenantProcedure } from '../../trpc';
import { assertTenantContext, type TenantAwareContext } from '../../security/tenant-context';

// LEGAL is a paid module: gate every procedure on the tenant's plan (same as case-settings).
const tenantProcedure = moduleTenantProcedure('LEGAL');

type CaseTypeCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user'>;
type CaseTypeTx = Parameters<Parameters<CaseTypeCtx['prismaWithTenant']['$transaction']>[0]>[0];

const NOT_FOUND = 'Case type not found';
const DEFAULT_MUST_STAY_ACTIVE =
  'The default case type must stay active. Choose another default first.';
const DEFAULT_ORDER = [{ isDefault: 'desc' as const }, { name: 'asc' as const }];
const CHECKLIST_INCLUDE = {
  checklist: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, title: true, sortOrder: true },
  },
};

interface CaseTypeRow {
  id: string;
  name: string;
  category: string | null;
  colorToken: string;
  defaultPriority: CasePriority | null;
  defaultSlaDays: number | null;
  requiredFields: string[];
  isActive: boolean;
  isDefault: boolean;
  checklist: { id: string; title: string; sortOrder: number }[];
}

const REQUIRED_KEYS: ReadonlySet<string> = new Set(CASE_REQUIRED_FIELD_KEYS);

/** Narrows a stored TEXT[] (DB CHECK-constrained) to the known keys. */
export function toRequiredFieldKeys(values: readonly string[]): CaseRequiredFieldKey[] {
  return values.filter((v): v is CaseRequiredFieldKey => REQUIRED_KEYS.has(v));
}

function toCaseTypeDto(row: CaseTypeRow, caseCount: number): CaseTypeDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    colorToken: row.colorToken,
    defaultPriority: row.defaultPriority,
    defaultSlaDays: row.defaultSlaDays,
    requiredFields: toRequiredFieldKeys(row.requiredFields),
    isActive: row.isActive,
    isDefault: row.isDefault,
    checklist: row.checklist.map((item) => ({
      id: item.id,
      title: item.title,
      sortOrder: item.sortOrder,
    })),
    caseCount,
  };
}

function assertCaseTypeAdmin(ctx: Pick<CaseTypeCtx, 'user'>): void {
  if (isCaseTypeAdminRole(ctx.user?.role)) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only administrators and managers can change case types.',
  });
}

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

/** create/update never change isDefault, so a P2002 there is the lower(name) index. */
function rethrowNameConflict(err: unknown, name: string): never {
  if (prismaCode(err) === 'P2002') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A case type named "${name}" already exists. Choose a different name.`,
    });
  }
  throw err;
}

async function findOwnedCaseType(ctx: CaseTypeCtx, id: string) {
  const existing = await ctx.prismaWithTenant.caseType.findFirst({
    where: { id, tenantId: ctx.tenant.tenantId },
    select: { id: true, name: true, isDefault: true, isActive: true },
  });
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
  return existing;
}

function fieldsData(input: CreateCaseTypeInput) {
  return {
    name: input.name,
    category: input.category,
    colorToken: input.colorToken,
    defaultPriority: input.defaultPriority,
    defaultSlaDays: input.defaultSlaDays,
    requiredFields: input.requiredFields,
    isActive: input.isActive,
  };
}

async function writeChecklist(
  tx: CaseTypeTx,
  tenantId: string,
  caseTypeId: string,
  checklist: CreateCaseTypeInput['checklist']
): Promise<void> {
  await tx.caseTypeChecklistItem.deleteMany({ where: { tenantId, caseTypeId } });
  if (checklist.length === 0) return;
  await tx.caseTypeChecklistItem.createMany({
    data: checklist.map((item, sortOrder) => ({
      tenantId,
      caseTypeId,
      title: item.title,
      sortOrder,
    })),
  });
}

function pluralCases(count: number): string {
  return count === 1 ? '1 case uses' : `${count} cases use`;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const caseTypesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<CaseTypeListDto> => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const rows: CaseTypeRow[] = await ctx.prismaWithTenant.caseType.findMany({
      where: { tenantId },
      include: CHECKLIST_INCLUDE,
      orderBy: DEFAULT_ORDER,
    });

    const counts = new Map<string, number>();
    if (rows.length > 0) {
      const grouped = await ctx.prismaWithTenant.case.groupBy({
        by: ['caseTypeId'],
        where: { tenantId, caseTypeId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      });
      for (const group of grouped) {
        if (group.caseTypeId) counts.set(group.caseTypeId, group._count._all);
      }
    }

    return {
      types: rows.map((row) => toCaseTypeDto(row, counts.get(row.id) ?? 0)),
      limits: CASE_TYPE_LIMITS,
      canEdit: isCaseTypeAdminRole(ctx.user?.role),
    };
  }),

  /** Active types for the New Case picker. */
  listActive: tenantProcedure.query(async ({ ctx }): Promise<CaseTypeOptionDto[]> => {
    assertTenantContext(ctx);
    const rows = await ctx.prismaWithTenant.caseType.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: DEFAULT_ORDER,
      select: {
        id: true,
        name: true,
        category: true,
        colorToken: true,
        defaultPriority: true,
        defaultSlaDays: true,
        requiredFields: true,
        isDefault: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      colorToken: row.colorToken,
      defaultPriority: row.defaultPriority,
      defaultSlaDays: row.defaultSlaDays,
      requiredFields: toRequiredFieldKeys(row.requiredFields),
      isDefault: row.isDefault,
    }));
  }),

  create: tenantProcedure
    .input(createCaseTypeSchema)
    .mutation(async ({ ctx, input }): Promise<CaseTypeDto> => {
      assertTenantContext(ctx);
      assertCaseTypeAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;

      const count = await ctx.prismaWithTenant.caseType.count({ where: { tenantId } });
      if (count >= CASE_TYPE_LIMITS.maxTypesPerTenant) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A workspace can have at most ${CASE_TYPE_LIMITS.maxTypesPerTenant} case types.`,
        });
      }

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          const created = await tx.caseType.create({
            data: { tenantId, ...fieldsData(input) },
            select: { id: true },
          });
          await writeChecklist(tx, tenantId, created.id, input.checklist);
          return tx.caseType.findFirstOrThrow({
            where: { id: created.id, tenantId },
            include: CHECKLIST_INCLUDE,
          });
        });
        return toCaseTypeDto(row, 0);
      } catch (err) {
        rethrowNameConflict(err, input.name);
      }
    }),

  update: tenantProcedure
    .input(updateCaseTypeSchema)
    .mutation(async ({ ctx, input }): Promise<CaseTypeDto> => {
      assertTenantContext(ctx);
      assertCaseTypeAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const existing = await findOwnedCaseType(ctx, input.id);
      if (existing.isDefault && !input.isActive) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: DEFAULT_MUST_STAY_ACTIVE });
      }

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          // Deactivating: the guard is in the write, so a concurrent setDefault cannot
          // leave an inactive type as the default (the row lock re-checks the WHERE).
          const updated = await tx.caseType.updateMany({
            where: { id: input.id, tenantId, ...(input.isActive ? {} : { isDefault: false }) },
            data: fieldsData(input),
          });
          if (updated.count === 0) {
            const stillThere = await tx.caseType.findFirst({
              where: { id: input.id, tenantId },
              select: { id: true },
            });
            if (!stillThere) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: DEFAULT_MUST_STAY_ACTIVE });
          }
          await writeChecklist(tx, tenantId, input.id, input.checklist);
          return tx.caseType.findFirstOrThrow({
            where: { id: input.id, tenantId },
            include: CHECKLIST_INCLUDE,
          });
        });
        const caseCount = await ctx.prismaWithTenant.case.count({
          where: { tenantId, caseTypeId: input.id },
        });
        return toCaseTypeDto(row, caseCount);
      } catch (err) {
        rethrowNameConflict(err, input.name);
      }
    }),

  /** Blocked while cases use the type (deactivate instead) and for the default type. */
  delete: tenantProcedure.input(deleteCaseTypeSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    assertCaseTypeAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    const existing = await findOwnedCaseType(ctx, input.id);
    if (existing.isDefault) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'The default case type cannot be deleted. Choose another default first.',
      });
    }

    const inUse = (count: number) =>
      new TRPCError({
        code: 'CONFLICT',
        message: `${pluralCases(count)} this type. Deactivate it instead.`,
      });

    try {
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        const used = await tx.case.count({ where: { tenantId, caseTypeId: input.id } });
        if (used > 0) throw inUse(used);
        const deleted = await tx.caseType.deleteMany({
          where: { id: input.id, tenantId, isDefault: false },
        });
        if (deleted.count === 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'This case type changed while you were deleting it. Reload and try again.',
          });
        }
      });
    } catch (err) {
      // A case created between the count and the delete trips the composite FK.
      if (prismaCode(err) === 'P2003') throw inUse(1);
      throw err;
    }
    return { success: true as const };
  }),

  /** `id: null` clears the default. Clear-then-set in one transaction (partial unique index). */
  setDefault: tenantProcedure.input(setDefaultCaseTypeSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    assertCaseTypeAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    if (input.id !== null) {
      const target = await findOwnedCaseType(ctx, input.id);
      if (!target.isActive) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Activate ${target.name} before making it the default.`,
        });
      }
    }

    try {
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.caseType.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
        if (input.id !== null) {
          // isActive in the filter: a type deactivated or deleted since the check is not made
          // default, and the transaction rolls back so the previous default stays.
          const updated = await tx.caseType.updateMany({
            where: { id: input.id, tenantId, isActive: true },
            data: { isDefault: true },
          });
          if (updated.count === 0) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'This case type changed while you were saving. Reload and try again.',
            });
          }
        }
      });
    } catch (err) {
      if (prismaCode(err) === 'P2002') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'The default case type changed at the same time. Reload and try again.',
        });
      }
      throw err;
    }
    return { success: true as const };
  }),
});
