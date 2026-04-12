/**
 * Ticket - B11 coverage tests
 *
 * Targets uncovered branches:
 * - checkSlaStatus: PAUSED early return, BREACHED early return
 * - checkSlaStatus: resolution SLA AT_RISK path
 * - breachSla: without slaResponseDue (no event emitted for RESPONSE breach)
 * - breachSla: without slaResolutionDue (no event emitted for RESOLUTION breach)
 * - isResponseSlaBreached: without slaResponseDue returns false
 * - isResolutionSlaBreached: without slaResolutionDue returns false
 * - reopen: clearing resolvedAt
 * - reconstitute
 */
import { describe, it, expect } from 'vitest';
import { Ticket } from '../Ticket';
import { TicketId } from '../TicketId';

function createTicket(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return Ticket.create({
    subject: 'Test Ticket',
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    slaPolicyId: 'sla-1',
    tenantId: 'tenant-1',
    ...overrides,
  });
}

describe('Ticket - b11 branch coverage', () => {
  describe('checkSlaStatus - PAUSED early return', () => {
    it('should return PAUSED when SLA is paused', () => {
      const ticket = createTicket({
        slaResponseDue: new Date(Date.now() + 60000),
      }).value;
      ticket.pauseSla('waiting for customer', 'user-1');
      expect(ticket.checkSlaStatus()).toBe('PAUSED');
    });
  });

  describe('checkSlaStatus - BREACHED early return', () => {
    it('should return BREACHED when SLA was already breached', () => {
      const ticket = createTicket({
        slaResponseDue: new Date(Date.now() - 60000), // already past
      }).value;
      ticket.breachSla('RESPONSE');
      expect(ticket.checkSlaStatus()).toBe('BREACHED');
    });
  });

  describe('checkSlaStatus - resolution SLA AT_RISK', () => {
    it('should return AT_RISK when resolution SLA is close to breach', () => {
      // AT_RISK threshold is 30 minutes (1800000 ms)
      const almostDue = new Date(Date.now() + 15 * 60 * 1000); // 15 min from now
      const ticket = createTicket({
        slaResolutionDue: almostDue,
      }).value;
      // Record first response so response SLA check is skipped
      ticket.recordFirstResponse('user-1');
      expect(ticket.checkSlaStatus()).toBe('AT_RISK');
    });

    it('should return BREACHED when resolution SLA is past due', () => {
      const pastDue = new Date(Date.now() - 60000);
      const ticket = createTicket({
        slaResolutionDue: pastDue,
      }).value;
      ticket.recordFirstResponse('user-1');
      expect(ticket.checkSlaStatus()).toBe('BREACHED');
    });

    it('should return ON_TRACK when resolution SLA has plenty of time', () => {
      const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const ticket = createTicket({
        slaResolutionDue: farFuture,
      }).value;
      ticket.recordFirstResponse('user-1');
      expect(ticket.checkSlaStatus()).toBe('ON_TRACK');
    });
  });

  describe('breachSla - without slaResponseDue', () => {
    it('should set status to BREACHED but not emit response breach event', () => {
      const ticket = createTicket().value; // no slaResponseDue
      ticket.clearDomainEvents();
      ticket.breachSla('RESPONSE');

      expect(ticket.slaStatus).toBe('BREACHED');
      // No TicketResponseSlaBreachedEvent should be emitted since slaResponseDue is undefined
      const events = ticket.getDomainEvents();
      const responseSlaEvents = events.filter(
        (e) => e.eventType === 'ticket.response_sla_breached'
      );
      expect(responseSlaEvents.length).toBe(0);
    });
  });

  describe('breachSla - without slaResolutionDue', () => {
    it('should set status to BREACHED but not emit resolution breach event', () => {
      const ticket = createTicket().value; // no slaResolutionDue
      ticket.clearDomainEvents();
      ticket.breachSla('RESOLUTION');

      expect(ticket.slaStatus).toBe('BREACHED');
      const events = ticket.getDomainEvents();
      const resolutionSlaEvents = events.filter(
        (e) => e.eventType === 'ticket.resolution_sla_breached'
      );
      expect(resolutionSlaEvents.length).toBe(0);
    });
  });

  describe('breachSla - with slaResponseDue', () => {
    it('should emit response breach event when slaResponseDue is set', () => {
      const ticket = createTicket({
        slaResponseDue: new Date(Date.now() - 60000),
      }).value;
      ticket.clearDomainEvents();
      ticket.breachSla('RESPONSE');

      const events = ticket.getDomainEvents();
      const responseSlaEvents = events.filter(
        (e) => e.eventType === 'ticket.response_sla_breached'
      );
      expect(responseSlaEvents.length).toBe(1);
    });
  });

  describe('breachSla - with slaResolutionDue', () => {
    it('should emit resolution breach event when slaResolutionDue is set', () => {
      const ticket = createTicket({
        slaResolutionDue: new Date(Date.now() - 60000),
      }).value;
      ticket.clearDomainEvents();
      ticket.breachSla('RESOLUTION');

      const events = ticket.getDomainEvents();
      const resolutionSlaEvents = events.filter(
        (e) => e.eventType === 'ticket.resolution_sla_breached'
      );
      expect(resolutionSlaEvents.length).toBe(1);
    });
  });

  describe('isResponseSlaBreached - without slaResponseDue', () => {
    it('should return false when no slaResponseDue is set', () => {
      const ticket = createTicket().value;
      expect(ticket.isResponseSlaBreached()).toBe(false);
    });
  });

  describe('isResolutionSlaBreached - without slaResolutionDue', () => {
    it('should return false when no slaResolutionDue is set', () => {
      const ticket = createTicket().value;
      expect(ticket.isResolutionSlaBreached()).toBe(false);
    });
  });

  describe('reopen - clears resolvedAt', () => {
    it('should clear resolvedAt when reopening a resolved ticket', () => {
      const ticket = createTicket().value;
      ticket.startWork('user-1');
      ticket.resolve('Fixed', 'user-1');
      expect(ticket.resolvedAt).toBeDefined();

      const result = ticket.reopen('Not actually fixed', 'user-1');
      expect(result.isSuccess).toBe(true);
      expect(ticket.resolvedAt).toBeUndefined();
      expect(ticket.status).toBe('OPEN');
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute a ticket from persistence data', () => {
      const id = TicketId.generate();
      const now = new Date();
      const ticket = Ticket.reconstitute(id, {
        ticketNumber: 'T-00099',
        subject: 'Reconstituted Ticket',
        description: 'Test description',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        tenantId: 'tenant-1',
        slaPolicyId: 'sla-1',
        slaResponseDue: new Date(Date.now() + 60000),
        slaResolutionDue: new Date(Date.now() + 3600000),
        slaStatus: 'ON_TRACK',
        slaPausedDuration: 0,
        contactName: 'Jane',
        contactEmail: 'jane@test.com',
        assigneeId: 'user-2',
        createdAt: now,
        updatedAt: now,
      });

      expect(ticket.id).toBe(id);
      expect(ticket.ticketNumber).toBe('T-00099');
      expect(ticket.status).toBe('IN_PROGRESS');
      expect(ticket.priority).toBe('HIGH');
      expect(ticket.assigneeId).toBe('user-2');
      expect(ticket.getDomainEvents().length).toBe(0);
    });
  });

  describe('checkSlaStatus - ON_TRACK with no SLA dates', () => {
    it('should return ON_TRACK when no SLA dates are set', () => {
      const ticket = createTicket().value;
      expect(ticket.checkSlaStatus()).toBe('ON_TRACK');
    });
  });
});
