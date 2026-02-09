/**
 * Prisma implementation of ChainVersionAuditRepositoryPort
 *
 * Maps between the Prisma ChainVersionAudit model and the application-layer
 * ChainVersionAuditRecord interface.
 *
 * The Prisma model stores `previousStatus` + `newStatus` + `metadata` (Json),
 * while the port interface expects `previousState` / `newState` as composite
 * objects. The mapper composes/decomposes accordingly.
 */

import type { PrismaClient, ChainVersionAudit as PrismaChainVersionAudit } from '@intelliflow/db';
import type {
  ChainVersionAuditRecord,
  ChainVersionAuditRepositoryPort,
} from '@intelliflow/application';
import type { ChainVersionAuditAction } from '@intelliflow/domain';

export class PrismaChainVersionAuditRepository implements ChainVersionAuditRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    versionId: string;
    action: ChainVersionAuditAction;
    previousState: Record<string, unknown> | null;
    newState: Record<string, unknown> | null;
    performedBy: string;
    reason: string | null;
  }): Promise<ChainVersionAuditRecord> {
    const { previousStatus, previousMetadata } = this.fromState(data.previousState);
    const { newStatus, newMetadata } = this.fromNewState(data.newState);

    const row = await this.prisma.chainVersionAudit.create({
      data: {
        versionId: data.versionId,
        action: data.action,
        previousStatus,
        newStatus: newStatus ?? data.action,
        reason: data.reason,
        performedBy: data.performedBy,
        metadata: { ...previousMetadata, ...newMetadata } as any,
      },
    });

    return this.toRecord(row);
  }

  async findByVersionId(versionId: string): Promise<ChainVersionAuditRecord[]> {
    const rows = await this.prisma.chainVersionAudit.findMany({
      where: { versionId },
      orderBy: { performedAt: 'desc' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async findByAction(action: ChainVersionAuditAction, limit?: number): Promise<ChainVersionAuditRecord[]> {
    const rows = await this.prisma.chainVersionAudit.findMany({
      where: { action },
      orderBy: { performedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.toRecord(r));
  }

  // ---------------------------------------------------------------------------
  // Mapper: Prisma row → application record
  // ---------------------------------------------------------------------------

  private toRecord(row: PrismaChainVersionAudit): ChainVersionAuditRecord {
    const metadata = (row.metadata as Record<string, unknown>) ?? {};

    return {
      id: row.id,
      versionId: row.versionId,
      action: row.action as ChainVersionAuditAction,
      previousState: row.previousStatus
        ? { status: row.previousStatus, ...metadata }
        : null,
      newState: { status: row.newStatus, ...metadata },
      performedBy: row.performedBy,
      performedAt: row.performedAt,
      reason: row.reason,
    };
  }

  // ---------------------------------------------------------------------------
  // Decomposer: application state → Prisma fields
  // ---------------------------------------------------------------------------

  private fromState(state: Record<string, unknown> | null): {
    previousStatus: string | null;
    previousMetadata: Record<string, unknown>;
  } {
    if (!state) return { previousStatus: null, previousMetadata: {} };
    const { status, ...rest } = state;
    return {
      previousStatus: (status as string) ?? null,
      previousMetadata: rest,
    };
  }

  private fromNewState(state: Record<string, unknown> | null): {
    newStatus: string | null;
    newMetadata: Record<string, unknown>;
  } {
    if (!state) return { newStatus: null, newMetadata: {} };
    const { status, ...rest } = state;
    return {
      newStatus: (status as string) ?? null,
      newMetadata: rest,
    };
  }
}
