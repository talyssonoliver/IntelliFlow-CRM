/**
 * Workflow Engine Module - IFC-028
 *
 * Exports the workflow engine components for use throughout the application.
 *
 * @implements IFC-028 (Workflow Engine with LangGraph)
 */

// Types
export type {
  WorkflowStateBase,
  WorkflowState,
  StateTransition,
  WorkflowNodeType,
  WorkflowNode,
  WorkflowEdge,
  WorkflowDefinition,
  TransitionResult,
  HumanDecision,
  WorkflowQuery,
  IWorkflowEngine,
} from './types';

export { humanDecisionSchema, workflowQuerySchema } from './types';

// State Machine
export { WorkflowStateMachine, workflowEngine } from './state-machine';

// DSAR Workflow
export { DSARWorkflow, dsarRequestSchema, type DSARRequest, type DSARWorkflowState } from './dsar-workflow';
