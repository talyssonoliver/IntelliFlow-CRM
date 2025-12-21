import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { ContactId } from './ContactId';
import { Email } from '../lead/Email';
import {
  ContactCreatedEvent,
  ContactUpdatedEvent,
  ContactAccountAssociatedEvent,
  ContactAccountDisassociatedEvent,
  ContactConvertedFromLeadEvent,
} from './ContactEvents';

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
  phone?: string;
  department?: string;
  accountId?: string;
  leadId?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContactProps {
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
  department?: string;
  accountId?: string;
  leadId?: string;
  ownerId: string;
}

/**
 * Contact Aggregate Root
 * Represents a person in the CRM (converted from lead or directly created)
 */
export class Contact extends AggregateRoot<ContactId> {
  private props: ContactProps;

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

  get phone(): string | undefined {
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

  // Factory method
  static create(props: CreateContactProps): Result<Contact, DomainError> {
    const emailResult = Email.create(props.email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    const now = new Date();
    const contactId = ContactId.generate();

    const contact = new Contact(contactId, {
      email: emailResult.value,
      firstName: props.firstName,
      lastName: props.lastName,
      title: props.title,
      phone: props.phone,
      department: props.department,
      accountId: props.accountId,
      leadId: props.leadId,
      ownerId: props.ownerId,
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
    props: Omit<ContactProps, 'email'> & { email: string }
  ): Contact {
    const emailResult = Email.create(props.email);
    return new Contact(id, {
      ...props,
      email: emailResult.isSuccess ? emailResult.value : Email.create('unknown@unknown.com').value,
    });
  }

  // Commands
  updateContactInfo(
    updates: Partial<
      Pick<ContactProps, 'firstName' | 'lastName' | 'title' | 'phone' | 'department'>
    >,
    updatedBy: string
  ): void {
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

    if (updates.phone !== undefined && updates.phone !== this.props.phone) {
      this.props.phone = updates.phone;
      updatedFields.push('phone');
    }

    if (updates.department !== undefined && updates.department !== this.props.department) {
      this.props.department = updates.department;
      updatedFields.push('department');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new ContactUpdatedEvent(this.id, updatedFields, updatedBy));
    }
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
      phone: this.phone,
      department: this.department,
      accountId: this.accountId,
      leadId: this.leadId,
      ownerId: this.ownerId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
