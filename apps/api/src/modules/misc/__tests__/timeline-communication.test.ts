/**
 * Timeline Communication Service Tests - IFC-159
 *
 * Comprehensive tests for the TimelineCommunicationService class.
 * Tests all methods: getEmailEvents, getChatEvents, getCallEvents,
 * getDocumentAuditEvents, getAllCommunicationEvents.
 *
 * This covers the timeline.ts file which has 0% coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TimelineCommunicationService,
  createTimelineCommunicationService,
  CommunicationChannel,
} from '../timeline';
import { TimelineEventType } from '../timeline.router';

// Create a mock PrismaClient
function createMockPrisma() {
  return {
    emailRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    chatConversation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    callRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    caseDocument: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    caseDocumentAudit: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('TimelineCommunicationService', () => {
  let service: TimelineCommunicationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new TimelineCommunicationService(mockPrisma);
  });

  describe('constructor and factory', () => {
    it('should create instance via constructor', () => {
      const svc = new TimelineCommunicationService(mockPrisma);
      expect(svc).toBeInstanceOf(TimelineCommunicationService);
    });

    it('should create instance via factory function', () => {
      const svc = createTimelineCommunicationService(mockPrisma);
      expect(svc).toBeInstanceOf(TimelineCommunicationService);
    });
  });

  describe('CommunicationChannel constants', () => {
    it('should define all channel types', () => {
      expect(CommunicationChannel.EMAIL).toBe('email');
      expect(CommunicationChannel.WHATSAPP).toBe('whatsapp');
      expect(CommunicationChannel.TEAMS).toBe('teams');
      expect(CommunicationChannel.SLACK).toBe('slack');
      expect(CommunicationChannel.PHONE).toBe('phone');
      expect(CommunicationChannel.WEBCHAT).toBe('webchat');
      expect(CommunicationChannel.SMS).toBe('sms');
      expect(CommunicationChannel.INTERNAL).toBe('internal');
    });
  });

  describe('getEmailEvents', () => {
    it('should return empty array when no emails exist', async () => {
      const result = await service.getEmailEvents({ contactId: 'contact-1' });
      expect(result).toEqual([]);
    });

    it('should map emails to timeline events', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Follow up on proposal',
        body: 'Dear client, here is the updated proposal...',
        fromEmail: 'sales@company.com',
        toEmail: 'client@example.com',
        sentAt: new Date('2025-06-01T10:00:00Z'),
        createdAt: new Date('2025-06-01T09:30:00Z'),
        status: 'SENT',
        openCount: 2,
        clickCount: 1,
        userId: 'user-1',
        ccEmails: ['manager@company.com'],
        bccEmails: [],
        attachments: [{ id: 'att-1', name: 'proposal.pdf' }],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({ contactId: 'contact-1' });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('email-email-1');
      expect(result[0]!.type).toBe(TimelineEventType.EMAIL);
      expect(result[0]!.title).toBe('Follow up on proposal');
      expect(result[0]!.description).toBe('Dear client, here is the updated proposal...');
      expect(result[0]!.timestamp).toEqual(mockEmail.sentAt);
      expect(result[0]!.entityType).toBe('email');
      expect(result[0]!.entityId).toBe('email-1');
    });

    it('should set communication direction based on fromEmail', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Test',
        body: null,
        fromEmail: 'user@company.com',
        toEmail: 'client@example.com',
        sentAt: null,
        createdAt: new Date(),
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({});

      expect(result[0]!.communication).toBeDefined();
      expect(result[0]!.communication!.channel).toBe('email');
      // fromEmail contains '@' so direction is outbound
      expect(result[0]!.communication!.direction).toBe('outbound');
    });

    it('should handle emails with no body gracefully', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: null,
        body: null,
        fromEmail: null,
        toEmail: null,
        sentAt: null,
        createdAt: new Date(),
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({});

      expect(result[0]!.title).toBe('Email');
      expect(result[0]!.description).toBeNull();
    });

    it('should filter by contactId', async () => {
      await service.getEmailEvents({ contactId: 'contact-123' });

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: 'contact-123',
          }),
        })
      );
    });

    it('should filter by dealId', async () => {
      await service.getEmailEvents({ dealId: 'deal-123' });

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dealId: 'deal-123',
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      await service.getEmailEvents({ fromDate, toDate });

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should exclude PENDING emails', async () => {
      await service.getEmailEvents({});

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['PENDING'] },
          }),
        })
      );
    });

    it('should respect sort order', async () => {
      await service.getEmailEvents({ sortOrder: 'asc' });

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        })
      );
    });

    it('should respect limit parameter', async () => {
      await service.getEmailEvents({ limit: 10 });

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should include attachments in the query', async () => {
      await service.getEmailEvents({});

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { attachments: true },
        })
      );
    });

    it('should populate metadata with email stats', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Test',
        body: 'Body',
        fromEmail: 'user@test.com',
        toEmail: 'client@test.com',
        sentAt: new Date(),
        createdAt: new Date(),
        status: 'DELIVERED',
        openCount: 3,
        clickCount: 2,
        userId: 'user-1',
        ccEmails: ['cc@test.com'],
        bccEmails: [],
        attachments: [{ id: 'att-1' }],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({});

      expect(result[0]!.metadata!.openCount).toBe(3);
      expect(result[0]!.metadata!.clickCount).toBe(2);
      expect(result[0]!.metadata!.hasAttachments).toBe(true);
      expect(result[0]!.metadata!.attachmentCount).toBe(1);
      expect(result[0]!.metadata!.ccEmails).toEqual(['cc@test.com']);
    });

    it('should set actor when userId is present', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Test',
        body: null,
        fromEmail: 'user@test.com',
        toEmail: null,
        sentAt: null,
        createdAt: new Date(),
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: 'user-123',
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({});

      expect(result[0]!.actor).not.toBeNull();
      expect(result[0]!.actor!.id).toBe('user-123');
      expect(result[0]!.actor!.isAgent).toBe(false);
    });

    it('should set actor to null when userId is not present', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Test',
        body: null,
        fromEmail: null,
        toEmail: null,
        sentAt: null,
        createdAt: new Date(),
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({});

      expect(result[0]!.actor).toBeNull();
    });

    it('should use sentAt as timestamp when available, otherwise createdAt', async () => {
      const sentAt = new Date('2025-06-01T12:00:00Z');
      const createdAt = new Date('2025-06-01T10:00:00Z');
      const mockEmail = {
        id: 'email-1',
        subject: 'Test',
        body: null,
        fromEmail: null,
        toEmail: null,
        sentAt,
        createdAt,
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      const result = await service.getEmailEvents({});
      expect(result[0]!.timestamp).toEqual(sentAt);
    });
  });

  describe('getChatEvents', () => {
    it('should return empty array when no conversations exist', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);

      const result = await service.getChatEvents({ contactId: 'contact-1' });
      expect(result).toEqual([]);
    });

    it('should return empty array when conversations exist but no messages', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);

      const result = await service.getChatEvents({ contactId: 'contact-1' });
      expect(result).toEqual([]);
    });

    it('should map chat messages to timeline events', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const mockMessage = {
        id: 'msg-1',
        content: 'Hello, I need help with my account',
        senderType: 'contact',
        senderId: 'contact-1',
        senderName: 'John Client',
        conversationId: 'conv-1',
        createdAt: new Date('2025-06-01T10:00:00Z'),
        isRead: false,
        readAt: null,
        attachments: [],
        conversation: {
          channel: 'WHATSAPP',
          contactId: 'contact-1',
          contactName: 'John Client',
          contactEmail: 'john@example.com',
        },
      };
      mockPrisma.chatMessage.findMany.mockResolvedValue([mockMessage]);

      const result = await service.getChatEvents({ contactId: 'contact-1' });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('chat-msg-1');
      expect(result[0]!.type).toBe(TimelineEventType.COMMUNICATION);
      expect(result[0]!.title).toBe('Message from John Client');
      expect(result[0]!.description).toBe('Hello, I need help with my account');
      expect(result[0]!.communication!.channel).toBe('whatsapp');
      expect(result[0]!.communication!.direction).toBe('inbound');
    });

    it('should set outbound direction for user/bot messages', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const mockMessage = {
        id: 'msg-1',
        content: 'Sure, let me help',
        senderType: 'user',
        senderId: 'user-1',
        senderName: 'Agent Smith',
        conversationId: 'conv-1',
        createdAt: new Date(),
        isRead: true,
        readAt: new Date(),
        attachments: [],
        conversation: {
          channel: 'WEBCHAT',
          contactId: 'contact-1',
          contactName: 'Client',
          contactEmail: 'client@test.com',
        },
      };
      mockPrisma.chatMessage.findMany.mockResolvedValue([mockMessage]);

      const result = await service.getChatEvents({});

      expect(result[0]!.communication!.direction).toBe('outbound');
      expect(result[0]!.title).toBe('Message to Client');
    });

    it('should filter conversations by channel', async () => {
      await service.getChatEvents({ channel: 'whatsapp' });

      expect(mockPrisma.chatConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channel: 'WHATSAPP',
          }),
        })
      );
    });

    it('should filter messages by date range', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      await service.getChatEvents({ fromDate, toDate });

      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should set actor for user senders', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const mockMessage = {
        id: 'msg-1',
        content: 'Reply',
        senderType: 'user',
        senderId: 'user-1',
        senderName: 'Agent Smith',
        conversationId: 'conv-1',
        createdAt: new Date(),
        isRead: true,
        readAt: null,
        attachments: [],
        conversation: {
          channel: 'INTERNAL',
          contactId: null,
          contactName: null,
          contactEmail: null,
        },
      };
      mockPrisma.chatMessage.findMany.mockResolvedValue([mockMessage]);

      const result = await service.getChatEvents({});

      expect(result[0]!.actor).not.toBeNull();
      expect(result[0]!.actor!.id).toBe('user-1');
      expect(result[0]!.actor!.name).toBe('Agent Smith');
      expect(result[0]!.actor!.isAgent).toBe(false);
    });

    it('should mark bot senders as agents', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const mockMessage = {
        id: 'msg-1',
        content: 'Auto reply',
        senderType: 'bot',
        senderId: 'bot-1',
        senderName: 'Support Bot',
        conversationId: 'conv-1',
        createdAt: new Date(),
        isRead: false,
        readAt: null,
        attachments: [],
        conversation: {
          channel: 'WEBCHAT',
          contactId: null,
          contactName: null,
          contactEmail: null,
        },
      };
      mockPrisma.chatMessage.findMany.mockResolvedValue([mockMessage]);

      const result = await service.getChatEvents({});

      expect(result[0]!.actor!.isAgent).toBe(true);
    });

    it('should include message metadata', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const mockMessage = {
        id: 'msg-1',
        content: 'Hello',
        senderType: 'contact',
        senderId: 'contact-1',
        senderName: null,
        conversationId: 'conv-1',
        createdAt: new Date(),
        isRead: true,
        readAt: new Date(),
        attachments: ['file.pdf'],
        conversation: {
          channel: 'TEAMS',
          contactId: 'contact-1',
          contactName: null,
          contactEmail: null,
        },
      };
      mockPrisma.chatMessage.findMany.mockResolvedValue([mockMessage]);

      const result = await service.getChatEvents({});

      expect(result[0]!.metadata!.senderType).toBe('contact');
      expect(result[0]!.metadata!.channel).toBe('teams');
      expect(result[0]!.metadata!.isRead).toBe(true);
      expect(result[0]!.metadata!.attachments).toEqual(['file.pdf']);
    });
  });

  describe('getCallEvents', () => {
    it('should return empty array when no calls exist', async () => {
      const result = await service.getCallEvents({ contactId: 'contact-1' });
      expect(result).toEqual([]);
    });

    it('should map calls to timeline events', async () => {
      const mockCall = {
        id: 'call-1',
        direction: 'inbound',
        fromNumber: '+1234567890',
        toNumber: '+0987654321',
        contactName: 'John Client',
        summary: 'Discussed pricing options',
        notes: 'Follow up next week',
        startedAt: new Date('2025-06-01T10:00:00Z'),
        duration: 300,
        outcome: 'CONNECTED',
        status: 'COMPLETED',
        recordingUrl: 'https://recording.url/call-1',
        transcription: 'Hello...',
        sentiment: 'POSITIVE',
        userId: 'user-1',
        userName: 'Agent Smith',
      };
      mockPrisma.callRecord.findMany.mockResolvedValue([mockCall]);

      const result = await service.getCallEvents({});

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('call-call-1');
      expect(result[0]!.type).toBe(TimelineEventType.CALL);
      expect(result[0]!.title).toBe('Incoming call from John Client');
      expect(result[0]!.description).toBe('Discussed pricing options');
      expect(result[0]!.communication!.channel).toBe('phone');
      expect(result[0]!.communication!.direction).toBe('inbound');
      expect(result[0]!.communication!.from).toBe('+1234567890');
      expect(result[0]!.communication!.to).toBe('+0987654321');
    });

    it('should set outbound title for outgoing calls', async () => {
      const mockCall = {
        id: 'call-1',
        direction: 'outbound',
        fromNumber: '+0987654321',
        toNumber: '+1234567890',
        contactName: null,
        summary: null,
        notes: null,
        startedAt: new Date(),
        duration: 120,
        outcome: 'VOICEMAIL',
        status: 'COMPLETED',
        recordingUrl: null,
        transcription: null,
        sentiment: null,
        userId: null,
        userName: null,
      };
      mockPrisma.callRecord.findMany.mockResolvedValue([mockCall]);

      const result = await service.getCallEvents({});

      expect(result[0]!.title).toBe('Outgoing call to +1234567890');
    });

    it('should filter by contactId', async () => {
      await service.getCallEvents({ contactId: 'contact-123' });

      expect(mockPrisma.callRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: 'contact-123',
          }),
        })
      );
    });

    it('should filter by dealId', async () => {
      await service.getCallEvents({ dealId: 'deal-123' });

      expect(mockPrisma.callRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dealId: 'deal-123',
          }),
        })
      );
    });

    it('should filter by ticketId', async () => {
      await service.getCallEvents({ ticketId: 'ticket-123' });

      expect(mockPrisma.callRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ticketId: 'ticket-123',
          }),
        })
      );
    });

    it('should filter by date range using startedAt', async () => {
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      await service.getCallEvents({ fromDate, toDate });

      expect(mockPrisma.callRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startedAt: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should populate call metadata', async () => {
      const mockCall = {
        id: 'call-1',
        direction: 'inbound',
        fromNumber: '+1111111111',
        toNumber: '+2222222222',
        contactName: 'Client',
        summary: null,
        notes: 'Important notes',
        startedAt: new Date(),
        duration: 600,
        outcome: 'CONNECTED',
        status: 'COMPLETED',
        recordingUrl: 'https://rec.url',
        transcription: 'Transcript text',
        sentiment: 'NEUTRAL',
        userId: 'user-1',
        userName: 'Agent',
      };
      mockPrisma.callRecord.findMany.mockResolvedValue([mockCall]);

      const result = await service.getCallEvents({});

      expect(result[0]!.metadata!.duration).toBe(600);
      expect(result[0]!.metadata!.outcome).toBe('CONNECTED');
      expect(result[0]!.metadata!.hasRecording).toBe(true);
      expect(result[0]!.metadata!.transcription).toBe('Transcript text');
      expect(result[0]!.metadata!.sentiment).toBe('NEUTRAL');
    });

    it('should set actor when userId is present', async () => {
      const mockCall = {
        id: 'call-1',
        direction: 'outbound',
        fromNumber: '+111',
        toNumber: '+222',
        contactName: null,
        summary: null,
        notes: null,
        startedAt: new Date(),
        duration: 30,
        outcome: 'NO_ANSWER',
        status: 'COMPLETED',
        recordingUrl: null,
        transcription: null,
        sentiment: null,
        userId: 'user-456',
        userName: 'Agent Jane',
      };
      mockPrisma.callRecord.findMany.mockResolvedValue([mockCall]);

      const result = await service.getCallEvents({});

      expect(result[0]!.actor).not.toBeNull();
      expect(result[0]!.actor!.id).toBe('user-456');
      expect(result[0]!.actor!.name).toBe('Agent Jane');
    });

    it('should use notes as description when summary is null', async () => {
      const mockCall = {
        id: 'call-1',
        direction: 'inbound',
        fromNumber: '+111',
        toNumber: '+222',
        contactName: 'Client',
        summary: null,
        notes: 'Some call notes',
        startedAt: new Date(),
        duration: 60,
        outcome: 'CONNECTED',
        status: 'COMPLETED',
        recordingUrl: null,
        transcription: null,
        sentiment: null,
        userId: null,
        userName: null,
      };
      mockPrisma.callRecord.findMany.mockResolvedValue([mockCall]);

      const result = await service.getCallEvents({});

      expect(result[0]!.description).toBe('Some call notes');
    });
  });

  describe('getDocumentAuditEvents', () => {
    it('should return empty array when no documents exist for case', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });
      expect(result).toEqual([]);
    });

    it('should return empty array when documents exist but no audit logs', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      mockPrisma.caseDocumentAudit.findMany.mockResolvedValue([]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });
      expect(result).toEqual([]);
    });

    it('should map audit logs to timeline events', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const mockAuditLog = {
        id: 'audit-1',
        event_type: 'CREATED',
        user_id: 'user-1',
        created_at: new Date('2025-06-01T10:00:00Z'),
        changes: { title: 'Document title' },
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        document_id: 'doc-1',
        document: {
          id: 'doc-1',
          title: 'Contract Agreement',
          version_major: 1,
          version_minor: 2,
          version_patch: 0,
          mime_type: 'application/pdf',
        },
      };
      mockPrisma.caseDocumentAudit.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('doc-audit-audit-1');
      expect(result[0]!.type).toBe(TimelineEventType.DOCUMENT);
      expect(result[0]!.title).toBe('CREATED: Contract Agreement');
      expect(result[0]!.document).not.toBeNull();
      expect(result[0]!.document!.documentId).toBe('doc-1');
      expect(result[0]!.document!.filename).toBe('Contract Agreement');
      expect(result[0]!.document!.version).toBe(1);
      expect(result[0]!.document!.mimeType).toBe('application/pdf');
    });

    it('should use DOCUMENT_VERSION type for version/update events', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const mockAuditLog = {
        id: 'audit-1',
        event_type: 'VERSION_CREATED',
        user_id: 'user-1',
        created_at: new Date(),
        changes: null,
        ip_address: null,
        user_agent: null,
        document_id: 'doc-1',
        document: {
          id: 'doc-1',
          title: 'Doc',
          version_major: 2,
          version_minor: 0,
          version_patch: 0,
          mime_type: 'text/plain',
        },
      };
      mockPrisma.caseDocumentAudit.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });

      expect(result[0]!.type).toBe(TimelineEventType.DOCUMENT_VERSION);
    });

    it('should use DOCUMENT_VERSION type for UPDATED events', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const mockAuditLog = {
        id: 'audit-1',
        event_type: 'CONTENT_UPDATED',
        user_id: 'user-1',
        created_at: new Date(),
        changes: null,
        ip_address: null,
        user_agent: null,
        document: {
          id: 'doc-1',
          title: 'Doc',
          version_major: 1,
          version_minor: 1,
          version_patch: 0,
          mime_type: 'application/pdf',
        },
      };
      mockPrisma.caseDocumentAudit.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });

      expect(result[0]!.type).toBe(TimelineEventType.DOCUMENT_VERSION);
    });

    it('should filter by specific documentId', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);

      await service.getDocumentAuditEvents({
        caseId: 'case-1',
        documentId: 'doc-specific',
      });

      expect(mockPrisma.caseDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'doc-specific',
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      await service.getDocumentAuditEvents({ caseId: 'case-1', fromDate, toDate });

      expect(mockPrisma.caseDocumentAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: { gte: fromDate, lte: toDate },
          }),
        })
      );
    });

    it('should set actor with user_id', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const mockAuditLog = {
        id: 'audit-1',
        event_type: 'VIEWED',
        user_id: 'user-123',
        created_at: new Date(),
        changes: null,
        ip_address: null,
        user_agent: null,
        document: null,
      };
      mockPrisma.caseDocumentAudit.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });

      expect(result[0]!.actor).not.toBeNull();
      expect(result[0]!.actor!.id).toBe('user-123');
    });

    it('should include metadata with IP address and user agent', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      const mockAuditLog = {
        id: 'audit-1',
        event_type: 'DOWNLOADED',
        user_id: 'user-1',
        created_at: new Date(),
        changes: { field: 'value' },
        ip_address: '10.0.0.1',
        user_agent: 'Chrome/120',
        document: {
          id: 'doc-1',
          title: 'Doc',
          version_major: 1,
          version_minor: 0,
          version_patch: 3,
          mime_type: 'application/pdf',
        },
      };
      mockPrisma.caseDocumentAudit.findMany.mockResolvedValue([mockAuditLog]);

      const result = await service.getDocumentAuditEvents({ caseId: 'case-1' });

      expect(result[0]!.metadata!.ipAddress).toBe('10.0.0.1');
      expect(result[0]!.metadata!.userAgent).toBe('Chrome/120');
      expect(result[0]!.metadata!.changes).toEqual({ field: 'value' });
      expect(result[0]!.metadata!.version).toBe('1.0.3');
    });

    it('should exclude deleted documents', async () => {
      await service.getDocumentAuditEvents({ caseId: 'case-1' });

      expect(mockPrisma.caseDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deleted_at: null,
          }),
        })
      );
    });
  });

  describe('getAllCommunicationEvents', () => {
    it('should aggregate emails, chats, and calls', async () => {
      // Set up email mock
      const emailCreatedAt = new Date('2025-06-01T10:00:00Z');
      const mockEmail = {
        id: 'email-1',
        subject: 'Test email',
        body: 'Body',
        fromEmail: 'a@b.com',
        toEmail: 'c@d.com',
        sentAt: emailCreatedAt,
        createdAt: emailCreatedAt,
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      };
      mockPrisma.emailRecord.findMany.mockResolvedValue([mockEmail]);

      // Chat conversations and messages
      mockPrisma.chatConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const chatCreatedAt = new Date('2025-06-01T11:00:00Z');
      const mockMessage = {
        id: 'msg-1',
        content: 'Chat msg',
        senderType: 'contact',
        senderId: 'contact-1',
        senderName: null,
        conversationId: 'conv-1',
        createdAt: chatCreatedAt,
        isRead: false,
        readAt: null,
        attachments: [],
        conversation: {
          channel: 'WEBCHAT',
          contactId: 'contact-1',
          contactName: null,
          contactEmail: null,
        },
      };
      mockPrisma.chatMessage.findMany.mockResolvedValue([mockMessage]);

      // Call records
      const callCreatedAt = new Date('2025-06-01T09:00:00Z');
      const mockCall = {
        id: 'call-1',
        direction: 'outbound',
        fromNumber: '+111',
        toNumber: '+222',
        contactName: null,
        summary: null,
        notes: null,
        startedAt: callCreatedAt,
        duration: 60,
        outcome: 'CONNECTED',
        status: 'COMPLETED',
        recordingUrl: null,
        transcription: null,
        sentiment: null,
        userId: null,
        userName: null,
      };
      mockPrisma.callRecord.findMany.mockResolvedValue([mockCall]);

      const result = await service.getAllCommunicationEvents({
        contactId: 'contact-1',
      });

      expect(result).toHaveLength(3);
      // Default sort is desc
      expect(result[0]!.id).toBe('chat-msg-1'); // 11:00
      expect(result[1]!.id).toBe('email-email-1'); // 10:00
      expect(result[2]!.id).toBe('call-call-1'); // 09:00
    });

    it('should respect includeEmails flag', async () => {
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);
      mockPrisma.callRecord.findMany.mockResolvedValue([]);

      await service.getAllCommunicationEvents({
        includeEmails: false,
        includeChats: true,
        includeCalls: true,
      });

      expect(mockPrisma.emailRecord.findMany).not.toHaveBeenCalled();
    });

    it('should respect includeChats flag', async () => {
      mockPrisma.emailRecord.findMany.mockResolvedValue([]);
      mockPrisma.callRecord.findMany.mockResolvedValue([]);

      await service.getAllCommunicationEvents({
        includeChats: false,
      });

      expect(mockPrisma.chatConversation.findMany).not.toHaveBeenCalled();
    });

    it('should respect includeCalls flag', async () => {
      mockPrisma.emailRecord.findMany.mockResolvedValue([]);
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);

      await service.getAllCommunicationEvents({
        includeCalls: false,
      });

      expect(mockPrisma.callRecord.findMany).not.toHaveBeenCalled();
    });

    it('should sort in ascending order when specified', async () => {
      const emailCreatedAt = new Date('2025-06-01T10:00:00Z');
      const callCreatedAt = new Date('2025-06-01T09:00:00Z');

      mockPrisma.emailRecord.findMany.mockResolvedValue([{
        id: 'email-1',
        subject: 'Test',
        body: null,
        fromEmail: null,
        toEmail: null,
        sentAt: emailCreatedAt,
        createdAt: emailCreatedAt,
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      }]);
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);
      mockPrisma.callRecord.findMany.mockResolvedValue([{
        id: 'call-1',
        direction: 'inbound',
        fromNumber: '+111',
        toNumber: '+222',
        contactName: null,
        summary: null,
        notes: null,
        startedAt: callCreatedAt,
        duration: 30,
        outcome: 'CONNECTED',
        status: 'COMPLETED',
        recordingUrl: null,
        transcription: null,
        sentiment: null,
        userId: null,
        userName: null,
      }]);

      const result = await service.getAllCommunicationEvents({
        sortOrder: 'asc',
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('call-call-1'); // 09:00 first
      expect(result[1]!.id).toBe('email-email-1'); // 10:00 second
    });

    it('should apply final limit to combined results', async () => {
      // Create many emails
      const emails = Array.from({ length: 10 }, (_, i) => ({
        id: `email-${i}`,
        subject: `Email ${i}`,
        body: null,
        fromEmail: null,
        toEmail: null,
        sentAt: new Date(2025, 5, 1, i),
        createdAt: new Date(2025, 5, 1, i),
        status: 'SENT',
        openCount: 0,
        clickCount: 0,
        userId: null,
        ccEmails: [],
        bccEmails: [],
        attachments: [],
      }));
      mockPrisma.emailRecord.findMany.mockResolvedValue(emails);
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);
      mockPrisma.callRecord.findMany.mockResolvedValue([]);

      const result = await service.getAllCommunicationEvents({
        limit: 5,
      });

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should default all include flags to true', async () => {
      mockPrisma.emailRecord.findMany.mockResolvedValue([]);
      mockPrisma.chatConversation.findMany.mockResolvedValue([]);
      mockPrisma.callRecord.findMany.mockResolvedValue([]);

      await service.getAllCommunicationEvents({});

      expect(mockPrisma.emailRecord.findMany).toHaveBeenCalled();
      expect(mockPrisma.chatConversation.findMany).toHaveBeenCalled();
      expect(mockPrisma.callRecord.findMany).toHaveBeenCalled();
    });
  });
});
