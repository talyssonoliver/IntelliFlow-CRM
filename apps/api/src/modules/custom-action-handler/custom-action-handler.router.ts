/**
 * Custom Action Handler Router (IFC-031 FU-012)
 *
 * Admin-gated CRUD for tenant-registered webhook action handlers. `list` is
 * tenantProcedure so the workflow builder's action-type select can render
 * custom actions alongside built-ins.
 *
 * Security:
 *   • endpointUrl is validated against isPublicHttpUrl() (SSRF guard)
 *   • authHeader values are NOT echoed back in list responses
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  FieldDescriptorArraySchema,
  isPublicHttpUrl,
  ACTION_TYPES,
} from '@intelliflow/domain';
import { createTRPCRouter, tenantProcedure, adminTenantProcedure } from '../../trpc';
import { getCustomActionHandlerRegistry } from '../../workflow/registries/custom-action-handler-registry';

const ACTION_TYPE_REGEX = /^[a-z][a-z0-9_-]*$/i;
const RESERVED_ACTION_IDS = new Set<string>([...(ACTION_TYPES as readonly string[]), 'custom']);

const createInput = z.object({
  actionTypeId: z
    .string()
    .min(1)
    .regex(ACTION_TYPE_REGEX, 'actionTypeId must be a lowercase slug'),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  endpointUrl: z
    .string()
    .url()
    .refine(isPublicHttpUrl, 'endpointUrl must be a public http/https URL (no loopback / RFC1918)'),
  authHeader: z.string().max(500).optional(),
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
  inputSchema: FieldDescriptorArraySchema.default([]),
  outputSchema: FieldDescriptorArraySchema.default([]),
  isActive: z.boolean().default(true),
});

const updateInput = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  endpointUrl: z
    .string()
    .url()
    .refine(isPublicHttpUrl, 'endpointUrl must be a public http/https URL')
    .optional(),
  authHeader: z.string().max(500).nullable().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  inputSchema: FieldDescriptorArraySchema.optional(),
  outputSchema: FieldDescriptorArraySchema.optional(),
  isActive: z.boolean().optional(),
});

function redactAuth(row: { authHeader: string | null }): boolean {
  return row.authHeader !== null && row.authHeader !== '';
}

export const customActionHandlerRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const rows = await ctx.prismaWithTenant.customActionHandler.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    const registry = getCustomActionHandlerRegistry();
    registry.invalidateTenant(tenantId);
    await registry.loadTenant(ctx.prismaWithTenant as never, tenantId);

    return {
      items: rows.map((r) => ({
        id: r.id,
        actionTypeId: r.actionTypeId,
        label: r.label,
        description: r.description,
        endpointUrl: r.endpointUrl,
        hasAuthHeader: redactAuth(r),
        timeoutMs: r.timeoutMs,
        inputSchema: r.inputSchema as unknown,
        outputSchema: r.outputSchema as unknown,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }),

  create: adminTenantProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    if (RESERVED_ACTION_IDS.has(input.actionTypeId)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `actionTypeId "${input.actionTypeId}" is reserved by a built-in action`,
      });
    }

    const created = await ctx.prismaWithTenant.customActionHandler.create({
      data: {
        tenantId,
        actionTypeId: input.actionTypeId,
        label: input.label,
        description: input.description,
        endpointUrl: input.endpointUrl,
        authHeader: input.authHeader,
        timeoutMs: input.timeoutMs,
        inputSchema: input.inputSchema as object,
        outputSchema: input.outputSchema as object,
        isActive: input.isActive,
        createdBy: ctx.user.userId,
      },
    });

    getCustomActionHandlerRegistry().invalidateTenant(tenantId);
    // Do NOT return authHeader in the response
    return { ...created, authHeader: undefined, hasAuthHeader: redactAuth(created) };
  }),

  update: adminTenantProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.customActionHandler.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom action handler not found' });
    }

    const updated = await ctx.prismaWithTenant.customActionHandler.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.endpointUrl !== undefined && { endpointUrl: input.endpointUrl }),
        ...(input.authHeader !== undefined && { authHeader: input.authHeader }),
        ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
        ...(input.inputSchema !== undefined && { inputSchema: input.inputSchema as object }),
        ...(input.outputSchema !== undefined && { outputSchema: input.outputSchema as object }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    getCustomActionHandlerRegistry().invalidateTenant(tenantId);
    return { ...updated, authHeader: undefined, hasAuthHeader: redactAuth(updated) };
  }),

  delete: adminTenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const existing = await ctx.prismaWithTenant.customActionHandler.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom action handler not found' });
      }
      await ctx.prismaWithTenant.customActionHandler.update({
        where: { id: input.id },
        data: { isActive: false },
      });
      getCustomActionHandlerRegistry().invalidateTenant(tenantId);
      return { id: input.id, deleted: true };
    }),

  /**
   * Test endpoint — POSTs a small ping payload to the handler's endpointUrl
   * with its authHeader and returns the response summary. Admin-only.
   */
  test: adminTenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const row = await ctx.prismaWithTenant.customActionHandler.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom action handler not found' });
      }
      if (!isPublicHttpUrl(row.endpointUrl)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'endpointUrl blocked by SSRF guard' });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), row.timeoutMs);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-IntelliFlow-Source': 'workflow-custom-action-test',
      };
      if (row.authHeader) headers['Authorization'] = row.authHeader;

      let status = 0;
      let ok = false;
      let body = '';
      let errorMessage: string | undefined;
      try {
        const res = await fetch(row.endpointUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ping: true, actionTypeId: row.actionTypeId }),
          signal: controller.signal,
          redirect: 'manual',
        });
        status = res.status;
        ok = res.ok;
        body = (await res.text()).slice(0, 2000);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }

      return { id: input.id, status, ok, body, errorMessage };
    }),
});
