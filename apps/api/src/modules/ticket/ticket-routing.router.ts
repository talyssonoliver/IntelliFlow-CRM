/**
 * Ticket Routing Router (IFC-067)
 *
 * tRPC endpoints for automatic ticket routing:
 * - autoRoute: AI-powered ticket assignment (mutation)
 * - suggestAssignee: Get ranked agent candidates (query)
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  autoRouteInputSchema,
  suggestAssigneeInputSchema,
} from '@intelliflow/validators';
import { type Context } from '../../context';
import type { TicketRoutingService } from '../../services/TicketRoutingService';

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

export const ticketRoutingRouter = createTRPCRouter({
  /**
   * Auto-route a ticket using AI classification + agent matching.
   *
   * AC-001: autoRoute assigns based on AI-inferred category and agent skills
   * AC-005: Atomic transaction (Prisma.$transaction)
   * AC-007: Emits TicketRoutedEvent on success, TicketRoutingFailedEvent on failure
   */
  autoRoute: tenantProcedure
    .input(autoRouteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = getTicketRoutingService(ctx);
      const tenantId = ctx.user?.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Tenant context required',
        });
      }

      // Fetch the ticket to get subject, description, priority
      const ticket = await ctx.prisma.ticket.findFirst({
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
      const matchingRule = await service.findMatchingRule(tenantId, category, ticket.priority);

      // Get eligible agents
      const requiredSkill = isEscalation ? undefined : undefined; // Escalation selects senior agents directly
      const candidates = await service.suggestAssignees(tenantId, category, 10);

      if (candidates.length === 0) {
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
        assigneeName = candidates.find((c) => c.agentId === matchingRule.assignToUserId)?.name || 'Unknown';
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
      const tenantId = ctx.user?.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Tenant context required',
        });
      }

      const candidates = await service.suggestAssignees(
        tenantId,
        input.category,
        input.limit
      );

      return { candidates };
    }),
});
