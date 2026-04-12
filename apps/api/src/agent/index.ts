/**
 * Agent Module
 *
 * IFC-139: Expose application services as agent tools with human approval flows
 *
 * This module provides AI agents with controlled access to CRM operations:
 *
 * Tools:
 * - Search (leads, contacts, opportunities) - No approval required
 * - Create (cases, appointments) - Approval required
 * - Update (cases, appointments) - Approval required
 * - Draft (messages) - Approval required
 *
 * Features:
 * - Human approval workflow with diff preview
 * - Rollback mechanism for approved actions
 * - Authorization checks (100% of tool actions)
 * - Comprehensive logging
 *
 * KPIs (from IFC-139):
 * - 100% tool actions authorized
 * - Zero unauthorized writes
 * - User approval latency <30s
 */

// Types
export * from './types';

// Tools
export * from './tools';

// Authorization
export {
  agentAuthorizationService,
  authorizeAgentAction,
  buildAuthContext,
  resetSessionActionCount,
} from './authorization';
export type { AuthorizationResult, UserInfo } from './authorization';

// Approval Workflow
export {
  approvalWorkflowService,
  pendingActionsStore,
  executedActionsStore,
  rollbackStore,
  ApprovalWorkflowService,
} from './approval-workflow';

// Logging
export { agentLogger, AgentActionLogger, createLogEntry } from './logger';
export type { LogEntry, LogLevel } from './logger';
