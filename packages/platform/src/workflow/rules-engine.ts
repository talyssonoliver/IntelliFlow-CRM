/**
 * Rules Engine for IntelliFlow CRM
 *
 * Lightweight, high-performance rules engine for evaluating business rules
 * and triggering actions based on domain events.
 *
 * Features:
 * - JSON-based rule definitions
 * - Conditional logic (AND, OR, NOT)
 * - Multiple action types (workflow, notification, field update)
 * - Priority-based rule ordering
 * - Rule execution metrics
 *
 * @module @intelliflow/platform/workflow/rules-engine
 */

import { z } from 'zod';

// ============================================================================
// Rule Definition Schemas
// ============================================================================

/**
 * Comparison operators for conditions
 */
export type ComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equals'
  | 'less_than_or_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null'
  | 'regex_match';

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = 'AND' | 'OR' | 'NOT';

/**
 * Single condition schema
 */
export const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'greater_than_or_equals',
    'less_than_or_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'in',
    'not_in',
    'is_null',
    'is_not_null',
    'regex_match',
  ]),
  value: z.unknown().optional(),
});

export type Condition = z.infer<typeof conditionSchema>;

/**
 * Condition group for complex logic
 */
export interface ConditionGroup {
  operator: LogicalOperator;
  conditions: Array<Condition | ConditionGroup>;
}

/**
 * Action types
 */
export type ActionType =
  | 'trigger_workflow'
  | 'send_notification'
  | 'update_field'
  | 'create_task'
  | 'log_event'
  | 'call_webhook';

/**
 * Action definition schema
 */
export const actionSchema = z.object({
  type: z.enum([
    'trigger_workflow',
    'send_notification',
    'update_field',
    'create_task',
    'log_event',
    'call_webhook',
  ]),
  config: z.record(z.unknown()),
});

export type Action = z.infer<typeof actionSchema>;

/**
 * Rule definition schema
 */
export const ruleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(100),
  eventTypes: z.array(z.string()).min(1),
  conditions: z.unknown(), // ConditionGroup - complex type
  actions: z.array(actionSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;

/**
 * Rule execution result
 */
export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actionsExecuted: number;
  executionTimeMs: number;
  errors: string[];
}

/**
 * Rule evaluation context
 */
export interface RuleContext {
  eventType: string;
  eventPayload: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Rules Engine Implementation
// ============================================================================

/**
 * Configuration for the rules engine
 */
export interface RulesEngineConfig {
  maxRulesPerEvaluation?: number;
  executionTimeoutMs?: number;
  enableMetrics?: boolean;
  enableLogging?: boolean;
}

/**
 * Rules engine metrics
 */
export interface RulesEngineMetrics {
  totalEvaluations: number;
  totalRulesMatched: number;
  totalActionsExecuted: number;
  averageEvaluationTimeMs: number;
  errors: number;
}

/**
 * Rules Engine - Evaluates business rules against events
 */
export class RulesEngine {
  private rules: Map<string, RuleDefinition> = new Map();
  private eventToRulesIndex: Map<string, Set<string>> = new Map();
  private config: Required<RulesEngineConfig>;
  private metrics: RulesEngineMetrics = {
    totalEvaluations: 0,
    totalRulesMatched: 0,
    totalActionsExecuted: 0,
    averageEvaluationTimeMs: 0,
    errors: 0,
  };
  private actionHandlers: Map<ActionType, ActionHandler> = new Map();

  constructor(config: RulesEngineConfig = {}) {
    this.config = {
      maxRulesPerEvaluation: config.maxRulesPerEvaluation ?? 100,
      executionTimeoutMs: config.executionTimeoutMs ?? 5000,
      enableMetrics: config.enableMetrics ?? true,
      enableLogging: config.enableLogging ?? false,
    };

    // Register default action handlers
    this.registerDefaultActionHandlers();
  }

  // ==========================================================================
  // Rule Management
  // ==========================================================================

  /**
   * Register a rule definition
   */
  registerRule(rule: RuleDefinition): void {
    const validated = ruleDefinitionSchema.parse(rule);
    this.rules.set(validated.id, validated);

    // Index by event type for fast lookup
    for (const eventType of validated.eventTypes) {
      if (!this.eventToRulesIndex.has(eventType)) {
        this.eventToRulesIndex.set(eventType, new Set());
      }
      this.eventToRulesIndex.get(eventType)!.add(validated.id);
    }
  }

  /**
   * Unregister a rule
   */
  unregisterRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    // Remove from event index
    for (const eventType of rule.eventTypes) {
      this.eventToRulesIndex.get(eventType)?.delete(ruleId);
    }

    this.rules.delete(ruleId);
    return true;
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): RuleDefinition | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules
   */
  getAllRules(): RuleDefinition[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules for a specific event type
   */
  getRulesForEvent(eventType: string): RuleDefinition[] {
    const ruleIds = this.eventToRulesIndex.get(eventType);
    if (!ruleIds) return [];

    return Array.from(ruleIds)
      .map((id) => this.rules.get(id)!)
      .filter((rule) => rule.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  // ==========================================================================
  // Rule Evaluation
  // ==========================================================================

  /**
   * Evaluate all matching rules for an event context
   */
  async evaluate(context: RuleContext): Promise<RuleExecutionResult[]> {
    const startTime = Date.now();
    const results: RuleExecutionResult[] = [];

    const applicableRules = this.getRulesForEvent(context.eventType).slice(
      0,
      this.config.maxRulesPerEvaluation
    );

    for (const rule of applicableRules) {
      const ruleStartTime = Date.now();
      const result: RuleExecutionResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        actionsExecuted: 0,
        executionTimeMs: 0,
        errors: [],
      };

      try {
        // Evaluate conditions
        const conditionsMet = this.evaluateConditions(
          rule.conditions as ConditionGroup,
          context
        );

        result.matched = conditionsMet;

        if (conditionsMet) {
          // Execute actions
          for (const action of rule.actions) {
            try {
              await this.executeAction(action, context);
              result.actionsExecuted++;
            } catch (actionError) {
              result.errors.push(`Action ${action.type}: ${String(actionError)}`);
            }
          }
        }
      } catch (error) {
        result.errors.push(`Evaluation error: ${String(error)}`);
        this.metrics.errors++;
      }

      result.executionTimeMs = Date.now() - ruleStartTime;
      results.push(result);
    }

    // Update metrics
    if (this.config.enableMetrics) {
      this.updateMetrics(results, Date.now() - startTime);
    }

    return results;
  }

  /**
   * Evaluate a condition group against context
   */
  private evaluateConditions(
    conditionGroup: ConditionGroup,
    context: RuleContext
  ): boolean {
    const { operator, conditions } = conditionGroup;

    if (operator === 'NOT') {
      if (conditions.length !== 1) {
        throw new Error('NOT operator requires exactly one condition');
      }
      const condition = conditions[0];
      if ('operator' in condition && typeof condition.operator === 'string' && ['AND', 'OR', 'NOT'].includes(condition.operator)) {
        return !this.evaluateConditions(condition as ConditionGroup, context);
      }
      return !this.evaluateSingleCondition(condition as Condition, context);
    }

    const evaluator = operator === 'AND' ? 'every' : 'some';
    return conditions[evaluator]((condition) => {
      if ('operator' in condition && typeof condition.operator === 'string' && ['AND', 'OR', 'NOT'].includes(condition.operator)) {
        return this.evaluateConditions(condition as ConditionGroup, context);
      }
      return this.evaluateSingleCondition(condition as Condition, context);
    });
  }

  /**
   * Evaluate a single condition against context
   */
  private evaluateSingleCondition(
    condition: Condition,
    context: RuleContext
  ): boolean {
    const fieldValue = this.getFieldValue(condition.field, context);
    const compareValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return fieldValue === compareValue;

      case 'not_equals':
        return fieldValue !== compareValue;

      case 'greater_than':
        return Number(fieldValue) > Number(compareValue);

      case 'less_than':
        return Number(fieldValue) < Number(compareValue);

      case 'greater_than_or_equals':
        return Number(fieldValue) >= Number(compareValue);

      case 'less_than_or_equals':
        return Number(fieldValue) <= Number(compareValue);

      case 'contains':
        return String(fieldValue).includes(String(compareValue));

      case 'not_contains':
        return !String(fieldValue).includes(String(compareValue));

      case 'starts_with':
        return String(fieldValue).startsWith(String(compareValue));

      case 'ends_with':
        return String(fieldValue).endsWith(String(compareValue));

      case 'in':
        return Array.isArray(compareValue) && compareValue.includes(fieldValue);

      case 'not_in':
        return Array.isArray(compareValue) && !compareValue.includes(fieldValue);

      case 'is_null':
        return fieldValue === null || fieldValue === undefined;

      case 'is_not_null':
        return fieldValue !== null && fieldValue !== undefined;

      case 'regex_match':
        return new RegExp(String(compareValue)).test(String(fieldValue));

      default:
        throw new Error(`Unknown operator: ${condition.operator}`);
    }
  }

  /**
   * Get field value from context using dot notation
   */
  private getFieldValue(field: string, context: RuleContext): unknown {
    const parts = field.split('.');

    // Check event payload first
    if (parts[0] === 'payload' || parts[0] === 'event') {
      let value: unknown = context.eventPayload;
      for (const part of parts.slice(1)) {
        if (value === null || value === undefined) return undefined;
        value = (value as Record<string, unknown>)[part];
      }
      return value;
    }

    // Check context properties
    if (parts[0] === 'context') {
      switch (parts[1]) {
        case 'eventType':
          return context.eventType;
        case 'entityType':
          return context.entityType;
        case 'entityId':
          return context.entityId;
        case 'userId':
          return context.userId;
        default:
          return context.metadata?.[parts[1]];
      }
    }

    // Direct field access on payload
    let value: unknown = context.eventPayload;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }

  // ==========================================================================
  // Action Execution
  // ==========================================================================

  /**
   * Action handler function type
   */
  private registerDefaultActionHandlers(): void {
    // Trigger workflow action
    this.actionHandlers.set('trigger_workflow', async (action, context) => {
      const { workflowName, workflowEngine, input } = action.config as {
        workflowName: string;
        workflowEngine?: string;
        input?: Record<string, unknown>;
      };

      if (this.config.enableLogging) {
        console.log(
          `[RulesEngine] Triggering workflow: ${workflowName} (engine: ${workflowEngine ?? 'default'})`
        );
      }

      // In production, this would integrate with WorkflowRouter
      return {
        triggered: true,
        workflowName,
        workflowEngine,
        input: { ...context.eventPayload, ...input },
      };
    });

    // Send notification action
    this.actionHandlers.set('send_notification', async (action, context) => {
      const { channel, recipient, template, data } = action.config as {
        channel: string;
        recipient: string;
        template: string;
        data?: Record<string, unknown>;
      };

      if (this.config.enableLogging) {
        console.log(
          `[RulesEngine] Sending notification: ${template} via ${channel} to ${recipient}`
        );
      }

      // In production, this would queue a notification
      return { sent: true, channel, recipient, template };
    });

    // Update field action
    this.actionHandlers.set('update_field', async (action, context) => {
      const { entityType, entityId, field, value } = action.config as {
        entityType: string;
        entityId?: string;
        field: string;
        value: unknown;
      };

      const targetId = entityId ?? context.entityId;

      if (this.config.enableLogging) {
        console.log(
          `[RulesEngine] Updating ${entityType}[${targetId}].${field} = ${JSON.stringify(value)}`
        );
      }

      // In production, this would update via repository
      return { updated: true, entityType, entityId: targetId, field, value };
    });

    // Create task action
    this.actionHandlers.set('create_task', async (action, context) => {
      const { title, description, assignee, dueDate, priority } = action.config as {
        title: string;
        description?: string;
        assignee?: string;
        dueDate?: string;
        priority?: string;
      };

      if (this.config.enableLogging) {
        console.log(`[RulesEngine] Creating task: ${title}`);
      }

      // In production, this would create via task service
      return {
        created: true,
        title,
        description,
        assignee,
        dueDate,
        priority,
        relatedEntityId: context.entityId,
      };
    });

    // Log event action
    this.actionHandlers.set('log_event', async (action, context) => {
      const { level, message, data } = action.config as {
        level: string;
        message: string;
        data?: Record<string, unknown>;
      };

      console.log(
        `[RulesEngine][${level.toUpperCase()}] ${message}`,
        JSON.stringify({ ...data, context: context.eventType, entityId: context.entityId })
      );

      return { logged: true, level, message };
    });

    // Call webhook action
    this.actionHandlers.set('call_webhook', async (action, context) => {
      const { url, method, headers, body } = action.config as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: Record<string, unknown>;
      };

      if (this.config.enableLogging) {
        console.log(`[RulesEngine] Calling webhook: ${method ?? 'POST'} ${url}`);
      }

      // In production, this would make HTTP request
      return {
        called: true,
        url,
        method: method ?? 'POST',
        payload: body ?? context.eventPayload,
      };
    });
  }

  /**
   * Execute an action
   */
  private async executeAction(action: Action, context: RuleContext): Promise<unknown> {
    const handler = this.actionHandlers.get(action.type);
    if (!handler) {
      throw new Error(`No handler registered for action type: ${action.type}`);
    }
    return handler(action, context);
  }

  /**
   * Register a custom action handler
   */
  registerActionHandler(actionType: ActionType, handler: ActionHandler): void {
    this.actionHandlers.set(actionType, handler);
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Update metrics after evaluation
   */
  private updateMetrics(results: RuleExecutionResult[], totalTimeMs: number): void {
    this.metrics.totalEvaluations++;
    this.metrics.totalRulesMatched += results.filter((r) => r.matched).length;
    this.metrics.totalActionsExecuted += results.reduce(
      (sum, r) => sum + r.actionsExecuted,
      0
    );
    this.metrics.errors += results.reduce((sum, r) => sum + r.errors.length, 0);

    // Rolling average for evaluation time
    this.metrics.averageEvaluationTimeMs =
      (this.metrics.averageEvaluationTimeMs * (this.metrics.totalEvaluations - 1) +
        totalTimeMs) /
      this.metrics.totalEvaluations;
  }

  /**
   * Get current metrics
   */
  getMetrics(): RulesEngineMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalEvaluations: 0,
      totalRulesMatched: 0,
      totalActionsExecuted: 0,
      averageEvaluationTimeMs: 0,
      errors: 0,
    };
  }
}

/**
 * Action handler function type
 */
export type ActionHandler = (
  action: Action,
  context: RuleContext
) => Promise<unknown>;

// ============================================================================
// Pre-built Rule Templates
// ============================================================================

/**
 * Create a case escalation rule
 */
export function createCaseEscalationRule(config: {
  id: string;
  priority: 'HIGH' | 'URGENT';
  daysOverdue: number;
  notifyUsers: string[];
}): RuleDefinition {
  return {
    id: config.id,
    name: `Escalate ${config.priority} priority cases after ${config.daysOverdue} days`,
    description: `Automatically escalate cases that are overdue`,
    enabled: true,
    priority: 10,
    eventTypes: ['case.deadline_updated', 'case.status_changed'],
    conditions: {
      operator: 'AND',
      conditions: [
        { field: 'payload.priority', operator: 'equals', value: config.priority },
        { field: 'payload.status', operator: 'not_equals', value: 'CLOSED' },
      ],
    },
    actions: [
      {
        type: 'send_notification',
        config: {
          channel: 'email',
          recipient: config.notifyUsers.join(','),
          template: 'case-escalation',
          data: { daysOverdue: config.daysOverdue },
        },
      },
      {
        type: 'log_event',
        config: {
          level: 'warn',
          message: 'Case escalated due to being overdue',
        },
      },
    ],
  };
}

/**
 * Create a lead scoring trigger rule
 */
export function createLeadScoringRule(config: {
  id: string;
  triggerOnCreate?: boolean;
  triggerOnUpdate?: boolean;
}): RuleDefinition {
  const eventTypes: string[] = [];
  if (config.triggerOnCreate !== false) eventTypes.push('lead.created');
  if (config.triggerOnUpdate) eventTypes.push('lead.updated');

  return {
    id: config.id,
    name: 'Trigger AI lead scoring',
    description: 'Automatically score new leads using AI',
    enabled: true,
    priority: 50,
    eventTypes,
    conditions: {
      operator: 'AND',
      conditions: [
        { field: 'payload.leadId', operator: 'is_not_null' },
      ],
    },
    actions: [
      {
        type: 'trigger_workflow',
        config: {
          workflowName: 'leadQualificationWorkflow',
          workflowEngine: 'langgraph',
        },
      },
    ],
  };
}

/**
 * Create a task assignment rule
 */
export function createTaskAssignmentRule(config: {
  id: string;
  eventType: string;
  assigneeField: string;
  taskTitle: string;
  taskDescription?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}): RuleDefinition {
  return {
    id: config.id,
    name: `Auto-create task: ${config.taskTitle}`,
    description: config.taskDescription,
    enabled: true,
    priority: 100,
    eventTypes: [config.eventType],
    conditions: {
      operator: 'AND',
      conditions: [
        { field: `payload.${config.assigneeField}`, operator: 'is_not_null' },
      ],
    },
    actions: [
      {
        type: 'create_task',
        config: {
          title: config.taskTitle,
          description: config.taskDescription,
          assigneeField: config.assigneeField,
          priority: config.priority ?? 'MEDIUM',
        },
      },
    ],
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRulesEngine: RulesEngine | null = null;

/**
 * Get or create the global rules engine instance
 */
export function getRulesEngine(config?: RulesEngineConfig): RulesEngine {
  if (!globalRulesEngine) {
    globalRulesEngine = new RulesEngine(config);
  }
  return globalRulesEngine;
}

/**
 * Reset the global rules engine (for testing)
 */
export function resetRulesEngine(): void {
  globalRulesEngine = null;
}
