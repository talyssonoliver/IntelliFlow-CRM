/**
 * Query building for the leads list (lead.list): the WHERE clause and the ORDER BY.
 * Kept out of lead.router.ts so the router stays small and these can be tested on their own.
 */

import type { Prisma } from '@intelliflow/db';

export function buildNumberRange(
  min: number | undefined,
  max: number | undefined
): Record<string, number> | undefined {
  if (min === undefined && max === undefined) return undefined;
  const r: Record<string, number> = {};
  if (min !== undefined) r.gte = min;
  if (max !== undefined) r.lte = max;
  return r;
}

export function buildDateRange(
  from: Date | undefined,
  to: Date | undefined
): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const r: Record<string, Date> = {};
  if (from) r.gte = from;
  if (to) r.lte = to;
  return r;
}

/**
 * Build the base WHERE clause for the leads list query.
 * Extracted to reduce cognitive complexity of the list procedure.
 */
export function buildLeadListWhere(filters: {
  status?: string[];
  source?: string[];
  minScore?: number;
  maxScore?: number;
  search?: string;
  ownerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  lastContactedBefore?: Date;
  isStarred?: boolean;
  ids?: string[];
}): Record<string, unknown> {
  const {
    status,
    source,
    minScore,
    maxScore,
    search,
    ownerId,
    dateFrom,
    dateTo,
    lastContactedBefore,
    isStarred,
    ids,
  } = filters;
  const baseWhere: Record<string, unknown> = {};

  if (status && status.length > 0) baseWhere.status = { in: status };
  if (source && source.length > 0) baseWhere.source = { in: source };

  const scoreRange = buildNumberRange(minScore, maxScore);
  if (scoreRange) baseWhere.score = scoreRange;

  if (search) {
    baseWhere.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (ownerId) baseWhere.ownerId = ownerId;

  const dateRange = buildDateRange(dateFrom, dateTo);
  if (dateRange) baseWhere.createdAt = dateRange;

  // PG-059 "Needs Follow-up": include leads where lastContactedAt is NULL
  // (never contacted) OR older than the threshold. Indexed via
  // @@index([tenantId, lastContactedAt]) in schema.prisma:620.
  if (lastContactedBefore) {
    baseWhere.OR = [
      ...((baseWhere.OR as object[] | undefined) ?? []),
      { lastContactedAt: null },
      { lastContactedAt: { lte: lastContactedBefore } },
    ];
  }

  // PG-059 "Starred": covered by @@index([tenantId, ownerId, isStarred]).
  if (typeof isStarred === 'boolean') baseWhere.isStarred = isStarred;

  // PG-059 "Recently Viewed": client passes the capped recent-ids list
  // (max 50 per validator). When empty, this intentionally yields no rows
  // (Prisma treats `{ in: [] }` as no-match), which matches user expectation.
  if (ids) baseWhere.id = { in: ids };

  return baseWhere;
}

/**
 * The ORDER BY of the leads list. Sorting by last contact treats a lead that was never contacted
 * as the oldest: first when ascending (the dashboard lists the most overdue follow-ups first),
 * last when descending. Postgres would put NULLs last when ascending, which hid never-contacted
 * leads from a limited ascending list. Every other sort is unchanged.
 */
export function leadListOrderBy(
  sortBy: string,
  sortOrder: Prisma.SortOrder
): Prisma.LeadOrderByWithRelationInput {
  if (sortBy === 'lastContactedAt') {
    return { lastContactedAt: { sort: sortOrder, nulls: sortOrder === 'asc' ? 'first' : 'last' } };
  }
  return { [sortBy]: sortOrder };
}
