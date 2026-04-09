/**
 * Lead Validator Tests
 *
 * These tests verify the Zod validation schemas for Lead-related operations.
 * They ensure that input validation works correctly for all API endpoints
 * that deal with leads.
 *
 * This is an example test that demonstrates:
 * - Testing Zod schemas
 * - Validating input constraints
 * - Testing error messages
 * - Ensuring type safety
 */

import { describe, it, expect } from 'vitest';
import {
  createLeadSchema,
  updateLeadSchema,
  updateLeadScoreSchema,
  qualifyLeadSchema,
  convertLeadSchema,
  leadQuerySchema,
  leadResponseSchema,
  leadListResponseSchema,
  leadDetailResponseSchema,
  leadSourceSchema,
  leadStatusSchema,
  LEAD_SORTABLE_FIELDS,
} from '../src/lead';

describe('Lead Validators', () => {
  describe('leadSourceSchema', () => {
    it('should validate valid lead sources', () => {
      const validSources = [
        'WEBSITE',
        'REFERRAL',
        'SOCIAL',
        'EMAIL',
        'COLD_CALL',
        'EVENT',
        'OTHER',
      ];

      validSources.forEach((source) => {
        const result = leadSourceSchema.safeParse(source);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid lead sources', () => {
      const result = leadSourceSchema.safeParse('INVALID_SOURCE');
      expect(result.success).toBe(false);
    });
  });

  describe('leadStatusSchema', () => {
    it('should validate valid lead statuses', () => {
      const validStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];

      validStatuses.forEach((status) => {
        const result = leadStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid lead statuses', () => {
      const result = leadStatusSchema.safeParse('INVALID_STATUS');
      expect(result.success).toBe(false);
    });
  });

  describe('createLeadSchema', () => {
    it('should validate valid lead creation data', () => {
      const validData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+1-555-0100',
        source: 'WEBSITE',
      };

      const result = createLeadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate lead with minimal required data', () => {
      const minimalData = {
        email: 'minimal@example.com',
      };

      const result = createLeadSchema.safeParse(minimalData);
      expect(result.success).toBe(true);

      if (result.success) {
        // Default source should be applied
        expect(result.data.source).toBe('WEBSITE');
      }
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
      };

      const result = createLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email');
      }
    });

    it('should reject empty email', () => {
      const invalidData = {
        email: '',
      };

      const result = createLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate optional fields', () => {
      const dataWithOptionals = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Corp',
        title: 'Manager',
        phone: '+1-555-9999',
        source: 'EMAIL',
      };

      const result = createLeadSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
    });

    it('should reject firstName exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        firstName: 'A'.repeat(101), // Max is 100
      };

      const result = createLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject lastName exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        lastName: 'B'.repeat(101), // Max is 100
      };

      const result = createLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject company exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        company: 'C'.repeat(201), // Max is 200
      };

      const result = createLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid source', () => {
      const invalidData = {
        email: 'test@example.com',
        source: 'INVALID_SOURCE',
      };

      const result = createLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('updateLeadSchema', () => {
    it('should validate valid update data', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        firstName: 'Jane',
        lastName: 'Smith',
        company: 'New Corp',
      };

      const result = updateLeadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require id field', () => {
      const invalidData = {
        firstName: 'John',
      };

      const result = updateLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate partial updates', () => {
      const partialData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'VP of Sales',
      };

      const result = updateLeadSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should strip status field (status changes use dedicated endpoints)', () => {
      const dataWithStatus = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        firstName: 'Jane',
        status: 'CONTACTED',
      };

      const result = updateLeadSchema.safeParse(dataWithStatus);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('status');
      }
    });
  });

  describe('updateLeadScoreSchema', () => {
    it('should validate valid score update', () => {
      const validData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 75,
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = updateLeadScoreSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require all fields', () => {
      const incompleteData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 75,
      };

      const result = updateLeadScoreSchema.safeParse(incompleteData);
      expect(result.success).toBe(false);
    });

    it('should reject score below 0', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: -10,
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = updateLeadScoreSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject score above 100', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 150,
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = updateLeadScoreSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject confidence below 0', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 75,
        confidence: -0.5,
        modelVersion: 'v1.0.0',
      };

      const result = updateLeadScoreSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 75,
        confidence: 1.5,
        modelVersion: 'v1.0.0',
      };

      const result = updateLeadScoreSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer scores', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 75.5,
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const result = updateLeadScoreSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('qualifyLeadSchema', () => {
    it('should validate valid qualify data', () => {
      const validData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Strong product fit and high budget alignment',
      };

      const result = qualifyLeadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require both fields', () => {
      const incompleteData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = qualifyLeadSchema.safeParse(incompleteData);
      expect(result.success).toBe(false);
    });

    it('should reject reason shorter than 10 characters', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Too short',
      };

      const result = qualifyLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject reason longer than 500 characters', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'A'.repeat(501),
      };

      const result = qualifyLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept reason at exactly 10 characters', () => {
      const validData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        reason: '0123456789',
      };

      const result = qualifyLeadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('convertLeadSchema', () => {
    it('should validate valid convert data with account', () => {
      const validData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        createAccount: true,
        accountName: 'Acme Corporation',
        notes: 'Converted after successful demo',
      };

      const result = convertLeadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate convert data without account', () => {
      const validData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        createAccount: false,
      };

      const result = convertLeadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should apply default createAccount value', () => {
      const minimalData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = convertLeadSchema.safeParse(minimalData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createAccount).toBe(true);
      }
    });

    it('should reject notes exceeding max length', () => {
      const invalidData = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'N'.repeat(1001),
      };

      const result = convertLeadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('leadQuerySchema', () => {
    it('should validate valid query params', () => {
      const validQuery = {
        page: 1,
        limit: 20,
        status: ['NEW', 'CONTACTED'],
        minScore: 50,
        maxScore: 100,
        search: 'acme',
      };

      const result = leadQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate minimal query', () => {
      const minimalQuery = {};

      const result = leadQuerySchema.safeParse(minimalQuery);
      expect(result.success).toBe(true);
    });

    it('should validate query with date filters', () => {
      const queryWithDates = {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      };

      const result = leadQuerySchema.safeParse(queryWithDates);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dateFrom).toBeInstanceOf(Date);
        expect(result.data.dateTo).toBeInstanceOf(Date);
      }
    });

    it('should reject minScore out of range', () => {
      const invalidQuery = {
        minScore: -10,
      };

      const result = leadQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject maxScore out of range', () => {
      const invalidQuery = {
        maxScore: 150,
      };

      const result = leadQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate multiple filters', () => {
      const complexQuery = {
        page: 2,
        limit: 50,
        status: ['QUALIFIED'],
        source: ['WEBSITE', 'REFERRAL'],
        minScore: 70,
        search: 'enterprise',
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = leadQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('leadResponseSchema', () => {
    const baseResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'CTO',
      phone: '+1-555-0100',
      source: 'WEBSITE',
      status: 'QUALIFIED',
      score: 85,
      scoreConfidence: 0.92,
      scoreTier: 'HOT',
      ownerId: '456e4567-e89b-12d3-a456-426614174000',
      tenantId: '789e4567-e89b-12d3-a456-426614174000',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    it('should validate valid lead response', () => {
      const result = leadResponseSchema.safeParse(baseResponse);
      expect(result.success).toBe(true);
    });

    it('should accept null for nullable fields', () => {
      const responseWithNulls = {
        ...baseResponse,
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        score: 0,
        scoreConfidence: null,
        scoreTier: null,
      };

      const result = leadResponseSchema.safeParse(responseWithNulls);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const result = leadResponseSchema.safeParse(baseResponse);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should validate scoreConfidence and scoreTier fields', () => {
      const result = leadResponseSchema.safeParse(baseResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scoreConfidence).toBe(0.92);
        expect(result.data.scoreTier).toBe('HOT');
        expect(result.data.tenantId).toBe('789e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('should reject invalid scoreTier values', () => {
      const result = leadResponseSchema.safeParse({ ...baseResponse, scoreTier: 'INVALID' });
      expect(result.success).toBe(false);
    });
  });

  describe('leadListResponseSchema', () => {
    const sampleLeadItem = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test1@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: null,
      phone: null,
      source: 'WEBSITE',
      status: 'NEW',
      score: 50,
      scoreConfidence: 0.8,
      scoreTier: 'WARM',
      ownerId: '456e4567-e89b-12d3-a456-426614174000',
      tenantId: '789e4567-e89b-12d3-a456-426614174000',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    it('should validate valid lead list response', () => {
      const validList = {
        data: [sampleLeadItem],
        total: 100,
        page: 1,
        limit: 20,
        hasMore: true,
      };

      const result = leadListResponseSchema.safeParse(validList);
      expect(result.success).toBe(true);
    });

    it('should validate empty lead list', () => {
      const emptyList = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = leadListResponseSchema.safeParse(emptyList);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const invalidList = {
        data: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = leadListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative page', () => {
      const invalidList = {
        data: [],
        total: 0,
        page: 0,
        limit: 20,
        hasMore: false,
      };

      const result = leadListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });
  });

  describe('LEAD_SORTABLE_FIELDS', () => {
    it('should contain expected sortable columns', () => {
      expect(LEAD_SORTABLE_FIELDS).toContain('createdAt');
      expect(LEAD_SORTABLE_FIELDS).toContain('updatedAt');
      expect(LEAD_SORTABLE_FIELDS).toContain('firstName');
      expect(LEAD_SORTABLE_FIELDS).toContain('lastName');
      expect(LEAD_SORTABLE_FIELDS).toContain('company');
      expect(LEAD_SORTABLE_FIELDS).toContain('email');
      expect(LEAD_SORTABLE_FIELDS).toContain('score');
      expect(LEAD_SORTABLE_FIELDS).toContain('status');
      expect(LEAD_SORTABLE_FIELDS).toContain('source');
      expect(LEAD_SORTABLE_FIELDS).toContain('lastContactedAt');
      expect(LEAD_SORTABLE_FIELDS).toContain('estimatedValue');
    });

    it('should NOT contain sensitive columns', () => {
      expect(LEAD_SORTABLE_FIELDS).not.toContain('tenantId');
      expect(LEAD_SORTABLE_FIELDS).not.toContain('ownerId');
    });
  });

  describe('leadQuerySchema sortBy validation', () => {
    it('should accept valid sortBy values', () => {
      const validValues = ['createdAt', 'score', 'firstName', 'lastName', 'email'];
      for (const sortBy of validValues) {
        const result = leadQuerySchema.safeParse({ sortBy });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid sortBy values', () => {
      const invalidValues = ['tenantId', 'ownerId', '__proto__', 'password', 'nonExistent', ''];
      for (const sortBy of invalidValues) {
        const result = leadQuerySchema.safeParse({ sortBy });
        expect(result.success).toBe(false);
      }
    });

    it('should accept undefined sortBy (optional field)', () => {
      const result = leadQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortBy).toBeUndefined();
      }
    });
  });

  describe('leadDetailResponseSchema', () => {
    const baseResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'CTO',
      phone: '+1-555-0100',
      source: 'WEBSITE',
      status: 'QUALIFIED',
      score: 85,
      scoreConfidence: 0.92,
      scoreTier: 'HOT',
      ownerId: '456e4567-e89b-12d3-a456-426614174000',
      tenantId: '789e4567-e89b-12d3-a456-426614174000',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    it('should validate response with Lead 360 relation fields', () => {
      const detailResponse = {
        ...baseResponse,
        owner: { id: '456e4567-e89b-12d3-a456-426614174000', email: 'owner@test.com', name: 'Owner', avatarUrl: null, role: 'ADMIN' },
        activities: [{ id: '1', type: 'NOTE', timestamp: '2024-01-01T00:00:00Z' }],
        notes: [{ id: '1', content: 'Test note' }],
        files: [{ id: '1', name: 'doc.pdf' }],
        aiInsight: { summary: 'High potential lead', score: 85 },
        tasks: [{ id: '1', title: 'Follow up', status: 'PENDING' }],
      };

      const result = leadDetailResponseSchema.safeParse(detailResponse);
      expect(result.success).toBe(true);
    });

    it('should validate response without optional relation fields', () => {
      const result = leadDetailResponseSchema.safeParse(baseResponse);
      expect(result.success).toBe(true);
    });

    it('should accept null for owner and aiInsight', () => {
      const detailResponse = {
        ...baseResponse,
        owner: null,
        aiInsight: null,
      };

      const result = leadDetailResponseSchema.safeParse(detailResponse);
      expect(result.success).toBe(true);
    });
  });
});
