/**
 * Bulk Operations Validators Tests
 *
 * Tests the Zod validation schemas for bulk CRM operations on leads, contacts,
 * tickets, and documents. These schemas validate array-based inputs with
 * min/max constraints and entity-specific extensions.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  bulkIdsSchema,
  bulkOperationResultSchema,
  bulkConvertLeadsSchema,
  bulkUpdateLeadStatusSchema,
  bulkArchiveLeadsSchema,
  bulkDeleteLeadsSchema,
  bulkEmailContactsSchema,
  bulkCreateDealsSchema,
  bulkExportContactsSchema,
  bulkDeleteContactsSchema,
  bulkAssignTicketsSchema,
  bulkUpdateTicketStatusSchema,
  bulkResolveTicketsSchema,
  bulkEscalateTicketsSchema,
  bulkShareDocumentsSchema,
} from '../bulk-operations';

// Simple UUID generator for tests
const uuidv4 = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const validId = uuidv4();
const validId2 = uuidv4();
const validId3 = uuidv4();

describe('Bulk Operations Validators', () => {
  // =============================================================================
  // bulkIdsSchema
  // =============================================================================

  describe('bulkIdsSchema', () => {
    it('should accept a single valid UUID', () => {
      const result = bulkIdsSchema.safeParse({ ids: [validId] });
      expect(result.success).toBe(true);
    });

    it('should accept multiple valid UUIDs', () => {
      const result = bulkIdsSchema.safeParse({
        ids: [validId, validId2, validId3],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ids).toHaveLength(3);
      }
    });

    it('should accept exactly 100 items (max boundary)', () => {
      const ids = Array.from({ length: 100 }, () => uuidv4());
      const result = bulkIdsSchema.safeParse({ ids });
      expect(result.success).toBe(true);
    });

    it('should reject empty ids array', () => {
      const result = bulkIdsSchema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 items', () => {
      const ids = Array.from({ length: 101 }, () => uuidv4());
      const result = bulkIdsSchema.safeParse({ ids });
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID format', () => {
      const result = bulkIdsSchema.safeParse({ ids: ['not-a-uuid'] });
      expect(result.success).toBe(false);
    });

    it('should reject missing ids field', () => {
      const result = bulkIdsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject non-array ids', () => {
      const result = bulkIdsSchema.safeParse({ ids: validId });
      expect(result.success).toBe(false);
    });

    it('should reject array with one invalid id among valid ones', () => {
      const result = bulkIdsSchema.safeParse({
        ids: [validId, 'invalid', validId2],
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // bulkOperationResultSchema
  // =============================================================================

  describe('bulkOperationResultSchema', () => {
    it('should accept valid result with all successes', () => {
      const result = bulkOperationResultSchema.safeParse({
        successful: [validId, validId2],
        failed: [],
        totalProcessed: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid result with mixed outcomes', () => {
      const result = bulkOperationResultSchema.safeParse({
        successful: [validId],
        failed: [{ id: validId2, error: 'Not found' }],
        totalProcessed: 2,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.successful).toHaveLength(1);
        expect(result.data.failed).toHaveLength(1);
        expect(result.data.failed[0].error).toBe('Not found');
      }
    });

    it('should accept valid result with all failures', () => {
      const result = bulkOperationResultSchema.safeParse({
        successful: [],
        failed: [
          { id: validId, error: 'Permission denied' },
          { id: validId2, error: 'Already deleted' },
        ],
        totalProcessed: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing totalProcessed', () => {
      const result = bulkOperationResultSchema.safeParse({
        successful: [],
        failed: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject failed item missing error field', () => {
      const result = bulkOperationResultSchema.safeParse({
        successful: [],
        failed: [{ id: validId }],
        totalProcessed: 1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject failed item missing id field', () => {
      const result = bulkOperationResultSchema.safeParse({
        successful: [],
        failed: [{ error: 'Some error' }],
        totalProcessed: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Lead Bulk Operations
  // =============================================================================

  describe('bulkConvertLeadsSchema', () => {
    it('should accept valid input with default createAccounts', () => {
      const result = bulkConvertLeadsSchema.safeParse({
        ids: [validId, validId2],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createAccounts).toBe(false);
      }
    });

    it('should accept createAccounts as true', () => {
      const result = bulkConvertLeadsSchema.safeParse({
        ids: [validId],
        createAccounts: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createAccounts).toBe(true);
      }
    });

    it('should reject empty ids array', () => {
      const result = bulkConvertLeadsSchema.safeParse({
        ids: [],
        createAccounts: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkUpdateLeadStatusSchema', () => {
    it('should accept valid lead status update', () => {
      const result = bulkUpdateLeadStatusSchema.safeParse({
        ids: [validId],
        status: 'QUALIFIED',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid lead statuses', () => {
      const validStatuses = [
        'NEW',
        'CONTACTED',
        'QUALIFIED',
        'NEGOTIATING',
        'UNQUALIFIED',
        'CONVERTED',
        'LOST',
      ];

      validStatuses.forEach((status) => {
        const result = bulkUpdateLeadStatusSchema.safeParse({
          ids: [validId],
          status,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid lead status', () => {
      const result = bulkUpdateLeadStatusSchema.safeParse({
        ids: [validId],
        status: 'INVALID_STATUS',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing status', () => {
      const result = bulkUpdateLeadStatusSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkArchiveLeadsSchema', () => {
    it('should accept valid ids (same as bulkIdsSchema)', () => {
      const result = bulkArchiveLeadsSchema.safeParse({
        ids: [validId, validId2],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty ids', () => {
      const result = bulkArchiveLeadsSchema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkDeleteLeadsSchema', () => {
    it('should accept valid ids', () => {
      const result = bulkDeleteLeadsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid uuid in ids', () => {
      const result = bulkDeleteLeadsSchema.safeParse({
        ids: ['bad-id'],
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Contact Bulk Operations
  // =============================================================================

  describe('bulkEmailContactsSchema', () => {
    it('should accept valid ids', () => {
      const result = bulkEmailContactsSchema.safeParse({
        ids: [validId, validId2],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty ids', () => {
      const result = bulkEmailContactsSchema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkCreateDealsSchema', () => {
    it('should accept ids only (optional fields omitted)', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(true);
    });

    it('should accept with dealName and value', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId, validId2],
        dealName: 'Enterprise Deal Q1',
        value: 50000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dealName).toBe('Enterprise Deal Q1');
        expect(result.data.value).toBe(50000);
      }
    });

    it('should reject empty dealName', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
        dealName: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject dealName exceeding 200 characters', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
        dealName: 'D'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should accept dealName at exactly 200 characters', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
        dealName: 'D'.repeat(200),
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero value', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
        value: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative value', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
        value: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should accept positive decimal value', () => {
      const result = bulkCreateDealsSchema.safeParse({
        ids: [validId],
        value: 99.99,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('bulkExportContactsSchema', () => {
    it('should accept with default format (csv)', () => {
      const result = bulkExportContactsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('csv');
      }
    });

    it('should accept csv format explicitly', () => {
      const result = bulkExportContactsSchema.safeParse({
        ids: [validId],
        format: 'csv',
      });
      expect(result.success).toBe(true);
    });

    it('should accept json format', () => {
      const result = bulkExportContactsSchema.safeParse({
        ids: [validId, validId2],
        format: 'json',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('json');
      }
    });

    it('should reject invalid format', () => {
      const result = bulkExportContactsSchema.safeParse({
        ids: [validId],
        format: 'xml',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkDeleteContactsSchema', () => {
    it('should accept valid ids', () => {
      const result = bulkDeleteContactsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // Ticket Bulk Operations
  // =============================================================================

  describe('bulkAssignTicketsSchema', () => {
    it('should accept valid assignment', () => {
      const assigneeId = uuidv4();
      const result = bulkAssignTicketsSchema.safeParse({
        ids: [validId, validId2],
        assigneeId,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assigneeId).toBe(assigneeId);
      }
    });

    it('should reject missing assigneeId', () => {
      const result = bulkAssignTicketsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid assigneeId format', () => {
      const result = bulkAssignTicketsSchema.safeParse({
        ids: [validId],
        assigneeId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkUpdateTicketStatusSchema', () => {
    it('should accept valid ticket status update', () => {
      const result = bulkUpdateTicketStatusSchema.safeParse({
        ids: [validId],
        status: 'IN_PROGRESS',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid ticket statuses', () => {
      const validStatuses = [
        'OPEN',
        'IN_PROGRESS',
        'WAITING_ON_CUSTOMER',
        'WAITING_ON_THIRD_PARTY',
        'RESOLVED',
        'CLOSED',
      ];

      validStatuses.forEach((status) => {
        const result = bulkUpdateTicketStatusSchema.safeParse({
          ids: [validId],
          status,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid ticket status', () => {
      const result = bulkUpdateTicketStatusSchema.safeParse({
        ids: [validId],
        status: 'PENDING',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing status', () => {
      const result = bulkUpdateTicketStatusSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkResolveTicketsSchema', () => {
    it('should accept ids without resolution', () => {
      const result = bulkResolveTicketsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(true);
    });

    it('should accept ids with resolution text', () => {
      const result = bulkResolveTicketsSchema.safeParse({
        ids: [validId, validId2],
        resolution: 'Fixed in version 2.1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resolution).toBe('Fixed in version 2.1');
      }
    });

    it('should reject resolution exceeding 1000 characters', () => {
      const result = bulkResolveTicketsSchema.safeParse({
        ids: [validId],
        resolution: 'R'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept resolution at exactly 1000 characters', () => {
      const result = bulkResolveTicketsSchema.safeParse({
        ids: [validId],
        resolution: 'R'.repeat(1000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('bulkEscalateTicketsSchema', () => {
    it('should accept ids without reason', () => {
      const result = bulkEscalateTicketsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(true);
    });

    it('should accept ids with reason', () => {
      const result = bulkEscalateTicketsSchema.safeParse({
        ids: [validId],
        reason: 'Customer is a VIP with SLA breach imminent',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason exceeding 500 characters', () => {
      const result = bulkEscalateTicketsSchema.safeParse({
        ids: [validId],
        reason: 'E'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept reason at exactly 500 characters', () => {
      const result = bulkEscalateTicketsSchema.safeParse({
        ids: [validId],
        reason: 'E'.repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // Document Bulk Operations
  // =============================================================================

  describe('bulkShareDocumentsSchema', () => {
    it('should accept valid share with default permission', () => {
      const recipientId = uuidv4();
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [recipientId],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.permission).toBe('READ');
      }
    });

    it('should accept READ permission explicitly', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [uuidv4()],
        permission: 'READ',
      });
      expect(result.success).toBe(true);
    });

    it('should accept EDIT permission', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [uuidv4()],
        permission: 'EDIT',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.permission).toBe('EDIT');
      }
    });

    it('should accept ADMIN permission', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [uuidv4()],
        permission: 'ADMIN',
      });
      expect(result.success).toBe(true);
    });

    it('should accept multiple recipient IDs', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId, validId2],
        recipientIds: [uuidv4(), uuidv4(), uuidv4()],
        permission: 'EDIT',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recipientIds).toHaveLength(3);
      }
    });

    it('should reject empty recipientIds array', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing recipientIds', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid permission value', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [uuidv4()],
        permission: 'OWNER',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid recipientId format', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: ['not-a-uuid'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject lowercase permission value', () => {
      const result = bulkShareDocumentsSchema.safeParse({
        ids: [validId],
        recipientIds: [uuidv4()],
        permission: 'read',
      });
      expect(result.success).toBe(false);
    });
  });
});
