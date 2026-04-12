/**
 * Case Handler Additional Tests
 * Covers: rules engine fallback branches, exception catch blocks
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CaseCreatedHandler,
  CaseStatusChangedHandler,
  CaseClosedHandler,
  CaseTaskAddedHandler,
  CaseTaskCompletedHandler,
  CaseApprovalRequiredHandler,
  CaseEventHandlerRegistry,
  resetCaseEventHandlerRegistry,
} from '../case-handler';
import type { CaseEventPayload, EventContext, HandlerDependencies } from '../case-handler';

vi.mock('@intelliflow/domain', () => {
  class M {
    value;
    constructor(v: string) {
      this.value = v;
    }
    static create(v: string) {
      if (!v) return { isFailure: true };
      return { isFailure: false, value: new M(v) };
    }
  }
  class E {
    constructor(...a: any[]) {}
  }
  return {
    CaseId: M,
    CaseWorkflowStartedEvent: E,
    CaseWorkflowCompletedEvent: E,
    CaseWorkflowFailedEvent: E,
    CaseApprovalRequiredEvent: E,
    CaseEscalatedEvent: E,
    CASE_EVENT_WORKFLOW_ROUTING: {},
  };
});

vi.mock('@intelliflow/platform/workflow', () => ({
  WorkflowEngineFactory: { getEngine: vi.fn().mockReturnValue(null) },
  getRulesEngine: vi.fn().mockReturnValue({ evaluate: vi.fn().mockResolvedValue([]) }),
  getCaseEventWorkflowEngine: vi.fn().mockReturnValue('temporal'),
  isRulesEngineEvent: vi.fn().mockReturnValue(false),
}));

import { getCaseEventWorkflowEngine, getRulesEngine } from '@intelliflow/platform/workflow';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
function ctx(ov: Partial<EventContext> = {}): EventContext {
  return {
    eventId: 'evt-x',
    eventType: 'case.created',
    occurredAt: new Date(),
    userId: 'u1',
    ...ov,
  };
}
function pay(ov: Partial<CaseEventPayload> = {}): CaseEventPayload {
  return { caseId: UUID, title: 'T', clientId: 'c1', assignedTo: 'u1', priority: 'MEDIUM', ...ov };
}

describe('Case Handler Additional Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCaseEventHandlerRegistry();
    (getCaseEventWorkflowEngine as any).mockReturnValue('temporal');
  });

  describe('rules engine fallback branches', () => {
    it('CaseCreatedHandler maps rules to temporal', async () => {
      (getCaseEventWorkflowEngine as any).mockReturnValue('rules');
      const r = await new CaseCreatedHandler().handle(pay(), ctx());
      expect(r.success).toBe(true);
      expect(r.workflowEngine).toBe('temporal');
    });
    it('CaseStatusChangedHandler maps rules to temporal', async () => {
      (getCaseEventWorkflowEngine as any).mockReturnValue('rules');
      const r = await new CaseStatusChangedHandler().handle(
        pay({ previousStatus: 'OPEN', newStatus: 'IN_PROGRESS' }),
        ctx()
      );
      expect(r.workflowEngine).toBe('temporal');
    });
    it('CaseClosedHandler maps rules to temporal', async () => {
      (getCaseEventWorkflowEngine as any).mockReturnValue('rules');
      const r = await new CaseClosedHandler().handle(pay({ resolution: 'Done' }), ctx());
      expect(r.workflowEngine).toBe('temporal');
    });
    it('CaseTaskAddedHandler maps rules to bullmq', async () => {
      (getCaseEventWorkflowEngine as any).mockReturnValue('rules');
      const r = await new CaseTaskAddedHandler().handle(pay(), ctx());
      expect(r.workflowEngine).toBe('bullmq');
    });
    it('CaseTaskCompletedHandler maps rules to bullmq', async () => {
      (getCaseEventWorkflowEngine as any).mockReturnValue('rules');
      const r = await new CaseTaskCompletedHandler().handle(pay(), ctx());
      expect(r.workflowEngine).toBe('bullmq');
    });
  });

  describe('exception catch blocks', () => {
    it('CaseTaskAddedHandler catches error', async () => {
      (getCaseEventWorkflowEngine as any).mockImplementation(() => {
        throw new Error('engine err');
      });
      const r = await new CaseTaskAddedHandler().handle(pay(), ctx());
      expect(r.success).toBe(false);
      expect(r.error).toContain('engine err');
    });
    it('CaseTaskCompletedHandler catches error', async () => {
      (getCaseEventWorkflowEngine as any).mockImplementation(() => {
        throw new Error('tc err');
      });
      const r = await new CaseTaskCompletedHandler().handle(pay(), ctx());
      expect(r.success).toBe(false);
      expect(r.error).toContain('tc err');
    });
    it('CaseApprovalRequiredHandler catches publish error', async () => {
      const pub = { publish: vi.fn().mockRejectedValue(new Error('pub err')) };
      const r = await new CaseApprovalRequiredHandler().handle(pay(), ctx(), {
        eventPublisher: pub as any,
      });
      expect(r.success).toBe(false);
      expect(r.error).toContain('pub err');
    });
    it('CaseClosedHandler catches error', async () => {
      (getCaseEventWorkflowEngine as any).mockImplementation(() => {
        throw new Error('closed err');
      });
      const r = await new CaseClosedHandler().handle(pay(), ctx());
      expect(r.success).toBe(false);
      expect(r.error).toContain('closed err');
    });
  });

  describe('registry with deps', () => {
    it('should forward deps to handler', async () => {
      const reg = new CaseEventHandlerRegistry();
      const eng = { startWorkflow: vi.fn().mockResolvedValue({ workflowId: 'w1' }) };
      const pub = { publish: vi.fn().mockResolvedValue(undefined) };
      const r = await reg.processEvent('case.created', pay(), ctx(), {
        workflowEngine: eng,
        eventPublisher: pub,
      } as any);
      expect(r.success).toBe(true);
      expect(eng.startWorkflow).toHaveBeenCalled();
    });
  });

  describe('rules engine with matched results', () => {
    it('should sum actionsExecuted from multiple rules', async () => {
      (getRulesEngine as any).mockReturnValue({
        evaluate: vi.fn().mockResolvedValue([
          { matched: true, actionsExecuted: 3 },
          { matched: false, actionsExecuted: 0 },
          { matched: true, actionsExecuted: 1 },
        ]),
      });
      const { CasePriorityChangedHandler } = await import('../case-handler.js');
      const r = await new CasePriorityChangedHandler().handle(pay({ priority: 'HIGH' }), ctx());
      expect(r.metadata?.rulesMatched).toBe(true);
      expect(r.metadata?.actionsExecuted).toBe(4);
    });
  });
});
