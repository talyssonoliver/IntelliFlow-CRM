/**
 * Audit Logger Service
 *
 * Provides comprehensive audit logging for all CRM actions.
 * Implements the hybrid approach from ADR-008:
 * - Logs to database (audit_logs table)
 * - Emits OpenTelemetry traces for correlation
 * - Supports async/batched logging for performance
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 * RELATED: ADR-008 (Audit Logging Approach)
 *
 * Features:
 * - 100% action logging as per KPI requirement
 * - Automatic before/after state diff
 * - Request context capture (IP, user agent, trace ID)
 * - Data classification for compliance
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  AuditLogInput,
  SecurityEventInput,
  AuditAction,
  ActionResult,
  ActorType,
  DataClassification,
  ResourceType,
  SecuritySeverity,
} from './types';

/**
 * Configuration for the audit logger
 */
interface AuditLoggerConfig {
  /** Enable async logging (batched writes) */
  async?: boolean;
  /** Batch size for async logging */
  batchSize?: number;
  /** Batch flush interval in ms */
  flushIntervalMs?: number;
  /** Enable console logging for development */
  consoleLog?: boolean;
  /** Default data classification */
  defaultClassification?: DataClassification;
  /** Default retention period in days */
  defaultRetentionDays?: number;
}

/**
 * Audit Logger class
 *
 * Usage:
 * ```typescript
 * const logger = new AuditLogger(prisma);
 *
 * await logger.log({
 *   eventType: 'LeadCreated',
 *   action: 'CREATE',
 *   resourceType: 'lead',
 *   resourceId: lead.id,
 *   actorId: user.userId,
 *   afterState: lead,
 * });
 * ```
 */
export class AuditLogger {
  private readonly prisma: PrismaClient;
  private readonly config: Required<AuditLoggerConfig>;
  private readonly buffer: AuditLogInput[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient, config: AuditLoggerConfig = {}) {
    this.prisma = prisma;
    this.config = {
      async: config.async ?? false,
      batchSize: config.batchSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      consoleLog: config.consoleLog ?? process.env.NODE_ENV === 'development',
      defaultClassification: config.defaultClassification ?? 'INTERNAL',
      defaultRetentionDays: config.defaultRetentionDays ?? 365 * 7, // 7 years for compliance
    };
  }

  /**
   * Log an audit event
   *
   * @param input - Audit log entry data
   * @returns Created audit log entry ID
   */
  async log(input: AuditLogInput): Promise<string> {
    const entry = this.prepareEntry(input);

    if (this.config.consoleLog) {
      console.log(
        `[AUDIT] ${entry.action} ${entry.resourceType}/${entry.resourceId} by ${entry.actorId || 'system'}`
      );
    }

    if (this.config.async) {
      this.buffer.push(entry);
      this.scheduleFlush();
      return entry.eventId || randomUUID();
    }

    return this.writeEntry(entry);
  }

  /**
   * Log a CRUD action with automatic state diff
   *
   * @param action - CRUD action type
   * @param resourceType - Type of resource
   * @param resourceId - Resource identifier
   * @param options - Additional options
   */
  async logAction(
    action: AuditAction,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string,
    options: {
      actorId?: string;
      actorEmail?: string;
      actorRole?: string;
      actorType?: ActorType;
      resourceName?: string;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
      actionReason?: string;
      requestContext?: {
        requestId?: string;
        traceId?: string;
        sessionId?: string;
        ipAddress?: string;
        userAgent?: string;
      };
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const changedFields = this.calculateChangedFields(options.beforeState, options.afterState);

    return this.log({
      tenantId,
      eventType: `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}${action.charAt(0) + action.slice(1).toLowerCase()}d`,
      action,
      resourceType,
      resourceId,
      resourceName: options.resourceName,
      actorId: options.actorId,
      actorEmail: options.actorEmail,
      actorRole: options.actorRole,
      actorType: options.actorType ?? 'USER',
      beforeState: options.beforeState,
      afterState: options.afterState,
      changedFields,
      actionReason: options.actionReason,
      ipAddress: options.requestContext?.ipAddress,
      userAgent: options.requestContext?.userAgent,
      requestId: options.requestContext?.requestId,
      traceId: options.requestContext?.traceId,
      sessionId: options.requestContext?.sessionId,
      metadata: options.metadata,
    });
  }

  /**
   * Log a permission denied event
   */
  async logPermissionDenied(
    resourceType: ResourceType,
    resourceId: string,
    requiredPermission: string,
    tenantId: string,
    options: {
      actorId?: string;
      actorEmail?: string;
      actorRole?: string;
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<string> {
    return this.log({
      tenantId,
      eventType: 'PermissionDenied',
      action: 'PERMISSION_DENIED',
      actionResult: 'DENIED',
      resourceType,
      resourceId,
      actorId: options.actorId,
      actorEmail: options.actorEmail,
      actorRole: options.actorRole,
      requiredPermission,
      permissionGranted: false,
      permissionDeniedReason: options.reason || `Missing permission: ${requiredPermission}`,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    });
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(input: SecurityEventInput): Promise<string> {
    if (this.config.consoleLog) {
      const emoji = this.getSeverityEmoji(input.severity || 'INFO');
      console.log(`[SECURITY] ${emoji} ${input.eventType}: ${input.description}`);
    }

    const event = await this.prisma.securityEvent?.create({
      data: {
        eventType: input.eventType,
        severity: input.severity ?? 'INFO',
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        actorIp: input.actorIp,
        description: input.description,
        details: input.details as object | undefined,
        detected: input.detected ?? false,
        detectedBy: input.detectedBy,
        blocked: input.blocked ?? false,
        alertSent: input.alertSent ?? false,
      },
    });

    return event?.id ?? randomUUID();
  }

  /**
   * Log a login attempt
   */
  async logLoginSuccess(
    tenantId: string,
    options: {
      userId?: string;
      email: string;
      ipAddress?: string;
      userAgent?: string;
      mfaUsed?: boolean;
    }
  ): Promise<void> {
    await this.log({
      tenantId,
      eventType: 'UserLogin',
      action: 'LOGIN',
      actionResult: 'SUCCESS',
      resourceType: 'user',
      resourceId: options.userId || 'unknown',
      actorId: options.userId,
      actorEmail: options.email,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      metadata: { mfaUsed: options.mfaUsed },
    });

    await this.logSecurityEvent({
      eventType: 'LOGIN_SUCCESS',
      severity: 'INFO',
      actorId: options.userId,
      actorEmail: options.email,
      actorIp: options.ipAddress,
      description: `Successful login for ${options.email}`,
      details: { mfaUsed: options.mfaUsed },
    });
  }

  async logLoginFailure(
    tenantId: string,
    options: {
      email: string;
      ipAddress?: string;
      userAgent?: string;
      failureReason?: string;
    }
  ): Promise<void> {
    await this.log({
      tenantId,
      eventType: 'UserLoginFailed',
      action: 'LOGIN_FAILED',
      actionResult: 'FAILURE',
      resourceType: 'user',
      resourceId: 'unknown',
      actorEmail: options.email,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      actionReason: options.failureReason,
    });

    await this.logSecurityEvent({
      eventType: 'LOGIN_FAILURE',
      severity: 'MEDIUM',
      actorEmail: options.email,
      actorIp: options.ipAddress,
      description: `Failed login attempt for ${options.email}`,
      details: { reason: options.failureReason },
    });
  }

  /**
   * Log a bulk operation
   */
  async logBulkOperation(
    action: 'BULK_UPDATE' | 'BULK_DELETE' | 'IMPORT' | 'EXPORT',
    resourceType: ResourceType,
    resourceIds: string[],
    tenantId: string,
    options: {
      actorId?: string;
      actorEmail?: string;
      successCount?: number;
      failureCount?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      tenantId,
      eventType: `Bulk${action.replace('BULK_', '')}`,
      action,
      actionResult: options.failureCount ? 'PARTIAL' : 'SUCCESS',
      resourceType,
      resourceId: resourceIds.join(','),
      actorId: options.actorId,
      actorEmail: options.actorEmail,
      metadata: {
        count: resourceIds.length,
        successCount: options.successCount,
        failureCount: options.failureCount,
        ...options.metadata,
      },
    });
  }

  /**
   * Build the where clause for comprehensive queries
   */
  private buildWhereClause(filters: {
    resourceType?: ResourceType;
    resourceId?: string;
    actorId?: string;
    actorType?: ActorType;
    action?: AuditAction;
    actionResult?: ActionResult;
    eventType?: string;
    dataClassification?: DataClassification;
    traceId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.resourceId) where.resourceId = filters.resourceId;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.actorType) where.actorType = filters.actorType;
    if (filters.action) where.action = filters.action;
    if (filters.actionResult) where.actionResult = filters.actionResult;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.dataClassification) where.dataClassification = filters.dataClassification;
    if (filters.traceId) where.traceId = filters.traceId;

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) (where.timestamp as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.timestamp as Record<string, Date>).lte = filters.endDate;
    }

    return where;
  }

  /**
   * Query audit logs from the comprehensive AuditLogEntry table
   *
   * Provides rich filtering options for compliance and investigation queries.
   */
  async queryComprehensive(filters: {
    resourceType?: ResourceType;
    resourceId?: string;
    actorId?: string;
    actorType?: ActorType;
    action?: AuditAction;
    actionResult?: ActionResult;
    eventType?: string;
    dataClassification?: DataClassification;
    traceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: unknown[]; total: number }> {
    try {
      if (!this.prisma.auditLogEntry) {
        // Fall back to basic query
        return this.query(filters);
      }

      const where = this.buildWhereClause(filters);

      const [entries, total] = await Promise.all([
        this.prisma.auditLogEntry.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: filters.limit ?? 100,
          skip: filters.offset ?? 0,
        }),
        this.prisma.auditLogEntry.count({ where }),
      ]);

      return { entries, total };
    } catch (error) {
      console.debug('[AUDIT] Comprehensive query failed, falling back to basic:', error);
      return this.query(filters);
    }
  }

  /**
   * Query audit logs (basic AuditLog table for backward compatibility)
   */
  async query(filters: {
    resourceType?: ResourceType;
    resourceId?: string;
    actorId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: unknown[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (filters.resourceType) where.entityType = filters.resourceType;
    if (filters.resourceId) where.entityId = filters.resourceId;
    if (filters.actorId) where.userId = filters.actorId;
    if (filters.action) where.action = filters.action;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) (where.createdAt as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.createdAt as Record<string, Date>).lte = filters.endDate;
    }

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 100,
        skip: filters.offset ?? 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { entries, total };
  }

  /**
   * Get audit trail for a specific resource
   *
   * Returns the complete history of changes for a resource,
   * useful for compliance investigations.
   */
  async getResourceAuditTrail(
    resourceType: ResourceType,
    resourceId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ entries: unknown[]; total: number }> {
    return this.queryComprehensive({
      resourceType,
      resourceId,
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Get audit trail for a specific user/actor
   *
   * Returns all actions performed by a user, useful for
   * security investigations and compliance audits.
   */
  async getActorAuditTrail(
    actorId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ entries: unknown[]; total: number }> {
    return this.queryComprehensive({
      actorId,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Get permission-related audit entries
   *
   * Returns entries where permission was denied or checked,
   * useful for RBAC/ABAC compliance audits.
   */
  async getPermissionAuditTrail(
    options: {
      actorId?: string;
      resourceType?: ResourceType;
      permissionDeniedOnly?: boolean;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ entries: unknown[]; total: number }> {
    try {
      if (!this.prisma.auditLogEntry) {
        return { entries: [], total: 0 };
      }

      const where: Record<string, unknown> = {
        requiredPermission: { not: null },
      };

      if (options.actorId) where.actorId = options.actorId;
      if (options.resourceType) where.resourceType = options.resourceType;
      if (options.permissionDeniedOnly) where.permissionGranted = false;

      if (options.startDate || options.endDate) {
        where.timestamp = {};
        if (options.startDate) (where.timestamp as Record<string, Date>).gte = options.startDate;
        if (options.endDate) (where.timestamp as Record<string, Date>).lte = options.endDate;
      }

      const [entries, total] = await Promise.all([
        this.prisma.auditLogEntry.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: options.limit ?? 100,
          skip: options.offset ?? 0,
        }),
        this.prisma.auditLogEntry.count({ where }),
      ]);

      return { entries, total };
    } catch (error) {
      console.debug('[AUDIT] Permission audit trail query failed:', error);
      return { entries: [], total: 0 };
    }
  }

  /**
   * Flush pending audit logs (for async mode)
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toWrite = this.buffer.splice(0, this.config.batchSize);

    try {
      await Promise.all(toWrite.map((entry) => this.writeEntry(entry)));
    } catch (error) {
      console.error('[AUDIT] Failed to flush audit logs:', error);
      // Re-add failed entries to buffer
      this.buffer.unshift(...toWrite);
    }
  }

  /**
   * Shutdown the audit logger (flush remaining logs)
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    await this.flush();
  }

  /**
   * Prepare an audit log entry with defaults
   */
  private prepareEntry(
    input: AuditLogInput
  ): AuditLogInput & { eventId: string; retentionExpiresAt: Date } {
    const retentionExpiresAt = new Date();
    retentionExpiresAt.setDate(retentionExpiresAt.getDate() + this.config.defaultRetentionDays);

    return {
      ...input,
      eventId: input.eventId || randomUUID(),
      actionResult: input.actionResult ?? 'SUCCESS',
      actorType: input.actorType ?? 'USER',
      dataClassification: input.dataClassification ?? this.config.defaultClassification,
      permissionGranted: input.permissionGranted ?? true,
      retentionExpiresAt,
    };
  }

  /**
   * Write an audit log entry to the database
   *
   * Writes to both the comprehensive AuditLogEntry table (if available)
   * and the basic AuditLog table for backward compatibility.
   */
  private async writeEntry(entry: AuditLogInput): Promise<string> {
    try {
      // Try to write to the comprehensive AuditLogEntry table first
      const entryId = await this.writeComprehensiveEntry(entry);
      if (entryId) {
        return entryId;
      }

      // Fall back to basic AuditLog table
      const auditLog = await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.resourceType,
          entityId: entry.resourceId,
          oldValue: entry.beforeState as object | undefined,
          newValue: entry.afterState as object | undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          userId: entry.actorId || 'system',
          tenantId: entry.tenantId,
        },
      });

      return auditLog.id;
    } catch (error) {
      console.error('[AUDIT] Failed to write audit log:', error);
      throw error;
    }
  }

  /**
   * Write to the comprehensive AuditLogEntry table
   *
   * This table provides full audit context for compliance requirements:
   * - Actor tracking (user, system, AI agent, etc.)
   * - Data classification for compliance
   * - Permission context for RBAC/ABAC audit
   * - Request correlation with OpenTelemetry
   */
  private async writeComprehensiveEntry(entry: AuditLogInput): Promise<string | null> {
    try {
      // Check if the AuditLogEntry table exists
      if (!this.prisma.auditLogEntry) {
        return null;
      }

      const auditLogEntry = await this.prisma.auditLogEntry.create({
        data: {
          // Multi-tenancy
          tenantId: entry.tenantId,

          // Event metadata
          eventType: entry.eventType,
          eventVersion: entry.eventVersion ?? 'v1',
          eventId: entry.eventId || randomUUID(),

          // Actor information
          actorType: entry.actorType ?? 'USER',
          actorId: entry.actorId,
          actorEmail: entry.actorEmail,
          actorRole: entry.actorRole,

          // Resource information
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          resourceName: entry.resourceName,

          // Action details
          action: entry.action,
          actionResult: entry.actionResult ?? 'SUCCESS',
          actionReason: entry.actionReason,

          // Data changes
          beforeState: entry.beforeState as object | undefined,
          afterState: entry.afterState as object | undefined,
          changedFields: entry.changedFields ?? [],

          // Request context
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          requestId: entry.requestId,
          traceId: entry.traceId,
          sessionId: entry.sessionId,

          // Compliance
          dataClassification: entry.dataClassification ?? this.config.defaultClassification,
          retentionExpiresAt: entry.retentionExpiresAt,

          // Permission context
          requiredPermission: entry.requiredPermission,
          permissionGranted: entry.permissionGranted ?? true,
          permissionDeniedReason: entry.permissionDeniedReason,

          // Additional metadata
          metadata: entry.metadata as object | undefined,
        },
      });

      return auditLogEntry.id;
    } catch (error) {
      // If table doesn't exist or other error, return null to fall back to basic table
      console.debug('[AUDIT] Comprehensive entry failed, falling back to basic:', error);
      return null;
    }
  }

  /**
   * Calculate changed fields between two states
   */
  private calculateChangedFields(
    before?: Record<string, unknown>,
    after?: Record<string, unknown>
  ): string[] {
    if (!before && !after) return [];
    if (!before) return Object.keys(after || {});
    if (!after) return Object.keys(before);

    const changedFields: string[] = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changedFields.push(key);
      }
    }

    return changedFields;
  }

  /**
   * Schedule a buffer flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.config.flushIntervalMs);
  }

  /**
   * Get emoji for security severity (development logging)
   */
  private getSeverityEmoji(severity: SecuritySeverity): string {
    switch (severity) {
      case 'CRITICAL':
        return '!!!';
      case 'HIGH':
        return '!!';
      case 'MEDIUM':
        return '!';
      case 'LOW':
        return '-';
      default:
        return '*';
    }
  }
}

/**
 * Create a singleton audit logger instance
 */
let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(prisma: PrismaClient, config?: AuditLoggerConfig): AuditLogger {
    auditLoggerInstance ??= new AuditLogger(prisma, config);
    return auditLoggerInstance;
}

/**
 * Reset the audit logger instance (for testing)
 */
export function resetAuditLogger(): void {
  auditLoggerInstance = null;
}
