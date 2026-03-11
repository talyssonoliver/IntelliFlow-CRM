/**
 * Ticket Config Validators Tests - PG-173
 *
 * Tests for SLA policy and ticket category Zod schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  createSlaPolicySchema,
  updateSlaPolicySchema,
} from '../sla-policy';
import {
  createTicketCategorySchema,
  updateTicketCategorySchema,
  reorderTicketCategorySchema,
} from '../ticket-category';

describe('SLA Policy Schemas', () => {
  const validSlaPolicyInput = {
    name: 'Standard SLA',
    description: 'Default SLA policy',
    criticalResponseMinutes: 15,
    highResponseMinutes: 60,
    mediumResponseMinutes: 240,
    lowResponseMinutes: 480,
    criticalResolutionMinutes: 120,
    highResolutionMinutes: 480,
    mediumResolutionMinutes: 1440,
    lowResolutionMinutes: 4320,
  };

  describe('createSlaPolicySchema', () => {
    it('accepts valid input', () => {
      const result = createSlaPolicySchema.safeParse(validSlaPolicyInput);
      expect(result.success).toBe(true);
    });

    it('applies defaults for warningThresholdPercent and isDefault', () => {
      const result = createSlaPolicySchema.parse(validSlaPolicyInput);
      expect(result.warningThresholdPercent).toBe(25);
      expect(result.isDefault).toBe(false);
    });

    it('rejects missing name', () => {
      const { name, ...rest } = validSlaPolicyInput;
      const result = createSlaPolicySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = createSlaPolicySchema.safeParse({ ...validSlaPolicyInput, name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects negative minutes', () => {
      const result = createSlaPolicySchema.safeParse({
        ...validSlaPolicyInput,
        criticalResponseMinutes: -10,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero minutes', () => {
      const result = createSlaPolicySchema.safeParse({
        ...validSlaPolicyInput,
        highResponseMinutes: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects warningThresholdPercent > 100', () => {
      const result = createSlaPolicySchema.safeParse({
        ...validSlaPolicyInput,
        warningThresholdPercent: 101,
      });
      expect(result.success).toBe(false);
    });

    it('rejects warningThresholdPercent < 1', () => {
      const result = createSlaPolicySchema.safeParse({
        ...validSlaPolicyInput,
        warningThresholdPercent: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateSlaPolicySchema', () => {
    it('accepts partial updates with id', () => {
      const result = updateSlaPolicySchema.safeParse({
        id: 'policy-1',
        name: 'Updated Name',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing id', () => {
      const result = updateSlaPolicySchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(false);
    });

    it('rejects empty id', () => {
      const result = updateSlaPolicySchema.safeParse({ id: '', name: 'Updated Name' });
      expect(result.success).toBe(false);
    });

    it('accepts id-only update', () => {
      const result = updateSlaPolicySchema.safeParse({ id: 'policy-1' });
      expect(result.success).toBe(true);
    });
  });
});

describe('Ticket Category Schemas', () => {
  const validCategoryInput = {
    name: 'Billing',
    description: 'Billing-related tickets',
    color: '#FF5733',
    icon: 'credit-card',
  };

  describe('createTicketCategorySchema', () => {
    it('accepts valid input', () => {
      const result = createTicketCategorySchema.safeParse(validCategoryInput);
      expect(result.success).toBe(true);
    });

    it('accepts minimal input (name only)', () => {
      const result = createTicketCategorySchema.safeParse({ name: 'General' });
      expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
      const { name, ...rest } = validCategoryInput;
      const result = createTicketCategorySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects invalid hex color', () => {
      const result = createTicketCategorySchema.safeParse({
        ...validCategoryInput,
        color: 'red',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid hex color with lowercase', () => {
      const result = createTicketCategorySchema.safeParse({
        ...validCategoryInput,
        color: '#ff5733',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional parentId and slaPolicyId', () => {
      const result = createTicketCategorySchema.safeParse({
        ...validCategoryInput,
        parentId: 'parent-1',
        slaPolicyId: 'sla-1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('updateTicketCategorySchema', () => {
    it('accepts partial updates with id', () => {
      const result = updateTicketCategorySchema.safeParse({
        id: 'cat-1',
        name: 'Updated',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing id', () => {
      const result = updateTicketCategorySchema.safeParse({ name: 'Updated' });
      expect(result.success).toBe(false);
    });
  });

  describe('reorderTicketCategorySchema', () => {
    it('accepts valid reorder array', () => {
      const result = reorderTicketCategorySchema.safeParse({
        items: [
          { id: 'cat-1', sortOrder: 0 },
          { id: 'cat-2', sortOrder: 1 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty items array', () => {
      const result = reorderTicketCategorySchema.safeParse({ items: [] });
      expect(result.success).toBe(false);
    });

    it('rejects negative sortOrder', () => {
      const result = reorderTicketCategorySchema.safeParse({
        items: [{ id: 'cat-1', sortOrder: -1 }],
      });
      expect(result.success).toBe(false);
    });
  });
});
