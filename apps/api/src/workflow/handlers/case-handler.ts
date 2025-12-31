/**
 * Case Workflow Event Handlers
 *
 * Handles case-related domain events and routes them to appropriate
 * workflow engines (Temporal, LangGraph, BullMQ, or Rules Engine).
 *
 * This module integrates with:
 * - Domain events from @intelliflow/domain (case-events.ts)
 * - Workflow engines from @intelliflow/platform (WorkflowEngineFactory)
 * - Rules engine for synchronous rule evaluation
 *
 * @module apps/api/src/workflow/handlers/case-handler
 */

import { z } from 'zod';
import {
  // Core case value objects
  CaseId,
  // Workflow-specific events from case-events.ts
  CaseWorkflowStartedEvent,
  CaseWorkflowCompletedEvent,
  CaseWorkflowFailedEvent,
  CaseApprovalRequiredEvent,
  CaseEscalatedEvent,
  // Event routing configuration
  CASE_EVENT_WORKFLOW_ROUTING,
  type CaseEventType,
  // Domain event publisher interface
  type DomainEventPublisher,
  // Result type for error handling
  type Result,
} from '@intelliflow/domain';

import {
  WorkflowEngineFactory,
  getRulesEngine,
  getCaseEventWorkflowEngine,
  isRulesEngineEvent,
  type IWorkflowEngine,
  type WorkflowHandle,
  type RuleExecutionResult,
} from '@intelliflow/platform';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a CaseId from a string, throwing if invalid
 * This is used internally for event emission where we know the ID is valid
 */
function createCaseIdOrThrow(caseIdString: string): CaseId {
  const result = CaseId.create(caseIdString);
  if (result.isFailure) {
    throw new Error(`Invalid CaseId: ${caseIdString}`);
  }
  return result.value;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Case event payload schema
 */
export const caseEventPayloadSchema = z.object({
  caseId: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional(),
  clientId: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z
    .enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'])
    .optional(),
  previousStatus: z
    .enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'])
    .optional(),
  newStatus: z
    .enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'])
    .optional(),
  changedBy: z.string().optional(),
  deadline: z.string().datetime().optional(),
  previousDeadline: z.string().datetime().nullable().optional(),
  newDeadline: z.string().datetime().optional(),
  resolution: z.string().optional(),
});

export type CaseEventPayload = z.infer<typeof caseEventPayloadSchema>;

/**
 * Handler result
 */
export interface HandlerResult {
  success: boolean;
  workflowId?: string;
  workflowEngine?: 'temporal' | 'langgraph' | 'bullmq' | 'rules';
  workflowHandle?: WorkflowHandle<unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Event context from domain event bus
 */
export interface EventContext {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  correlationId?: string;
  causationId?: string;
  userId?: string;
}

/**
 * Handler dependencies
 */
export interface HandlerDependencies {
  eventPublisher?: DomainEventPublisher;
  workflowEngine?: IWorkflowEngine;
}

// ============================================================================
// Handler Interface
// ============================================================================

/**
 * Case event handler interface
 */
export interface ICaseEventHandler {
  /**
   * Event type this handler processes
   */
  readonly eventType: string;

  /**
   * Handle the event
   */
  handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult>;
}

// ============================================================================
// Base Handler with Workflow Integration
// ============================================================================

/**
 * Base handler with common workflow execution logic
 */
abstract class BaseCaseEventHandler implements ICaseEventHandler {
  abstract readonly eventType: string;

  abstract handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult>;

  /**
   * Start a workflow and emit CaseWorkflowStartedEvent
   */
  protected async startWorkflow(
    workflowId: string,
    workflowName: string,
    input: Record<string, unknown>,
    engine: 'temporal' | 'langgraph' | 'bullmq',
    caseId: string,
    initiatedBy: string,
    deps?: HandlerDependencies
  ): Promise<{ handle: WorkflowHandle<unknown> | null; error?: string }> {
    try {
      const workflowEngine = deps?.workflowEngine ?? WorkflowEngineFactory.getEngine(engine);

      if (!workflowEngine) {
        console.warn(
          `[BaseCaseEventHandler] Workflow engine '${engine}' not initialized, simulating execution`
        );
        return { handle: null };
      }

      const handle = await workflowEngine.startWorkflow(workflowId, workflowName, input);

      // Emit CaseWorkflowStartedEvent
      if (deps?.eventPublisher) {
        const startedEvent = new CaseWorkflowStartedEvent(
          createCaseIdOrThrow(caseId),
          workflowId,
          workflowName,
          engine,
          initiatedBy
        );
        await deps.eventPublisher.publish(startedEvent);
      }

      console.log(
        `[BaseCaseEventHandler] Started workflow ${workflowName} (${workflowId}) on ${engine}`
      );

      return { handle };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit CaseWorkflowFailedEvent
      if (deps?.eventPublisher) {
        const failedEvent = new CaseWorkflowFailedEvent(
          createCaseIdOrThrow(caseId),
          workflowId,
          workflowName,
          errorMessage,
          true, // retryable
          1 // first attempt
        );
        await deps.eventPublisher.publish(failedEvent);
      }

      console.error(`[BaseCaseEventHandler] Failed to start workflow: ${errorMessage}`);
      return { handle: null, error: errorMessage };
    }
  }

  /**
   * Evaluate rules using the rules engine
   */
  protected async evaluateRules(
    eventType: string,
    payload: CaseEventPayload,
    context: EventContext
  ): Promise<{ matched: boolean; actionsExecuted: number }> {
    try {
      const rulesEngine = getRulesEngine();
      const results = await rulesEngine.evaluate({
        eventType,
        eventPayload: payload as unknown as Record<string, unknown>,
        entityType: 'case',
        entityId: payload.caseId,
        timestamp: context.occurredAt,
      });

      const matched = results.some((r: RuleExecutionResult) => r.matched);
      const actionsExecuted = results.reduce(
        (sum: number, r: RuleExecutionResult) => sum + r.actionsExecuted,
        0
      );

      console.log(
        `[BaseCaseEventHandler] Rules evaluation: ${results.length} rules, ` +
          `${matched ? 'matched' : 'no match'}, ${actionsExecuted} actions`
      );

      return { matched, actionsExecuted };
    } catch (error) {
      console.error(`[BaseCaseEventHandler] Rules evaluation error: ${error}`);
      return { matched: false, actionsExecuted: 0 };
    }
  }
}

// ============================================================================
// Case Created Handler
// ============================================================================

/**
 * Handler for case.created events
 * Triggers the case lifecycle workflow in Temporal
 */
export class CaseCreatedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.created';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(`[CaseCreatedHandler] Processing case creation: ${payload.caseId}`);

    try {
      // Validate required fields
      if (!payload.caseId || !payload.title || !payload.clientId) {
        return {
          success: false,
          error: 'Missing required fields: caseId, title, or clientId',
        };
      }

      const workflowId = `case-lifecycle-${payload.caseId}`;
      const workflowName = 'caseLifecycleWorkflow';
      const engine = getCaseEventWorkflowEngine(this.eventType as CaseEventType);

      // Start the workflow
      const { handle, error } = await this.startWorkflow(
        workflowId,
        workflowName,
        {
          caseId: payload.caseId,
          clientId: payload.clientId,
          priority: payload.priority ?? 'MEDIUM',
          assignedTo: payload.assignedTo,
          title: payload.title,
        },
        engine === 'rules' ? 'temporal' : engine,
        payload.caseId,
        context.userId ?? 'system',
        deps
      );

      if (error) {
        return {
          success: false,
          error,
          workflowEngine: engine === 'rules' ? 'temporal' : engine,
        };
      }

      return {
        success: true,
        workflowId,
        workflowEngine: engine === 'rules' ? 'temporal' : engine,
        workflowHandle: handle ?? undefined,
        metadata: {
          caseId: payload.caseId,
          priority: payload.priority,
          assignedTo: payload.assignedTo,
        },
      };
    } catch (error) {
      console.error(`[CaseCreatedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

// ============================================================================
// Case Status Changed Handler
// ============================================================================

/**
 * Handler for case.status_changed events
 * Routes to Temporal for status transition workflow
 */
export class CaseStatusChangedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.status_changed';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(
      `[CaseStatusChangedHandler] Processing status change: ${payload.caseId} ` +
        `${payload.previousStatus} -> ${payload.newStatus}`
    );

    try {
      const workflowName = this.determineWorkflow(payload.previousStatus, payload.newStatus);
      const workflowId = `case-status-${payload.caseId}-${Date.now()}`;
      const engine = getCaseEventWorkflowEngine(this.eventType as CaseEventType);

      // Start the appropriate workflow
      const { handle, error } = await this.startWorkflow(
        workflowId,
        workflowName,
        {
          caseId: payload.caseId,
          previousStatus: payload.previousStatus,
          newStatus: payload.newStatus,
          changedBy: payload.changedBy,
          resolution: payload.resolution,
        },
        engine === 'rules' ? 'temporal' : engine,
        payload.caseId,
        context.userId ?? payload.changedBy ?? 'system',
        deps
      );

      if (error) {
        return {
          success: false,
          error,
          workflowEngine: engine === 'rules' ? 'temporal' : engine,
        };
      }

      return {
        success: true,
        workflowId,
        workflowEngine: engine === 'rules' ? 'temporal' : engine,
        workflowHandle: handle ?? undefined,
        metadata: {
          caseId: payload.caseId,
          transition: `${payload.previousStatus} -> ${payload.newStatus}`,
          workflowName,
          resolution: payload.resolution,
        },
      };
    } catch (error) {
      console.error(`[CaseStatusChangedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private determineWorkflow(previousStatus?: string, newStatus?: string): string {
    const transitions: Record<string, string> = {
      'OPEN->IN_PROGRESS': 'caseStartWorkflow',
      'IN_PROGRESS->ON_HOLD': 'casePauseWorkflow',
      'ON_HOLD->IN_PROGRESS': 'caseResumeWorkflow',
      'IN_PROGRESS->CLOSED': 'caseClosureWorkflow',
      'OPEN->CANCELLED': 'caseCancellationWorkflow',
    };

    const key = `${previousStatus}->${newStatus}`;
    return transitions[key] ?? 'caseStatusTransitionWorkflow';
  }
}

// ============================================================================
// Case Priority Changed Handler
// ============================================================================

/**
 * Handler for case.priority_changed events
 * Routes to rules engine for immediate evaluation
 */
export class CasePriorityChangedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.priority_changed';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(
      `[CasePriorityChangedHandler] Processing priority change for case: ${payload.caseId}`
    );

    try {
      // Priority changes go to rules engine for immediate evaluation
      const { matched, actionsExecuted } = await this.evaluateRules(
        this.eventType,
        payload,
        context
      );

      // Check for escalation conditions
      const isEscalation = payload.priority === 'URGENT';

      if (isEscalation && deps?.eventPublisher) {
        // Emit escalation event
        const escalationEvent = new CaseEscalatedEvent(
          createCaseIdOrThrow(payload.caseId),
          1, // escalation level
          payload.assignedTo ?? 'unassigned',
          'escalation-team', // would be determined by rules
          'Priority changed to URGENT',
          context.userId ?? 'system'
        );
        await deps.eventPublisher.publish(escalationEvent);

        console.log(
          `[CasePriorityChangedHandler] URGENT priority detected, escalation event emitted`
        );
      }

      return {
        success: true,
        workflowEngine: 'rules',
        metadata: {
          caseId: payload.caseId,
          priority: payload.priority,
          isEscalation,
          rulesMatched: matched,
          actionsExecuted,
        },
      };
    } catch (error) {
      console.error(`[CasePriorityChangedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

// ============================================================================
// Case Deadline Updated Handler
// ============================================================================

/**
 * Handler for case.deadline_updated events
 * Routes to rules engine for SLA monitoring
 */
export class CaseDeadlineUpdatedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.deadline_updated';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(
      `[CaseDeadlineUpdatedHandler] Processing deadline update for case: ${payload.caseId}`
    );

    try {
      // Calculate time until deadline
      const deadline = payload.newDeadline ? new Date(payload.newDeadline) : null;
      const hoursUntilDeadline = deadline
        ? (deadline.getTime() - Date.now()) / (1000 * 60 * 60)
        : null;

      // Evaluate rules
      const { matched, actionsExecuted } = await this.evaluateRules(
        this.eventType,
        payload,
        context
      );

      // Determine urgency
      const isUrgent = hoursUntilDeadline !== null && hoursUntilDeadline < 24;
      const isOverdue = hoursUntilDeadline !== null && hoursUntilDeadline < 0;

      console.log(
        `[CaseDeadlineUpdatedHandler] Deadline analysis: ` +
          `hoursUntil=${hoursUntilDeadline?.toFixed(1)}, ` +
          `isUrgent=${isUrgent}, isOverdue=${isOverdue}`
      );

      return {
        success: true,
        workflowEngine: 'rules',
        metadata: {
          caseId: payload.caseId,
          deadline: deadline?.toISOString(),
          hoursUntilDeadline,
          isUrgent,
          isOverdue,
          rulesMatched: matched,
          actionsExecuted,
        },
      };
    } catch (error) {
      console.error(`[CaseDeadlineUpdatedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

// ============================================================================
// Case Closed Handler
// ============================================================================

/**
 * Handler for case.closed events
 * Triggers post-closure workflow
 */
export class CaseClosedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.closed';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(`[CaseClosedHandler] Processing case closure: ${payload.caseId}`);

    try {
      const workflowId = `case-closure-${payload.caseId}-${Date.now()}`;
      const workflowName = 'casePostClosureWorkflow';
      const engine = getCaseEventWorkflowEngine(this.eventType as CaseEventType);

      // Start post-closure workflow
      const { handle, error } = await this.startWorkflow(
        workflowId,
        workflowName,
        {
          caseId: payload.caseId,
          resolution: payload.resolution,
          closedBy: payload.changedBy,
          closedAt: context.occurredAt.toISOString(),
        },
        engine === 'rules' ? 'temporal' : engine,
        payload.caseId,
        context.userId ?? payload.changedBy ?? 'system',
        deps
      );

      if (error) {
        return {
          success: false,
          error,
          workflowEngine: engine === 'rules' ? 'temporal' : engine,
        };
      }

      return {
        success: true,
        workflowId,
        workflowEngine: engine === 'rules' ? 'temporal' : engine,
        workflowHandle: handle ?? undefined,
        metadata: {
          caseId: payload.caseId,
          resolution: payload.resolution,
          closedBy: payload.changedBy,
          closedAt: context.occurredAt.toISOString(),
        },
      };
    } catch (error) {
      console.error(`[CaseClosedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

// ============================================================================
// Case Task Handlers
// ============================================================================

/**
 * Handler for case.task_added events
 * Routes to BullMQ for notification jobs
 */
export class CaseTaskAddedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.task_added';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(`[CaseTaskAddedHandler] Processing task addition for case: ${payload.caseId}`);

    try {
      const jobId = `task-notification-${context.eventId}`;
      const engine = getCaseEventWorkflowEngine(this.eventType as CaseEventType);

      // Start notification job via BullMQ
      const { handle, error } = await this.startWorkflow(
        jobId,
        'taskNotificationJob',
        {
          caseId: payload.caseId,
          eventId: context.eventId,
          assignedTo: payload.assignedTo,
        },
        engine === 'rules' ? 'bullmq' : engine,
        payload.caseId,
        context.userId ?? 'system',
        deps
      );

      if (error) {
        return {
          success: false,
          error,
          workflowEngine: engine === 'rules' ? 'bullmq' : engine,
        };
      }

      return {
        success: true,
        workflowId: jobId,
        workflowEngine: engine === 'rules' ? 'bullmq' : engine,
        workflowHandle: handle ?? undefined,
        metadata: {
          caseId: payload.caseId,
          jobType: 'task-notification',
        },
      };
    } catch (error) {
      console.error(`[CaseTaskAddedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

/**
 * Handler for case.task_completed events
 */
export class CaseTaskCompletedHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.task_completed';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(
      `[CaseTaskCompletedHandler] Processing task completion for case: ${payload.caseId}`
    );

    try {
      const jobId = `task-completed-${context.eventId}`;
      const engine = getCaseEventWorkflowEngine(this.eventType as CaseEventType);

      // Start completion check job via BullMQ
      const { handle, error } = await this.startWorkflow(
        jobId,
        'taskCompletionCheckJob',
        {
          caseId: payload.caseId,
          eventId: context.eventId,
        },
        engine === 'rules' ? 'bullmq' : engine,
        payload.caseId,
        context.userId ?? 'system',
        deps
      );

      if (error) {
        return {
          success: false,
          error,
          workflowEngine: engine === 'rules' ? 'bullmq' : engine,
        };
      }

      return {
        success: true,
        workflowId: jobId,
        workflowEngine: engine === 'rules' ? 'bullmq' : engine,
        workflowHandle: handle ?? undefined,
        metadata: {
          caseId: payload.caseId,
          jobType: 'task-completion-check',
        },
      };
    } catch (error) {
      console.error(`[CaseTaskCompletedHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

// ============================================================================
// Case Approval Handler
// ============================================================================

/**
 * Handler for case.approval_required events
 * Emits CaseApprovalRequiredEvent and routes to Temporal for human-in-the-loop
 */
export class CaseApprovalRequiredHandler extends BaseCaseEventHandler {
  readonly eventType = 'case.approval_required';

  async handle(
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    console.log(
      `[CaseApprovalRequiredHandler] Processing approval request for case: ${payload.caseId}`
    );

    try {
      const workflowId = `case-approval-${payload.caseId}-${Date.now()}`;

      // Emit CaseApprovalRequiredEvent
      if (deps?.eventPublisher) {
        const approvalEvent = new CaseApprovalRequiredEvent(
          createCaseIdOrThrow(payload.caseId),
          workflowId,
          'proceed',
          [payload.assignedTo ?? 'manager'],
          'Case requires approval to proceed',
          null // no deadline
        );
        await deps.eventPublisher.publish(approvalEvent);
      }

      // Start approval workflow
      const { handle, error } = await this.startWorkflow(
        workflowId,
        'caseApprovalWorkflow',
        {
          caseId: payload.caseId,
          requestedBy: context.userId,
          approvers: [payload.assignedTo ?? 'manager'],
        },
        'temporal',
        payload.caseId,
        context.userId ?? 'system',
        deps
      );

      if (error) {
        return {
          success: false,
          error,
          workflowEngine: 'temporal',
        };
      }

      return {
        success: true,
        workflowId,
        workflowEngine: 'temporal',
        workflowHandle: handle ?? undefined,
        metadata: {
          caseId: payload.caseId,
          approvalType: 'proceed',
          requestedBy: context.userId,
        },
      };
    } catch (error) {
      console.error(`[CaseApprovalRequiredHandler] Error: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Registry of all case event handlers
 */
export class CaseEventHandlerRegistry {
  private handlers: Map<string, ICaseEventHandler> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register default handlers
   */
  private registerDefaultHandlers(): void {
    this.register(new CaseCreatedHandler());
    this.register(new CaseStatusChangedHandler());
    this.register(new CasePriorityChangedHandler());
    this.register(new CaseDeadlineUpdatedHandler());
    this.register(new CaseClosedHandler());
    this.register(new CaseTaskAddedHandler());
    this.register(new CaseTaskCompletedHandler());
    this.register(new CaseApprovalRequiredHandler());
  }

  /**
   * Register a handler
   */
  register(handler: ICaseEventHandler): void {
    this.handlers.set(handler.eventType, handler);
  }

  /**
   * Get handler for event type
   */
  getHandler(eventType: string): ICaseEventHandler | undefined {
    return this.handlers.get(eventType);
  }

  /**
   * Process an event
   */
  async processEvent(
    eventType: string,
    payload: CaseEventPayload,
    context: EventContext,
    deps?: HandlerDependencies
  ): Promise<HandlerResult> {
    const handler = this.handlers.get(eventType);

    if (!handler) {
      console.warn(
        `[CaseEventHandlerRegistry] No handler registered for event type: ${eventType}`
      );
      return {
        success: false,
        error: `No handler for event type: ${eventType}`,
      };
    }

    return handler.handle(payload, context, deps);
  }

  /**
   * Get all registered event types
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if event type is handled by rules engine
   */
  isRulesEngineEvent(eventType: string): boolean {
    return isRulesEngineEvent(eventType as CaseEventType);
  }

  /**
   * Get routing info for an event type
   */
  getEventRouting(eventType: string): 'temporal' | 'langgraph' | 'bullmq' | 'rules' | undefined {
    try {
      return getCaseEventWorkflowEngine(eventType as CaseEventType);
    } catch {
      return undefined;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registry: CaseEventHandlerRegistry | null = null;

/**
 * Get the global case event handler registry
 */
export function getCaseEventHandlerRegistry(): CaseEventHandlerRegistry {
    registry ??= new CaseEventHandlerRegistry();
    return registry;
}

/**
 * Reset the registry (for testing)
 */
export function resetCaseEventHandlerRegistry(): void {
  registry = null;
}
