/**
 * Lead Settings Validators Tests - PG-178
 *
 * Tests for lead stage configuration, scoring rules, custom fields,
 * and automation settings Zod schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  leadStageConfigSchema,
  updateLeadStagesSchema,
  leadScoringRuleSchema,
  leadCustomFieldDataTypeSchema,
  createLeadCustomFieldSchema,
  updateLeadCustomFieldSchema,
  leadAutomationSettingsSchema,
} from '../lead-settings';

// ─── leadStageConfigSchema ───────────────────────────────────────────────────

describe('leadStageConfigSchema', () => {
  const validStage = {
    stageKey: 'NEW',
    displayName: 'New Lead',
    color: '#3B82F6',
    sortOrder: 0,
    isDefault: true,
  };

  it('accepts a valid stage config', () => {
    const result = leadStageConfigSchema.safeParse(validStage);
    expect(result.success).toBe(true);
  });

  it('accepts isDefault=false', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, isDefault: false });
    expect(result.success).toBe(true);
  });

  it('accepts sortOrder of 0 (minimum boundary)', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, sortOrder: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts sortOrder of large positive integer', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, sortOrder: 999 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex color — plain name', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, color: 'blue' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects invalid hex color — missing hash', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, color: '3B82F6' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color — wrong length', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, color: '#3B82' });
    expect(result.success).toBe(false);
  });

  it('accepts lowercase hex color', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, color: '#3b82f6' });
    expect(result.success).toBe(true);
  });

  it('rejects empty displayName', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, displayName: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects empty stageKey', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, stageKey: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative sortOrder', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, sortOrder: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer sortOrder', () => {
    const result = leadStageConfigSchema.safeParse({ ...validStage, sortOrder: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = leadStageConfigSchema.safeParse({ stageKey: 'NEW' });
    expect(result.success).toBe(false);
  });
});

// ─── updateLeadStagesSchema ──────────────────────────────────────────────────

describe('updateLeadStagesSchema', () => {
  const validStage = {
    stageKey: 'NEW',
    displayName: 'New',
    color: '#3B82F6',
    sortOrder: 0,
    isDefault: true,
  };

  it('accepts a valid stages array with one stage', () => {
    const result = updateLeadStagesSchema.safeParse({ stages: [validStage] });
    expect(result.success).toBe(true);
  });

  it('accepts a valid stages array with multiple stages', () => {
    const result = updateLeadStagesSchema.safeParse({
      stages: [
        validStage,
        { stageKey: 'CONTACTED', displayName: 'Contacted', color: '#F59E0B', sortOrder: 1, isDefault: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty stages array — requires min 1', () => {
    const result = updateLeadStagesSchema.safeParse({ stages: [] });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects missing stages field', () => {
    const result = updateLeadStagesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects stages array containing invalid stage', () => {
    const result = updateLeadStagesSchema.safeParse({
      stages: [{ ...validStage, color: 'not-a-hex' }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── leadScoringRuleSchema ───────────────────────────────────────────────────

describe('leadScoringRuleSchema', () => {
  const validRule = {
    activityType: 'EMAIL_OPEN',
    points: 10,
  };

  it('accepts a valid scoring rule', () => {
    const result = leadScoringRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it('accepts points=0 (minimum boundary)', () => {
    const result = leadScoringRuleSchema.safeParse({ ...validRule, points: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts points=1000 (maximum boundary)', () => {
    const result = leadScoringRuleSchema.safeParse({ ...validRule, points: 1000 });
    expect(result.success).toBe(true);
  });

  it('rejects points > 1000', () => {
    const result = leadScoringRuleSchema.safeParse({ ...validRule, points: 1001 });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects points < 0', () => {
    const result = leadScoringRuleSchema.safeParse({ ...validRule, points: -1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-integer points', () => {
    const result = leadScoringRuleSchema.safeParse({ ...validRule, points: 10.5 });
    expect(result.success).toBe(false);
  });

  it('rejects empty activityType', () => {
    const result = leadScoringRuleSchema.safeParse({ ...validRule, activityType: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = leadScoringRuleSchema.safeParse({ activityType: 'EMAIL_OPEN' });
    expect(result.success).toBe(false);
  });
});

// ─── leadCustomFieldDataTypeSchema ───────────────────────────────────────────

describe('leadCustomFieldDataTypeSchema', () => {
  it('accepts "text"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('text').success).toBe(true);
  });

  it('accepts "number"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('number').success).toBe(true);
  });

  it('accepts "currency"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('currency').success).toBe(true);
  });

  it('accepts "dropdown"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('dropdown').success).toBe(true);
  });

  it('accepts "date"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('date').success).toBe(true);
  });

  it('accepts "boolean"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('boolean').success).toBe(true);
  });

  it('rejects unknown data type "email"', () => {
    const result = leadCustomFieldDataTypeSchema.safeParse('email');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects unknown data type "list"', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('list').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(leadCustomFieldDataTypeSchema.safeParse('').success).toBe(false);
  });
});

// ─── createLeadCustomFieldSchema ─────────────────────────────────────────────

describe('createLeadCustomFieldSchema', () => {
  const validField = {
    fieldName: 'Lead Source Detail',
    dataType: 'text' as const,
  };

  it('accepts a valid field with required fields only', () => {
    const result = createLeadCustomFieldSchema.safeParse(validField);
    expect(result.success).toBe(true);
  });

  it('accepts field with optional options for dropdown', () => {
    const result = createLeadCustomFieldSchema.safeParse({
      ...validField,
      dataType: 'dropdown',
      options: { values: ['Option A', 'Option B', 'Option C'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts field with isRequired=true', () => {
    const result = createLeadCustomFieldSchema.safeParse({ ...validField, isRequired: true });
    expect(result.success).toBe(true);
  });

  it('accepts field with isRequired=false', () => {
    const result = createLeadCustomFieldSchema.safeParse({ ...validField, isRequired: false });
    expect(result.success).toBe(true);
  });

  it('accepts field with empty options values array', () => {
    const result = createLeadCustomFieldSchema.safeParse({
      ...validField,
      options: { values: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty fieldName', () => {
    const result = createLeadCustomFieldSchema.safeParse({ ...validField, fieldName: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects missing fieldName', () => {
    const result = createLeadCustomFieldSchema.safeParse({ dataType: 'text' });
    expect(result.success).toBe(false);
  });

  it('rejects missing dataType', () => {
    const result = createLeadCustomFieldSchema.safeParse({ fieldName: 'My Field' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid dataType', () => {
    const result = createLeadCustomFieldSchema.safeParse({ ...validField, dataType: 'invalid' });
    expect(result.success).toBe(false);
  });
});

// ─── updateLeadCustomFieldSchema ─────────────────────────────────────────────

describe('updateLeadCustomFieldSchema', () => {
  const validUpdate = {
    id: 'field-uuid-1',
    fieldName: 'Updated Field Name',
    dataType: 'number' as const,
  };

  it('accepts valid update with id', () => {
    const result = updateLeadCustomFieldSchema.safeParse(validUpdate);
    expect(result.success).toBe(true);
  });

  it('accepts update with options', () => {
    const result = updateLeadCustomFieldSchema.safeParse({
      ...validUpdate,
      dataType: 'dropdown',
      options: { values: ['A', 'B'] },
    });
    expect(result.success).toBe(true);
  });

  it('requires id — rejects when missing', () => {
    const { id, ...rest } = validUpdate;
    const result = updateLeadCustomFieldSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('requires id — rejects empty id', () => {
    const result = updateLeadCustomFieldSchema.safeParse({ ...validUpdate, id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty fieldName', () => {
    const result = updateLeadCustomFieldSchema.safeParse({ ...validUpdate, fieldName: '' });
    expect(result.success).toBe(false);
  });
});

// ─── leadAutomationSettingsSchema ────────────────────────────────────────────

describe('leadAutomationSettingsSchema', () => {
  it('accepts valid boolean triple — all true', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      autoAssignment: true,
      instantNotifications: true,
      leadRecurrence: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid boolean triple — all false', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      autoAssignment: false,
      instantNotifications: false,
      leadRecurrence: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts mixed boolean values', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      autoAssignment: true,
      instantNotifications: false,
      leadRecurrence: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing autoAssignment', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      instantNotifications: true,
      leadRecurrence: false,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects missing instantNotifications', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      autoAssignment: true,
      leadRecurrence: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing leadRecurrence', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      autoAssignment: true,
      instantNotifications: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean autoAssignment', () => {
    const result = leadAutomationSettingsSchema.safeParse({
      autoAssignment: 'yes',
      instantNotifications: false,
      leadRecurrence: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty object', () => {
    const result = leadAutomationSettingsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
