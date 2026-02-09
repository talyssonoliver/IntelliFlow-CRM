/**
 * Conversation Record Domain Constants - Single Source of Truth
 *
 * Canonical enum values for conversation records (chat transcripts,
 * tool calls, actions per case). All validator schemas derive from these.
 *
 * Task: IFC-148 - Conversation Record Entity
 */

// =============================================================================
// Conversation Statuses
// =============================================================================

export const CONVERSATION_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'ARCHIVED',
  'DELETED',
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

// =============================================================================
// Conversation Channels
// =============================================================================

export const CONVERSATION_CHANNELS = [
  'WEB_CHAT',
  'MOBILE_APP',
  'API',
  'SLACK',
  'TEAMS',
  'EMAIL',
  'VOICE',
] as const;

export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

// =============================================================================
// Message Roles
// =============================================================================

export const MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

// =============================================================================
// Tool Types
// =============================================================================

export const TOOL_TYPES = [
  'SEARCH',
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE',
  'EXECUTE',
  'INTEGRATION',
] as const;

export type ToolType = (typeof TOOL_TYPES)[number];

// =============================================================================
// Tool Call Statuses
// =============================================================================

export const TOOL_CALL_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
] as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

// =============================================================================
// Conversation Repository Interface
// =============================================================================

export interface ConversationRecordRepository {
  findById(id: string): Promise<ConversationRecordData | null>;
  findBySessionId(sessionId: string): Promise<ConversationRecordData | null>;
  findByTenant(tenantId: string, options?: { limit?: number; offset?: number }): Promise<ConversationRecordData[]>;
  save(conversation: ConversationRecordData): Promise<void>;
  updateStatus(id: string, status: ConversationStatus): Promise<void>;
}

// =============================================================================
// Data Interfaces
// =============================================================================

export interface ConversationRecordData {
  id: string;
  sessionId: string;
  tenantId: string;
  title?: string;
  summary?: string;
  status: ConversationStatus;
  channel: ConversationChannel;
  caseId?: string;
  contactId?: string;
  agentId?: string;
  userId?: string;
  totalMessages: number;
  totalTokens: number;
  startedAt: Date;
  endedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecordData {
  id: string;
  conversationId: string;
  tenantId: string;
  role: MessageRole;
  content: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface ToolCallRecordData {
  id: string;
  conversationId: string;
  messageId?: string;
  tenantId: string;
  toolName: string;
  toolType: ToolType;
  status: ToolCallStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
}
