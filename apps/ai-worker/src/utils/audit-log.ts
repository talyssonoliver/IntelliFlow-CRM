/**
 * AI Agent Audit Log Helper (H4 — 2026-04-17 audit remediation)
 *
 * Lightweight wrapper that emits structured audit log entries for
 * AI_AGENT actor writes. Covers the gap identified in the 2026-04-17
 * agent-system audit: zero AuditLogEntry(actorType=AI_AGENT) writes
 * existed in apps/ai-worker/src/**.
 *
 * @module utils/audit-log
 *
 * WIRING:
 * `AuditLogPort` from `@intelliflow/application` is injected at worker
 * startup via `setAuditLogAdapter()`, called from `AIWorker.onStart()`.
 * If the adapter is not yet wired (e.g. during tests that don't bootstrap
 * the full worker), the function falls back to pino-only logging.
 *
 * Current behaviour:
 *   - The structured audit record is ALWAYS logged at INFO level via pino
 *     so it appears in log aggregators (Loki / CloudWatch) and can be
 *     queried as an AI_AGENT audit trail.
 *   - When the adapter IS wired, a DB write is also performed via
 *     `auditLogPort.logSecurityEvent(...)`.
 *   - If the DB write fails, a WARN is logged and the function continues.
 *   - The function NEVER throws — audit failures must not block jobs.
 */

import pino from 'pino';
import type { AuditLogPort } from '@intelliflow/application';

const logger = pino({
  name: 'ai-agent-audit',
  level: process.env.LOG_LEVEL || 'info',
});

// ---------------------------------------------------------------------------
// Module-level adapter (injected at worker startup)
// ---------------------------------------------------------------------------

/** Module-level AuditLogPort instance; null until wired by setAuditLogAdapter(). */
let _auditLogAdapter: AuditLogPort | null = null;

/**
 * Wire the AuditLogPort adapter so that `logAIAgentAction` can persist
 * entries to the database in addition to the pino log.
 *
 * Call this once from AIWorker.onStart() after Prisma is available.
 *
 * @param adapter - An AuditLogPort implementation (e.g. DurableAuditLogAdapter)
 */
export function setAuditLogAdapter(adapter: AuditLogPort): void {
  _auditLogAdapter = adapter;
}

/**
 * Return the currently wired adapter (or null if not yet set).
 * Exposed for testing purposes only.
 */
export function getAuditLogAdapter(): AuditLogPort | null {
  return _auditLogAdapter;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Parameters for a single AI agent audit entry.
 */
export interface AIAgentAuditParams {
  /** Tenant identifier — required for multi-tenant audit isolation. */
  tenantId: string;
  /** Name of the AI agent or job writing the record (actorId). */
  agentName: string;
  /** Domain resource type being written (e.g. 'LeadAIInsight', 'AIInsight'). */
  resourceType: string;
  /** Primary key / identifier of the resource being written. */
  resourceId: string;
  /** Write action performed. */
  action: 'CREATE' | 'UPSERT' | 'UPDATE' | 'DELETE';
  /** Optional snapshot of the record state before the write. */
  beforeState?: Record<string, unknown>;
  /** Optional snapshot of the record state after the write. */
  afterState?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Emit a structured audit log entry for an AI_AGENT write operation.
 *
 * Always writes to pino (INFO) for log-aggregator visibility.
 * Also writes to the DB via AuditLogPort when the adapter has been wired.
 *
 * @param params - Audit entry parameters
 */
export async function logAIAgentAction(params: AIAgentAuditParams): Promise<void> {
  const { tenantId, agentName, resourceType, resourceId, action, beforeState, afterState } = params;

  const timestamp = new Date().toISOString();

  // -------------------------------------------------------------------------
  // 1. Pino log — always written (primary log-aggregator trail).
  // -------------------------------------------------------------------------
  logger.info(
    {
      audit: true,
      actorType: 'AI_AGENT',
      actorId: agentName,
      tenantId,
      resourceType,
      resourceId,
      action,
      ...(beforeState !== undefined ? { beforeState } : {}),
      ...(afterState !== undefined ? { afterState } : {}),
      timestamp,
    },
    'AI_AGENT audit entry'
  );

  // -------------------------------------------------------------------------
  // 2. DB write via AuditLogPort — written when adapter is wired.
  //    Failures are caught and logged; they never propagate to the caller.
  // -------------------------------------------------------------------------
  if (_auditLogAdapter !== null) {
    try {
      await _auditLogAdapter.logSecurityEvent(
        {
          eventType: 'AI_GUARDRAIL_TRIGGERED',
          severity: 'LOW',
          tenantId,
          resourceType,
          resourceId,
          description: `AI_AGENT ${agentName} performed ${action} on ${resourceType}/${resourceId}`,
          metadata: {
            modelId: agentName,
            modelVersion: '1',
            guardrailId: 'ai-agent-write',
            guardrailVersion: '1',
            processingPurpose: 'crm-insight-generation',
            legalBasis: 'legitimate-interest',
            details: {
              action,
              ...(beforeState !== undefined ? { beforeState } : {}),
              ...(afterState !== undefined ? { afterState } : {}),
            },
          },
        },
        { tenantId }
      );
    } catch (err) {
      logger.warn(
        { err, actorId: agentName, tenantId, resourceType, resourceId, action },
        'AuditLogPort DB write failed — pino trail still intact; investigate adapter'
      );
    }
  }
}
