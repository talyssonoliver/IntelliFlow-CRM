/**
 * Contact Validator Tests
 *
 * These tests verify the Zod validation schemas for Contact-related operations.
 * They ensure that input validation works correctly for all API endpoints
 * that deal with contacts.
 */

import { describe, it, expect } from 'vitest';
import {
  createContactSchema,
  updateContactSchema,
  contactQuerySchema,
  contactResponseSchema,
  contactListResponseSchema,
} from '../src/contact';

describe('Contact Validators', () => {
  describe('createContactSchema', () => {
    it('should validate valid contact creation data', () => {
      const validData = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Senior Manager',
        phone: '+1-555-0100',
        department: 'Sales',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createContactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate contact with minimal required data', () => {
      const minimalData = {
        email: 'minimal@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const result = createContactSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email');
      }
    });

    it('should transform email to lowercase', () => {
      const data = {
        email: 'UPPERCASE@EXAMPLE.COM',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = createContactSchema.safeParse(data);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.email).toBe('uppercase@example.com');
      }
    });

    it('should reject email with leading/trailing whitespace', () => {
      const data = {
        email: '  spaces@example.com  ',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = createContactSchema.safeParse(data);

      // Email validation happens before trim, so spaces cause failure
      expect(result.success).toBe(false);
    });

    it('should reject empty firstName', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: '',
        lastName: 'Doe',
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject firstName exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'A'.repeat(101), // Max is 100
        lastName: 'Doe',
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty lastName', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: '',
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject lastName exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'B'.repeat(101), // Max is 100
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject title exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'T'.repeat(101), // Max is 100
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept valid phone number with spaces and dashes', () => {
      const validData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1-555-123-4567',
      };

      const result = createContactSchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        // Phone should be normalized (spaces/dashes removed)
        expect(result.data.phone).toBe('+15551234567');
      }
    });

    it('should accept valid phone with parentheses', () => {
      const validData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1 (555) 123-4567',
      };

      const result = createContactSchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.phone).toBe('+15551234567');
      }
    });

    it('should reject invalid phone format', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: 'not-a-phone',
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject department exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        department: 'D'.repeat(101), // Max is 100
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate accountId when provided', () => {
      const validData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createContactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid accountId', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: 'not-a-uuid',
      };

      const result = createContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('updateContactSchema', () => {
    it('should validate valid update data', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        firstName: 'Jane',
        lastName: 'Smith',
        title: 'VP of Sales',
      };

      const result = updateContactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require id field', () => {
      const invalidData = {
        firstName: 'John',
      };

      const result = updateContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate partial updates', () => {
      const partialData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        department: 'Marketing',
      };

      const result = updateContactSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'not-a-uuid',
        firstName: 'John',
      };

      const result = updateContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate email update', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'newemail@example.com',
      };

      const result = updateContactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'invalid-email',
      };

      const result = updateContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty firstName when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        firstName: '',
      };

      const result = updateContactSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow null accountId', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        accountId: null,
      };

      const result = updateContactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate accountId when not null', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        accountId: '456e4567-e89b-12d3-a456-426614174000',
      };

      const result = updateContactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate update with all fields', () => {
      const fullUpdate = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'Name',
        title: 'Director',
        phone: '+1-555-9999',
        department: 'Engineering',
        accountId: '456e4567-e89b-12d3-a456-426614174000',
      };

      const result = updateContactSchema.safeParse(fullUpdate);
      expect(result.success).toBe(true);
    });
  });

  describe('contactQuerySchema', () => {
    it('should validate valid query params', () => {
      const validQuery = {
        page: 1,
        limit: 20,
        search: 'john',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
        department: 'Sales',
      };

      const result = contactQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate minimal query', () => {
      const minimalQuery = {};

      const result = contactQuerySchema.safeParse(minimalQuery);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should reject search exceeding max length', () => {
      const invalidQuery = {
        search: 'S'.repeat(201), // Max is 200
      };

      const result = contactQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate accountId filter', () => {
      const queryWithAccount = {
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = contactQuerySchema.safeParse(queryWithAccount);
      expect(result.success).toBe(true);
    });

    it('should reject invalid accountId', () => {
      const invalidQuery = {
        accountId: 'not-a-uuid',
      };

      const result = contactQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate ownerId filter', () => {
      const queryWithOwner = {
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = contactQuerySchema.safeParse(queryWithOwner);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ownerId', () => {
      const invalidQuery = {
        ownerId: 'invalid-id',
      };

      const result = contactQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate department filter', () => {
      const queryWithDept = {
        department: 'Engineering',
      };

      const result = contactQuerySchema.safeParse(queryWithDept);
      expect(result.success).toBe(true);
    });

    it('should validate complex filter combination', () => {
      const complexQuery = {
        page: 2,
        limit: 50,
        search: 'sales contacts',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        department: 'Sales',
        sortBy: 'lastName',
        sortOrder: 'asc' as const,
      };

      const result = contactQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('contactResponseSchema', () => {
    it('should validate valid contact response', () => {
      const validResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Manager',
        phone: '+15551234567',
        department: 'Sales',
        accountId: '456e4567-e89b-12d3-a456-426614174000',
        ownerId: '789e4567-e89b-12d3-a456-426614174000',
        leadId: 'abce4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = contactResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept null for optional fields', () => {
      const responseWithNulls = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'minimal@example.com',
        firstName: 'Minimal',
        lastName: 'Contact',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        ownerId: '789e4567-e89b-12d3-a456-426614174000',
        leadId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = contactResponseSchema.safeParse(responseWithNulls);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        ownerId: '789e4567-e89b-12d3-a456-426614174000',
        leadId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = contactResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should validate email format', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'valid.email@example.com',
        firstName: 'Test',
        lastName: 'User',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        ownerId: '789e4567-e89b-12d3-a456-426614174000',
        leadId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = contactResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const invalidResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'not-an-email',
        firstName: 'Test',
        lastName: 'User',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        ownerId: '789e4567-e89b-12d3-a456-426614174000',
        leadId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = contactResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('contactListResponseSchema', () => {
    it('should validate valid contact list response', () => {
      const validList = {
        contacts: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            title: 'Manager',
            phone: '+15551234567',
            department: 'Sales',
            accountId: '456e4567-e89b-12d3-a456-426614174000',
            ownerId: '789e4567-e89b-12d3-a456-426614174000',
            leadId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
        ],
        total: 100,
        page: 1,
        limit: 20,
        hasMore: true,
      };

      const result = contactListResponseSchema.safeParse(validList);
      expect(result.success).toBe(true);
    });

    it('should validate empty contact list', () => {
      const emptyList = {
        contacts: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = contactListResponseSchema.safeParse(emptyList);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const invalidList = {
        contacts: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = contactListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject zero page', () => {
      const invalidList = {
        contacts: [],
        total: 0,
        page: 0,
        limit: 20,
        hasMore: false,
      };

      const result = contactListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should validate multiple contacts', () => {
      const multipleContacts = {
        contacts: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            title: 'Manager',
            phone: '+15551234567',
            department: 'Sales',
            accountId: '456e4567-e89b-12d3-a456-426614174000',
            ownerId: '789e4567-e89b-12d3-a456-426614174000',
            leadId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
          {
            id: '321e4567-e89b-12d3-a456-426614174000',
            email: 'jane@example.com',
            firstName: 'Jane',
            lastName: 'Smith',
            title: null,
            phone: null,
            department: null,
            accountId: null,
            ownerId: '789e4567-e89b-12d3-a456-426614174000',
            leadId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = contactListResponseSchema.safeParse(multipleContacts);
      expect(result.success).toBe(true);
    });
  });
});
