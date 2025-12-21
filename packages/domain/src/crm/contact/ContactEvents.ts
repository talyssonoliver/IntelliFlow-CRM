import { DomainEvent } from '../../shared/DomainEvent';
import { ContactId } from './ContactId';
import { Email } from '../lead/Email';

/**
 * Event: Contact was created
 */
export class ContactCreatedEvent extends DomainEvent {
  readonly eventType = 'contact.created';

  constructor(
    public readonly contactId: ContactId,
    public readonly email: Email,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly ownerId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      email: this.email.value,
      firstName: this.firstName,
      lastName: this.lastName,
      ownerId: this.ownerId,
    };
  }
}

/**
 * Event: Contact was updated
 */
export class ContactUpdatedEvent extends DomainEvent {
  readonly eventType = 'contact.updated';

  constructor(
    public readonly contactId: ContactId,
    public readonly updatedFields: string[],
    public readonly updatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      updatedFields: this.updatedFields,
      updatedBy: this.updatedBy,
    };
  }
}

/**
 * Event: Contact was associated with an account
 */
export class ContactAccountAssociatedEvent extends DomainEvent {
  readonly eventType = 'contact.account_associated';

  constructor(
    public readonly contactId: ContactId,
    public readonly accountId: string,
    public readonly associatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      accountId: this.accountId,
      associatedBy: this.associatedBy,
    };
  }
}

/**
 * Event: Contact was disassociated from an account
 */
export class ContactAccountDisassociatedEvent extends DomainEvent {
  readonly eventType = 'contact.account_disassociated';

  constructor(
    public readonly contactId: ContactId,
    public readonly previousAccountId: string,
    public readonly disassociatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      previousAccountId: this.previousAccountId,
      disassociatedBy: this.disassociatedBy,
    };
  }
}

/**
 * Event: Contact was converted from a lead
 */
export class ContactConvertedFromLeadEvent extends DomainEvent {
  readonly eventType = 'contact.converted_from_lead';

  constructor(
    public readonly contactId: ContactId,
    public readonly leadId: string,
    public readonly convertedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      leadId: this.leadId,
      convertedBy: this.convertedBy,
    };
  }
}
