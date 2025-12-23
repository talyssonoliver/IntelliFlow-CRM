/**
 * Account Validator Tests
 *
 * These tests verify the Zod validation schemas for Account-related operations.
 * They ensure that input validation works correctly for all API endpoints
 * that deal with accounts.
 */

import { describe, it, expect } from 'vitest';
import {
  createAccountSchema,
  updateAccountSchema,
  accountQuerySchema,
  accountResponseSchema,
  accountListResponseSchema,
} from '../src/account';

describe('Account Validators', () => {
  describe('createAccountSchema', () => {
    it('should validate valid account creation data', () => {
      const validData = {
        name: 'Acme Corporation',
        website: 'https://acme.com',
        industry: 'Technology',
        employees: 500,
        revenue: 10000000,
        description: 'Leading tech company',
      };

      const result = createAccountSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate account with minimal required data', () => {
      const minimalData = {
        name: 'Minimal Corp',
      };

      const result = createAccountSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject name exceeding max length', () => {
      const invalidData = {
        name: 'A'.repeat(201), // Max is 200
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid website URL', () => {
      const invalidData = {
        name: 'Test Corp',
        website: 'not-a-url',
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept valid website URL', () => {
      const validData = {
        name: 'Test Corp',
        website: 'https://example.com',
      };

      const result = createAccountSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject industry exceeding max length', () => {
      const invalidData = {
        name: 'Test Corp',
        industry: 'I'.repeat(101), // Max is 100
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer employees', () => {
      const invalidData = {
        name: 'Test Corp',
        employees: 50.5,
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative employees', () => {
      const invalidData = {
        name: 'Test Corp',
        employees: -10,
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject zero employees', () => {
      const invalidData = {
        name: 'Test Corp',
        employees: 0,
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative revenue', () => {
      const invalidData = {
        name: 'Test Corp',
        revenue: -1000,
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject zero revenue', () => {
      const invalidData = {
        name: 'Test Corp',
        revenue: 0,
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept positive revenue', () => {
      const validData = {
        name: 'Test Corp',
        revenue: 5000000,
      };

      const result = createAccountSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject description exceeding max length', () => {
      const invalidData = {
        name: 'Test Corp',
        description: 'D'.repeat(1001), // Max is 1000
      };

      const result = createAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate all optional fields together', () => {
      const fullData = {
        name: 'Full Corp',
        website: 'https://fullcorp.com',
        industry: 'Finance',
        employees: 1000,
        revenue: 50000000,
        description: 'A comprehensive description of the account',
      };

      const result = createAccountSchema.safeParse(fullData);
      expect(result.success).toBe(true);
    });
  });

  describe('updateAccountSchema', () => {
    it('should validate valid update data', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Updated Corp',
        industry: 'Healthcare',
      };

      const result = updateAccountSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require id field', () => {
      const invalidData = {
        name: 'Updated Corp',
      };

      const result = updateAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate partial updates', () => {
      const partialData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employees: 750,
      };

      const result = updateAccountSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'not-a-uuid',
        name: 'Updated Corp',
      };

      const result = updateAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty name when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: '',
      };

      const result = updateAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid website when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        website: 'invalid-url',
      };

      const result = updateAccountSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate update with all fields', () => {
      const fullUpdate = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Fully Updated Corp',
        website: 'https://updated.com',
        industry: 'Retail',
        employees: 2000,
        revenue: 75000000,
        description: 'Updated description',
      };

      const result = updateAccountSchema.safeParse(fullUpdate);
      expect(result.success).toBe(true);
    });
  });

  describe('accountQuerySchema', () => {
    it('should validate valid query params', () => {
      const validQuery = {
        page: 1,
        limit: 20,
        search: 'acme',
        industry: 'Technology',
        minRevenue: 100000,
        maxRevenue: 10000000,
      };

      const result = accountQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate minimal query', () => {
      const minimalQuery = {};

      const result = accountQuerySchema.safeParse(minimalQuery);
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

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate ownerId filter', () => {
      const queryWithOwner = {
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = accountQuerySchema.safeParse(queryWithOwner);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ownerId', () => {
      const invalidQuery = {
        ownerId: 'not-a-uuid',
      };

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject negative minRevenue', () => {
      const invalidQuery = {
        minRevenue: -1000,
      };

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject zero minRevenue', () => {
      const invalidQuery = {
        minRevenue: 0,
      };

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject negative maxRevenue', () => {
      const invalidQuery = {
        maxRevenue: -5000,
      };

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject negative minEmployees', () => {
      const invalidQuery = {
        minEmployees: -10,
      };

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer minEmployees', () => {
      const invalidQuery = {
        minEmployees: 50.5,
      };

      const result = accountQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate complex filter combination', () => {
      const complexQuery = {
        page: 2,
        limit: 50,
        search: 'tech companies',
        industry: 'Technology',
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
        minRevenue: 1000000,
        maxRevenue: 50000000,
        minEmployees: 100,
        maxEmployees: 5000,
        sortBy: 'revenue',
        sortOrder: 'asc' as const,
      };

      const result = accountQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('accountResponseSchema', () => {
    it('should validate valid account response', () => {
      const validResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Acme Corp',
        website: 'https://acme.com',
        industry: 'Technology',
        employees: 500,
        revenue: '10000000.00',
        description: 'Tech company',
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = accountResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept null for optional fields', () => {
      const responseWithNulls = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Minimal Corp',
        website: null,
        industry: null,
        employees: null,
        revenue: null,
        description: null,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = accountResponseSchema.safeParse(responseWithNulls);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Corp',
        website: null,
        industry: null,
        employees: null,
        revenue: null,
        description: null,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = accountResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should validate revenue as string', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Corp',
        website: null,
        industry: null,
        employees: null,
        revenue: '5000000.50',
        description: null,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = accountResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(typeof result.data.revenue).toBe('string');
      }
    });
  });

  describe('accountListResponseSchema', () => {
    it('should validate valid account list response', () => {
      const validList = {
        accounts: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Acme Corp',
            website: 'https://acme.com',
            industry: 'Technology',
            employees: 500,
            revenue: '10000000.00',
            description: 'Tech company',
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
        ],
        total: 100,
        page: 1,
        limit: 20,
        hasMore: true,
      };

      const result = accountListResponseSchema.safeParse(validList);
      expect(result.success).toBe(true);
    });

    it('should validate empty account list', () => {
      const emptyList = {
        accounts: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = accountListResponseSchema.safeParse(emptyList);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const invalidList = {
        accounts: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = accountListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject zero page', () => {
      const invalidList = {
        accounts: [],
        total: 0,
        page: 0,
        limit: 20,
        hasMore: false,
      };

      const result = accountListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject negative page', () => {
      const invalidList = {
        accounts: [],
        total: 0,
        page: -1,
        limit: 20,
        hasMore: false,
      };

      const result = accountListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject zero limit', () => {
      const invalidList = {
        accounts: [],
        total: 0,
        page: 1,
        limit: 0,
        hasMore: false,
      };

      const result = accountListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should validate multiple accounts', () => {
      const multipleAccounts = {
        accounts: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Acme Corp',
            website: 'https://acme.com',
            industry: 'Technology',
            employees: 500,
            revenue: '10000000.00',
            description: 'Tech company',
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
          {
            id: '789e4567-e89b-12d3-a456-426614174000',
            name: 'Beta Inc',
            website: null,
            industry: null,
            employees: null,
            revenue: null,
            description: null,
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = accountListResponseSchema.safeParse(multipleAccounts);
      expect(result.success).toBe(true);
    });
  });
});
