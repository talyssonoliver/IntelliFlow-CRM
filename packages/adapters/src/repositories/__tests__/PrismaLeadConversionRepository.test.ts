/**
 * PrismaLeadConversionRepository Tests
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Tests for the Prisma implementation of LeadConversionAuditRepository.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaLeadConversionRepository } from '../PrismaLeadConversionRepository';
import { LeadConversionAudit } from '@intelliflow/domain';

// Mock PrismaClient
const mockPrisma = {
  leadConversionAudit: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
};

describe('PrismaLeadConversionRepository', () => {
  let repository: PrismaLeadConversionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaLeadConversionRepository(mockPrisma as never);
  });

  const createTestAudit = (overrides: Partial<{
    leadId: string;
    contactId: string;
    accountId: string | null;
    tenantId: string;
    convertedBy: string;
    idempotencyKey: string;
  }> = {}) => {
    return LeadConversionAudit.create({
      leadId: overrides.leadId ?? 'lead-123',
      contactId: overrides.contactId ?? 'contact-456',
      accountId: overrides.accountId ?? null,
      tenantId: overrides.tenantId ?? 'tenant-789',
      convertedBy: overrides.convertedBy ?? 'user-abc',
      conversionSnapshot: {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
      idempotencyKey: overrides.idempotencyKey,
    });
  };

  describe('save', () => {
    it('should persist audit record with snapshot', async () => {
      const audit = createTestAudit();
      mockPrisma.leadConversionAudit.create.mockResolvedValue({});

      await repository.save(audit);

      expect(mockPrisma.leadConversionAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: audit.id,
          leadId: 'lead-123',
          contactId: 'contact-456',
          accountId: null,
          tenantId: 'tenant-789',
          convertedBy: 'user-abc',
          conversionSnapshot: expect.objectContaining({
            email: 'test@example.com',
          }),
          idempotencyKey: expect.any(String),
        }),
      });
    });

    it('should enforce unique idempotency key', async () => {
      const audit = createTestAudit({ idempotencyKey: 'unique-key-123' });

      // First save succeeds
      mockPrisma.leadConversionAudit.create.mockResolvedValueOnce({});
      await repository.save(audit);

      // Second save with same key should throw
      mockPrisma.leadConversionAudit.create.mockRejectedValueOnce(
        new Error('Unique constraint failed on the fields: (`idempotency_key`)')
      );

      const audit2 = createTestAudit({ idempotencyKey: 'unique-key-123' });
      await expect(repository.save(audit2)).rejects.toThrow('Unique constraint');
    });

    it('should enforce unique lead_id + tenant_id', async () => {
      const audit = createTestAudit();
      mockPrisma.leadConversionAudit.create.mockResolvedValueOnce({});
      await repository.save(audit);

      // Same lead + tenant with different idempotency key
      mockPrisma.leadConversionAudit.create.mockRejectedValueOnce(
        new Error('Unique constraint failed on the fields: (`lead_id`,`tenant_id`)')
      );

      const audit2 = createTestAudit({ idempotencyKey: 'different-key' });
      await expect(repository.save(audit2)).rejects.toThrow('Unique constraint');
    });

    it('should persist with account ID when provided', async () => {
      const audit = createTestAudit({ accountId: 'account-xyz' });
      mockPrisma.leadConversionAudit.create.mockResolvedValue({});

      await repository.save(audit);

      expect(mockPrisma.leadConversionAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'account-xyz',
        }),
      });
    });
  });

  describe('findByIdempotencyKey', () => {
    it('should return existing record for matching key', async () => {
      const mockRecord = {
        id: 'audit-id-123',
        leadId: 'lead-123',
        contactId: 'contact-456',
        accountId: null,
        tenantId: 'tenant-789',
        convertedBy: 'user-abc',
        conversionSnapshot: { email: 'test@example.com' },
        idempotencyKey: 'key-123',
        createdAt: new Date('2026-01-26T10:00:00Z'),
      };

      mockPrisma.leadConversionAudit.findUnique.mockResolvedValue(mockRecord);

      const result = await repository.findByIdempotencyKey('key-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('audit-id-123');
      expect(result!.leadId).toBe('lead-123');
      expect(result!.contactId).toBe('contact-456');
      expect(mockPrisma.leadConversionAudit.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'key-123' },
      });
    });

    it('should return null for non-existent key', async () => {
      mockPrisma.leadConversionAudit.findUnique.mockResolvedValue(null);

      const result = await repository.findByIdempotencyKey('non-existent-key');

      expect(result).toBeNull();
    });
  });

  describe('findByLeadId', () => {
    it('should return conversion record for lead', async () => {
      const mockRecord = {
        id: 'audit-id-123',
        leadId: 'lead-123',
        contactId: 'contact-456',
        accountId: 'account-789',
        tenantId: 'tenant-abc',
        convertedBy: 'user-xyz',
        conversionSnapshot: { email: 'test@example.com' },
        idempotencyKey: 'key-123',
        createdAt: new Date('2026-01-26T10:00:00Z'),
      };

      mockPrisma.leadConversionAudit.findFirst.mockResolvedValue(mockRecord);

      const result = await repository.findByLeadId('lead-123', 'tenant-abc');

      expect(result).not.toBeNull();
      expect(result!.leadId).toBe('lead-123');
      expect(result!.tenantId).toBe('tenant-abc');
      expect(mockPrisma.leadConversionAudit.findFirst).toHaveBeenCalledWith({
        where: {
          leadId: 'lead-123',
          tenantId: 'tenant-abc',
        },
      });
    });

    it('should filter by tenant', async () => {
      // Lead exists in different tenant
      mockPrisma.leadConversionAudit.findFirst.mockResolvedValue(null);

      const result = await repository.findByLeadId('lead-123', 'wrong-tenant');

      expect(result).toBeNull();
      expect(mockPrisma.leadConversionAudit.findFirst).toHaveBeenCalledWith({
        where: {
          leadId: 'lead-123',
          tenantId: 'wrong-tenant',
        },
      });
    });

    it('should return null when lead has not been converted', async () => {
      mockPrisma.leadConversionAudit.findFirst.mockResolvedValue(null);

      const result = await repository.findByLeadId('unconverted-lead', 'tenant-123');

      expect(result).toBeNull();
    });
  });

  describe('toOutput conversion', () => {
    it('should convert audit record to output format', async () => {
      const mockRecord = {
        id: 'audit-id-123',
        leadId: 'lead-123',
        contactId: 'contact-456',
        accountId: 'account-789',
        tenantId: 'tenant-abc',
        convertedBy: 'user-xyz',
        conversionSnapshot: { email: 'test@example.com', source: 'WEBSITE' },
        idempotencyKey: 'key-123',
        createdAt: new Date('2026-01-26T10:00:00Z'),
      };

      mockPrisma.leadConversionAudit.findUnique.mockResolvedValue(mockRecord);

      const audit = await repository.findByIdempotencyKey('key-123');
      const output = audit!.toOutput();

      expect(output).toEqual({
        leadId: 'lead-123',
        contactId: 'contact-456',
        accountId: 'account-789',
        leadStatus: 'CONVERTED',
        convertedBy: 'user-xyz',
        convertedAt: expect.any(Date),
        conversionSnapshot: expect.objectContaining({ email: 'test@example.com' }),
      });
    });
  });
});
