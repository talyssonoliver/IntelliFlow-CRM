/**
 * Workflow State Machine - IFC-028
 *
 * Core state machine implementation for the workflow engine.
 * Provides state persistence, conditional branching, and human-in-the-loop support.
 *
 * @implements IFC-028 (Workflow Engine with LangGraph)
 */

import { randomUUID } from 'crypto';
import type {
  WorkflowDefinition,
  WorkflowState,
  WorkflowNode,
  TransitionResult,
  HumanDecision,
  WorkflowQuery,
  StateTransition,
  IWorkflowEngine,
} from './types';

/**
 * In-memory workflow state machine implementation.
 *
 * In production, state should be persisted to PostgreSQL.
 * This implementation follows the LangGraph pattern of state persistence
 * with checkpointing for durability.
 */
export class WorkflowStateMachine implements IWorkflowEngine {
  /** Registered workflow definitions */
  private definitions: Map<string, WorkflowDefinition<Record<string, unknown>>> = new Map();

  /** In-memory state storage (replace with PostgreSQL in production) */
  private states: Map<string, WorkflowState<Record<string, unknown>>> = new Map();

  /**
   * Register a workflow definition
   */
  registerWorkflow<T extends Record<string, unknown>>(
    definition: WorkflowDefinition<T>
  ): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Workflow ${definition.name} is already registered`);
    }
    this.definitions.set(
      definition.name,
      definition as unknown as WorkflowDefinition<Record<string, unknown>>
    );
  }

  /**
   * Get list of registered workflow names
   */
  getRegisteredWorkflows(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * Create a new workflow instance
   */
  async createWorkflow<T extends Record<string, unknown>>(
    workflowName: string,
    initialData?: Partial<T>
  ): Promise<WorkflowState<T>> {
    const definition = this.definitions.get(workflowName);
    if (!definition) {
      throw new Error(`Workflow ${workflowName} is not registered`);
    }

    const workflowId = randomUUID();
    const now = new Date();

    const state: WorkflowState<T> = {
      workflowId,
      workflowName,
      checkpoint: 0,
      currentNode: 'start',
      isPaused: false,
      createdAt: now,
      updatedAt: now,
      data: {
        ...definition.initialState(),
        ...initialData,
      } as T,
      history: [],
    };

    this.states.set(workflowId, state as WorkflowState<Record<string, unknown>>);

    return state;
  }

  /**
   * Transition a workflow to the next state
   */
  async transition<T extends Record<string, unknown>>(
    workflowId: string,
    action: string,
    payload?: unknown
  ): Promise<TransitionResult<T>> {
    const state = this.states.get(workflowId) as WorkflowState<T> | undefined;

    if (!state) {
      return {
        success: false,
        state: null as unknown as WorkflowState<T>,
        error: `Workflow ${workflowId} not found`,
        isComplete: false,
        awaitingHumanInput: false,
      };
    }

    // Check if workflow is paused (unless it's a human review node being transitioned)
    if (state.isPaused) {
      return {
        success: false,
        state,
        error: 'Cannot transition: workflow is paused. Use processHumanDecision for human review nodes.',
        isComplete: false,
        awaitingHumanInput: true,
      };
    }

    const definition = this.definitions.get(state.workflowName);
    if (!definition) {
      return {
        success: false,
        state,
        error: `Workflow definition ${state.workflowName} not found`,
        isComplete: false,
        awaitingHumanInput: false,
      };
    }

    const currentNode = definition.nodes.get(state.currentNode);
    if (!currentNode) {
      return {
        success: false,
        state,
        error: `Node ${state.currentNode} not found in workflow definition`,
        isComplete: false,
        awaitingHumanInput: false,
      };
    }

    // Check if workflow is complete
    if (currentNode.type === 'end') {
      return {
        success: true,
        state,
        isComplete: true,
        awaitingHumanInput: false,
      };
    }

    try {
      // Execute action node handler if present
      let updatedData = state.data;
      if (currentNode.type === 'action' && currentNode.handler) {
        const handlerResult = await currentNode.handler(
          state as WorkflowState<Record<string, unknown>>,
          payload
        );
        updatedData = {
          ...state.data,
          ...handlerResult,
        } as T;
      }

      // Find next node
      const nextNodeId = this.findNextNode(
        definition,
        state.currentNode,
        { ...state, data: updatedData } as WorkflowState<Record<string, unknown>>
      );

      if (!nextNodeId) {
        return {
          success: false,
          state,
          error: `No outgoing edge from node ${state.currentNode}`,
          isComplete: false,
          awaitingHumanInput: false,
        };
      }

      const nextNode = definition.nodes.get(nextNodeId);
      if (!nextNode) {
        return {
          success: false,
          state,
          error: `Target node ${nextNodeId} not found`,
          isComplete: false,
          awaitingHumanInput: false,
        };
      }

      // Record transition
      const transition: StateTransition = {
        checkpoint: state.checkpoint,
        fromNode: state.currentNode,
        toNode: nextNodeId,
        action,
        timestamp: new Date(),
        payload,
      };

      // Update state
      const newState: WorkflowState<T> = {
        ...state,
        checkpoint: state.checkpoint + 1,
        currentNode: nextNodeId,
        isPaused: nextNode.type === 'human',
        updatedAt: new Date(),
        data: updatedData,
        history: [...state.history, transition],
      };

      this.states.set(workflowId, newState as WorkflowState<Record<string, unknown>>);

      return {
        success: true,
        state: newState,
        isComplete: nextNode.type === 'end',
        awaitingHumanInput: nextNode.type === 'human',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update state with error
      const errorState: WorkflowState<T> = {
        ...state,
        error: errorMessage,
        updatedAt: new Date(),
      };
      this.states.set(workflowId, errorState as WorkflowState<Record<string, unknown>>);

      return {
        success: false,
        state: errorState,
        error: errorMessage,
        isComplete: false,
        awaitingHumanInput: false,
      };
    }
  }

  /**
   * Find the next node based on current state and edges
   */
  private findNextNode(
    definition: WorkflowDefinition<Record<string, unknown>>,
    currentNodeId: string,
    state: WorkflowState<Record<string, unknown>>
  ): string | null {
    const currentNode = definition.nodes.get(currentNodeId);

    // For decision nodes, use the condition function
    if (currentNode?.type === 'decision' && currentNode.condition) {
      const nextNodeId = currentNode.condition(state);
      // Verify the edge exists
      const edge = definition.edges.find(
        (e) => e.from === currentNodeId && e.label === nextNodeId
      );
      if (edge) {
        return edge.to;
      }
      // Also check direct edge to the returned node
      const directEdge = definition.edges.find(
        (e) => e.from === currentNodeId && e.to === nextNodeId
      );
      if (directEdge) {
        return nextNodeId;
      }
    }

    // For other nodes, find the first outgoing edge
    const edge = definition.edges.find((e) => e.from === currentNodeId);
    return edge?.to ?? null;
  }

  /**
   * Process a human decision
   */
  async processHumanDecision<T extends Record<string, unknown>>(
    decision: HumanDecision
  ): Promise<TransitionResult<T>> {
    const state = this.states.get(decision.workflowId) as WorkflowState<T> | undefined;

    if (!state) {
      return {
        success: false,
        state: null as unknown as WorkflowState<T>,
        error: `Workflow ${decision.workflowId} not found`,
        isComplete: false,
        awaitingHumanInput: false,
      };
    }

    const definition = this.definitions.get(state.workflowName);
    if (!definition) {
      return {
        success: false,
        state,
        error: `Workflow definition ${state.workflowName} not found`,
        isComplete: false,
        awaitingHumanInput: false,
      };
    }

    const currentNode = definition.nodes.get(state.currentNode);
    if (!currentNode || currentNode.type !== 'human') {
      return {
        success: false,
        state,
        error: 'Workflow is not at a human review node',
        isComplete: false,
        awaitingHumanInput: false,
      };
    }

    // Apply decision
    let updatedData: T = {
      ...state.data,
      reviewerId: decision.userId,
    };

    // Handle different decision types
    if (decision.decision === 'reject') {
      updatedData = {
        ...updatedData,
        status: 'disqualified',
        notes: [
          ...((state.data as any).notes || []),
          `Rejected by ${decision.userId}: ${decision.comment || 'No comment'}`,
        ],
      } as T;
    } else if (decision.decision === 'approve') {
      updatedData = {
        ...updatedData,
        status: 'qualified',
        notes: [
          ...((state.data as any).notes || []),
          `Approved by ${decision.userId}: ${decision.comment || 'No comment'}`,
        ],
      } as T;
    } else if (decision.decision === 'modify' && decision.modifications) {
      updatedData = {
        ...updatedData,
        ...decision.modifications,
      } as T;
    }

    // Record transition
    const transition: StateTransition = {
      checkpoint: state.checkpoint,
      fromNode: state.currentNode,
      toNode: 'end',
      action: `human_${decision.decision}`,
      timestamp: new Date(),
      payload: decision,
    };

    // Find next node
    const nextNodeId = this.findNextNode(definition, state.currentNode, {
      ...state,
      data: updatedData as Record<string, unknown>,
    });

    const newState: WorkflowState<T> = {
      ...state,
      checkpoint: state.checkpoint + 1,
      currentNode: nextNodeId || 'end',
      isPaused: false,
      updatedAt: new Date(),
      data: updatedData,
      history: [...state.history, transition],
    };

    this.states.set(decision.workflowId, newState as WorkflowState<Record<string, unknown>>);

    return {
      success: true,
      state: newState,
      isComplete: nextNodeId === 'end',
      awaitingHumanInput: false,
    };
  }

  /**
   * Get current workflow state
   */
  async getState<T extends Record<string, unknown>>(
    workflowId: string
  ): Promise<WorkflowState<T> | null> {
    return (this.states.get(workflowId) as WorkflowState<T>) ?? null;
  }

  /**
   * List workflows matching query
   */
  async listWorkflows<T extends Record<string, unknown>>(
    query: WorkflowQuery
  ): Promise<WorkflowState<T>[]> {
    let results = Array.from(this.states.values()) as WorkflowState<T>[];

    // Filter by workflow name
    if (query.workflowName) {
      results = results.filter((s) => s.workflowName === query.workflowName);
    }

    // Filter by current node
    if (query.currentNode) {
      results = results.filter((s) => s.currentNode === query.currentNode);
    }

    // Filter by paused status
    if (query.isPaused !== undefined) {
      results = results.filter((s) => s.isPaused === query.isPaused);
    }

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Pause a workflow
   */
  async pauseWorkflow(workflowId: string): Promise<void> {
    const state = this.states.get(workflowId);
    if (!state) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.states.set(workflowId, {
      ...state,
      isPaused: true,
      updatedAt: new Date(),
    });
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(workflowId: string): Promise<void> {
    const state = this.states.get(workflowId);
    if (!state) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.states.set(workflowId, {
      ...state,
      isPaused: false,
      updatedAt: new Date(),
    });
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const state = this.states.get(workflowId);
    if (!state) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.states.set(workflowId, {
      ...state,
      error: 'Workflow cancelled',
      isPaused: true,
      updatedAt: new Date(),
    });
  }
}

// Export default instance
export const workflowEngine = new WorkflowStateMachine();
