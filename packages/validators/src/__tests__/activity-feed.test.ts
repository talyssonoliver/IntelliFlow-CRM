import { describe, it, expect } from 'vitest';
import {
  unifiedFeedSourceSchema,
  unifiedFeedTypeSchema,
  unifiedFeedEntityTypeSchema,
  unifiedFeedQuerySchema,
  entityFeedQuerySchema,
  activityActorSchema,
  activityEntitySchema,
  unifiedActivityItemSchema,
  unifiedFeedPageSchema,
} from '../activity-feed';
import {
  ACTIVITY_FEED_SOURCES,
  ACTIVITY_FEED_TYPES,
  ACTIVITY_FEED_ENTITY_TYPES,
} from '@intelliflow/domain';

describe('Activity Feed Validators', () => {
  // =========================================================================
  // Enum Schemas — derived from domain constants (Single Source of Truth)
  // =========================================================================

  describe('unifiedFeedSourceSchema', () => {
    it('accepts all 7 valid sources', () => {
      for (const source of ACTIVITY_FEED_SOURCES) {
        expect(unifiedFeedSourceSchema.parse(source)).toBe(source);
      }
    });

    it('rejects invalid source', () => {
      expect(() => unifiedFeedSourceSchema.parse('INVALID')).toThrow();
      expect(() => unifiedFeedSourceSchema.parse('')).toThrow();
      expect(() => unifiedFeedSourceSchema.parse(123)).toThrow();
    });
  });

  describe('unifiedFeedTypeSchema', () => {
    it('accepts all 17 valid types', () => {
      for (const type of ACTIVITY_FEED_TYPES) {
        expect(unifiedFeedTypeSchema.parse(type)).toBe(type);
      }
    });

    it('rejects invalid type', () => {
      expect(() => unifiedFeedTypeSchema.parse('INVALID')).toThrow();
      expect(() => unifiedFeedTypeSchema.parse('email')).toThrow(); // lowercase
    });
  });

  describe('unifiedFeedEntityTypeSchema', () => {
    it('accepts all 5 valid entity types', () => {
      for (const entityType of ACTIVITY_FEED_ENTITY_TYPES) {
        expect(unifiedFeedEntityTypeSchema.parse(entityType)).toBe(entityType);
      }
    });

    it('rejects invalid entity type', () => {
      expect(() => unifiedFeedEntityTypeSchema.parse('USER')).toThrow();
      expect(() => unifiedFeedEntityTypeSchema.parse('lead')).toThrow(); // lowercase
    });
  });

  // =========================================================================
  // Query Input Schemas
  // =========================================================================

  describe('unifiedFeedQuerySchema', () => {
    it('accepts minimal input with defaults', () => {
      const result = unifiedFeedQuerySchema.parse({});
      expect(result.limit).toBe(20);
      expect(result.cursor).toBeUndefined();
      expect(result.types).toBeUndefined();
      expect(result.sources).toBeUndefined();
      expect(result.entityType).toBeUndefined();
      expect(result.entityId).toBeUndefined();
      expect(result.after).toBeUndefined();
      expect(result.before).toBeUndefined();
    });

    it('accepts custom limit', () => {
      const result = unifiedFeedQuerySchema.parse({ limit: 50 });
      expect(result.limit).toBe(50);
    });

    it('clamps limit to minimum of 1', () => {
      expect(() => unifiedFeedQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => unifiedFeedQuerySchema.parse({ limit: -1 })).toThrow();
    });

    it('clamps limit to maximum of 100', () => {
      expect(() => unifiedFeedQuerySchema.parse({ limit: 101 })).toThrow();
      expect(() => unifiedFeedQuerySchema.parse({ limit: 1000 })).toThrow();
    });

    it('accepts valid cursor string', () => {
      const cursor = Buffer.from('2026-01-01T00:00:00.000Z|some-id').toString('base64');
      const result = unifiedFeedQuerySchema.parse({ cursor });
      expect(result.cursor).toBe(cursor);
    });

    it('accepts null cursor', () => {
      const result = unifiedFeedQuerySchema.parse({ cursor: null });
      expect(result.cursor).toBeNull();
    });

    it('accepts types array filter', () => {
      const result = unifiedFeedQuerySchema.parse({ types: ['EMAIL', 'CALL'] });
      expect(result.types).toEqual(['EMAIL', 'CALL']);
    });

    it('rejects invalid type in types array', () => {
      expect(() => unifiedFeedQuerySchema.parse({ types: ['INVALID'] })).toThrow();
    });

    it('accepts sources array filter', () => {
      const result = unifiedFeedQuerySchema.parse({ sources: ['LEAD_ACTIVITY', 'EMAIL'] });
      expect(result.sources).toEqual(['LEAD_ACTIVITY', 'EMAIL']);
    });

    it('rejects invalid source in sources array', () => {
      expect(() => unifiedFeedQuerySchema.parse({ sources: ['BAD_SOURCE'] })).toThrow();
    });

    it('accepts entityType filter', () => {
      const result = unifiedFeedQuerySchema.parse({ entityType: 'LEAD' });
      expect(result.entityType).toBe('LEAD');
    });

    it('rejects invalid entityType', () => {
      expect(() => unifiedFeedQuerySchema.parse({ entityType: 'INVALID' })).toThrow();
    });

    it('accepts entityId filter', () => {
      const result = unifiedFeedQuerySchema.parse({ entityId: 'some-id-123' });
      expect(result.entityId).toBe('some-id-123');
    });

    it('accepts date range filters', () => {
      const after = new Date('2026-01-01');
      const before = new Date('2026-02-01');
      const result = unifiedFeedQuerySchema.parse({ after, before });
      expect(result.after).toEqual(after);
      expect(result.before).toEqual(before);
    });

    it('accepts full query with all fields', () => {
      const input = {
        limit: 50,
        cursor: 'abc',
        types: ['EMAIL'] as const,
        sources: ['LEAD_ACTIVITY'] as const,
        entityType: 'LEAD' as const,
        entityId: 'lead-123',
        after: new Date('2026-01-01'),
        before: new Date('2026-02-01'),
      };
      const result = unifiedFeedQuerySchema.parse(input);
      expect(result.limit).toBe(50);
      expect(result.entityType).toBe('LEAD');
    });

    it('rejects non-integer limit', () => {
      expect(() => unifiedFeedQuerySchema.parse({ limit: 10.5 })).toThrow();
    });
  });

  describe('entityFeedQuerySchema', () => {
    it('requires entityType and entityId', () => {
      expect(() => entityFeedQuerySchema.parse({})).toThrow();
      expect(() => entityFeedQuerySchema.parse({ entityType: 'LEAD' })).toThrow();
      expect(() => entityFeedQuerySchema.parse({ entityId: 'abc' })).toThrow();
    });

    it('accepts valid minimal input with defaults', () => {
      const result = entityFeedQuerySchema.parse({
        entityType: 'CONTACT',
        entityId: 'contact-123',
      });
      expect(result.entityType).toBe('CONTACT');
      expect(result.entityId).toBe('contact-123');
      expect(result.limit).toBe(20);
      expect(result.cursor).toBeUndefined();
      expect(result.types).toBeUndefined();
    });

    it('accepts optional types filter', () => {
      const result = entityFeedQuerySchema.parse({
        entityType: 'LEAD',
        entityId: 'lead-123',
        types: ['EMAIL', 'CALL'],
      });
      expect(result.types).toEqual(['EMAIL', 'CALL']);
    });

    it('enforces limit bounds', () => {
      expect(() => entityFeedQuerySchema.parse({
        entityType: 'LEAD',
        entityId: 'id',
        limit: 0,
      })).toThrow();
      expect(() => entityFeedQuerySchema.parse({
        entityType: 'LEAD',
        entityId: 'id',
        limit: 101,
      })).toThrow();
    });
  });

  // =========================================================================
  // Response Schemas
  // =========================================================================

  describe('activityActorSchema', () => {
    it('accepts valid actor with null id', () => {
      const result = activityActorSchema.parse({ id: null, name: 'System' });
      expect(result.id).toBeNull();
      expect(result.name).toBe('System');
    });

    it('accepts valid actor with id and avatarUrl', () => {
      const result = activityActorSchema.parse({
        id: 'user-123',
        name: 'John Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      expect(result.id).toBe('user-123');
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('accepts actor with null avatarUrl', () => {
      const result = activityActorSchema.parse({ id: 'user-1', name: 'Test', avatarUrl: null });
      expect(result.avatarUrl).toBeNull();
    });

    it('requires name', () => {
      expect(() => activityActorSchema.parse({ id: 'user-1' })).toThrow();
    });
  });

  describe('activityEntitySchema', () => {
    it('accepts valid entity', () => {
      const result = activityEntitySchema.parse({
        id: 'lead-123',
        type: 'LEAD',
        name: 'John Doe',
      });
      expect(result.type).toBe('LEAD');
    });

    it('rejects invalid entity type', () => {
      expect(() => activityEntitySchema.parse({
        id: 'x',
        type: 'INVALID',
        name: 'test',
      })).toThrow();
    });

    it('requires all fields', () => {
      expect(() => activityEntitySchema.parse({ id: 'x', type: 'LEAD' })).toThrow();
      expect(() => activityEntitySchema.parse({ id: 'x', name: 'test' })).toThrow();
    });
  });

  describe('unifiedActivityItemSchema', () => {
    const validItem = {
      id: 'lead_abc123',
      source: 'LEAD_ACTIVITY',
      type: 'EMAIL',
      title: 'Sent follow-up email',
      description: null,
      timestamp: new Date('2026-01-15T10:00:00Z'),
      actor: { id: 'user-1', name: 'John Doe' },
      entity: { id: 'lead-1', type: 'LEAD', name: 'Jane Smith' },
      metadata: null,
    };

    it('accepts a valid item', () => {
      const result = unifiedActivityItemSchema.parse(validItem);
      expect(result.id).toBe('lead_abc123');
      expect(result.source).toBe('LEAD_ACTIVITY');
      expect(result.type).toBe('EMAIL');
    });

    it('accepts item with null actor and entity', () => {
      const result = unifiedActivityItemSchema.parse({
        ...validItem,
        actor: null,
        entity: null,
      });
      expect(result.actor).toBeNull();
      expect(result.entity).toBeNull();
    });

    it('accepts item with metadata', () => {
      const result = unifiedActivityItemSchema.parse({
        ...validItem,
        metadata: { status: 'sent', openCount: 3 },
      });
      expect(result.metadata).toEqual({ status: 'sent', openCount: 3 });
    });

    it('rejects invalid source', () => {
      expect(() => unifiedActivityItemSchema.parse({
        ...validItem,
        source: 'INVALID',
      })).toThrow();
    });

    it('rejects invalid type', () => {
      expect(() => unifiedActivityItemSchema.parse({
        ...validItem,
        type: 'INVALID',
      })).toThrow();
    });
  });

  describe('unifiedFeedPageSchema', () => {
    it('accepts valid page with items', () => {
      const page = {
        items: [{
          id: 'lead_1',
          source: 'LEAD_ACTIVITY',
          type: 'EMAIL',
          title: 'Test',
          description: null,
          timestamp: new Date(),
          actor: null,
          entity: null,
          metadata: null,
        }],
        nextCursor: 'abc123',
        hasMore: true,
      };
      const result = unifiedFeedPageSchema.parse(page);
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('abc123');
    });

    it('accepts empty page', () => {
      const result = unifiedFeedPageSchema.parse({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });
  });
});
