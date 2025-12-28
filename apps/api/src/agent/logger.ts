/**
 * Agent Action Logger
 *
 * IFC-139: Logging for all agent actions
 *
 * This module provides comprehensive logging for agent actions:
 * - All tool executions (search, create, update, delete, draft)
 * - Authorization checks
 * - Approval decisions
 * - Rollback operations
 *
 * Logs are written to:
 * 1. Console (structured JSON for observability)
 * 2. File (artifacts/misc/logs/agent-actions.log)
 * 3. Database (in production, via event bus)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  AgentActionLog,
  AgentActionType,
  EntityType,
  ApprovalStatus,
} from './types';

/**
 * Log levels for filtering
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Log entry for agent actions
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
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
 * Configuration for the agent logger
 */
interface LoggerConfig {
  logToConsole: boolean;
  logToFile: boolean;
  logFilePath: string;
  minLevel: LogLevel;
  redactSensitiveFields: boolean;
  sensitiveFields: string[];
}

const DEFAULT_CONFIG: LoggerConfig = {
  logToConsole: true,
  logToFile: true,
  logFilePath: path.join(process.cwd(), 'artifacts', 'misc', 'logs', 'agent-actions.log'),
  minLevel: 'INFO',
  redactSensitiveFields: true,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'authorization'],
};

/**
 * Level hierarchy for filtering
 */
const LEVEL_HIERARCHY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Agent Action Logger
 *
 * Provides structured logging for all agent operations with support for:
 * - Multiple output targets (console, file, database)
 * - Sensitive data redaction
 * - Correlation IDs for tracing
 * - Performance metrics
 */
export class AgentActionLogger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushInterval();
  }

  /**
   * Log an agent action
   */
  async log(entry: Omit<LogEntry, 'timestamp' | 'level'>): Promise<void> {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      level: entry.success ? 'INFO' : 'ERROR',
    };

    // Apply sensitive data redaction
    if (this.config.redactSensitiveFields) {
      logEntry.input = this.redactSensitiveData(logEntry.input);
      if (logEntry.output && typeof logEntry.output === 'object') {
        logEntry.output = this.redactSensitiveData(logEntry.output as Record<string, unknown>);
      }
    }

    // Add to buffer
    this.buffer.push(logEntry);

    // Console output
    if (this.config.logToConsole && this.shouldLog(logEntry.level)) {
      this.logToConsole(logEntry);
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  /**
   * Log a debug message
   */
  async debug(
    userId: string,
    agentSessionId: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.shouldLog('DEBUG')) return;

    await this.log({
      userId,
      agentSessionId,
      toolName: 'system',
      actionType: 'SEARCH',
      entityType: 'LEAD',
      input: { message },
      success: true,
      durationMs: 0,
      approvalRequired: false,
      metadata,
    });
  }

  /**
   * Log an authorization event
   */
  async logAuthorization(
    userId: string,
    agentSessionId: string,
    toolName: string,
    authorized: boolean,
    reason?: string
  ): Promise<void> {
    await this.log({
      userId,
      agentSessionId,
      toolName,
      actionType: 'SEARCH',
      entityType: 'LEAD',
      input: { authorizationCheck: true },
      success: authorized,
      error: authorized ? undefined : reason,
      durationMs: 0,
      approvalRequired: false,
      metadata: { eventType: 'authorization' },
    });
  }

  /**
   * Log an approval decision
   */
  async logApprovalDecision(
    userId: string,
    agentSessionId: string,
    actionId: string,
    decision: 'APPROVE' | 'REJECT',
    decidedBy: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      userId,
      agentSessionId,
      toolName: 'approval-workflow',
      actionType: 'UPDATE',
      entityType: 'LEAD',
      input: { actionId, decision, decidedBy },
      success: true,
      durationMs: 0,
      approvalRequired: true,
      approvalStatus: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      approvedBy: decidedBy,
      metadata: { eventType: 'approval', reason },
    });
  }

  /**
   * Log a rollback event
   */
  async logRollback(
    userId: string,
    agentSessionId: string,
    actionId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await this.log({
      userId,
      agentSessionId,
      toolName: 'rollback',
      actionType: 'DELETE',
      entityType: 'LEAD',
      input: { actionId, rollback: true },
      success,
      error,
      durationMs: 0,
      approvalRequired: false,
      metadata: { eventType: 'rollback' },
    });
  }

  /**
   * Flush buffered logs to file
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    if (this.config.logToFile) {
      await this.writeToFile(entries);
    }
  }

  /**
   * Get recent log entries (for UI/debugging)
   */
  async getRecentLogs(
    options: {
      userId?: string;
      sessionId?: string;
      toolName?: string;
      limit?: number;
      since?: Date;
    } = {}
  ): Promise<LogEntry[]> {
    const { userId, sessionId, toolName, limit = 100 } = options;

    let logs = [...this.buffer];

    // Filter by criteria
    if (userId) {
      logs = logs.filter((l) => l.userId === userId);
    }
    if (sessionId) {
      logs = logs.filter((l) => l.agentSessionId === sessionId);
    }
    if (toolName) {
      logs = logs.filter((l) => l.toolName === toolName);
    }
    if (options.since) {
      const sinceTime = options.since.getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= sinceTime);
    }

    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Limit results
    return logs.slice(0, limit);
  }

  /**
   * Get statistics from logs
   */
  async getStatistics(
    sessionId?: string
  ): Promise<{
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    actionsRequiringApproval: number;
    approvedActions: number;
    rejectedActions: number;
    rollbacks: number;
    avgDurationMs: number;
    byToolName: Record<string, number>;
    byActionType: Record<string, number>;
  }> {
    let logs = [...this.buffer];

    if (sessionId) {
      logs = logs.filter((l) => l.agentSessionId === sessionId);
    }

    const stats = {
      totalActions: logs.length,
      successfulActions: logs.filter((l) => l.success).length,
      failedActions: logs.filter((l) => !l.success).length,
      actionsRequiringApproval: logs.filter((l) => l.approvalRequired).length,
      approvedActions: logs.filter((l) => l.approvalStatus === 'APPROVED').length,
      rejectedActions: logs.filter((l) => l.approvalStatus === 'REJECTED').length,
      rollbacks: logs.filter((l) => l.metadata?.eventType === 'rollback').length,
      avgDurationMs:
        logs.length > 0
          ? logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length
          : 0,
      byToolName: {} as Record<string, number>,
      byActionType: {} as Record<string, number>,
    };

    // Count by tool name
    for (const log of logs) {
      stats.byToolName[log.toolName] = (stats.byToolName[log.toolName] || 0) + 1;
      stats.byActionType[log.actionType] = (stats.byActionType[log.actionType] || 0) + 1;
    }

    return stats;
  }

  /**
   * Stop the logger (cleanup)
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  // Private methods

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_HIERARCHY[level] >= LEVEL_HIERARCHY[this.config.minLevel];
  }

  private logToConsole(entry: LogEntry): void {
    const prefix = entry.success ? '[AGENT]' : '[AGENT-ERROR]';
    const approvalInfo = entry.approvalRequired
      ? ` approval=${entry.approvalStatus || 'PENDING'}`
      : '';

    console.log(
      `${prefix} ${entry.timestamp} ${entry.toolName} ${entry.actionType} ` +
        `duration=${entry.durationMs}ms success=${entry.success}${approvalInfo}`
    );

    if (entry.error) {
      console.error(`[AGENT-ERROR] ${entry.error}`);
    }
  }

  private async writeToFile(entries: LogEntry[]): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.logFilePath);
      await fs.mkdir(dir, { recursive: true });

      // Append entries as JSON lines
      const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(this.config.logFilePath, lines);
    } catch (error) {
      console.error('[AGENT-LOGGER] Failed to write to log file:', error);
    }
  }

  private redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.config.sensitiveFields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        redacted[key] = this.redactSensitiveData(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        console.error('[AGENT-LOGGER] Flush error:', err);
      });
    }, this.FLUSH_INTERVAL_MS);
  }
}

// Export singleton instance
export const agentLogger = new AgentActionLogger();

/**
 * Create log entry from AgentActionLog type
 * Utility for converting between types
 */
export function createLogEntry(log: AgentActionLog): LogEntry {
  return {
    timestamp: log.timestamp.toISOString(),
    level: log.success ? 'INFO' : 'ERROR',
    userId: log.userId,
    agentSessionId: log.agentSessionId,
    toolName: log.toolName,
    actionType: log.actionType,
    entityType: log.entityType,
    input: log.input,
    output: log.output,
    success: log.success,
    error: log.error,
    durationMs: log.durationMs,
    approvalRequired: log.approvalRequired,
    approvalStatus: log.approvalStatus,
    approvedBy: log.approvedBy,
    metadata: log.metadata,
  };
}
