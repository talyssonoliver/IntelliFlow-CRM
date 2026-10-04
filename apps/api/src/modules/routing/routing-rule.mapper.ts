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
 * `conditions` and `actions` are Prisma `Json` columns. They are read through
 * the same Zod schemas that validate writes, so the client gets typed arrays
 * instead of `JsonValue`. A stored value that does not match (e.g. rows written
 * by an older seed in a keyed-object shape) is logged with the rule id and
 * surfaced as an empty list — what the UI already showed for it — rather than
 * failing the whole response.
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
  conditions: RoutingCondition[];
  actions: RoutingAction[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const conditionsSchema = z.array(routingConditionSchema);
const actionsSchema = z.array(routingActionSchema);

function readList<T>(
  schema: z.ZodType<T[]>,
  value: unknown,
  column: 'conditions' | 'actions',
  ruleId: string
): T[] {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(
    `[routing] rule ${ruleId}: stored ${column} do not match the routing rule schema; returning []`,
    parsed.error.issues
  );
  return [];
}

export function toRoutingRuleDto(row: RoutingRuleRow): RoutingRuleDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    priority: row.priority,
    isActive: row.isActive,
    conditions: readList(conditionsSchema, row.conditions, 'conditions', row.id),
    actions: readList(actionsSchema, row.actions, 'actions', row.id),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
