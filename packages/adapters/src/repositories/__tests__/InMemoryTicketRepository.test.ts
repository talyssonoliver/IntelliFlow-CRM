/**
 * InMemoryTicketRepository Tests
 *
 * Tests the in-memory implementation of the TicketRepository interface.
 * Coverage target: >90% for repository layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTicketRepository } from '../InMemoryTicketRepository';
import type { TicketDTO, CreateTicketData, SLAPolicyDTO } from '@intelliflow/application';

describe('InMemoryTicketRepository', () => {
  let repo: InMemoryTicketRepository;

  const TENANT_ID = 'tenant-1';

  function makeCreateData(overrides: Partial<CreateTicketData> = {}): CreateTicketData {
    return {
      ticketNumber: 'TKT-000001',
      subject: 'Test ticket',
      description: 'A test ticket description',
      priority: 'MEDIUM',
      contactName: 'Alice Smith',
      contactEmail: 'alice@example.com',
      contactId: 'contact-1',
      assigneeId: 'agent-1',
      slaPolicyId: 'sla-1',
      tenantId: TENANT_ID,
      slaResponseDue: new Date('2026-03-01T12:00:00Z'),
      slaResolutionDue: new Date('2026-03-02T12:00:00Z'),
      status: 'OPEN',
      slaStatus: 'ON_TRACK',
      ...overrides,
    };
  }

  function makeTicketDTO(overrides: Partial<TicketDTO> = {}): TicketDTO {
    const now = new Date();
    return {
      id: `ticket-${Math.random().toString(36).slice(2, 8)}`,
      ticketNumber: 'TKT-000001',
      subject: 'Seeded ticket',
      description: 'Some description',
      status: 'OPEN',
      priority: 'MEDIUM',
      tenantId: TENANT_ID,
      slaPolicyId: 'sla-1',
      slaResponseDue: new Date('2026-03-01T12:00:00Z'),
      slaResolutionDue: new Date('2026-03-02T12:00:00Z'),
      slaStatus: 'ON_TRACK',
      slaBreachedAt: null,
      firstResponseAt: null,
      resolvedAt: null,
      contactId: 'contact-1',
      contactName: 'Alice Smith',
      contactEmail: 'alice@example.com',
      assigneeId: 'agent-1',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = new InMemoryTicketRepository();
  });

  // ==========================================================
  // create()
  // ==========================================================
  describe('create()', () => {
    it('should create a ticket and return it with a generated id', async () => {
      const data = makeCreateData();
      const ticket = await repo.create(data);

      expect(ticket.id).toBeDefined();
      expect(ticket.subject).toBe('Test ticket');
      expect(ticket.description).toBe('A test ticket description');
      expect(ticket.priority).toBe('MEDIUM');
      expect(ticket.status).toBe('OPEN');
      expect(ticket.tenantId).toBe(TENANT_ID);
      expect(ticket.contactName).toBe('Alice Smith');
      expect(ticket.contactEmail).toBe('alice@example.com');
      expect(ticket.contactId).toBe('contact-1');
      expect(ticket.assigneeId).toBe('agent-1');
      expect(ticket.slaPolicyId).toBe('sla-1');
      expect(ticket.slaStatus).toBe('ON_TRACK');
      expect(ticket.slaBreachedAt).toBeNull();
      expect(ticket.firstResponseAt).toBeNull();
      expect(ticket.resolvedAt).toBeNull();
      expect(ticket.closedAt).toBeNull();
      expect(ticket.createdAt).toBeInstanceOf(Date);
      expect(ticket.updatedAt).toBeInstanceOf(Date);
    });

    it('should store the ticket in the repository', async () => {
      const data = makeCreateData();
      const ticket = await repo.create(data);

      const found = await repo.findById(ticket.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(ticket.id);
    });

    it('should initialise an empty activity list for the ticket', async () => {
      const ticket = await repo.create(makeCreateData());
      const activities = repo.getActivities(ticket.id);
      expect(activities).toEqual([]);
    });

    it('should handle optional fields being absent', async () => {
      const data = makeCreateData({
        description: undefined,
        contactId: undefined,
        assigneeId: undefined,
      });
      const ticket = await repo.create(data);

      expect(ticket.description).toBeNull();
      expect(ticket.contactId).toBeNull();
      expect(ticket.assigneeId).toBeNull();
    });
  });

  // ==========================================================
  // findById()
  // ==========================================================
  describe('findById()', () => {
    it('should return null for a non-existent id', async () => {
      const result = await repo.findById('does-not-exist');
      expect(result).toBeNull();
    });

    it('should return the ticket when found', async () => {
      const ticket = await repo.create(makeCreateData());
      const found = await repo.findById(ticket.id);
      expect(found).not.toBeNull();
      expect(found!.subject).toBe('Test ticket');
    });

    it('should include activities when includeActivities option is true', async () => {
      const ticket = await repo.create(makeCreateData());
      await repo.createActivity({
        ticketId: ticket.id,
        type: 'AGENT_REPLY',
        content: 'Hello',
        authorName: 'Agent',
        authorRole: 'support',
        channel: 'EMAIL',
      });

      const found = await repo.findById(ticket.id, { includeActivities: true });
      expect(found!.activities).toBeDefined();
      expect(found!.activities!.length).toBe(1);
      expect(found!.activities![0].content).toBe('Hello');
    });

    it('should limit activities with activitiesLimit', async () => {
      const ticket = await repo.create(makeCreateData());
      for (let i = 0; i < 5; i++) {
        await repo.createActivity({
          ticketId: ticket.id,
          type: 'AGENT_REPLY',
          content: `Msg ${i}`,
          authorName: 'Agent',
          authorRole: 'support',
          channel: 'EMAIL',
        });
      }

      const found = await repo.findById(ticket.id, {
        includeActivities: true,
        activitiesLimit: 2,
      });
      expect(found!.activities!.length).toBe(2);
    });

    it('should include SLA policy when includeSLAPolicy option is true', async () => {
      const policy: SLAPolicyDTO = {
        id: 'sla-1',
        name: 'Standard',
        criticalResponseMinutes: 15,
        criticalResolutionMinutes: 120,
        highResponseMinutes: 30,
        highResolutionMinutes: 240,
        mediumResponseMinutes: 60,
        mediumResolutionMinutes: 480,
        lowResponseMinutes: 120,
        lowResolutionMinutes: 960,
      };
      repo.seedSLAPolicy(policy);
      const ticket = await repo.create(makeCreateData());

      const found = await repo.findById(ticket.id, { includeSLAPolicy: true });
      expect(found!.slaPolicy).toBeDefined();
      expect(found!.slaPolicy!.name).toBe('Standard');
    });

    it('should set slaPolicy undefined if policy not found', async () => {
      const ticket = await repo.create(makeCreateData({ slaPolicyId: 'non-existent' }));
      const found = await repo.findById(ticket.id, { includeSLAPolicy: true });
      expect(found!.slaPolicy).toBeUndefined();
    });

    it('should include empty attachments when includeAttachments is true', async () => {
      const ticket = await repo.create(makeCreateData());
      const found = await repo.findById(ticket.id, { includeAttachments: true });
      expect(found!.attachments).toEqual([]);
    });

    it('should include empty nextSteps when includeNextSteps is true', async () => {
      const ticket = await repo.create(makeCreateData());
      const found = await repo.findById(ticket.id, { includeNextSteps: true });
      expect(found!.nextSteps).toEqual([]);
    });
  });

  // ==========================================================
  // findByIdSimple()
  // ==========================================================
  describe('findByIdSimple()', () => {
    it('should return null for non-existent id', async () => {
      const result = await repo.findByIdSimple('nope');
      expect(result).toBeNull();
    });

    it('should return the raw ticket without relations', async () => {
      const ticket = await repo.create(makeCreateData());
      const found = await repo.findByIdSimple(ticket.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(ticket.id);
      expect(found!.activities).toBeUndefined();
    });
  });

  // ==========================================================
  // update()
  // ==========================================================
  describe('update()', () => {
    it('should update ticket fields', async () => {
      const ticket = await repo.create(makeCreateData());
      const updated = await repo.update(ticket.id, {
        subject: 'Updated subject',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
      });

      expect(updated.subject).toBe('Updated subject');
      expect(updated.status).toBe('IN_PROGRESS');
      expect(updated.priority).toBe('HIGH');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(ticket.updatedAt.getTime());
    });

    it('should throw when updating a non-existent ticket', async () => {
      await expect(repo.update('does-not-exist', { subject: 'x' })).rejects.toThrow(
        'Ticket not found: does-not-exist'
      );
    });

    it('should persist updates so subsequent reads reflect them', async () => {
      const ticket = await repo.create(makeCreateData());
      await repo.update(ticket.id, { assigneeId: 'agent-99' });

      const found = await repo.findById(ticket.id);
      expect(found!.assigneeId).toBe('agent-99');
    });
  });

  // ==========================================================
  // delete()
  // ==========================================================
  describe('delete()', () => {
    it('should remove the ticket and its activities', async () => {
      const ticket = await repo.create(makeCreateData());
      await repo.createActivity({
        ticketId: ticket.id,
        type: 'AGENT_REPLY',
        content: 'Hi',
        authorName: 'A',
        authorRole: 'r',
        channel: 'EMAIL',
      });

      await repo.delete(ticket.id);

      expect(await repo.findById(ticket.id)).toBeNull();
      expect(repo.getActivities(ticket.id)).toEqual([]);
    });

    it('should not throw when deleting a non-existent ticket', async () => {
      await expect(repo.delete('ghost')).resolves.toBeUndefined();
    });
  });

  // ==========================================================
  // getNextTicketNumber()
  // ==========================================================
  describe('getNextTicketNumber()', () => {
    it('should return an incrementing padded ticket number', async () => {
      const first = await repo.getNextTicketNumber();
      const second = await repo.getNextTicketNumber();

      expect(first).toBe('TKT-000001');
      expect(second).toBe('TKT-000002');
    });
  });

  // ==========================================================
  // getSLAPolicy()
  // ==========================================================
  describe('getSLAPolicy()', () => {
    it('should return null when no policy is seeded', async () => {
      const result = await repo.getSLAPolicy('unknown');
      expect(result).toBeNull();
    });

    it('should return the seeded SLA policy', async () => {
      const policy: SLAPolicyDTO = {
        id: 'sla-99',
        name: 'Premium',
        criticalResponseMinutes: 5,
        criticalResolutionMinutes: 60,
        highResponseMinutes: 15,
        highResolutionMinutes: 120,
        mediumResponseMinutes: 30,
        mediumResolutionMinutes: 240,
        lowResponseMinutes: 60,
        lowResolutionMinutes: 480,
      };
      repo.seedSLAPolicy(policy);

      const found = await repo.getSLAPolicy('sla-99');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Premium');
    });
  });

  // ==========================================================
  // findMany() - filtering, sorting, pagination
  // ==========================================================
  describe('findMany()', () => {
    beforeEach(async () => {
      // Seed several tickets with varying attributes
      const base = new Date('2026-01-10T10:00:00Z');

      repo.seedTicket(
        makeTicketDTO({
          id: 't-1',
          status: 'OPEN',
          priority: 'LOW',
          assigneeId: 'agent-1',
          slaStatus: 'ON_TRACK',
          contactId: 'c-1',
          createdAt: new Date(base.getTime() + 1000),
          updatedAt: new Date(base.getTime() + 1000),
        })
      );
      repo.seedTicket(
        makeTicketDTO({
          id: 't-2',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          assigneeId: 'agent-2',
          slaStatus: 'AT_RISK',
          contactId: 'c-2',
          createdAt: new Date(base.getTime() + 2000),
          updatedAt: new Date(base.getTime() + 2000),
        })
      );
      repo.seedTicket(
        makeTicketDTO({
          id: 't-3',
          status: 'OPEN',
          priority: 'CRITICAL',
          assigneeId: 'agent-1',
          slaStatus: 'BREACHED',
          contactId: 'c-1',
          createdAt: new Date(base.getTime() + 3000),
          updatedAt: new Date(base.getTime() + 3000),
        })
      );
      repo.seedTicket(
        makeTicketDTO({
          id: 't-4',
          status: 'RESOLVED',
          priority: 'MEDIUM',
          assigneeId: 'agent-3',
          slaStatus: 'MET',
          contactId: 'c-3',
          tenantId: 'tenant-other',
          createdAt: new Date(base.getTime() + 4000),
          updatedAt: new Date(base.getTime() + 4000),
        })
      );
    });

    it('should filter by tenantId (required)', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID });
      expect(result.total).toBe(3);
      result.tickets.forEach((t) => expect(t.tenantId).toBe(TENANT_ID));
    });

    it('should filter by status', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID, status: 'OPEN' });
      expect(result.total).toBe(2);
      result.tickets.forEach((t) => expect(t.status).toBe('OPEN'));
    });

    it('should filter by priority', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID, priority: 'HIGH' });
      expect(result.total).toBe(1);
      expect(result.tickets[0].id).toBe('t-2');
    });

    it('should filter by assigneeId', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID, assigneeId: 'agent-1' });
      expect(result.total).toBe(2);
    });

    it('should filter by slaStatus', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID, slaStatus: 'AT_RISK' });
      expect(result.total).toBe(1);
      expect(result.tickets[0].id).toBe('t-2');
    });

    it('should filter by contactId', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID, contactId: 'c-1' });
      expect(result.total).toBe(2);
    });

    it('should combine multiple filters', async () => {
      const result = await repo.findMany({
        tenantId: TENANT_ID,
        status: 'OPEN',
        assigneeId: 'agent-1',
      });
      expect(result.total).toBe(2);
    });

    it('should default sort by createdAt desc', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID });
      expect(result.tickets[0].id).toBe('t-3');
      expect(result.tickets[1].id).toBe('t-2');
      expect(result.tickets[2].id).toBe('t-1');
    });

    it('should sort by priority asc', async () => {
      const result = await repo.findMany(
        { tenantId: TENANT_ID },
        { orderBy: [{ field: 'priority', direction: 'asc' }] }
      );
      // CRITICAL=0, HIGH=1, MEDIUM=2, LOW=3
      expect(result.tickets[0].priority).toBe('CRITICAL');
      expect(result.tickets[1].priority).toBe('HIGH');
      expect(result.tickets[2].priority).toBe('LOW');
    });

    it('should sort by priority desc', async () => {
      const result = await repo.findMany(
        { tenantId: TENANT_ID },
        { orderBy: [{ field: 'priority', direction: 'desc' }] }
      );
      expect(result.tickets[0].priority).toBe('LOW');
      expect(result.tickets[2].priority).toBe('CRITICAL');
    });

    it('should sort by createdAt asc', async () => {
      const result = await repo.findMany(
        { tenantId: TENANT_ID },
        { orderBy: [{ field: 'createdAt', direction: 'asc' }] }
      );
      expect(result.tickets[0].id).toBe('t-1');
      expect(result.tickets[2].id).toBe('t-3');
    });

    it('should apply pagination with offset and limit', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID }, { offset: 1, limit: 1 });
      expect(result.tickets.length).toBe(1);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should report hasMore=false when on last page', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID }, { offset: 2, limit: 5 });
      expect(result.tickets.length).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should default limit to 20 and offset to 0', async () => {
      const result = await repo.findMany({ tenantId: TENANT_ID });
      expect(result.tickets.length).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should return empty result for unmatched filter', async () => {
      const result = await repo.findMany({ tenantId: 'no-such-tenant' });
      expect(result.total).toBe(0);
      expect(result.tickets).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should handle sort with null values (null last for asc)', async () => {
      // Seed a ticket with null slaResolutionDue to test the null-handling branch
      repo.seedTicket(
        makeTicketDTO({
          id: 't-null',
          slaResolutionDue: null,
          createdAt: new Date('2026-01-10T10:05:00Z'),
          updatedAt: new Date('2026-01-10T10:05:00Z'),
        })
      );

      const result = await repo.findMany(
        { tenantId: TENANT_ID },
        { orderBy: [{ field: 'slaResolutionDue', direction: 'asc' }] }
      );
      // Null should sort last in asc
      const lastTicket = result.tickets[result.tickets.length - 1];
      expect(lastTicket.id).toBe('t-null');
    });

    it('should handle sort with both values null', async () => {
      repo.clear();
      repo.seedTicket(
        makeTicketDTO({ id: 'n1', slaResolutionDue: null, createdAt: new Date('2026-01-01') })
      );
      repo.seedTicket(
        makeTicketDTO({ id: 'n2', slaResolutionDue: null, createdAt: new Date('2026-01-02') })
      );

      const result = await repo.findMany(
        { tenantId: TENANT_ID },
        { orderBy: [{ field: 'slaResolutionDue', direction: 'asc' }] }
      );
      expect(result.total).toBe(2);
    });
  });

  // ==========================================================
  // getStats()
  // ==========================================================
  describe('getStats()', () => {
    it('should return zeroed stats for an empty tenant', async () => {
      const stats = await repo.getStats(TENANT_ID);
      expect(stats.total).toBe(0);
      expect(stats.slaBreached).toBe(0);
      expect(stats.avgResponseTimeMinutes).toBe(0);
      expect(stats.byStatus.OPEN).toBe(0);
      expect(stats.byPriority.HIGH).toBe(0);
    });

    it('should count tickets by status and priority', async () => {
      repo.seedTicket(makeTicketDTO({ id: 's1', status: 'OPEN', priority: 'HIGH' }));
      repo.seedTicket(makeTicketDTO({ id: 's2', status: 'OPEN', priority: 'HIGH' }));
      repo.seedTicket(makeTicketDTO({ id: 's3', status: 'RESOLVED', priority: 'LOW' }));

      const stats = await repo.getStats(TENANT_ID);
      expect(stats.total).toBe(3);
      expect(stats.byStatus.OPEN).toBe(2);
      expect(stats.byStatus.RESOLVED).toBe(1);
      expect(stats.byPriority.HIGH).toBe(2);
      expect(stats.byPriority.LOW).toBe(1);
    });

    it('should count SLA breaches', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'b1',
          slaBreachedAt: new Date('2026-01-15T10:00:00Z'),
        })
      );
      repo.seedTicket(makeTicketDTO({ id: 'b2', slaBreachedAt: null }));

      const stats = await repo.getStats(TENANT_ID);
      expect(stats.slaBreached).toBe(1);
    });

    it('should calculate average response time', async () => {
      const created = new Date('2026-01-10T10:00:00Z');
      // 60 minutes after created
      const responded = new Date('2026-01-10T11:00:00Z');

      repo.seedTicket(
        makeTicketDTO({
          id: 'r1',
          createdAt: created,
          firstResponseAt: responded,
        })
      );
      // 120 minutes after
      repo.seedTicket(
        makeTicketDTO({
          id: 'r2',
          createdAt: created,
          firstResponseAt: new Date('2026-01-10T12:00:00Z'),
        })
      );

      const stats = await repo.getStats(TENANT_ID);
      // Average of 60 and 120 = 90
      expect(stats.avgResponseTimeMinutes).toBe(90);
    });

    it('should isolate stats by tenantId', async () => {
      repo.seedTicket(makeTicketDTO({ id: 'x1', tenantId: TENANT_ID }));
      repo.seedTicket(makeTicketDTO({ id: 'x2', tenantId: 'other-tenant' }));

      const stats = await repo.getStats(TENANT_ID);
      expect(stats.total).toBe(1);
    });
  });

  // ==========================================================
  // createActivity()
  // ==========================================================
  describe('createActivity()', () => {
    it('should add an activity to a ticket', async () => {
      const ticket = await repo.create(makeCreateData());
      await repo.createActivity({
        ticketId: ticket.id,
        type: 'CUSTOMER_MESSAGE',
        content: 'Help me please',
        authorName: 'Alice',
        authorRole: 'customer',
        channel: 'PORTAL',
      });

      const activities = repo.getActivities(ticket.id);
      expect(activities.length).toBe(1);
      expect(activities[0].type).toBe('CUSTOMER_MESSAGE');
      expect(activities[0].content).toBe('Help me please');
      expect(activities[0].authorName).toBe('Alice');
      expect(activities[0].isInternal).toBe(false);
      expect(activities[0].channel).toBe('PORTAL');
      expect(activities[0].timestamp).toBeInstanceOf(Date);
    });

    it('should default isInternal to false', async () => {
      const ticket = await repo.create(makeCreateData());
      await repo.createActivity({
        ticketId: ticket.id,
        type: 'AGENT_REPLY',
        content: 'Reply',
        authorName: 'Agent',
        authorRole: 'support',
        channel: 'EMAIL',
      });

      const activities = repo.getActivities(ticket.id);
      expect(activities[0].isInternal).toBe(false);
    });

    it('should respect isInternal=true', async () => {
      const ticket = await repo.create(makeCreateData());
      await repo.createActivity({
        ticketId: ticket.id,
        type: 'INTERNAL_NOTE',
        content: 'Private note',
        authorName: 'Agent',
        authorRole: 'support',
        channel: 'SYSTEM',
        isInternal: true,
      });

      const activities = repo.getActivities(ticket.id);
      expect(activities[0].isInternal).toBe(true);
    });

    it('should create activities even when ticket id has no existing list', async () => {
      await repo.createActivity({
        ticketId: 'orphan-ticket',
        type: 'SYSTEM_EVENT',
        content: 'Event',
        authorName: 'System',
        authorRole: 'system',
        channel: 'SYSTEM',
      });

      const activities = repo.getActivities('orphan-ticket');
      expect(activities.length).toBe(1);
    });
  });

  // ==========================================================
  // count()
  // ==========================================================
  describe('count()', () => {
    it('should return 0 for empty repository', async () => {
      const result = await repo.count({ tenantId: TENANT_ID });
      expect(result).toBe(0);
    });

    it('should count tickets matching filters', async () => {
      repo.seedTicket(makeTicketDTO({ id: 'c1', status: 'OPEN' }));
      repo.seedTicket(makeTicketDTO({ id: 'c2', status: 'OPEN' }));
      repo.seedTicket(makeTicketDTO({ id: 'c3', status: 'CLOSED' }));

      expect(await repo.count({ tenantId: TENANT_ID, status: 'OPEN' })).toBe(2);
      expect(await repo.count({ tenantId: TENANT_ID, status: 'CLOSED' })).toBe(1);
      expect(await repo.count({ tenantId: TENANT_ID })).toBe(3);
    });

    it('should apply all filter types', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'f1',
          status: 'OPEN',
          priority: 'HIGH',
          assigneeId: 'a1',
          slaStatus: 'AT_RISK',
          contactId: 'c1',
        })
      );
      repo.seedTicket(
        makeTicketDTO({
          id: 'f2',
          status: 'OPEN',
          priority: 'LOW',
          assigneeId: 'a2',
          slaStatus: 'ON_TRACK',
          contactId: 'c2',
        })
      );

      expect(
        await repo.count({
          tenantId: TENANT_ID,
          status: 'OPEN',
          priority: 'HIGH',
          assigneeId: 'a1',
          slaStatus: 'AT_RISK',
          contactId: 'c1',
        })
      ).toBe(1);
    });
  });

  // ==========================================================
  // getAverageResponseTime()
  // ==========================================================
  describe('getAverageResponseTime()', () => {
    it('should return 0 when no tickets have first response', async () => {
      repo.seedTicket(makeTicketDTO({ id: 'no-resp', firstResponseAt: null }));
      const avg = await repo.getAverageResponseTime(TENANT_ID);
      expect(avg).toBe(0);
    });

    it('should calculate average correctly', async () => {
      const created = new Date('2026-01-10T10:00:00Z');
      repo.seedTicket(
        makeTicketDTO({
          id: 'avg1',
          createdAt: created,
          firstResponseAt: new Date('2026-01-10T10:30:00Z'), // 30 min
        })
      );
      repo.seedTicket(
        makeTicketDTO({
          id: 'avg2',
          createdAt: created,
          firstResponseAt: new Date('2026-01-10T11:30:00Z'), // 90 min
        })
      );

      const avg = await repo.getAverageResponseTime(TENANT_ID);
      expect(avg).toBe(60); // (30+90)/2
    });

    it('should only consider tickets for the given tenant', async () => {
      const created = new Date('2026-01-10T10:00:00Z');
      repo.seedTicket(
        makeTicketDTO({
          id: 'mine',
          tenantId: TENANT_ID,
          createdAt: created,
          firstResponseAt: new Date('2026-01-10T11:00:00Z'), // 60 min
        })
      );
      repo.seedTicket(
        makeTicketDTO({
          id: 'other',
          tenantId: 'other-tenant',
          createdAt: created,
          firstResponseAt: new Date('2026-01-10T14:00:00Z'), // 240 min
        })
      );

      const avg = await repo.getAverageResponseTime(TENANT_ID);
      expect(avg).toBe(60);
    });
  });

  // ==========================================================
  // findBreachingSLA()
  // ==========================================================
  describe('findBreachingSLA()', () => {
    it('should return empty array when no tickets are breaching', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'ok',
          slaBreachedAt: null,
          slaResponseDue: new Date('2099-01-01'),
          slaResolutionDue: new Date('2099-01-01'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching).toEqual([]);
    });

    it('should include tickets already breached', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'breached-already',
          status: 'OPEN',
          slaBreachedAt: new Date('2026-01-01T10:00:00Z'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching.length).toBe(1);
      expect(breaching[0].id).toBe('breached-already');
    });

    it('should include tickets with response SLA past due and no first response', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'resp-overdue',
          status: 'OPEN',
          slaBreachedAt: null,
          slaResponseDue: new Date('2020-01-01T10:00:00Z'), // past
          firstResponseAt: null,
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching.length).toBe(1);
    });

    it('should include tickets with resolution SLA past due', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'resol-overdue',
          status: 'IN_PROGRESS',
          slaBreachedAt: null,
          slaResponseDue: null,
          slaResolutionDue: new Date('2020-01-01T10:00:00Z'), // past
          firstResponseAt: new Date('2020-01-01T08:00:00Z'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching.length).toBe(1);
    });

    it('should exclude RESOLVED tickets', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'resolved-breach',
          status: 'RESOLVED',
          slaBreachedAt: new Date('2026-01-01'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching).toEqual([]);
    });

    it('should exclude CLOSED tickets', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'closed-breach',
          status: 'CLOSED',
          slaBreachedAt: new Date('2026-01-01'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching).toEqual([]);
    });

    it('should not include ticket when response SLA due but already responded', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'responded',
          status: 'OPEN',
          slaBreachedAt: null,
          slaResponseDue: new Date('2020-01-01'),
          firstResponseAt: new Date('2019-12-31'), // responded before due
          slaResolutionDue: new Date('2099-01-01'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching).toEqual([]);
    });

    it('should filter by tenantId', async () => {
      repo.seedTicket(
        makeTicketDTO({
          id: 'other-tenant-breach',
          tenantId: 'other',
          status: 'OPEN',
          slaBreachedAt: new Date('2026-01-01'),
        })
      );

      const breaching = await repo.findBreachingSLA(TENANT_ID);
      expect(breaching).toEqual([]);
    });
  });

  // ==========================================================
  // Test helper methods
  // ==========================================================
  describe('test helpers', () => {
    it('clear() should reset the repository', async () => {
      await repo.create(makeCreateData());
      expect(repo.getAll().length).toBe(1);

      repo.clear();
      expect(repo.getAll().length).toBe(0);
    });

    it('getAll() should return all tickets', async () => {
      repo.seedTicket(makeTicketDTO({ id: 'a' }));
      repo.seedTicket(makeTicketDTO({ id: 'b' }));
      expect(repo.getAll().length).toBe(2);
    });

    it('seedTicket() should store the ticket and init empty activities', async () => {
      const dto = makeTicketDTO({ id: 'seeded-1' });
      repo.seedTicket(dto);

      const found = await repo.findById('seeded-1');
      expect(found).not.toBeNull();
      expect(repo.getActivities('seeded-1')).toEqual([]);
    });

    it('seedTicket() should not overwrite existing activities', async () => {
      const dto = makeTicketDTO({ id: 'seeded-act' });
      repo.seedTicket(dto);
      await repo.createActivity({
        ticketId: 'seeded-act',
        type: 'AGENT_REPLY',
        content: 'hi',
        authorName: 'A',
        authorRole: 'r',
        channel: 'EMAIL',
      });

      // Re-seed the same ticket
      repo.seedTicket(dto);
      // Activities should still be there since the activities Map key already exists
      expect(repo.getActivities('seeded-act').length).toBe(1);
    });

    it('seedSLAPolicy() should make the policy retrievable', async () => {
      const policy: SLAPolicyDTO = {
        id: 'p1',
        name: 'Test',
        criticalResponseMinutes: 1,
        criticalResolutionMinutes: 2,
        highResponseMinutes: 3,
        highResolutionMinutes: 4,
        mediumResponseMinutes: 5,
        mediumResolutionMinutes: 6,
        lowResponseMinutes: 7,
        lowResolutionMinutes: 8,
      };
      repo.seedSLAPolicy(policy);
      const found = await repo.getSLAPolicy('p1');
      expect(found).toEqual(policy);
    });

    it('getActivities() should return empty array for unknown ticket', () => {
      expect(repo.getActivities('nonexistent')).toEqual([]);
    });
  });
});
