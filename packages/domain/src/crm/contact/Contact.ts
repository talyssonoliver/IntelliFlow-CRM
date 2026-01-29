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

export const CONTACT_STATUSES = ['ACTIVE', 'INACTIVE', 'PROSPECT', 'CUSTOMER', 'FORMER_CUSTOMER'] as const;

// Derive types from const arrays
export type ContactType = (typeof CONTACT_TYPES)[number];
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

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

    if (updates.firstName !== undefined && updates.firstName !== this.props.firstName) {
      this.props.firstName = updates.firstName;
      updatedFields.push('firstName');
    }

    if (updates.lastName !== undefined && updates.lastName !== this.props.lastName) {
      this.props.lastName = updates.lastName;
      updatedFields.push('lastName');
    }

    if (updates.title !== undefined && updates.title !== this.props.title) {
      this.props.title = updates.title;
      updatedFields.push('title');
    }

    if (updates.phone !== undefined) {
      let newPhone: PhoneNumber | undefined;

      if (typeof updates.phone === 'string') {
        const phoneResult = PhoneNumber.create(updates.phone);
        if (phoneResult.isFailure) {
          return Result.fail(phoneResult.error);
        }
        newPhone = phoneResult.value;
      } else {
        newPhone = updates.phone;
      }

      if (!this.props.phone?.equals(newPhone)) {
        this.props.phone = newPhone;
        updatedFields.push('phone');
      }
    }

    if (updates.department !== undefined && updates.department !== this.props.department) {
      this.props.department = updates.department;
      updatedFields.push('department');
    }

    if (updates.status !== undefined && updates.status !== this.props.status) {
      this.props.status = updates.status;
      updatedFields.push('status');
    }

    // Extended field updates
    if (updates.streetAddress !== undefined && updates.streetAddress !== this.props.streetAddress) {
      this.props.streetAddress = updates.streetAddress;
      updatedFields.push('streetAddress');
    }

    if (updates.city !== undefined && updates.city !== this.props.city) {
      this.props.city = updates.city;
      updatedFields.push('city');
    }

    if (updates.zipCode !== undefined && updates.zipCode !== this.props.zipCode) {
      this.props.zipCode = updates.zipCode;
      updatedFields.push('zipCode');
    }

    if (updates.company !== undefined && updates.company !== this.props.company) {
      this.props.company = updates.company;
      updatedFields.push('company');
    }

    if (updates.linkedInUrl !== undefined && updates.linkedInUrl !== this.props.linkedInUrl) {
      this.props.linkedInUrl = updates.linkedInUrl;
      updatedFields.push('linkedInUrl');
    }

    if (updates.contactType !== undefined && updates.contactType !== this.props.contactType) {
      this.props.contactType = updates.contactType;
      updatedFields.push('contactType');
    }

    if (updates.tags !== undefined) {
      this.props.tags = updates.tags;
      updatedFields.push('tags');
    }

    if (updates.contactNotes !== undefined && updates.contactNotes !== this.props.contactNotes) {
      this.props.contactNotes = updates.contactNotes;
      updatedFields.push('contactNotes');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new ContactUpdatedEvent(this.id, updatedFields, updatedBy));
    }

    return Result.ok(undefined);
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
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
