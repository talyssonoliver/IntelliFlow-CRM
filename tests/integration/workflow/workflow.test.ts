/**
 * Workflow Engine Integration Tests
 *
 * Tests for workflow engine wrapper, rules engine, event handlers,
 * and the complete workflow lifecycle integration.
 *
 * @module tests/integration/workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import actual implementations using relative paths (vitest aliases don't work in tests/integration)
import {
  WorkflowRouter,
  createDefaultWorkflowRouter,
  getCaseEventWorkflowEngine,
  isRulesEngineEvent,
  type IWorkflowEngine,
  type WorkflowHandle,
  type WorkflowStatus,
} from '../../../packages/platform/src/workflow';

import {
  CASE_EVENT_WORKFLOW_ROUTING,
  CASE_EVENT_TYPES,
  type DomainEventPublisher,
} from '../../../packages/domain/src';

import {
  CaseEventHandlerRegistry,
  CaseCreatedHandler,
  CaseStatusChangedHandler,
  CasePriorityChangedHandler,
  CaseApprovalRequiredHandler,
  getCaseEventHandlerRegistry,
  resetCaseEventHandlerRegistry,
  type HandlerDependencies,
} from '../../../apps/api/src/workflow/handlers/case-handler';

// ============================================================================
// Mock Event Publisher for Testing
// ============================================================================

class MockEventPublisher implements DomainEventPublisher {
  public publishedEvents: Array<{
    eventType: string;
    payload: Record<string, unknown>;
    timestamp: Date;
  }> = [];

  async publish(event: { eventType: string; toPayload(): Record<string, unknown> }): Promise<void> {
    this.publishedEvents.push({
      eventType: event.eventType,
      payload: event.toPayload(),
      timestamp: new Date(),
    });
  }

  async publishAll(events: Array<{ eventType: string; toPayload(): Record<string, unknown> }>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  getEventsByType(eventType: string): Array<Record<string, unknown>> {
    return this.publishedEvents
      .filter((e) => e.eventType === eventType)
      .map((e) => e.payload);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// Mock Workflow Engine for Testing
// ============================================================================

class MockWorkflowEngine implements IWorkflowEngine {
  readonly engineType: 'temporal' | 'langgraph' | 'bullmq';
  private readonly workflows = new Map<string, MockWorkflowHandle>();
  private healthy = true;

  constructor(engineType: 'temporal' | 'langgraph' | 'bullmq' = 'temporal') {
    this.engineType = engineType;
  }

  async startWorkflow<TInput, TOutput>(
    workflowId: string,
    workflowName: string,
    input: TInput
  ): Promise<WorkflowHandle<TOutput>> {
    const handle = new MockWorkflowHandle(workflowId, workflowName, input);
    this.workflows.set(workflowId, handle);
    return handle as unknown as WorkflowHandle<TOutput>;
  }

  async getWorkflowHandle<TOutput>(workflowId: string): Promise<WorkflowHandle<TOutput> | null> {
    return (this.workflows.get(workflowId) as unknown as WorkflowHandle<TOutput>) ?? null;
  }

  async listWorkflows(): Promise<Array<{ id: string; status: WorkflowStatus; definitionId: string }>> {
    return Array.from(this.workflows.entries()).map(([id, handle]) => ({
      id,
      status: handle.status,
      definitionId: handle.workflowName,
    }));
  }

  async healthCheck(): Promise<{ healthy: boolean }> {
    return { healthy: this.healthy };
  }

  async shutdown(): Promise<void> {
    this.workflows.clear();
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  getWorkflow(workflowId: string): MockWorkflowHandle | undefined {
    return this.workflows.get(workflowId);
  }
}

class MockWorkflowHandle implements WorkflowHandle<unknown> {
  readonly workflowId: string;
  readonly workflowName: string;
  public status: WorkflowStatus = 'running';
  private _result: unknown = null;
  private readonly signals: Array<{ signalName: string; payload?: unknown }> = [];

  constructor(workflowId: string, workflowName: string, private readonly input: unknown) {
    this.workflowId = workflowId;
    this.workflowName = workflowName;
  }

  async getStatus(): Promise<WorkflowStatus> {
    return this.status;
  }

  async result(): Promise<unknown> {
    return this._result;
  }

  async signal(signal: { signalName: string; payload?: unknown }): Promise<void> {
    this.signals.push(signal);
  }

  async query<TResult>(): Promise<TResult> {
    return {} as TResult;
  }

  async cancel(): Promise<void> {
    this.status = 'cancelled';
  }

  async terminate(): Promise<void> {
    this.status = 'cancelled';
  }

  // Test helpers
  complete(result: unknown): void {
    this._result = result;
    this.status = 'completed';
  }

  fail(): void {
    this.status = 'failed';
  }

  getSignals(): Array<{ signalName: string; payload?: unknown }> {
    return this.signals;
  }
}

// ============================================================================
// Workflow Engine Tests
// ============================================================================

describe('Workflow Engine', () => {
  describe('TemporalWorkflowEngine', () => {
    let engine: MockWorkflowEngine;

    beforeEach(() => {
      engine = new MockWorkflowEngine('temporal');
    });

    afterEach(async () => {
      await engine.shutdown();
    });

    it('should pass health check when healthy', async () => {
      const health = await engine.healthCheck();
      expect(health.healthy).toBe(true);
    });

    it('should fail health check when unhealthy', async () => {
      engine.setHealthy(false);
      const health = await engine.healthCheck();
      expect(health.healthy).toBe(false);
    });

    it('should start a workflow and return a handle', async () => {
      const handle = await engine.startWorkflow(
        'test-workflow-1',
        'caseLifecycleWorkflow',
        { caseId: 'case-123' }
      );

      expect(handle.workflowId).toBe('test-workflow-1');
      expect(await handle.getStatus()).toBe('running');
    });

    it('should retrieve an existing workflow handle', async () => {
      await engine.startWorkflow('test-workflow-2', 'caseLifecycleWorkflow', {
        caseId: 'case-456',
      });

      const retrieved = await engine.getWorkflowHandle('test-workflow-2');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.workflowId).toBe('test-workflow-2');
    });

    it('should return null for non-existent workflow', async () => {
      const handle = await engine.getWorkflowHandle('non-existent');
      expect(handle).toBeNull();
    });

    it('should allow sending signals to workflows', async () => {
      const handle = await engine.startWorkflow('approval-workflow', 'caseApprovalWorkflow', {
        caseId: 'case-789',
      });

      await handle.signal({
        signalName: 'approve',
        payload: { approvedBy: 'user-1', comments: 'Looks good' },
      });

      const mockHandle = engine.getWorkflow('approval-workflow');
      expect(mockHandle?.getSignals()).toHaveLength(1);
      expect(mockHandle?.getSignals()[0].signalName).toBe('approve');
    });

    it('should allow cancelling workflows', async () => {
      const handle = await engine.startWorkflow('cancellable-workflow', 'longRunningWorkflow', {});

      await handle.cancel();
      expect(await handle.getStatus()).toBe('cancelled');
    });
  });

  describe('WorkflowRouter with CASE_EVENT_WORKFLOW_ROUTING', () => {
    let router: WorkflowRouter;

    beforeEach(() => {
      router = createDefaultWorkflowRouter();
    });

    it('should register routes from CASE_EVENT_WORKFLOW_ROUTING', () => {
      router.getAllRoutes();

      // Check that case events are registered
      const caseCreatedRoute = router.getRoute('case.created');
      expect(caseCreatedRoute).toBeDefined();
      expect(caseCreatedRoute?.engine).toBe('temporal');
    });

    it('should NOT register rules engine events as workflow routes', () => {
      // Rules engine events should not be in the workflow router
      // because they are handled synchronously
      const rulesEvents = Object.entries(CASE_EVENT_WORKFLOW_ROUTING)
        .filter(([_, engine]) => engine === 'rules')
        .map(([eventType]) => eventType);

      for (const eventType of rulesEvents) {
        const route = router.getRoute(eventType);
        expect(route).toBeUndefined();
      }
    });

    it('should register lead and notification routes', () => {
      expect(router.getRoute('lead.created')).toBeDefined();
      expect(router.getRoute('lead.scored')).toBeDefined();
      expect(router.getRoute('notification.requested')).toBeDefined();
      expect(router.getRoute('email.requested')).toBeDefined();
    });

    it('should return undefined for unregistered event types', () => {
      const route = router.getRoute('unknown.event');
      expect(route).toBeUndefined();
    });
  });

  describe('getCaseEventWorkflowEngine', () => {
    it('should return correct engine for temporal events', () => {
      expect(getCaseEventWorkflowEngine('case.created')).toBe('temporal');
      expect(getCaseEventWorkflowEngine('case.status_changed')).toBe('temporal');
      expect(getCaseEventWorkflowEngine('case.closed')).toBe('temporal');
    });

    it('should return rules for synchronous events', () => {
      expect(getCaseEventWorkflowEngine('case.deadline_updated')).toBe('rules');
      expect(getCaseEventWorkflowEngine('case.priority_changed')).toBe('rules');
      expect(getCaseEventWorkflowEngine('case.sla_breached')).toBe('rules');
    });

    it('should return bullmq for background job events', () => {
      expect(getCaseEventWorkflowEngine('case.task_added')).toBe('bullmq');
      expect(getCaseEventWorkflowEngine('case.task_completed')).toBe('bullmq');
      expect(getCaseEventWorkflowEngine('case.assigned')).toBe('bullmq');
    });
  });

  describe('isRulesEngineEvent', () => {
    it('should return true for rules engine events', () => {
      expect(isRulesEngineEvent('case.deadline_updated')).toBe(true);
      expect(isRulesEngineEvent('case.priority_changed')).toBe(true);
      expect(isRulesEngineEvent('case.timer_started')).toBe(true);
    });

    it('should return false for non-rules events', () => {
      expect(isRulesEngineEvent('case.created')).toBe(false);
      expect(isRulesEngineEvent('case.task_added')).toBe(false);
    });
  });
});

// ============================================================================
// Case Event Handler Tests
// ============================================================================

describe('Case Event Handlers', () => {
  let mockEngine: MockWorkflowEngine;
  let mockPublisher: MockEventPublisher;
  let deps: HandlerDependencies;

  beforeEach(() => {
    mockEngine = new MockWorkflowEngine('temporal');
    mockPublisher = new MockEventPublisher();
    deps = {
      workflowEngine: mockEngine,
      eventPublisher: mockPublisher,
    };
    resetCaseEventHandlerRegistry();
  });

  afterEach(async () => {
    await mockEngine.shutdown();
  });

  describe('CaseCreatedHandler', () => {
    let handler: CaseCreatedHandler;

    beforeEach(() => {
      handler = new CaseCreatedHandler();
    });

    it('should successfully process valid case creation', async () => {
      const result = await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test Case',
          clientId: 'client-456',
          priority: 'HIGH',
        },
        {
          eventId: 'evt-1',
          eventType: 'case.created',
          occurredAt: new Date(),
          userId: 'user-1',
        },
        deps
      );

      expect(result.success).toBe(true);
      expect(result.workflowId).toContain('case-lifecycle-');
      expect(result.workflowEngine).toBe('temporal');
    });

    it('should emit CaseWorkflowStartedEvent on success', async () => {
      await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Test Case',
          clientId: 'client-456',
        },
        {
          eventId: 'evt-1',
          eventType: 'case.created',
          occurredAt: new Date(),
          userId: 'user-1',
        },
        deps
      );

      const startedEvents = mockPublisher.getEventsByType('case.workflow_started');
      expect(startedEvents).toHaveLength(1);
      expect(startedEvents[0].workflowEngine).toBe('temporal');
    });

    it('should fail when required fields are missing', async () => {
      const result = await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          // Missing title and clientId
        },
        {
          eventId: 'evt-2',
          eventType: 'case.created',
          occurredAt: new Date(),
        },
        deps
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('CaseStatusChangedHandler', () => {
    let handler: CaseStatusChangedHandler;

    beforeEach(() => {
      handler = new CaseStatusChangedHandler();
    });

    it('should process status transitions', async () => {
      const result = await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          previousStatus: 'OPEN',
          newStatus: 'IN_PROGRESS',
          changedBy: 'user-1',
        },
        {
          eventId: 'evt-3',
          eventType: 'case.status_changed',
          occurredAt: new Date(),
        },
        deps
      );

      expect(result.success).toBe(true);
      expect(result.workflowEngine).toBe('temporal');
      expect(result.metadata?.transition).toBe('OPEN -> IN_PROGRESS');
    });

    it('should emit CaseWorkflowStartedEvent for status change', async () => {
      await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          previousStatus: 'IN_PROGRESS',
          newStatus: 'CLOSED',
        },
        {
          eventId: 'evt-4',
          eventType: 'case.status_changed',
          occurredAt: new Date(),
        },
        deps
      );

      const startedEvents = mockPublisher.getEventsByType('case.workflow_started');
      expect(startedEvents).toHaveLength(1);
    });
  });

  describe('CasePriorityChangedHandler', () => {
    let handler: CasePriorityChangedHandler;

    beforeEach(() => {
      handler = new CasePriorityChangedHandler();
    });

    it('should process priority changes via rules engine', async () => {
      const result = await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          priority: 'HIGH',
        },
        {
          eventId: 'evt-5',
          eventType: 'case.priority_changed',
          occurredAt: new Date(),
        },
        deps
      );

      expect(result.success).toBe(true);
      expect(result.workflowEngine).toBe('rules');
    });

    it('should emit CaseEscalatedEvent for URGENT priority', async () => {
      await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          priority: 'URGENT',
          assignedTo: 'user-1',
        },
        {
          eventId: 'evt-6',
          eventType: 'case.priority_changed',
          occurredAt: new Date(),
          userId: 'manager-1',
        },
        deps
      );

      const escalationEvents = mockPublisher.getEventsByType('case.escalated');
      expect(escalationEvents).toHaveLength(1);
      expect(escalationEvents[0].escalationLevel).toBe(1);
    });
  });

  describe('CaseApprovalRequiredHandler', () => {
    let handler: CaseApprovalRequiredHandler;

    beforeEach(() => {
      handler = new CaseApprovalRequiredHandler();
    });

    it('should emit CaseApprovalRequiredEvent and start approval workflow', async () => {
      const result = await handler.handle(
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          assignedTo: 'manager-1',
        },
        {
          eventId: 'evt-7',
          eventType: 'case.approval_required',
          occurredAt: new Date(),
          userId: 'user-1',
        },
        deps
      );

      expect(result.success).toBe(true);
      expect(result.workflowEngine).toBe('temporal');
      expect(result.workflowId).toContain('case-approval-');

      const approvalEvents = mockPublisher.getEventsByType('case.approval_required');
      expect(approvalEvents).toHaveLength(1);
      expect(approvalEvents[0].approvalType).toBe('proceed');
    });
  });

  describe('CaseEventHandlerRegistry', () => {
    let registry: CaseEventHandlerRegistry;

    beforeEach(() => {
      registry = getCaseEventHandlerRegistry();
    });

    it('should register all default handlers', () => {
      const eventTypes = registry.getRegisteredEventTypes();

      expect(eventTypes).toContain('case.created');
      expect(eventTypes).toContain('case.status_changed');
      expect(eventTypes).toContain('case.priority_changed');
      expect(eventTypes).toContain('case.deadline_updated');
      expect(eventTypes).toContain('case.closed');
      expect(eventTypes).toContain('case.task_added');
      expect(eventTypes).toContain('case.task_completed');
      expect(eventTypes).toContain('case.approval_required');
    });

    it('should process events through the registry', async () => {
      const result = await registry.processEvent(
        'case.created',
        {
          caseId: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Registry Test',
          clientId: 'client-789',
        },
        {
          eventId: 'evt-8',
          eventType: 'case.created',
          occurredAt: new Date(),
        },
        deps
      );

      expect(result.success).toBe(true);
    });

    it('should return error for unregistered event types', async () => {
      const result = await registry.processEvent(
        'unknown.event',
        { caseId: '123e4567-e89b-12d3-a456-426614174000' },
        {
          eventId: 'evt-9',
          eventType: 'unknown.event',
          occurredAt: new Date(),
        },
        deps
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler');
    });

    it('should correctly identify rules engine events', () => {
      expect(registry.isRulesEngineEvent('case.priority_changed')).toBe(true);
      expect(registry.isRulesEngineEvent('case.deadline_updated')).toBe(true);
      expect(registry.isRulesEngineEvent('case.created')).toBe(false);
    });

    it('should return correct routing for event types', () => {
      expect(registry.getEventRouting('case.created')).toBe('temporal');
      expect(registry.getEventRouting('case.priority_changed')).toBe('rules');
      expect(registry.getEventRouting('case.task_added')).toBe('bullmq');
    });
  });
});

// ============================================================================
// Complete Workflow Lifecycle Integration Tests
// ============================================================================

describe('Complete Workflow Lifecycle', () => {
  let mockEngine: MockWorkflowEngine;
  let mockPublisher: MockEventPublisher;
  let registry: CaseEventHandlerRegistry;
  let deps: HandlerDependencies;

  beforeEach(() => {
    mockEngine = new MockWorkflowEngine('temporal');
    mockPublisher = new MockEventPublisher();
    resetCaseEventHandlerRegistry();
    registry = getCaseEventHandlerRegistry();
    deps = {
      workflowEngine: mockEngine,
      eventPublisher: mockPublisher,
    };
  });

  afterEach(async () => {
    await mockEngine.shutdown();
  });

  it('should process complete case lifecycle from creation to closure', async () => {
    const caseId = '123e4567-e89b-12d3-a456-426614174000';
    const events: Array<{ type: string; result: { success: boolean } }> = [];

    // 1. Create case
    const createResult = await registry.processEvent(
      'case.created',
      {
        caseId,
        title: 'Lifecycle Test Case',
        clientId: 'client-1',
        priority: 'HIGH',
      },
      {
        eventId: 'evt-create',
        eventType: 'case.created',
        occurredAt: new Date(),
        userId: 'user-1',
      },
      deps
    );
    events.push({ type: 'case.created', result: createResult });

    // 2. Change status to IN_PROGRESS
    const statusResult = await registry.processEvent(
      'case.status_changed',
      {
        caseId,
        previousStatus: 'OPEN',
        newStatus: 'IN_PROGRESS',
        changedBy: 'user-1',
      },
      {
        eventId: 'evt-status',
        eventType: 'case.status_changed',
        occurredAt: new Date(),
      },
      deps
    );
    events.push({ type: 'case.status_changed', result: statusResult });

    // 3. Add a task
    const taskResult = await registry.processEvent(
      'case.task_added',
      {
        caseId,
        assignedTo: 'user-2',
      },
      {
        eventId: 'evt-task',
        eventType: 'case.task_added',
        occurredAt: new Date(),
      },
      deps
    );
    events.push({ type: 'case.task_added', result: taskResult });

    // 4. Update priority to URGENT
    const priorityResult = await registry.processEvent(
      'case.priority_changed',
      {
        caseId,
        priority: 'URGENT',
        assignedTo: 'user-1',
      },
      {
        eventId: 'evt-priority',
        eventType: 'case.priority_changed',
        occurredAt: new Date(),
        userId: 'manager-1',
      },
      deps
    );
    events.push({ type: 'case.priority_changed', result: priorityResult });

    // 5. Complete task
    const taskCompleteResult = await registry.processEvent(
      'case.task_completed',
      {
        caseId,
      },
      {
        eventId: 'evt-task-complete',
        eventType: 'case.task_completed',
        occurredAt: new Date(),
      },
      deps
    );
    events.push({ type: 'case.task_completed', result: taskCompleteResult });

    // 6. Close case
    const closeResult = await registry.processEvent(
      'case.closed',
      {
        caseId,
        resolution: 'Resolved successfully',
        changedBy: 'user-1',
      },
      {
        eventId: 'evt-close',
        eventType: 'case.closed',
        occurredAt: new Date(),
      },
      deps
    );
    events.push({ type: 'case.closed', result: closeResult });

    // Verify all events processed successfully
    expect(events.every((e) => e.result.success)).toBe(true);

    // Verify workflow events were emitted
    const workflowStartedEvents = mockPublisher.getEventsByType('case.workflow_started');
    expect(workflowStartedEvents.length).toBeGreaterThanOrEqual(4); // create, status, task, close

    // Verify escalation event was emitted for URGENT priority
    const escalationEvents = mockPublisher.getEventsByType('case.escalated');
    expect(escalationEvents).toHaveLength(1);

    // Verify workflows were started in the engine
    const workflows = await mockEngine.listWorkflows();
    expect(workflows.length).toBeGreaterThanOrEqual(4);
  });

  it('should handle approval flow with human-in-the-loop', async () => {
    const caseId = '123e4567-e89b-12d3-a456-426614174001';

    // Request approval
    const result = await registry.processEvent(
      'case.approval_required',
      {
        caseId,
        assignedTo: 'manager-1',
      },
      {
        eventId: 'evt-approval',
        eventType: 'case.approval_required',
        occurredAt: new Date(),
        userId: 'user-1',
      },
      deps
    );

    expect(result.success).toBe(true);
    expect(result.workflowId).toContain('case-approval-');

    // Verify approval event was emitted
    const approvalEvents = mockPublisher.getEventsByType('case.approval_required');
    expect(approvalEvents).toHaveLength(1);
    expect(approvalEvents[0].requiredApprovers).toContain('manager-1');

    // Verify workflow started event was emitted
    const workflowEvents = mockPublisher.getEventsByType('case.workflow_started');
    expect(workflowEvents).toHaveLength(1);
    expect(workflowEvents[0].workflowName).toBe('caseApprovalWorkflow');

    // Simulate sending approval signal to the workflow
    const workflow = mockEngine.getWorkflow(result.workflowId!);
    expect(workflow).toBeDefined();

    await workflow!.signal({
      signalName: 'approve',
      payload: { approvedBy: 'manager-1', approved: true },
    });

    expect(workflow!.getSignals()).toHaveLength(1);
    expect(workflow!.getSignals()[0].signalName).toBe('approve');
  });

  it('should route events to correct engines based on CASE_EVENT_WORKFLOW_ROUTING', async () => {
    const caseId = '123e4567-e89b-12d3-a456-426614174002';
    const routingResults: Array<{ eventType: string; expectedEngine: string; actualEngine?: string }> = [];

    // Test temporal events
    for (const eventType of ['case.created', 'case.status_changed', 'case.closed']) {
      const result = await registry.processEvent(
        eventType,
        {
          caseId,
          title: 'Routing Test',
          clientId: 'client-1',
          previousStatus: 'OPEN',
          newStatus: 'IN_PROGRESS',
        },
        {
          eventId: `evt-${eventType}`,
          eventType,
          occurredAt: new Date(),
        },
        deps
      );
      routingResults.push({
        eventType,
        expectedEngine: 'temporal',
        actualEngine: result.workflowEngine,
      });
    }

    // Test rules engine events
    for (const eventType of ['case.priority_changed', 'case.deadline_updated']) {
      const result = await registry.processEvent(
        eventType,
        {
          caseId,
          priority: 'HIGH',
          newDeadline: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          eventId: `evt-${eventType}`,
          eventType,
          occurredAt: new Date(),
        },
        deps
      );
      routingResults.push({
        eventType,
        expectedEngine: 'rules',
        actualEngine: result.workflowEngine,
      });
    }

    // Test bullmq events
    for (const eventType of ['case.task_added', 'case.task_completed']) {
      const result = await registry.processEvent(
        eventType,
        { caseId },
        {
          eventId: `evt-${eventType}`,
          eventType,
          occurredAt: new Date(),
        },
        deps
      );
      routingResults.push({
        eventType,
        expectedEngine: 'bullmq',
        actualEngine: result.workflowEngine,
      });
    }

    // Verify all routings are correct
    for (const { expectedEngine, actualEngine } of routingResults) {
      expect(actualEngine).toBe(expectedEngine);
    }
  });

  it('should achieve >95% workflow execution success rate', async () => {
    const totalExecutions = 100;
    let successfulExecutions = 0;
    const caseId = '123e4567-e89b-12d3-a456-426614174003';

    for (let i = 0; i < totalExecutions; i++) {
      const result = await registry.processEvent(
        'case.created',
        {
          caseId: `${caseId.slice(0, -1)}${i % 10}`,
          title: `Test Case ${i}`,
          clientId: `client-${i}`,
        },
        {
          eventId: `evt-${i}`,
          eventType: 'case.created',
          occurredAt: new Date(),
        },
        deps
      );

      if (result.success) {
        successfulExecutions++;
      }
    }

    const successRate = (successfulExecutions / totalExecutions) * 100;
    expect(successRate).toBeGreaterThan(95);
    console.log(`[Integration Test] Workflow Success Rate: ${successRate}%`);
  });
});

// ============================================================================
// CASE_EVENT_WORKFLOW_ROUTING Verification Tests
// ============================================================================

describe('CASE_EVENT_WORKFLOW_ROUTING Configuration', () => {
  it('should define routing for all CASE_EVENT_TYPES', () => {
    for (const eventType of CASE_EVENT_TYPES) {
      expect(CASE_EVENT_WORKFLOW_ROUTING[eventType]).toBeDefined();
    }
  });

  it('should have valid engine values', () => {
    const validEngines = ['temporal', 'langgraph', 'bullmq', 'rules'];

    for (const [, engine] of Object.entries(CASE_EVENT_WORKFLOW_ROUTING)) {
      expect(validEngines).toContain(engine);
    }
  });

  it('should route durable workflows to temporal', () => {
    const durableEvents = [
      'case.created',
      'case.status_changed',
      'case.closed',
      'case.reopened',
      'case.workflow_started',
      'case.workflow_completed',
      'case.workflow_failed',
      'case.approval_required',
      'case.approval_received',
      'case.escalated',
    ];

    for (const eventType of durableEvents) {
      expect(CASE_EVENT_WORKFLOW_ROUTING[eventType as keyof typeof CASE_EVENT_WORKFLOW_ROUTING]).toBe('temporal');
    }
  });

  it('should route fast synchronous events to rules engine', () => {
    const rulesEvents = [
      'case.deadline_updated',
      'case.priority_changed',
      'case.sla_breached',
      'case.timer_started',
      'case.timer_paused',
    ];

    for (const eventType of rulesEvents) {
      expect(CASE_EVENT_WORKFLOW_ROUTING[eventType as keyof typeof CASE_EVENT_WORKFLOW_ROUTING]).toBe('rules');
    }
  });

  it('should route background jobs to bullmq', () => {
    const bullmqEvents = [
      'case.task_added',
      'case.task_removed',
      'case.task_completed',
      'case.assigned',
      'case.note_added',
      'case.document_attached',
    ];

    for (const eventType of bullmqEvents) {
      expect(CASE_EVENT_WORKFLOW_ROUTING[eventType as keyof typeof CASE_EVENT_WORKFLOW_ROUTING]).toBe('bullmq');
    }
  });
});
