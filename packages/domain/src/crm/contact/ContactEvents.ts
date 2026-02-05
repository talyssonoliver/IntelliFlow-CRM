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

/**
 * Event: Contact was manually linked to a lead (IFC-184)
 * Distinct from ContactConvertedFromLeadEvent which fires at creation time.
 * This event fires when an existing contact is linked to an existing lead.
 */
export class ContactLinkedToLeadEvent extends DomainEvent {
  readonly eventType = 'contact.linked_to_lead';

  constructor(
    public readonly contactId: ContactId,
    public readonly leadId: string,
    public readonly linkedBy: string,
    public readonly linkedAt: Date = new Date()
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      leadId: this.leadId,
      linkedBy: this.linkedBy,
      linkedAt: this.linkedAt.toISOString(),
    };
  }
}

/**
 * Event: Contact was unlinked from a lead (IFC-184)
 */
export class ContactUnlinkedFromLeadEvent extends DomainEvent {
  readonly eventType = 'contact.unlinked_from_lead';

  constructor(
    public readonly contactId: ContactId,
    public readonly previousLeadId: string,
    public readonly unlinkedBy: string,
    public readonly unlinkedAt: Date = new Date()
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      contactId: this.contactId.value,
      previousLeadId: this.previousLeadId,
      unlinkedBy: this.unlinkedBy,
      unlinkedAt: this.unlinkedAt.toISOString(),
    };
  }
}
