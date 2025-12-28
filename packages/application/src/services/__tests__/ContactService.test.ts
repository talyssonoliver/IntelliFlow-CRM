/**
 * ContactService Tests
 *
 * Tests the ContactService application service which orchestrates
 * contact-related business logic including account association,
 * deduplication, and merging.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContactService } from '../ContactService';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Contact, Account, ContactId } from '@intelliflow/domain';

describe('ContactService', () => {
  let contactRepository: InMemoryContactRepository;
  let accountRepository: InMemoryAccountRepository;
  let eventBus: InMemoryEventBus;
  let service: ContactService;

  beforeEach(() => {
    contactRepository = new InMemoryContactRepository();
    accountRepository = new InMemoryAccountRepository();
    eventBus = new InMemoryEventBus();
    service = new ContactService(contactRepository, accountRepository, eventBus);
  });

  describe('createContact()', () => {
    it('should create a contact with valid input', async () => {
      const result = await service.createContact({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('john@example.com');
      expect(result.value.firstName).toBe('John');
      expect(result.value.lastName).toBe('Doe');
    });

    it('should fail with invalid email', async () => {
      const result = await service.createContact({
        email: 'invalid-email',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should fail for duplicate email', async () => {
      await service.createContact({
        email: 'duplicate@example.com',
        firstName: 'First',
        lastName: 'Contact',
        ownerId: 'owner-1',
      });

      const result = await service.createContact({
        email: 'duplicate@example.com',
        firstName: 'Second',
        lastName: 'Contact',
        ownerId: 'owner-2',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already exists');
    });

    it('should create contact with account association', async () => {
      const account = Account.create({
        name: 'Test Company',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.createContact({
        email: 'john@testcompany.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(account.id.value);
    });

    it('should fail if account not found', async () => {
      const fakeAccountId = '00000000-0000-0000-0000-000000000000';

      const result = await service.createContact({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: fakeAccountId,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should publish domain events after creation', async () => {
      eventBus.clearPublishedEvents();

      await service.createContact({
        email: 'events@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('updateContactInfo()', () => {
    it('should update contact information', async () => {
      const contact = Contact.create({
        email: 'update@example.com',
        firstName: 'Old',
        lastName: 'Name',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.updateContactInfo(
        contact.id.value,
        { firstName: 'New', lastName: 'Updated', title: 'CEO' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.firstName).toBe('New');
      expect(result.value.lastName).toBe('Updated');
      expect(result.value.title).toBe('CEO');
    });

    it('should fail if contact not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateContactInfo(fakeId, { firstName: 'New' }, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail with invalid contact ID', async () => {
      const result = await service.updateContactInfo(
        'invalid-uuid',
        { firstName: 'New' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateContactEmail()', () => {
    it('should update contact email', async () => {
      const contact = Contact.create({
        email: 'old@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.updateContactEmail(
        contact.id.value,
        'new@example.com',
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('new@example.com');
    });

    it('should fail if new email already exists', async () => {
      const contact1 = Contact.create({
        email: 'first@example.com',
        firstName: 'First',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      const contact2 = Contact.create({
        email: 'second@example.com',
        firstName: 'Second',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);

      const result = await service.updateContactEmail(
        contact2.id.value,
        'first@example.com',
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already in use');
    });

    it('should allow updating to same email', async () => {
      const contact = Contact.create({
        email: 'same@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.updateContactEmail(
        contact.id.value,
        'same@example.com',
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should fail with invalid email format', async () => {
      const contact = Contact.create({
        email: 'valid@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.updateContactEmail(contact.id.value, 'invalid-email', 'updater');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('associateWithAccount()', () => {
    it('should associate contact with account', async () => {
      const contact = Contact.create({
        email: 'associate@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      const account = Account.create({
        name: 'Test Company',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);
      await accountRepository.save(account);

      const result = await service.associateWithAccount(contact.id.value, account.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(account.id.value);
    });

    it('should fail if contact not found', async () => {
      const account = Account.create({
        name: 'Test Company',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const fakeContactId = '00000000-0000-0000-0000-000000000000';
      const result = await service.associateWithAccount(fakeContactId, account.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail if account not found', async () => {
      const contact = Contact.create({
        email: 'noassoc@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const fakeAccountId = '00000000-0000-0000-0000-000000000000';
      const result = await service.associateWithAccount(contact.id.value, fakeAccountId, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });
  });

  describe('disassociateFromAccount()', () => {
    it('should disassociate contact from account', async () => {
      const account = Account.create({
        name: 'Test Company',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'disassoc@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.disassociateFromAccount(contact.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBeUndefined();
    });

    it('should fail if contact not found', async () => {
      const fakeContactId = '00000000-0000-0000-0000-000000000000';
      const result = await service.disassociateFromAccount(fakeContactId, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('findPotentialDuplicates()', () => {
    it('should find contacts with same email domain', async () => {
      const contact1 = Contact.create({
        email: 'john@company.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      const contact2 = Contact.create({
        email: 'jane@company.com',
        firstName: 'Jane',
        lastName: 'Smith',
        ownerId: 'owner-1',
      }).value;
      const contact3 = Contact.create({
        email: 'bob@other.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);
      await contactRepository.save(contact3);

      const duplicates = await service.findPotentialDuplicates(contact1.id.value);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].email.value).toBe('jane@company.com');
    });

    it('should find contacts with similar names', async () => {
      const contact1 = Contact.create({
        email: 'john@domain1.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      const contact2 = Contact.create({
        email: 'john.d@domain2.com',
        firstName: 'John',
        lastName: 'Smith',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);

      const duplicates = await service.findPotentialDuplicates(contact1.id.value);

      expect(duplicates).toHaveLength(1);
    });

    it('should return empty array for non-existent contact', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const duplicates = await service.findPotentialDuplicates(fakeId);

      expect(duplicates).toHaveLength(0);
    });
  });

  describe('mergeContacts()', () => {
    it('should merge two contacts', async () => {
      const primary = Contact.create({
        email: 'primary@example.com',
        firstName: 'Primary',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      const secondary = Contact.create({
        email: 'secondary@example.com',
        firstName: 'Secondary',
        lastName: 'Contact',
        title: 'CEO',
        phone: '123-456-7890',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isSuccess).toBe(true);
      expect(result.value.survivingContactId).toBe(primary.id.value);
      expect(result.value.mergedContactId).toBe(secondary.id.value);
      expect(result.value.fieldsUpdated).toContain('title');
      expect(result.value.fieldsUpdated).toContain('phone');
    });

    it('should not overwrite existing fields in primary', async () => {
      const primary = Contact.create({
        email: 'primary@example.com',
        firstName: 'Primary',
        lastName: 'Contact',
        title: 'CTO',
        ownerId: 'owner-1',
      }).value;
      const secondary = Contact.create({
        email: 'secondary@example.com',
        firstName: 'Secondary',
        lastName: 'Contact',
        title: 'CEO',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isSuccess).toBe(true);
      expect(result.value.fieldsUpdated).not.toContain('title');
    });

    it('should fail when merging contact with itself', async () => {
      const contact = Contact.create({
        email: 'self@example.com',
        firstName: 'Self',
        lastName: 'Merge',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.mergeContacts(contact.id.value, contact.id.value, 'merger');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('itself');
    });

    it('should fail if primary contact not found', async () => {
      const secondary = Contact.create({
        email: 'secondary@example.com',
        firstName: 'Secondary',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(secondary);

      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.mergeContacts(fakeId, secondary.id.value, 'merger');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Primary contact not found');
    });

    it('should fail if secondary contact not found', async () => {
      const primary = Contact.create({
        email: 'primary@example.com',
        firstName: 'Primary',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(primary);

      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.mergeContacts(primary.id.value, fakeId, 'merger');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Secondary contact not found');
    });

    it('should delete secondary contact after merge', async () => {
      const primary = Contact.create({
        email: 'primary@example.com',
        firstName: 'Primary',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      const secondary = Contact.create({
        email: 'secondary@example.com',
        firstName: 'Secondary',
        lastName: 'Contact',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      const deletedContact = await contactRepository.findById(
        ContactId.create(secondary.id.value).value
      );
      expect(deletedContact).toBeNull();
    });
  });

  describe('getContactsByAccount()', () => {
    it('should return contacts for account', async () => {
      const account = Account.create({
        name: 'Test Company',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const contact1 = Contact.create({
        email: 'contact1@example.com',
        firstName: 'Contact',
        lastName: 'One',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      const contact2 = Contact.create({
        email: 'contact2@example.com',
        firstName: 'Contact',
        lastName: 'Two',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);

      const contacts = await service.getContactsByAccount(account.id.value);

      expect(contacts).toHaveLength(2);
    });

    it('should return empty array for account with no contacts', async () => {
      const contacts = await service.getContactsByAccount('non-existent-account');

      expect(contacts).toHaveLength(0);
    });
  });

  describe('getContactStatistics()', () => {
    it('should return correct statistics', async () => {
      const account = Account.create({
        name: 'Test Company',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const contact1 = Contact.create({
        email: 'c1@example.com',
        firstName: 'C',
        lastName: 'One',
        accountId: account.id.value,
        department: 'Sales',
        ownerId: 'owner-1',
      }).value;
      const contact2 = Contact.create({
        email: 'c2@example.com',
        firstName: 'C',
        lastName: 'Two',
        department: 'Sales',
        ownerId: 'owner-1',
      }).value;
      const contact3 = Contact.create({
        email: 'c3@example.com',
        firstName: 'C',
        lastName: 'Three',
        department: 'Engineering',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);
      await contactRepository.save(contact3);

      const stats = await service.getContactStatistics('owner-1');

      expect(stats.total).toBe(3);
      expect(stats.withAccount).toBe(1);
      expect(stats.withoutAccount).toBe(2);
      expect(stats.byDepartment['Sales']).toBe(2);
      expect(stats.byDepartment['Engineering']).toBe(1);
    });

    it('should handle empty repository', async () => {
      const stats = await service.getContactStatistics('owner-1');

      expect(stats.total).toBe(0);
      expect(stats.withAccount).toBe(0);
      expect(stats.withoutAccount).toBe(0);
    });
  });

  describe('deleteContact()', () => {
    it('should delete a contact', async () => {
      const contact = Contact.create({
        email: 'delete@example.com',
        firstName: 'Delete',
        lastName: 'Me',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.deleteContact(contact.id.value);

      expect(result.isSuccess).toBe(true);

      const deleted = await contactRepository.findById(contact.id);
      expect(deleted).toBeNull();
    });

    it('should fail if contact not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.deleteContact(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail if contact was converted from lead', async () => {
      const contact = Contact.create({
        email: 'converted@example.com',
        firstName: 'Converted',
        lastName: 'Lead',
        leadId: 'original-lead-id',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.deleteContact(contact.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('converted from a lead');
    });
  });
});
