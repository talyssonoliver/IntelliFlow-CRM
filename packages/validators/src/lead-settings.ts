/**
 * Lead Settings Validators - PG-178
 *
 * Zod schemas for lead stage configuration, scoring rules,
 * custom fields, and automation settings.
 */

import { z } from 'zod';

// ─── Lead Stage Config ──────────────────────────────────────────────────────

export const leadStageConfigSchema = z.object({
  stageKey: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  sortOrder: z.number().int().min(0),
  isDefault: z.boolean(),
});
export type LeadStageConfigInput = z.infer<typeof leadStageConfigSchema>;

export const updateLeadStagesSchema = z.object({
  stages: z.array(leadStageConfigSchema).min(1, 'At least one stage is required'),
});
export type UpdateLeadStagesInput = z.infer<typeof updateLeadStagesSchema>;

// ─── Lead Scoring Rule ──────────────────────────────────────────────────────

export const leadScoringRuleSchema = z.object({
  activityType: z.string().min(1).max(50),
  points: z.number().int().min(0).max(1000),
});
export type LeadScoringRuleInput = z.infer<typeof leadScoringRuleSchema>;

export const updateLeadScoringRulesSchema = z.object({
  rules: z.array(leadScoringRuleSchema).min(1, 'At least one rule is required'),
});
export type UpdateLeadScoringRulesInput = z.infer<typeof updateLeadScoringRulesSchema>;

// ─── Lead Custom Field ──────────────────────────────────────────────────────

export const leadCustomFieldDataTypeSchema = z.enum([
  'text',
  'number',
  'currency',
  'dropdown',
  'date',
  'boolean',
]);
export type LeadCustomFieldDataType = z.infer<typeof leadCustomFieldDataTypeSchema>;

export const createLeadCustomFieldSchema = z.object({
  fieldName: z.string().min(1).max(100),
  dataType: leadCustomFieldDataTypeSchema,
  options: z.object({ values: z.array(z.string()) }).optional(),
  isRequired: z.boolean().optional(),
});
export type CreateLeadCustomFieldInput = z.infer<typeof createLeadCustomFieldSchema>;

export const updateLeadCustomFieldSchema = createLeadCustomFieldSchema.extend({
  id: z.string().min(1),
});
export type UpdateLeadCustomFieldInput = z.infer<typeof updateLeadCustomFieldSchema>;

export const deleteLeadCustomFieldSchema = z.object({
  id: z.string().min(1),
});
export type DeleteLeadCustomFieldInput = z.infer<typeof deleteLeadCustomFieldSchema>;

// ─── Lead Automation Settings ───────────────────────────────────────────────

export const leadAutomationSettingsSchema = z.object({
  autoAssignment: z.boolean(),
  instantNotifications: z.boolean(),
  leadRecurrence: z.boolean(),
});
export type LeadAutomationSettingsInput = z.infer<typeof leadAutomationSettingsSchema>;
