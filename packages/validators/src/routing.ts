/**
 * Routing Validators
 *
 * PG-132: Smart Lead Routing UI
 *
 * Zod schemas for routing rule CRUD operations.
 * Derives enums from domain constants (DRY pattern).
 */

import { z } from 'zod';
import {
  ROUTING_CONDITION_FIELDS,
  ROUTING_CONDITION_OPERATORS,
  ROUTING_ACTION_TYPES,
} from '@intelliflow/domain';

// --- Condition Schema ---
export const routingConditionSchema = z.object({
  field: z.enum(ROUTING_CONDITION_FIELDS),
  operator: z.enum(ROUTING_CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});
export type RoutingCondition = z.infer<typeof routingConditionSchema>;

// --- Action Schema ---
export const routingActionSchema = z.object({
  type: z.enum(ROUTING_ACTION_TYPES),
  target: z.string().optional(),
  channels: z.array(z.string()).optional(),
});
export type RoutingAction = z.infer<typeof routingActionSchema>;

// --- Create Rule Schema ---
export const createRoutingRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  conditions: z.array(routingConditionSchema).min(1),
  actions: z.array(routingActionSchema).min(1),
});
export type CreateRoutingRuleInput = z.infer<typeof createRoutingRuleSchema>;

// --- Update Rule Schema ---
export const updateRoutingRuleSchema = createRoutingRuleSchema.partial().extend({
  id: z.string(),
});
export type UpdateRoutingRuleInput = z.infer<typeof updateRoutingRuleSchema>;
