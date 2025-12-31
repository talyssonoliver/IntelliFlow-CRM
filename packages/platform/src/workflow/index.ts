/**
 * Workflow Engine Module
 *
 * Provides workflow orchestration capabilities for IntelliFlow CRM:
 * - Temporal integration for durable workflows
 * - Rules engine for real-time rule evaluation
 * - Event routing and handling
 *
 * @module @intelliflow/platform/workflow
 */

// Workflow Engine
export {
  // Types
  type WorkflowEngineType,
  type WorkflowStatus,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowExecutionOptions,
  type WorkflowSignal,
  type WorkflowQuery,
  type IWorkflowEngine,
  type WorkflowHandle,
  type TemporalEngineConfig,
  // Schemas
  workflowDefinitionSchema,
  workflowInstanceSchema,
  // Classes
  TemporalWorkflowEngine,
  WorkflowEngineFactory,
  WorkflowRouter,
  // Helpers
  DEFAULT_TEMPORAL_CONFIG,
  createDefaultWorkflowRouter,
  getCaseEventWorkflowEngine,
  isRulesEngineEvent,
} from './engine';

// Rules Engine
export {
  // Types
  type ComparisonOperator,
  type LogicalOperator,
  type Condition,
  type ConditionGroup,
  type ActionType,
  type Action,
  type RuleDefinition,
  type RuleExecutionResult,
  type RuleContext,
  type RulesEngineConfig,
  type RulesEngineMetrics,
  type ActionHandler,
  // Schemas
  conditionSchema,
  actionSchema,
  ruleDefinitionSchema,
  // Classes
  RulesEngine,
  // Rule Templates
  createCaseEscalationRule,
  createLeadScoringRule,
  createTaskAssignmentRule,
  // Singleton
  getRulesEngine,
  resetRulesEngine,
} from './rules-engine';
