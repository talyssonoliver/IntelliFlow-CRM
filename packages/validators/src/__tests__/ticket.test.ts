/**
 * Ticket Validators Tests
 *
 * Tests the Zod validation schemas for ticket/support management.
 * These schemas validate API inputs for ticket CRUD, SLA, and status transitions.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

// Simple UUID generator for tests
const uuidv4 = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

import {
  ticketStatusSchema,
  ticketPrioritySchema,
  slaStatusSchema,
  ticketCategorySchema,
  createTicketSchema,
  updateTicketSchema,
  ticketQuerySchema,
  addResponseSchema,
  statusTransitionSchema,
  slaPauseSchema,
  slaResumeSchema,
  statsInputSchema,
  addAttachmentSchema,
  type TicketStatus,
  type TicketPriority,
  type SLAStatus,
  type TicketCategory,
} from '../ticket';

describe('Ticket Validators', () => {
  describe('ticketStatusSchema', () => {
    it('should accept valid status values', () => {
      const validStatuses: TicketStatus[] = [
        'OPEN',
        'IN_PROGRESS',
        'WAITING_ON_CUSTOMER',
        'WAITING_ON_THIRD_PARTY',
        'RESOLVED',
        'CLOSED',
      ];

      validStatuses.forEach((status) => {
        const result = ticketStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status values', () => {
      const result = ticketStatusSchema.safeParse('INVALID_STATUS');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = ticketStatusSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('ticketPrioritySchema', () => {
    it('should accept valid priority values', () => {
      const validPriorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

      validPriorities.forEach((priority) => {
        const result = ticketPrioritySchema.safeParse(priority);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid priority values', () => {
      const result = ticketPrioritySchema.safeParse('URGENT');
      expect(result.success).toBe(false);
    });
  });

  describe('slaStatusSchema', () => {
    it('should accept valid SLA status values', () => {
      const validStatuses: SLAStatus[] = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'];

      validStatuses.forEach((status) => {
        const result = slaStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid SLA status values', () => {
      const result = slaStatusSchema.safeParse('EXPIRED');
      expect(result.success).toBe(false);
    });
  });

  describe('ticketCategorySchema', () => {
    it('should accept valid category values', () => {
      const validCategories: TicketCategory[] = [
        'BILLING',
        'TECHNICAL',
        'SALES',
        'GENERAL',
        'FEATURE_REQUEST',
        'BUG_REPORT',
      ];

      validCategories.forEach((category) => {
        const result = ticketCategorySchema.safeParse(category);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid category values', () => {
      const result = ticketCategorySchema.safeParse('OTHER');
      expect(result.success).toBe(false);
    });
  });

  describe('createTicketSchema', () => {
    const validInput = {
      subject: 'Cannot login to account',
      priority: 'HIGH' as const,
      contactName: 'John Doe',
      contactEmail: 'john@example.com',
      slaPolicyId: uuidv4(),
    };

    it('should accept valid input with required fields', () => {
      const result = createTicketSchema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subject).toBe('Cannot login to account');
        expect(result.data.priority).toBe('HIGH');
        expect(result.data.contactName).toBe('John Doe');
        expect(result.data.contactEmail).toBe('john@example.com');
      }
    });

    it('should accept valid input with all optional fields', () => {
      const contactId = uuidv4();
      const assigneeId = uuidv4();

      const input = {
        ...validInput,
        description: 'Detailed description of the issue',
        category: 'TECHNICAL' as const,
        contactId,
        assigneeId,
      };

      const result = createTicketSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('Detailed description of the issue');
        expect(result.data.category).toBe('TECHNICAL');
        expect(result.data.contactId).toBe(contactId);
        expect(result.data.assigneeId).toBe(assigneeId);
      }
    });

    it('should reject empty subject', () => {
      const input = { ...validInput, subject: '' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject subject exceeding 200 characters', () => {
      const input = { ...validInput, subject: 'x'.repeat(201) };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept subject at exactly 200 characters', () => {
      const input = { ...validInput, subject: 'x'.repeat(200) };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty contactName', () => {
      const input = { ...validInput, contactName: '' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject contactName exceeding 100 characters', () => {
      const input = { ...validInput, contactName: 'x'.repeat(101) };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid contactEmail', () => {
      const input = { ...validInput, contactEmail: 'not-an-email' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const input = { ...validInput, priority: 'SUPER_HIGH' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid slaPolicyId format', () => {
      const input = { ...validInput, slaPolicyId: 'invalid-uuid' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = createTicketSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid contactId format', () => {
      const input = { ...validInput, contactId: 'invalid' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid assigneeId format', () => {
      const input = { ...validInput, assigneeId: 'invalid' };
      const result = createTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('updateTicketSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid update with only id', () => {
      const input = { id: validUuid };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid update with all optional fields', () => {
      const assigneeId = uuidv4();

      const input = {
        id: validUuid,
        subject: 'Updated Subject',
        description: 'Updated description',
        status: 'IN_PROGRESS' as const,
        priority: 'CRITICAL' as const,
        category: 'BILLING' as const,
        assigneeId,
      };

      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept null assigneeId to unassign', () => {
      const input = {
        id: validUuid,
        assigneeId: null,
      };

      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject missing id', () => {
      const input = { subject: 'Updated Subject' };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid id format', () => {
      const input = { id: 'invalid-uuid' };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject subject exceeding 200 characters', () => {
      const input = { id: validUuid, subject: 'x'.repeat(201) };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty subject', () => {
      const input = { id: validUuid, subject: '' };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const input = { id: validUuid, status: 'INVALID' };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const input = { id: validUuid, priority: 'INVALID' };
      const result = updateTicketSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ticketQuerySchema', () => {
    it('should accept empty query with defaults', () => {
      const input = {};
      const result = ticketQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should accept full query with all filters', () => {
      const assignedToId = uuidv4();
      const contactId = uuidv4();

      const input = {
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'asc' as const,
        status: 'OPEN' as const,
        priority: 'HIGH' as const,
        category: 'TECHNICAL' as const,
        slaStatus: 'AT_RISK' as const,
        assignedToId,
        contactId,
      };

      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject limit exceeding 100', () => {
      const input = { limit: 101 };
      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject page of 0', () => {
      const input = { page: 0 };
      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative limit', () => {
      const input = { limit: -1 };
      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid status filter', () => {
      const input = { status: 'INVALID' };
      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid slaStatus filter', () => {
      const input = { slaStatus: 'EXPIRED' };
      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid assignedToId format', () => {
      const input = { assignedToId: 'invalid' };
      const result = ticketQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    // IFC-205: Search parameter tests
    it('should accept search string parameter', () => {
      const result = ticketQuerySchema.safeParse({ search: 'urgent issue' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('urgent issue');
      }
    });

    it('should accept search combined with status and priority filters', () => {
      const result = ticketQuerySchema.safeParse({
        search: 'login',
        status: 'OPEN' as const,
        priority: 'HIGH' as const,
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-string search value', () => {
      const result = ticketQuerySchema.safeParse({ search: 123 });
      expect(result.success).toBe(false);
    });

    it('should enforce max 200 character limit on search', () => {
      const result = ticketQuerySchema.safeParse({ search: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('should accept search at exactly 200 characters', () => {
      const result = ticketQuerySchema.safeParse({ search: 'x'.repeat(200) });
      expect(result.success).toBe(true);
    });

    // IFC-206: sortBy enum override tests
    it('should accept sortBy createdAt', () => {
      const result = ticketQuerySchema.safeParse({ sortBy: 'createdAt' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy updatedAt', () => {
      const result = ticketQuerySchema.safeParse({ sortBy: 'updatedAt' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy priority', () => {
      const result = ticketQuerySchema.safeParse({ sortBy: 'priority' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy slaResolutionDue', () => {
      const result = ticketQuerySchema.safeParse({ sortBy: 'slaResolutionDue' });
      expect(result.success).toBe(true);
    });

    it('should reject disallowed sortBy value subject', () => {
      const result = ticketQuerySchema.safeParse({ sortBy: 'subject' });
      expect(result.success).toBe(false);
    });

    it('should default sortBy to createdAt when omitted', () => {
      const result = ticketQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortBy).toBe('createdAt');
      }
    });
  });

  // IFC-206: statsInputSchema tests
  describe('statsInputSchema', () => {
    it('should accept valid timeWindow value 24h', () => {
      const result = statsInputSchema.safeParse({ timeWindow: '24h' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeWindow).toBe('24h');
      }
    });

    it('should accept valid timeWindow value 7d', () => {
      const result = statsInputSchema.safeParse({ timeWindow: '7d' });
      expect(result.success).toBe(true);
    });

    it('should accept valid timeWindow value 30d', () => {
      const result = statsInputSchema.safeParse({ timeWindow: '30d' });
      expect(result.success).toBe(true);
    });

    it('should accept valid timeWindow value all', () => {
      const result = statsInputSchema.safeParse({ timeWindow: 'all' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid timeWindow value 1y', () => {
      const result = statsInputSchema.safeParse({ timeWindow: '1y' });
      expect(result.success).toBe(false);
    });

    it('should default timeWindow to all when omitted', () => {
      const result = statsInputSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeWindow).toBe('all');
      }
    });

    it('should accept empty object with all defaults', () => {
      const result = statsInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('addResponseSchema', () => {
    const validInput = {
      ticketId: uuidv4(),
      content: 'Thank you for contacting us. We are looking into this.',
      authorName: 'Support Agent',
    };

    it('should accept valid response with defaults', () => {
      const result = addResponseSchema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authorRole).toBe('Agent');
      }
    });

    it('should accept response with custom authorRole', () => {
      const input = { ...validInput, authorRole: 'Manager' };
      const result = addResponseSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authorRole).toBe('Manager');
      }
    });

    it('should reject empty content', () => {
      const input = { ...validInput, content: '' };
      const result = addResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty authorName', () => {
      const input = { ...validInput, authorName: '' };
      const result = addResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid ticketId format', () => {
      const input = { ...validInput, ticketId: 'invalid' };
      const result = addResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = addResponseSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('statusTransitionSchema', () => {
    const validTransition = {
      ticketId: uuidv4(),
      fromStatus: 'OPEN' as const,
      toStatus: 'IN_PROGRESS' as const,
      changedBy: 'agent@example.com',
    };

    it('should accept valid transition (OPEN → IN_PROGRESS)', () => {
      const result = statusTransitionSchema.safeParse(validTransition);
      expect(result.success).toBe(true);
    });

    it('should accept valid transition with reason', () => {
      const input = { ...validTransition, reason: 'Agent started working on the ticket' };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid transition (OPEN → RESOLVED)', () => {
      const input = { ...validTransition, toStatus: 'RESOLVED' as const };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid transition (RESOLVED → OPEN) for reopen', () => {
      const input = {
        ...validTransition,
        fromStatus: 'RESOLVED' as const,
        toStatus: 'OPEN' as const,
      };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid transition (RESOLVED → CLOSED)', () => {
      const input = {
        ...validTransition,
        fromStatus: 'RESOLVED' as const,
        toStatus: 'CLOSED' as const,
      };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid transition (CLOSED → OPEN)', () => {
      const input = {
        ...validTransition,
        fromStatus: 'CLOSED' as const,
        toStatus: 'OPEN' as const,
      };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid transition (CLOSED → IN_PROGRESS)', () => {
      const input = {
        ...validTransition,
        fromStatus: 'CLOSED' as const,
        toStatus: 'IN_PROGRESS' as const,
      };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid transition (RESOLVED → IN_PROGRESS)', () => {
      const input = {
        ...validTransition,
        fromStatus: 'RESOLVED' as const,
        toStatus: 'IN_PROGRESS' as const,
      };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty changedBy', () => {
      const input = { ...validTransition, changedBy: '' };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid ticketId format', () => {
      const input = { ...validTransition, ticketId: 'invalid' };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid fromStatus', () => {
      const input = { ...validTransition, fromStatus: 'INVALID' };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid toStatus', () => {
      const input = { ...validTransition, toStatus: 'INVALID' };
      const result = statusTransitionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('slaPauseSchema', () => {
    it('should accept valid pause request', () => {
      const input = {
        ticketId: uuidv4(),
        reason: 'Waiting for customer response',
        pausedBy: 'agent@example.com',
      };

      const result = slaPauseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty reason', () => {
      const input = {
        ticketId: uuidv4(),
        reason: '',
        pausedBy: 'agent@example.com',
      };

      const result = slaPauseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty pausedBy', () => {
      const input = {
        ticketId: uuidv4(),
        reason: 'Valid reason',
        pausedBy: '',
      };

      const result = slaPauseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid ticketId format', () => {
      const input = {
        ticketId: 'invalid',
        reason: 'Valid reason',
        pausedBy: 'agent@example.com',
      };

      const result = slaPauseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = slaPauseSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('addAttachmentSchema', () => {
    const validInput = {
      ticketId: uuidv4(),
      name: 'document.pdf',
      size: '1.5 KB',
      sizeBytes: 1536,
      fileType: 'application/pdf',
      content: 'dGVzdCBjb250ZW50', // base64 encoded
    };

    it('should accept valid input', () => {
      const result = addAttachmentSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('document.pdf');
        expect(result.data.sizeBytes).toBe(1536);
      }
    });

    it('should reject missing ticketId', () => {
      const { ticketId: _, ...input } = validInput;
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const input = { ...validInput, name: '' };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject sizeBytes exceeding 10MB (10_485_760)', () => {
      const input = { ...validInput, sizeBytes: 10_485_761 };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept sizeBytes at exactly 10MB', () => {
      const input = { ...validInput, sizeBytes: 10_485_760 };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject sizeBytes <= 0', () => {
      const input = { ...validInput, sizeBytes: 0 };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);

      const negInput = { ...validInput, sizeBytes: -1 };
      const negResult = addAttachmentSchema.safeParse(negInput);
      expect(negResult.success).toBe(false);
    });

    it('should reject missing content', () => {
      const { content: _, ...input } = validInput;
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject name exceeding 255 characters', () => {
      const input = { ...validInput, name: 'x'.repeat(256) };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid ticketId format', () => {
      const input = { ...validInput, ticketId: 'invalid' };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer sizeBytes', () => {
      const input = { ...validInput, sizeBytes: 1.5 };
      const result = addAttachmentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('slaResumeSchema', () => {
    it('should accept valid resume request', () => {
      const input = {
        ticketId: uuidv4(),
        resumedBy: 'agent@example.com',
      };

      const result = slaResumeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty resumedBy', () => {
      const input = {
        ticketId: uuidv4(),
        resumedBy: '',
      };

      const result = slaResumeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid ticketId format', () => {
      const input = {
        ticketId: 'invalid',
        resumedBy: 'agent@example.com',
      };

      const result = slaResumeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = slaResumeSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
