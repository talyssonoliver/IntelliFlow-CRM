/**
 * Ticket Aggregate Root Tests
 *
 * These tests verify the domain logic of the Ticket entity with SLA tracking.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Ticket,
  InvalidTicketTransitionError,
  TicketAlreadyClosedError,
  TicketSlaNotPausedError,
  TicketSlaAlreadyPausedError,
  TicketFirstResponseAlreadyRecordedError,
  CreateTicketProps,
} from '../Ticket';
import { TicketId } from '../TicketId';
import {
  TicketCreatedEvent,
  TicketStatusChangedEvent,
  TicketPriorityChangedEvent,
  TicketAssignedEvent,
  TicketUnassignedEvent,
  TicketResolvedEvent,
  TicketClosedEvent,
  TicketReopenedEvent,
  TicketResponseSlaBreachedEvent,
  TicketResolutionSlaBreachedEvent,
  TicketSlaPausedEvent,
  TicketSlaResumedEvent,
} from '../TicketEvents';

describe('Ticket Aggregate', () => {
  const createDefaultTicketProps = (
    overrides: Partial<CreateTicketProps> = {}
  ): CreateTicketProps => ({
    subject: 'Login issue',
    description: 'Cannot login to the application',
    priority: 'MEDIUM',
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    slaPolicyId: 'sla-policy-123',
    tenantId: 'tenant-456',
    ...overrides,
  });

  describe('Factory Method - create()', () => {
    it('should create a new ticket with valid full data', () => {
      const slaResponseDue = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
      const slaResolutionDue = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

      const result = Ticket.create({
        subject: 'Payment processing error',
        description: 'Credit card payment fails at checkout',
        priority: 'HIGH',
        contactName: 'Jane Smith',
        contactEmail: 'jane@company.com',
        contactId: 'contact-789',
        assigneeId: 'agent-123',
        slaPolicyId: 'sla-critical',
        slaResponseDue,
        slaResolutionDue,
        tenantId: 'tenant-001',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Ticket);

      const ticket = result.value;
      expect(ticket.subject).toBe('Payment processing error');
      expect(ticket.description).toBe('Credit card payment fails at checkout');
      expect(ticket.priority).toBe('HIGH');
      expect(ticket.status).toBe('OPEN');
      expect(ticket.contactName).toBe('Jane Smith');
      expect(ticket.contactEmail).toBe('jane@company.com');
      expect(ticket.contactId).toBe('contact-789');
      expect(ticket.assigneeId).toBe('agent-123');
      expect(ticket.slaResponseDue).toBe(slaResponseDue);
      expect(ticket.slaResolutionDue).toBe(slaResolutionDue);
      expect(ticket.tenantId).toBe('tenant-001');
    });

    it('should create a ticket with minimal data', () => {
      const result = Ticket.create(createDefaultTicketProps());

      expect(result.isSuccess).toBe(true);

      const ticket = result.value;
      expect(ticket.subject).toBe('Login issue');
      expect(ticket.description).toBe('Cannot login to the application');
      expect(ticket.priority).toBe('MEDIUM');
      expect(ticket.status).toBe('OPEN');
      expect(ticket.contactName).toBe('John Doe');
      expect(ticket.contactEmail).toBe('john@example.com');
      expect(ticket.assigneeId).toBeUndefined();
      expect(ticket.contactId).toBeUndefined();
    });

    it('should default status to OPEN', () => {
      const result = Ticket.create(createDefaultTicketProps());

      expect(result.value.status).toBe('OPEN');
    });

    it('should default priority to MEDIUM when not specified', () => {
      const result = Ticket.create(
        createDefaultTicketProps({ priority: undefined })
      );

      expect(result.value.priority).toBe('MEDIUM');
    });

    it('should default slaStatus to ON_TRACK', () => {
      const result = Ticket.create(createDefaultTicketProps());

      expect(result.value.slaStatus).toBe('ON_TRACK');
    });

    it('should generate unique ticketNumber in T-XXXXX format', () => {
      const result = Ticket.create(createDefaultTicketProps());

      expect(result.value.ticketNumber).toMatch(/^T-\d{5}$/);
    });

    it('should emit TicketCreatedEvent on creation', () => {
      const result = Ticket.create(
        createDefaultTicketProps({ priority: 'CRITICAL' })
      );

      const ticket = result.value;
      const events = ticket.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TicketCreatedEvent);

      const createdEvent = events[0] as TicketCreatedEvent;
      expect(createdEvent.ticketId).toBe(ticket.id);
      expect(createdEvent.ticketNumber).toBe(ticket.ticketNumber);
      expect(createdEvent.subject).toBe('Login issue');
      expect(createdEvent.priority).toBe('CRITICAL');
      expect(createdEvent.tenantId).toBe('tenant-456');
    });

    it('should initialize slaPausedDuration to 0', () => {
      const result = Ticket.create(createDefaultTicketProps());

      expect(result.value.slaPausedDuration).toBe(0);
    });
  });

  describe('Status Transitions', () => {
    let ticket: Ticket;

    beforeEach(() => {
      const result = Ticket.create(createDefaultTicketProps());
      ticket = result.value;
      ticket.clearDomainEvents();
    });

    describe('Valid Transitions', () => {
      it('should transition from OPEN to IN_PROGRESS', () => {
        const result = ticket.changeStatus('IN_PROGRESS', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('IN_PROGRESS');
      });

      it('should transition from OPEN to WAITING_ON_CUSTOMER', () => {
        const result = ticket.changeStatus('WAITING_ON_CUSTOMER', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('WAITING_ON_CUSTOMER');
      });

      it('should transition from OPEN to WAITING_ON_THIRD_PARTY', () => {
        const result = ticket.changeStatus(
          'WAITING_ON_THIRD_PARTY',
          'agent-123'
        );

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('WAITING_ON_THIRD_PARTY');
      });

      it('should transition from OPEN to RESOLVED', () => {
        const result = ticket.changeStatus('RESOLVED', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('RESOLVED');
      });

      it('should transition from OPEN to CLOSED', () => {
        const result = ticket.changeStatus('CLOSED', 'admin-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('CLOSED');
      });

      it('should transition from IN_PROGRESS to WAITING_ON_CUSTOMER', () => {
        ticket.changeStatus('IN_PROGRESS', 'agent-123');
        ticket.clearDomainEvents();

        const result = ticket.changeStatus('WAITING_ON_CUSTOMER', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('WAITING_ON_CUSTOMER');
      });

      it('should transition from WAITING_ON_CUSTOMER to IN_PROGRESS', () => {
        ticket.changeStatus('WAITING_ON_CUSTOMER', 'agent-123');
        ticket.clearDomainEvents();

        const result = ticket.changeStatus('IN_PROGRESS', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('IN_PROGRESS');
      });

      it('should transition from RESOLVED to OPEN (reopen)', () => {
        ticket.changeStatus('RESOLVED', 'agent-123');
        ticket.clearDomainEvents();

        const result = ticket.changeStatus('OPEN', 'customer-456');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('OPEN');
      });

      it('should transition from RESOLVED to CLOSED', () => {
        ticket.changeStatus('RESOLVED', 'agent-123');
        ticket.clearDomainEvents();

        const result = ticket.changeStatus('CLOSED', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('CLOSED');
      });
    });

    describe('Invalid Transitions', () => {
      it('should reject invalid transition from OPEN to OPEN', () => {
        const result = ticket.changeStatus('OPEN', 'agent-123');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(InvalidTicketTransitionError);
        expect(ticket.status).toBe('OPEN'); // Unchanged
      });

      it('should reject transition from CLOSED (terminal state)', () => {
        ticket.changeStatus('CLOSED', 'admin-123');
        ticket.clearDomainEvents();

        const result = ticket.changeStatus('OPEN', 'agent-456');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(TicketAlreadyClosedError);
        expect(result.error.code).toBe('TICKET_ALREADY_CLOSED');
        expect(ticket.status).toBe('CLOSED'); // Unchanged
      });

      it('should reject transition from RESOLVED to IN_PROGRESS', () => {
        ticket.changeStatus('RESOLVED', 'agent-123');
        ticket.clearDomainEvents();

        const result = ticket.changeStatus('IN_PROGRESS', 'agent-123');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(InvalidTicketTransitionError);
        expect(ticket.status).toBe('RESOLVED'); // Unchanged
      });
    });

    it('should emit TicketStatusChangedEvent on status change', () => {
      ticket.changeStatus('IN_PROGRESS', 'agent-456');

      const events = ticket.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TicketStatusChangedEvent);

      const statusEvent = events[0] as TicketStatusChangedEvent;
      expect(statusEvent.ticketId).toBe(ticket.id);
      expect(statusEvent.previousStatus).toBe('OPEN');
      expect(statusEvent.newStatus).toBe('IN_PROGRESS');
      expect(statusEvent.changedBy).toBe('agent-456');
    });
  });

  describe('SLA Methods', () => {
    let ticket: Ticket;

    beforeEach(() => {
      const slaResponseDue = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const slaResolutionDue = new Date(Date.now() + 8 * 60 * 60 * 1000);

      const result = Ticket.create(
        createDefaultTicketProps({
          slaResponseDue,
          slaResolutionDue,
        })
      );
      ticket = result.value;
      ticket.clearDomainEvents();
    });

    describe('checkSlaStatus()', () => {
      it('should return ON_TRACK when before deadline', () => {
        const now = new Date();
        const status = ticket.checkSlaStatus(now);

        expect(status).toBe('ON_TRACK');
      });

      it('should return AT_RISK when near deadline', () => {
        // Create ticket with SLA due in 30 minutes (within AT_RISK threshold)
        const slaResponseDue = new Date(Date.now() + 30 * 60 * 1000); // 30 min
        const result = Ticket.create(
          createDefaultTicketProps({ slaResponseDue })
        );
        const atRiskTicket = result.value;

        // Check at a time that's 25 minutes before deadline
        const now = new Date(slaResponseDue.getTime() - 25 * 60 * 1000);
        const status = atRiskTicket.checkSlaStatus(now);

        expect(status).toBe('AT_RISK');
      });

      it('should return BREACHED when past deadline', () => {
        // Set now to after the SLA response deadline
        const now = new Date(
          ticket.slaResponseDue!.getTime() + 60 * 60 * 1000
        );
        const status = ticket.checkSlaStatus(now);

        expect(status).toBe('BREACHED');
      });

      it('should use current time when now parameter not provided', () => {
        const status = ticket.checkSlaStatus();

        expect(['ON_TRACK', 'AT_RISK', 'BREACHED']).toContain(status);
      });
    });

    describe('isResponseSlaBreached()', () => {
      it('should return false before response SLA deadline', () => {
        const now = new Date();
        expect(ticket.isResponseSlaBreached(now)).toBe(false);
      });

      it('should return true after response SLA deadline', () => {
        const now = new Date(
          ticket.slaResponseDue!.getTime() + 60 * 60 * 1000
        );
        expect(ticket.isResponseSlaBreached(now)).toBe(true);
      });

      it('should return false when first response already recorded', () => {
        ticket.recordFirstResponse('agent-123');
        const now = new Date(
          ticket.slaResponseDue!.getTime() + 60 * 60 * 1000
        );
        expect(ticket.isResponseSlaBreached(now)).toBe(false);
      });
    });

    describe('isResolutionSlaBreached()', () => {
      it('should return false before resolution SLA deadline', () => {
        const now = new Date();
        expect(ticket.isResolutionSlaBreached(now)).toBe(false);
      });

      it('should return true after resolution SLA deadline', () => {
        const now = new Date(
          ticket.slaResolutionDue!.getTime() + 60 * 60 * 1000
        );
        expect(ticket.isResolutionSlaBreached(now)).toBe(true);
      });
    });

    describe('pauseSla()', () => {
      it('should pause SLA tracking', () => {
        const now = new Date();
        const result = ticket.pauseSla('Waiting for customer', 'agent-123', now);

        expect(result.isSuccess).toBe(true);
        expect(ticket.isSlaPaused).toBe(true);
        expect(ticket.slaStatus).toBe('PAUSED');
      });

      it('should emit TicketSlaPausedEvent', () => {
        const now = new Date();
        ticket.pauseSla('Waiting for info', 'agent-123', now);

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketSlaPausedEvent)).toBe(true);

        const pausedEvent = events.find(
          (e) => e instanceof TicketSlaPausedEvent
        ) as TicketSlaPausedEvent;
        expect(pausedEvent.ticketId).toBe(ticket.id);
        expect(pausedEvent.reason).toBe('Waiting for info');
        expect(pausedEvent.pausedBy).toBe('agent-123');
      });

      it('should fail when already paused', () => {
        ticket.pauseSla('First pause', 'agent-123');
        ticket.clearDomainEvents();

        const result = ticket.pauseSla('Second pause', 'agent-456');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(TicketSlaAlreadyPausedError);
        expect(result.error.code).toBe('TICKET_SLA_ALREADY_PAUSED');
      });
    });

    describe('resumeSla()', () => {
      beforeEach(() => {
        ticket.pauseSla('Pausing', 'agent-123', new Date());
        ticket.clearDomainEvents();
      });

      it('should resume SLA tracking', () => {
        const now = new Date();
        const result = ticket.resumeSla('agent-456', now);

        expect(result.isSuccess).toBe(true);
        expect(ticket.isSlaPaused).toBe(false);
      });

      it('should emit TicketSlaResumedEvent', () => {
        const now = new Date();
        ticket.resumeSla('agent-456', now);

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketSlaResumedEvent)).toBe(
          true
        );
      });

      it('should accumulate pausedDuration', () => {
        // Pause for 1 hour
        const pauseStart = new Date();
        const resumeTime = new Date(pauseStart.getTime() + 60 * 60 * 1000);

        // Create a new ticket and pause it with specific time
        const result = Ticket.create(createDefaultTicketProps());
        const testTicket = result.value;
        testTicket.pauseSla('Pause 1', 'agent-123', pauseStart);
        testTicket.clearDomainEvents();

        // Resume after 1 hour
        testTicket.resumeSla('agent-123', resumeTime);

        expect(testTicket.slaPausedDuration).toBeGreaterThan(0);
      });

      it('should fail when not paused', () => {
        // Create fresh ticket (not paused)
        const freshResult = Ticket.create(createDefaultTicketProps());
        const freshTicket = freshResult.value;

        const result = freshTicket.resumeSla('agent-123');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(TicketSlaNotPausedError);
        expect(result.error.code).toBe('TICKET_SLA_NOT_PAUSED');
      });
    });

    describe('recordFirstResponse()', () => {
      it('should record first response time', () => {
        const now = new Date();
        const result = ticket.recordFirstResponse('agent-123', now);

        expect(result.isSuccess).toBe(true);
        expect(ticket.firstResponseAt).toBe(now);
      });

      it('should fail on second call (once only)', () => {
        ticket.recordFirstResponse('agent-123');
        ticket.clearDomainEvents();

        const result = ticket.recordFirstResponse('agent-456');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(
          TicketFirstResponseAlreadyRecordedError
        );
        expect(result.error.code).toBe('TICKET_FIRST_RESPONSE_ALREADY_RECORDED');
      });
    });

    describe('breachSla()', () => {
      it('should emit TicketResponseSlaBreachedEvent for RESPONSE type', () => {
        const now = new Date();
        ticket.breachSla('RESPONSE', now);

        const events = ticket.getDomainEvents();
        expect(
          events.some((e) => e instanceof TicketResponseSlaBreachedEvent)
        ).toBe(true);
      });

      it('should emit TicketResolutionSlaBreachedEvent for RESOLUTION type', () => {
        const now = new Date();
        ticket.breachSla('RESOLUTION', now);

        const events = ticket.getDomainEvents();
        expect(
          events.some((e) => e instanceof TicketResolutionSlaBreachedEvent)
        ).toBe(true);
      });

      it('should set slaStatus to BREACHED', () => {
        ticket.breachSla('RESPONSE');

        expect(ticket.slaStatus).toBe('BREACHED');
      });
    });
  });

  describe('Status Command Methods', () => {
    let ticket: Ticket;

    beforeEach(() => {
      const result = Ticket.create(createDefaultTicketProps());
      ticket = result.value;
      ticket.clearDomainEvents();
    });

    describe('startWork()', () => {
      it('should transition to IN_PROGRESS', () => {
        const result = ticket.startWork('agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('IN_PROGRESS');
      });
    });

    describe('waitOnCustomer()', () => {
      it('should transition to WAITING_ON_CUSTOMER', () => {
        const result = ticket.waitOnCustomer(
          'Awaiting clarification',
          'agent-123'
        );

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('WAITING_ON_CUSTOMER');
      });
    });

    describe('waitOnThirdParty()', () => {
      it('should transition to WAITING_ON_THIRD_PARTY', () => {
        const result = ticket.waitOnThirdParty('Vendor Support', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('WAITING_ON_THIRD_PARTY');
      });
    });

    describe('resolve()', () => {
      it('should transition to RESOLVED and record resolvedAt', () => {
        const result = ticket.resolve('Issue fixed', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('RESOLVED');
        expect(ticket.resolvedAt).toBeInstanceOf(Date);
      });

      it('should emit TicketResolvedEvent', () => {
        ticket.resolve('Fixed by resetting config', 'agent-456');

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketResolvedEvent)).toBe(true);

        const resolvedEvent = events.find(
          (e) => e instanceof TicketResolvedEvent
        ) as TicketResolvedEvent;
        expect(resolvedEvent.resolution).toBe('Fixed by resetting config');
        expect(resolvedEvent.resolvedBy).toBe('agent-456');
      });
    });

    describe('close()', () => {
      it('should transition to CLOSED', () => {
        const result = ticket.close('admin-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('CLOSED');
        expect(ticket.closedAt).toBeInstanceOf(Date);
      });

      it('should emit TicketClosedEvent', () => {
        ticket.close('admin-456');

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketClosedEvent)).toBe(true);
      });
    });

    describe('reopen()', () => {
      beforeEach(() => {
        ticket.resolve('Fixed', 'agent-123');
        ticket.clearDomainEvents();
      });

      it('should transition from RESOLVED to OPEN', () => {
        const result = ticket.reopen('Customer reported still broken', 'agent-456');

        expect(result.isSuccess).toBe(true);
        expect(ticket.status).toBe('OPEN');
      });

      it('should emit TicketReopenedEvent', () => {
        ticket.reopen('Issue persists', 'agent-789');

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketReopenedEvent)).toBe(true);

        const reopenedEvent = events.find(
          (e) => e instanceof TicketReopenedEvent
        ) as TicketReopenedEvent;
        expect(reopenedEvent.reason).toBe('Issue persists');
        expect(reopenedEvent.reopenedBy).toBe('agent-789');
      });
    });
  });

  describe('Assignment Methods', () => {
    let ticket: Ticket;

    beforeEach(() => {
      const result = Ticket.create(createDefaultTicketProps());
      ticket = result.value;
      ticket.clearDomainEvents();
    });

    describe('assign()', () => {
      it('should set assigneeId and emit TicketAssignedEvent', () => {
        ticket.assign('agent-456', 'manager-789');

        expect(ticket.assigneeId).toBe('agent-456');

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketAssignedEvent)).toBe(true);

        const assignedEvent = events.find(
          (e) => e instanceof TicketAssignedEvent
        ) as TicketAssignedEvent;
        expect(assignedEvent.newAssigneeId).toBe('agent-456');
        expect(assignedEvent.assignedBy).toBe('manager-789');
      });

      it('should track previousAssigneeId on reassignment', () => {
        ticket.assign('agent-123', 'manager-001');
        ticket.clearDomainEvents();

        ticket.assign('agent-456', 'manager-002');

        const events = ticket.getDomainEvents();
        const assignedEvent = events.find(
          (e) => e instanceof TicketAssignedEvent
        ) as TicketAssignedEvent;

        expect(assignedEvent.previousAssigneeId).toBe('agent-123');
        expect(assignedEvent.newAssigneeId).toBe('agent-456');
      });
    });

    describe('unassign()', () => {
      beforeEach(() => {
        ticket.assign('agent-123', 'manager-001');
        ticket.clearDomainEvents();
      });

      it('should clear assigneeId and emit TicketUnassignedEvent', () => {
        ticket.unassign('manager-456');

        expect(ticket.assigneeId).toBeUndefined();

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketUnassignedEvent)).toBe(
          true
        );

        const unassignedEvent = events.find(
          (e) => e instanceof TicketUnassignedEvent
        ) as TicketUnassignedEvent;
        expect(unassignedEvent.previousAssigneeId).toBe('agent-123');
        expect(unassignedEvent.unassignedBy).toBe('manager-456');
      });
    });
  });

  describe('Update Methods', () => {
    let ticket: Ticket;

    beforeEach(() => {
      const result = Ticket.create(createDefaultTicketProps());
      ticket = result.value;
      ticket.clearDomainEvents();
    });

    describe('changePriority()', () => {
      it('should update priority and emit event', () => {
        const result = ticket.changePriority('CRITICAL', 'agent-123');

        expect(result.isSuccess).toBe(true);
        expect(ticket.priority).toBe('CRITICAL');

        const events = ticket.getDomainEvents();
        expect(events.some((e) => e instanceof TicketPriorityChangedEvent)).toBe(
          true
        );
      });

      it('should fail when closed', () => {
        ticket.close('admin-123');
        ticket.clearDomainEvents();

        const result = ticket.changePriority('LOW', 'agent-456');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(TicketAlreadyClosedError);
        expect(ticket.priority).toBe('MEDIUM'); // Unchanged
      });
    });

    describe('updateTicketInfo()', () => {
      it('should update subject and description', () => {
        ticket.updateTicketInfo({
          subject: 'Updated subject',
          description: 'Updated description',
        });

        expect(ticket.subject).toBe('Updated subject');
        expect(ticket.description).toBe('Updated description');
      });

      it('should update only subject when description not provided', () => {
        ticket.updateTicketInfo({ subject: 'New subject only' });

        expect(ticket.subject).toBe('New subject only');
        expect(ticket.description).toBe('Cannot login to the application');
      });
    });
  });

  describe('Computed Properties', () => {
    let ticket: Ticket;

    beforeEach(() => {
      const result = Ticket.create(createDefaultTicketProps());
      ticket = result.value;
      ticket.clearDomainEvents();
    });

    it('isClosed returns true when CLOSED', () => {
      expect(ticket.isClosed).toBe(false);

      ticket.close('admin-123');

      expect(ticket.isClosed).toBe(true);
    });

    it('isResolved returns true when RESOLVED', () => {
      expect(ticket.isResolved).toBe(false);

      ticket.resolve('Fixed', 'agent-123');

      expect(ticket.isResolved).toBe(true);
    });

    it('isWaiting returns true for waiting statuses', () => {
      expect(ticket.isWaiting).toBe(false);

      ticket.waitOnCustomer('Needs info', 'agent-123');
      expect(ticket.isWaiting).toBe(true);

      // Reset
      ticket.changeStatus('IN_PROGRESS', 'agent-123');
      ticket.waitOnThirdParty('Vendor', 'agent-123');
      expect(ticket.isWaiting).toBe(true);
    });

    it('isSlaBreached returns true when BREACHED', () => {
      expect(ticket.isSlaBreached).toBe(false);

      ticket.breachSla('RESPONSE');

      expect(ticket.isSlaBreached).toBe(true);
    });

    it('isSlaPaused returns true when paused', () => {
      expect(ticket.isSlaPaused).toBe(false);

      ticket.pauseSla('Waiting', 'agent-123');

      expect(ticket.isSlaPaused).toBe(true);
    });

    it('canBeClosed returns true from valid states', () => {
      expect(ticket.canBeClosed).toBe(true); // OPEN

      ticket.startWork('agent-123');
      expect(ticket.canBeClosed).toBe(true); // IN_PROGRESS

      ticket.resolve('Fixed', 'agent-123');
      expect(ticket.canBeClosed).toBe(true); // RESOLVED

      ticket.close('admin-123');
      expect(ticket.canBeClosed).toBe(false); // CLOSED - already closed
    });
  });

  describe('Serialization', () => {
    it('toJSON() includes all fields correctly', () => {
      const slaResponseDue = new Date('2026-02-05T10:00:00.000Z');
      const slaResolutionDue = new Date('2026-02-05T18:00:00.000Z');

      const result = Ticket.create({
        ...createDefaultTicketProps(),
        slaResponseDue,
        slaResolutionDue,
        contactId: 'contact-001',
        assigneeId: 'agent-001',
      });
      const ticket = result.value;

      const json = ticket.toJSON();

      expect(json.id).toBe(ticket.id.value);
      expect(json.ticketNumber).toBe(ticket.ticketNumber);
      expect(json.subject).toBe(ticket.subject);
      expect(json.description).toBe(ticket.description);
      expect(json.status).toBe(ticket.status);
      expect(json.priority).toBe(ticket.priority);
      expect(json.slaStatus).toBe(ticket.slaStatus);
      expect(json.contactId).toBe('contact-001');
      expect(json.contactName).toBe(ticket.contactName);
      expect(json.contactEmail).toBe(ticket.contactEmail);
      expect(json.assigneeId).toBe('agent-001');
      expect(json.tenantId).toBe(ticket.tenantId);
      expect(json.createdAt).toBeDefined();
      expect(json.updatedAt).toBeDefined();
    });
  });

  describe('Reconstitution', () => {
    it('reconstitute() creates Ticket from persistence data', () => {
      const id = TicketId.generate();
      const createdAt = new Date('2026-02-01T09:00:00.000Z');
      const updatedAt = new Date('2026-02-05T10:00:00.000Z');

      const ticket = Ticket.reconstitute(id, {
        ticketNumber: 'T-12345',
        subject: 'Reconstituted ticket',
        description: 'From database',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        tenantId: 'tenant-999',
        slaPolicyId: 'sla-001',
        slaStatus: 'ON_TRACK',
        slaPausedDuration: 0,
        contactName: 'Test User',
        contactEmail: 'test@example.com',
        createdAt,
        updatedAt,
      });

      expect(ticket).toBeInstanceOf(Ticket);
      expect(ticket.id).toBe(id);
      expect(ticket.ticketNumber).toBe('T-12345');
      expect(ticket.subject).toBe('Reconstituted ticket');
      expect(ticket.status).toBe('IN_PROGRESS');
      expect(ticket.priority).toBe('HIGH');
      expect(ticket.createdAt).toBe(createdAt);
      expect(ticket.updatedAt).toBe(updatedAt);

      // Reconstitute should NOT emit domain events
      expect(ticket.getDomainEvents()).toHaveLength(0);
    });

    it('reconstitute() handles completed ticket', () => {
      const id = TicketId.generate();
      const closedAt = new Date('2026-02-04T16:00:00.000Z');
      const resolvedAt = new Date('2026-02-04T15:00:00.000Z');

      const ticket = Ticket.reconstitute(id, {
        ticketNumber: 'T-99999',
        subject: 'Closed ticket',
        status: 'CLOSED',
        priority: 'LOW',
        tenantId: 'tenant-001',
        slaPolicyId: 'sla-001',
        slaStatus: 'MET',
        slaPausedDuration: 3600000,
        contactName: 'Completed User',
        contactEmail: 'completed@example.com',
        resolvedAt,
        closedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(ticket.isClosed).toBe(true);
      expect(ticket.closedAt).toBe(closedAt);
      expect(ticket.resolvedAt).toBe(resolvedAt);
      expect(ticket.slaStatus).toBe('MET');
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const result = Ticket.create(createDefaultTicketProps());
      const ticket = result.value;
      // Creation emits 1 event

      ticket.startWork('agent-1');
      ticket.assign('agent-2', 'manager-1');
      ticket.changePriority('HIGH', 'manager-1');

      const events = ticket.getDomainEvents();
      expect(events.length).toBeGreaterThanOrEqual(4);
    });

    it('clearDomainEvents() clears event list', () => {
      const result = Ticket.create(createDefaultTicketProps());
      const ticket = result.value;

      expect(ticket.getDomainEvents().length).toBeGreaterThan(0);

      ticket.clearDomainEvents();

      expect(ticket.getDomainEvents()).toHaveLength(0);
    });
  });
});
