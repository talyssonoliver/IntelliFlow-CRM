/**
 * Ticket Settings Router - PG-185
 *
 * Composite tRPC router for ticket module settings:
 * - `slaPolicies` — re-export of `ticketConfigRouter.slaPolicy` (no duplication)
 * - `duplicateRules` — CRUD with $transaction replace + superRefine de-dup
 * - `requiredFields` — policy rows with subject/contactEmail hard-required
 * - `tags` — tenant-scoped tag vocabulary with admin-only gate
 * - `automation` — TicketAutomationSetting row including defaultSlaPolicyId FK
 *
 * Every multi-row write is wrapped in `$transaction` (playbook §5).
 * `automation.update({defaultSlaPolicyId})` validates tenant ownership of the
 * SLA policy before assigning; cross-tenant FK leak returns BAD_REQUEST.
 */

import { TRPCError } from '@trpc/server';
import {
  updateTicketDuplicateRulesSchema,
  updateTicketRequiredFieldsSchema,
  createTicketTagSchema,
  updateTicketTagSchema,
  deleteTicketTagSchema,
  ticketAutomationSettingsSchema,
  DEFAULT_TICKET_DUPLICATE_RULES,
  DEFAULT_TICKET_REQUIRED_FIELDS,
  DEFAULT_TICKET_AUTOMATION,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertCanCreateTag, loadTicketAutomation } from './ticket-automation';
import { slaPolicyRouter } from './ticket-config.router';

// ─── Duplicate Rules Sub-Router ─────────────────────────────────────────────

const duplicateRulesRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.ticketDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.ticketDuplicateRule.createMany({
      data: DEFAULT_TICKET_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
    });

    return ctx.prismaWithTenant.ticketDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),

  updateAll: tenantProcedure
    .input(updateTicketDuplicateRulesSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      try {
        await ctx.prismaWithTenant.$transaction([
          ctx.prismaWithTenant.ticketDuplicateRule.deleteMany({ where: { tenantId } }),
          ctx.prismaWithTenant.ticketDuplicateRule.createMany({
            data: input.rules.map((r) => ({ ...r, tenantId })),
          }),
        ]);
      } catch (err: unknown) {
        if (isUniqueConstraintError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'Two rules share the same (field, match strategy) pair. Remove or change one before saving.',
          });
        }
        throw err;
      }
      return ctx.prismaWithTenant.ticketDuplicateRule.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.ticketDuplicateRule.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.ticketDuplicateRule.createMany({
        data: DEFAULT_TICKET_DUPLICATE_RULES.map((r) => ({ ...r, tenantId })),
      }),
    ]);
    return ctx.prismaWithTenant.ticketDuplicateRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }),
});

// ─── Required Fields Sub-Router ─────────────────────────────────────────────

const requiredFieldsRouter = createTRPCRouter({
  getAll: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.ticketRequiredField.findMany({
      where: { tenantId },
    });
    if (existing.length > 0) return existing;

    await ctx.prismaWithTenant.ticketRequiredField.createMany({
      data: DEFAULT_TICKET_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
    });

    return ctx.prismaWithTenant.ticketRequiredField.findMany({ where: { tenantId } });
  }),

  updateAll: tenantProcedure
    .input(updateTicketRequiredFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      await ctx.prismaWithTenant.$transaction(
        input.fields.map((f) =>
          ctx.prismaWithTenant.ticketRequiredField.upsert({
            where: { tenantId_fieldKey: { tenantId, fieldKey: f.fieldKey } },
            update: { isRequired: f.isRequired },
            create: { tenantId, fieldKey: f.fieldKey, isRequired: f.isRequired },
          })
        )
      );
      return ctx.prismaWithTenant.ticketRequiredField.findMany({ where: { tenantId } });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.$transaction([
      ctx.prismaWithTenant.ticketRequiredField.deleteMany({ where: { tenantId } }),
      ctx.prismaWithTenant.ticketRequiredField.createMany({
        data: DEFAULT_TICKET_REQUIRED_FIELDS.map((f) => ({ ...f, tenantId })),
      }),
    ]);
    return ctx.prismaWithTenant.ticketRequiredField.findMany({ where: { tenantId } });
  }),
});

// ─── Tags Sub-Router ────────────────────────────────────────────────────────

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.ticketTag.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }),

  create: tenantProcedure.input(createTicketTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const flags = await loadTicketAutomation(ctx);
    assertCanCreateTag(ctx, flags);

    try {
      return await ctx.prismaWithTenant.ticketTag.create({
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

  update: tenantProcedure.input(updateTicketTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { id, ...rest } = input;
    try {
      return await ctx.prismaWithTenant.ticketTag.update({
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

  delete: tenantProcedure.input(deleteTicketTagSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    await ctx.prismaWithTenant.ticketTag.delete({
      where: { id: input.id, tenantId },
    });
    return { success: true };
  }),
});

// ─── Automation Sub-Router ──────────────────────────────────────────────────

const automationRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.ticketAutomationSetting.findUnique({
      where: { tenantId },
      include: { defaultSlaPolicy: true },
    });
    if (existing) return existing;

    return ctx.prismaWithTenant.ticketAutomationSetting.create({
      data: { tenantId, ...DEFAULT_TICKET_AUTOMATION },
      include: { defaultSlaPolicy: true },
    });
  }),

  update: tenantProcedure.input(ticketAutomationSettingsSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    // Cross-tenant FK guard: if the caller passed a non-null
    // defaultSlaPolicyId, verify it belongs to their tenant before
    // persisting. Without this check, a client could assign another
    // tenant's SLA policy id to their own automation row — silent data
    // leak.
    if (input.defaultSlaPolicyId) {
      const owned = await ctx.prismaWithTenant.sLAPolicy.findFirst({
        where: { id: input.defaultSlaPolicyId, tenantId },
        select: { id: true },
      });
      if (!owned) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'SLA policy does not belong to this tenant.',
        });
      }
    }

    return ctx.prismaWithTenant.ticketAutomationSetting.upsert({
      where: { tenantId },
      update: input,
      create: { tenantId, ...input },
      include: { defaultSlaPolicy: true },
    });
  }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.ticketAutomationSetting.upsert({
      where: { tenantId },
      update: DEFAULT_TICKET_AUTOMATION,
      create: { tenantId, ...DEFAULT_TICKET_AUTOMATION },
      include: { defaultSlaPolicy: true },
    });
  }),
});

// ─── Top-level Router ───────────────────────────────────────────────────────

/**
 * PG-185 composite router. The `slaPolicies` sub-router is a verbatim
 * re-export of `ticketConfigRouter.slaPolicy` (SLA CRUD + setDefault) —
 * no duplication of behavior. Existing callers using
 * `trpc.ticketConfig.slaPolicy.*` continue to work unchanged.
 */
export const ticketSettingsRouter = createTRPCRouter({
  slaPolicies: slaPolicyRouter,
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
