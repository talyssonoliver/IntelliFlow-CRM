/**
 * Ticket Settings Validators - PG-185
 *
 * Zod schemas for ticket duplicate-detection rules, required-field policy,
 * tag vocabulary, and automation settings (including default SLA,
 * auto-close, notification triggers, and AI toggles).
 *
 * TAG_COLOR_TOKENS / tagColorTokenSchema are imported from contact-settings
 * — do NOT duplicate the 18-token allowlist (playbook §4 / §EE duplicate
 * detection).
 */

import { z } from 'zod';
import { tagColorTokenSchema } from './contact-settings';

// ─── Duplicate Rules ────────────────────────────────────────────────────────

export const ticketDuplicateRuleFieldSchema = z.enum([
  'contact_subject',
  'contact_24h',
  'email_subject',
  'contact_description_5min',
]);
export type TicketDuplicateRuleField = z.infer<typeof ticketDuplicateRuleFieldSchema>;

export const ticketDuplicateRuleStrategySchema = z.enum(['exact', 'normalized', 'fuzzy']);
export type TicketDuplicateRuleStrategy = z.infer<typeof ticketDuplicateRuleStrategySchema>;

export const ticketDuplicateRuleSchema = z.object({
  field: ticketDuplicateRuleFieldSchema,
  matchStrategy: ticketDuplicateRuleStrategySchema,
  threshold: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type TicketDuplicateRuleInput = z.infer<typeof ticketDuplicateRuleSchema>;

export const updateTicketDuplicateRulesSchema = z
  .object({
    rules: z.array(ticketDuplicateRuleSchema).min(1, 'At least one rule is required'),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>();
    data.rules.forEach((rule, index) => {
      const key = `${rule.field}__${rule.matchStrategy}`;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate (field, strategy) pair: "${rule.field}" + "${rule.matchStrategy}" appears in rows ${first + 1} and ${index + 1}`,
          path: ['rules', index, 'matchStrategy'],
        });
      } else {
        seen.set(key, index);
      }
    });
  });
export type UpdateTicketDuplicateRulesInput = z.infer<typeof updateTicketDuplicateRulesSchema>;

// ─── Required Fields ────────────────────────────────────────────────────────

export const ticketRequiredFieldKeySchema = z.enum([
  'subject',
  'description',
  'contactEmail',
  'contactName',
  'priority',
  'category',
  'slaPolicy',
]);
export type TicketRequiredFieldKey = z.infer<typeof ticketRequiredFieldKeySchema>;

export const ticketRequiredFieldSchema = z.object({
  fieldKey: ticketRequiredFieldKeySchema,
  isRequired: z.boolean(),
});
export type TicketRequiredFieldInput = z.infer<typeof ticketRequiredFieldSchema>;

export const updateTicketRequiredFieldsSchema = z
  .object({
    fields: z.array(ticketRequiredFieldSchema).min(1, 'At least one field is required'),
  })
  .refine(
    (data) =>
      data.fields.find((f) => f.fieldKey === 'subject')?.isRequired === true &&
      data.fields.find((f) => f.fieldKey === 'contactEmail')?.isRequired === true,
    {
      message: 'subject and contactEmail must remain required',
      path: ['fields'],
    }
  );
export type UpdateTicketRequiredFieldsInput = z.infer<typeof updateTicketRequiredFieldsSchema>;

// ─── Tags ───────────────────────────────────────────────────────────────────
// TAG_COLOR_TOKENS / tagColorTokenSchema imported from contact-settings.

export const createTicketTagSchema = z.object({
  name: z.string().min(1).max(60),
  colorToken: tagColorTokenSchema.default('slate'),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateTicketTagInput = z.infer<typeof createTicketTagSchema>;

export const updateTicketTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60).optional(),
  colorToken: tagColorTokenSchema.optional(),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTicketTagInput = z.infer<typeof updateTicketTagSchema>;

export const deleteTicketTagSchema = z.object({
  id: z.string().min(1),
});
export type DeleteTicketTagInput = z.infer<typeof deleteTicketTagSchema>;

// ─── Automation ─────────────────────────────────────────────────────────────

export const ticketAutomationSettingsSchema = z.object({
  // Default SLA selection
  defaultSlaPolicyId: z.string().min(1).nullable(),
  // Auto-close rules
  autoCloseIdleDays: z.number().int().min(0).max(365),
  autoCloseAppliesToWaitingCustomer: z.boolean(),
  autoCloseAppliesToResolved: z.boolean(),
  autoCloseNotifyCustomer: z.boolean(),
  // Duplicate-detection hygiene
  autoMergeOnExactContactSubject: z.boolean(),
  notifyOnDuplicate: z.boolean(),
  // Tags & RBAC
  restrictTagCreationToAdmins: z.boolean(),
  // Data hygiene
  normalizeSubjectCasing: z.boolean(),
  trimDescriptionWhitespace: z.boolean(),
  preventDeleteWithOpenChildren: z.boolean(),
  // Notification triggers
  notifyOnAssigneeChange: z.boolean(),
  notifyOnSlaBreach: z.boolean(),
  notifyOnSlaWarning: z.boolean(),
  notifyOnStatusResolved: z.boolean(),
  notifyOnEscalation: z.boolean(),
  // AI & Intelligence — defaults FALSE (opt-in privacy; playbook §7)
  aiDuplicateDetection: z.boolean(),
  aiAutoCategorization: z.boolean(),
  aiSentimentAnalysis: z.boolean(),
  aiNextStepRecommendation: z.boolean(),
  aiTagSuggestions: z.boolean(),
  aiInsightGeneration: z.boolean(),
});
export type TicketAutomationSettingsInput = z.infer<typeof ticketAutomationSettingsSchema>;

// ─── Defaults (shared between router and tests — playbook REF-1) ────────────

export const DEFAULT_TICKET_DUPLICATE_RULES: ReadonlyArray<TicketDuplicateRuleInput> = [
  {
    field: 'contact_subject',
    matchStrategy: 'exact',
    threshold: 100,
    isActive: true,
    sortOrder: 0,
  },
  {
    field: 'contact_24h',
    matchStrategy: 'normalized',
    threshold: 100,
    isActive: true,
    sortOrder: 1,
  },
  {
    field: 'email_subject',
    matchStrategy: 'fuzzy',
    threshold: 85,
    isActive: false,
    sortOrder: 2,
  },
  {
    field: 'contact_description_5min',
    matchStrategy: 'fuzzy',
    threshold: 90,
    isActive: false,
    sortOrder: 3,
  },
];

export const DEFAULT_TICKET_REQUIRED_FIELDS: ReadonlyArray<TicketRequiredFieldInput> = [
  { fieldKey: 'subject', isRequired: true },
  { fieldKey: 'description', isRequired: false },
  { fieldKey: 'contactEmail', isRequired: true },
  { fieldKey: 'contactName', isRequired: true },
  { fieldKey: 'priority', isRequired: true },
  { fieldKey: 'category', isRequired: false },
  { fieldKey: 'slaPolicy', isRequired: false },
];

export const DEFAULT_TICKET_AUTOMATION: TicketAutomationSettingsInput = {
  defaultSlaPolicyId: null,
  autoCloseIdleDays: 7,
  autoCloseAppliesToWaitingCustomer: true,
  autoCloseAppliesToResolved: true,
  autoCloseNotifyCustomer: true,
  autoMergeOnExactContactSubject: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizeSubjectCasing: true,
  trimDescriptionWhitespace: true,
  preventDeleteWithOpenChildren: true,
  notifyOnAssigneeChange: true,
  notifyOnSlaBreach: true,
  notifyOnSlaWarning: false,
  notifyOnStatusResolved: false,
  notifyOnEscalation: true,
  aiDuplicateDetection: false,
  aiAutoCategorization: false,
  aiSentimentAnalysis: false,
  aiNextStepRecommendation: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};
