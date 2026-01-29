/**
 * Audit Logger Service (Refactored)
 *
 * Provides comprehensive audit logging for all CRM actions.
 * Implements the hybrid approach from ADR-008.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 * RELATED: ADR-008 (Audit Logging Approach)
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  AuditLogInput,
  SecurityEventInput,
  AuditAction,
  ActorType,
  ResourceType,
  AuditLoggerConfig,
  RequiredAuditLoggerConfig,
} from './types';
import { prepareEntry } from './utils';
import { writeEntry } from './writer';
import {
  createLoginSuccessEntry,
  createLoginSuccessSecurityEvent,
  createLoginFailureEntry,
  createLoginFailureSecurityEvent,
  createCrudEntry,
  createPermissionDeniedEntry,
  logSecurityEventToDb,
  createBulkOperationEntry,
} from './handlers';
import type { CrudLogOptions, BulkAction, BulkLogOptions, AuthLogOptions, PermissionDeniedOptions } from './handlers';
import {
  queryComprehensive,
  queryBasic,
  getResourceAuditTrail as queryResourceAuditTrail,
  getActorAuditTrail as queryActorAuditTrail,
  getPermissionAuditTrail as queryPermissionAuditTrail,
} from './queries';
import type { QueryFilters, QueryResult } from './queries';

/**
 * Audit Logger class - Facade for audit logging operations
 */
export class AuditLogger {
  private readonly prisma: PrismaClient;
  private readonly config: RequiredAuditLoggerConfig;
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
      defaultRetentionDays: config.defaultRetentionDays ?? 365 * 7,
    };
  }

  /**
   * Log an audit event
   */
  async log(input: AuditLogInput): Promise<string> {
    const entry = prepareEntry(input, this.config);

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

    return writeEntry(this.prisma, entry, this.config);
  }

  /**
   * Log a CRUD action with automatic state diff
   */
  async logAction(
    action: AuditAction,
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string,
    options: CrudLogOptions = {}
  ): Promise<string> {
    const entry = createCrudEntry(action, resourceType, resourceId, tenantId, options);
    return this.log(entry);
  }

  /**
   * Log a permission denied event
   */
  async logPermissionDenied(
    resourceType: ResourceType,
    resourceId: string,
    requiredPermission: string,
    tenantId: string,
    options: PermissionDeniedOptions = {}
  ): Promise<string> {
    const entry = createPermissionDeniedEntry(
      resourceType,
      resourceId,
      requiredPermission,
      tenantId,
      options
    );
    return this.log(entry);
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(input: SecurityEventInput): Promise<string> {
    return logSecurityEventToDb(this.prisma, input, this.config.consoleLog);
  }

  /**
   * Log a login attempt (success)
   */
  async logLoginSuccess(tenantId: string, options: AuthLogOptions): Promise<void> {
    await this.log(createLoginSuccessEntry(tenantId, options));
    await this.logSecurityEvent(createLoginSuccessSecurityEvent(options));
  }

  /**
   * Log a login attempt (failure)
   */
  async logLoginFailure(tenantId: string, options: AuthLogOptions): Promise<void> {
    await this.log(createLoginFailureEntry(tenantId, options));
    await this.logSecurityEvent(createLoginFailureSecurityEvent(options));
  }

  /**
   * Log a bulk operation
   */
  async logBulkOperation(
    action: BulkAction,
    resourceType: ResourceType,
    resourceIds: string[],
    tenantId: string,
    options: BulkLogOptions = {}
  ): Promise<string> {
    const entry = createBulkOperationEntry(action, resourceType, resourceIds, tenantId, options);
    return this.log(entry);
  }

  /**
   * Query audit logs from comprehensive table
   */
  async queryComprehensive(filters: QueryFilters): Promise<QueryResult> {
    return queryComprehensive(this.prisma, filters);
  }

  /**
   * Query audit logs from basic table
   */
  async query(filters: QueryFilters): Promise<QueryResult> {
    return queryBasic(this.prisma, filters);
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(
    resourceType: ResourceType,
    resourceId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<QueryResult> {
    return queryResourceAuditTrail(this.prisma, resourceType, resourceId, options);
  }

  /**
   * Get audit trail for a specific actor
   */
  async getActorAuditTrail(
    actorId: string,
    options: { startDate?: Date; endDate?: Date; limit?: number; offset?: number } = {}
  ): Promise<QueryResult> {
    return queryActorAuditTrail(this.prisma, actorId, options);
  }

  /**
   * Get permission-related audit entries
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
  ): Promise<QueryResult> {
    return queryPermissionAuditTrail(this.prisma, options);
  }

  /**
   * Flush pending audit logs (for async mode)
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toWrite = this.buffer.splice(0, this.config.batchSize);

    try {
      await Promise.all(toWrite.map((entry) => writeEntry(this.prisma, entry, this.config)));
    } catch (error) {
      console.error('[AUDIT] Failed to flush audit logs:', error);
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
}
