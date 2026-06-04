/**
 * Routing Router - PG-132: Smart Lead Routing UI
 *
 * Lightweight tRPC router for routing rule CRUD and lead assignment.
 * Uses direct Prisma access (full routing engine deferred to IFC-030).
 *
 * Endpoints:
 * - list/get/create/update/delete — RoutingRule CRUD
 * - reorder/toggle — Priority and active state management
 * - getAssignments — Recent lead assignments from RoutingAudit
 * - getAgentWorkload — Agent availability and capacity
 * - getLeadQueue — Unassigned leads
 * - assignLead — Manual lead assignment
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  createRoutingRuleSchema,
  updateRoutingRuleSchema,
  autoRouteLeadInputSchema,
  suggestLeadAssigneeInputSchema,
} from '@intelliflow/validators';
import type { LeadRoutingService } from '../../services/LeadRoutingService';
import type { Context } from '../../context';

/**
 * Helper — extracts LeadRoutingService from context.
 * Mirrors ticket-routing.router.ts pattern.
 */
function getLeadRoutingService(ctx: Context): LeadRoutingService {
  const service = ctx.services?.leadRouting;
  if (!service) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'LeadRoutingService not configured',
    });
  }
  return service;
}

export const routingRouter = createTRPCRouter({
  /**
   * List routing rules with optional filtering and cursor pagination
   */
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        isActive: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      const where: Record<string, unknown> = { tenantId };
      if (input.isActive !== undefined) {
        where.isActive = input.isActive;
      }

      const rules = await ctx.prismaWithTenant.routingRule.findMany({
        where,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { priority: 'asc' },
      });

      let nextCursor: string | undefined;
      if (rules.length > input.limit) {
        const next = rules.pop();
        nextCursor = next?.id;
      }

      return { items: rules, nextCursor };
    }),

  /**
   * Get a single routing rule by ID
   */
  get: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const rule = await ctx.prismaWithTenant.routingRule.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
    return rule;
  }),

  /**
   * Create a new routing rule
   */
  create: tenantProcedure.input(createRoutingRuleSchema).mutation(async ({ ctx, input }) => {
    return ctx.prismaWithTenant.routingRule.create({
      data: {
        tenantId: ctx.tenant.tenantId,
        name: input.name,
        description: input.description ?? null,
        priority: input.priority,
        isActive: input.isActive,
        conditions: input.conditions as any,
        actions: input.actions as any,
        createdBy: ctx.tenant.userId,
      },
    });
  }),

  /**
   * Update an existing routing rule
   */
  update: tenantProcedure.input(updateRoutingRuleSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const tenantId = ctx.tenant.tenantId;

    // Verify rule exists and belongs to this tenant
    const existing = await ctx.prismaWithTenant.routingRule.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Routing rule not found' });
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.conditions !== undefined) updateData.conditions = data.conditions as any;
    if (data.actions !== undefined) updateData.actions = data.actions as any;

    return ctx.prismaWithTenant.routingRule.update({
      where: { id },
      data: updateData,
    });
  }),

  /**
   * Delete a routing rule
   */
  delete: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prismaWithTenant.routingRule.findFirst({
      where: { id: input.id, tenantId: ctx.tenant.tenantId },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Routing rule not found' });
    }

    return ctx.prismaWithTenant.routingRule.delete({ where: { id: input.id } });
  }),

  /**
   * Batch reorder routing rules by updating priorities
   */
  reorder: tenantProcedure
    .input(
      z.object({
        rules: z.array(z.object({ id: z.string(), priority: z.number() })),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      // Verify all rules belong to this tenant before reordering
      const ruleIds = input.rules.map((r) => r.id);
      const ownedCount = await ctx.prismaWithTenant.routingRule.count({
        where: { id: { in: ruleIds }, tenantId },
      });
      if (ownedCount !== ruleIds.length) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'One or more routing rules do not belong to this tenant',
        });
      }

      await ctx.prismaWithTenant.$transaction(
        input.rules.map((rule) =>
          ctx.prismaWithTenant.routingRule.update({
            where: { id: rule.id },
            data: { priority: rule.priority },
          })
        )
      );
      return { success: true };
    }),

  /**
   * Toggle a rule's active/inactive status
   */
  toggle: tenantProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prismaWithTenant.routingRule.findFirst({
        where: { id: input.id, tenantId: ctx.tenant.tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Routing rule not found' });
      }

      return ctx.prismaWithTenant.routingRule.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
    }),

  /**
   * Get recent lead assignments from RoutingAudit.
   * RoutingAudit stores flat fields (ruleName, toUserName) not relations,
   * so we map them to the shape the frontend expects.
   */
  getAssignments: tenantProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const audits = await ctx.prismaWithTenant.routingAudit.findMany({
        where: { tenantId: ctx.tenant.tenantId },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined;
      if (audits.length > input.limit) {
        const next = audits.pop();
        nextCursor = next?.id;
      }

      // Map flat fields to the shape the frontend components expect
      const items = audits.map((audit) => ({
        ...audit,
        rule: audit.ruleId ? { name: audit.ruleName ?? 'Unknown' } : null,
        assignedTo: { id: audit.toUserId, name: audit.toUserName, email: '' },
      }));

      return { items, nextCursor };
    }),

  /**
   * Get agent workload (availability + capacity).
   * AgentAvailability stores userId/userName as flat fields.
   */
  getAgentWorkload: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const agents = await ctx.prismaWithTenant.agentAvailability.findMany({
      where: { tenantId },
      orderBy: { currentCapacity: 'asc' },
    });

    // Get skills for all agents
    const userIds = agents.map((a) => a.userId);
    const skills = await ctx.prismaWithTenant.agentSkill.findMany({
      where: { userId: { in: userIds }, tenantId },
    });

    const skillsByUser = new Map<string, typeof skills>();
    for (const skill of skills) {
      const existing = skillsByUser.get(skill.userId) ?? [];
      existing.push(skill);
      skillsByUser.set(skill.userId, existing);
    }

    return agents.map((agent) => ({
      ...agent,
      user: { id: agent.userId, name: agent.userName, email: '' },
      skills: skillsByUser.get(agent.userId) ?? [],
    }));
  }),

  /**
   * Get unassigned leads (queue)
   */
  getLeadQueue: tenantProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        scoreMin: z.number().optional(),
        source: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        tenantId: ctx.tenant.tenantId,
        status: 'NEW',
      };
      if (input.scoreMin !== undefined) {
        where.score = { gte: input.scoreMin };
      }
      if (input.source) {
        where.source = input.source;
      }

      return ctx.prismaWithTenant.lead.findMany({
        where,
        take: input.limit,
        orderBy: { score: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          score: true,
          source: true,
          status: true,
          estimatedValue: true,
          createdAt: true,
        },
      });
    }),

  /**
   * Manually assign a lead to a user
   * Creates RoutingAudit entry and updates lead ownerId
   */
  assignLead: tenantProcedure
    .input(
      z.object({
        leadId: z.string(),
        userId: z.string(),
        reason: z.string().default('manual'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;

      return ctx.prismaWithTenant.$transaction(async (tx) => {
        // Verify lead belongs to this tenant
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, tenantId },
        });
        if (!lead) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
        }

        // Update lead owner
        await tx.lead.update({
          where: { id: input.leadId },
          data: { ownerId: input.userId },
        });

        // Create audit entry with flat fields
        const audit = await tx.routingAudit.create({
          data: {
            tenantId,
            ticketId: input.leadId,
            reason: input.reason,
            toUserId: input.userId,
            toUserName: '',
            details: { leadId: input.leadId },
          },
        });

        return audit;
      });
    }),

  // ── IFC-030: Automated Lead Routing ────────────────────

  /**
   * Auto-route a lead using the routing engine.
   * Strategy: rule match → skill match → load balance.
   * SCOPE BOUNDARY: Does NOT modify existing assignLead (D4).
   */
  autoRouteLead: tenantProcedure
    .input(autoRouteLeadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = getLeadRoutingService(ctx);
      const tenantId = ctx.tenant.tenantId;

      const result = await service.routeLead({
        leadId: input.leadId,
        tenantId,
        reason: input.reason,
        forceReroute: input.forceReroute,
      });

      // AC-007: publish LeadRoutedEvent via the shared event bus (same bus used
      // by LeadService, ContactService, etc. — wired in container.ts).
      if (result.events?.length) {
        const eventBus = ctx.container?.adapters?.eventBus;
        if (eventBus) await eventBus.publishAll(result.events);
      }

      return {
        leadId: result.leadId,
        assignedUserId: result.assigneeId,
        assignedUserName: result.assigneeName,
        auditId: result.auditId,
        reason: result.reason,
        routingMethod: result.routingMethod,
      };
    }),

  /**
   * Suggest lead assignees — pure query, no side effects.
   */
  suggestLeadAssignee: tenantProcedure
    .input(suggestLeadAssigneeInputSchema)
    .query(async ({ ctx, input }) => {
      const service = getLeadRoutingService(ctx);
      const tenantId = ctx.tenant.tenantId;

      const candidates = await service.suggestAssignees(tenantId, input.scoreTier, input.limit);

      return { candidates };
    }),
});
