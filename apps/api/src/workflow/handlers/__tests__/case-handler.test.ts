/**
 * Case Handler Tests
 *
 * Tests for case workflow event handlers.
 * Covers:
 * - CaseCreatedHandler: lifecycle workflow, validation
 * - CaseStatusChangedHandler: status transitions, workflow selection
 * - CasePriorityChangedHandler: rules evaluation, URGENT escalation
 * - CaseDeadlineUpdatedHandler: deadline calculation, urgency detection
 * - CaseClosedHandler: post-closure workflow
 * - CaseTaskAddedHandler: task notification jobs
 * - CaseTaskCompletedHandler: completion check jobs
 * - CaseApprovalRequiredHandler: approval events, workflow
 * - CaseEventHandlerRegistry: registration, dispatch, routing
 * - Singleton functions: getCaseEventHandlerRegistry, resetCaseEventHandlerRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CaseCreatedHandler,
  CaseStatusChangedHandler,
  CasePriorityChangedHandler,
  CaseDeadlineUpdatedHandler,
  CaseClosedHandler,
  CaseTaskAddedHandler,
  CaseTaskCompletedHandler,
  CaseApprovalRequiredHandler,
  CaseEventHandlerRegistry,
  getCaseEventHandlerRegistry,
  resetCaseEventHandlerRegistry,
  type CaseEventPayload,
  type EventContext,
  type HandlerDependencies,
} from '../case-handler';

// Mock external dependencies
vi.mock('@intelliflow/domain', () => {
  class MockCaseId {
    value: string;
    constructor(v: string) {
      this.value = v;
    }
    static create(v: string) {
      if (!v || typeof v !== 'string') {
        return { isFailure: true, value: undefined };
      }
      return { isFailure: false, value: new MockCaseId(v) };
    }
  }

  class MockEvent {
    constructor(...args: any[]) {}
  }

  return {
    CaseId: MockCaseId,
    CaseWorkflowStartedEvent: MockEvent,
    CaseWorkflowCompletedEvent: MockEvent,
    CaseWorkflowFailedEvent: MockEvent,
    CaseApprovalRequiredEvent: MockEvent,
    CaseEscalatedEvent: MockEvent,
    CASE_EVENT_WORKFLOW_ROUTING: {},
  };
});

vi.mock('@intelliflow/platform', () => ({
  WorkflowEngineFactory: {
    getEngine: vi.fn().mockReturnValue(null),
  },
  getRulesEngine: vi.fn().mockReturnValue({
    evaluate: vi.fn().mockResolvedValue([]),
  }),
  getCaseEventWorkflowEngine: vi.fn().mockReturnValue('temporal'),
  isRulesEngineEvent: vi.fn().mockReturnValue(false),
}));

import {
  WorkflowEngineFactory,
  getRulesEngine,
  getCaseEventWorkflowEngine,
  isRulesEngineEvent,
} from '@intelliflow/platform';

const validUUID = '550e8400-e29b-41d4-a716-446655440000';
const validUUID2 = '550e8400-e29b-41d4-a716-446655440001';

function makeContext(overrides: Partial<EventContext> = {}): EventContext {
  return {
    eventId: 'evt-123',
    eventType: 'case.created',
    occurredAt: new Date(),
    userId: 'user-1',
    ...overrides,
  };
}

function makePayload(overrides: Partial<CaseEventPayload> = {}): CaseEventPayload {
  return {
    caseId: validUUID,
    title: 'Test Case',
    clientId: 'client-1',
    assignedTo: 'user-1',
    priority: 'MEDIUM',
    ...overrides,
  };
}

describe('Case Event Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCaseEventHandlerRegistry();
    (getCaseEventWorkflowEngine as any).mockReturnValue('temporal');
  });

  // ===========================================================================
  // CaseCreatedHandler
  // ===========================================================================
  describe('CaseCreatedHandler', () => {
    const handler = new CaseCreatedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.created');
    });

    it('should return success when workflow engine is not initialized (simulation)', async () => {
      const result = await handler.handle(makePayload(), makeContext());

      expect(result.success).toBe(true);
      expect(result.workflowId).toContain('case-lifecycle-');
      expect(result.workflowEngine).toBe('temporal');
      expect(result.metadata).toMatchObject({
        caseId: validUUID,
        priority: 'MEDIUM',
        assignedTo: 'user-1',
      });
    });

    it('should fail when required fields are missing', async () => {
      const result = await handler.handle(
        makePayload({ title: undefined, clientId: undefined }),
        makeContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should fail when caseId is missing', async () => {
      const result = await handler.handle(makePayload({ caseId: '' as any }), makeContext());

      expect(result.success).toBe(false);
    });

    it('should use workflow engine when available via deps', async () => {
      const mockWorkflowEngine = {
        startWorkflow: vi.fn().mockResolvedValue({ workflowId: 'wf-1' }),
      };
      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      const deps: HandlerDependencies = {
        eventPublisher: mockPublisher as any,
        workflowEngine: mockWorkflowEngine as any,
      };

      const result = await handler.handle(makePayload(), makeContext(), deps);

      expect(result.success).toBe(true);
      expect(mockWorkflowEngine.startWorkflow).toHaveBeenCalled();
      expect(mockPublisher.publish).toHaveBeenCalled(); // CaseWorkflowStartedEvent
    });

    it('should emit CaseWorkflowFailedEvent when workflow start fails', async () => {
      const mockWorkflowEngine = {
        startWorkflow: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };
      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      const deps: HandlerDependencies = {
        eventPublisher: mockPublisher as any,
        workflowEngine: mockWorkflowEngine as any,
      };

      const result = await handler.handle(makePayload(), makeContext(), deps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
      // The CaseWorkflowFailedEvent should be published
      expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it('should default to system userId when context has no userId', async () => {
      const result = await handler.handle(makePayload(), makeContext({ userId: undefined }));

      expect(result.success).toBe(true);
    });

    it('should handle rules engine routing', async () => {
      (getCaseEventWorkflowEngine as any).mockReturnValue('rules');

      const result = await handler.handle(makePayload(), makeContext());

      // When engine is 'rules', it falls back to 'temporal'
      expect(result.workflowEngine).toBe('temporal');
    });
  });

  // ===========================================================================
  // CaseStatusChangedHandler
  // ===========================================================================
  describe('CaseStatusChangedHandler', () => {
    const handler = new CaseStatusChangedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.status_changed');
    });

    it('should determine correct workflow for OPEN->IN_PROGRESS', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'OPEN', newStatus: 'IN_PROGRESS' }),
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.workflowName).toBe('caseStartWorkflow');
      expect(result.metadata?.transition).toBe('OPEN -> IN_PROGRESS');
    });

    it('should determine correct workflow for IN_PROGRESS->ON_HOLD', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'IN_PROGRESS', newStatus: 'ON_HOLD' }),
        makeContext()
      );

      expect(result.metadata?.workflowName).toBe('casePauseWorkflow');
    });

    it('should determine correct workflow for ON_HOLD->IN_PROGRESS', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'ON_HOLD', newStatus: 'IN_PROGRESS' }),
        makeContext()
      );

      expect(result.metadata?.workflowName).toBe('caseResumeWorkflow');
    });

    it('should determine correct workflow for IN_PROGRESS->CLOSED', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'IN_PROGRESS', newStatus: 'CLOSED', resolution: 'Resolved' }),
        makeContext()
      );

      expect(result.metadata?.workflowName).toBe('caseClosureWorkflow');
      expect(result.metadata?.resolution).toBe('Resolved');
    });

    it('should determine correct workflow for OPEN->CANCELLED', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'OPEN', newStatus: 'CANCELLED' }),
        makeContext()
      );

      expect(result.metadata?.workflowName).toBe('caseCancellationWorkflow');
    });

    it('should use generic transition workflow for unknown transitions', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'CLOSED', newStatus: 'OPEN' }),
        makeContext()
      );

      expect(result.metadata?.workflowName).toBe('caseStatusTransitionWorkflow');
    });

    it('should use changedBy as initiator when userId not available', async () => {
      const result = await handler.handle(
        makePayload({ previousStatus: 'OPEN', newStatus: 'IN_PROGRESS', changedBy: 'manager-1' }),
        makeContext({ userId: undefined })
      );

      expect(result.success).toBe(true);
    });

    it('should handle exception in handler', async () => {
      // Force an error by making getCaseEventWorkflowEngine throw
      (getCaseEventWorkflowEngine as any).mockImplementation(() => {
        throw new Error('Engine config error');
      });

      const result = await handler.handle(
        makePayload({ previousStatus: 'OPEN', newStatus: 'IN_PROGRESS' }),
        makeContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Engine config error');
    });
  });

  // ===========================================================================
  // CasePriorityChangedHandler
  // ===========================================================================
  describe('CasePriorityChangedHandler', () => {
    const handler = new CasePriorityChangedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.priority_changed');
    });

    it('should evaluate rules and return result', async () => {
      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([{ matched: true, actionsExecuted: 2 }]),
      });

      const result = await handler.handle(makePayload({ priority: 'HIGH' }), makeContext());

      expect(result.success).toBe(true);
      expect(result.workflowEngine).toBe('rules');
      expect(result.metadata?.rulesMatched).toBe(true);
      expect(result.metadata?.actionsExecuted).toBe(2);
      expect(result.metadata?.isEscalation).toBe(false);
    });

    it('should emit escalation event for URGENT priority', async () => {
      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([]),
      });

      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      const deps: HandlerDependencies = {
        eventPublisher: mockPublisher as any,
      };

      const result = await handler.handle(makePayload({ priority: 'URGENT' }), makeContext(), deps);

      expect(result.success).toBe(true);
      expect(result.metadata?.isEscalation).toBe(true);
      expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it('should NOT emit escalation event for non-URGENT priority', async () => {
      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([]),
      });

      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };

      const result = await handler.handle(makePayload({ priority: 'LOW' }), makeContext(), {
        eventPublisher: mockPublisher as any,
      });

      expect(result.metadata?.isEscalation).toBe(false);
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it('should handle rules evaluation errors gracefully', async () => {
      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockRejectedValue(new Error('Rules engine down')),
      });

      const result = await handler.handle(makePayload(), makeContext());

      expect(result.success).toBe(true);
      expect(result.metadata?.rulesMatched).toBe(false);
      expect(result.metadata?.actionsExecuted).toBe(0);
    });
  });

  // ===========================================================================
  // CaseDeadlineUpdatedHandler
  // ===========================================================================
  describe('CaseDeadlineUpdatedHandler', () => {
    const handler = new CaseDeadlineUpdatedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.deadline_updated');
    });

    it('should detect urgent deadline (less than 24 hours)', async () => {
      const urgentDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now

      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([]),
      });

      const result = await handler.handle(
        makePayload({ newDeadline: urgentDeadline.toISOString() }),
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.isUrgent).toBe(true);
      expect(result.metadata?.isOverdue).toBe(false);
    });

    it('should detect overdue deadline', async () => {
      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([]),
      });

      const result = await handler.handle(
        makePayload({ newDeadline: pastDeadline.toISOString() }),
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.isUrgent).toBe(true);
      expect(result.metadata?.isOverdue).toBe(true);
    });

    it('should handle null deadline', async () => {
      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([]),
      });

      const result = await handler.handle(makePayload({ newDeadline: undefined }), makeContext());

      expect(result.success).toBe(true);
      expect(result.metadata?.hoursUntilDeadline).toBeNull();
      expect(result.metadata?.isUrgent).toBe(false);
      expect(result.metadata?.isOverdue).toBe(false);
    });

    it('should handle non-urgent deadline', async () => {
      const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([]),
      });

      const result = await handler.handle(
        makePayload({ newDeadline: futureDeadline.toISOString() }),
        makeContext()
      );

      expect(result.metadata?.isUrgent).toBe(false);
      expect(result.metadata?.isOverdue).toBe(false);
    });
  });

  // ===========================================================================
  // CaseClosedHandler
  // ===========================================================================
  describe('CaseClosedHandler', () => {
    const handler = new CaseClosedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.closed');
    });

    it('should start post-closure workflow', async () => {
      const result = await handler.handle(
        makePayload({ resolution: 'Client satisfied', changedBy: 'closer-1' }),
        makeContext()
      );

      expect(result.success).toBe(true);
      expect(result.workflowId).toContain('case-closure-');
      expect(result.metadata?.resolution).toBe('Client satisfied');
      expect(result.metadata?.closedBy).toBe('closer-1');
    });

    it('should handle workflow start error', async () => {
      const mockEngine = {
        startWorkflow: vi.fn().mockRejectedValue(new Error('Temporal unavailable')),
      };

      const result = await handler.handle(makePayload(), makeContext(), {
        workflowEngine: mockEngine as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Temporal unavailable');
    });
  });

  // ===========================================================================
  // CaseTaskAddedHandler
  // ===========================================================================
  describe('CaseTaskAddedHandler', () => {
    const handler = new CaseTaskAddedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.task_added');
    });

    it('should start task notification job', async () => {
      const result = await handler.handle(
        makePayload({ assignedTo: 'task-user' }),
        makeContext({ eventId: 'evt-task-1' })
      );

      expect(result.success).toBe(true);
      expect(result.workflowId).toContain('task-notification-');
      expect(result.metadata?.jobType).toBe('task-notification');
    });
  });

  // ===========================================================================
  // CaseTaskCompletedHandler
  // ===========================================================================
  describe('CaseTaskCompletedHandler', () => {
    const handler = new CaseTaskCompletedHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.task_completed');
    });

    it('should start task completion check job', async () => {
      const result = await handler.handle(
        makePayload(),
        makeContext({ eventId: 'evt-complete-1' })
      );

      expect(result.success).toBe(true);
      expect(result.workflowId).toContain('task-completed-');
      expect(result.metadata?.jobType).toBe('task-completion-check');
    });
  });

  // ===========================================================================
  // CaseApprovalRequiredHandler
  // ===========================================================================
  describe('CaseApprovalRequiredHandler', () => {
    const handler = new CaseApprovalRequiredHandler();

    it('should have correct eventType', () => {
      expect(handler.eventType).toBe('case.approval_required');
    });

    it('should emit approval event and start workflow', async () => {
      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(undefined),
      };
      const mockEngine = {
        startWorkflow: vi.fn().mockResolvedValue({ workflowId: 'approval-wf' }),
      };

      const deps: HandlerDependencies = {
        eventPublisher: mockPublisher as any,
        workflowEngine: mockEngine as any,
      };

      const result = await handler.handle(
        makePayload({ assignedTo: 'manager-1' }),
        makeContext({ userId: 'requester-1' }),
        deps
      );

      expect(result.success).toBe(true);
      expect(result.workflowEngine).toBe('temporal');
      expect(result.metadata?.approvalType).toBe('proceed');
      expect(result.metadata?.requestedBy).toBe('requester-1');
      // CaseApprovalRequiredEvent + CaseWorkflowStartedEvent
      expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
    });

    it('should handle missing assignedTo with default approver', async () => {
      const result = await handler.handle(makePayload({ assignedTo: undefined }), makeContext());

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // CaseEventHandlerRegistry
  // ===========================================================================
  describe('CaseEventHandlerRegistry', () => {
    it('should register all default handlers', () => {
      const registry = new CaseEventHandlerRegistry();
      const types = registry.getRegisteredEventTypes();

      expect(types).toContain('case.created');
      expect(types).toContain('case.status_changed');
      expect(types).toContain('case.priority_changed');
      expect(types).toContain('case.deadline_updated');
      expect(types).toContain('case.closed');
      expect(types).toContain('case.task_added');
      expect(types).toContain('case.task_completed');
      expect(types).toContain('case.approval_required');
      expect(types).toHaveLength(8);
    });

    it('should get handler for registered event type', () => {
      const registry = new CaseEventHandlerRegistry();
      const handler = registry.getHandler('case.created');

      expect(handler).toBeDefined();
      expect(handler!.eventType).toBe('case.created');
    });

    it('should return undefined for unregistered event type', () => {
      const registry = new CaseEventHandlerRegistry();
      const handler = registry.getHandler('case.unknown');

      expect(handler).toBeUndefined();
    });

    it('should process event through correct handler', async () => {
      const registry = new CaseEventHandlerRegistry();

      const result = await registry.processEvent('case.created', makePayload(), makeContext());

      expect(result.success).toBe(true);
    });

    it('should return error for unhandled event type', async () => {
      const registry = new CaseEventHandlerRegistry();

      const result = await registry.processEvent('case.nonexistent', makePayload(), makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler for event type');
    });

    it('should allow registering custom handlers', () => {
      const registry = new CaseEventHandlerRegistry();

      const customHandler = {
        eventType: 'case.custom',
        handle: vi.fn().mockResolvedValue({ success: true }),
      };

      registry.register(customHandler);

      expect(registry.getHandler('case.custom')).toBe(customHandler);
    });

    it('should check isRulesEngineEvent', () => {
      const registry = new CaseEventHandlerRegistry();

      (isRulesEngineEvent as any).mockReturnValue(true);
      expect(registry.isRulesEngineEvent('case.priority_changed')).toBe(true);

      (isRulesEngineEvent as any).mockReturnValue(false);
      expect(registry.isRulesEngineEvent('case.created')).toBe(false);
    });

    it('should get event routing info', () => {
      const registry = new CaseEventHandlerRegistry();

      (getCaseEventWorkflowEngine as any).mockReturnValue('temporal');
      expect(registry.getEventRouting('case.created')).toBe('temporal');

      (getCaseEventWorkflowEngine as any).mockReturnValue('bullmq');
      expect(registry.getEventRouting('case.task_added')).toBe('bullmq');
    });

    it('should return undefined for unknown event routing', () => {
      const registry = new CaseEventHandlerRegistry();

      (getCaseEventWorkflowEngine as any).mockImplementation(() => {
        throw new Error('Unknown event type');
      });

      expect(registry.getEventRouting('totally.unknown')).toBeUndefined();
    });
  });

  // ===========================================================================
  // Singleton Functions
  // ===========================================================================
  describe('Singleton functions', () => {
    it('should return singleton registry', () => {
      const reg1 = getCaseEventHandlerRegistry();
      const reg2 = getCaseEventHandlerRegistry();

      expect(reg1).toBe(reg2);
    });

    it('should return new registry after reset', () => {
      const reg1 = getCaseEventHandlerRegistry();
      resetCaseEventHandlerRegistry();
      const reg2 = getCaseEventHandlerRegistry();

      expect(reg1).not.toBe(reg2);
    });
  });
});
