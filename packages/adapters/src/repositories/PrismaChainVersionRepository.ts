/**
 * Prisma implementation of ChainVersionRepositoryPort
 *
 * Maps between the Prisma ChainVersion model and the application-layer
 * ChainVersionRecord interface.
 */

import { createHash } from 'crypto';
import {
  Prisma,
  type PrismaClient,
  type ChainVersion as PrismaChainVersion,
} from '@intelliflow/db';
import type { ChainVersionRecord, ChainVersionRepositoryPort } from '@intelliflow/application';
import type { ChainType, ChainVersionStatus, VersionRolloutStrategy } from '@intelliflow/domain';

/** Set the appropriate lifecycle timestamp on updateData based on the new status */
function applyLifecycleTimestamp(
  status: ChainVersionStatus,
  updateData: Record<string, unknown>
): void {
  const now = new Date();
  if (status === 'ACTIVE') updateData.activatedAt = now;
  else if (status === 'DEPRECATED') updateData.deprecatedAt = now;
  else if (status === 'ARCHIVED') updateData.archivedAt = now;
}

/** Build the updateData object from a partial ChainVersionRecord */
function buildChainVersionUpdateData(data: Partial<ChainVersionRecord>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  if (data.prompt !== undefined) {
    updateData.prompt = data.prompt;
    updateData.promptHash = createHash('sha256').update(data.prompt).digest('hex');
  }
  if (data.model !== undefined) updateData.model = data.model;
  if (data.temperature !== undefined) updateData.temperature = data.temperature;
  if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
  if (data.additionalParams !== undefined) updateData.config = data.additionalParams;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.rolloutStrategy !== undefined) updateData.rolloutStrategy = data.rolloutStrategy;
  if (data.rolloutPercent !== undefined) updateData.rolloutPercent = data.rolloutPercent;
  if (data.experimentId !== undefined) updateData.experimentId = data.experimentId;
  if (data.status !== undefined) {
    updateData.status = data.status;
    applyLifecycleTimestamp(data.status as ChainVersionStatus, updateData);
  }
  return updateData;
}

export class PrismaChainVersionRepository implements ChainVersionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    chainType: ChainType;
    prompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
    additionalParams: Record<string, unknown> | null;
    description: string | null;
    parentVersionId: string | null;
    rolloutStrategy: VersionRolloutStrategy;
    rolloutPercent: number | null;
    experimentId: string | null;
    createdBy: string;
    tenantId: string;
  }): Promise<ChainVersionRecord> {
    const promptHash = createHash('sha256').update(data.prompt).digest('hex');

    // Auto-generate version string based on existing versions
    const existing = await this.prisma.chainVersion.findMany({
      where: { tenantId: data.tenantId, chainType: data.chainType },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { version: true },
    });

    let version = '1.0.0';
    if (existing.length > 0) {
      const parts = existing[0].version.split('.').map(Number);
      parts[2] = (parts[2] ?? 0) + 1;
      version = parts.join('.');
    }

    const row = await this.prisma.chainVersion.create({
      data: {
        tenantId: data.tenantId,
        chainType: data.chainType,
        version,
        prompt: data.prompt,
        promptHash,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        config: (data.additionalParams ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        description: data.description,
        parentVersionId: data.parentVersionId,
        status: 'DRAFT',
        rolloutStrategy: data.rolloutStrategy as any,
        rolloutPercent: data.rolloutPercent ?? 100,
        experimentId: data.experimentId,
        createdBy: data.createdBy,
      },
    });

    return this.toRecord(row);
  }

  async findById(id: string): Promise<ChainVersionRecord | null> {
    const row = await this.prisma.chainVersion.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }

  async findByTenantId(tenantId: string): Promise<ChainVersionRecord[]> {
    const rows = await this.prisma.chainVersion.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async findByChainType(chainType: ChainType, tenantId: string): Promise<ChainVersionRecord[]> {
    const rows = await this.prisma.chainVersion.findMany({
      where: { chainType, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async findActive(chainType: ChainType, tenantId: string): Promise<ChainVersionRecord | null> {
    const row = await this.prisma.chainVersion.findFirst({
      where: { chainType, tenantId, status: 'ACTIVE' },
    });
    return row ? this.toRecord(row) : null;
  }

  async findByStatus(
    chainType: ChainType,
    status: ChainVersionStatus,
    tenantId: string
  ): Promise<ChainVersionRecord[]> {
    const rows = await this.prisma.chainVersion.findMany({
      where: { chainType, status: status as any, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async update(id: string, data: Partial<ChainVersionRecord>): Promise<ChainVersionRecord> {
    const updateData = buildChainVersionUpdateData(data);
    const row = await this.prisma.chainVersion.update({
      where: { id },
      data: updateData as any,
    });
    return this.toRecord(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chainVersion.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Mapper
  // ---------------------------------------------------------------------------

  private toRecord(row: PrismaChainVersion): ChainVersionRecord {
    return {
      id: row.id,
      chainType: row.chainType as ChainType,
      status: row.status as ChainVersionStatus,
      prompt: row.prompt,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.maxTokens ?? 0,
      additionalParams: (row.config as Record<string, unknown>) ?? null,
      description: (row as any).description ?? null,
      parentVersionId: (row as any).parentVersionId ?? null,
      rolloutStrategy: row.rolloutStrategy as VersionRolloutStrategy,
      rolloutPercent: row.rolloutPercent,
      experimentId: row.experimentId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: (row as any).updatedAt ?? row.createdAt,
      tenantId: row.tenantId,
    };
  }
}
