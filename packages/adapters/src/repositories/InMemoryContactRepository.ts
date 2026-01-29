import { Contact, ContactId, Email, ContactRepository } from '@intelliflow/domain';

/**
 * In-Memory Contact Repository
 * Used for testing and development
 */
export class InMemoryContactRepository implements ContactRepository {
  private contacts: Map<string, Contact> = new Map();

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

  // Test helper methods
  clear(): void {
    this.contacts.clear();
  }

  getAll(): Contact[] {
    return Array.from(this.contacts.values());
  }
}
