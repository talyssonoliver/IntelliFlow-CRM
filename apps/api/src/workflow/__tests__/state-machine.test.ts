/**
 * Workflow State Machine Tests - IFC-028
 *
 * Tests for the workflow engine state machine implementation.
 *
 * @implements IFC-028 (Workflow Engine with LangGraph)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowStateMachine } from '../state-machine';
import type {
  WorkflowDefinition,
  WorkflowState,
  WorkflowNode,
  TransitionResult,
  HumanDecision,
} from '../types';

// ============================================
// TEST FIXTURES
// ============================================

interface LeadQualificationState extends Record<string, unknown> {
  leadId: string;
  score: number | null;
  status: 'pending' | 'qualified' | 'disqualified' | 'needs_review';
  reviewerId?: string;
  notes: string[];
}

function createTestWorkflowDefinition(): WorkflowDefinition<LeadQualificationState> {
  const nodes = new Map<string, WorkflowNode<LeadQualificationState>>();

  nodes.set('start', {
    id: 'start',
    type: 'start',
    name: 'Start',
    description: 'Workflow entry point',
  });

  nodes.set('score_lead', {
    id: 'score_lead',
    type: 'action',
    name: 'Score Lead',
    description: 'Calculate lead score using AI',
    handler: async (state) => {
      // Simulate scoring
      const score = Math.floor(Math.random() * 100);
      return {
        score,
        notes: [...state.data.notes, `Lead scored: ${score}/100`],
      };
    },
  });

  nodes.set('check_threshold', {
    id: 'check_threshold',
    type: 'decision',
    name: 'Check Threshold',
    description: 'Determine if lead needs human review',
    condition: (state) => {
      const score = state.data.score ?? 0;
      if (score > 70) return 'auto_qualify';
      if (score < 30) return 'auto_disqualify';
      return 'human_review';
    },
  });

  nodes.set('human_review', {
    id: 'human_review',
    type: 'human',
    name: 'Human Review',
    description: 'Requires human approval',
    timeout: 24 * 60 * 60 * 1000, // 24 hours
  });

  nodes.set('auto_qualify', {
    id: 'auto_qualify',
    type: 'action',
    name: 'Auto Qualify',
    description: 'Automatically qualify high-scoring lead',
    handler: async (state) => ({
      status: 'qualified' as const,
      notes: [...state.data.notes, 'Auto-qualified: score > 70'],
    }),
  });

  nodes.set('auto_disqualify', {
    id: 'auto_disqualify',
    type: 'action',
    name: 'Auto Disqualify',
    description: 'Automatically disqualify low-scoring lead',
    handler: async (state) => ({
      status: 'disqualified' as const,
      notes: [...state.data.notes, 'Auto-disqualified: score < 30'],
    }),
  });

  nodes.set('end', {
    id: 'end',
    type: 'end',
    name: 'End',
    description: 'Workflow complete',
  });

  return {
    name: 'lead-qualification',
    description: 'Lead qualification workflow with human-in-the-loop',
    version: '1.0.0',
    nodes,
    edges: [
      { from: 'start', to: 'score_lead' },
      { from: 'score_lead', to: 'check_threshold' },
      { from: 'check_threshold', to: 'auto_qualify', label: 'auto_qualify' },
      { from: 'check_threshold', to: 'auto_disqualify', label: 'auto_disqualify' },
      { from: 'check_threshold', to: 'human_review', label: 'human_review' },
      { from: 'human_review', to: 'end' },
      { from: 'auto_qualify', to: 'end' },
      { from: 'auto_disqualify', to: 'end' },
    ],
    initialState: () => ({
      leadId: '',
      score: null,
      status: 'pending',
      notes: [],
    }),
  };
}

// ============================================
// TESTS
// ============================================

describe('WorkflowStateMachine', () => {
  let machine: WorkflowStateMachine;
  let testDefinition: WorkflowDefinition<LeadQualificationState>;

  beforeEach(() => {
    machine = new WorkflowStateMachine();
    testDefinition = createTestWorkflowDefinition();
    machine.registerWorkflow(testDefinition);
  });

  describe('Workflow Registration', () => {
    it('should register a workflow definition', () => {
      const newMachine = new WorkflowStateMachine();
      expect(() => newMachine.registerWorkflow(testDefinition)).not.toThrow();
    });

    it('should throw when registering duplicate workflow', () => {
      expect(() => machine.registerWorkflow(testDefinition)).toThrow(
        'Workflow lead-qualification is already registered'
      );
    });

    it('should list registered workflows', () => {
      const workflows = machine.getRegisteredWorkflows();
      expect(workflows).toContain('lead-qualification');
    });
  });

  describe('Workflow Creation', () => {
    it('should create a workflow with initial state', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      expect(state.workflowId).toBeDefined();
      expect(state.workflowName).toBe('lead-qualification');
      expect(state.currentNode).toBe('start');
      expect(state.checkpoint).toBe(0);
      expect(state.isPaused).toBe(false);
      expect(state.data.leadId).toBe('lead-123');
      expect(state.data.status).toBe('pending');
    });

    it('should throw when creating workflow for unknown definition', async () => {
      await expect(
        machine.createWorkflow('unknown-workflow')
      ).rejects.toThrow('Workflow unknown-workflow is not registered');
    });

    it('should generate unique workflow IDs', async () => {
      const state1 = await machine.createWorkflow('lead-qualification');
      const state2 = await machine.createWorkflow('lead-qualification');

      expect(state1.workflowId).not.toBe(state2.workflowId);
    });
  });

  describe('State Transitions', () => {
    it('should transition from start to first action node', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      );

      expect(result.success).toBe(true);
      expect(result.state.currentNode).toBe('score_lead');
      expect(result.state.checkpoint).toBe(1);
    });

    it('should execute action node handler', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      // Move to score_lead
      await machine.transition(state.workflowId, 'next');

      // Execute score_lead
      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      );

      expect(result.success).toBe(true);
      expect(result.state.data.score).not.toBeNull();
      expect(result.state.data.notes.length).toBeGreaterThan(0);
    });

    it('should follow decision node conditions', async () => {
      // Create workflow with a specific score
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      // Override the score_lead handler to return a specific score
      const definition = testDefinition;
      const scoreNode = definition.nodes.get('score_lead')!;
      scoreNode.handler = async (s) => ({
        score: 80, // High score -> should auto-qualify
        notes: [...s.data.notes, 'Lead scored: 80/100'],
      });

      // Move through workflow
      await machine.transition(state.workflowId, 'next'); // start -> score_lead
      await machine.transition(state.workflowId, 'next'); // score_lead -> check_threshold

      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      ); // check_threshold -> auto_qualify

      expect(result.state.currentNode).toBe('auto_qualify');
    });

    it('should record transition history', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      await machine.transition(state.workflowId, 'next');
      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      );

      expect(result.state.history.length).toBeGreaterThan(0);
      expect(result.state.history[0].fromNode).toBe('start');
      expect(result.state.history[0].toNode).toBe('score_lead');
    });
  });

  describe('Human-in-the-Loop', () => {
    it('should pause on human review node', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      // Override score to trigger human review
      const definition = testDefinition;
      const scoreNode = definition.nodes.get('score_lead')!;
      scoreNode.handler = async (s) => ({
        score: 50, // Medium score -> needs human review
        notes: [...s.data.notes, 'Lead scored: 50/100'],
      });

      // Move to human review
      await machine.transition(state.workflowId, 'next'); // start -> score_lead
      await machine.transition(state.workflowId, 'next'); // score_lead -> check_threshold
      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      ); // check_threshold -> human_review

      expect(result.state.currentNode).toBe('human_review');
      expect(result.state.isPaused).toBe(true);
      expect(result.awaitingHumanInput).toBe(true);
    });

    it('should process approve decision', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      // Override to trigger human review
      const scoreNode = testDefinition.nodes.get('score_lead')!;
      scoreNode.handler = async (s) => ({
        score: 50,
        notes: [...s.data.notes, 'Lead scored: 50/100'],
      });

      // Move to human review
      await machine.transition(state.workflowId, 'next');
      await machine.transition(state.workflowId, 'next');
      await machine.transition(state.workflowId, 'next');

      const decision: HumanDecision = {
        workflowId: state.workflowId,
        userId: 'user-456',
        decision: 'approve',
        comment: 'Looks good to proceed',
      };

      const result = await machine.processHumanDecision<LeadQualificationState>(decision);

      expect(result.success).toBe(true);
      expect(result.state.isPaused).toBe(false);
      expect(result.state.data.reviewerId).toBe('user-456');
    });

    it('should process reject decision', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      // Override to trigger human review
      const scoreNode = testDefinition.nodes.get('score_lead')!;
      scoreNode.handler = async (s) => ({
        score: 50,
        notes: [...s.data.notes, 'Lead scored: 50/100'],
      });

      await machine.transition(state.workflowId, 'next');
      await machine.transition(state.workflowId, 'next');
      await machine.transition(state.workflowId, 'next');

      const decision: HumanDecision = {
        workflowId: state.workflowId,
        userId: 'user-456',
        decision: 'reject',
        comment: 'Does not meet criteria',
      };

      const result = await machine.processHumanDecision<LeadQualificationState>(decision);

      expect(result.success).toBe(true);
      expect(result.state.data.status).toBe('disqualified');
    });
  });

  describe('State Persistence', () => {
    it('should retrieve saved workflow state', async () => {
      const created = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      const retrieved = await machine.getState<LeadQualificationState>(created.workflowId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.workflowId).toBe(created.workflowId);
      expect(retrieved?.data.leadId).toBe('lead-123');
    });

    it('should return null for unknown workflow ID', async () => {
      const result = await machine.getState('non-existent-id');
      expect(result).toBeNull();
    });

    it('should persist state across transitions', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      await machine.transition(state.workflowId, 'next');

      const retrieved = await machine.getState<LeadQualificationState>(state.workflowId);

      expect(retrieved?.currentNode).toBe('score_lead');
      expect(retrieved?.checkpoint).toBe(1);
    });
  });

  describe('Workflow Lifecycle', () => {
    it('should mark workflow as complete at end node', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      // Override for auto-qualify path
      const scoreNode = testDefinition.nodes.get('score_lead')!;
      scoreNode.handler = async (s) => ({
        score: 80,
        notes: [...s.data.notes, 'Lead scored: 80/100'],
      });

      // Run through entire workflow
      await machine.transition(state.workflowId, 'next'); // start -> score_lead
      await machine.transition(state.workflowId, 'next'); // score_lead -> check_threshold
      await machine.transition(state.workflowId, 'next'); // check_threshold -> auto_qualify
      await machine.transition(state.workflowId, 'next'); // auto_qualify -> end

      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      );

      expect(result.isComplete).toBe(true);
    });

    it('should pause and resume workflow', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      await machine.pauseWorkflow(state.workflowId);

      const paused = await machine.getState<LeadQualificationState>(state.workflowId);
      expect(paused?.isPaused).toBe(true);

      await machine.resumeWorkflow(state.workflowId);

      const resumed = await machine.getState<LeadQualificationState>(state.workflowId);
      expect(resumed?.isPaused).toBe(false);
    });

    it('should cancel workflow', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      await machine.cancelWorkflow(state.workflowId);

      const cancelled = await machine.getState<LeadQualificationState>(state.workflowId);
      expect(cancelled?.error).toBe('Workflow cancelled');
    });
  });

  describe('Query and List', () => {
    it('should list workflows by name', async () => {
      await machine.createWorkflow('lead-qualification', { leadId: 'lead-1' });
      await machine.createWorkflow('lead-qualification', { leadId: 'lead-2' });

      const workflows = await machine.listWorkflows<LeadQualificationState>({
        workflowName: 'lead-qualification',
      });

      expect(workflows.length).toBe(2);
    });

    it('should list paused workflows', async () => {
      const state1 = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-1' }
      );
      await machine.createWorkflow('lead-qualification', { leadId: 'lead-2' });

      await machine.pauseWorkflow(state1.workflowId);

      const workflows = await machine.listWorkflows<LeadQualificationState>({
        isPaused: true,
      });

      expect(workflows.length).toBe(1);
      expect(workflows[0].data.leadId).toBe('lead-1');
    });

    it('should paginate results', async () => {
      await machine.createWorkflow('lead-qualification', { leadId: 'lead-1' });
      await machine.createWorkflow('lead-qualification', { leadId: 'lead-2' });
      await machine.createWorkflow('lead-qualification', { leadId: 'lead-3' });

      const page1 = await machine.listWorkflows<LeadQualificationState>({
        limit: 2,
        offset: 0,
      });
      const page2 = await machine.listWorkflows<LeadQualificationState>({
        limit: 2,
        offset: 2,
      });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle handler errors gracefully', async () => {
      const errorDefinition = createTestWorkflowDefinition();
      const scoreNode = errorDefinition.nodes.get('score_lead')!;
      scoreNode.handler = async () => {
        throw new Error('Scoring service unavailable');
      };

      const errorMachine = new WorkflowStateMachine();
      errorMachine.registerWorkflow(errorDefinition);

      const state = await errorMachine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      await errorMachine.transition(state.workflowId, 'next'); // start -> score_lead

      const result = await errorMachine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      ); // should fail

      expect(result.success).toBe(false);
      expect(result.error).toContain('Scoring service unavailable');
    });

    it('should reject transitions on paused workflows', async () => {
      const state = await machine.createWorkflow<LeadQualificationState>(
        'lead-qualification',
        { leadId: 'lead-123' }
      );

      await machine.pauseWorkflow(state.workflowId);

      const result = await machine.transition<LeadQualificationState>(
        state.workflowId,
        'next'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('paused');
    });
  });
});
