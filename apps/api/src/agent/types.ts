/**
 * Agent Tool Types and Interfaces
 *
 * IFC-139: Expose application services as agent tools with human approval flows
 *
 * These types define the contract for agent tools, enabling AI assistants
 * to interact with CRM services while maintaining human oversight.
 */

import { z } from 'zod';
import { leadStatusSchema, leadSourceSchema } from '@intelliflow/validators';

/**
 * Tool action types for categorization and authorization
 */
export type AgentActionType = 'SEARCH' | 'CREATE' | 'UPDATE' | 'DELETE' | 'DRAFT';

/**
 * Action approval status
 */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/**
 * Entity types that agents can interact with
 */
export type EntityType =
  | 'LEAD'
  | 'CONTACT'
  | 'ACCOUNT'
  | 'OPPORTUNITY'
  | 'CASE'
  | 'APPOINTMENT'
  | 'TASK'
  | 'MESSAGE';

/**
 * Result of an agent tool execution
 */
export interface AgentToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requiresApproval: boolean;
  actionId?: string;
  executionTimeMs: number;
}

/**
 * Base interface for pending actions requiring human approval
 */
export interface PendingAction {
  id: string;
  toolName: string;
  actionType: AgentActionType;
  entityType: EntityType;
  input: Record<string, unknown>;
  preview: ActionPreview;
  status: ApprovalStatus;
  createdAt: Date;
  expiresAt: Date;
  createdBy: string;
  agentSessionId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Preview of what an action will do (for approval UI)
 */
export interface ActionPreview {
  summary: string;
  changes: ChangeItem[];
  affectedEntities: AffectedEntity[];
  warnings?: string[];
  estimatedImpact?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Individual change item for diff preview
 */
export interface ChangeItem {
  field: string;
  previousValue: unknown;
  newValue: unknown;
  changeType: 'ADD' | 'MODIFY' | 'DELETE';
}

/**
 * Entity affected by an action
 */
export interface AffectedEntity {
  type: EntityType;
  id: string;
  name: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';
}

/**
 * Approval decision from a human user
 */
export interface ApprovalDecision {
  actionId: string;
  decision: 'APPROVE' | 'REJECT';
  decidedBy: string;
  decidedAt: Date;
  reason?: string;
  modifiedInput?: Record<string, unknown>;
}

/**
 * Result of executing an approved action
 */
export interface ExecutedAction extends PendingAction {
  executedAt?: Date;
  executionResult?: unknown;
  executionError?: string;
  approval?: ApprovalDecision;
  rollbackAvailable: boolean;
  rollbackToken?: string;
}

/**
 * Rollback request for an executed action
 */
export interface RollbackRequest {
  actionId: string;
  rollbackToken: string;
  requestedBy: string;
  reason: string;
}

/**
 * Result of a rollback attempt
 */
export interface RollbackResult {
  success: boolean;
  actionId: string;
  rolledBackAt?: Date;
  error?: string;
  restoredState?: Record<string, unknown>;
}

/**
 * Agent action log entry for audit trail
 */
export interface AgentActionLog {
  id: string;
  timestamp: Date;
  userId: string;
  agentSessionId: string;
  toolName: string;
  actionType: AgentActionType;
  entityType: EntityType;
  input: Record<string, unknown>;
  output?: unknown;
  success: boolean;
  error?: string;
  durationMs: number;
  approvalRequired: boolean;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Authorization context for agent actions
 */
export interface AgentAuthContext {
  userId: string;
  userRole: string;
  permissions: string[];
  agentSessionId: string;
  allowedEntityTypes: EntityType[];
  allowedActionTypes: AgentActionType[];
  maxActionsPerSession: number;
  actionCount: number;
}

/**
 * Tool definition for registration
 */
export interface AgentToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  actionType: AgentActionType;
  entityTypes: EntityType[];
  requiresApproval: boolean;
  // Allow Zod schemas with defaults (input type may differ from output type)
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  execute: (
    input: TInput,
    context: AgentAuthContext
  ) => Promise<AgentToolResult<TOutput>>;
  generatePreview: (input: TInput, context: AgentAuthContext) => Promise<ActionPreview>;
  rollback?: (
    actionId: string,
    executionResult: TOutput,
    context: AgentAuthContext
  ) => Promise<RollbackResult>;
}

/**
 * Search criteria for leads
 */
export const LeadSearchInputSchema = z.object({
  query: z.string().optional(),
  status: z.array(leadStatusSchema).optional(),
  source: z.array(leadSourceSchema).optional(),
  minScore: z.number().min(0).max(100).optional(),
  maxScore: z.number().min(0).max(100).optional(),
  ownerId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type LeadSearchInput = z.infer<typeof LeadSearchInputSchema>;

/**
 * Search criteria for contacts
 */
export const ContactSearchInputSchema = z.object({
  query: z.string().optional(),
  accountId: z.string().optional(),
  ownerId: z.string().optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type ContactSearchInput = z.infer<typeof ContactSearchInputSchema>;

/**
 * Search criteria for opportunities/deals
 */
export const OpportunitySearchInputSchema = z.object({
  query: z.string().optional(),
  stage: z.array(z.enum(['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'])).optional(),
  minValue: z.number().min(0).optional(),
  maxValue: z.number().optional(),
  accountId: z.string().optional(),
  ownerId: z.string().optional(),
  closeDateFrom: z.coerce.date().optional(),
  closeDateTo: z.coerce.date().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type OpportunitySearchInput = z.infer<typeof OpportunitySearchInputSchema>;

/**
 * Input for creating a case
 */
export const CreateCaseInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  deadline: z.coerce.date().optional(),
  clientId: z.string(),
  assignedTo: z.string().optional(),
});

export type CreateCaseInput = z.infer<typeof CreateCaseInputSchema>;

/**
 * Input for creating an appointment
 */
export const CreateAppointmentInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  appointmentType: z.enum(['MEETING', 'CALL', 'HEARING', 'CONSULTATION', 'DEPOSITION', 'OTHER']),
  location: z.string().max(500).optional(),
  attendeeIds: z.array(z.string()).default([]),
  linkedCaseIds: z.array(z.string()).default([]),
  reminderMinutes: z.number().min(0).optional(),
});

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentInputSchema>;

/**
 * Input for updating a case
 */
export const UpdateCaseInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  deadline: z.coerce.date().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED']).optional(),
  assignedTo: z.string().optional(),
});

export type UpdateCaseInput = z.infer<typeof UpdateCaseInputSchema>;

/**
 * Input for updating an appointment
 */
export const UpdateAppointmentInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  location: z.string().max(500).optional(),
  appointmentType: z.enum(['MEETING', 'CALL', 'HEARING', 'CONSULTATION', 'DEPOSITION', 'OTHER']).optional(),
  notes: z.string().max(5000).optional(),
});

export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentInputSchema>;

/**
 * Input for drafting a message
 */
export const DraftMessageInputSchema = z.object({
  type: z.enum(['EMAIL', 'SMS', 'NOTE']),
  recipientType: z.enum(['LEAD', 'CONTACT', 'ACCOUNT']),
  recipientId: z.string(),
  subject: z.string().max(255).optional(),
  body: z.string().min(1).max(10000),
  templateId: z.string().optional(),
  scheduledFor: z.coerce.date().optional(),
});

export type DraftMessageInput = z.infer<typeof DraftMessageInputSchema>;
