import { PrismaClient } from '@prisma/client';
import type {
  AuditAction,
  ActionResult,
  ActorType,
  DataClassification,
  ResourceType,
} from './types';
import { buildWhereClause } from './utils';

export interface QueryFilters {
  resourceType?: ResourceType;
  resourceId?: string;
  actorId?: string;
  actorType?: ActorType;
  action?: AuditAction;
  actionResult?: ActionResult;
  eventType?: string;
  dataClassification?: DataClassification;
  traceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  entries: unknown[];
  total: number;
}

/**
 * Query audit logs from the consolidated AuditLogEntry table
 * Per ADR-008, this is the single source of truth for audit logs.
 */
export async function queryComprehensive(
  prisma: PrismaClient,
  filters: QueryFilters
): Promise<QueryResult> {
  const where = buildWhereClause(filters);

  const [entries, total] = await Promise.all([
    prisma.auditLogEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.auditLogEntry.count({ where }),
  ]);

  return { entries, total };
}

/**
 * Query audit logs (alias for queryComprehensive)
 * @deprecated Use queryComprehensive directly
 */
export async function queryBasic(
  prisma: PrismaClient,
  filters: QueryFilters
): Promise<QueryResult> {
  // Redirect to comprehensive query - no more separate basic table
  return queryComprehensive(prisma, filters);
}

/**
 * Get audit trail for a specific resource
 */
export async function getResourceAuditTrail(
  prisma: PrismaClient,
  resourceType: ResourceType,
  resourceId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<QueryResult> {
  return queryComprehensive(prisma, {
    resourceType,
    resourceId,
    limit: options.limit,
    offset: options.offset,
  });
}

/**
 * Get audit trail for a specific user/actor
 */
export async function getActorAuditTrail(
  prisma: PrismaClient,
  actorId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<QueryResult> {
  return queryComprehensive(prisma, {
    actorId,
    startDate: options.startDate,
    endDate: options.endDate,
    limit: options.limit,
    offset: options.offset,
  });
}

/**
 * Get permission-related audit entries
 */
export async function getPermissionAuditTrail(
  prisma: PrismaClient,
  options: {
    actorId?: string;
    resourceType?: ResourceType;
    permissionDeniedOnly?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<QueryResult> {
  const where: Record<string, unknown> = {
    requiredPermission: { not: null },
  };

  if (options.actorId) where.actorId = options.actorId;
  if (options.resourceType) where.resourceType = options.resourceType;
  if (options.permissionDeniedOnly) where.permissionGranted = false;

  if (options.startDate || options.endDate) {
    where.timestamp = {};
    if (options.startDate) (where.timestamp as Record<string, Date>).gte = options.startDate;
    if (options.endDate) (where.timestamp as Record<string, Date>).lte = options.endDate;
  }

  const [entries, total] = await Promise.all([
    prisma.auditLogEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: options.limit ?? 100,
      skip: options.offset ?? 0,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.auditLogEntry.count({ where }),
  ]);

  return { entries, total };
}
