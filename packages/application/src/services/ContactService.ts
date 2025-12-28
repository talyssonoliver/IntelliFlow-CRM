import {
  Result,
  DomainError,
  Contact,
  ContactId,
  Email,
  ContactRepository,
  AccountRepository,
  AccountId,
  CreateContactProps,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, ValidationError } from '../errors';

/**
 * Contact relationship types
 */
export type ContactRelationship = 'PRIMARY' | 'SECONDARY' | 'BILLING' | 'TECHNICAL' | 'EXECUTIVE';

/**
 * Contact merge result
 */
export interface ContactMergeResult {
  survivingContactId: string;
  mergedContactId: string;
  fieldsUpdated: string[];
  mergedAt: Date;
}

/**
 * Contact search filters
 */
export interface ContactFilters {
  accountId?: string;
  department?: string;
  hasAccount?: boolean;
  ownerId?: string;
}

/**
 * Contact Service
 *
 * Orchestrates contact-related business logic including:
 * - Contact creation and management
 * - Account relationship linking
 * - Contact deduplication and merging
 * - Business rule enforcement for contact operations
 */
export class ContactService {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly accountRepository: AccountRepository,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Create a new contact with validation
   */
  async createContact(props: CreateContactProps): Promise<Result<Contact, DomainError>> {
    // Validate email uniqueness
    const emailResult = Email.create(props.email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    const existingContact = await this.contactRepository.existsByEmail(emailResult.value);
    if (existingContact) {
      return Result.fail(new ValidationError(`Contact with email ${props.email} already exists`));
    }

    // Validate account exists if provided
    if (props.accountId) {
      const accountIdResult = AccountId.create(props.accountId);
      if (accountIdResult.isFailure) {
        return Result.fail(accountIdResult.error);
      }

      const account = await this.accountRepository.findById(accountIdResult.value);
      if (!account) {
        return Result.fail(new ValidationError(`Account not found: ${props.accountId}`));
      }
    }

    // Create contact
    const contactResult = Contact.create(props);
    if (contactResult.isFailure) {
      return Result.fail(contactResult.error);
    }

    const contact = contactResult.value;

    // Persist
    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    // Publish events
    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Update contact information
   */
  async updateContactInfo(
    contactId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      title?: string;
      phone?: string;
      department?: string;
    },
    updatedBy: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new ValidationError(`Contact not found: ${contactId}`));
    }

    contact.updateContactInfo(updates, updatedBy);

    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Update contact email with validation
   */
  async updateContactEmail(
    contactId: string,
    newEmail: string,
    updatedBy: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new ValidationError(`Contact not found: ${contactId}`));
    }

    // Check for email uniqueness
    const emailResult = Email.create(newEmail);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    const existingContact = await this.contactRepository.findByEmail(emailResult.value);
    if (existingContact && existingContact.id.value !== contactId) {
      return Result.fail(
        new ValidationError(`Email ${newEmail} is already in use by another contact`)
      );
    }

    const updateResult = contact.updateEmail(newEmail, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Associate contact with an account
   */
  async associateWithAccount(
    contactId: string,
    accountId: string,
    associatedBy: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const [contact, account] = await Promise.all([
      this.contactRepository.findById(contactIdResult.value),
      this.accountRepository.findById(accountIdResult.value),
    ]);

    if (!contact) {
      return Result.fail(new ValidationError(`Contact not found: ${contactId}`));
    }

    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const associateResult = contact.associateWithAccount(accountId, associatedBy);
    if (associateResult.isFailure) {
      return Result.fail(associateResult.error);
    }

    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Disassociate contact from account
   */
  async disassociateFromAccount(
    contactId: string,
    disassociatedBy: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new ValidationError(`Contact not found: ${contactId}`));
    }

    const disassociateResult = contact.disassociateFromAccount(disassociatedBy);
    if (disassociateResult.isFailure) {
      return Result.fail(disassociateResult.error);
    }

    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Find duplicate contacts by email domain
   */
  async findPotentialDuplicates(contactId: string): Promise<Contact[]> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return [];
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return [];
    }

    // Get all contacts for the same owner
    const ownerContacts = await this.contactRepository.findByOwnerId(contact.ownerId);

    // Filter potential duplicates based on:
    // 1. Same email domain
    // 2. Similar names
    const emailDomain = contact.email.value.split('@')[1];

    return ownerContacts.filter((c) => {
      if (c.id.value === contactId) return false;

      // Check email domain match
      const otherDomain = c.email.value.split('@')[1];
      if (otherDomain === emailDomain) return true;

      // Check name similarity (simple check)
      const nameSimilar =
        c.firstName.toLowerCase() === contact.firstName.toLowerCase() ||
        c.lastName.toLowerCase() === contact.lastName.toLowerCase();

      return nameSimilar;
    });
  }

  /**
   * Merge two contacts (keeping the primary one)
   */
  async mergeContacts(
    primaryContactId: string,
    secondaryContactId: string,
    mergedBy: string
  ): Promise<Result<ContactMergeResult, DomainError>> {
    const primaryIdResult = ContactId.create(primaryContactId);
    const secondaryIdResult = ContactId.create(secondaryContactId);

    if (primaryIdResult.isFailure) {
      return Result.fail(primaryIdResult.error);
    }
    if (secondaryIdResult.isFailure) {
      return Result.fail(secondaryIdResult.error);
    }

    const [primary, secondary] = await Promise.all([
      this.contactRepository.findById(primaryIdResult.value),
      this.contactRepository.findById(secondaryIdResult.value),
    ]);

    if (!primary) {
      return Result.fail(new ValidationError(`Primary contact not found: ${primaryContactId}`));
    }
    if (!secondary) {
      return Result.fail(new ValidationError(`Secondary contact not found: ${secondaryContactId}`));
    }

    // Business rule: Cannot merge contact with itself
    if (primaryContactId === secondaryContactId) {
      return Result.fail(new ValidationError('Cannot merge a contact with itself'));
    }

    // Merge fields from secondary to primary (only if primary is missing them)
    const fieldsUpdated: string[] = [];

    if (!primary.title && secondary.title) {
      primary.updateContactInfo({ title: secondary.title }, mergedBy);
      fieldsUpdated.push('title');
    }

    if (!primary.phone && secondary.phone) {
      primary.updateContactInfo({ phone: secondary.phone }, mergedBy);
      fieldsUpdated.push('phone');
    }

    if (!primary.department && secondary.department) {
      primary.updateContactInfo({ department: secondary.department }, mergedBy);
      fieldsUpdated.push('department');
    }

    // If secondary has account but primary doesn't, associate primary with that account
    if (!primary.hasAccount && secondary.hasAccount) {
      await this.associateWithAccount(primaryContactId, secondary.accountId!, mergedBy);
      fieldsUpdated.push('accountId');
    }

    try {
      // Save primary with merged data
      await this.contactRepository.save(primary);

      // Delete secondary contact
      await this.contactRepository.delete(secondaryIdResult.value);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to complete contact merge'));
    }

    await this.publishEvents(primary);

    return Result.ok({
      survivingContactId: primaryContactId,
      mergedContactId: secondaryContactId,
      fieldsUpdated,
      mergedAt: new Date(),
    });
  }

  /**
   * Get contacts by account
   */
  async getContactsByAccount(accountId: string): Promise<Contact[]> {
    return this.contactRepository.findByAccountId(accountId);
  }

  /**
   * Get contact from lead conversion
   */
  async getContactByLeadId(leadId: string): Promise<Contact | null> {
    return this.contactRepository.findByLeadId(leadId);
  }

  /**
   * Get contact statistics for owner
   */
  async getContactStatistics(ownerId?: string): Promise<{
    total: number;
    withAccount: number;
    withoutAccount: number;
    convertedFromLeads: number;
    byDepartment: Record<string, number>;
  }> {
    const contacts = ownerId ? await this.contactRepository.findByOwnerId(ownerId) : [];

    const withAccount = contacts.filter((c) => c.hasAccount).length;
    const withoutAccount = contacts.filter((c) => !c.hasAccount).length;
    const convertedFromLeads = contacts.filter((c) => c.isConvertedFromLead).length;

    const byDepartment: Record<string, number> = {};
    contacts.forEach((c) => {
      const dept = c.department ?? 'Unassigned';
      byDepartment[dept] = (byDepartment[dept] ?? 0) + 1;
    });

    return {
      total: contacts.length,
      withAccount,
      withoutAccount,
      convertedFromLeads,
      byDepartment,
    };
  }

  /**
   * Delete contact with business rules
   */
  async deleteContact(contactId: string): Promise<Result<void, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new ValidationError(`Contact not found: ${contactId}`));
    }

    // Business rule: Cannot delete a contact that was converted from a lead
    // (would break the audit trail)
    if (contact.isConvertedFromLead) {
      return Result.fail(
        new ValidationError(
          'Cannot delete a contact that was converted from a lead. Archive it instead.'
        )
      );
    }

    try {
      await this.contactRepository.delete(contactIdResult.value);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to delete contact'));
    }

    return Result.ok(undefined);
  }

  private async publishEvents(contact: Contact): Promise<void> {
    const events = contact.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish contact domain events:', error);
      }
    }
    contact.clearDomainEvents();
  }
}
