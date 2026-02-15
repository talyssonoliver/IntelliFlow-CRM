import { describe, expect, it } from 'vitest';
import { mapTicketListItems, mapTicketToDetailData, mapTicketToListItem } from '../ticket-detail-mapper';

describe('mapTicketToDetailData', () => {
  it('builds a safe detail model when SLA object is missing', () => {
    const mapped = mapTicketToDetailData({
      id: 'ticket-1',
      ticketNumber: 'T-00001',
      subject: 'Production issue',
      status: 'OPEN',
      priority: 'HIGH',
      contactName: 'Alex Doe',
      contactEmail: 'alex@example.com',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z',
    });

    expect(mapped.sla).toBeDefined();
    expect(mapped.sla.resolution.status).toBe('ON_TRACK');
    expect(mapped.sla.firstResponse.target).toBe(60);
    expect(mapped.activities).toEqual([]);
    expect(mapped.attachments).toEqual([]);
    expect(mapped.customer.name).toBe('Alex Doe');
    expect(mapped.aiInsights.predictedResolutionTime).not.toBe('Unknown');
  });

  it('maps ticket service fields into TicketDetailData shape', () => {
    const mapped = mapTicketToDetailData({
      id: 'ticket-2',
      ticketNumber: 'T-00002',
      subject: 'API timeouts',
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      slaStatus: 'AT_RISK',
      slaPolicy: {
        criticalResponseMinutes: 15,
        criticalResolutionMinutes: 120,
      },
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z',
      firstResponseAt: '2026-02-10T10:05:00.000Z',
      slaResponseDue: '2026-02-10T10:15:00.000Z',
      slaResolutionDue: '2026-02-10T12:00:00.000Z',
      contactName: 'Jordan Kim',
      contactEmail: 'jordan@example.com',
      activities: [
        {
          id: 'act-1',
          type: 'AGENT_REPLY',
          content: 'Initial troubleshooting complete',
          authorName: 'Sarah Agent',
          authorRole: 'Support Agent',
          timestamp: '2026-02-10T10:06:00.000Z',
          channel: 'PORTAL',
        },
      ],
      attachments: [
        {
          id: 'att-1',
          name: 'debug-log.pdf',
          size: '1.2 MB',
          fileType: 'PDF',
        },
      ],
      aiInsight: {
        suggestedSolutions: ['Scale worker pool', 'Review DB locks'],
        sentiment: 'negative',
        predictedResolutionTime: '1-2 hours',
        similarResolvedTickets: 4,
        escalationRisk: 'high',
      },
    });

    expect(mapped.sla.resolution.status).toBe('AT_RISK');
    expect(mapped.sla.firstResponse.actual).toBe(5);
    expect(mapped.sla.firstResponse.met).toBe(true);
    expect(mapped.activities[0]?.type).toBe('agent_reply');
    expect(mapped.attachments[0]?.type).toBe('pdf');
    expect(mapped.aiInsights.suggestedSolutions).toEqual(['Scale worker pool', 'Review DB locks']);
    expect(mapped.aiInsights.escalationRisk).toBe('high');
  });

  it('infers first response timing from the earliest AGENT_REPLY activity', () => {
    const mapped = mapTicketToDetailData({
      id: 'ticket-2b',
      ticketNumber: 'T-00002B',
      subject: 'Intermittent timeout',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      createdAt: '2026-02-10T10:00:00.000Z',
      slaResponseDue: '2026-02-10T11:00:00.000Z',
      contactName: 'Jamie User',
      contactEmail: 'jamie@example.com',
      activities: [
        {
          id: 'a2',
          type: 'AGENT_REPLY',
          timestamp: '2026-02-10T10:50:00.000Z',
          content: 'Second reply',
        },
        {
          id: 'a1',
          type: 'AGENT_REPLY',
          timestamp: '2026-02-10T10:20:00.000Z',
          content: 'First reply',
        },
      ],
    });

    expect(mapped.sla.firstResponse.actual).toBe(20);
    expect(mapped.sla.firstResponse.met).toBe(true);
    expect(mapped.firstResponseAt).toContain('2026-02-10T10:20:00.000Z');
  });

  it('maps list tickets with safe numeric SLA remaining', () => {
    const mapped = mapTicketToListItem({
      id: 'ticket-3',
      ticketNumber: 'T-00003',
      subject: 'Billing question',
      status: 'OPEN',
      priority: 'MEDIUM',
      contactName: 'Casey User',
      contactEmail: 'casey@example.com',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z',
    });

    expect(Number.isFinite(mapped.slaTimeRemaining)).toBe(true);
    expect(mapped.slaTimeRemaining).toBe(0);
    expect(mapped.slaStatus).toBe('ON_TRACK');
  });

  it('proxies google-hosted avatar URLs through the local avatar endpoint', () => {
    const googleAvatar = 'https://lh3.googleusercontent.com/a/ACg8ocI1tAWmpksfd_bBrwfQ3yUxXxjaOpMU2BTlBd32zDO0WQIG9IDGWA=s96-c';

    const listMapped = mapTicketToListItem({
      id: 'ticket-3b',
      ticketNumber: 'T-00003B',
      subject: 'Avatar proxy check',
      status: 'OPEN',
      priority: 'MEDIUM',
      contactName: 'Casey User',
      contactEmail: 'casey@example.com',
      assigneeName: 'Taylor Agent',
      assigneeAvatar: googleAvatar,
    });

    const detailMapped = mapTicketToDetailData({
      id: 'ticket-3c',
      ticketNumber: 'T-00003C',
      subject: 'Detail avatar proxy check',
      status: 'OPEN',
      priority: 'MEDIUM',
      contactName: 'Casey User',
      contactEmail: 'casey@example.com',
      assigneeName: 'Taylor Agent',
      assigneeAvatar: googleAvatar,
      contactAvatar: googleAvatar,
      activities: [
        {
          id: 'act-3c',
          type: 'AGENT_REPLY',
          authorName: 'Taylor Agent',
          authorRole: 'Support Agent',
          authorAvatar: googleAvatar,
          content: 'Investigating',
          timestamp: '2026-02-10T10:06:00.000Z',
        },
      ],
    });

    const encoded = encodeURIComponent(googleAvatar);
    expect(listMapped.assigneeAvatar).toBe(`/api/avatar-proxy?src=${encoded}`);
    expect(detailMapped.assigneeAvatar).toBe(`/api/avatar-proxy?src=${encoded}`);
    expect(detailMapped.assigneeInfo?.avatar).toBe(`/api/avatar-proxy?src=${encoded}`);
    expect(detailMapped.customer.avatar).toBe(`/api/avatar-proxy?src=${encoded}`);
    expect(detailMapped.activities[0]?.author.avatar).toBe(`/api/avatar-proxy?src=${encoded}`);
  });

  it('maps a list payload array and ignores invalid input types', () => {
    expect(mapTicketListItems(undefined)).toEqual([]);
    expect(mapTicketListItems({})).toEqual([]);

    const mapped = mapTicketListItems([
      {
        id: 'ticket-4',
        ticketNumber: 'T-00004',
        subject: 'Sync issue',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        slaStatus: 'AT_RISK',
        slaResolutionDue: '2026-02-11T23:00:00.000Z',
        contactName: 'Taylor User',
        contactEmail: 'taylor@example.com',
      },
    ]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.slaStatus).toBe('AT_RISK');
    expect(Number.isFinite(mapped[0]?.slaTimeRemaining)).toBe(true);
  });

  it('derives account/company from email domain when explicit account fields are missing', () => {
    const mapped = mapTicketToDetailData({
      id: 'ticket-5',
      ticketNumber: 'T-00005',
      subject: 'Onboarding help',
      status: 'OPEN',
      priority: 'MEDIUM',
      contactName: 'Amanda Wilson',
      contactEmail: 'a.wilson@startup.io',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z',
    });

    expect(mapped.account.name).toBe('Startup');
    expect(mapped.customer.company).toBe('Startup');
  });

  it('does not surface UUID assignee IDs as display names', () => {
    const mapped = mapTicketToDetailData({
      id: 'ticket-6',
      ticketNumber: 'T-00006',
      subject: 'Assignment check',
      status: 'OPEN',
      priority: 'MEDIUM',
      assigneeId: '00000000-0000-4000-8000-000000000107',
      contactName: 'Amanda Wilson',
      contactEmail: 'a.wilson@startup.io',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z',
    });

    expect(mapped.assignee).toBeNull();
    expect(mapped.assigneeInfo).toBeNull();
  });

  it('does not render malformed assignee name/title placeholders', () => {
    const mapped = mapTicketToDetailData({
      id: 'ticket-7',
      ticketNumber: 'T-00007',
      subject: 'Assignee payload hygiene',
      status: 'OPEN',
      priority: 'MEDIUM',
      assigneeName: '0',
      assigneeTitle: '00000000-0000-4000-8000-000000000107',
      assignee: '00000000-0000-4000-8000-000000000107',
      contactName: 'Amanda Wilson',
      contactEmail: 'a.wilson@startup.io',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z',
    });

    expect(mapped.assignee).toBeNull();
    expect(mapped.assigneeInfo).toBeNull();
  });
});
