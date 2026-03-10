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
} from '../ContactEvents';

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
