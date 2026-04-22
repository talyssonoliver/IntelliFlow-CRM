import {
  Contact,
  ContactId,
  Email,
  ContactRepository,
  CrossTenantOrNotFoundError,
  type MergeInTransactionInput,
  type MergeInTransactionResult,
  type LinkContactsByDomainInput,
  type LinkContactsByDomainResult,
} from '@intelliflow/domain';

/**
 * In-Memory Contact Repository
 * Used for testing and development
 */
export class InMemoryContactRepository implements ContactRepository {
  private readonly contacts: Map<string, Contact> = new Map();

  async save(contact: Contact): Promise<void> {
    this.contacts.set(contact.id.value, contact);
  }

  async findById(id: ContactId): Promise<Contact | null> {
    return this.contacts.get(id.value) ?? null;
  }

  async findByEmail(email: Email): Promise<Contact | null> {
    for (const contact of this.contacts.values()) {
      if (contact.email.equals(email)) {
        return contact;
      }
    }
    return null;
  }

  async findByOwnerId(ownerId: string): Promise<Contact[]> {
    return Array.from(this.contacts.values())
      .filter((contact) => contact.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByAccountId(accountId: string): Promise<Contact[]> {
    return Array.from(this.contacts.values())
      .filter((contact) => contact.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByLeadId(leadId: string): Promise<Contact | null> {
    for (const contact of this.contacts.values()) {
      if (contact.leadId === leadId) {
        return contact;
      }
    }
    return null;
  }

  async delete(id: ContactId): Promise<void> {
    this.contacts.delete(id.value);
  }

  async existsByEmail(email: Email): Promise<boolean> {
    for (const contact of this.contacts.values()) {
      if (contact.email.equals(email)) {
        return true;
      }
    }
    return false;
  }

  async countByAccountId(accountId: string): Promise<number> {
    let count = 0;
    for (const contact of this.contacts.values()) {
      if (contact.accountId === accountId) {
        count++;
      }
    }
    return count;
  }

  /**
   * IFC-310: In-memory merge — no child tables to re-parent, so this is
   * essentially a field-merge + delete. Matches the transactional contract.
   */
  async mergeInTransaction(
    input: MergeInTransactionInput
  ): Promise<MergeInTransactionResult> {
    const { primaryId, secondaryId, tenantId, mergeFields } = input;

    const primary = this.contacts.get(primaryId);
    const secondary = this.contacts.get(secondaryId);

    if (!primary || !secondary) {
      throw CrossTenantOrNotFoundError.forMerge(primaryId, secondaryId, tenantId);
    }
    if (primary.tenantId !== tenantId || secondary.tenantId !== tenantId) {
      throw CrossTenantOrNotFoundError.forMerge(primaryId, secondaryId, tenantId);
    }

    const fieldsUpdated: string[] = [];
    const updates: Record<string, unknown> = {};
    if (mergeFields.title && !primary.title) {
      updates.title = mergeFields.title;
      fieldsUpdated.push('title');
    }
    if (mergeFields.phone && !primary.phone) {
      updates.phone = mergeFields.phone;
      fieldsUpdated.push('phone');
    }
    if (mergeFields.department && !primary.department) {
      updates.department = mergeFields.department;
      fieldsUpdated.push('department');
    }
    if (mergeFields.accountId && !primary.accountId) {
      updates.accountId = mergeFields.accountId;
      fieldsUpdated.push('accountId');
    }

    if (Object.keys(updates).length > 0) {
      primary.updateContactInfo(updates as Parameters<typeof primary.updateContactInfo>[0], input.mergedBy);
    }

    this.contacts.delete(secondaryId);

    return {
      survivingContactId: primaryId,
      mergedContactId: secondaryId,
      fieldsUpdated,
      rowsReparented: {
        activities: 0,
        notes: 0,
        opportunities: 0,
        tasks: 0,
        aiInsights: 0,
        tagAssignments: 0,
      },
      mergedAt: new Date(),
    };
  }

  async linkContactsToAccountByEmailDomain(
    input: LinkContactsByDomainInput
  ): Promise<LinkContactsByDomainResult> {
    const { accountId, domain, tenantId, maxBatch } = input;
    const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./, '');
    if (!normalizedDomain || !normalizedDomain.includes('.')) {
      return { overflow: false, linkedIds: [] };
    }

    const suffix = `@${normalizedDomain}`;
    const candidates = Array.from(this.contacts.values()).filter(
      (c) =>
        c.tenantId === tenantId &&
        c.accountId == null &&
        c.email.value.toLowerCase().endsWith(suffix)
    );

    if (candidates.length > maxBatch) {
      return {
        overflow: true,
        overflowSampleIds: candidates.slice(0, 5).map((c) => c.id.value),
      };
    }

    if (candidates.length === 0) {
      return { overflow: false, linkedIds: [] };
    }

    const ids: string[] = [];
    for (const contact of candidates) {
      const result = contact.associateWithAccount(accountId, 'system');
      if (result.isSuccess) {
        ids.push(contact.id.value);
      }
    }
    return { overflow: false, linkedIds: ids };
  }

  // Test helper methods
  clear(): void {
    this.contacts.clear();
  }

  getAll(): Contact[] {
    return Array.from(this.contacts.values());
  }
}
