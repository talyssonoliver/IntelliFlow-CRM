/**
 * Custom Node Type Router (IFC-031 FU-011)
 *
 * Admin-gated CRUD for tenant-registered custom workflow node types.
 * The public `list` is tenantProcedure (non-admin) so the workflow-builder
 * palette can read it; mutations are adminTenantProcedure.
 *
 * Mutation side-effects:
 *   • invalidate the in-memory CustomNodeTypeRegistry for this tenant so the
 *     next workflow save / palette fetch re-reads from Postgres
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@intelliflow/db';
import { FieldDescriptorArraySchema, NODE_TYPE_IDS } from '@intelliflow/domain';
import { createTRPCRouter, tenantProcedure, adminTenantProcedure } from '../../trpc';
import { getCustomNodeTypeRegistry } from '../../workflow/registries/custom-node-type-registry';

const TYPE_ID_REGEX = /^[a-z][a-z0-9_-]*$/i;
const RESERVED_TYPE_IDS = new Set<string>(NODE_TYPE_IDS as readonly string[]);

const createInput = z.object({
  typeId: z.string().min(1).regex(TYPE_ID_REGEX, 'typeId must be a lowercase slug'),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  iconKey: z.string().default('extension'),
  accentClass: z.string().default('border-slate-500/60 bg-slate-500/5'),
  configSchema: FieldDescriptorArraySchema.default([]),
  isActive: z.boolean().default(true),
});

const updateInput = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  iconKey: z.string().optional(),
  accentClass: z.string().optional(),
  configSchema: FieldDescriptorArraySchema.optional(),
  isActive: z.boolean().optional(),
});

export const customNodeTypeRouter = createTRPCRouter({
  /**
   * List all active custom node types for the current tenant.
   * Non-admins can call this so the palette can render custom types.
   */
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const rows = await ctx.prismaWithTenant.customNodeType.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    // Cache contract: lazy-load on first workflow-save validation hit,
    // invalidate on create/update/delete. Reads do NOT touch the registry
    // — that would defeat the singleton cache (audit finding 2026-04-14).

    return {
      items: rows.map((r) => ({
        id: r.id,
        typeId: r.typeId,
        label: r.label,
        description: r.description,
        iconKey: r.iconKey,
        accentClass: r.accentClass,
        configSchema: r.configSchema as unknown,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }),

  create: adminTenantProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    if (RESERVED_TYPE_IDS.has(input.typeId)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `typeId "${input.typeId}" is reserved by a built-in node type`,
      });
    }

    const created = await ctx.prismaWithTenant.customNodeType.create({
      data: {
        tenantId,
        typeId: input.typeId,
        label: input.label,
        description: input.description,
        iconKey: input.iconKey,
        accentClass: input.accentClass,
        configSchema: input.configSchema as object,
        isActive: input.isActive,
        createdBy: ctx.user.userId,
      },
    });

    getCustomNodeTypeRegistry().invalidateTenant(tenantId);
    return created;
  }),

  update: adminTenantProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.customNodeType.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom node type not found' });
    }

    const updated = await ctx.prismaWithTenant.customNodeType.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.iconKey !== undefined && { iconKey: input.iconKey }),
        ...(input.accentClass !== undefined && { accentClass: input.accentClass }),
        ...(input.configSchema !== undefined && {
          configSchema: input.configSchema as object,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    getCustomNodeTypeRegistry().invalidateTenant(tenantId);
    return updated;
  }),

  delete: adminTenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        /** When true, skip the reference-count check and hard-delete anyway. */
        force: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const existing = await ctx.prismaWithTenant.customNodeType.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom node type not found' });
      }

      // Count workflows that reference this type via `steps.nodes[*].type`.
      // Any match blocks a non-force delete — we don't want to silently
      // break a live workflow definition.
      if (!input.force) {
        const rows = await ctx.prismaWithTenant.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM workflow_definitions
            WHERE "tenantId" = ${tenantId}
              AND "deletedAt" IS NULL
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(steps->'nodes') node
                WHERE node->>'type' = ${existing.typeId}
              )
          `
        );
        const refCount = Number(rows[0]?.count ?? 0);
        if (refCount > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot delete "${existing.typeId}" — ${refCount} workflow${refCount === 1 ? '' : 's'} still reference it. Migrate those workflows first, or pass force=true to delete anyway (breaks those workflows).`,
          });
        }
      }

      await ctx.prismaWithTenant.customNodeType.delete({ where: { id: input.id } });
      getCustomNodeTypeRegistry().invalidateTenant(tenantId);
      return { id: input.id, deleted: true, forced: input.force };
    }),
});
