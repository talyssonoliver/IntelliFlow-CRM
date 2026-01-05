/**
 * Timeline Service - Communication Events Integration (IFC-159)
 *
 * Provides additional queries for enriching case timeline with:
 * - Email communications (EmailRecord)
 * - Chat messages (ChatMessage) - including WhatsApp
 * - Call records (CallRecord)
 * - Document audit trails (CaseDocumentAudit)
 *
 * These are integrated with the main timeline router to provide
 * a unified chronological view of all case-related activities.
 *
 * @task IFC-159 - Case timeline enrichment
 * @kpi Response time <1s
 */

import { PrismaClient } from '@prisma/client';
import {
  TimelineEvent,
  TimelineEventType,
  TimelinePriority,
  AgentActionStatus,
} from './timeline.router';

// Communication channel mapping
export const CommunicationChannel = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  TEAMS: 'teams',
  SLACK: 'slack',
  PHONE: 'phone',
  WEBCHAT: 'webchat',
  SMS: 'sms',
  INTERNAL: 'internal',
} as const;

export type CommunicationChannelValue =
  (typeof CommunicationChannel)[keyof typeof CommunicationChannel];

/**
 * Timeline service for communication events
 */
export class TimelineCommunicationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get email events for a case
   *
   * Fetches emails linked to case contacts and maps them to timeline events
   */
  async getEmailEvents(options: {
    caseId?: string;
    contactId?: string;
    dealId?: string;
    fromDate?: Date;
    toDate?: Date;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }): Promise<TimelineEvent[]> {
    const { contactId, dealId, fromDate, toDate, sortOrder = 'desc', limit = 50 } = options;

    // Build where clause
    const where: any = {};

    if (contactId) {
      where.contactId = contactId;
    }

    if (dealId) {
      where.dealId = dealId;
    }

    // Exclude pending/draft emails
    where.status = {
      notIn: ['PENDING'],
    };

    // Date filters
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const emails = await this.prisma.emailRecord.findMany({
      where,
      include: {
        attachments: true,
      },
      orderBy: { createdAt: sortOrder },
      take: limit,
    });

    return emails.map((email) => ({
      id: `email-${email.id}`,
      type: TimelineEventType.EMAIL,
      title: email.subject || 'Email',
      description: email.body?.substring(0, 200) || null,
      timestamp: email.sentAt || email.createdAt,
      priority: null,
      entityType: 'email',
      entityId: email.id,
      communication: {
        channel: 'email' as const,
        direction: email.fromEmail?.includes('@') ? 'outbound' : 'inbound',
        from: email.fromEmail || undefined,
        to: email.toEmail || undefined,
        subject: email.subject || undefined,
      },
      actor: email.userId
        ? {
            id: email.userId,
            name: null,
            email: email.fromEmail || null,
            avatarUrl: null,
            isAgent: false,
          }
        : null,
      metadata: {
        status: email.status,
        openCount: email.openCount,
        clickCount: email.clickCount,
        hasAttachments: email.attachments.length > 0,
        attachmentCount: email.attachments.length,
        ccEmails: email.ccEmails,
        bccEmails: email.bccEmails,
      },
      isOverdue: false,
      agentAction: null,
      document: null,
      appointment: null,
      task: null,
    }));
  }

  /**
   * Get chat/WhatsApp message events for a case
   *
   * Fetches chat messages from conversations linked to contacts
   */
  async getChatEvents(options: {
    caseId?: string;
    contactId?: string;
    channel?: CommunicationChannelValue;
    fromDate?: Date;
    toDate?: Date;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }): Promise<TimelineEvent[]> {
    const { contactId, channel, fromDate, toDate, sortOrder = 'desc', limit = 50 } = options;

    // Build conversation where clause
    const conversationWhere: any = {};

    if (contactId) {
      conversationWhere.contactId = contactId;
    }

    if (channel) {
      // Map our channel to ChatChannel enum
      const channelMap: Record<string, string> = {
        whatsapp: 'WHATSAPP',
        teams: 'TEAMS',
        slack: 'SLACK',
        webchat: 'WEBCHAT',
        internal: 'INTERNAL',
      };
      conversationWhere.channel = channelMap[channel] || channel.toUpperCase();
    }

    // Find conversations
    const conversations = await this.prisma.chatConversation.findMany({
      where: conversationWhere,
      select: { id: true },
    });

    if (conversations.length === 0) {
      return [];
    }

    // Build message where clause
    const messageWhere: any = {
      conversationId: { in: conversations.map((c) => c.id) },
    };

    if (fromDate || toDate) {
      messageWhere.createdAt = {};
      if (fromDate) messageWhere.createdAt.gte = fromDate;
      if (toDate) messageWhere.createdAt.lte = toDate;
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: messageWhere,
      include: {
        conversation: {
          select: {
            channel: true,
            contactId: true,
            contactName: true,
            contactEmail: true,
          },
        },
      },
      orderBy: { createdAt: sortOrder },
      take: limit,
    });

    return messages.map((msg) => {
      // Determine channel from conversation
      const msgChannel = msg.conversation.channel?.toLowerCase() || 'chat';

      return {
        id: `chat-${msg.id}`,
        type: TimelineEventType.COMMUNICATION,
        title:
          msg.senderType === 'contact'
            ? `Message from ${msg.conversation.contactName || 'Contact'}`
            : `Message to ${msg.conversation.contactName || 'Contact'}`,
        description: msg.content?.substring(0, 200) || null,
        timestamp: msg.createdAt,
        priority: null,
        entityType: 'chat_message',
        entityId: msg.id,
        communication: {
          channel: (msgChannel === 'whatsapp' ? 'whatsapp' : 'other') as 'whatsapp' | 'other',
          direction: (msg.senderType === 'contact' ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
          from: msg.senderType === 'contact' ? (msg.conversation.contactEmail || undefined) : undefined,
          to: msg.senderType !== 'contact' ? (msg.conversation.contactEmail || undefined) : undefined,
        },
        actor:
          msg.senderType === 'user' || msg.senderType === 'bot'
            ? {
                id: msg.senderId || 'system',
                name: msg.senderName || null,
                email: null,
                avatarUrl: null,
                isAgent: msg.senderType === 'bot',
              }
            : null,
        metadata: {
          senderType: msg.senderType,
          channel: msgChannel,
          isRead: msg.isRead,
          readAt: msg.readAt,
          attachments: msg.attachments,
          conversationId: msg.conversationId,
        },
        isOverdue: false,
        agentAction: null,
        document: null,
        appointment: null,
        task: null,
      };
    });
  }

  /**
   * Get call record events for a case
   *
   * Fetches call logs linked to contacts
   */
  async getCallEvents(options: {
    caseId?: string;
    contactId?: string;
    dealId?: string;
    ticketId?: string;
    fromDate?: Date;
    toDate?: Date;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }): Promise<TimelineEvent[]> {
    const {
      contactId,
      dealId,
      ticketId,
      fromDate,
      toDate,
      sortOrder = 'desc',
      limit = 50,
    } = options;

    // Build where clause
    const where: any = {};

    if (contactId) {
      where.contactId = contactId;
    }

    if (dealId) {
      where.dealId = dealId;
    }

    if (ticketId) {
      where.ticketId = ticketId;
    }

    // Date filters
    if (fromDate || toDate) {
      where.startedAt = {};
      if (fromDate) where.startedAt.gte = fromDate;
      if (toDate) where.startedAt.lte = toDate;
    }

    const calls = await this.prisma.callRecord.findMany({
      where,
      orderBy: { startedAt: sortOrder },
      take: limit,
    });

    return calls.map((call) => ({
      id: `call-${call.id}`,
      type: TimelineEventType.CALL,
      title:
        call.direction === 'inbound'
          ? `Incoming call from ${call.contactName || call.fromNumber}`
          : `Outgoing call to ${call.contactName || call.toNumber}`,
      description: call.summary || call.notes || null,
      timestamp: call.startedAt,
      priority: null,
      entityType: 'call',
      entityId: call.id,
      communication: {
        channel: 'phone' as const,
        direction: call.direction as 'inbound' | 'outbound',
        from: call.fromNumber,
        to: call.toNumber,
      },
      actor: call.userId
        ? {
            id: call.userId,
            name: call.userName,
            email: null,
            avatarUrl: null,
            isAgent: false,
          }
        : null,
      metadata: {
        duration: call.duration,
        outcome: call.outcome,
        status: call.status,
        hasRecording: !!call.recordingUrl,
        transcription: call.transcription,
        sentiment: call.sentiment,
      },
      isOverdue: false,
      agentAction: null,
      document: null,
      appointment: null,
      task: null,
    }));
  }

  /**
   * Get document audit events for a case
   *
   * Fetches document version history and access events
   */
  async getDocumentAuditEvents(options: {
    caseId: string;
    documentId?: string;
    fromDate?: Date;
    toDate?: Date;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }): Promise<TimelineEvent[]> {
    const { caseId, documentId, fromDate, toDate, sortOrder = 'desc', limit = 50 } = options;

    // First get documents for this case
    const documentWhere: any = {
      related_case_id: caseId,
      deleted_at: null,
    };

    if (documentId) {
      documentWhere.id = documentId;
    }

    const documents = await this.prisma.caseDocument.findMany({
      where: documentWhere,
      select: { id: true },
    });

    if (documents.length === 0) {
      return [];
    }

    // Build audit log where clause
    const auditWhere: any = {
      document_id: { in: documents.map((d) => d.id) },
    };

    if (fromDate || toDate) {
      auditWhere.created_at = {};
      if (fromDate) auditWhere.created_at.gte = fromDate;
      if (toDate) auditWhere.created_at.lte = toDate;
    }

    const auditLogs = await this.prisma.caseDocumentAudit.findMany({
      where: auditWhere,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            version_major: true,
            version_minor: true,
            version_patch: true,
            mime_type: true,
          },
        },
      },
      orderBy: { created_at: sortOrder },
      take: limit,
    });

    return auditLogs.map((log) => {
      // Determine event type based on audit event_type
      let eventType: (typeof TimelineEventType)[keyof typeof TimelineEventType] =
        TimelineEventType.DOCUMENT;
      if (log.event_type?.includes('VERSION') || log.event_type?.includes('UPDATED')) {
        eventType = TimelineEventType.DOCUMENT_VERSION;
      }

      const version = log.document
        ? `${log.document.version_major}.${log.document.version_minor}.${log.document.version_patch}`
        : null;

      return {
        id: `doc-audit-${log.id}`,
        type: eventType,
        title: `${log.event_type}: ${log.document?.title || 'Document'}`,
        description: null,
        timestamp: log.created_at,
        priority: null,
        entityType: 'document_audit',
        entityId: log.id,
        document: log.document
          ? {
              documentId: log.document.id,
              filename: log.document.title,
              version: log.document.version_major,
              mimeType: log.document.mime_type,
            }
          : null,
        actor: {
          id: log.user_id,
          name: null,
          email: null,
          avatarUrl: null,
          isAgent: false,
        },
        metadata: {
          eventType: log.event_type,
          changes: log.changes,
          ipAddress: log.ip_address,
          userAgent: log.user_agent,
          version,
        },
        isOverdue: false,
        agentAction: null,
        communication: null,
        appointment: null,
        task: null,
      };
    });
  }

  /**
   * Get all communication events for a case
   *
   * Aggregates emails, chats, and calls into a single timeline
   */
  async getAllCommunicationEvents(options: {
    caseId?: string;
    contactId?: string;
    dealId?: string;
    fromDate?: Date;
    toDate?: Date;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    includeEmails?: boolean;
    includeChats?: boolean;
    includeCalls?: boolean;
  }): Promise<TimelineEvent[]> {
    const {
      caseId,
      contactId,
      dealId,
      fromDate,
      toDate,
      sortOrder = 'desc',
      limit = 100,
      includeEmails = true,
      includeChats = true,
      includeCalls = true,
    } = options;

    const events: TimelineEvent[] = [];

    // Parallel fetch for performance
    const promises: Promise<TimelineEvent[]>[] = [];

    if (includeEmails) {
      promises.push(
        this.getEmailEvents({
          caseId,
          contactId,
          dealId,
          fromDate,
          toDate,
          sortOrder,
          limit: Math.ceil(limit / 3),
        })
      );
    }

    if (includeChats) {
      promises.push(
        this.getChatEvents({
          caseId,
          contactId,
          fromDate,
          toDate,
          sortOrder,
          limit: Math.ceil(limit / 3),
        })
      );
    }

    if (includeCalls) {
      promises.push(
        this.getCallEvents({
          caseId,
          contactId,
          dealId,
          fromDate,
          toDate,
          sortOrder,
          limit: Math.ceil(limit / 3),
        })
      );
    }

    const results = await Promise.all(promises);

    for (const result of results) {
      events.push(...result);
    }

    // Sort combined results
    events.sort((a, b) => {
      const timeA = a.timestamp.getTime();
      const timeB = b.timestamp.getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    // Apply final limit
    return events.slice(0, limit);
  }
}

/**
 * Factory function to create timeline communication service
 */
export function createTimelineCommunicationService(
  prisma: PrismaClient
): TimelineCommunicationService {
  return new TimelineCommunicationService(prisma);
}

/**
 * Default export for easy import
 */
export default TimelineCommunicationService;
