import {
  Result,
  DomainError,
  Contact,
  ContactId,
  ContactStatus,
  ContactType,
  Email,
  ContactRepository,
  AccountRepository,
  AccountId,
  LeadRepository,
  LeadId,
  CreateContactProps,
  ContactSearchParams,
  ContactSearchResult,
  ContactInteractionType,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, ValidationError, NotFoundError } from '../errors';
import { ContactMergedEvent } from './events/ContactMergedEvent';

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
    private readonly leadRepository: LeadRepository,
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

      const account = await this.accountRepository.findById(accountIdResult.value, props.tenantId);
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
    } catch {
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
      status?: ContactStatus;
      streetAddress?: string;
      city?: string;
      zipCode?: string;
      company?: string;
      linkedInUrl?: string;
      contactType?: ContactType;
      tags?: string[];
      contactNotes?: string;
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
    } catch {
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
    } catch {
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
    associatedBy: string,
    tenantId: string
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
      this.accountRepository.findById(accountIdResult.value, tenantId),
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
    } catch {
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
    } catch {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Link contact to a lead (IFC-184)
   * This is for retroactive association, distinct from lead conversion.
   */
  async linkToLead(
    contactId: string,
    leadId: string,
    linkedBy: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const leadIdResult = LeadId.create(leadId);
    if (leadIdResult.isFailure) {
      return Result.fail(leadIdResult.error);
    }

    const [contact, lead] = await Promise.all([
      this.contactRepository.findById(contactIdResult.value),
      this.leadRepository.findById(leadIdResult.value),
    ]);

    if (!contact) {
      return Result.fail(new NotFoundError(`Contact not found: ${contactId}`));
    }

    if (!lead) {
      return Result.fail(new NotFoundError(`Lead not found: ${leadId}`));
    }

    // Validate tenant isolation - contact and lead must be in same tenant
    if (contact.tenantId !== lead.tenantId) {
      return Result.fail(new ValidationError('Contact and Lead must belong to the same tenant'));
    }

    const linkResult = contact.linkToLead(leadId, linkedBy);
    if (linkResult.isFailure) {
      return Result.fail(linkResult.error);
    }

    try {
      await this.contactRepository.save(contact);
    } catch (error) {
      // Handle race condition on unique constraint
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return Result.fail(new ValidationError('Lead is already linked to another contact'));
      }
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Unlink contact from lead (IFC-184)
   */
  async unlinkFromLead(
    contactId: string,
    unlinkedBy: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new NotFoundError(`Contact not found: ${contactId}`));
    }

    const unlinkResult = contact.unlinkFromLead(unlinkedBy);
    if (unlinkResult.isFailure) {
      return Result.fail(unlinkResult.error);
    }

    try {
      await this.contactRepository.save(contact);
    } catch {
      return Result.fail(new PersistenceError('Failed to save contact'));
    }

    await this.publishEvents(contact);

    return Result.ok(contact);
  }

  /**
   * Record an interaction on a contact (IFC-192)
   * Updates lastContactedAt and emits ContactInteractedEvent
   */
  async recordInteraction(
    contactId: string,
    interactionType: ContactInteractionType,
    userId: string
  ): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new NotFoundError(`Contact not found: ${contactId}`));
    }

    const result = contact.recordInteraction(interactionType, userId);
    if (result.isFailure) {
      return Result.fail(result.error);
    }

    try {
      await this.contactRepository.save(contact);
    } catch {
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
   * Merge two contacts (keeping the primary one).
   *
   * IFC-310: Atomic transactional merge with child re-parenting.
   * Delegates to `contactRepository.mergeInTransaction` so the whole operation
   * (field merge + child re-parenting + secondary delete) runs inside a single
   * Prisma transaction. On success emits a `ContactMergedEvent` via the event
   * bus (transactional outbox pattern — ADR-011).
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

    if (primaryContactId === secondaryContactId) {
      return Result.fail(new ValidationError('Cannot merge a contact with itself'));
    }

    const [primary, secondary] = await Promise.all([
      this.contactRepository.findById(primaryIdResult.value),
      this.contactRepository.findById(secondaryIdResult.value),
    ]);

    if (!primary) {
      return Result.fail(new NotFoundError(`Primary contact not found: ${primaryContactId}`));
    }
    if (!secondary) {
      return Result.fail(new NotFoundError(`Secondary contact not found: ${secondaryContactId}`));
    }

    // Cross-tenant guard (defence-in-depth; repository enforces again inside tx).
    if (primary.tenantId !== secondary.tenantId) {
      return Result.fail(
        new ValidationError(
          `Cannot merge contacts from different tenants: ${primary.tenantId} vs ${secondary.tenantId}`
        )
      );
    }

    // Prepare scalar merge fields (primary-wins policy: secondary fills
    // null/empty only).
    const mergeFields: {
      title?: string;
      phone?: string;
      department?: string;
      accountId?: string;
    } = {};
    if (!primary.title && secondary.title) mergeFields.title = secondary.title;
    if (!primary.phone && secondary.phone) mergeFields.phone = secondary.phone.toValue();
    if (!primary.department && secondary.department) mergeFields.department = secondary.department;
    if (!primary.hasAccount && secondary.hasAccount && secondary.accountId) {
      mergeFields.accountId = secondary.accountId;
    }

    // Delegate the atomic merge to the repository port. The Prisma adapter
    // wraps everything (child re-parenting + field merge + secondary delete)
    // in a single `$transaction`.
    let mergeResult;
    try {
      mergeResult = await this.contactRepository.mergeInTransaction({
        primaryId: primaryContactId,
        secondaryId: secondaryContactId,
        tenantId: primary.tenantId,
        mergedBy,
        mergeFields,
      });
    } catch (error) {
      const domainError =
        error instanceof DomainError
          ? error
          : new PersistenceError('Failed to complete contact merge');
      return Result.fail(domainError);
    }

    // Post-commit: emit ContactMergedEvent via event bus. Failure here MUST
    // NOT roll back the merge (transaction already committed) — NF-005.
    try {
      const event = new ContactMergedEvent({
        primaryId: mergeResult.survivingContactId,
        mergedContactId: mergeResult.mergedContactId,
        tenantId: primary.tenantId,
        mergedBy,
        mergedAt: mergeResult.mergedAt,
        fieldsUpdated: mergeResult.fieldsUpdated,
      });
      await this.eventBus.publish(event);
    } catch (error) {
      console.warn('[ContactService.mergeContacts] event publish failed (fire-and-forget):', error);
    }

    return Result.ok({
      survivingContactId: mergeResult.survivingContactId,
      mergedContactId: mergeResult.mergedContactId,
      fieldsUpdated: mergeResult.fieldsUpdated,
      mergedAt: mergeResult.mergedAt,
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
   * Get a contact by ID
   */
  async getContactById(contactId: string): Promise<Result<Contact, DomainError>> {
    const contactIdResult = ContactId.create(contactId);
    if (contactIdResult.isFailure) {
      return Result.fail(contactIdResult.error);
    }

    const contact = await this.contactRepository.findById(contactIdResult.value);
    if (!contact) {
      return Result.fail(new NotFoundError(`Contact not found: ${contactId}`));
    }

    return Result.ok(contact);
  }

  /**
   * Get a contact by email
   */
  async getContactByEmail(email: string): Promise<Result<Contact, DomainError>> {
    const emailResult = Email.create(email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    const contact = await this.contactRepository.findByEmail(emailResult.value);
    if (!contact) {
      return Result.fail(new NotFoundError(`Contact with email ${email} not found`));
    }

    return Result.ok(contact);
  }

  /**
   * List contacts with filtering and pagination
   */
  async listContacts(params: ContactSearchParams): Promise<ContactSearchResult> {
    const { query, accountId, department, ownerId, page = 1, limit = 20 } = params;

    // Get contacts based on filters
    let contacts: Contact[];

    if (ownerId) {
      contacts = await this.contactRepository.findByOwnerId(ownerId);
    } else if (accountId) {
      contacts = await this.contactRepository.findByAccountId(accountId);
    } else {
      // For now, return empty - in production this would need a findAll method
      contacts = [];
    }

    // Apply additional filters in memory (in production, this would be done in the repository)
    let filteredContacts = contacts;

    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredContacts = filteredContacts.filter(
        (c) =>
          c.email.value.toLowerCase().includes(lowerQuery) ||
          c.firstName.toLowerCase().includes(lowerQuery) ||
          c.lastName.toLowerCase().includes(lowerQuery) ||
          (c.title?.toLowerCase().includes(lowerQuery) ?? false)
      );
    }

    if (department) {
      filteredContacts = filteredContacts.filter((c) =>
        c.department?.toLowerCase().includes(department.toLowerCase())
      );
    }

    // Apply pagination
    const total = filteredContacts.length;
    const skip = (page - 1) * limit;
    const paginatedContacts = filteredContacts.slice(skip, skip + limit);

    return {
      contacts: paginatedContacts,
      total,
      page,
      limit,
      hasMore: skip + paginatedContacts.length < total,
    };
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
    } catch {
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
