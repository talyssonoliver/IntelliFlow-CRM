/**
 * Filter Options Builder
 *
 * Shared utility for building dynamic filter options queries.
 * Provides reusable logic for:
 * - Getting distinct values with counts using groupBy
 * - Filtering by other active filters (for dynamic counts)
 * - Hiding options with zero counts
 *
 * Used by entity routers (contact, lead, ticket, opportunity) to provide
 * consistent filter behavior across all list pages.
 */

import { type PrismaClient } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface FilterOptionResult {
  value: string;
  count: number;
}

export interface FilterOptionWithLabel extends FilterOptionResult {
  label: string;
}

export interface GroupByConfig<TModel extends string> {
  /** The Prisma model to query (e.g., 'contact', 'lead') */
  model: TModel;
  /** The field to group by */
  field: string;
  /** Base where clause (including tenant filter) */
  where: Record<string, unknown>;
  /** Fields to exclude from groupBy (the field being counted shouldn't filter itself) */
  excludeFromWhere?: string[];
}

export interface RelatedEntityConfig {
  /** The Prisma model for related entities (e.g., 'account') */
  model: string;
  /** The relation field on the main model */
  relationField: string;
  /** Fields to select from related entity */
  selectFields: string[];
  /** Where clause for filtering related entities */
  where: Record<string, unknown>;
  /** Order by configuration */
  orderBy?: Record<string, 'asc' | 'desc'>;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Build a where clause excluding certain fields
 * Used to calculate counts for a filter without filtering by itself
 */
export function buildWhereExcluding(
  baseWhere: Record<string, unknown>,
  excludeFields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(baseWhere)) {
    if (!excludeFields.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Transform groupBy results to filter options, filtering out zero counts
 */
export function transformGroupByResults<T extends Record<string, unknown>>(
  results: T[],
  fieldName: string
): FilterOptionResult[] {
  return results
    .filter((r) => {
      const count = (r._count as Record<string, number>)?._all ?? 0;
      const value = r[fieldName];
      return count > 0 && value != null;
    })
    .map((r) => ({
      value: String(r[fieldName]),
      count: (r._count as Record<string, number>)?._all ?? 0,
    }));
}

/**
 * Generic function to get filter counts for any enum/string field
 */
export async function getFieldFilterCounts<T extends keyof PrismaClient>(
  prisma: PrismaClient,
  model: T,
  field: string,
  where: Record<string, unknown>
): Promise<FilterOptionResult[]> {
  // Use type assertion for dynamic model access
  const modelDelegate = prisma[model] as unknown as {
    groupBy: (args: {
      by: string[];
      _count: { _all: boolean };
      where: Record<string, unknown>;
    }) => Promise<Array<Record<string, unknown>>>;
  };

  const results = await modelDelegate.groupBy({
    by: [field],
    _count: { _all: true },
    where,
  });

  return transformGroupByResults(results, field);
}

/**
 * Get related entities with counts (e.g., accounts with contact counts)
 */
export async function getRelatedEntityOptions<T extends keyof PrismaClient>(
  prisma: PrismaClient,
  config: {
    model: T;
    relationModel: string;
    relationField: string;
    selectFields: string[];
    labelField: string;
    where: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }
): Promise<FilterOptionWithLabel[]> {
  const modelDelegate = prisma[config.model] as unknown as {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }) => Promise<Array<Record<string, unknown>>>;
  };

  const results = await modelDelegate.findMany({
    where: {
      [config.relationModel]: {
        some: config.where,
      },
    },
    select: {
      ...config.selectFields.reduce(
        (acc, field) => ({ ...acc, [field]: true }),
        {}
      ),
      _count: {
        select: {
          [config.relationModel]: {
            where: config.where,
          },
        },
      },
    },
    orderBy: config.orderBy,
  });

  return results
    .filter((r) => {
      const countObj = r._count as Record<string, number>;
      return countObj[config.relationModel] > 0;
    })
    .map((r) => {
      const countObj = r._count as Record<string, number>;
      return {
        value: String(r.id),
        label: String(r[config.labelField]),
        count: countObj[config.relationModel],
      };
    });
}

// =============================================================================
// Search Filter Builder
// =============================================================================

/**
 * Build a search filter OR clause for multiple fields
 */
export function buildSearchFilter(
  search: string | undefined,
  fields: string[]
): Record<string, unknown> {
  if (!search) return {};

  return {
    OR: fields.map((field) => ({
      [field]: { contains: search, mode: 'insensitive' },
    })),
  };
}

/**
 * Merge multiple where clauses
 */
export function mergeWhereClauses(
  ...clauses: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const clause of clauses) {
    if (clause) {
      // Handle OR clauses specially - they need to be combined
      if (clause.OR && result.OR) {
        // If both have OR, we need AND to combine them
        if (!result.AND) {
          result.AND = [];
        }
        (result.AND as Array<Record<string, unknown>>).push({ OR: clause.OR });
        delete result.OR;
      } else {
        Object.assign(result, clause);
      }
    }
  }

  return result;
}
