/**
 * Lead Routing Service (IFC-030)
 *
 * Score-based lead routing engine with load balancing.
 * Evaluates routing rules against lead attributes and implements
 * weighted scoring across agents based on capacity and skill match.
 *
 * Strategy evaluation order:
 * 1. Rule match (RoutingRule records by priority DESC)
 * 2. Skill match (HOT leads → highest proficiency agent)
 * 3. Load balance (lowest-load ONLINE agent)
 * 4. No-match (error — no eligible agents)
 *
 * CRITICAL: Writes ONLY schema-valid fields to RoutingAudit.
 * Does NOT replicate TicketRoutingService phantom-field bug.
 * Schema fields: ticketId, ruleId, ruleName, toUserId, toUserName, reason, details
 */

import type { PrismaClient } from '@intelliflow/db';
import { LeadRoutedEvent, type LeadId } from '@intelliflow/domain';
import type { Tracer } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

// ── Module-level tracer (IFC-032: OTel span emission for capture-trace-examples) ──
let _workflowTracer: Tracer | null = null;

/**
 * Set (or clear) the OTel Tracer used to emit `workflow.lead.route` spans.
 * Called by tools/scripts/observability/capture-trace-examples.ts during
 * hermetic trace capture. In production the tracer is never set — zero overhead.
 */
export function setWorkflowTracer(tracer: Tracer | null): void {
  _workflowTracer = tracer;
}

// ── Interfaces ──────────────────────────────────────────────

export interface LeadContext {
  score: number;
  source: string;
  status: string;
  estimatedValue: number | null;
  location: string | null;
  tags: string[];
}

export interface EligibleAgent {
  agentId: string;
  name: string;
  skills: string[];
  currentLoad: number;
  maxCapacity: number;
  status: string;
  proficiency?: number;
  routingScore?: number;
}

export interface MatchedRule {
  ruleId: string;
  ruleName: string;
  assigneeId: string;
}

export interface LeadRouteParams {
  leadId: string;
  tenantId: string;
  reason?: string;
  forceReroute?: boolean;
}

export interface LeadRoutingResult {
  leadId: string;
  assigneeId: string;
  assigneeName: string;
  auditId: string;
  reason: string;
  routingMethod: string;
  matchedSkill: string | null;
  ruleId: string | null;
  score: number;
  executionTimeMs: number;
  events?: LeadRoutedEvent[];
}

interface RoutingCondition {
  field: string;
  operator: string;
  value: unknown;
}

// Numeric fields that do NOT support 'contains' operator
const NUMERIC_FIELDS = new Set(['leadScore', 'estimatedValue']);

// ── Service ─────────────────────────────────────────────────

export class LeadRoutingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get eligible agents for routing — filtered by tenant, status, capacity.
   * Optionally filters by required skill.
   */
  async getEligibleAgents(tenantId: string, requiredSkill?: string): Promise<EligibleAgent[]> {
    const availabilities = await (this.prisma as any).agentAvailability.findMany({
      where: {
        tenantId,
        status: { in: ['ONLINE', 'BUSY'] },
      },
    });

    // Filter agents under capacity
    const underCapacity = availabilities.filter((a: any) => a.currentCapacity < a.maxCapacity);

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
          name: a.userName || 'Unknown',
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
      name: a.userName || 'Unknown',
      skills: [],
      currentLoad: a.currentCapacity,
      maxCapacity: a.maxCapacity,
      status: a.status,
    }));
  }

  /**
   * Suggest assignees for a lead — pure query, no side effects.
   */
  async suggestAssignees(
    tenantId: string,
    scoreTier?: 'HOT' | 'WARM' | 'COLD',
    limit: number = 5
  ): Promise<EligibleAgent[]> {
    const agents = await this.getEligibleAgents(tenantId);
    return agents.slice(0, limit);
  }

  /**
   * Find first matching routing rule for a lead context.
   * Rules are ordered by priority DESC — first match wins.
   */
  async findMatchingRule(tenantId: string, leadContext: LeadContext): Promise<MatchedRule | null> {
    const rules = await (this.prisma as any).routingRule.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      const conditions: RoutingCondition[] =
        typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;

      if (this.evaluateConditions(conditions, leadContext)) {
        const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;

        const assignAction = (actions as any[]).find((a: any) => a.type === 'assign_to_user');

        if (assignAction?.target) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            assigneeId: assignAction.target,
          };
        }
      }
    }

    return null;
  }

  /**
   * Route a lead to an agent using the strategy evaluation order.
   * Uses Prisma.$transaction for atomicity.
   *
   * Transaction steps:
   * 1. Guard: lead exists, not CONVERTED/LOST, not already assigned (unless forceReroute)
   * 2. tx.lead.update — ownerId + status → CONTACTED
   * 3. tx.agentAvailability.updateMany — increment capacity
   * 4. tx.routingAudit.create — schema-valid fields ONLY
   * 5. Post-transaction: emit LeadRoutedEvent
   */
  async routeLead(params: LeadRouteParams): Promise<LeadRoutingResult> {
    // IFC-032: if a tracer is set (capture-trace-examples script), wrap in a span.
    if (_workflowTracer) {
      // Generate a per-invocation workflow UUID so the span attribute satisfies the
      // UUID pattern required by trace-examples.schema.json#/properties/workflow_id.
      const workflowId = randomUUID();
      return _workflowTracer.startActiveSpan('workflow.lead.route', async (span) => {
        try {
          const r = await this._routeLeadImpl(params);
          span.setAttribute('workflow.id', workflowId);
          span.setAttribute('route.id', r.ruleId ? `rule:${r.ruleId}` : 'rule:none');
          span.setAttribute('routing.method', r.routingMethod);
          span.setAttribute('routing.score', r.score);
          span.setStatus({ code: SpanStatusCode.OK });
          return r;
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      });
    }
    return this._routeLeadImpl(params);
  }

  private async _routeLeadImpl(params: LeadRouteParams): Promise<LeadRoutingResult> {
    const startTime = performance.now();

    const result = await this.prisma.$transaction(async (tx: any) => {
      // Step 1: Guard — find lead
      const lead = await tx.lead.findFirst({
        where: { id: params.leadId, tenantId: params.tenantId },
      });

      if (!lead) {
        throw new Error(`Lead ${params.leadId} not found`);
      }

      if (lead.status === 'CONVERTED' || lead.status === 'LOST') {
        throw new Error(`Cannot route a ${lead.status.toLowerCase()} lead`);
      }

      // Idempotency guard (AC-006)
      if (lead.ownerId && !params.forceReroute) {
        throw new Error(`Lead ${params.leadId} is already assigned. Use forceReroute to reassign.`);
      }

      // Build lead context for routing
      const leadContext: LeadContext = {
        score: lead.score ?? 0,
        source: lead.source ?? '',
        status: lead.status ?? 'NEW',
        estimatedValue: lead.estimatedValue ?? null,
        location: lead.location ?? null,
        tags: lead.tags ?? [],
      };

      // Strategy 1: Try rule match
      const matchedRule = await this.findMatchingRuleInTx(tx, params.tenantId, leadContext);

      let assigneeId: string;
      let assigneeName: string;
      let reason: string;
      let routingMethod: string;
      let matchedSkill: string | null = null;
      let ruleId: string | null = null;
      let ruleName: string | null = null;
      let routingScore = 0;

      if (matchedRule) {
        // Rule match
        assigneeId = matchedRule.assigneeId;
        reason = 'rule_match';
        routingMethod = 'rule_match';
        ruleId = matchedRule.ruleId;
        ruleName = matchedRule.ruleName;

        // Pre-transaction lookup for toUserName (D8 — never write '')
        const availability = await tx.agentAvailability.findMany({
          where: { userId: assigneeId, tenantId: params.tenantId },
        });
        assigneeName = availability[0]?.userName || 'Unknown';
      } else {
        // Strategy 2/3: Skill match or load balance
        const eligibleAgents = await this.getEligibleAgentsInTx(tx, params.tenantId);

        if (eligibleAgents.length === 0) {
          throw new Error('No eligible agents available for routing');
        }

        // HOT leads (score >= 80) → try skill match first
        if (leadContext.score >= 80) {
          // Try to find agents with sales skills, sorted by proficiency
          const skillAgents = await this.getEligibleAgentsInTx(tx, params.tenantId, 'sales');

          if (skillAgents.length > 0) {
            const bestAgent = skillAgents[0];
            assigneeId = bestAgent.agentId;
            assigneeName = bestAgent.name;
            reason = 'skill_match';
            routingMethod = 'skill_match';
            matchedSkill = 'sales';
            routingScore = this.computeRoutingScore(bestAgent, leadContext);
          } else {
            // Fallback to load balance for HOT leads
            const sorted = [...eligibleAgents].sort((a, b) => a.currentLoad - b.currentLoad);
            assigneeId = sorted[0].agentId;
            assigneeName = sorted[0].name;
            reason = 'load_balance';
            routingMethod = 'load_balance';
            routingScore = this.computeRoutingScore(sorted[0], leadContext);
          }
        } else {
          // Load balance for non-HOT leads
          const sorted = [...eligibleAgents].sort((a, b) => a.currentLoad - b.currentLoad);
          assigneeId = sorted[0].agentId;
          assigneeName = sorted[0].name;
          reason = 'load_balance';
          routingMethod = 'load_balance';
          routingScore = this.computeRoutingScore(sorted[0], leadContext);
        }
      }

      // Step 2: Update lead — ownerId + status → CONTACTED (AC-005)
      await tx.lead.update({
        where: { id: params.leadId },
        data: {
          ownerId: assigneeId,
          status: 'CONTACTED',
        },
      });

      // Step 3: Increment agent load
      await tx.agentAvailability.updateMany({
        where: { userId: assigneeId, tenantId: params.tenantId },
        data: { currentCapacity: { increment: 1 } },
      });

      const executionTimeMs = Math.round(performance.now() - startTime);

      // Step 4: Create routing audit — ONLY schema-valid fields (D2 — no phantom fields)
      const audit = await tx.routingAudit.create({
        data: {
          tenantId: params.tenantId,
          ticketId: params.leadId, // RoutingAudit.ticketId stores leadId
          ruleId: ruleId,
          ruleName: ruleName,
          toUserId: assigneeId,
          toUserName: assigneeName,
          reason,
          details: {
            entityType: 'lead',
            routingMethod,
            matchedSkill,
            executionTimeMs,
            score: routingScore,
          },
        },
      });

      return {
        leadId: params.leadId,
        assigneeId,
        assigneeName,
        auditId: audit.id,
        reason,
        routingMethod,
        matchedSkill,
        ruleId,
        score: routingScore,
        executionTimeMs,
      };
    });

    // Step 5: Post-transaction — emit LeadRoutedEvent (AC-007)
    const event = new LeadRoutedEvent(
      { value: result.leadId } as LeadId,
      result.assigneeId,
      result.routingMethod,
      result.ruleId,
      result.reason
    );

    return {
      ...result,
      events: [event],
    };
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Evaluate conditions against lead context.
   * 6 fields x 7 operators.
   * Throws if 'contains' used on numeric field (NF-005).
   */
  private evaluateConditions(conditions: RoutingCondition[], leadContext: LeadContext): boolean {
    for (const condition of conditions) {
      const fieldValue = this.getFieldValue(condition.field, leadContext);

      // NF-005: contains on numeric throws
      if (condition.operator === 'contains' && NUMERIC_FIELDS.has(condition.field)) {
        throw new Error(
          `'contains' operator is not supported for numeric field '${condition.field}'`
        );
      }

      if (!this.evaluateOperator(condition.operator, fieldValue, condition.value)) {
        return false;
      }
    }
    return true;
  }

  private getFieldValue(field: string, ctx: LeadContext): unknown {
    switch (field) {
      case 'leadScore':
        return ctx.score;
      case 'leadSource':
        return ctx.source;
      case 'leadStatus':
        return ctx.status;
      case 'estimatedValue':
        return ctx.estimatedValue;
      case 'location':
        return ctx.location;
      case 'tags':
        return ctx.tags;
      default:
        return undefined;
    }
  }

  private evaluateOperator(
    operator: string,
    fieldValue: unknown,
    conditionValue: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === conditionValue;
      case 'not_equals':
        return fieldValue !== conditionValue;
      case 'greater_than':
        return (
          typeof fieldValue === 'number' &&
          typeof conditionValue === 'number' &&
          fieldValue > conditionValue
        );
      case 'less_than':
        return (
          typeof fieldValue === 'number' &&
          typeof conditionValue === 'number' &&
          fieldValue < conditionValue
        );
      case 'in': {
        const arr = Array.isArray(conditionValue) ? conditionValue : [];
        if (Array.isArray(fieldValue)) {
          // For tags: any tag in the set
          return fieldValue.some((v) => arr.includes(v));
        }
        return arr.includes(fieldValue);
      }
      case 'not_in': {
        const arr = Array.isArray(conditionValue) ? conditionValue : [];
        if (Array.isArray(fieldValue)) {
          return !fieldValue.some((v) => arr.includes(v));
        }
        return !arr.includes(fieldValue);
      }
      case 'contains': {
        if (Array.isArray(fieldValue)) {
          // For tags: any tag matches
          return fieldValue.some((v) => String(v).includes(String(conditionValue)));
        }
        if (typeof fieldValue === 'string') {
          return fieldValue.includes(String(conditionValue));
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Compute composite routing score for ranking agents.
   * Score 0-1 based on capacity ratio, proficiency, and lead context.
   */
  private computeRoutingScore(agent: EligibleAgent, leadContext: LeadContext): number {
    // Capacity factor: prefer agents with lower load
    const capacityRatio = agent.maxCapacity > 0 ? 1 - agent.currentLoad / agent.maxCapacity : 0;

    // Proficiency factor: 1-5 scaled to 0-1
    const proficiencyFactor = (agent.proficiency ?? 3) / 5;

    // Weighted: 40% capacity, 60% proficiency
    return Math.round((capacityRatio * 0.4 + proficiencyFactor * 0.6) * 100) / 100;
  }

  /**
   * In-transaction version of getEligibleAgents.
   */
  private async getEligibleAgentsInTx(
    tx: any,
    tenantId: string,
    requiredSkill?: string
  ): Promise<EligibleAgent[]> {
    const availabilities = await tx.agentAvailability.findMany({
      where: {
        tenantId,
        status: { in: ['ONLINE', 'BUSY'] },
      },
    });

    const underCapacity = availabilities.filter((a: any) => a.currentCapacity < a.maxCapacity);

    if (requiredSkill && tx.agentSkill) {
      const skillRecords = await tx.agentSkill.findMany({
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
          name: a.userName || 'Unknown',
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
      name: a.userName || 'Unknown',
      skills: [],
      currentLoad: a.currentCapacity,
      maxCapacity: a.maxCapacity,
      status: a.status,
    }));
  }

  /**
   * In-transaction version of findMatchingRule.
   */
  private async findMatchingRuleInTx(
    tx: any,
    tenantId: string,
    leadContext: LeadContext
  ): Promise<MatchedRule | null> {
    const rules = await tx.routingRule.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      const conditions: RoutingCondition[] =
        typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;

      if (this.evaluateConditions(conditions, leadContext)) {
        const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;

        const assignAction = (actions as any[]).find((a: any) => a.type === 'assign_to_user');

        if (assignAction?.target) {
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            assigneeId: assignAction.target,
          };
        }
      }
    }

    return null;
  }
}
