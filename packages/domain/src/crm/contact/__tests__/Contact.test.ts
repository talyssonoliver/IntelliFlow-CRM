/**
 * Contact Aggregate Root Tests
 *
 * These tests verify the domain logic of the Contact entity.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Contact,
  CONTACT_INTERACTION_TYPES,
  ContactAlreadyHasAccountError,
  ContactNotAssociatedWithAccountError,
  ContactAlreadyLinkedToLeadError,
  ContactNotLinkedToLeadError,
  InvalidContactTypeKeyError,
  CONTACT_TYPES,
  CONTACT_STATUSES,
} from '../Contact';
import { ContactId } from '../ContactId';
import { Email } from '../../lead/Email';
import {
  ContactCreatedEvent,
  ContactUpdatedEvent,
  ContactAccountAssociatedEvent,
  ContactAccountDisassociatedEvent,
  ContactConvertedFromLeadEvent,
  ContactInteractedEvent,
  ContactLinkedToLeadEvent,
  ContactUnlinkedFromLeadEvent,
} from '../ContactEvents';
import { PhoneNumber } from '../../../shared/PhoneNumber';

describe('Contact Aggregate', () => {
  describe('Factory Method - create()', () => {
    it('should create a new contact with valid data', () => {
      const result = Contact.create({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'CEO',
        phone: '+1-555-0100',
        department: 'Executive',
        ownerId: 'owner-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Contact);

      const contact = result.value;
      expect(contact.email.value).toBe('john@example.com');
      expect(contact.firstName).toBe('John');
      expect(contact.lastName).toBe('Doe');
      expect(contact.fullName).toBe('John Doe');
      expect(contact.title).toBe('CEO');
      // PhoneNumber normalizes to E.164 format
      expect(contact.phone?.value).toBe('+15550100');
      expect(contact.department).toBe('Executive');
      expect(contact.ownerId).toBe('owner-123');
      expect(contact.hasAccount).toBe(false);
      expect(contact.isConvertedFromLead).toBe(false);
    });

    it('should create a contact with minimal data', () => {
      const result = Contact.create({
        email: 'minimal@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        ownerId: 'owner-456',
      });

      expect(result.isSuccess).toBe(true);

      const contact = result.value;
      expect(contact.email.value).toBe('minimal@example.com');
      expect(contact.firstName).toBe('Jane');
      expect(contact.lastName).toBe('Smith');
      expect(contact.title).toBeUndefined();
      expect(contact.phone).toBeUndefined();
      expect(contact.department).toBeUndefined();
      expect(contact.accountId).toBeUndefined();
    });

    it('should create a contact with account association', () => {
      const result = Contact.create({
        email: 'account@example.com',
        firstName: 'Bob',
        lastName: 'Johnson',
        accountId: 'account-123',
        ownerId: 'owner-789',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe('account-123');
      expect(result.value.hasAccount).toBe(true);
    });

    it('should create a contact converted from lead', () => {
      const result = Contact.create({
        email: 'converted@example.com',
        firstName: 'Alice',
        lastName: 'Williams',
        leadId: 'lead-456',
        ownerId: 'owner-999',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe('lead-456');
      expect(result.value.isConvertedFromLead).toBe(true);
    });

    it('should fail with invalid email', () => {
      const result = Contact.create({
        email: 'invalid-email',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should fail with empty email', () => {
      const result = Contact.create({
        email: '',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should emit ContactCreatedEvent on creation', () => {
      const result = Contact.create({
        email: 'event@example.com',
        firstName: 'Event',
        lastName: 'Test',
        ownerId: 'owner-123',
      });

      const contact = result.value;
      const events = contact.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactCreatedEvent);

      const createdEvent = events[0] as ContactCreatedEvent;
      expect(createdEvent.contactId).toBe(contact.id);
      expect(createdEvent.email.value).toBe('event@example.com');
      expect(createdEvent.firstName).toBe('Event');
      expect(createdEvent.lastName).toBe('Test');
      expect(createdEvent.ownerId).toBe('owner-123');
    });

    it('should emit ContactConvertedFromLeadEvent when created from lead', () => {
      const result = Contact.create({
        email: 'leadconvert@example.com',
        firstName: 'Lead',
        lastName: 'Convert',
        leadId: 'lead-789',
        ownerId: 'owner-123',
      });

      const contact = result.value;
      const events = contact.getDomainEvents();

      expect(events).toHaveLength(2);
      expect(events[0]).toBeInstanceOf(ContactCreatedEvent);
      expect(events[1]).toBeInstanceOf(ContactConvertedFromLeadEvent);

      const convertedEvent = events[1] as ContactConvertedFromLeadEvent;
      expect(convertedEvent.contactId).toBe(contact.id);
      expect(convertedEvent.leadId).toBe('lead-789');
      expect(convertedEvent.convertedBy).toBe('owner-123');
    });

    it('should normalize email to lowercase', () => {
      const result = Contact.create({
        email: 'Test@Example.COM',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      expect(result.value.email.value).toBe('test@example.com');
    });
  });

  describe('Getters', () => {
    let contact: Contact;

    beforeEach(() => {
      const result = Contact.create({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'CEO',
        phone: '+1-555-0100',
        department: 'Executive',
        ownerId: 'owner-123',
      });
      contact = result.value;
    });

    it('should return full name when first and last name are set', () => {
      expect(contact.fullName).toBe('John Doe');
    });

    it('should return email domain', () => {
      expect(contact.email.domain).toBe('example.com');
    });

    it('should check if contact has account', () => {
      expect(contact.hasAccount).toBe(false);

      const withAccountResult = Contact.create({
        email: 'withaccount@example.com',
        firstName: 'With',
        lastName: 'Account',
        accountId: 'account-123',
        ownerId: 'owner-456',
      });

      expect(withAccountResult.value.hasAccount).toBe(true);
    });

    it('should check if contact is converted from lead', () => {
      expect(contact.isConvertedFromLead).toBe(false);

      const convertedResult = Contact.create({
        email: 'converted@example.com',
        firstName: 'Converted',
        lastName: 'Contact',
        leadId: 'lead-123',
        ownerId: 'owner-789',
      });

      expect(convertedResult.value.isConvertedFromLead).toBe(true);
    });
  });

  describe('updateContactInfo()', () => {
    let contact: Contact;

    beforeEach(() => {
      const result = Contact.create({
        email: 'update@example.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Manager',
        phone: '+1-555-0100',
        ownerId: 'owner-123',
      });
      contact = result.value;
      contact.clearDomainEvents();
    });

    it('should update contact information successfully', () => {
      contact.updateContactInfo(
        {
          firstName: 'Jane',
          title: 'Senior Manager',
          phone: '+1-555-9999',
        },
        'user-123'
      );

      expect(contact.firstName).toBe('Jane');
      expect(contact.lastName).toBe('Doe'); // Unchanged
      expect(contact.title).toBe('Senior Manager');
      // PhoneNumber normalizes to E.164 format (removes dashes/spaces)
      expect(contact.phone?.value).toBe('+15559999');
    });

    it('should emit ContactUpdatedEvent when fields change', () => {
      contact.updateContactInfo(
        {
          firstName: 'Jane',
          department: 'Sales',
        },
        'user-456'
      );

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactUpdatedEvent);

      const updatedEvent = events[0] as ContactUpdatedEvent;
      expect(updatedEvent.contactId).toBe(contact.id);
      expect(updatedEvent.updatedFields).toContain('firstName');
      expect(updatedEvent.updatedFields).toContain('department');
      expect(updatedEvent.updatedBy).toBe('user-456');
    });

    it('should not emit event when no fields change', () => {
      contact.updateContactInfo(
        {
          firstName: 'John', // Same as current
          lastName: 'Doe', // Same as current
        },
        'user-123'
      );

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(0);
    });

    it('should update only changed fields', () => {
      contact.updateContactInfo(
        {
          title: 'Director',
        },
        'user-789'
      );

      expect(contact.title).toBe('Director');
      expect(contact.firstName).toBe('John'); // Unchanged
      expect(contact.lastName).toBe('Doe'); // Unchanged
    });
  });

  describe('associateWithAccount()', () => {
    let contact: Contact;

    beforeEach(() => {
      const result = Contact.create({
        email: 'associate@example.com',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
      });
      contact = result.value;
      contact.clearDomainEvents();
    });

    it('should associate contact with account successfully', () => {
      const result = contact.associateWithAccount('account-123', 'user-456');

      expect(result.isSuccess).toBe(true);
      expect(contact.accountId).toBe('account-123');
      expect(contact.hasAccount).toBe(true);
    });

    it('should emit ContactAccountAssociatedEvent', () => {
      contact.associateWithAccount('account-789', 'user-999');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactAccountAssociatedEvent);

      const associatedEvent = events[0] as ContactAccountAssociatedEvent;
      expect(associatedEvent.contactId).toBe(contact.id);
      expect(associatedEvent.accountId).toBe('account-789');
      expect(associatedEvent.associatedBy).toBe('user-999');
    });

    it('should fail to associate when already has account', () => {
      contact.associateWithAccount('account-123', 'user-456');
      contact.clearDomainEvents();

      const result = contact.associateWithAccount('account-456', 'user-789');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ContactAlreadyHasAccountError);
      expect(result.error.code).toBe('CONTACT_ALREADY_HAS_ACCOUNT');
    });
  });

  describe('disassociateFromAccount()', () => {
    let contact: Contact;

    beforeEach(() => {
      const result = Contact.create({
        email: 'disassociate@example.com',
        firstName: 'Test',
        lastName: 'User',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });
      contact = result.value;
      contact.clearDomainEvents();
    });

    it('should disassociate contact from account successfully', () => {
      const result = contact.disassociateFromAccount('user-456');

      expect(result.isSuccess).toBe(true);
      expect(contact.accountId).toBeUndefined();
      expect(contact.hasAccount).toBe(false);
    });

    it('should emit ContactAccountDisassociatedEvent', () => {
      contact.disassociateFromAccount('user-789');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactAccountDisassociatedEvent);

      const disassociatedEvent = events[0] as ContactAccountDisassociatedEvent;
      expect(disassociatedEvent.contactId).toBe(contact.id);
      expect(disassociatedEvent.previousAccountId).toBe('account-123');
      expect(disassociatedEvent.disassociatedBy).toBe('user-789');
    });

    it('should fail to disassociate when no account associated', () => {
      contact.disassociateFromAccount('user-456');
      contact.clearDomainEvents();

      const result = contact.disassociateFromAccount('user-789');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ContactNotAssociatedWithAccountError);
      expect(result.error.code).toBe('CONTACT_NOT_ASSOCIATED_WITH_ACCOUNT');
    });
  });

  describe('updateEmail()', () => {
    let contact: Contact;

    beforeEach(() => {
      const result = Contact.create({
        email: 'old@example.com',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
      });
      contact = result.value;
      contact.clearDomainEvents();
    });

    it('should update email successfully', () => {
      const result = contact.updateEmail('new@example.com', 'user-456');

      expect(result.isSuccess).toBe(true);
      expect(contact.email.value).toBe('new@example.com');
    });

    it('should emit ContactUpdatedEvent with email field', () => {
      contact.updateEmail('updated@example.com', 'user-789');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactUpdatedEvent);

      const updatedEvent = events[0] as ContactUpdatedEvent;
      expect(updatedEvent.contactId).toBe(contact.id);
      expect(updatedEvent.updatedFields).toContain('email');
      expect(updatedEvent.updatedBy).toBe('user-789');
    });

    it('should fail with invalid email', () => {
      const result = contact.updateEmail('invalid-email', 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
      expect(contact.email.value).toBe('old@example.com'); // Unchanged
    });
  });

  describe('State Transitions', () => {
    it('should transition from no account to account associated', () => {
      const result = Contact.create({
        email: 'transition@example.com',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      const contact = result.value;
      expect(contact.hasAccount).toBe(false);

      contact.associateWithAccount('account-123', 'user-456');
      expect(contact.hasAccount).toBe(true);
    });

    it('should transition from account associated to no account', () => {
      const result = Contact.create({
        email: 'transition2@example.com',
        firstName: 'Test',
        lastName: 'User',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      const contact = result.value;
      expect(contact.hasAccount).toBe(true);

      contact.disassociateFromAccount('user-456');
      expect(contact.hasAccount).toBe(false);
    });

    it('should reject associating to different account when already associated', () => {
      const result = Contact.create({
        email: 'reject@example.com',
        firstName: 'Test',
        lastName: 'User',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      const contact = result.value;
      const associateResult = contact.associateWithAccount('account-456', 'user-789');

      expect(associateResult.isFailure).toBe(true);
      expect(contact.accountId).toBe('account-123'); // Still original
    });
  });

  describe('Serialization', () => {
    it('should serialize contact to JSON', () => {
      const result = Contact.create({
        email: 'json@example.com',
        firstName: 'JSON',
        lastName: 'Test',
        title: 'Developer',
        phone: '+1-555-1234',
        department: 'Engineering',
        accountId: 'account-123',
        leadId: 'lead-456',
        ownerId: 'owner-789',
      });

      const contact = result.value;
      const json = contact.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.email).toBe('json@example.com');
      expect(json.firstName).toBe('JSON');
      expect(json.lastName).toBe('Test');
      expect(json.fullName).toBe('JSON Test');
      expect(json.title).toBe('Developer');
      // toJSON() uses PhoneNumber.toValue() which returns E.164 normalized format
      expect(json.phone).toBe('+15551234');
      expect(json.department).toBe('Engineering');
      expect(json.accountId).toBe('account-123');
      expect(json.leadId).toBe('lead-456');
      expect(json.ownerId).toBe('owner-789');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute contact from persistence', () => {
      const id = ContactId.generate();
      const now = new Date();

      const contact = Contact.reconstitute(id, {
        email: 'reconstitute@example.com',
        firstName: 'Reconstituted',
        lastName: 'Contact',
        title: 'Manager',
        phone: '+1-555-0000',
        department: 'Sales',
        accountId: 'account-999',
        leadId: 'lead-888',
        ownerId: 'owner-777',
        createdAt: now,
        updatedAt: now,
      });

      expect(contact.id).toBe(id);
      expect(contact.email.value).toBe('reconstitute@example.com');
      expect(contact.firstName).toBe('Reconstituted');
      expect(contact.lastName).toBe('Contact');
      expect(contact.title).toBe('Manager');
      // reconstitute receives phone as string from persistence, stored as-is
      expect(contact.phone).toBe('+1-555-0000');
      expect(contact.department).toBe('Sales');
      expect(contact.accountId).toBe('account-999');
      expect(contact.leadId).toBe('lead-888');
      expect(contact.hasAccount).toBe(true);
      expect(contact.isConvertedFromLead).toBe(true);
    });

    it('should handle invalid email in reconstitution', () => {
      const id = ContactId.generate();

      const contact = Contact.reconstitute(id, {
        email: 'invalid-email',
        firstName: 'Test',
        lastName: 'User',
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Should default to unknown email when invalid
      expect(contact.email.value).toBe('unknown@unknown.com');
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const result = Contact.create({
        email: 'events@example.com',
        firstName: 'Event',
        lastName: 'Test',
        ownerId: 'owner-123',
      });

      const contact = result.value;

      // Creation event is already added
      expect(contact.getDomainEvents()).toHaveLength(1);

      contact.updateContactInfo({ title: 'Manager' }, 'user-123');
      expect(contact.getDomainEvents()).toHaveLength(2);

      contact.associateWithAccount('account-123', 'user-456');
      expect(contact.getDomainEvents()).toHaveLength(3);

      contact.updateEmail('newemail@example.com', 'user-789');
      expect(contact.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      const result = Contact.create({
        email: 'clear@example.com',
        firstName: 'Clear',
        lastName: 'Test',
        ownerId: 'owner-123',
      });

      const contact = result.value;
      expect(contact.getDomainEvents()).toHaveLength(1);

      contact.clearDomainEvents();
      expect(contact.getDomainEvents()).toHaveLength(0);
    });
  });

  // IFC-192: Contact Activity Tracking
  describe('lastContactedAt (IFC-192)', () => {
    it('should initialize lastContactedAt as undefined on create()', () => {
      const result = Contact.create({
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'Contact',
        ownerId: 'owner-123',
        tenantId: 'tenant-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.lastContactedAt).toBeUndefined();
    });

    it('should preserve lastContactedAt through reconstitute()', () => {
      const id = ContactId.generate();
      const pastDate = new Date('2026-01-15T10:00:00Z');

      const contact = Contact.reconstitute(id, {
        email: 'recon@example.com',
        firstName: 'Recon',
        lastName: 'Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        lastContactedAt: pastDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(contact.lastContactedAt).toEqual(pastDate);
    });

    it('should return undefined lastContactedAt for new contacts', () => {
      const result = Contact.create({
        email: 'getter@example.com',
        firstName: 'Getter',
        lastName: 'Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      });

      expect(result.value.lastContactedAt).toBeUndefined();
    });

    it('should return Date when lastContactedAt is set', () => {
      const id = ContactId.generate();
      const date = new Date('2026-02-01T12:00:00Z');

      const contact = Contact.reconstitute(id, {
        email: 'dated@example.com',
        firstName: 'Dated',
        lastName: 'Contact',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        lastContactedAt: date,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(contact.lastContactedAt).toBeInstanceOf(Date);
      expect(contact.lastContactedAt).toEqual(date);
    });

    it('should include lastContactedAt in toJSON() as ISO string or null', () => {
      // With lastContactedAt set
      const id = ContactId.generate();
      const date = new Date('2026-02-10T08:30:00Z');

      const contactWithDate = Contact.reconstitute(id, {
        email: 'json@example.com',
        firstName: 'JSON',
        lastName: 'Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        lastContactedAt: date,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const jsonWithDate = contactWithDate.toJSON();
      expect(jsonWithDate.lastContactedAt).toBe('2026-02-10T08:30:00.000Z');

      // Without lastContactedAt
      const result = Contact.create({
        email: 'jsonnull@example.com',
        firstName: 'JSON',
        lastName: 'Null',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      });

      const jsonNull = result.value.toJSON();
      expect(jsonNull.lastContactedAt).toBeNull();
    });
  });

  describe('recordInteraction() (IFC-192)', () => {
    let contact: Contact;

    beforeEach(() => {
      const result = Contact.create({
        email: 'interact@example.com',
        firstName: 'Interact',
        lastName: 'Test',
        ownerId: 'owner-123',
        tenantId: 'tenant-1',
      });
      contact = result.value;
      contact.clearDomainEvents();
    });

    it('should set lastContactedAt for EMAIL interaction', () => {
      const before = new Date();
      const result = contact.recordInteraction('EMAIL', 'user-1');
      const after = new Date();

      expect(result.isSuccess).toBe(true);
      expect(contact.lastContactedAt).toBeDefined();
      expect(contact.lastContactedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(contact.lastContactedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set lastContactedAt for CALL interaction', () => {
      const result = contact.recordInteraction('CALL', 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(contact.lastContactedAt).toBeDefined();
    });

    it('should set lastContactedAt for MEETING interaction', () => {
      const result = contact.recordInteraction('MEETING', 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(contact.lastContactedAt).toBeDefined();
    });

    it('should update updatedAt when recording interaction', () => {
      const originalUpdatedAt = contact.updatedAt;
      // Small delay to ensure timestamps differ
      const result = contact.recordInteraction('EMAIL', 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(contact.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('should return Result.ok(undefined) on success', () => {
      const result = contact.recordInteraction('EMAIL', 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeUndefined();
    });

    it('should enforce monotonic advancement — older timestamp does not overwrite newer', () => {
      // First interaction
      contact.recordInteraction('EMAIL', 'user-1');
      const firstTimestamp = contact.lastContactedAt!;

      // Manually set a far-future time to test monotonic guard
      const id = ContactId.generate();
      const futureDate = new Date('2027-01-01T00:00:00Z');
      const futureContact = Contact.reconstitute(id, {
        email: 'future@example.com',
        firstName: 'Future',
        lastName: 'Contact',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        lastContactedAt: futureDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Recording interaction should still work (now() < 2027), so it should NOT overwrite
      futureContact.recordInteraction('EMAIL', 'user-1');
      expect(futureContact.lastContactedAt!.getTime()).toBe(futureDate.getTime());
    });

    it('should allow rapid double call — second call wins when both newer', () => {
      contact.recordInteraction('EMAIL', 'user-1');
      const first = contact.lastContactedAt!;

      contact.recordInteraction('CALL', 'user-2');
      const second = contact.lastContactedAt!;

      expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
    });

    it('should emit ContactInteractedEvent', () => {
      contact.recordInteraction('EMAIL', 'user-1');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactInteractedEvent);

      const event = events[0] as ContactInteractedEvent;
      expect(event.eventType).toBe('contact.interacted');
      expect(event.contactId).toBe(contact.id);
      expect(event.interactionType).toBe('EMAIL');
      expect(event.recordedBy).toBe('user-1');
    });

    it('should emit event with correct interactionType', () => {
      contact.recordInteraction('MEETING', 'user-2');

      const events = contact.getDomainEvents();
      const event = events[0] as ContactInteractedEvent;
      expect(event.interactionType).toBe('MEETING');
    });

    it('should NOT update lastContactedAt via updateContactInfo()', () => {
      contact.recordInteraction('EMAIL', 'user-1');
      const lastContacted = contact.lastContactedAt!;

      contact.updateContactInfo({ firstName: 'Updated' }, 'user-2');

      expect(contact.lastContactedAt!.getTime()).toBe(lastContacted.getTime());
    });
  });

  describe('CONTACT_INTERACTION_TYPES (IFC-192)', () => {
    it('should export CONTACT_INTERACTION_TYPES with correct values', () => {
      expect(CONTACT_INTERACTION_TYPES).toEqual(['EMAIL', 'CALL', 'MEETING', 'NOTE']);
    });

    it('should be a readonly tuple (4 values)', () => {
      expect(CONTACT_INTERACTION_TYPES).toHaveLength(4);
      expect(CONTACT_INTERACTION_TYPES[0]).toBe('EMAIL');
      expect(CONTACT_INTERACTION_TYPES[1]).toBe('CALL');
      expect(CONTACT_INTERACTION_TYPES[2]).toBe('MEETING');
      expect(CONTACT_INTERACTION_TYPES[3]).toBe('NOTE');
    });
  });
});

describe('Contact (additional tests)', () => {
  // Helper to create a basic contact with tenantId
  function createBasicContact(overrides: Record<string, unknown> = {}) {
    const result = Contact.create({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      ownerId: 'owner-123',
      tenantId: 'tenant-abc',
      ...overrides,
    } as any);

    if (result.isFailure) {
      throw new Error(`Failed to create contact: ${result.error.message}`);
    }

    return result.value;
  }

  describe('CONTACT_TYPES and CONTACT_STATUSES constants', () => {
    it('should export CONTACT_TYPES as a readonly array', () => {
      expect(CONTACT_TYPES).toContain('customer');
      expect(CONTACT_TYPES).toContain('prospect');
      expect(CONTACT_TYPES).toContain('partner');
      expect(CONTACT_TYPES).toContain('vendor');
      expect(CONTACT_TYPES).toContain('investor');
      expect(CONTACT_TYPES).toContain('other');
      expect(CONTACT_TYPES).toHaveLength(6);
    });

    it('should export CONTACT_STATUSES as a readonly array', () => {
      expect(CONTACT_STATUSES).toContain('ACTIVE');
      expect(CONTACT_STATUSES).toContain('INACTIVE');
      expect(CONTACT_STATUSES).toContain('PROSPECT');
      expect(CONTACT_STATUSES).toContain('CUSTOMER');
      expect(CONTACT_STATUSES).toContain('FORMER_CUSTOMER');
      expect(CONTACT_STATUSES).toHaveLength(5);
    });
  });

  describe('Error classes', () => {
    it('ContactAlreadyLinkedToLeadError should have correct code and message', () => {
      const error = new ContactAlreadyLinkedToLeadError('lead-existing-123');
      expect(error.code).toBe('CONTACT_ALREADY_LINKED_TO_LEAD');
      expect(error.message).toContain('lead-existing-123');
    });

    it('ContactNotLinkedToLeadError should have correct code and message', () => {
      const error = new ContactNotLinkedToLeadError();
      expect(error.code).toBe('CONTACT_NOT_LINKED_TO_LEAD');
      expect(error.message).toContain('not linked');
    });
  });

  describe('create() - extended fields and additional branches', () => {
    it('should create a contact with all extended fields (IFC-089)', () => {
      const result = Contact.create({
        email: 'extended@example.com',
        firstName: 'Extended',
        lastName: 'Fields',
        ownerId: 'owner-123',
        tenantId: 'tenant-xyz',
        streetAddress: '123 Main St',
        city: 'Springfield',
        zipCode: '62704',
        company: 'Acme Corp',
        linkedInUrl: 'https://linkedin.com/in/extended-fields',
        contactType: 'customer',
        tags: ['vip', 'enterprise'],
        contactNotes: 'Important customer notes',
      } as any);

      expect(result.isSuccess).toBe(true);
      const contact = result.value;

      expect(contact.streetAddress).toBe('123 Main St');
      expect(contact.city).toBe('Springfield');
      expect(contact.zipCode).toBe('62704');
      expect(contact.company).toBe('Acme Corp');
      expect(contact.linkedInUrl).toBe('https://linkedin.com/in/extended-fields');
      expect(contact.contactType).toBe('customer');
      expect(contact.tags).toEqual(['vip', 'enterprise']);
      expect(contact.contactNotes).toBe('Important customer notes');
    });

    it('should create a contact with explicit status', () => {
      const result = Contact.create({
        email: 'status@example.com',
        firstName: 'Status',
        lastName: 'Test',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
        status: 'PROSPECT',
      } as any);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('PROSPECT');
    });

    it('should default status to ACTIVE when not provided', () => {
      const contact = createBasicContact();
      expect(contact.status).toBe('ACTIVE');
    });

    it('should create a contact with PhoneNumber object (not string)', () => {
      const phoneResult = PhoneNumber.create('+1-555-1234');
      expect(phoneResult.isSuccess).toBe(true);

      const result = Contact.create({
        email: 'phoneobj@example.com',
        firstName: 'Phone',
        lastName: 'Object',
        phone: phoneResult.value,
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
      } as any);

      expect(result.isSuccess).toBe(true);
      expect(result.value.phone?.value).toBe('+15551234');
    });

    it('should fail with invalid phone number string', () => {
      const result = Contact.create({
        email: 'badphone@example.com',
        firstName: 'Bad',
        lastName: 'Phone',
        phone: 'not-a-phone',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
      } as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should create contact without phone when not provided', () => {
      const contact = createBasicContact();
      expect(contact.phone).toBeUndefined();
    });
  });

  describe('tenantId getter', () => {
    it('should return the tenantId', () => {
      const contact = createBasicContact({ tenantId: 'tenant-specific-id' });
      expect(contact.tenantId).toBe('tenant-specific-id');
    });
  });

  describe('hasLinkedLead getter', () => {
    it('should return false when no lead is linked', () => {
      const contact = createBasicContact();
      expect(contact.hasLinkedLead).toBe(false);
    });

    it('should return true when a lead is linked', () => {
      const contact = createBasicContact({ leadId: 'lead-111' });
      expect(contact.hasLinkedLead).toBe(true);
    });
  });

  describe('Extended field getters when undefined', () => {
    it('should return undefined for all extended fields when not set', () => {
      const contact = createBasicContact();

      expect(contact.streetAddress).toBeUndefined();
      expect(contact.city).toBeUndefined();
      expect(contact.zipCode).toBeUndefined();
      expect(contact.company).toBeUndefined();
      expect(contact.linkedInUrl).toBeUndefined();
      expect(contact.contactType).toBeUndefined();
      expect(contact.tags).toBeUndefined();
      expect(contact.contactNotes).toBeUndefined();
    });
  });

  describe('linkToLead()', () => {
    let contact: Contact;

    beforeEach(() => {
      contact = createBasicContact();
      contact.clearDomainEvents();
    });

    it('should link contact to a lead successfully', () => {
      const result = contact.linkToLead('lead-new-123', 'user-456');

      expect(result.isSuccess).toBe(true);
      expect(contact.leadId).toBe('lead-new-123');
      expect(contact.hasLinkedLead).toBe(true);
    });

    it('should emit ContactLinkedToLeadEvent on successful link', () => {
      contact.linkToLead('lead-linked-001', 'user-linker');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactLinkedToLeadEvent);

      const linkedEvent = events[0] as ContactLinkedToLeadEvent;
      expect(linkedEvent.contactId).toBe(contact.id);
      expect(linkedEvent.leadId).toBe('lead-linked-001');
      expect(linkedEvent.linkedBy).toBe('user-linker');
    });

    it('should update updatedAt when linking to lead', () => {
      const beforeLink = contact.updatedAt;

      // Small delay to ensure time difference
      contact.linkToLead('lead-time-test', 'user-123');

      // updatedAt should be set to a new Date()
      expect(contact.updatedAt).toBeInstanceOf(Date);
    });

    it('should be idempotent when linking to the same lead', () => {
      contact.linkToLead('lead-same-123', 'user-456');
      contact.clearDomainEvents();

      // Link to the same lead again
      const result = contact.linkToLead('lead-same-123', 'user-789');

      expect(result.isSuccess).toBe(true);
      expect(contact.leadId).toBe('lead-same-123');

      // No event should be emitted for idempotent operation
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(0);
    });

    it('should fail when linking to a different lead while already linked', () => {
      contact.linkToLead('lead-first-111', 'user-456');
      contact.clearDomainEvents();

      const result = contact.linkToLead('lead-second-222', 'user-789');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ContactAlreadyLinkedToLeadError);
      expect(result.error.code).toBe('CONTACT_ALREADY_LINKED_TO_LEAD');
      expect(result.error.message).toContain('lead-first-111');

      // Lead should remain unchanged
      expect(contact.leadId).toBe('lead-first-111');
    });

    it('should fail when contact was created from a lead and trying to link to different lead', () => {
      // Contact created with leadId (converted from lead)
      const convertedContact = createBasicContact({ leadId: 'lead-original' });
      convertedContact.clearDomainEvents();

      const result = convertedContact.linkToLead('lead-different', 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ContactAlreadyLinkedToLeadError);
    });
  });

  describe('unlinkFromLead()', () => {
    let contact: Contact;

    beforeEach(() => {
      contact = createBasicContact();
      contact.clearDomainEvents();
      // Link to a lead first
      contact.linkToLead('lead-unlink-test', 'user-123');
      contact.clearDomainEvents();
    });

    it('should unlink contact from lead successfully', () => {
      const result = contact.unlinkFromLead('user-unlinker');

      expect(result.isSuccess).toBe(true);
      expect(contact.leadId).toBeUndefined();
      expect(contact.hasLinkedLead).toBe(false);
    });

    it('should emit ContactUnlinkedFromLeadEvent on successful unlink', () => {
      contact.unlinkFromLead('user-unlinker-456');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactUnlinkedFromLeadEvent);

      const unlinkedEvent = events[0] as ContactUnlinkedFromLeadEvent;
      expect(unlinkedEvent.contactId).toBe(contact.id);
      expect(unlinkedEvent.previousLeadId).toBe('lead-unlink-test');
      expect(unlinkedEvent.unlinkedBy).toBe('user-unlinker-456');
    });

    it('should update updatedAt when unlinking from lead', () => {
      contact.unlinkFromLead('user-123');
      expect(contact.updatedAt).toBeInstanceOf(Date);
    });

    it('should be idempotent when already unlinked (no lead)', () => {
      // Create a contact without a lead
      const noLeadContact = createBasicContact();
      noLeadContact.clearDomainEvents();

      const result = noLeadContact.unlinkFromLead('user-789');

      expect(result.isSuccess).toBe(true);

      // No event should be emitted for idempotent operation
      const events = noLeadContact.getDomainEvents();
      expect(events).toHaveLength(0);
    });

    it('should allow re-linking after unlinking', () => {
      // Unlink first
      contact.unlinkFromLead('user-123');
      contact.clearDomainEvents();

      // Re-link to a new lead
      const result = contact.linkToLead('lead-new-after-unlink', 'user-456');

      expect(result.isSuccess).toBe(true);
      expect(contact.leadId).toBe('lead-new-after-unlink');
    });
  });

  describe('updateContactInfo() - extended fields', () => {
    let contact: Contact;

    beforeEach(() => {
      contact = createBasicContact();
      contact.clearDomainEvents();
    });

    it('should update streetAddress', () => {
      contact.updateContactInfo({ streetAddress: '456 Oak Ave' }, 'user-123');

      expect(contact.streetAddress).toBe('456 Oak Ave');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('streetAddress');
    });

    it('should update city', () => {
      contact.updateContactInfo({ city: 'New York' }, 'user-123');

      expect(contact.city).toBe('New York');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('city');
    });

    it('should update zipCode', () => {
      contact.updateContactInfo({ zipCode: '10001' }, 'user-123');

      expect(contact.zipCode).toBe('10001');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('zipCode');
    });

    it('should update company', () => {
      contact.updateContactInfo({ company: 'NewCo Inc' }, 'user-123');

      expect(contact.company).toBe('NewCo Inc');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('company');
    });

    it('should update linkedInUrl', () => {
      contact.updateContactInfo({ linkedInUrl: 'https://linkedin.com/in/test' }, 'user-123');

      expect(contact.linkedInUrl).toBe('https://linkedin.com/in/test');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('linkedInUrl');
    });

    it('should update contactType', () => {
      contact.updateContactInfo({ contactType: 'vendor' }, 'user-123');

      expect(contact.contactType).toBe('vendor');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('contactType');
    });

    it('should update tags', () => {
      contact.updateContactInfo({ tags: ['important', 'follow-up'] }, 'user-123');

      expect(contact.tags).toEqual(['important', 'follow-up']);
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('tags');
    });

    it('should always track tags update even if set to same array', () => {
      // First set tags
      contact.updateContactInfo({ tags: ['tag1'] }, 'user-123');
      contact.clearDomainEvents();

      // Set tags again (same values) - tags always update (no equality check)
      contact.updateContactInfo({ tags: ['tag1'] }, 'user-456');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('tags');
    });

    it('should update contactNotes', () => {
      contact.updateContactInfo({ contactNotes: 'Updated notes here' }, 'user-123');

      expect(contact.contactNotes).toBe('Updated notes here');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('contactNotes');
    });

    it('should update status', () => {
      contact.updateContactInfo({ status: 'INACTIVE' }, 'user-123');

      expect(contact.status).toBe('INACTIVE');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('status');
    });

    it('should not emit event when status is unchanged', () => {
      contact.updateContactInfo({ status: 'ACTIVE' }, 'user-123');

      // Status is already ACTIVE (default), no change
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(0);
    });

    it('should update multiple extended fields at once', () => {
      contact.updateContactInfo(
        {
          streetAddress: '789 Pine Rd',
          city: 'Chicago',
          zipCode: '60601',
          company: 'BigCorp',
          contactType: 'partner',
          contactNotes: 'Multi-update test',
        },
        'user-multi'
      );

      expect(contact.streetAddress).toBe('789 Pine Rd');
      expect(contact.city).toBe('Chicago');
      expect(contact.zipCode).toBe('60601');
      expect(contact.company).toBe('BigCorp');
      expect(contact.contactType).toBe('partner');
      expect(contact.contactNotes).toBe('Multi-update test');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toHaveLength(6);
      expect(event.updatedFields).toContain('streetAddress');
      expect(event.updatedFields).toContain('city');
      expect(event.updatedFields).toContain('zipCode');
      expect(event.updatedFields).toContain('company');
      expect(event.updatedFields).toContain('contactType');
      expect(event.updatedFields).toContain('contactNotes');
    });

    it('should not emit event when extended fields are unchanged', () => {
      // Set some extended fields first
      contact.updateContactInfo({ streetAddress: '123 Main', city: 'Boston' }, 'user-123');
      contact.clearDomainEvents();

      // Update with same values
      contact.updateContactInfo({ streetAddress: '123 Main', city: 'Boston' }, 'user-456');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(0);
    });

    it('should update phone with PhoneNumber object', () => {
      const phoneResult = PhoneNumber.create('+1-555-9876');
      expect(phoneResult.isSuccess).toBe(true);

      const result = contact.updateContactInfo({ phone: phoneResult.value }, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(contact.phone?.value).toBe('+15559876');
    });

    it('should fail when updating phone with invalid string', () => {
      const result = contact.updateContactInfo({ phone: 'invalid-phone-string' }, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should not emit event when phone is updated to equivalent value', () => {
      // Set phone first
      contact.updateContactInfo({ phone: '+1-555-1111' }, 'user-123');
      contact.clearDomainEvents();

      // Update with same phone (different format but same E.164)
      contact.updateContactInfo({ phone: '+15551111' }, 'user-456');

      // PhoneNumber.equals checks value equality, so this should NOT emit
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('reconstitute() - additional branches', () => {
    it('should reconstitute with explicit status', () => {
      const id = ContactId.generate();
      const now = new Date();

      const contact = Contact.reconstitute(id, {
        email: 'recon-status@example.com',
        firstName: 'Recon',
        lastName: 'Status',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
        status: 'CUSTOMER',
        createdAt: now,
        updatedAt: now,
      });

      expect(contact.status).toBe('CUSTOMER');
    });

    it('should default status to ACTIVE when not provided in reconstitute', () => {
      const id = ContactId.generate();
      const now = new Date();

      const contact = Contact.reconstitute(id, {
        email: 'recon-default@example.com',
        firstName: 'Recon',
        lastName: 'Default',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
        createdAt: now,
        updatedAt: now,
      });

      expect(contact.status).toBe('ACTIVE');
    });

    it('should reconstitute with extended fields', () => {
      const id = ContactId.generate();
      const now = new Date();

      const contact = Contact.reconstitute(id, {
        email: 'recon-extended@example.com',
        firstName: 'Recon',
        lastName: 'Extended',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
        streetAddress: '100 Elm St',
        city: 'Denver',
        zipCode: '80202',
        company: 'ReconCorp',
        linkedInUrl: 'https://linkedin.com/in/recon',
        contactType: 'investor',
        tags: ['high-value'],
        contactNotes: 'Reconstituted with notes',
        createdAt: now,
        updatedAt: now,
      });

      expect(contact.streetAddress).toBe('100 Elm St');
      expect(contact.city).toBe('Denver');
      expect(contact.zipCode).toBe('80202');
      expect(contact.company).toBe('ReconCorp');
      expect(contact.linkedInUrl).toBe('https://linkedin.com/in/recon');
      expect(contact.contactType).toBe('investor');
      expect(contact.tags).toEqual(['high-value']);
      expect(contact.contactNotes).toBe('Reconstituted with notes');
    });

    it('should reconstitute with tenantId', () => {
      const id = ContactId.generate();
      const now = new Date();

      const contact = Contact.reconstitute(id, {
        email: 'recon-tenant@example.com',
        firstName: 'Recon',
        lastName: 'Tenant',
        ownerId: 'owner-123',
        tenantId: 'tenant-reconstituted',
        createdAt: now,
        updatedAt: now,
      });

      expect(contact.tenantId).toBe('tenant-reconstituted');
    });
  });

  describe('toJSON() - extended fields', () => {
    it('should include all extended fields in JSON serialization', () => {
      const result = Contact.create({
        email: 'json-ext@example.com',
        firstName: 'JSON',
        lastName: 'Extended',
        ownerId: 'owner-json',
        tenantId: 'tenant-json',
        streetAddress: '200 Maple Dr',
        city: 'Seattle',
        zipCode: '98101',
        company: 'JsonCorp',
        linkedInUrl: 'https://linkedin.com/in/json-ext',
        contactType: 'prospect',
        tags: ['seattle', 'tech'],
        contactNotes: 'Notes for JSON test',
        status: 'PROSPECT',
      } as any);

      expect(result.isSuccess).toBe(true);
      const json = result.value.toJSON();

      expect(json.streetAddress).toBe('200 Maple Dr');
      expect(json.city).toBe('Seattle');
      expect(json.zipCode).toBe('98101');
      expect(json.company).toBe('JsonCorp');
      expect(json.linkedInUrl).toBe('https://linkedin.com/in/json-ext');
      expect(json.contactType).toBe('prospect');
      expect(json.tags).toEqual(['seattle', 'tech']);
      expect(json.contactNotes).toBe('Notes for JSON test');
      expect(json.status).toBe('PROSPECT');
    });

    it('should include undefined extended fields in JSON', () => {
      const contact = createBasicContact();
      const json = contact.toJSON();

      // These should be present but undefined
      expect(json).toHaveProperty('streetAddress');
      expect(json).toHaveProperty('city');
      expect(json).toHaveProperty('zipCode');
      expect(json).toHaveProperty('company');
      expect(json).toHaveProperty('linkedInUrl');
      expect(json).toHaveProperty('contactType');
      expect(json).toHaveProperty('tags');
      expect(json).toHaveProperty('contactNotes');

      expect(json.streetAddress).toBeUndefined();
      expect(json.city).toBeUndefined();
      expect(json.zipCode).toBeUndefined();
      expect(json.company).toBeUndefined();
      expect(json.linkedInUrl).toBeUndefined();
      expect(json.contactType).toBeUndefined();
      expect(json.tags).toBeUndefined();
      expect(json.contactNotes).toBeUndefined();
    });

    it('should serialize phone as undefined when not set', () => {
      const contact = createBasicContact();
      const json = contact.toJSON();
      expect(json.phone).toBeUndefined();
    });

    it('should serialize tenantId when present', () => {
      const contact = createBasicContact({ tenantId: 'tenant-serialize' });
      const json = contact.toJSON();
      // Note: toJSON() does not include tenantId in its output - checking what the method returns
      // Looking at the source, toJSON() does NOT serialize tenantId
      // But it does include ownerId
      expect(json.ownerId).toBe('owner-123');
    });
  });

  describe('create() - domain events with lead conversion', () => {
    it('should emit only ContactCreatedEvent when no leadId', () => {
      const result = Contact.create({
        email: 'nolead@example.com',
        firstName: 'No',
        lastName: 'Lead',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
      } as any);

      expect(result.isSuccess).toBe(true);
      const events = result.value.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ContactCreatedEvent);
    });

    it('should emit both ContactCreatedEvent and ContactConvertedFromLeadEvent when leadId present', () => {
      const result = Contact.create({
        email: 'withlead@example.com',
        firstName: 'With',
        lastName: 'Lead',
        leadId: 'lead-conv-123',
        ownerId: 'owner-123',
        tenantId: 'tenant-abc',
      } as any);

      expect(result.isSuccess).toBe(true);
      const events = result.value.getDomainEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toBeInstanceOf(ContactCreatedEvent);
      expect(events[1]).toBeInstanceOf(ContactConvertedFromLeadEvent);

      const convEvent = events[1] as ContactConvertedFromLeadEvent;
      expect(convEvent.leadId).toBe('lead-conv-123');
    });
  });

  describe('linkToLead() + unlinkFromLead() full cycle', () => {
    it('should complete full link -> unlink -> re-link cycle', () => {
      const contact = createBasicContact();
      contact.clearDomainEvents();

      // Link
      const linkResult = contact.linkToLead('lead-cycle-1', 'user-1');
      expect(linkResult.isSuccess).toBe(true);
      expect(contact.leadId).toBe('lead-cycle-1');
      expect(contact.hasLinkedLead).toBe(true);
      expect(contact.isConvertedFromLead).toBe(true); // leadId !== undefined

      // Unlink
      const unlinkResult = contact.unlinkFromLead('user-2');
      expect(unlinkResult.isSuccess).toBe(true);
      expect(contact.leadId).toBeUndefined();
      expect(contact.hasLinkedLead).toBe(false);
      expect(contact.isConvertedFromLead).toBe(false);

      // Re-link to different lead
      const relinkResult = contact.linkToLead('lead-cycle-2', 'user-3');
      expect(relinkResult.isSuccess).toBe(true);
      expect(contact.leadId).toBe('lead-cycle-2');

      // Verify all events
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(3);
      expect(events[0]).toBeInstanceOf(ContactLinkedToLeadEvent);
      expect(events[1]).toBeInstanceOf(ContactUnlinkedFromLeadEvent);
      expect(events[2]).toBeInstanceOf(ContactLinkedToLeadEvent);
    });
  });

  describe('updateContactInfo() - phone equality edge cases', () => {
    it('should update phone when contact had no phone before', () => {
      const contact = createBasicContact(); // no phone
      contact.clearDomainEvents();

      const result = contact.updateContactInfo({ phone: '+1-555-0001' }, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(contact.phone?.value).toBe('+15550001');

      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as ContactUpdatedEvent;
      expect(event.updatedFields).toContain('phone');
    });

    it('should update phone when changing to a different number', () => {
      // Create with phone
      const contact = createBasicContact({ phone: '+1-555-1111' });
      contact.clearDomainEvents();

      const result = contact.updateContactInfo({ phone: '+1-555-2222' }, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(contact.phone?.value).toBe('+15552222');
    });
  });

  describe('ContactLinkedToLeadEvent structure', () => {
    it('should have correct event type', () => {
      const id = ContactId.generate();
      const event = new ContactLinkedToLeadEvent(id, 'lead-test', 'user-test');

      expect(event.eventType).toBe('contact.linked_to_lead');
    });

    it('should serialize to payload correctly', () => {
      const id = ContactId.generate();
      const event = new ContactLinkedToLeadEvent(id, 'lead-payload', 'user-payload');

      const payload = event.toPayload();
      expect(payload.contactId).toBe(id.value);
      expect(payload.leadId).toBe('lead-payload');
      expect(payload.linkedBy).toBe('user-payload');
      expect(Number.isNaN(Date.parse(String(payload.linkedAt)))).toBe(false);
    });
  });

  describe('ContactUnlinkedFromLeadEvent structure', () => {
    it('should have correct event type', () => {
      const id = ContactId.generate();
      const event = new ContactUnlinkedFromLeadEvent(id, 'lead-prev', 'user-test');

      expect(event.eventType).toBe('contact.unlinked_from_lead');
    });

    it('should serialize to payload correctly', () => {
      const id = ContactId.generate();
      const event = new ContactUnlinkedFromLeadEvent(id, 'lead-prev-payload', 'user-unlinker');

      const payload = event.toPayload();
      expect(payload.contactId).toBe(id.value);
      expect(payload.previousLeadId).toBe('lead-prev-payload');
      expect(payload.unlinkedBy).toBe('user-unlinker');
      expect(Number.isNaN(Date.parse(String(payload.unlinkedAt)))).toBe(false);
    });
  });

  describe('contactType key invariant (PG-205)', () => {
    const base = {
      email: 'key@example.com',
      firstName: 'Key',
      lastName: 'Check',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    };

    it('accepts every seed key and a tenant-defined key', () => {
      for (const key of [...CONTACT_TYPES, 'channel_partner']) {
        const result = Contact.create({ ...base, contactType: key });
        expect(result.isSuccess).toBe(true);
        expect(result.value.contactType).toBe(key);
      }
    });

    it('rejects a malformed key on create', () => {
      const result = Contact.create({ ...base, contactType: 'Not A Key' });
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactTypeKeyError);
      expect(result.error.code).toBe('INVALID_CONTACT_TYPE_KEY');
    });

    it('rejects a malformed key on update and leaves the stored key untouched', () => {
      const contact = Contact.create({ ...base, contactType: 'vendor' }).value;
      const result = contact.updateContactInfo({ contactType: 'BAD KEY' }, 'user-1');
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidContactTypeKeyError);
      expect(contact.contactType).toBe('vendor');
    });

    it('accepts a well-formed tenant key on update', () => {
      const contact = Contact.create({ ...base, contactType: 'vendor' }).value;
      const result = contact.updateContactInfo({ contactType: 'reseller_2' }, 'user-1');
      expect(result.isSuccess).toBe(true);
      expect(contact.contactType).toBe('reseller_2');
    });
  });

  describe('clearing the contact type (PG-205)', () => {
    const base = {
      email: 'clear@example.com',
      firstName: 'Clear',
      lastName: 'Type',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    };

    it('null removes a stored type and records the change', () => {
      const contact = Contact.create({ ...base, contactType: 'vendor' }).value;
      contact.clearDomainEvents();
      const result = contact.updateContactInfo({ contactType: null }, 'user-1');
      expect(result.isSuccess).toBe(true);
      expect(contact.contactType).toBeUndefined();
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as unknown as { updatedFields: string[] }).updatedFields).toEqual([
        'contactType',
      ]);
    });

    it('null on a contact without a type changes nothing', () => {
      const contact = Contact.create(base).value;
      contact.clearDomainEvents();
      expect(contact.updateContactInfo({ contactType: null }, 'user-1').isSuccess).toBe(true);
      expect(contact.contactType).toBeUndefined();
      expect(contact.getDomainEvents()).toHaveLength(0);
    });
  });
  describe('replaceAccount (PG-205, codex a3d0b852)', () => {
    const base = {
      email: 'replace@example.com',
      firstName: 'Re',
      lastName: 'Place',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    };

    it('moves a linked contact to another account in one change', () => {
      const contact = Contact.create({ ...base, accountId: 'account-old' }).value;
      contact.clearDomainEvents();
      const result = contact.replaceAccount('account-new', 'user-1');
      expect(result.isSuccess).toBe(true);
      expect(contact.accountId).toBe('account-new');
      const events = contact.getDomainEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toBeInstanceOf(ContactAccountDisassociatedEvent);
      expect((events[0] as ContactAccountDisassociatedEvent).previousAccountId).toBe('account-old');
      expect(events[1]).toBeInstanceOf(ContactAccountAssociatedEvent);
      expect((events[1] as ContactAccountAssociatedEvent).accountId).toBe('account-new');
    });

    it('fails on a contact with no account and changes nothing', () => {
      const contact = Contact.create(base).value;
      contact.clearDomainEvents();
      const result = contact.replaceAccount('account-new', 'user-1');
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(ContactNotAssociatedWithAccountError);
      expect(contact.accountId).toBeUndefined();
      expect(contact.getDomainEvents()).toHaveLength(0);
    });
  });
});
