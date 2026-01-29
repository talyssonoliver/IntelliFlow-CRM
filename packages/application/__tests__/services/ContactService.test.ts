import { describe, it, expect, beforeEach } from 'vitest';
import { ContactService } from '../../src/services/ContactService';
import { InMemoryContactRepository } from '../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryAccountRepository } from '../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryEventBus } from '../../../adapters/src/external/InMemoryEventBus';
import { Contact, Account, ContactCreatedEvent, ContactUpdatedEvent } from '@intelliflow/domain';

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
        email: 'contact@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('contact@example.com');
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

    it('should fail if email already exists', async () => {
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

    it('should fail if account does not exist', async () => {
      const result = await service.createContact({
        email: 'withaccount@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: '00000000-0000-0000-0000-000000000000',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should create contact with valid account', async () => {
      const account = Account.create({
        name: 'Test Account',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.createContact({
        email: 'withvalidaccount@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(account.id.value);
    });

    it('should publish ContactCreatedEvent', async () => {
      eventBus.clearPublishedEvents();

      await service.createContact({
        email: 'events@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      const createdEvents = events.filter((e) => e instanceof ContactCreatedEvent);
      expect(createdEvents.length).toBeGreaterThan(0);
    });
  });

  describe('updateContactInfo()', () => {
    it('should update contact information', async () => {
      const contact = Contact.create({
        email: 'update@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.updateContactInfo(
        contact.id.value,
        { firstName: 'Jane', department: 'Engineering' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.firstName).toBe('Jane');
      expect(result.value.department).toBe('Engineering');
    });

    it('should fail if contact not found', async () => {
      const result = await service.updateContactInfo(
        '00000000-0000-0000-0000-000000000000',
        { firstName: 'Test' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
    });

    it('should publish ContactUpdatedEvent', async () => {
      const contact = Contact.create({
        email: 'updateevent@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      contact.clearDomainEvents();
      await contactRepository.save(contact);

      eventBus.clearPublishedEvents();

      await service.updateContactInfo(contact.id.value, { title: 'Manager' }, 'updater');

      const events = eventBus.getPublishedEvents();
      const updatedEvents = events.filter((e) => e instanceof ContactUpdatedEvent);
      expect(updatedEvents.length).toBeGreaterThan(0);
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

    it('should fail if new email already in use', async () => {
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
        name: 'Test Account',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);
      await accountRepository.save(account);

      const result = await service.associateWithAccount(
        contact.id.value,
        account.id.value,
        'associator'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(account.id.value);
    });

    it('should fail if contact already has account', async () => {
      const account1 = Account.create({
        name: 'Account 1',
        ownerId: 'owner-1',
      }).value;
      const account2 = Account.create({
        name: 'Account 2',
        ownerId: 'owner-1',
      }).value;
      const contact = Contact.create({
        email: 'hasaccount@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account1.id.value,
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account1);
      await accountRepository.save(account2);
      await contactRepository.save(contact);

      const result = await service.associateWithAccount(
        contact.id.value,
        account2.id.value,
        'associator'
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail if account not found', async () => {
      const contact = Contact.create({
        email: 'noaccount@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.associateWithAccount(
        contact.id.value,
        '00000000-0000-0000-0000-000000000000',
        'associator'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('disassociateFromAccount()', () => {
    it('should disassociate contact from account', async () => {
      const account = Account.create({
        name: 'Test Account',
        ownerId: 'owner-1',
      }).value;
      const contact = Contact.create({
        email: 'disassociate@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);
      await contactRepository.save(contact);

      const result = await service.disassociateFromAccount(contact.id.value, 'disassociator');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBeUndefined();
    });

    it('should fail if contact has no account', async () => {
      const contact = Contact.create({
        email: 'noaccounttodisassociate@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.disassociateFromAccount(contact.id.value, 'disassociator');

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
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);

      const duplicates = await service.findPotentialDuplicates(contact1.id.value);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].id.value).toBe(contact2.id.value);
    });
  });

  describe('mergeContacts()', () => {
    it('should merge two contacts', async () => {
      const primary = Contact.create({
        email: 'primary@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      const secondary = Contact.create({
        email: 'secondary@example.com',
        firstName: 'Johnny',
        lastName: 'Doe',
        title: 'Manager',
        phone: '123-456-7890',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isSuccess).toBe(true);
      expect(result.value.survivingContactId).toBe(primary.id.value);
      expect(result.value.fieldsUpdated).toContain('title');
      expect(result.value.fieldsUpdated).toContain('phone');

      // Secondary should be deleted
      const deletedSecondary = await contactRepository.findById(secondary.id);
      expect(deletedSecondary).toBeNull();
    });

    it('should fail if merging contact with itself', async () => {
      const contact = Contact.create({
        email: 'self@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.mergeContacts(contact.id.value, contact.id.value, 'merger');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('with itself');
    });
  });

  describe('deleteContact()', () => {
    it('should delete a contact', async () => {
      const contact = Contact.create({
        email: 'delete@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.deleteContact(contact.id.value);

      expect(result.isSuccess).toBe(true);

      const deletedContact = await contactRepository.findById(contact.id);
      expect(deletedContact).toBeNull();
    });

    it('should fail if contact was converted from lead', async () => {
      const contact = Contact.create({
        email: 'fromLead@example.com',
        firstName: 'John',
        lastName: 'Doe',
        leadId: 'lead-123',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.deleteContact(contact.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('converted from a lead');
    });
  });

  describe('getContactStatistics()', () => {
    it('should return correct statistics', async () => {
      const account = Account.create({
        name: 'Test Account',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const contact1 = Contact.create({
        email: 'stat1@example.com',
        firstName: 'John',
        lastName: 'Doe',
        department: 'Engineering',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      const contact2 = Contact.create({
        email: 'stat2@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        department: 'Engineering',
        ownerId: 'owner-1',
      }).value;
      const contact3 = Contact.create({
        email: 'stat3@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        leadId: 'lead-123',
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);
      await contactRepository.save(contact3);

      const stats = await service.getContactStatistics('owner-1');

      expect(stats.total).toBe(3);
      expect(stats.withAccount).toBe(1);
      expect(stats.withoutAccount).toBe(2);
      expect(stats.convertedFromLeads).toBe(1);
      expect(stats.byDepartment['Engineering']).toBe(2);
    });
  });
});
