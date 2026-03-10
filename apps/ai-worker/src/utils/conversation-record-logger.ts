/**
 * Conversation Record Logger (Fix #20)
 *
 * Provides structured audit logging for LLM conversation records.
 * Logs conversation metadata fields from ConversationRecordData while
 * full DB persistence is pending (IFC-148 repository wiring).
 *
 * @module utils/conversation-record-logger
 */

import type { Logger } from 'pino';

/**
 * Fields logged per LLM conversation record.
 * Aligned with ConversationRecordData from @intelliflow/domain.
 */
export interface ConversationRecordLogData {
  /** Unique conversation/request identifier */
  conversationId: string;
  /** AI model identifier (e.g. "openai:gpt-4o-mini") */
  model: string;
  /** Input token count (from LLM response metadata, 0 if unavailable) */
  tokenCountInput: number;
  /** Output token count (from LLM response metadata, 0 if unavailable) */
  tokenCountOutput: number;
  /** Wall-clock duration of the LLM call in milliseconds */
  duration: number;
  /** Which chain/job produced this record (e.g. "CHURN_PREDICTION") */
  chainType: string;
  /** Tenant context for multi-tenant audit trail */
  tenantId?: string;
}

/**
 * Log a structured conversation record for audit purposes.
 *
 * Usage:
 *   logConversationRecord(logger, {
 *     conversationId: job.id ?? crypto.randomUUID(),
 *     model: 'openai:gpt-4o-mini',
 *     tokenCountInput: usage?.promptTokens ?? 0,
 *     tokenCountOutput: usage?.completionTokens ?? 0,
 *     duration: Date.now() - startTime,
 *     chainType: 'CHURN_PREDICTION',
 *     tenantId,
 *   });
 *
 * @param logger - pino logger from the calling job/chain
 * @param data - conversation record fields to log
 */
export function logConversationRecord(logger: Logger, data: ConversationRecordLogData): void {
  logger.info(
    {
      conversationRecord: {
        conversationId: data.conversationId,
        model: data.model,
        tokenCountInput: data.tokenCountInput,
        tokenCountOutput: data.tokenCountOutput,
        duration: data.duration,
        chainType: data.chainType,
        ...(data.tenantId !== undefined ? { tenantId: data.tenantId } : {}),
      },
    },
    'AI conversation record'
  );
}
