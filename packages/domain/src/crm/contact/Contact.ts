import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { ContactId } from './ContactId';
import { Email } from '../lead/Email';
import { PhoneNumber } from '../../shared/PhoneNumber';
import {
  ContactCreatedEvent,
  ContactUpdatedEvent,
  ContactAccountAssociatedEvent,
  ContactAccountDisassociatedEvent,
  ContactConvertedFromLeadEvent,
  ContactLinkedToLeadEvent,
  ContactUnlinkedFromLeadEvent,
  ContactInteractedEvent,
} from './ContactEvents';

// Canonical enum values - single source of truth (IFC-089)
export const CONTACT_TYPES = [
  'customer',
  'prospect',
  'partner',
  'vendor',
  'investor',
  'other',
] as const;

export const CONTACT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'PROSPECT',
  'CUSTOMER',
  'FORMER_CUSTOMER',
] as const;

// IFC-192: Interaction types that trigger lastContactedAt update
export const CONTACT_INTERACTION_TYPES = ['EMAIL', 'CALL', 'MEETING', 'NOTE'] as const;

// Derive types from const arrays
export type ContactType = (typeof CONTACT_TYPES)[number];
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export type ContactInteractionType = (typeof CONTACT_INTERACTION_TYPES)[number];

export class ContactAlreadyHasAccountError extends DomainError {
  readonly code = 'CONTACT_ALREADY_HAS_ACCOUNT';
  constructor() {
    super('Contact is already associated with an account');
  }
}

export class ContactNotAssociatedWithAccountError extends DomainError {
  readonly code = 'CONTACT_NOT_ASSOCIATED_WITH_ACCOUNT';
  constructor() {
    super('Contact is not associated with any account');
  }
}

export class ContactAlreadyLinkedToLeadError extends DomainError {
  readonly code = 'CONTACT_ALREADY_LINKED_TO_LEAD';
  constructor(existingLeadId: string) {
    super(`Contact is already linked to lead ${existingLeadId}`);
  }
}

export class ContactNotLinkedToLeadError extends DomainError {
  readonly code = 'CONTACT_NOT_LINKED_TO_LEAD';
  constructor() {
    super('Contact is not linked to any lead');
  }
}

interface ContactProps {
  email: Email;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: PhoneNumber;
  department?: string;
  accountId?: string;
  leadId?: string;
  ownerId: string;
  tenantId: string;
  status: ContactStatus;
  // Extended fields (IFC-089 form support)
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  company?: string;
  linkedInUrl?: string;
  contactType?: ContactType;
  tags?: string[];
  contactNotes?: string;
  lastContactedAt?: Date; // IFC-192
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContactProps {
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string | PhoneNumber;
  department?: string;
  accountId?: string;
  leadId?: string;
  ownerId: string;
  tenantId: string;
  status?: ContactStatus;
  // Extended fields (IFC-089 form support)
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  company?: string;
  linkedInUrl?: string;
  contactType?: ContactType;
  tags?: string[];
  contactNotes?: string;
}

/**
 * Contact Aggregate Root
 * Represents a person in the CRM (converted from lead or directly created)
 */
export class Contact extends AggregateRoot<ContactId> {
  private readonly props: ContactProps;

  private constructor(id: ContactId, props: ContactProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get email(): Email {
    return this.props.email;
  }

  get firstName(): string {
    return this.props.firstName;
  }

  get lastName(): string {
    return this.props.lastName;
  }

  get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  get title(): string | undefined {
    return this.props.title;
  }

  get phone(): PhoneNumber | undefined {
    return this.props.phone;
  }

  get department(): string | undefined {
    return this.props.department;
  }

  get accountId(): string | undefined {
    return this.props.accountId;
  }

  get leadId(): string | undefined {
    return this.props.leadId;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get status(): ContactStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get hasAccount(): boolean {
    return this.props.accountId !== undefined;
  }

  get isConvertedFromLead(): boolean {
    return this.props.leadId !== undefined;
  }

  get hasLinkedLead(): boolean {
    return this.props.leadId !== undefined;
  }

  // Extended field getters (IFC-089)
  get streetAddress(): string | undefined {
    return this.props.streetAddress;
  }

  get city(): string | undefined {
    return this.props.city;
  }

  get zipCode(): string | undefined {
    return this.props.zipCode;
  }

  get company(): string | undefined {
    return this.props.company;
  }

  get linkedInUrl(): string | undefined {
    return this.props.linkedInUrl;
  }

  get contactType(): string | undefined {
    return this.props.contactType;
  }

  get tags(): string[] | undefined {
    return this.props.tags;
  }

  get contactNotes(): string | undefined {
    return this.props.contactNotes;
  }

  // IFC-192: Last time this contact was interacted with
  get lastContactedAt(): Date | undefined {
    return this.props.lastContactedAt;
  }

  // Factory method
  static create(props: CreateContactProps): Result<Contact, DomainError> {
    const emailResult = Email.create(props.email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    // Convert phone to PhoneNumber if string provided
    let phoneNumber: PhoneNumber | undefined = undefined;
    if (props.phone) {
      if (typeof props.phone === 'string') {
        const phoneResult = PhoneNumber.create(props.phone);
        if (phoneResult.isFailure) {
          return Result.fail(phoneResult.error);
        }
        phoneNumber = phoneResult.value;
      } else {
        // Already a PhoneNumber instance
        phoneNumber = props.phone;
      }
    }

    const now = new Date();
    const contactId = ContactId.generate();

    const contact = new Contact(contactId, {
      email: emailResult.value,
      firstName: props.firstName,
      lastName: props.lastName,
      title: props.title,
      phone: phoneNumber,
      department: props.department,
      accountId: props.accountId,
      leadId: props.leadId,
      ownerId: props.ownerId,
      tenantId: props.tenantId,
      status: props.status ?? 'ACTIVE',
      // Extended fields
      streetAddress: props.streetAddress,
      city: props.city,
      zipCode: props.zipCode,
      company: props.company,
      linkedInUrl: props.linkedInUrl,
      contactType: props.contactType,
      tags: props.tags,
      contactNotes: props.contactNotes,
      createdAt: now,
      updatedAt: now,
    });

    contact.addDomainEvent(
      new ContactCreatedEvent(
        contactId,
        emailResult.value,
        props.firstName,
        props.lastName,
        props.ownerId
      )
    );

    // If created from lead, emit conversion event
    if (props.leadId) {
      contact.addDomainEvent(
        new ContactConvertedFromLeadEvent(contactId, props.leadId, props.ownerId)
      );
    }

    return Result.ok(contact);
  }

  // Reconstitute from persistence
  static reconstitute(
    id: ContactId,
    props: Omit<ContactProps, 'email' | 'status'> & { email: string; status?: ContactStatus }
  ): Contact {
    const emailResult = Email.create(props.email);
    return new Contact(id, {
      ...props,
      email: emailResult.isSuccess ? emailResult.value : Email.create('unknown@unknown.com').value,
      status: props.status ?? 'ACTIVE',
    });
  }

  // Commands
  updateContactInfo(
    updates: Partial<{
      firstName: string;
      lastName: string;
      title: string;
      phone: string | PhoneNumber;
      department: string;
      status: ContactStatus;
      // Extended fields
      streetAddress: string;
      city: string;
      zipCode: string;
      company: string;
      linkedInUrl: string;
      contactType: ContactType;
      tags: string[];
      contactNotes: string;
    }>,
    updatedBy: string
  ): Result<void, DomainError> {
    const updatedFields: string[] = [];

    this.applyScalarUpdates(updates, updatedFields);

    if (updates.phone !== undefined) {
      const phoneError = this.applyPhoneUpdate(updates.phone, updatedFields);
      if (phoneError) return Result.fail(phoneError);
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new ContactUpdatedEvent(this.id, updatedFields, updatedBy));
    }

    return Result.ok(undefined);
  }

  private applyPhoneUpdate(
    phone: string | PhoneNumber,
    updatedFields: string[]
  ): DomainError | null {
    const resolvedPhone = this.resolvePhone(phone);
    if (resolvedPhone.isFailure) return resolvedPhone.error;
    const newPhone = resolvedPhone.value;
    if (!this.props.phone?.equals(newPhone)) {
      this.props.phone = newPhone;
      updatedFields.push('phone');
    }
    return null;
  }

  private applyScalarUpdates(
    updates: Partial<{
      firstName: string;
      lastName: string;
      title: string;
      department: string;
      status: ContactStatus;
      streetAddress: string;
      city: string;
      zipCode: string;
      company: string;
      linkedInUrl: string;
      contactType: ContactType;
      tags: string[];
      contactNotes: string;
    }>,
    updatedFields: string[]
  ): void {
    const simpleFields = [
      'firstName',
      'lastName',
      'title',
      'department',
      'status',
      'streetAddress',
      'city',
      'zipCode',
      'company',
      'linkedInUrl',
      'contactType',
      'contactNotes',
    ] as const;

    const mutableProps = this.props as { -readonly [K in keyof ContactProps]: ContactProps[K] };
    for (const field of simpleFields) {
      const val = updates[field];
      if (val !== undefined && val !== mutableProps[field]) {
        Object.assign(mutableProps, { [field]: val });
        updatedFields.push(field);
      }
    }

    if (updates.tags !== undefined) {
      this.props.tags = updates.tags;
      updatedFields.push('tags');
    }
  }

  private resolvePhone(phone: string | PhoneNumber): Result<PhoneNumber, DomainError> {
    if (typeof phone === 'string') {
      const phoneResult = PhoneNumber.create(phone);
      if (phoneResult.isFailure) {
        return Result.fail(phoneResult.error);
      }
      return Result.ok(phoneResult.value);
    }
    return Result.ok(phone);
  }

  associateWithAccount(
    accountId: string,
    associatedBy: string
  ): Result<void, ContactAlreadyHasAccountError> {
    if (this.hasAccount) {
      return Result.fail(new ContactAlreadyHasAccountError());
    }

    this.props.accountId = accountId;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new ContactAccountAssociatedEvent(this.id, accountId, associatedBy));

    return Result.ok(undefined);
  }

  disassociateFromAccount(
    disassociatedBy: string
  ): Result<void, ContactNotAssociatedWithAccountError> {
    if (!this.hasAccount) {
      return Result.fail(new ContactNotAssociatedWithAccountError());
    }

    const previousAccountId = this.props.accountId!;
    this.props.accountId = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ContactAccountDisassociatedEvent(this.id, previousAccountId, disassociatedBy)
    );

    return Result.ok(undefined);
  }

  /**
   * Link contact to an existing lead (IFC-184)
   * This is for retroactive association, distinct from lead conversion.
   * @param leadId - The lead ID to link to
   * @param linkedBy - The user performing the action
   * @returns Result indicating success or failure
   */
  linkToLead(leadId: string, linkedBy: string): Result<void, ContactAlreadyLinkedToLeadError> {
    // Idempotent: already linked to same lead
    if (this.props.leadId === leadId) {
      return Result.ok(undefined);
    }

    // Conflict: linked to different lead
    if (this.props.leadId && this.props.leadId !== leadId) {
      return Result.fail(new ContactAlreadyLinkedToLeadError(this.props.leadId));
    }

    this.props.leadId = leadId;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new ContactLinkedToLeadEvent(this.id, leadId, linkedBy));

    return Result.ok(undefined);
  }

  /**
   * Unlink contact from its associated lead (IFC-184)
   * @param unlinkedBy - The user performing the action
   * @returns Result indicating success or failure
   */
  unlinkFromLead(unlinkedBy: string): Result<void, ContactNotLinkedToLeadError> {
    // Idempotent: already unlinked
    if (!this.props.leadId) {
      return Result.ok(undefined);
    }

    const previousLeadId = this.props.leadId;
    this.props.leadId = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new ContactUnlinkedFromLeadEvent(this.id, previousLeadId, unlinkedBy));

    return Result.ok(undefined);
  }

  /**
   * Record an interaction with this contact (IFC-192)
   * Sets lastContactedAt (monotonic: only advances forward)
   */
  recordInteraction(
    interactionType: ContactInteractionType,
    recordedBy: string
  ): Result<void, DomainError> {
    const now = new Date();

    // Monotonic: only update if new timestamp is >= existing
    if (this.props.lastContactedAt && now < this.props.lastContactedAt) {
      // Still emit event but don't update the timestamp
      this.addDomainEvent(new ContactInteractedEvent(this.id, interactionType, now, recordedBy));
      return Result.ok(undefined);
    }

    this.props.lastContactedAt = now;
    this.props.updatedAt = now;

    this.addDomainEvent(new ContactInteractedEvent(this.id, interactionType, now, recordedBy));

    return Result.ok(undefined);
  }

  updateEmail(newEmail: string, updatedBy: string): Result<void, DomainError> {
    const emailResult = Email.create(newEmail);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    this.props.email = emailResult.value;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new ContactUpdatedEvent(this.id, ['email'], updatedBy));

    return Result.ok(undefined);
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      email: this.email.value,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName,
      title: this.title,
      phone: this.phone?.toValue(),
      department: this.department,
      accountId: this.accountId,
      leadId: this.leadId,
      ownerId: this.ownerId,
      status: this.status,
      // Extended fields
      streetAddress: this.streetAddress,
      city: this.city,
      zipCode: this.zipCode,
      company: this.company,
      linkedInUrl: this.linkedInUrl,
      contactType: this.contactType,
      tags: this.tags,
      contactNotes: this.contactNotes,
      lastContactedAt: this.lastContactedAt?.toISOString() ?? null,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
