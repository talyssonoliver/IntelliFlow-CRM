/**
 * Routing rule output contract.
 *
 * The routing procedures used to return Prisma rows straight from the
 * tenant-extended client. tRPC then exposed Prisma's generated return types to
 * the web client, and inferring them for `routing.create.useMutation` /
 * `routing.update.useMutation` exceeded TypeScript's instantiation depth
 * (TS2589), which used to be suppressed in useRouting.ts. Mapping every
 * row through this DTO gives the client a small, explicit type and removes the
 * need for any suppression.
 *
 * `conditions` and `actions` are Prisma `Json` columns, and the RoutingRule
 * table holds more than one kind of rule: lead routing rules (the vocabulary
 * createRoutingRuleSchema validates) and ticket automation rules, which use a
 * different one. So the DTO carries both:
 *  - `conditions` / `actions`: the lead-routing view, read through the same Zod
 *    schemas that validate writes, so lead UIs get typed arrays. A rule that is
 *    not in that shape (a ticket rule, or a row written by the old seed's
 *    keyed-object shape) yields [] here.
 *  - `conditionsJson` / `actionsJson`: the stored value, untouched, typed
 *    `unknown` (shallow, so it cannot reintroduce the depth problem). Nothing a
 *    rule stores is hidden from a consumer that understands another shape.
 */
import { routingActionSchema, routingConditionSchema } from '@intelliflow/validators';
import type { RoutingAction, RoutingCondition } from '@intelliflow/validators';
import { z } from 'zod';

/** The RoutingRule columns the procedures read. */
export interface RoutingRuleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  priority: number;
  isActive: boolean;
  conditions: unknown;
  actions: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingRuleDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  priority: number;
  isActive: boolean;
  /** Lead-routing conditions; [] when the stored value is not in that shape. */
  conditions: RoutingCondition[];
  /** Lead-routing actions; [] when the stored value is not in that shape. */
  actions: RoutingAction[];
  /** The stored conditions exactly as persisted. */
  conditionsJson: unknown;
  /** The stored actions exactly as persisted. */
  actionsJson: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const conditionsSchema = z.array(routingConditionSchema);
const actionsSchema = z.array(routingActionSchema);

function leadView<T>(schema: z.ZodType<T[]>, value: unknown): T[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function toRoutingRuleDto(row: RoutingRuleRow): RoutingRuleDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    priority: row.priority,
    isActive: row.isActive,
    conditions: leadView(conditionsSchema, row.conditions),
    actions: leadView(actionsSchema, row.actions),
    conditionsJson: row.conditions,
    actionsJson: row.actions,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
