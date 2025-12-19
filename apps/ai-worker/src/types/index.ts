/**
 * Common types for AI Worker
 */

/**
 * LLM Provider types
 */
export type LLMProvider = 'openai' | 'ollama';

/**
 * Agent role types
 */
export type AgentRole =
  | 'lead_scorer'
  | 'lead_qualifier'
  | 'email_generator'
  | 'follow_up_scheduler'
  | 'data_enricher';

/**
 * Task priority levels
 */
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/**
 * Task status
 */
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Human-in-the-loop decision
 */
export interface HumanDecision {
  approved: boolean;
  feedback?: string;
  modifiedOutput?: unknown;
  decidedBy: string;
  decidedAt: Date;
}

/**
 * Confidence levels
 */
export enum ConfidenceLevel {
  VERY_LOW = 0.0,
  LOW = 0.3,
  MEDIUM = 0.5,
  HIGH = 0.7,
  VERY_HIGH = 0.9,
}

/**
 * Agent execution metrics
 */
export interface AgentMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageConfidence: number;
  averageDuration: number;
  totalCost: number;
  lastExecutedAt?: Date;
}
