import { PrismaClient, type TransactionClient } from '@intelliflow/db';
import {
  Contact,
  ContactId,
  Email,
  PhoneNumber,
  ContactStatus,
  ContactType,
  CrossTenantOrNotFoundError,
  type RepositoryTransaction,
} from '@intelliflow/domain';
import {
  ContactRepository,
  MergeInTransactionInput,
  MergeInTransactionResult,
  LinkContactsByDomainInput,
  LinkContactsByDomainResult,
} from '@intelliflow/application';

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

  async save(contact: Contact, tx?: RepositoryTransaction): Promise<void> {
    const db = (tx as TransactionClient | undefined) ?? this.prisma;
    const data = {
      id: contact.id.value,
      email: contact.email.value,
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title ?? null,
      phone: contact.phone?.toValue() ?? null, // Convert PhoneNumber to string
      department: contact.department ?? null,
      status: contact.status,
      accountId: contact.accountId ?? null,
      leadId: contact.leadId ?? null,
      ownerId: contact.ownerId,
      tenantId: contact.tenantId,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      lastContactedAt: contact.lastContactedAt ?? null, // IFC-192
      streetAddress: contact.streetAddress ?? null,
      city: contact.city ?? null,
      zipCode: contact.zipCode ?? null,
      company: contact.company ?? null,
      linkedInUrl: contact.linkedInUrl ?? null,
      contactType: contact.contactType ?? null,
      tags: contact.tags ?? [],
      contactNotes: contact.contactNotes ?? null,
    };

    await db.contact.upsert({
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
      status: record.status as ContactStatus,
      accountId: record.accountId ?? undefined,
      leadId: record.leadId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastContactedAt: record.lastContactedAt ?? undefined, // IFC-192
      streetAddress: record.streetAddress ?? undefined,
      city: record.city ?? undefined,
      zipCode: record.zipCode ?? undefined,
      company: record.company ?? undefined,
      linkedInUrl: record.linkedInUrl ?? undefined,
      contactType: record.contactType as ContactType | undefined,
      tags: record.tags ?? undefined,
      contactNotes: record.contactNotes ?? undefined,
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
        status: record.status as ContactStatus,
        accountId: record.accountId ?? undefined,
        leadId: record.leadId ?? undefined,
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastContactedAt: record.lastContactedAt ?? undefined, // IFC-192
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
        status: record.status as ContactStatus,
        accountId: record.accountId ?? undefined,
        leadId: record.leadId ?? undefined,
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastContactedAt: record.lastContactedAt ?? undefined, // IFC-192
      })
    );
  }

  async findByEmailInTenant(email: Email, tenantId: string): Promise<Contact | null> {
    const record = await this.prisma.contact.findFirst({
      where: { tenantId, email: email.value },
    });

    if (!record) return null;

    return Contact.reconstitute(createContactId(record.id), {
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      title: record.title ?? undefined,
      phone: toPhoneNumber(record.phone),
      department: record.department ?? undefined,
      status: record.status as ContactStatus,
      accountId: record.accountId ?? undefined,
      leadId: record.leadId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastContactedAt: record.lastContactedAt ?? undefined, // IFC-192
      streetAddress: record.streetAddress ?? undefined,
      city: record.city ?? undefined,
      zipCode: record.zipCode ?? undefined,
      company: record.company ?? undefined,
      linkedInUrl: record.linkedInUrl ?? undefined,
      contactType: record.contactType as ContactType | undefined,
      tags: record.tags ?? undefined,
      contactNotes: record.contactNotes ?? undefined,
    });
  }

  async delete(id: ContactId): Promise<void> {
    await this.prisma.contact.delete({
      where: { id: id.value },
    });
  }

  async existsByEmailInTenant(email: Email, tenantId: string): Promise<boolean> {
    const count = await this.prisma.contact.count({
      where: { tenantId, email: email.value },
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
      status: record.status as ContactStatus,
      accountId: record.accountId ?? undefined,
      leadId: record.leadId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastContactedAt: record.lastContactedAt ?? undefined, // IFC-192
      streetAddress: record.streetAddress ?? undefined,
      city: record.city ?? undefined,
      zipCode: record.zipCode ?? undefined,
      company: record.company ?? undefined,
      linkedInUrl: record.linkedInUrl ?? undefined,
      contactType: record.contactType as ContactType | undefined,
      tags: record.tags ?? undefined,
      contactNotes: record.contactNotes ?? undefined,
    });
  }

  async countByAccountId(accountId: string): Promise<number> {
    return this.prisma.contact.count({
      where: { accountId },
    });
  }

  /**
   * IFC-310: Atomic merge with child re-parenting + tenant guard.
   * All table writes happen inside a single `$transaction`; any failure
   * rolls back the whole operation.
   */
  async mergeInTransaction(input: MergeInTransactionInput): Promise<MergeInTransactionResult> {
    const { primaryId, secondaryId, tenantId, mergeFields } = input;

    return this.prisma.$transaction(async (tx) => {
      const [primary, secondary] = await Promise.all([
        tx.contact.findFirst({ where: { id: primaryId, tenantId } }),
        tx.contact.findFirst({ where: { id: secondaryId, tenantId } }),
      ]);

      if (!primary || !secondary) {
        throw CrossTenantOrNotFoundError.forMerge(primaryId, secondaryId, tenantId);
      }
      if (primary.tenantId !== tenantId || secondary.tenantId !== tenantId) {
        throw CrossTenantOrNotFoundError.forMerge(primaryId, secondaryId, tenantId);
      }

      const txAny = tx as unknown as {
        contactActivity?: { updateMany: (args: unknown) => Promise<{ count: number }> };
        contactNote?: { updateMany: (args: unknown) => Promise<{ count: number }> };
        opportunity?: { updateMany: (args: unknown) => Promise<{ count: number }> };
        task?: { updateMany: (args: unknown) => Promise<{ count: number }> };
        contactAIInsight?: { updateMany: (args: unknown) => Promise<{ count: number }> };
        contactTagAssignment?: {
          findMany: (args: unknown) => Promise<Array<{ tagId: string }>>;
          createMany: (args: unknown) => Promise<{ count: number }>;
          deleteMany: (args: unknown) => Promise<{ count: number }>;
        };
        contact: {
          update: (args: unknown) => Promise<unknown>;
          delete: (args: unknown) => Promise<unknown>;
        };
      };

      // AC-006 / TC-NEG-002: NEVER swallow errors inside the $transaction —
      // Prisma needs the rejection to propagate so it can roll back. The only
      // permitted "skip" is when the delegate is absent from the tx proxy
      // (e.g., mocked test harnesses that don't stub every relation table).
      const reparent = async (
        table: 'contactActivity' | 'contactNote' | 'opportunity' | 'task' | 'contactAIInsight'
      ): Promise<number> => {
        const t = txAny[table];
        if (!t?.updateMany) return 0;
        const r = await t.updateMany({
          where: { contactId: secondaryId, tenantId },
          data: { contactId: primaryId },
        });
        return (r as { count: number }).count;
      };

      const activities = await reparent('contactActivity');
      const notes = await reparent('contactNote');
      const opportunities = await reparent('opportunity');
      const tasks = await reparent('task');
      const aiInsights = await reparent('contactAIInsight');

      let tagAssignments = 0;
      if (txAny.contactTagAssignment?.findMany) {
        const secTags = await txAny.contactTagAssignment.findMany({
          where: { contactId: secondaryId, tenantId },
        });
        const primExisting = await txAny.contactTagAssignment.findMany({
          where: { contactId: primaryId, tenantId },
        });
        const primTagIds = new Set(primExisting.map((t) => t.tagId));
        const toCreate = secTags
          .filter((t) => !primTagIds.has(t.tagId))
          .map((t) => ({ contactId: primaryId, tagId: t.tagId, tenantId }));
        if (toCreate.length > 0) {
          const createResult = await txAny.contactTagAssignment.createMany({
            data: toCreate,
          });
          tagAssignments = (createResult as { count: number }).count;
        }
        await txAny.contactTagAssignment.deleteMany({
          where: { contactId: secondaryId, tenantId },
        });
      }

      const fieldsUpdated: string[] = [];
      const mergeData: Record<string, unknown> = {};
      if (mergeFields.title && !primary.title) {
        mergeData.title = mergeFields.title;
        fieldsUpdated.push('title');
      }
      if (mergeFields.phone && !primary.phone) {
        mergeData.phone = mergeFields.phone;
        fieldsUpdated.push('phone');
      }
      if (mergeFields.department && !primary.department) {
        mergeData.department = mergeFields.department;
        fieldsUpdated.push('department');
      }
      if (mergeFields.accountId && !primary.accountId) {
        mergeData.accountId = mergeFields.accountId;
        fieldsUpdated.push('accountId');
      }

      if (Object.keys(mergeData).length > 0) {
        await txAny.contact.update({
          where: { id: primaryId, tenantId },
          data: mergeData,
        });
      }

      await txAny.contact.delete({
        where: { id: secondaryId, tenantId },
      });

      return {
        survivingContactId: primaryId,
        mergedContactId: secondaryId,
        fieldsUpdated,
        rowsReparented: {
          activities,
          notes,
          opportunities,
          tasks,
          aiInsights,
          tagAssignments,
        },
        mergedAt: new Date(),
      } satisfies MergeInTransactionResult;
    });
  }

  /**
   * IFC-310 AC-010 / R9: Atomic auto-link-by-domain.
   * findMany + updateMany execute inside one $transaction so a concurrent
   * writer cannot interleave a contact claim between read and write. If the
   * match set exceeds `maxBatch`, returns `{ overflow: true }` without
   * performing any update.
   */
  async linkContactsToAccountByEmailDomain(
    input: LinkContactsByDomainInput
  ): Promise<LinkContactsByDomainResult> {
    const { accountId, domain, tenantId, maxBatch } = input;
    const normalizedDomain = domain
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
    if (!normalizedDomain || !normalizedDomain.includes('.')) {
      return { overflow: false, linkedIds: [] };
    }

    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.contact.findMany({
        where: {
          tenantId,
          accountId: null,
          email: { endsWith: `@${normalizedDomain}`, mode: 'insensitive' },
        },
        select: { id: true },
        take: maxBatch + 1,
      });

      if (candidates.length > maxBatch) {
        return {
          overflow: true,
          overflowSampleIds: candidates.slice(0, 5).map((c) => c.id),
        };
      }

      if (candidates.length === 0) {
        return { overflow: false, linkedIds: [] };
      }

      const ids = candidates.map((c) => c.id);
      await tx.contact.updateMany({
        where: { id: { in: ids }, tenantId },
        data: { accountId },
      });
      return { overflow: false, linkedIds: ids };
    });
  }
}
