import { describe, it, expect } from 'vitest';
import { Entity } from '../Entity';

// Concrete implementation for testing
class TestEntity extends Entity<string> {
  constructor(id: string) {
    super(id);
  }
}

class NumericEntity extends Entity<number> {
  constructor(id: number) {
    super(id);
  }
}

class ObjectIdEntity extends Entity<{ value: string }> {
  constructor(id: { value: string }) {
    super(id);
  }
}

describe('Entity', () => {
  describe('constructor and id getter', () => {
    it('should create entity with string id', () => {
      const entity = new TestEntity('test-id-123');
      expect(entity.id).toBe('test-id-123');
    });

    it('should create entity with numeric id', () => {
      const entity = new NumericEntity(42);
      expect(entity.id).toBe(42);
    });

    it('should create entity with object id', () => {
      const id = { value: 'uuid-123' };
      const entity = new ObjectIdEntity(id);
      expect(entity.id).toBe(id);
      expect(entity.id.value).toBe('uuid-123');
    });

    it('should make id immutable through getter', () => {
      const entity = new TestEntity('original-id');
      expect(entity.id).toBe('original-id');
      // ID cannot be reassigned from outside (readonly property)
    });
  });

  describe('equals - identity-based equality', () => {
    it('should return true for entities with same id', () => {
      const entity1 = new TestEntity('same-id');
      const entity2 = new TestEntity('same-id');
      expect(entity1.equals(entity2)).toBe(true);
    });

    it('should return true when comparing entity to itself', () => {
      const entity = new TestEntity('self-id');
      expect(entity.equals(entity)).toBe(true);
    });

    it('should return false for entities with different ids', () => {
      const entity1 = new TestEntity('id-1');
      const entity2 = new TestEntity('id-2');
      expect(entity1.equals(entity2)).toBe(false);
    });

    it('should return false when comparing to null', () => {
      const entity = new TestEntity('test-id');
      expect(entity.equals(null as any)).toBe(false);
    });

    it('should return false when comparing to undefined', () => {
      const entity = new TestEntity('test-id');
      expect(entity.equals(undefined as any)).toBe(false);
    });

    it('should return false when comparing to non-Entity object', () => {
      const entity = new TestEntity('test-id');
      const nonEntity = { id: 'test-id' };
      expect(entity.equals(nonEntity as any)).toBe(false);
    });

    it('should work with numeric ids', () => {
      const entity1 = new NumericEntity(100);
      const entity2 = new NumericEntity(100);
      const entity3 = new NumericEntity(200);

      expect(entity1.equals(entity2)).toBe(true);
      expect(entity1.equals(entity3)).toBe(false);
    });

    it('should use reference equality for object ids', () => {
      const idObj = { value: 'shared-id' };
      const entity1 = new ObjectIdEntity(idObj);
      const entity2 = new ObjectIdEntity(idObj);
      const entity3 = new ObjectIdEntity({ value: 'shared-id' });

      // Same reference should be equal
      expect(entity1.equals(entity2)).toBe(true);

      // Different reference with same value should NOT be equal (reference equality)
      expect(entity1.equals(entity3)).toBe(false);
    });

    it('should handle empty string id', () => {
      const entity1 = new TestEntity('');
      const entity2 = new TestEntity('');
      const entity3 = new TestEntity('non-empty');

      expect(entity1.equals(entity2)).toBe(true);
      expect(entity1.equals(entity3)).toBe(false);
    });

    it('should handle zero as numeric id', () => {
      const entity1 = new NumericEntity(0);
      const entity2 = new NumericEntity(0);
      const entity3 = new NumericEntity(1);

      expect(entity1.equals(entity2)).toBe(true);
      expect(entity1.equals(entity3)).toBe(false);
    });

    it('should handle negative numeric ids', () => {
      const entity1 = new NumericEntity(-42);
      const entity2 = new NumericEntity(-42);
      const entity3 = new NumericEntity(42);

      expect(entity1.equals(entity2)).toBe(true);
      expect(entity1.equals(entity3)).toBe(false);
    });
  });

  describe('type safety', () => {
    it('should preserve generic type constraint for id', () => {
      const stringEntity = new TestEntity('string-id');
      const numericEntity = new NumericEntity(123);

      // TypeScript ensures type safety at compile time
      const stringId: string = stringEntity.id;
      const numericId: number = numericEntity.id;

      expect(typeof stringId).toBe('string');
      expect(typeof numericId).toBe('number');
    });
  });

  describe('inheritance', () => {
    it('should allow subclasses to add properties', () => {
      class ExtendedEntity extends Entity<string> {
        constructor(
          id: string,
          public name: string
        ) {
          super(id);
        }
      }

      const entity = new ExtendedEntity('id-1', 'Test Name');
      expect(entity.id).toBe('id-1');
      expect(entity.name).toBe('Test Name');
    });

    it('should maintain identity equality in subclasses', () => {
      class ExtendedEntity extends Entity<string> {
        constructor(
          id: string,
          public value: number
        ) {
          super(id);
        }
      }

      const entity1 = new ExtendedEntity('same-id', 100);
      const entity2 = new ExtendedEntity('same-id', 200);

      // Identity is based on ID, not other properties
      expect(entity1.equals(entity2)).toBe(true);
    });
  });
});
