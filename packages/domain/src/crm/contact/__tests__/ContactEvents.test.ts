import { describe, it, expect } from 'vitest';
import {
  ContactCreatedEvent,
  ContactUpdatedEvent,
  ContactAccountAssociatedEvent,
  ContactAccountDisassociatedEvent,
  ContactConvertedFromLeadEvent,
} from '../ContactEvents';
import { ContactId } from '../ContactId';
import { Email } from '../../lead/Email';

describe('ContactCreatedEvent', () => {
  it('should create event with correct payload', () => {
    const contactId = ContactId.generate();
    const emailResult = Email.create('john.doe@example.com');
    const email = emailResult.value;
    const event = new ContactCreatedEvent(contactId, email, 'John', 'Doe', 'owner-123');

    expect(event.eventType).toBe('contact.created');
    expect(event.contactId).toBe(contactId);
    expect(event.email).toBe(email);
    expect(event.firstName).toBe('John');
    expect(event.lastName).toBe('Doe');
    expect(event.ownerId).toBe('owner-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const contactId = ContactId.generate();
    const emailResult = Email.create('john.doe@example.com');
    const email = emailResult.value;
    const event = new ContactCreatedEvent(contactId, email, 'John', 'Doe', 'owner-123');
    const payload = event.toPayload();

    expect(payload.contactId).toBe(contactId.value);
    expect(payload.email).toBe('john.doe@example.com');
    expect(payload.firstName).toBe('John');
    expect(payload.lastName).toBe('Doe');
    expect(payload.ownerId).toBe('owner-123');
  });
});

describe('ContactUpdatedEvent', () => {
  it('should create event with updated fields', () => {
    const contactId = ContactId.generate();
    const updatedFields = ['firstName', 'lastName', 'phone'];
    const event = new ContactUpdatedEvent(contactId, updatedFields, 'user-123');

    expect(event.eventType).toBe('contact.updated');
    expect(event.contactId).toBe(contactId);
    expect(event.updatedFields).toEqual(updatedFields);
    expect(event.updatedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with single updated field', () => {
    const contactId = ContactId.generate();
    const updatedFields = ['email'];
    const event = new ContactUpdatedEvent(contactId, updatedFields, 'user-123');

    expect(event.updatedFields).toEqual(['email']);
  });

  it('should serialize to payload correctly', () => {
    const contactId = ContactId.generate();
    const updatedFields = ['firstName', 'lastName'];
    const event = new ContactUpdatedEvent(contactId, updatedFields, 'user-123');
    const payload = event.toPayload();

    expect(payload.contactId).toBe(contactId.value);
    expect(payload.updatedFields).toEqual(['firstName', 'lastName']);
    expect(payload.updatedBy).toBe('user-123');
  });
});

describe('ContactAccountAssociatedEvent', () => {
  it('should create event with account association', () => {
    const contactId = ContactId.generate();
    const event = new ContactAccountAssociatedEvent(contactId, 'account-123', 'user-456');

    expect(event.eventType).toBe('contact.account_associated');
    expect(event.contactId).toBe(contactId);
    expect(event.accountId).toBe('account-123');
    expect(event.associatedBy).toBe('user-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const contactId = ContactId.generate();
    const event = new ContactAccountAssociatedEvent(contactId, 'account-123', 'user-456');
    const payload = event.toPayload();

    expect(payload.contactId).toBe(contactId.value);
    expect(payload.accountId).toBe('account-123');
    expect(payload.associatedBy).toBe('user-456');
  });
});

describe('ContactAccountDisassociatedEvent', () => {
  it('should create event with account disassociation', () => {
    const contactId = ContactId.generate();
    const event = new ContactAccountDisassociatedEvent(contactId, 'account-123', 'user-456');

    expect(event.eventType).toBe('contact.account_disassociated');
    expect(event.contactId).toBe(contactId);
    expect(event.previousAccountId).toBe('account-123');
    expect(event.disassociatedBy).toBe('user-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const contactId = ContactId.generate();
    const event = new ContactAccountDisassociatedEvent(contactId, 'account-123', 'user-456');
    const payload = event.toPayload();

    expect(payload.contactId).toBe(contactId.value);
    expect(payload.previousAccountId).toBe('account-123');
    expect(payload.disassociatedBy).toBe('user-456');
  });
});

describe('ContactConvertedFromLeadEvent', () => {
  it('should create event with lead conversion', () => {
    const contactId = ContactId.generate();
    const event = new ContactConvertedFromLeadEvent(contactId, 'lead-123', 'user-456');

    expect(event.eventType).toBe('contact.converted_from_lead');
    expect(event.contactId).toBe(contactId);
    expect(event.leadId).toBe('lead-123');
    expect(event.convertedBy).toBe('user-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const contactId = ContactId.generate();
    const event = new ContactConvertedFromLeadEvent(contactId, 'lead-123', 'user-456');
    const payload = event.toPayload();

    expect(payload.contactId).toBe(contactId.value);
    expect(payload.leadId).toBe('lead-123');
    expect(payload.convertedBy).toBe('user-456');
  });
});
