/**
 * Domain Event to Audit Log Handler
 *
 * Converts domain events from @intelliflow/domain into comprehensive
 * audit log entries as specified in ADR-008 (Hybrid Approach).
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 * RELATED: ADR-008 (Audit Logging Approach)
 *
 * Flow: Domain Events -> AuditEventHandler -> AuditLogEntry table
 *
 * Features:
 * - Automatic conversion of domain events to audit format
 * - Actor/resource extraction from event metadata
 * - Correlation with OpenTelemetry traces
 * - Data classification based on resource type
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditLogger, getAuditLogger } from './audit-logger';
import {
  AuditAction,
  ActorType,
  DataClassification,
  ResourceType,
  ActionResult,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Domain event structure (simplified from @intelliflow/domain)
 */
export interface DomainEventPayload {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  metadata?: {
    tenantId?: string;
    userId?: string;
    userEmail?: string;
    userRole?: string;
    correlationId?: string;
    causationId?: string;
    traceId?: string;
    requestId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Event-to-audit mapping configuration
 */
interface EventAuditMapping {
  action: AuditAction;
  resourceType: ResourceType;
  dataClassification?: DataClassification;
  actorType?: ActorType;
  extractBeforeState?: (payload: Record<string, unknown>) => Record<string, unknown> | undefined;
  extractAfterState?: (payload: Record<string, unknown>) => Record<string, unknown> | undefined;
  extractChangedFields?: (payload: Record<string, unknown>) => string[];
  extractResourceName?: (payload: Record<string, unknown>) => string | undefined;
}

/**
 * Handler result
 */
export interface AuditEventResult {
  success: boolean;
  auditLogId?: string;
  error?: string;
}

// ============================================================================
// Event Mapping Configuration
// ============================================================================

/**
 * Mapping of domain event types to audit log actions
 *
 * This configuration determines how each domain event is converted
 * to an audit log entry with appropriate action and classification.
 */
const EVENT_AUDIT_MAPPINGS: Record<string, EventAuditMapping> = {
  // Lead events
  'LeadCreated': {
    action: 'CREATE',
    resourceType: 'lead',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => p.lead as Record<string, unknown>,
    extractResourceName: (p) => (p.lead as Record<string, unknown>)?.email as string,
  },
  'LeadUpdated': {
    action: 'UPDATE',
    resourceType: 'lead',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => p.before as Record<string, unknown>,
    extractAfterState: (p) => p.after as Record<string, unknown>,
    extractChangedFields: (p) => p.changedFields as string[] ?? [],
  },
  'LeadScored': {
    action: 'AI_SCORE',
    resourceType: 'lead',
    dataClassification: 'INTERNAL',
    actorType: 'AI_AGENT',
    extractAfterState: (p) => ({ score: p.score, confidence: p.confidence, factors: p.factors }),
  },
  'LeadQualified': {
    action: 'QUALIFY',
    resourceType: 'lead',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({ qualified: true, qualifiedBy: p.qualifiedBy }),
  },
  'LeadConverted': {
    action: 'CONVERT',
    resourceType: 'lead',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({ contactId: p.contactId, accountId: p.accountId }),
  },
  'LeadDeleted': {
    action: 'DELETE',
    resourceType: 'lead',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => p.lead as Record<string, unknown>,
  },

  // Contact events
  'ContactCreated': {
    action: 'CREATE',
    resourceType: 'contact',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => p.contact as Record<string, unknown>,
    extractResourceName: (p) => {
      const contact = p.contact as Record<string, unknown>;
      return `${contact?.firstName} ${contact?.lastName}`;
    },
  },
  'ContactUpdated': {
    action: 'UPDATE',
    resourceType: 'contact',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => p.before as Record<string, unknown>,
    extractAfterState: (p) => p.after as Record<string, unknown>,
    extractChangedFields: (p) => p.changedFields as string[] ?? [],
  },
  'ContactDeleted': {
    action: 'DELETE',
    resourceType: 'contact',
    dataClassification: 'CONFIDENTIAL',
  },

  // Account events
  'AccountCreated': {
    action: 'CREATE',
    resourceType: 'account',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => p.account as Record<string, unknown>,
    extractResourceName: (p) => (p.account as Record<string, unknown>)?.name as string,
  },
  'AccountUpdated': {
    action: 'UPDATE',
    resourceType: 'account',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => p.before as Record<string, unknown>,
    extractAfterState: (p) => p.after as Record<string, unknown>,
    extractChangedFields: (p) => p.changedFields as string[] ?? [],
  },
  'AccountDeleted': {
    action: 'DELETE',
    resourceType: 'account',
    dataClassification: 'CONFIDENTIAL',
  },

  // Opportunity events
  'OpportunityCreated': {
    action: 'CREATE',
    resourceType: 'opportunity',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => p.opportunity as Record<string, unknown>,
    extractResourceName: (p) => (p.opportunity as Record<string, unknown>)?.name as string,
  },
  'OpportunityUpdated': {
    action: 'UPDATE',
    resourceType: 'opportunity',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => p.before as Record<string, unknown>,
    extractAfterState: (p) => p.after as Record<string, unknown>,
    extractChangedFields: (p) => p.changedFields as string[] ?? [],
  },
  'OpportunityStageChanged': {
    action: 'UPDATE',
    resourceType: 'opportunity',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => ({ stage: p.previousStage }),
    extractAfterState: (p) => ({ stage: p.newStage }),
    extractChangedFields: () => ['stage'],
  },
  'OpportunityClosed': {
    action: 'UPDATE',
    resourceType: 'opportunity',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({ status: 'closed', closedAt: p.closedAt, outcome: p.outcome }),
  },
  'OpportunityDeleted': {
    action: 'DELETE',
    resourceType: 'opportunity',
    dataClassification: 'CONFIDENTIAL',
  },

  // Task events
  'TaskCreated': {
    action: 'CREATE',
    resourceType: 'task',
    dataClassification: 'INTERNAL',
    extractAfterState: (p) => p.task as Record<string, unknown>,
    extractResourceName: (p) => (p.task as Record<string, unknown>)?.title as string,
  },
  'TaskUpdated': {
    action: 'UPDATE',
    resourceType: 'task',
    dataClassification: 'INTERNAL',
    extractBeforeState: (p) => p.before as Record<string, unknown>,
    extractAfterState: (p) => p.after as Record<string, unknown>,
    extractChangedFields: (p) => p.changedFields as string[] ?? [],
  },
  'TaskCompleted': {
    action: 'UPDATE',
    resourceType: 'task',
    dataClassification: 'INTERNAL',
    extractAfterState: (p) => ({ status: 'COMPLETED', completedAt: p.completedAt }),
    extractChangedFields: () => ['status', 'completedAt'],
  },
  'TaskAssigned': {
    action: 'ASSIGN',
    resourceType: 'task',
    dataClassification: 'INTERNAL',
    extractAfterState: (p) => ({ assignedTo: p.assignedTo }),
    extractChangedFields: () => ['assignedTo'],
  },
  'TaskDeleted': {
    action: 'DELETE',
    resourceType: 'task',
    dataClassification: 'INTERNAL',
  },

  // Appointment events
  'AppointmentCreated': {
    action: 'CREATE',
    resourceType: 'appointment',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => p.appointment as Record<string, unknown>,
    extractResourceName: (p) => (p.appointment as Record<string, unknown>)?.title as string,
  },
  'AppointmentRescheduled': {
    action: 'UPDATE',
    resourceType: 'appointment',
    dataClassification: 'CONFIDENTIAL',
    extractBeforeState: (p) => ({ startTime: p.previousStartTime, endTime: p.previousEndTime }),
    extractAfterState: (p) => ({ startTime: p.newStartTime, endTime: p.newEndTime }),
    extractChangedFields: () => ['startTime', 'endTime'],
  },
  'AppointmentCancelled': {
    action: 'UPDATE',
    resourceType: 'appointment',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({ status: 'CANCELLED', reason: p.reason }),
  },
  'AppointmentDeleted': {
    action: 'DELETE',
    resourceType: 'appointment',
    dataClassification: 'CONFIDENTIAL',
  },

  // AI events
  'AIPrediction': {
    action: 'AI_PREDICT',
    resourceType: 'ai_score',
    dataClassification: 'INTERNAL',
    actorType: 'AI_AGENT',
    extractAfterState: (p) => p.prediction as Record<string, unknown>,
  },
  'AIGeneration': {
    action: 'AI_GENERATE',
    resourceType: 'ai_score',
    dataClassification: 'INTERNAL',
    actorType: 'AI_AGENT',
    extractAfterState: (p) => ({ generatedContent: p.content, model: p.model }),
  },

  // User/Auth events
  'UserLoggedIn': {
    action: 'LOGIN',
    resourceType: 'user',
    dataClassification: 'PRIVILEGED',
    extractAfterState: (p) => ({ mfaUsed: p.mfaUsed, loginMethod: p.loginMethod }),
  },
  'UserLoggedOut': {
    action: 'LOGOUT',
    resourceType: 'user',
    dataClassification: 'INTERNAL',
  },
  'UserLoginFailed': {
    action: 'LOGIN_FAILED',
    resourceType: 'user',
    dataClassification: 'PRIVILEGED',
    extractAfterState: (p) => ({ reason: p.reason, attemptCount: p.attemptCount }),
  },
  'PasswordReset': {
    action: 'PASSWORD_RESET',
    resourceType: 'user',
    dataClassification: 'PRIVILEGED',
  },
  'PermissionDenied': {
    action: 'PERMISSION_DENIED',
    resourceType: 'system',
    dataClassification: 'PRIVILEGED',
    extractAfterState: (p) => ({
      requiredPermission: p.requiredPermission,
      reason: p.reason,
    }),
  },

  // Bulk operations
  'BulkUpdate': {
    action: 'BULK_UPDATE',
    resourceType: 'system',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({
      count: p.count,
      successCount: p.successCount,
      failureCount: p.failureCount,
    }),
  },
  'BulkDelete': {
    action: 'BULK_DELETE',
    resourceType: 'system',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({
      count: p.count,
      successCount: p.successCount,
      failureCount: p.failureCount,
    }),
  },
  'DataImport': {
    action: 'IMPORT',
    resourceType: 'system',
    dataClassification: 'CONFIDENTIAL',
    extractAfterState: (p) => ({
      source: p.source,
      recordCount: p.recordCount,
      successCount: p.successCount,
    }),
  },
  'DataExport': {
    action: 'EXPORT',
    resourceType: 'system',
    dataClassification: 'PRIVILEGED',
    extractAfterState: (p) => ({
      format: p.format,
      recordCount: p.recordCount,
      destination: p.destination,
    }),
  },
};

// ============================================================================
// Audit Event Handler
// ============================================================================

/**
 * AuditEventHandler - Converts domain events to audit log entries
 *
 * This handler implements the ADR-008 hybrid approach by:
 * 1. Listening to domain events
 * 2. Converting them to comprehensive audit log entries
 * 3. Storing in the AuditLogEntry table
 * 4. Correlating with OpenTelemetry traces
 */
export class AuditEventHandler {
  private auditLogger: AuditLogger;
  private customMappings: Map<string, EventAuditMapping> = new Map();

  constructor(prisma: PrismaClient) {
    this.auditLogger = getAuditLogger(prisma);
  }

  /**
   * Handle a domain event and create an audit log entry
   */
  async handle(event: DomainEventPayload): Promise<AuditEventResult> {
    try {
      const mapping = this.getMapping(event.eventType);

      if (!mapping) {
        // Unknown event type - log with generic action
        return this.handleUnknownEvent(event);
      }

      const auditLogId = await this.auditLogger.log({
        // Multi-tenancy
        tenantId: event.metadata?.tenantId ?? 'unknown',

        // Event metadata
        eventType: event.eventType,
        eventVersion: 'v1',
        eventId: event.eventId,

        // Actor information
        actorType: mapping.actorType ?? this.inferActorType(event),
        actorId: event.metadata?.userId,
        actorEmail: event.metadata?.userEmail,
        actorRole: event.metadata?.userRole,

        // Resource information
        resourceType: mapping.resourceType,
        resourceId: event.aggregateId,
        resourceName: mapping.extractResourceName?.(event.payload),

        // Action details
        action: mapping.action,
        actionResult: 'SUCCESS',

        // Data changes
        beforeState: mapping.extractBeforeState?.(event.payload),
        afterState: mapping.extractAfterState?.(event.payload),
        changedFields: mapping.extractChangedFields?.(event.payload) ?? [],

        // Request context
        ipAddress: event.metadata?.ipAddress,
        userAgent: event.metadata?.userAgent,
        requestId: event.metadata?.requestId,
        traceId: event.metadata?.traceId,
        sessionId: event.metadata?.sessionId,

        // Compliance
        dataClassification: mapping.dataClassification ?? 'INTERNAL',

        // Additional metadata
        metadata: {
          correlationId: event.metadata?.correlationId,
          causationId: event.metadata?.causationId,
          originalPayload: event.payload,
        },
      });

      return { success: true, auditLogId };
    } catch (error) {
      console.error(`[AuditEventHandler] Failed to handle event ${event.eventType}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle a batch of domain events
   */
  async handleBatch(events: DomainEventPayload[]): Promise<AuditEventResult[]> {
    const results = await Promise.allSettled(events.map((e) => this.handle(e)));

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        success: false,
        error: result.reason?.message ?? 'Unknown error',
      };
    });
  }

  /**
   * Register a custom event mapping
   */
  registerMapping(eventType: string, mapping: EventAuditMapping): void {
    this.customMappings.set(eventType, mapping);
  }

  /**
   * Check if an event type has a mapping
   */
  hasMapping(eventType: string): boolean {
    return this.customMappings.has(eventType) || eventType in EVENT_AUDIT_MAPPINGS;
  }

  /**
   * Get all registered event types
   */
  getRegisteredEventTypes(): string[] {
    const defaultTypes = Object.keys(EVENT_AUDIT_MAPPINGS);
    const customTypes = Array.from(this.customMappings.keys());
    return [...new Set([...defaultTypes, ...customTypes])];
  }

  /**
   * Get mapping for an event type
   */
  private getMapping(eventType: string): EventAuditMapping | undefined {
    return this.customMappings.get(eventType) ?? EVENT_AUDIT_MAPPINGS[eventType];
  }

  /**
   * Handle unknown events with a generic mapping
   */
  private async handleUnknownEvent(event: DomainEventPayload): Promise<AuditEventResult> {
    console.warn(`[AuditEventHandler] Unknown event type: ${event.eventType}`);

    // Determine action from event type name
    const action = this.inferAction(event.eventType);
    const resourceType = this.inferResourceType(event.aggregateType);

    const auditLogId = await this.auditLogger.log({
      tenantId: event.metadata?.tenantId ?? 'unknown',
      eventType: event.eventType,
      eventVersion: 'v1',
      eventId: event.eventId,
      actorType: this.inferActorType(event),
      actorId: event.metadata?.userId,
      actorEmail: event.metadata?.userEmail,
      actorRole: event.metadata?.userRole,
      resourceType,
      resourceId: event.aggregateId,
      action,
      actionResult: 'SUCCESS',
      afterState: event.payload,
      ipAddress: event.metadata?.ipAddress,
      userAgent: event.metadata?.userAgent,
      requestId: event.metadata?.requestId,
      traceId: event.metadata?.traceId,
      sessionId: event.metadata?.sessionId,
      dataClassification: 'INTERNAL',
      metadata: {
        isUnknownEventType: true,
        correlationId: event.metadata?.correlationId,
      },
    });

    return { success: true, auditLogId };
  }

  /**
   * Infer action from event type name
   */
  private inferAction(eventType: string): AuditAction {
    const lowerType = eventType.toLowerCase();
    if (lowerType.includes('created') || lowerType.includes('added')) return 'CREATE';
    if (lowerType.includes('updated') || lowerType.includes('changed')) return 'UPDATE';
    if (lowerType.includes('deleted') || lowerType.includes('removed')) return 'DELETE';
    if (lowerType.includes('login')) return 'LOGIN';
    if (lowerType.includes('logout')) return 'LOGOUT';
    if (lowerType.includes('score')) return 'AI_SCORE';
    if (lowerType.includes('assign')) return 'ASSIGN';
    if (lowerType.includes('transfer')) return 'TRANSFER';
    if (lowerType.includes('export')) return 'EXPORT';
    if (lowerType.includes('import')) return 'IMPORT';
    return 'UPDATE'; // Default
  }

  /**
   * Infer resource type from aggregate type
   */
  private inferResourceType(aggregateType: string): ResourceType {
    const lowerType = aggregateType.toLowerCase();
    if (lowerType.includes('lead')) return 'lead';
    if (lowerType.includes('contact')) return 'contact';
    if (lowerType.includes('account')) return 'account';
    if (lowerType.includes('opportunity')) return 'opportunity';
    if (lowerType.includes('task')) return 'task';
    if (lowerType.includes('user')) return 'user';
    if (lowerType.includes('appointment')) return 'appointment';
    if (lowerType.includes('ai') || lowerType.includes('score')) return 'ai_score';
    return 'system'; // Default
  }

  /**
   * Infer actor type from event metadata
   */
  private inferActorType(event: DomainEventPayload): ActorType {
    const eventType = event.eventType.toLowerCase();

    // AI-related events
    if (eventType.includes('ai') || eventType.includes('score') || eventType.includes('predict')) {
      return 'AI_AGENT';
    }

    // System events (no user ID)
    if (!event.metadata?.userId) {
      return 'SYSTEM';
    }

    // Check for webhook/API key indicators in metadata
    if (event.metadata?.userAgent?.includes('webhook')) {
      return 'WEBHOOK';
    }

    // Default to user
    return 'USER';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let handlerInstance: AuditEventHandler | null = null;

/**
 * Get the global audit event handler instance
 */
export function getAuditEventHandler(prisma: PrismaClient): AuditEventHandler {
  if (!handlerInstance) {
    handlerInstance = new AuditEventHandler(prisma);
  }
  return handlerInstance;
}

/**
 * Reset the handler instance (for testing)
 */
export function resetAuditEventHandler(): void {
  handlerInstance = null;
}

/**
 * Process a domain event and create audit log
 * Convenience function for quick integration
 */
export async function auditDomainEvent(
  prisma: PrismaClient,
  event: DomainEventPayload
): Promise<AuditEventResult> {
  const handler = getAuditEventHandler(prisma);
  return handler.handle(event);
}
