/**
 * PrismaContactRepository Tests
 *
 * These tests verify the Prisma repository implementation using a mock Prisma client.
 * They ensure all repository methods correctly interact with the database layer.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaContactRepository } from '../src/repositories/PrismaContactRepository';
import { Contact, ContactId, Email } from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';

// Mock Prisma Client
const createMockPrismaClient = () => {
  return {
    contact: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('PrismaContactRepository', () => {
  let repository: PrismaContactRepository;
  let mockPrisma: PrismaClient;
  let testContact: Contact;
  let testContactId: ContactId;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaContactRepository(mockPrisma);

    // Create a test contact
    const contactResult = Contact.create({
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      title: 'CTO',
      phone: '+15550100',
      department: 'Engineering',
      accountId: 'account-123',
      ownerId: 'owner-123',
      tenantId: 'tenant-123',
    });

    testContact = contactResult.value;
    testContactId = testContact.id;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should call prisma.contact.upsert with correct data', async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.contact.upsert as any) = upsertMock;

      await repository.save(testContact);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { id: testContact.id.value },
        create: expect.objectContaining({
          id: testContact.id.value,
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          title: 'CTO',
          phone: '+15550100',
          department: 'Engineering',
          accountId: 'account-123',
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
        }),
        update: expect.objectContaining({
          email: 'john.doe@example.com',
        }),
      });
    });

    it('should handle null optional fields', async () => {
      const minimalContactResult = Contact.create({
        email: 'minimal@example.com',
        firstName: 'Min',
        lastName: 'Imal',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.contact.upsert as any) = upsertMock;

      await repository.save(minimalContactResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            title: null,
            phone: null,
            department: null,
            accountId: null,
            leadId: null,
          }),
        })
      );
    });

    it('should handle prisma errors', async () => {
      const upsertMock = vi.fn().mockRejectedValue(new Error('Database error'));
      (mockPrisma.contact.upsert as any) = upsertMock;

      await expect(repository.save(testContact)).rejects.toThrow('Database error');
    });
  });

  describe('findById()', () => {
    it('should return contact when found', async () => {
      const mockRecord = {
        id: testContactId.value,
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'CTO',
        phone: '+15550100',
        department: 'Engineering',
        accountId: 'account-123',
        leadId: null,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testContactId);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: testContactId.value },
      });

      expect(result).not.toBeNull();
      expect(result?.id.value).toBe(testContactId.value);
      expect(result?.email.value).toBe('john.doe@example.com');
      expect(result?.firstName).toBe('John');
      expect(result?.lastName).toBe('Doe');
    });

    it('should return null when not found', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue(null);
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testContactId);

      expect(result).toBeNull();
    });

    it('should handle null optional fields', async () => {
      const mockRecord = {
        id: testContactId.value,
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        leadId: null,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testContactId);

      expect(result?.title).toBeUndefined();
      expect(result?.phone).toBeUndefined();
      expect(result?.department).toBeUndefined();
      expect(result?.accountId).toBeUndefined();
    });
  });

  describe('findByAccountId()', () => {
    it('should return all contacts for account', async () => {
      const mockRecords = [
        {
          id: testContactId.value,
          email: 'contact1@example.com',
          firstName: 'John',
          lastName: 'Doe',
          title: null,
          phone: null,
          department: null,
          accountId: 'account-123',
          leadId: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ContactId.generate().value,
          email: 'contact2@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          title: null,
          phone: null,
          department: null,
          accountId: 'account-123',
          leadId: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.contact.findMany as any) = findManyMock;

      const results = await repository.findByAccountId('account-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { accountId: 'account-123' },
        orderBy: { lastName: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0].email.value).toBe('contact1@example.com');
      expect(results[1].email.value).toBe('contact2@example.com');
    });

    it('should return empty array when no contacts found', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.contact.findMany as any) = findManyMock;

      const results = await repository.findByAccountId('account-999');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all contacts for owner', async () => {
      const mockRecords = [
        {
          id: testContactId.value,
          email: 'contact1@example.com',
          firstName: 'John',
          lastName: 'Doe',
          title: null,
          phone: null,
          department: null,
          accountId: null,
          leadId: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.contact.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123' },
        orderBy: { lastName: 'asc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no contacts found', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.contact.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-999');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByEmail()', () => {
    it('should return contact when found', async () => {
      const mockRecord = {
        id: testContactId.value,
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        leadId: null,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      const emailResult = Email.create('john.doe@example.com');
      const result = await repository.findByEmail(emailResult.value);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { email: 'john.doe@example.com' },
      });

      expect(result).not.toBeNull();
      expect(result?.email.value).toBe('john.doe@example.com');
    });

    it('should return null when not found', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue(null);
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      const emailResult = Email.create('nonexistent@example.com');
      const result = await repository.findByEmail(emailResult.value);

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should call prisma.contact.delete with correct ID', async () => {
      const deleteMock = vi.fn().mockResolvedValue({});
      (mockPrisma.contact.delete as any) = deleteMock;

      await repository.delete(testContactId);

      expect(deleteMock).toHaveBeenCalledWith({
        where: { id: testContactId.value },
      });
    });

    it('should propagate prisma errors', async () => {
      const deleteMock = vi.fn().mockRejectedValue(new Error('Record not found'));
      (mockPrisma.contact.delete as any) = deleteMock;

      await expect(repository.delete(testContactId)).rejects.toThrow('Record not found');
    });
  });

  describe('existsByEmail()', () => {
    it('should return true when email exists', async () => {
      const countMock = vi.fn().mockResolvedValue(1);
      (mockPrisma.contact.count as any) = countMock;

      const emailResult = Email.create('john.doe@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(countMock).toHaveBeenCalledWith({
        where: { email: 'john.doe@example.com' },
      });

      expect(exists).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      const countMock = vi.fn().mockResolvedValue(0);
      (mockPrisma.contact.count as any) = countMock;

      const emailResult = Email.create('nonexistent@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid contact ID in reconstitution', async () => {
      const mockRecord = {
        id: 'invalid-uuid',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: null,
        phone: null,
        department: null,
        accountId: null,
        leadId: null,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      await expect(repository.findById(testContactId)).rejects.toThrow(/Invalid ContactId/);
    });
  });

  describe('Integration with Domain Layer', () => {
    it('should preserve all contact properties through save and find cycle', async () => {
      const mockRecord = {
        id: testContact.id.value,
        email: testContact.email.value,
        firstName: testContact.firstName,
        lastName: testContact.lastName,
        title: testContact.title,
        phone: testContact.phone?.value ?? null,
        department: testContact.department,
        accountId: testContact.accountId,
        leadId: testContact.leadId,
        ownerId: testContact.ownerId,
        tenantId: testContact.tenantId,
        createdAt: testContact.createdAt,
        updatedAt: testContact.updatedAt,
      };

      const upsertMock = vi.fn().mockResolvedValue(mockRecord);
      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);

      (mockPrisma.contact.upsert as any) = upsertMock;
      (mockPrisma.contact.findUnique as any) = findUniqueMock;

      await repository.save(testContact);
      const found = await repository.findById(testContact.id);

      expect(found).not.toBeNull();
      expect(found?.email.value).toBe(testContact.email.value);
      expect(found?.firstName).toBe(testContact.firstName);
      expect(found?.lastName).toBe(testContact.lastName);
      expect(found?.title).toBe(testContact.title);
      expect(found?.department).toBe(testContact.department);
    });
  });
});
