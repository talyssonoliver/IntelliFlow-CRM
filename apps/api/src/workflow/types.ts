/**
 * Workflow Engine Types - IFC-028
 *
 * Core type definitions for the LangGraph-inspired workflow engine.
 * Supports state persistence, conditional branching, and human-in-the-loop.
 *
 * @implements IFC-028 (Workflow Engine with LangGraph)
 */

import { z } from 'zod';

// ============================================
// WORKFLOW STATE
// ============================================

/**
 * Base workflow state that all workflows extend
 */
export interface WorkflowStateBase {
  /** Unique identifier for this workflow instance */
  workflowId: string;
  /** Name of the workflow definition */
  workflowName: string;
  /** Current checkpoint number (increments with each transition) */
  checkpoint: number;
  /** Current node in the workflow */
  currentNode: string;
  /** Whether the workflow is paused (waiting for human input) */
  isPaused: boolean;
  /** Timestamp when workflow was created */
  createdAt: Date;
  /** Timestamp of last state update */
  updatedAt: Date;
  /** Error message if workflow is in error state */
  error?: string;
}

/**
 * Generic workflow state combining base state with custom state
 */
export interface WorkflowState<T extends Record<string, unknown> = Record<string, unknown>>
  extends WorkflowStateBase {
  /** Custom workflow-specific state */
  data: T;
  /** History of state transitions */
  history: StateTransition[];
}

/**
 * Record of a state transition
 */
export interface StateTransition {
  /** Checkpoint number at time of transition */
  checkpoint: number;
  /** Node transitioned from */
  fromNode: string;
  /** Node transitioned to */
  toNode: string;
  /** Action that triggered the transition */
  action: string;
  /** Timestamp of transition */
  timestamp: Date;
  /** Optional payload that accompanied the action */
  payload?: unknown;
}

// ============================================
// WORKFLOW DEFINITION
// ============================================

/**
 * Node types in the workflow graph
 */
export type WorkflowNodeType =
  | 'start' // Entry point
  | 'action' // Automated action
  | 'decision' // Conditional branching
  | 'human' // Human-in-the-loop approval
  | 'end'; // Terminal node

/**
 * Definition of a workflow node
 */
export interface WorkflowNode<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier for this node */
  id: string;
  /** Type of node */
  type: WorkflowNodeType;
  /** Human-readable name */
  name: string;
  /** Description of what this node does */
  description?: string;
  /** Handler function for action nodes */
  handler?: (state: WorkflowState<T>, payload?: unknown) => Promise<Partial<T>>;
  /** Condition function for decision nodes (returns next node id) */
  condition?: (state: WorkflowState<T>) => string;
  /** Default timeout in milliseconds for human nodes */
  timeout?: number;
}

/**
 * Definition of an edge between nodes
 */
export interface WorkflowEdge {
  /** Source node id */
  from: string;
  /** Target node id */
  to: string;
  /** Optional label for the edge (used in conditional edges) */
  label?: string;
}

/**
 * Complete workflow definition
 */
export interface WorkflowDefinition<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique name for this workflow type */
  name: string;
  /** Human-readable description */
  description: string;
  /** Version of this workflow definition */
  version: string;
  /** All nodes in the workflow */
  nodes: Map<string, WorkflowNode<T>>;
  /** All edges connecting nodes */
  edges: WorkflowEdge[];
  /** Initial state factory */
  initialState: () => T;
}

// ============================================
// WORKFLOW ENGINE INTERFACE
// ============================================

/**
 * Result of a workflow transition
 */
export interface TransitionResult<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Whether the transition was successful */
  success: boolean;
  /** Updated workflow state */
  state: WorkflowState<T>;
  /** Error message if transition failed */
  error?: string;
  /** Whether the workflow has completed */
  isComplete: boolean;
  /** Whether the workflow is waiting for human input */
  awaitingHumanInput: boolean;
}

/**
 * Human decision for approval nodes
 */
export interface HumanDecision {
  /** ID of the workflow */
  workflowId: string;
  /** ID of the user making the decision */
  userId: string;
  /** Decision type */
  decision: 'approve' | 'reject' | 'modify';
  /** Optional comment explaining the decision */
  comment?: string;
  /** Optional modifications to the state */
  modifications?: Record<string, unknown>;
}

/**
 * Query options for listing workflows
 */
export interface WorkflowQuery {
  /** Filter by workflow name */
  workflowName?: string;
  /** Filter by current node */
  currentNode?: string;
  /** Filter by paused status */
  isPaused?: boolean;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Workflow engine interface
 */
export interface IWorkflowEngine {
  /**
   * Register a workflow definition
   */
  registerWorkflow<T extends Record<string, unknown>>(
    definition: WorkflowDefinition<T>
  ): void;

  /**
   * Create a new workflow instance
   */
  createWorkflow<T extends Record<string, unknown>>(
    workflowName: string,
    initialData?: Partial<T>
  ): Promise<WorkflowState<T>>;

  /**
   * Transition a workflow to the next state
   */
  transition<T extends Record<string, unknown>>(
    workflowId: string,
    action: string,
    payload?: unknown
  ): Promise<TransitionResult<T>>;

  /**
   * Process a human decision
   */
  processHumanDecision<T extends Record<string, unknown>>(
    decision: HumanDecision
  ): Promise<TransitionResult<T>>;

  /**
   * Get current workflow state
   */
  getState<T extends Record<string, unknown>>(
    workflowId: string
  ): Promise<WorkflowState<T> | null>;

  /**
   * List workflows matching query
   */
  listWorkflows<T extends Record<string, unknown>>(
    query: WorkflowQuery
  ): Promise<WorkflowState<T>[]>;

  /**
   * Pause a workflow (for human-in-the-loop)
   */
  pauseWorkflow(workflowId: string): Promise<void>;

  /**
   * Resume a paused workflow
   */
  resumeWorkflow(workflowId: string): Promise<void>;

  /**
   * Cancel a workflow
   */
  cancelWorkflow(workflowId: string): Promise<void>;
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const humanDecisionSchema = z.object({
  workflowId: z.string().uuid(),
  userId: z.string(),
  decision: z.enum(['approve', 'reject', 'modify']),
  comment: z.string().optional(),
  modifications: z.record(z.unknown()).optional(),
});

export const workflowQuerySchema = z.object({
  workflowName: z.string().optional(),
  currentNode: z.string().optional(),
  isPaused: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});
