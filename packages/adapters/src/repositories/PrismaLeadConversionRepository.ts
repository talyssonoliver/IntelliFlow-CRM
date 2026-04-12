/**
 * PrismaLeadConversionRepository
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Prisma implementation of LeadConversionAuditRepository.
 * Handles persistence of conversion audit records with idempotency support.
 */

import { PrismaClient, Prisma } from '@intelliflow/db';
import { LeadConversionAudit, LeadConversionAuditRepository } from '@intelliflow/domain';

/**
 * Prisma repository for lead conversion audit records
 */
export class PrismaLeadConversionRepository implements LeadConversionAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Save an audit record
   * @param audit The audit record to save
   * @param tx Optional transaction context (PrismaClient or Prisma transaction)
   */
  async save(audit: LeadConversionAudit, tx?: unknown): Promise<void> {
    const client = (tx as PrismaClient) ?? this.prisma;

    await client.leadConversionAudit.create({
      data: {
        id: audit.id,
        leadId: audit.leadId,
        contactId: audit.contactId,
        accountId: audit.accountId,
        tenantId: audit.tenantId,
        convertedBy: audit.convertedBy,
        conversionSnapshot: audit.conversionSnapshot as Prisma.InputJsonValue,
        idempotencyKey: audit.idempotencyKey,
        createdAt: audit.createdAt,
      },
    });
  }

  /**
   * Find audit record by idempotency key
   * Returns null if no matching record exists
   */
  async findByIdempotencyKey(key: string): Promise<LeadConversionAudit | null> {
    const record = await this.prisma.leadConversionAudit.findUnique({
      where: { idempotencyKey: key },
    });

    if (!record) return null;

    return this.toDomain(record);
  }

  /**
   * Find audit record by lead ID and tenant
   */
  async findByLeadId(leadId: string, tenantId: string): Promise<LeadConversionAudit | null> {
    const record = await this.prisma.leadConversionAudit.findFirst({
      where: {
        leadId,
        tenantId,
      },
    });

    if (!record) return null;

    return this.toDomain(record);
  }

  /**
   * Convert Prisma record to domain entity
   */
  private toDomain(record: {
    id: string;
    leadId: string;
    contactId: string;
    accountId: string | null;
    tenantId: string;
    convertedBy: string;
    conversionSnapshot: unknown;
    idempotencyKey: string;
    createdAt: Date;
  }): LeadConversionAudit {
    return LeadConversionAudit.reconstitute(record.id, {
      leadId: record.leadId,
      contactId: record.contactId,
      accountId: record.accountId,
      tenantId: record.tenantId,
      convertedBy: record.convertedBy,
      conversionSnapshot: record.conversionSnapshot as Record<string, unknown>,
      idempotencyKey: record.idempotencyKey,
      createdAt: record.createdAt,
    });
  }
}
