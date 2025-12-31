import { PrismaClient } from '@intelliflow/db';
import { Contact, ContactId, Email, PhoneNumber } from '@intelliflow/domain';
import { ContactRepository } from '@intelliflow/application';

/**
 * Helper to create ContactId from string, throwing if invalid
 */
function createContactId(id: string): ContactId {
  const result = ContactId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid ContactId: ${id}`);
  }
  return result.value;
}

/**
 * Helper to convert string to PhoneNumber Value Object
 */
function toPhoneNumber(phone: string | null): PhoneNumber | undefined {
  if (!phone) return undefined;
  const result = PhoneNumber.create(phone);
  if (result.isFailure) {
    // Log warning but don't throw - data might be legacy
    console.warn(`Invalid phone number in database: ${phone}`);
    return undefined;
  }
  return result.value;
}

/**
 * Prisma Contact Repository
 * Implements ContactRepository port using Prisma ORM
 */
export class PrismaContactRepository implements ContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(contact: Contact): Promise<void> {
    const data = {
      id: contact.id.value,
      email: contact.email.value,
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title ?? null,
      phone: contact.phone?.toValue() ?? null, // Convert PhoneNumber to string
      department: contact.department ?? null,
      accountId: contact.accountId ?? null,
      leadId: contact.leadId ?? null,
      ownerId: contact.ownerId,
      tenantId: contact.tenantId,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };

    await this.prisma.contact.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: ContactId): Promise<Contact | null> {
    const record = await this.prisma.contact.findUnique({
      where: { id: id.value },
    });

    if (!record) return null;

    return Contact.reconstitute(createContactId(record.id), {
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      title: record.title ?? undefined,
      phone: toPhoneNumber(record.phone),
      department: record.department ?? undefined,
      accountId: record.accountId ?? undefined,
      leadId: record.leadId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findByAccountId(accountId: string): Promise<Contact[]> {
    const records = await this.prisma.contact.findMany({
      where: { accountId },
      orderBy: { lastName: 'asc' },
    });

    return records.map((record) =>
      Contact.reconstitute(createContactId(record.id), {
        email: record.email,
        firstName: record.firstName,
        lastName: record.lastName,
        title: record.title ?? undefined,
        phone: toPhoneNumber(record.phone),
        department: record.department ?? undefined,
        accountId: record.accountId ?? undefined,
        leadId: record.leadId ?? undefined,
        ownerId: record.ownerId,
      tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async findByOwnerId(ownerId: string): Promise<Contact[]> {
    const records = await this.prisma.contact.findMany({
      where: { ownerId },
      orderBy: { lastName: 'asc' },
    });

    return records.map((record) =>
      Contact.reconstitute(createContactId(record.id), {
        email: record.email,
        firstName: record.firstName,
        lastName: record.lastName,
        title: record.title ?? undefined,
        phone: toPhoneNumber(record.phone),
        department: record.department ?? undefined,
        accountId: record.accountId ?? undefined,
        leadId: record.leadId ?? undefined,
        ownerId: record.ownerId,
      tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async findByEmail(email: Email): Promise<Contact | null> {
    const record = await this.prisma.contact.findUnique({
      where: { email: email.value },
    });

    if (!record) return null;

    return Contact.reconstitute(createContactId(record.id), {
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      title: record.title ?? undefined,
      phone: toPhoneNumber(record.phone),
      department: record.department ?? undefined,
      accountId: record.accountId ?? undefined,
      leadId: record.leadId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async delete(id: ContactId): Promise<void> {
    await this.prisma.contact.delete({
      where: { id: id.value },
    });
  }

  async existsByEmail(email: Email): Promise<boolean> {
    const count = await this.prisma.contact.count({
      where: { email: email.value },
    });
    return count > 0;
  }

  async findByLeadId(leadId: string): Promise<Contact | null> {
    const record = await this.prisma.contact.findFirst({
      where: { leadId },
    });

    if (!record) return null;

    return Contact.reconstitute(createContactId(record.id), {
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      title: record.title ?? undefined,
      phone: toPhoneNumber(record.phone),
      department: record.department ?? undefined,
      accountId: record.accountId ?? undefined,
      leadId: record.leadId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async countByAccountId(accountId: string): Promise<number> {
    return this.prisma.contact.count({
      where: { accountId },
    });
  }
}
