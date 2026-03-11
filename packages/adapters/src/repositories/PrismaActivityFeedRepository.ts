/**
 * Prisma Activity Feed Repository
 * IFC-069: Unified Activity Feed Service
 *
 * Implements ActivityFeedRepositoryPort using Prisma ORM.
 * Queries 7 activity tables in parallel, merge-sorts by timestamp DESC,
 * and applies cursor-based pagination for efficient feed loading.
 */

import { PrismaClient } from '@intelliflow/db';
import type { ActivityFeedRepositoryPort } from '@intelliflow/application';
import type {
  UnifiedActivityItem,
  ActivityFeedCursor,
  ActivityFeedFilters,
  ActivityFeedSource,
  ActivityFeedType,
  ActivityFeedStats,
  ActivityFeedEntityType,
} from '@intelliflow/domain';

/**
 * Maps from source-specific activity types to normalized feed types.
 */
const LEAD_ACTIVITY_TYPE_MAP: Record<string, ActivityFeedType> = {
  WEB_FORM: 'SYSTEM',
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  NOTE: 'NOTE',
  SCORE_UPDATE: 'SCORE_UPDATE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  QUALIFICATION: 'QUALIFICATION',
};

const CONTACT_ACTIVITY_TYPE_MAP: Record<string, ActivityFeedType> = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  CHAT: 'CHAT',
  DOCUMENT: 'DOCUMENT',
  DEAL: 'DEAL',
  TICKET: 'TICKET',
  NOTE: 'NOTE',
};

const OPPORTUNITY_EVENT_TYPE_MAP: Record<string, ActivityFeedType> = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  NOTE: 'NOTE',
  TASK: 'TASK',
  STAGE_CHANGE: 'STAGE_CHANGE',
  AGENT_ACTION: 'AGENT_ACTION',
  SYSTEM: 'SYSTEM',
};

const TICKET_ACTIVITY_TYPE_MAP: Record<string, ActivityFeedType> = {
  CUSTOMER_MESSAGE: 'SYSTEM',
  AGENT_REPLY: 'SYSTEM',
  INTERNAL_NOTE: 'NOTE',
  SYSTEM_EVENT: 'SYSTEM',
  SLA_ALERT: 'SLA_ALERT',
  ASSIGNMENT: 'ASSIGNMENT',
  STATUS_CHANGE: 'STATUS_CHANGE',
};

export class PrismaActivityFeedRepository implements ActivityFeedRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getUnifiedFeed(
    tenantId: string,
    limit: number,
    cursor: ActivityFeedCursor | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    // Determine which sources to query
    const sourcesToQuery = filters.sources?.length
      ? filters.sources
      : ([
          'LEAD_ACTIVITY',
          'CONTACT_ACTIVITY',
          'OPPORTUNITY_EVENT',
          'TICKET_ACTIVITY',
          'EMAIL',
          'CALL',
          'CHAT',
        ] as ActivityFeedSource[]);

    // If filtering by entity type, only query relevant sources
    const filteredSources = filters.entityType
      ? this.filterSourcesByEntityType(sourcesToQuery, filters.entityType)
      : sourcesToQuery;

    // Build cursor condition for each query
    const cursorCondition = cursor ? { timestamp: cursor.timestamp, id: cursor.id } : null;

    // Execute all source queries in parallel
    const queries = filteredSources.map((source) =>
      this.querySource(source, tenantId, limit, cursorCondition, filters)
    );

    const results = await Promise.all(queries);

    // Merge sort all results by timestamp DESC
    const merged = results.flat();
    merged.sort((a, b) => {
      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id); // Deterministic tie-breaking
    });

    return merged.slice(0, limit);
  }

  async getEntityFeed(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit: number,
    cursor: ActivityFeedCursor | null
  ): Promise<UnifiedActivityItem[]> {
    const cursorCondition = cursor ? { timestamp: cursor.timestamp, id: cursor.id } : null;

    const filters: ActivityFeedFilters = {
      entityType: entityType as any,
      entityId,
    };

    // Determine which sources to query based on entity type
    const sources = this.getSourcesForEntityType(entityType);

    const queries = sources.map((source) =>
      this.querySource(source, tenantId, limit, cursorCondition, filters)
    );

    const results = await Promise.all(queries);
    const merged = results.flat();
    merged.sort((a, b) => {
      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    return merged.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // IFC-203: Activity Feed Full-Text Search
  // ---------------------------------------------------------------------------

  async searchFeed(
    tenantId: string,
    query: string,
    limit: number,
    cursor: ActivityFeedCursor | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    // Determine which sources to query
    const sourcesToQuery = filters.sources?.length
      ? filters.sources
      : ([
          'LEAD_ACTIVITY',
          'CONTACT_ACTIVITY',
          'OPPORTUNITY_EVENT',
          'TICKET_ACTIVITY',
          'EMAIL',
          'CALL',
          'CHAT',
        ] as ActivityFeedSource[]);

    const filteredSources = filters.entityType
      ? this.filterSourcesByEntityType(sourcesToQuery, filters.entityType)
      : sourcesToQuery;

    const cursorCondition = cursor ? { timestamp: cursor.timestamp, id: cursor.id } : null;

    // Execute all source search queries in parallel
    const queries = filteredSources.map((source) =>
      this.searchSource(source, tenantId, query, limit, cursorCondition, filters)
    );

    const results = await Promise.all(queries);

    // Merge sort all results by timestamp DESC
    const merged = results.flat();
    merged.sort((a, b) => {
      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    return merged.slice(0, limit);
  }

  /**
   * Build ILIKE search conditions for a set of fields.
   */
  private buildSearchConditions(query: string, fields: string[]): Record<string, unknown>[] {
    return fields.map((field) => ({
      [field]: { contains: query, mode: 'insensitive' },
    }));
  }

  /**
   * Search a single source table with ILIKE conditions.
   */
  private async searchSource(
    source: ActivityFeedSource,
    tenantId: string,
    query: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    switch (source) {
      case 'LEAD_ACTIVITY':
        return this.searchLeadActivities(tenantId, query, limit, cursor, filters);
      case 'CONTACT_ACTIVITY':
        return this.searchContactActivities(tenantId, query, limit, cursor, filters);
      case 'OPPORTUNITY_EVENT':
        return this.searchOpportunityEvents(tenantId, query, limit, cursor, filters);
      case 'TICKET_ACTIVITY':
        return this.searchTicketActivities(tenantId, query, limit, cursor, filters);
      case 'EMAIL':
        return this.searchEmailRecords(tenantId, query, limit, cursor, filters);
      case 'CALL':
        return this.searchCallRecords(tenantId, query, limit, cursor, filters);
      case 'CHAT':
        return this.searchChatMessages(tenantId, query, limit, cursor, filters);
      default:
        return [];
    }
  }

  private async searchLeadActivities(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['title', 'description', 'userName']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { timestamp: { lt: cursor.timestamp } },
          { timestamp: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId) where.leadId = filters.entityId;

    const rows = await this.prisma.leadActivity.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { lead: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    return rows.map((r) => ({
      id: `lead_${r.id}`,
      source: 'LEAD_ACTIVITY' as const,
      type: LEAD_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      actor: r.userName ? { id: r.userId, name: r.userName } : null,
      entity: r.lead
        ? {
            id: r.lead.id,
            type: 'LEAD' as const,
            name: [r.lead.firstName, r.lead.lastName].filter(Boolean).join(' ') || r.lead.email,
          }
        : null,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  private async searchContactActivities(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['title', 'description', 'userName']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { timestamp: { lt: cursor.timestamp } },
          { timestamp: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId) where.contactId = filters.entityId;

    const rows = await this.prisma.contactActivity.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    return rows.map((r) => ({
      id: `contact_${r.id}`,
      source: 'CONTACT_ACTIVITY' as const,
      type: CONTACT_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      actor: r.userName ? { id: r.userId, name: r.userName } : null,
      entity: r.contact
        ? {
            id: r.contact.id,
            type: 'CONTACT' as const,
            name: `${r.contact.firstName} ${r.contact.lastName}`.trim() || r.contact.email,
          }
        : null,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  private async searchOpportunityEvents(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['title', 'description']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { timestamp: { lt: cursor.timestamp } },
          { timestamp: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId) where.opportunityId = filters.entityId;

    const rows = await this.prisma.activityEvent.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { opportunity: { select: { id: true, name: true } } },
    });

    return rows.map((r) => ({
      id: `opp_${r.id}`,
      source: 'OPPORTUNITY_EVENT' as const,
      type: OPPORTUNITY_EVENT_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      actor: r.userId ? { id: r.userId, name: r.agentName || 'System' } : null,
      entity: r.opportunity
        ? { id: r.opportunity.id, type: 'OPPORTUNITY' as const, name: r.opportunity.name }
        : null,
      metadata:
        r.stageFrom || r.stageTo
          ? { stageFrom: r.stageFrom, stageTo: r.stageTo, confidenceScore: r.confidenceScore }
          : null,
    }));
  }

  private async searchTicketActivities(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['content', 'authorName']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { timestamp: { lt: cursor.timestamp } },
          { timestamp: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId) where.ticketId = filters.entityId;

    const rows = await this.prisma.ticketActivity.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { ticket: { select: { id: true, subject: true, ticketNumber: true } } },
    });

    return rows.map((r) => ({
      id: `ticket_${r.id}`,
      source: 'TICKET_ACTIVITY' as const,
      type: TICKET_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.content.length > 100 ? r.content.slice(0, 100) + '...' : r.content,
      description: r.isInternal ? '[Internal note]' : null,
      timestamp: r.timestamp,
      actor: { id: null, name: r.authorName },
      entity: r.ticket
        ? {
            id: r.ticket.id,
            type: 'TICKET' as const,
            name: `${r.ticket.ticketNumber}: ${r.ticket.subject}`,
          }
        : null,
      metadata: r.systemEventData as Record<string, unknown> | null,
    }));
  }

  private async searchEmailRecords(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['subject', 'fromEmail', 'toEmail']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { createdAt: { lt: cursor.timestamp } },
          { createdAt: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId && filters.entityType === 'CONTACT') where.contactId = filters.entityId;

    const rows = await this.prisma.emailRecord.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map((r) => ({
      id: `email_${r.id}`,
      source: 'EMAIL' as const,
      type: 'EMAIL' as const,
      title: r.subject,
      description: `From: ${r.fromEmail} → To: ${r.toEmail}`,
      timestamp: r.createdAt,
      actor: r.userId ? { id: r.userId, name: r.fromEmail } : null,
      entity: r.contactId ? { id: r.contactId, type: 'CONTACT' as const, name: r.toEmail } : null,
      metadata: { status: r.status, openCount: r.openCount, clickCount: r.clickCount },
    }));
  }

  private async searchCallRecords(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['contactName', 'userName', 'summary']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { startedAt: { lt: cursor.timestamp } },
          { startedAt: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId && filters.entityType === 'CONTACT') where.contactId = filters.entityId;

    const rows = await this.prisma.callRecord.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map((r) => ({
      id: `call_${r.id}`,
      source: 'CALL' as const,
      type: 'CALL' as const,
      title: `${r.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call` + (r.contactName ? ` with ${r.contactName}` : ''),
      description: r.summary || r.outcome || null,
      timestamp: r.startedAt,
      actor: r.userName ? { id: r.userId, name: r.userName } : null,
      entity: r.contactId
        ? { id: r.contactId, type: 'CONTACT' as const, name: r.contactName || r.toNumber }
        : null,
      metadata: {
        duration: r.duration,
        status: r.status,
        outcome: r.outcome,
        sentiment: r.sentiment,
      },
    }));
  }

  private async searchChatMessages(
    tenantId: string, query: string, limit: number,
    cursor: { timestamp: Date; id: string } | null, filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = {
      tenantId,
      AND: [{ OR: this.buildSearchConditions(query, ['content']) }],
    };
    if (cursor) {
      where.AND.push({
        OR: [
          { createdAt: { lt: cursor.timestamp } },
          { createdAt: cursor.timestamp, id: { lt: cursor.id } },
        ],
      });
    }
    if (filters.entityId && filters.entityType === 'CONTACT') {
      where.conversation = { contactId: filters.entityId };
    }

    const rows = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        conversation: { select: { id: true, contactName: true, contactId: true, subject: true } },
      },
    });

    return rows.map((r) => ({
      id: `chat_${r.id}`,
      source: 'CHAT' as const,
      type: 'CHAT' as const,
      title: r.conversation?.subject || 'Chat message',
      description: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
      timestamp: r.createdAt,
      actor: { id: r.senderId, name: r.senderName },
      entity: r.conversation?.contactId
        ? {
            id: r.conversation.contactId,
            type: 'CONTACT' as const,
            name: r.conversation.contactName || 'Unknown',
          }
        : null,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Private: Source-specific query methods
  // ---------------------------------------------------------------------------

  private async querySource(
    source: ActivityFeedSource,
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const items = await (async (): Promise<UnifiedActivityItem[]> => {
      switch (source) {
        case 'LEAD_ACTIVITY':
          return this.queryLeadActivities(tenantId, limit, cursor, filters);
        case 'CONTACT_ACTIVITY':
          return this.queryContactActivities(tenantId, limit, cursor, filters);
        case 'OPPORTUNITY_EVENT':
          return this.queryOpportunityEvents(tenantId, limit, cursor, filters);
        case 'TICKET_ACTIVITY':
          return this.queryTicketActivities(tenantId, limit, cursor, filters);
        case 'EMAIL':
          return this.queryEmailRecords(tenantId, limit, cursor, filters);
        case 'CALL':
          return this.queryCallRecords(tenantId, limit, cursor, filters);
        case 'CHAT':
          return this.queryChatMessages(tenantId, limit, cursor, filters);
        default:
          return [];
      }
    })();

    // Normalize source rows first, then apply type filter on unified type values.
    if (!filters.types || filters.types.length === 0) {
      return items;
    }
    const allowedTypes = new Set(filters.types);
    return items.filter((item) => allowedTypes.has(item.type));
  }

  private async queryLeadActivities(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { timestamp: { lt: cursor.timestamp } },
        { timestamp: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId) where.leadId = filters.entityId;
    if (filters.after) where.timestamp = { ...where.timestamp, gte: filters.after };
    if (filters.before) where.timestamp = { ...where.timestamp, lte: filters.before };

    const rows = await this.prisma.leadActivity.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { lead: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    return rows.map((r) => ({
      id: `lead_${r.id}`,
      source: 'LEAD_ACTIVITY' as const,
      type: LEAD_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      actor: r.userName ? { id: r.userId, name: r.userName } : null,
      entity: r.lead
        ? {
            id: r.lead.id,
            type: 'LEAD' as const,
            name: [r.lead.firstName, r.lead.lastName].filter(Boolean).join(' ') || r.lead.email,
          }
        : null,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  private async queryContactActivities(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { timestamp: { lt: cursor.timestamp } },
        { timestamp: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId) where.contactId = filters.entityId;
    if (filters.after) where.timestamp = { ...where.timestamp, gte: filters.after };
    if (filters.before) where.timestamp = { ...where.timestamp, lte: filters.before };

    const rows = await this.prisma.contactActivity.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    return rows.map((r) => ({
      id: `contact_${r.id}`,
      source: 'CONTACT_ACTIVITY' as const,
      type: CONTACT_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      actor: r.userName ? { id: r.userId, name: r.userName } : null,
      entity: r.contact
        ? {
            id: r.contact.id,
            type: 'CONTACT' as const,
            name: `${r.contact.firstName} ${r.contact.lastName}`.trim() || r.contact.email,
          }
        : null,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  private async queryOpportunityEvents(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { timestamp: { lt: cursor.timestamp } },
        { timestamp: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId) where.opportunityId = filters.entityId;
    if (filters.after) where.timestamp = { ...where.timestamp, gte: filters.after };
    if (filters.before) where.timestamp = { ...where.timestamp, lte: filters.before };

    const rows = await this.prisma.activityEvent.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { opportunity: { select: { id: true, name: true } } },
    });

    return rows.map((r) => ({
      id: `opp_${r.id}`,
      source: 'OPPORTUNITY_EVENT' as const,
      type: OPPORTUNITY_EVENT_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      actor: r.userId ? { id: r.userId, name: r.agentName || 'System' } : null,
      entity: r.opportunity
        ? { id: r.opportunity.id, type: 'OPPORTUNITY' as const, name: r.opportunity.name }
        : null,
      metadata:
        r.stageFrom || r.stageTo
          ? { stageFrom: r.stageFrom, stageTo: r.stageTo, confidenceScore: r.confidenceScore }
          : null,
    }));
  }

  private async queryTicketActivities(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { timestamp: { lt: cursor.timestamp } },
        { timestamp: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId) where.ticketId = filters.entityId;
    if (filters.after) where.timestamp = { ...where.timestamp, gte: filters.after };
    if (filters.before) where.timestamp = { ...where.timestamp, lte: filters.before };

    const rows = await this.prisma.ticketActivity.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { ticket: { select: { id: true, subject: true, ticketNumber: true } } },
    });

    return rows.map((r) => ({
      id: `ticket_${r.id}`,
      source: 'TICKET_ACTIVITY' as const,
      type: TICKET_ACTIVITY_TYPE_MAP[r.type] || 'SYSTEM',
      title: r.content.length > 100 ? r.content.slice(0, 100) + '...' : r.content,
      description: r.isInternal ? '[Internal note]' : null,
      timestamp: r.timestamp,
      actor: { id: null, name: r.authorName },
      entity: r.ticket
        ? {
            id: r.ticket.id,
            type: 'TICKET' as const,
            name: `${r.ticket.ticketNumber}: ${r.ticket.subject}`,
          }
        : null,
      metadata: r.systemEventData as Record<string, unknown> | null,
    }));
  }

  private async queryEmailRecords(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId && filters.entityType === 'CONTACT') where.contactId = filters.entityId;
    if (filters.after) where.createdAt = { ...where.createdAt, gte: filters.after };
    if (filters.before) where.createdAt = { ...where.createdAt, lte: filters.before };

    const rows = await this.prisma.emailRecord.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map((r) => ({
      id: `email_${r.id}`,
      source: 'EMAIL' as const,
      type: 'EMAIL' as const,
      title: r.subject,
      description: `From: ${r.fromEmail} → To: ${r.toEmail}`,
      timestamp: r.createdAt,
      actor: r.userId ? { id: r.userId, name: r.fromEmail } : null,
      entity: r.contactId ? { id: r.contactId, type: 'CONTACT' as const, name: r.toEmail } : null,
      metadata: { status: r.status, openCount: r.openCount, clickCount: r.clickCount },
    }));
  }

  private async queryCallRecords(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { startedAt: { lt: cursor.timestamp } },
        { startedAt: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId && filters.entityType === 'CONTACT') where.contactId = filters.entityId;
    if (filters.after) where.startedAt = { ...where.startedAt, gte: filters.after };
    if (filters.before) where.startedAt = { ...where.startedAt, lte: filters.before };

    const rows = await this.prisma.callRecord.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map((r) => ({
      id: `call_${r.id}`,
      source: 'CALL' as const,
      type: 'CALL' as const,
      title: `${r.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call` + (r.contactName ? ` with ${r.contactName}` : ''),
      description: r.summary || r.outcome || null,
      timestamp: r.startedAt,
      actor: r.userName ? { id: r.userId, name: r.userName } : null,
      entity: r.contactId
        ? { id: r.contactId, type: 'CONTACT' as const, name: r.contactName || r.toNumber }
        : null,
      metadata: {
        duration: r.duration,
        status: r.status,
        outcome: r.outcome,
        sentiment: r.sentiment,
      },
    }));
  }

  private async queryChatMessages(
    tenantId: string,
    limit: number,
    cursor: { timestamp: Date; id: string } | null,
    filters: ActivityFeedFilters
  ): Promise<UnifiedActivityItem[]> {
    const where: any = { tenantId };
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, id: { lt: cursor.id } },
      ];
    }
    if (filters.entityId && filters.entityType === 'CONTACT') {
      where.conversation = { contactId: filters.entityId };
    }
    if (filters.after) where.createdAt = { ...where.createdAt, gte: filters.after };
    if (filters.before) where.createdAt = { ...where.createdAt, lte: filters.before };

    const rows = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        conversation: { select: { id: true, contactName: true, contactId: true, subject: true } },
      },
    });

    return rows.map((r) => ({
      id: `chat_${r.id}`,
      source: 'CHAT' as const,
      type: 'CHAT' as const,
      title: r.conversation?.subject || 'Chat message',
      description: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
      timestamp: r.createdAt,
      actor: { id: r.senderId, name: r.senderName },
      entity: r.conversation?.contactId
        ? {
            id: r.conversation.contactId,
            type: 'CONTACT' as const,
            name: r.conversation.contactName || 'Unknown',
          }
        : null,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  }

  // ---------------------------------------------------------------------------
  // IFC-202: Activity Feed Stats
  // ---------------------------------------------------------------------------

  /**
   * Get aggregate stats from the activity feed across all 7 source tables.
   * Runs queries in parallel via Promise.all (NF-005: No N+1).
   *
   * Risk mitigation (Risk #4): MVP accepts heap scan within time window for
   * type grouping — existing (tenantId, timestamp) indexes cover the time filter.
   * Consider (tenantId, type, timestamp) composite indexes if performance degrades.
   *
   * Risk mitigation (Risk #6): Slight count variance across 7 parallel queries
   * is acceptable for dashboard-level aggregates; cache mitigates variance.
   */
  async getStats(
    tenantId: string,
    windowStart: Date | null,
    windowEnd: Date,
    filters: { sources?: ActivityFeedSource[]; entityType?: ActivityFeedEntityType }
  ): Promise<ActivityFeedStats> {
    // Determine which sources to query
    let sourcesToQuery: ActivityFeedSource[] = [
      'LEAD_ACTIVITY', 'CONTACT_ACTIVITY', 'OPPORTUNITY_EVENT',
      'TICKET_ACTIVITY', 'EMAIL', 'CALL', 'CHAT',
    ];

    if (filters.sources?.length) {
      sourcesToQuery = sourcesToQuery.filter((s) => filters.sources!.includes(s));
    }

    if (filters.entityType) {
      const validSources = this.getEntitySourceMapForStats()[filters.entityType] || [];
      sourcesToQuery = sourcesToQuery.filter((s) => validSources.includes(s));
    }

    // Type maps for tables that have a 'type' column
    const typeMaps: Partial<Record<ActivityFeedSource, Record<string, ActivityFeedType>>> = {
      LEAD_ACTIVITY: LEAD_ACTIVITY_TYPE_MAP,
      CONTACT_ACTIVITY: CONTACT_ACTIVITY_TYPE_MAP,
      OPPORTUNITY_EVENT: OPPORTUNITY_EVENT_TYPE_MAP,
      TICKET_ACTIVITY: TICKET_ACTIVITY_TYPE_MAP,
    };

    // Tables with groupBy (have type column): leadActivity, contactActivity, activityEvent, ticketActivity
    // Tables with count only (single type): emailRecord→EMAIL, callRecord→CALL, chatMessage→CHAT
    const sourceCountMap: Record<string, number> = {};
    const typeCountMap: Record<string, number> = {};

    const queries: Promise<void>[] = [];

    for (const source of sourcesToQuery) {
      if (source === 'LEAD_ACTIVITY' || source === 'CONTACT_ACTIVITY' ||
          source === 'OPPORTUNITY_EVENT' || source === 'TICKET_ACTIVITY') {
        const modelName = this.getModelForSource(source);
        const timestampField = 'timestamp';
        const where: Record<string, unknown> = { tenantId };
        const tsWhere: Record<string, unknown> = {};
        if (windowStart) tsWhere.gte = windowStart;
        tsWhere.lte = windowEnd;
        where[timestampField] = tsWhere;

        queries.push(
          (this.prisma as any)[modelName].groupBy({
            by: ['type'],
            where,
            _count: { _all: true },
          }).then((rows: Array<{ type: string; _count: { _all: number } }>) => {
            let sourceTotal = 0;
            const typeMap = typeMaps[source]!;
            for (const row of rows) {
              const normalizedType = typeMap[row.type] || 'SYSTEM';
              const count = row._count._all;
              sourceTotal += count;
              typeCountMap[normalizedType] = (typeCountMap[normalizedType] || 0) + count;
            }
            sourceCountMap[source] = sourceTotal;
          })
        );
      } else {
        // EMAIL, CALL, CHAT — single-type sources, use count()
        const modelName = this.getModelForSource(source);
        const timestampField = source === 'EMAIL' ? 'createdAt'
          : source === 'CALL' ? 'startedAt'
          : 'createdAt'; // CHAT

        const feedType: ActivityFeedType = source === 'EMAIL' ? 'EMAIL'
          : source === 'CALL' ? 'CALL'
          : 'CHAT';

        const where: Record<string, unknown> = { tenantId };
        const tsWhere: Record<string, unknown> = {};
        if (windowStart) tsWhere.gte = windowStart;
        tsWhere.lte = windowEnd;
        where[timestampField] = tsWhere;

        queries.push(
          (this.prisma as any)[modelName].count({ where }).then((count: number) => {
            sourceCountMap[source] = count;
            if (count > 0) {
              typeCountMap[feedType] = (typeCountMap[feedType] || 0) + count;
            }
          })
        );
      }
    }

    await Promise.all(queries);

    // Build bySource
    const bySource = Object.entries(sourceCountMap)
      .filter(([, count]) => count > 0)
      .map(([source, count]) => ({ source: source as ActivityFeedSource, count }));

    // Build byType
    const byType = Object.entries(typeCountMap)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({ type: type as ActivityFeedType, count }));

    // Build byEntityType — derived from bySource using entitySourceMap
    const entitySourceMap = this.getEntitySourceMapForStats();
    const entityCountMap: Record<string, number> = {};
    for (const [entityType, entitySources] of Object.entries(entitySourceMap)) {
      let entityTotal = 0;
      for (const s of entitySources) {
        entityTotal += sourceCountMap[s] || 0;
      }
      if (entityTotal > 0) {
        entityCountMap[entityType] = entityTotal;
      }
    }
    const byEntityType = Object.entries(entityCountMap)
      .map(([entityType, count]) => ({ entityType: entityType as ActivityFeedEntityType, count }));

    const total = Object.values(sourceCountMap).reduce((sum, c) => sum + c, 0);

    return { total, byType, bySource, byEntityType };
  }

  private getModelForSource(source: ActivityFeedSource): string {
    const map: Record<ActivityFeedSource, string> = {
      LEAD_ACTIVITY: 'leadActivity',
      CONTACT_ACTIVITY: 'contactActivity',
      OPPORTUNITY_EVENT: 'activityEvent',
      TICKET_ACTIVITY: 'ticketActivity',
      EMAIL: 'emailRecord',
      CALL: 'callRecord',
      CHAT: 'chatMessage',
    };
    return map[source];
  }

  private getEntitySourceMapForStats(): Record<string, ActivityFeedSource[]> {
    return {
      LEAD: ['LEAD_ACTIVITY'],
      CONTACT: ['CONTACT_ACTIVITY', 'EMAIL', 'CALL', 'CHAT'],
      OPPORTUNITY: ['OPPORTUNITY_EVENT'],
      TICKET: ['TICKET_ACTIVITY'],
      ACCOUNT: ['CONTACT_ACTIVITY', 'OPPORTUNITY_EVENT'],
      TASK: [],
      CASE: [],
      DOCUMENT: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Helpers
  // ---------------------------------------------------------------------------

  private filterSourcesByEntityType(
    sources: ActivityFeedSource[],
    entityType: string
  ): ActivityFeedSource[] {
    const entitySourceMap: Record<string, ActivityFeedSource[]> = {
      LEAD: ['LEAD_ACTIVITY'],
      CONTACT: ['CONTACT_ACTIVITY', 'EMAIL', 'CALL', 'CHAT'],
      OPPORTUNITY: ['OPPORTUNITY_EVENT'],
      TICKET: ['TICKET_ACTIVITY'],
      ACCOUNT: ['CONTACT_ACTIVITY', 'OPPORTUNITY_EVENT'],
      // TODO: Add backing Prisma models (CaseActivity, TaskActivity, DocumentActivity)
      // then wire CASE_ACTIVITY/TASK_ACTIVITY/DOCUMENT_ACTIVITY sources here
      TASK: [],
      CASE: [],
      DOCUMENT: [],
    };
    const validSources = entitySourceMap[entityType] || sources;
    return sources.filter((s) => validSources.includes(s));
  }

  private getSourcesForEntityType(entityType: string): ActivityFeedSource[] {
    const entitySourceMap: Record<string, ActivityFeedSource[]> = {
      LEAD: ['LEAD_ACTIVITY'],
      CONTACT: ['CONTACT_ACTIVITY', 'EMAIL', 'CALL', 'CHAT'],
      OPPORTUNITY: ['OPPORTUNITY_EVENT'],
      TICKET: ['TICKET_ACTIVITY'],
      ACCOUNT: ['CONTACT_ACTIVITY', 'OPPORTUNITY_EVENT'],
      // TODO: Add backing Prisma models (CaseActivity, TaskActivity, DocumentActivity)
      // then wire CASE_ACTIVITY/TASK_ACTIVITY/DOCUMENT_ACTIVITY sources here
      TASK: [],
      CASE: [],
      DOCUMENT: [],
    };
    return entitySourceMap[entityType] || [];
  }
}
