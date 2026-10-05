/**
 * Ticket Routing Router (IFC-067)
 *
 * tRPC endpoints for automatic ticket routing:
 * - autoRoute: AI-powered ticket assignment (mutation)
 * - suggestAssignee: Get ranked agent candidates (query)
 * - listRules/createRule/updateRule/deleteRule/toggleRule: ticket automation rule CRUD
 *   (routing_rules rows with ruleType = 'TICKET'; lead rules are never visible here)
 */

import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import { createTRPCRouter, moduleTenantProcedure } from '../../trpc';
import {
  autoRouteInputSchema,
  suggestAssigneeInputSchema,
  createTicketRuleSchema,
  updateTicketRuleSchema,
  listTicketRulesSchema,
  ticketRuleIdSchema,
  toggleTicketRuleSchema,
  ticketRuleActionSchema,
  ticketRuleConditionSchema,
  type TicketAutomationRuleDto,
} from '@intelliflow/validators';
import { type Context } from '../../context';
import type { TicketRoutingService } from '../../services/TicketRoutingService';

// ADR-070: server-side SUPPORT entitlement — ticket routers
// (a tenant on a plan without it must not reach these endpoints directly).
const tenantProcedure = moduleTenantProcedure('SUPPORT');

/**
 * Helper to get ticket routing service from context.
 * Throws INTERNAL_SERVER_ERROR when service is not wired.
 */
function getTicketRoutingService(ctx: Context): TicketRoutingService {
  const service = (ctx.services as any)?.ticketRouting;
  if (!service) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ticket routing service not available',
    });
  }
  return service as TicketRoutingService;
}

interface TicketRuleRow {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  isActive: boolean;
  conditions: unknown;
  actions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map a stored RoutingRule row to the client DTO. Stored JSON that no longer
 * parses surfaces as an empty list (the engine skips such rules) instead of
 * failing the whole listing.
 */
function toTicketRuleDto(row: TicketRuleRow): TicketAutomationRuleDto {
  const conditions = ticketRuleConditionSchema.array().safeParse(row.conditions);
  const actions = ticketRuleActionSchema.array().safeParse(row.actions);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    isActive: row.isActive,
    conditions: conditions.success ? conditions.data : [],
    actions: actions.success ? actions.data : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * assign_to_user targets are stored as free text; reject any that is not a user of the
 * caller's tenant, so a rule cannot point at another tenant's user.
 */
async function assertAssigneesInTenant(
  db: Pick<Context['prisma'], 'user'>,
  tenantId: string,
  actions: ReadonlyArray<{ type: string; target: string }> | undefined
): Promise<void> {
  const userIds = (actions ?? []).filter((a) => a.type === 'assign_to_user').map((a) => a.target);
  if (userIds.length === 0) return;
  const found = await db.user.count({
    where: { id: { in: userIds }, ...tenantUserWhere(tenantId) },
  });
  if (found !== new Set(userIds).size) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'assign_to_user target must be a user in this tenant',
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function conflictOnDuplicateName(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'A routing rule with this name already exists (rule names are shared with lead routing rules)',
    });
  }
  throw error;
}

export const ticketRoutingRouter = createTRPCRouter({
  /**
   * Auto-route a ticket using AI classification + agent matching.
   *
   * AC-001: autoRoute assigns based on AI-inferred category and agent skills
   * AC-005: Atomic transaction (Prisma.$transaction)
   * AC-007: Emits TicketRoutedEvent on success, TicketRoutingFailedEvent on failure
   */
  autoRoute: tenantProcedure.input(autoRouteInputSchema).mutation(async ({ ctx, input }) => {
    const service = getTicketRoutingService(ctx);
    const tenantId = ctx.tenant.tenantId;

    // Fetch the ticket to get subject, description, priority
    const ticket = await ctx.prismaWithTenant.ticket.findFirst({
      where: { id: input.ticketId, tenantId },
    });

    if (!ticket) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    // Check SLA escalation
    const isEscalation = await service.checkSlaEscalation(input.ticketId, tenantId);

    // Check routing rules
    const category = input.category || 'GENERAL';
    const matchingRule = await service.findMatchingRule(tenantId, category, ticket.priority, {
      status: ticket.status,
      slaStatus: ticket.slaStatus,
    });

    // Get eligible agents
    const candidates = await service.suggestAssignees(tenantId, category, 10);

    // A matching rule resolves its own assignee, so it needs no category candidates.
    if (candidates.length === 0 && (isEscalation || !matchingRule)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No eligible agents available for routing',
      });
    }

    let assigneeId: string;
    let assigneeName: string;
    let reason: string;
    let routingMethod: string;
    let matchedSkill: string | null = null;
    let ruleId: string | null = null;

    if (isEscalation) {
      // Escalation: pick first available (highest proficiency)
      assigneeId = candidates[0].agentId;
      assigneeName = candidates[0].name;
      reason = 'SLA breach escalation — assigned to available agent';
      routingMethod = 'escalation';
    } else if (matchingRule) {
      // Rule match
      assigneeId = matchingRule.assignToUserId;
      assigneeName = matchingRule.assigneeName;
      reason = `Rule match: ${matchingRule.ruleName}`;
      routingMethod = 'rule_match';
      ruleId = matchingRule.id;
    } else {
      // Skill/load balance
      assigneeId = candidates[0].agentId;
      assigneeName = candidates[0].name;
      reason = input.reason || `Skill match for category ${category}`;
      routingMethod = 'skill_match';
      matchedSkill = candidates[0].skills[0] || null;
    }

    const result = await service.routeTicket({
      ticketId: input.ticketId,
      tenantId,
      inferredCategory: category,
      assigneeId,
      assigneeName,
      reason,
      routingMethod,
      matchedSkill,
      ruleId,
      confidence: 0.85,
      executionTimeMs: 0,
      modelVersion: 'router:v1',
      isFallback: false,
    });

    return {
      ticketId: result.ticketId,
      assignedUserId: result.assigneeId,
      assignedUserName: result.assigneeName,
      auditId: result.auditId,
      reason: result.reason,
    };
  }),

  /**
   * Suggest assignees for a ticket — pure query, no side effects.
   *
   * AC-002: suggestAssignee returns ranked candidates without side effects
   */
  suggestAssignee: tenantProcedure
    .input(suggestAssigneeInputSchema)
    .query(async ({ ctx, input }) => {
      const service = getTicketRoutingService(ctx);
      const tenantId = ctx.tenant.tenantId;

      const candidates = await service.suggestAssignees(tenantId, input.category, input.limit);

      return { candidates };
    }),
  /**
   * List ticket automation rules, in evaluation order (priority DESC).
   */
  listRules: tenantProcedure.input(listTicketRulesSchema).query(async ({ ctx, input }) => {
    const rules = await ctx.prismaWithTenant.routingRule.findMany({
      where: {
        tenantId: ctx.tenant.tenantId,
        ruleType: 'TICKET',
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rules.map(toTicketRuleDto);
  }),

  /**
   * Create a ticket automation rule.
   */
  createRule: tenantProcedure.input(createTicketRuleSchema).mutation(async ({ ctx, input }) => {
    await assertAssigneesInTenant(ctx.prismaWithTenant, ctx.tenant.tenantId, input.actions);
    try {
      const rule = await ctx.prismaWithTenant.routingRule.create({
        data: {
          tenantId: ctx.tenant.tenantId,
          ruleType: 'TICKET',
          name: input.name,
          description: input.description ?? null,
          priority: input.priority,
          isActive: input.isActive,
          conditions: input.conditions,
          actions: input.actions,
          createdBy: ctx.tenant.userId,
        },
      });
      return toTicketRuleDto(rule);
    } catch (error) {
      return conflictOnDuplicateName(error);
    }
  }),

  /**
   * Update a ticket automation rule. Only provided fields change.
   */
  updateRule: tenantProcedure.input(updateTicketRuleSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const where = { id, tenantId: ctx.tenant.tenantId, ruleType: 'TICKET' } as const;

    const existing = await ctx.prismaWithTenant.routingRule.findFirst({ where });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket rule not found' });
    }
    await assertAssigneesInTenant(ctx.prismaWithTenant, ctx.tenant.tenantId, data.actions);

    try {
      const rule = await ctx.prismaWithTenant.routingRule.update({ where, data });
      return toTicketRuleDto(rule);
    } catch (error) {
      return conflictOnDuplicateName(error);
    }
  }),

  /**
   * Delete a ticket automation rule.
   */
  deleteRule: tenantProcedure.input(ticketRuleIdSchema).mutation(async ({ ctx, input }) => {
    const where = {
      id: input.id,
      tenantId: ctx.tenant.tenantId,
      ruleType: 'TICKET',
    } as const;

    const existing = await ctx.prismaWithTenant.routingRule.findFirst({ where });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket rule not found' });
    }

    await ctx.prismaWithTenant.routingRule.delete({ where });
    return { id: input.id };
  }),

  /**
   * Enable or disable a ticket automation rule.
   */
  toggleRule: tenantProcedure.input(toggleTicketRuleSchema).mutation(async ({ ctx, input }) => {
    const where = {
      id: input.id,
      tenantId: ctx.tenant.tenantId,
      ruleType: 'TICKET',
    } as const;

    const existing = await ctx.prismaWithTenant.routingRule.findFirst({ where });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket rule not found' });
    }

    const rule = await ctx.prismaWithTenant.routingRule.update({
      where,
      data: { isActive: input.isActive },
    });
    return toTicketRuleDto(rule);
  }),
});
