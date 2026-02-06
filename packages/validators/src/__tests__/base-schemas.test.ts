/**
 * Base Schemas Validators Tests
 *
 * Tests the foundational composable Zod schemas used across the application.
 * Covers base entity, soft-deletable, tenant, owned entity schemas,
 * and generic paginated response and API success wrappers.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  baseEntitySchema,
  softDeletableEntitySchema,
  tenantEntitySchema,
  ownedEntitySchema,
  paginatedResponseSchema,
  apiSuccessSchema,
} from '../base-schemas';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_3 = '770e8400-e29b-41d4-a716-446655440002';

describe('Base Schemas', () => {
  // ==========================================================================
  // baseEntitySchema
  // ==========================================================================

  describe('baseEntitySchema', () => {
    const validEntity = {
      id: VALID_UUID,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-01T14:30:00Z',
    };

    it('should accept valid base entity with string dates', () => {
      const result = baseEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(VALID_UUID);
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should accept valid base entity with Date objects', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-02-01T14:30:00Z'),
      };
      const result = baseEntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const result = baseEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should reject invalid UUID for id', () => {
      const entity = { ...validEntity, id: 'not-a-uuid' };
      const result = baseEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject empty string for id', () => {
      const entity = { ...validEntity, id: '' };
      const result = baseEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = baseEntitySchema.safeParse({
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing createdAt', () => {
      const result = baseEntitySchema.safeParse({
        id: VALID_UUID,
        updatedAt: new Date(),
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing updatedAt', () => {
      const result = baseEntitySchema.safeParse({
        id: VALID_UUID,
        createdAt: new Date(),
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = baseEntitySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject non-date string for createdAt', () => {
      const entity = { ...validEntity, createdAt: 'not-a-date' };
      const result = baseEntitySchema.safeParse(entity);
      // z.coerce.date() will attempt to parse; 'not-a-date' produces Invalid Date
      expect(result.success).toBe(false);
    });

    it('should accept numeric timestamps for date fields', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = baseEntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
      }
    });

    it('should reject null for id', () => {
      const entity = { ...validEntity, id: null };
      const result = baseEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // softDeletableEntitySchema
  // ==========================================================================

  describe('softDeletableEntitySchema', () => {
    const validEntity = {
      id: VALID_UUID,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-01T14:30:00Z',
      deletedAt: null,
    };

    it('should accept valid soft-deletable entity with null deletedAt', () => {
      const result = softDeletableEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedAt).toBeNull();
      }
    });

    it('should accept with a deletedAt date', () => {
      const entity = {
        ...validEntity,
        deletedAt: '2026-02-05T12:00:00Z',
      };
      const result = softDeletableEntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedAt).toBeInstanceOf(Date);
      }
    });

    it('should include all base entity fields', () => {
      const result = softDeletableEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(VALID_UUID);
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should reject missing deletedAt field', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = softDeletableEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject invalid id', () => {
      const entity = { ...validEntity, id: 'bad-id' };
      const result = softDeletableEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should coerce deletedAt string to Date', () => {
      const entity = { ...validEntity, deletedAt: '2026-02-05T12:00:00Z' };
      const result = softDeletableEntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedAt).toBeInstanceOf(Date);
      }
    });
  });

  // ==========================================================================
  // tenantEntitySchema
  // ==========================================================================

  describe('tenantEntitySchema', () => {
    const validEntity = {
      id: VALID_UUID,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-01T14:30:00Z',
      tenantId: VALID_UUID_2,
    };

    it('should accept valid tenant entity', () => {
      const result = tenantEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantId).toBe(VALID_UUID_2);
      }
    });

    it('should include all base entity fields', () => {
      const result = tenantEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(VALID_UUID);
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should reject invalid tenantId', () => {
      const entity = { ...validEntity, tenantId: 'not-a-uuid' };
      const result = tenantEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject missing tenantId', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = tenantEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject empty string for tenantId', () => {
      const entity = { ...validEntity, tenantId: '' };
      const result = tenantEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject null for tenantId', () => {
      const entity = { ...validEntity, tenantId: null };
      const result = tenantEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // ownedEntitySchema
  // ==========================================================================

  describe('ownedEntitySchema', () => {
    const validEntity = {
      id: VALID_UUID,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-01T14:30:00Z',
      tenantId: VALID_UUID_2,
      ownerId: VALID_UUID_3,
    };

    it('should accept valid owned entity', () => {
      const result = ownedEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ownerId).toBe(VALID_UUID_3);
        expect(result.data.tenantId).toBe(VALID_UUID_2);
      }
    });

    it('should include all tenant entity fields (id, createdAt, updatedAt, tenantId)', () => {
      const result = ownedEntitySchema.safeParse(validEntity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(VALID_UUID);
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
        expect(result.data.tenantId).toBe(VALID_UUID_2);
        expect(result.data.ownerId).toBe(VALID_UUID_3);
      }
    });

    it('should reject invalid ownerId', () => {
      const entity = { ...validEntity, ownerId: 'not-uuid' };
      const result = ownedEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject missing ownerId', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: VALID_UUID_2,
      };
      const result = ownedEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject missing tenantId', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerId: VALID_UUID_3,
      };
      const result = ownedEntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = ownedEntitySchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // paginatedResponseSchema
  // ==========================================================================

  describe('paginatedResponseSchema', () => {
    const stringItemSchema = z.string();
    const paginatedStrings = paginatedResponseSchema(stringItemSchema);

    it('should accept valid paginated response', () => {
      const result = paginatedStrings.safeParse({
        data: ['item1', 'item2', 'item3'],
        total: 50,
        page: 1,
        limit: 20,
        hasMore: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data).toHaveLength(3);
        expect(result.data.total).toBe(50);
        expect(result.data.hasMore).toBe(true);
      }
    });

    it('should accept empty data array', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject page of 0 (must be positive)', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 0,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative page', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: -1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit of 0 (must be positive)', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 1,
        limit: 101,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should accept limit at boundary 100', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 1,
        limit: 100,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept limit at boundary 1', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 1,
        limit: 1,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-integer total', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 5.5,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing hasMore', () => {
      const result = paginatedStrings.safeParse({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      expect(result.success).toBe(false);
    });

    it('should work with object item schemas', () => {
      const objectSchema = z.object({ name: z.string(), value: z.number() });
      const paginated = paginatedResponseSchema(objectSchema);

      const result = paginated.safeParse({
        data: [
          { name: 'Test', value: 42 },
          { name: 'Another', value: 100 },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject items that do not match the item schema', () => {
      const result = paginatedStrings.safeParse({
        data: [123, 456],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });

    it('should be a generic function that returns a Zod schema', () => {
      expect(typeof paginatedResponseSchema).toBe('function');
      const schema = paginatedResponseSchema(z.string());
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    });
  });

  // ==========================================================================
  // apiSuccessSchema
  // ==========================================================================

  describe('apiSuccessSchema', () => {
    const stringSuccessSchema = apiSuccessSchema(z.string());

    it('should accept valid success response with explicit timestamp', () => {
      const result = stringSuccessSchema.safeParse({
        success: true,
        data: 'Hello, World!',
        timestamp: '2026-02-05T12:00:00Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.data).toBe('Hello, World!');
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should apply default timestamp when not provided', () => {
      const beforeParse = new Date();
      const result = stringSuccessSchema.safeParse({
        success: true,
        data: 'test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeInstanceOf(Date);
        // Timestamp should be close to now
        expect(result.data.timestamp.getTime()).toBeGreaterThanOrEqual(beforeParse.getTime() - 1000);
      }
    });

    it('should reject success: false (must be literal true)', () => {
      const result = stringSuccessSchema.safeParse({
        success: false,
        data: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('should reject data that does not match the data schema', () => {
      const result = stringSuccessSchema.safeParse({
        success: true,
        data: 12345,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing data field', () => {
      const result = stringSuccessSchema.safeParse({
        success: true,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing success field', () => {
      const result = stringSuccessSchema.safeParse({
        data: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('should work with object data schemas', () => {
      const objectSuccessSchema = apiSuccessSchema(
        z.object({ id: z.string(), name: z.string() })
      );

      const result = objectSuccessSchema.safeParse({
        success: true,
        data: { id: '123', name: 'Test Entity' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.id).toBe('123');
        expect(result.data.data.name).toBe('Test Entity');
      }
    });

    it('should work with number data schema', () => {
      const numberSuccessSchema = apiSuccessSchema(z.number());
      const result = numberSuccessSchema.safeParse({
        success: true,
        data: 42,
      });
      expect(result.success).toBe(true);
    });

    it('should be a generic function that returns a Zod schema', () => {
      expect(typeof apiSuccessSchema).toBe('function');
      const schema = apiSuccessSchema(z.boolean());
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    });

    it('should reject non-boolean success value', () => {
      const result = stringSuccessSchema.safeParse({
        success: 'true',
        data: 'test',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Schema Composition Tests
  // ==========================================================================

  describe('schema composition and extension', () => {
    it('softDeletableEntitySchema extends baseEntitySchema', () => {
      // It should have all base entity fields plus deletedAt
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const baseResult = baseEntitySchema.safeParse(entity);
      const softResult = softDeletableEntitySchema.safeParse(entity);

      expect(baseResult.success).toBe(true);
      expect(softResult.success).toBe(true);
    });

    it('tenantEntitySchema extends baseEntitySchema', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: VALID_UUID_2,
      };
      const baseResult = baseEntitySchema.safeParse(entity);
      const tenantResult = tenantEntitySchema.safeParse(entity);

      expect(baseResult.success).toBe(true);
      expect(tenantResult.success).toBe(true);
    });

    it('ownedEntitySchema extends tenantEntitySchema', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: VALID_UUID_2,
        ownerId: VALID_UUID_3,
      };
      const tenantResult = tenantEntitySchema.safeParse(entity);
      const ownedResult = ownedEntitySchema.safeParse(entity);

      expect(tenantResult.success).toBe(true);
      expect(ownedResult.success).toBe(true);
    });

    it('base entity without tenantId fails tenant schema', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(baseEntitySchema.safeParse(entity).success).toBe(true);
      expect(tenantEntitySchema.safeParse(entity).success).toBe(false);
    });

    it('tenant entity without ownerId fails owned schema', () => {
      const entity = {
        id: VALID_UUID,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: VALID_UUID_2,
      };
      expect(tenantEntitySchema.safeParse(entity).success).toBe(true);
      expect(ownedEntitySchema.safeParse(entity).success).toBe(false);
    });
  });

  // ==========================================================================
  // Schema Export Verification
  // ==========================================================================

  describe('schema exports', () => {
    it('baseEntitySchema is a valid Zod schema', () => {
      expect(baseEntitySchema).toBeDefined();
      expect(typeof baseEntitySchema.safeParse).toBe('function');
      expect(typeof baseEntitySchema.parse).toBe('function');
    });

    it('softDeletableEntitySchema is a valid Zod schema', () => {
      expect(softDeletableEntitySchema).toBeDefined();
      expect(typeof softDeletableEntitySchema.safeParse).toBe('function');
    });

    it('tenantEntitySchema is a valid Zod schema', () => {
      expect(tenantEntitySchema).toBeDefined();
      expect(typeof tenantEntitySchema.safeParse).toBe('function');
    });

    it('ownedEntitySchema is a valid Zod schema', () => {
      expect(ownedEntitySchema).toBeDefined();
      expect(typeof ownedEntitySchema.safeParse).toBe('function');
    });

    it('paginatedResponseSchema is a function that returns a Zod schema', () => {
      expect(typeof paginatedResponseSchema).toBe('function');
    });

    it('apiSuccessSchema is a function that returns a Zod schema', () => {
      expect(typeof apiSuccessSchema).toBe('function');
    });
  });
});
