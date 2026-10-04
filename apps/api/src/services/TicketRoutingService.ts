/**
 * Ticket Routing Service (IFC-067)
 *
 * Handles automatic ticket routing based on AI classification,
 * agent skills, availability, and routing rules.
 *
 * Strategy evaluation order:
 * 1. Escalation check (SLA BREACHED → senior agent)
 * 2. Rule match (RoutingRule records by priority DESC)
 * 3. Skill match (AI category → skill → best agent)
 * 4. Load balance (lowest-load ONLINE agent)
 * 5. No-match (generic queue + TicketRoutingFailedEvent)
 */

import type { PrismaClient } from '@intelliflow/db';
import {
  TICKET_CATEGORY_SKILL_MAP,
  evaluateTicketRoutingConditions,
  type TicketCategory,
  type TicketRoutingContext,
} from '@intelliflow/domain';
import { ticketRuleActionSchema, ticketRuleConditionSchema } from '@intelliflow/validators';

export interface EligibleAgent {
  agentId: string;
  name: string;
  skills: string[];
  currentLoad: number;
  maxCapacity: number;
  status: string;
  proficiency?: number;
}

export interface RoutingResult {
  ticketId: string;
  assigneeId: string;
  assigneeName: string;
  auditId: string;
  reason: string;
  routingMethod: string;
  matchedSkill: string | null;
  ruleId: string | null;
}

export interface RoutingFailure {
  ticketId: string;
  failureReason: string;
  attemptedStrategies: string[];
  fallbackQueueId: string | null;
}

export class TicketRoutingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get eligible agents for routing — filtered by tenant, status, capacity.
   * Optionally filters by required skill.
   */
  async getEligibleAgents(tenantId: string, requiredSkill?: string): Promise<EligibleAgent[]> {
    // Query agent availability (ONLINE or BUSY, under capacity)
    const availabilities = await (this.prisma as any).agentAvailability.findMany({
      where: {
        tenantId,
        status: { in: ['ONLINE', 'BUSY'] },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    // Filter agents under capacity
    const underCapacity = availabilities.filter((a: any) => a.currentCapacity < a.maxCapacity);

    // If skill required, query AgentSkill for matching
    if (requiredSkill) {
      const skillRecords = await (this.prisma as any).agentSkill.findMany({
        where: {
          tenantId,
          skillName: requiredSkill,
          userId: { in: underCapacity.map((a: any) => a.userId) },
        },
        orderBy: { proficiency: 'desc' },
      });

      const skillMap = new Map<string, number>();
      for (const sr of skillRecords) {
        skillMap.set(sr.userId, sr.proficiency);
      }

      return underCapacity
        .filter((a: any) => skillMap.has(a.userId))
        .map((a: any) => ({
          agentId: a.userId,
          name: a.user?.name || 'Unknown',
          skills: [requiredSkill],
          currentLoad: a.currentCapacity,
          maxCapacity: a.maxCapacity,
          status: a.status,
          proficiency: skillMap.get(a.userId),
        }))
        .sort((a: EligibleAgent, b: EligibleAgent) => (b.proficiency ?? 0) - (a.proficiency ?? 0));
    }

    return underCapacity.map((a: any) => ({
      agentId: a.userId,
      name: a.user?.name || 'Unknown',
      skills: [],
      currentLoad: a.currentCapacity,
      maxCapacity: a.maxCapacity,
      status: a.status,
    }));
  }

  /**
   * Suggest assignees for a ticket — pure query, no side effects.
   */
  async suggestAssignees(
    tenantId: string,
    category?: TicketCategory,
    limit: number = 5
  ): Promise<EligibleAgent[]> {
    const requiredSkill = category ? TICKET_CATEGORY_SKILL_MAP[category] : undefined;
    const agents = await this.getEligibleAgents(tenantId, requiredSkill);
    return agents.slice(0, limit);
  }

  /**
   * Route a ticket to an agent using the strategy evaluation order.
   * Uses Prisma.$transaction for atomicity.
   */
  async routeTicket(params: {
    ticketId: string;
    tenantId: string;
    inferredCategory: TicketCategory;
    assigneeId: string;
    assigneeName: string;
    reason: string;
    routingMethod: string;
    matchedSkill: string | null;
    ruleId: string | null;
    confidence: number;
    executionTimeMs: number;
    modelVersion: string;
    isFallback: boolean;
  }): Promise<RoutingResult> {
    const result = await this.prisma.$transaction(async (tx: any) => {
      // 0. Guard: reject ARCHIVED tickets
      const ticket = await tx.ticket.findUnique({
        where: { id: params.ticketId },
        select: { status: true },
      });
      if (!ticket) {
        throw new Error(`Ticket ${params.ticketId} not found`);
      }
      if (ticket.status === 'ARCHIVED') {
        throw new Error('Cannot route an archived ticket');
      }

      // 1. Update ticket assignee
      await tx.ticket.update({
        where: { id: params.ticketId },
        data: {
          assigneeId: params.assigneeId,
          updatedAt: new Date(),
        },
      });

      // 2. Increment agent load
      await tx.agentAvailability.updateMany({
        where: {
          userId: params.assigneeId,
          tenantId: params.tenantId,
        },
        data: {
          currentCapacity: { increment: 1 },
        },
      });

      // 3. Create routing audit record
      const audit = await tx.routingAudit.create({
        data: {
          tenantId: params.tenantId,
          ticketId: params.ticketId,
          assignedUserId: params.assigneeId,
          routingMethod: params.routingMethod,
          ruleId: params.ruleId,
          classifiedSkill: params.matchedSkill,
          confidence: params.confidence,
          executionTimeMs: params.executionTimeMs,
          modelVersion: params.modelVersion,
          isFallback: params.isFallback,
          reason: params.reason,
        },
      });

      return audit;
    });

    return {
      ticketId: params.ticketId,
      assigneeId: params.assigneeId,
      assigneeName: params.assigneeName,
      auditId: result.id,
      reason: params.reason,
      routingMethod: params.routingMethod,
      matchedSkill: params.matchedSkill,
      ruleId: params.ruleId,
    };
  }

  /**
   * Find the first active ticket rule (priority DESC, then oldest first) whose
   * conditions all match, and resolve its assignment to a concrete user.
   *
   * Rules are stored as arrays of { field, operator, value } / { type, target }
   * (see ticketRuleConditionSchema). Only ruleType = 'TICKET' rows are read, and
   * rows that no longer parse are skipped rather than matched by accident.
   * `assign_to_skill` resolves to the best eligible agent holding that skill; a
   * rule with no resolvable assignee is skipped so later rules still get a turn.
   */
  async findMatchingRule(
    tenantId: string,
    category: TicketCategory,
    priority: string,
    facts: { status?: string; slaStatus?: string | null } = {}
  ): Promise<{ id: string; assignToUserId: string; ruleName: string } | null> {
    const rules = await this.prisma.routingRule.findMany({
      where: { tenantId, ruleType: 'TICKET', isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const context: Partial<TicketRoutingContext> = {
      ticketCategory: category,
      ticketPriority: priority,
      isSlaBreached: String(facts.slaStatus === 'BREACHED'),
    };
    if (facts.status) context.ticketStatus = facts.status;
    if (facts.slaStatus) context.slaStatus = facts.slaStatus;

    for (const rule of rules) {
      const conditions = ticketRuleConditionSchema.array().safeParse(rule.conditions);
      const actions = ticketRuleActionSchema.array().safeParse(rule.actions);
      if (!conditions.success || !actions.success) continue;
      if (!evaluateTicketRoutingConditions(conditions.data, context)) continue;

      const assignToUserId = await this.resolveRuleAssignee(tenantId, actions.data);
      if (assignToUserId) {
        return { id: rule.id, assignToUserId, ruleName: rule.name };
      }
    }

    return null;
  }

  private async resolveRuleAssignee(
    tenantId: string,
    actions: Array<{ type: string; target: string }>
  ): Promise<string | null> {
    const userAction = actions.find((a) => a.type === 'assign_to_user');
    if (userAction) {
      // The target is free text in the stored rule: only assign to a user of this tenant,
      // so a rule can never route a ticket to another tenant's user (or a deleted one).
      const user = await this.prisma.user.findFirst({
        where: { id: userAction.target, tenantId },
        select: { id: true },
      });
      return user?.id ?? null;
    }

    const skillAction = actions.find((a) => a.type === 'assign_to_skill');
    if (skillAction) {
      const agents = await this.getEligibleAgents(tenantId, skillAction.target);
      return agents[0]?.agentId ?? null;
    }

    return null;
  }

  /**
   * Check if ticket has SLA breach requiring escalation.
   */
  async checkSlaEscalation(ticketId: string, tenantId: string): Promise<boolean> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { slaStatus: true },
    });

    return ticket?.slaStatus === 'BREACHED';
  }
}
