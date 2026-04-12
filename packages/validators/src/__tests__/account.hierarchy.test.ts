import { describe, it, expect } from 'vitest';
import { setParentSchema, getHierarchyInputSchema } from '../account';

const VALID_UUID_1 = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002';

describe('account hierarchy validators', () => {
  describe('setParentSchema', () => {
    it('should accept valid accountId and parentAccountId', () => {
      const result = setParentSchema.safeParse({
        accountId: VALID_UUID_1,
        parentAccountId: VALID_UUID_2,
      });
      expect(result.success).toBe(true);
    });

    it('should accept null parentAccountId (remove parent)', () => {
      const result = setParentSchema.safeParse({
        accountId: VALID_UUID_1,
        parentAccountId: null,
      });
      expect(result.success).toBe(true);
      expect(result.data?.parentAccountId).toBeNull();
    });

    it('should reject missing accountId', () => {
      const result = setParentSchema.safeParse({
        parentAccountId: VALID_UUID_2,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing parentAccountId', () => {
      const result = setParentSchema.safeParse({
        accountId: VALID_UUID_1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty accountId', () => {
      const result = setParentSchema.safeParse({
        accountId: '',
        parentAccountId: VALID_UUID_2,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID accountId', () => {
      const result = setParentSchema.safeParse({
        accountId: 'not-a-uuid',
        parentAccountId: VALID_UUID_2,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getHierarchyInputSchema', () => {
    it('should accept valid accountId and maxDepth', () => {
      const result = getHierarchyInputSchema.safeParse({
        accountId: VALID_UUID_1,
        maxDepth: 3,
      });
      expect(result.success).toBe(true);
      expect(result.data?.maxDepth).toBe(3);
    });

    it('should default maxDepth to 5', () => {
      const result = getHierarchyInputSchema.safeParse({
        accountId: VALID_UUID_1,
      });
      expect(result.success).toBe(true);
      expect(result.data?.maxDepth).toBe(5);
    });

    it('should reject maxDepth < 1', () => {
      const result = getHierarchyInputSchema.safeParse({
        accountId: VALID_UUID_1,
        maxDepth: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxDepth > 5', () => {
      const result = getHierarchyInputSchema.safeParse({
        accountId: VALID_UUID_1,
        maxDepth: 6,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer maxDepth', () => {
      const result = getHierarchyInputSchema.safeParse({
        accountId: VALID_UUID_1,
        maxDepth: 2.5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing accountId', () => {
      const result = getHierarchyInputSchema.safeParse({
        maxDepth: 3,
      });
      expect(result.success).toBe(false);
    });
  });
});
