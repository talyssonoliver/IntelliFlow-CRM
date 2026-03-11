import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaActivityFeedRepository } from '../PrismaActivityFeedRepository';
import type { UnifiedActivityItem } from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrismaLeadActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'la-1',
    leadId: 'lead-1',
    type: 'EMAIL',
    title: 'Follow-up email',
    description: 'Sent quarterly report',
    timestamp: new Date('2026-01-15T10:00:00Z'),
    userId: 'user-1',
    userName: 'John Doe',
    sentiment: null,
    metadata: null,
    tenantId: 'tenant-1',
    lead: { id: 'lead-1', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com' },
    ...overrides,
  };
}

function makePrismaContactActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ca-1',
    type: 'CALL',
    title: 'Discovery call',
    description: 'Discussed project needs',
    timestamp: new Date('2026-01-14T09:00:00Z'),
    userId: 'user-1',
    userName: 'Alice Manager',
    sentiment: null,
    metadata: null,
    tenantId: 'tenant-1',
    contactId: 'contact-1',
    contact: { id: 'contact-1', firstName: 'Bob', lastName: 'Wilson', email: 'bob@test.com' },
    ...overrides,
  };
}

function makePrismaActivityEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ae-1',
    type: 'NOTE',
    title: 'Meeting notes added',
    description: 'Quarterly review summary',
    timestamp: new Date('2026-01-13T08:00:00Z'),
    dateLabel: null,
    attachmentName: null,
    attachmentType: null,
    stageFrom: null,
    stageTo: null,
    agentActionId: null,
    agentName: null,
    confidenceScore: null,
    agentStatus: null,
    opportunityId: 'opp-1',
    opportunity: { id: 'opp-1', name: 'Big Deal' },
    userId: 'user-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function makePrismaTicketActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ta-1',
    type: 'CUSTOMER_MESSAGE',
    content: 'Having trouble with login',
    timestamp: new Date('2026-01-12T07:00:00Z'),
    isInternal: false,
    authorName: 'Customer Support',
    authorRole: 'Support Agent',
    authorAvatar: null,
    channel: 'PORTAL',
    isAIGenerated: false,
    aiConfidence: null,
    systemEventType: null,
    systemEventData: null,
    tenantId: 'tenant-1',
    ticketId: 'ticket-1',
    ticket: { id: 'ticket-1', subject: 'Login issue', ticketNumber: 'TK-001' },
    ...overrides,
  };
}

function makePrismaEmailRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'er-1',
    subject: 'Proposal attached',
    fromEmail: 'sales@company.com',
    toEmail: 'client@example.com',
    body: 'Please find the proposal',
    status: 'SENT',
    openCount: 0,
    clickCount: 0,
    createdAt: new Date('2026-01-11T06:00:00Z'),
    userId: 'user-1',
    contactId: 'contact-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function makePrismaCallRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr-1',
    direction: 'outbound',
    contactName: 'Bob Wilson',
    toNumber: '+1234567890',
    userName: 'John Doe',
    userId: 'user-1',
    summary: 'Discussed pricing options',
    outcome: 'POSITIVE',
    notes: null,
    duration: 300,
    status: 'COMPLETED',
    sentiment: 'POSITIVE',
    startedAt: new Date('2026-01-10T05:00:00Z'),
    contactId: 'contact-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function makePrismaChatMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cm-1',
    content: 'Hello, I need help with integration',
    createdAt: new Date('2026-01-09T04:00:00Z'),
    senderId: 'user-1',
    senderName: 'Customer',
    metadata: null,
    tenantId: 'tenant-1',
    conversation: { id: 'conv-1', contactName: 'Bob Wilson', contactId: 'contact-1', subject: 'Integration help' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    leadActivity: { findMany: vi.fn().mockResolvedValue([]) },
    contactActivity: { findMany: vi.fn().mockResolvedValue([]) },
    activityEvent: { findMany: vi.fn().mockResolvedValue([]) },
    ticketActivity: { findMany: vi.fn().mockResolvedValue([]) },
    emailRecord: { findMany: vi.fn().mockResolvedValue([]) },
    callRecord: { findMany: vi.fn().mockResolvedValue([]) },
    chatMessage: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaActivityFeedRepository.searchFeed', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let repo: PrismaActivityFeedRepository;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    repo = new PrismaActivityFeedRepository(mockPrisma);
  });

  it('searches LeadActivity by title, description, userName using ILIKE', async () => {
    mockPrisma.leadActivity.findMany.mockResolvedValue([makePrismaLeadActivity()]);
    await repo.searchFeed(tenantId, 'email', 20, null, {});

    const call = mockPrisma.leadActivity.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(tenantId);
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: { contains: 'email', mode: 'insensitive' } }),
        expect.objectContaining({ description: { contains: 'email', mode: 'insensitive' } }),
        expect.objectContaining({ userName: { contains: 'email', mode: 'insensitive' } }),
      ])
    );
  });

  it('searches ContactActivity by title, description, userName', async () => {
    mockPrisma.contactActivity.findMany.mockResolvedValue([makePrismaContactActivity()]);
    await repo.searchFeed(tenantId, 'call', 20, null, {});

    const call = mockPrisma.contactActivity.findMany.mock.calls[0][0];
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: { contains: 'call', mode: 'insensitive' } }),
        expect.objectContaining({ description: { contains: 'call', mode: 'insensitive' } }),
        expect.objectContaining({ userName: { contains: 'call', mode: 'insensitive' } }),
      ])
    );
  });

  it('searches ActivityEvent (opportunity) by title, description', async () => {
    mockPrisma.activityEvent.findMany.mockResolvedValue([makePrismaActivityEvent()]);
    await repo.searchFeed(tenantId, 'meeting', 20, null, {});

    const call = mockPrisma.activityEvent.findMany.mock.calls[0][0];
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: { contains: 'meeting', mode: 'insensitive' } }),
        expect.objectContaining({ description: { contains: 'meeting', mode: 'insensitive' } }),
      ])
    );
  });

  it('searches TicketActivity by content, authorName', async () => {
    mockPrisma.ticketActivity.findMany.mockResolvedValue([makePrismaTicketActivity()]);
    await repo.searchFeed(tenantId, 'login', 20, null, {});

    const call = mockPrisma.ticketActivity.findMany.mock.calls[0][0];
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: { contains: 'login', mode: 'insensitive' } }),
        expect.objectContaining({ authorName: { contains: 'login', mode: 'insensitive' } }),
      ])
    );
  });

  it('searches EmailRecord by subject, fromEmail, toEmail', async () => {
    mockPrisma.emailRecord.findMany.mockResolvedValue([makePrismaEmailRecord()]);
    await repo.searchFeed(tenantId, 'proposal', 20, null, {});

    const call = mockPrisma.emailRecord.findMany.mock.calls[0][0];
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: { contains: 'proposal', mode: 'insensitive' } }),
        expect.objectContaining({ fromEmail: { contains: 'proposal', mode: 'insensitive' } }),
        expect.objectContaining({ toEmail: { contains: 'proposal', mode: 'insensitive' } }),
      ])
    );
  });

  it('searches CallRecord by contactName, userName, summary', async () => {
    mockPrisma.callRecord.findMany.mockResolvedValue([makePrismaCallRecord()]);
    await repo.searchFeed(tenantId, 'pricing', 20, null, {});

    const call = mockPrisma.callRecord.findMany.mock.calls[0][0];
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contactName: { contains: 'pricing', mode: 'insensitive' } }),
        expect.objectContaining({ userName: { contains: 'pricing', mode: 'insensitive' } }),
        expect.objectContaining({ summary: { contains: 'pricing', mode: 'insensitive' } }),
      ])
    );
  });

  it('searches ChatMessage by content', async () => {
    mockPrisma.chatMessage.findMany.mockResolvedValue([makePrismaChatMessage()]);
    await repo.searchFeed(tenantId, 'integration', 20, null, {});

    const call = mockPrisma.chatMessage.findMany.mock.calls[0][0];
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: { contains: 'integration', mode: 'insensitive' } }),
      ])
    );
  });

  it('enforces tenant isolation in all queries', async () => {
    await repo.searchFeed(tenantId, 'test', 20, null, {});

    expect(mockPrisma.leadActivity.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
    expect(mockPrisma.contactActivity.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
    expect(mockPrisma.activityEvent.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
    expect(mockPrisma.ticketActivity.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
    expect(mockPrisma.emailRecord.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
    expect(mockPrisma.callRecord.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
    expect(mockPrisma.chatMessage.findMany.mock.calls[0][0].where.tenantId).toBe(tenantId);
  });

  it('applies cursor condition when cursor provided', async () => {
    const cursor = { timestamp: new Date('2026-01-15T00:00:00Z'), id: 'cursor-id' };
    await repo.searchFeed(tenantId, 'test', 20, cursor, {});

    const call = mockPrisma.leadActivity.findMany.mock.calls[0][0];
    // AND[0] = search conditions, AND[1] = cursor conditions
    expect(call.where.AND).toHaveLength(2);
    expect(call.where.AND[0].OR).toBeDefined(); // search ILIKE conditions
    expect(call.where.AND[1].OR).toBeDefined(); // cursor pagination conditions
  });

  it('respects source filtering', async () => {
    await repo.searchFeed(tenantId, 'test', 20, null, { sources: ['LEAD_ACTIVITY', 'EMAIL'] });

    expect(mockPrisma.leadActivity.findMany).toHaveBeenCalled();
    expect(mockPrisma.emailRecord.findMany).toHaveBeenCalled();
    // These should NOT be called
    expect(mockPrisma.contactActivity.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.activityEvent.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.ticketActivity.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.callRecord.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array when no matches found', async () => {
    const result = await repo.searchFeed(tenantId, 'nonexistent', 20, null, {});
    expect(result).toEqual([]);
  });

  it('sorts results by timestamp DESC', async () => {
    const older = makePrismaLeadActivity({ id: 'la-old', timestamp: new Date('2026-01-01') });
    const newer = makePrismaContactActivity({ id: 'ca-new', timestamp: new Date('2026-01-15') });
    mockPrisma.leadActivity.findMany.mockResolvedValue([older]);
    mockPrisma.contactActivity.findMany.mockResolvedValue([newer]);

    const result = await repo.searchFeed(tenantId, 'test', 20, null, {});
    expect(result.length).toBe(2);
    expect(result[0].timestamp.getTime()).toBeGreaterThanOrEqual(result[1].timestamp.getTime());
  });

  it('handles nullable fields correctly', async () => {
    // LeadActivity with null description
    const activity = makePrismaLeadActivity({ description: null });
    mockPrisma.leadActivity.findMany.mockResolvedValue([activity]);

    const result = await repo.searchFeed(tenantId, 'email', 20, null, {});
    // Should not throw — Prisma handles null correctly with contains
    expect(result).toBeDefined();
  });
});
