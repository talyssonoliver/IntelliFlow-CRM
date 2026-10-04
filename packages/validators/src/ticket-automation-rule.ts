/**
 * Ticket Automation Rule Validators
 *
 * Zod schemas for ticket rule CRUD. Ticket rules live in the shared
 * routing_rules table (ruleType = 'TICKET') as arrays of
 * { field, operator, value } conditions and { type, target } actions, and are
 * evaluated by TicketRoutingService. Every enum derives from the domain
 * constants (DRY); the DTO types below are what clients see.
 */

import { z } from 'zod';
import {
  TICKET_ROUTING_ACTION_TYPES,
  TICKET_ROUTING_CONDITION_FIELDS,
  TICKET_ROUTING_CONDITION_OPERATORS,
  TICKET_ROUTING_FIELD_VALUES,
} from '@intelliflow/domain';

const LIST_OPERATORS: readonly string[] = ['in', 'not_in'];

// --- Condition Schema ---
export const ticketRuleConditionSchema = z
  .object({
    field: z.enum(TICKET_ROUTING_CONDITION_FIELDS),
    operator: z.enum(TICKET_ROUTING_CONDITION_OPERATORS),
    value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(20)]),
  })
  .superRefine((condition, ctx) => {
    const wantsList = LIST_OPERATORS.includes(condition.operator);
    if (wantsList !== Array.isArray(condition.value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: wantsList
          ? `Operator "${condition.operator}" needs a list of values`
          : `Operator "${condition.operator}" needs a single value`,
      });
      return;
    }
    if (
      (condition.operator === 'gte' || condition.operator === 'lte') &&
      condition.field !== 'ticketPriority'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['operator'],
        message: `Operator "${condition.operator}" only applies to ticketPriority`,
      });
    }
    const allowed = TICKET_ROUTING_FIELD_VALUES[condition.field];
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    const unknown = values.filter((v) => !allowed.includes(v));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Invalid value for ${condition.field}: ${unknown.join(', ')}`,
      });
    }
  });
export type TicketRuleCondition = z.infer<typeof ticketRuleConditionSchema>;

// --- Action Schema ---
export const ticketRuleActionSchema = z.object({
  type: z.enum(TICKET_ROUTING_ACTION_TYPES),
  target: z.string().trim().min(1).max(200),
});
export type TicketRuleAction = z.infer<typeof ticketRuleActionSchema>;

// --- Create Rule Schema ---
const ticketRuleFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500),
  priority: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
  conditions: z.array(ticketRuleConditionSchema).min(1).max(20),
  actions: z.array(ticketRuleActionSchema).min(1).max(10),
};

export const createTicketRuleSchema = z.object({
  ...ticketRuleFields,
  description: ticketRuleFields.description.optional(),
  priority: ticketRuleFields.priority.default(0),
  isActive: ticketRuleFields.isActive.default(true),
});
export type CreateTicketRuleInput = z.infer<typeof createTicketRuleSchema>;

// --- Update Rule Schema ---
// Built from the bare fields, not createTicketRuleSchema.partial(): defaults would
// otherwise re-apply on omitted keys and silently reset priority/isActive.
export const updateTicketRuleSchema = z.object({
  id: z.string().min(1),
  name: ticketRuleFields.name.optional(),
  description: ticketRuleFields.description.optional(),
  priority: ticketRuleFields.priority.optional(),
  isActive: ticketRuleFields.isActive.optional(),
  conditions: ticketRuleFields.conditions.optional(),
  actions: ticketRuleFields.actions.optional(),
});
export type UpdateTicketRuleInput = z.infer<typeof updateTicketRuleSchema>;

// --- Id / toggle inputs ---
export const ticketRuleIdSchema = z.object({ id: z.string().min(1) });
export type TicketRuleIdInput = z.infer<typeof ticketRuleIdSchema>;

export const toggleTicketRuleSchema = ticketRuleIdSchema.extend({ isActive: z.boolean() });
export type ToggleTicketRuleInput = z.infer<typeof toggleTicketRuleSchema>;

export const listTicketRulesSchema = z.object({
  isActive: z.boolean().optional(),
});
export type ListTicketRulesInput = z.infer<typeof listTicketRulesSchema>;

// --- Output DTO ---
export const ticketAutomationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priority: z.number().int(),
  isActive: z.boolean(),
  conditions: z.array(ticketRuleConditionSchema),
  actions: z.array(ticketRuleActionSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TicketAutomationRuleDto = z.infer<typeof ticketAutomationRuleSchema>;
