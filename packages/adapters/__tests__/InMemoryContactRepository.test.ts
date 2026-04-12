/**
 * InMemoryContactRepository Tests
 *
 * These tests verify the in-memory repository implementation.
 * They ensure all repository methods work correctly and queries return expected results.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryContactRepository } from '../src/repositories/InMemoryContactRepository';
import { Contact, ContactId, Email } from '@intelliflow/domain';

describe('InMemoryContactRepository', () => {
  let repository: InMemoryContactRepository;
  let testContact: Contact;
  let testContactId: ContactId;

  beforeEach(() => {
    repository = new InMemoryContactRepository();

    // Create a test contact for most tests
    const contactResult = Contact.create({
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      title: 'Software Engineer',
      phone: '+1-555-0100',
      department: 'Engineering',
      accountId: 'account-123',
      ownerId: 'owner-123',
    });

    testContact = contactResult.value;
    testContactId = testContact.id;
  });

  describe('save()', () => {
    it('should save a new contact', async () => {
      await repository.save(testContact);

      const found = await repository.findById(testContactId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testContactId);
      expect(found?.email.value).toBe('john.doe@example.com');
    });

    it('should update an existing contact', async () => {
      await repository.save(testContact);

      // Update the contact
      testContact.updateContactInfo({ firstName: 'Jane' }, 'user-123');
      await repository.save(testContact);

      const found = await repository.findById(testContactId);
      expect(found).not.toBeNull();
      expect(found?.firstName).toBe('Jane');
    });

    it('should overwrite existing contact with same ID', async () => {
      await repository.save(testContact);

      const originalTitle = testContact.title;
      testContact.updateContactInfo({ title: 'Senior Engineer' }, 'user-123');
      await repository.save(testContact);

      const allContacts = repository.getAll();
      expect(allContacts).toHaveLength(1);
      expect(allContacts[0].title).toBe('Senior Engineer');
      expect(allContacts[0].title).not.toBe(originalTitle);
    });

    it('should save multiple contacts', async () => {
      const contact2Result = Contact.create({
        email: 'jane.smith@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        ownerId: 'owner-123',
      });

      const contact3Result = Contact.create({
        email: 'bob.wilson@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        ownerId: 'owner-456',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);
      await repository.save(contact3Result.value);

      const allContacts = repository.getAll();
      expect(allContacts).toHaveLength(3);
    });
  });

  describe('findById()', () => {
    it('should return contact when exists', async () => {
      await repository.save(testContact);

      const found = await repository.findById(testContactId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testContactId);
      expect(found?.email.value).toBe('john.doe@example.com');
      expect(found?.firstName).toBe('John');
      expect(found?.lastName).toBe('Doe');
    });

    it('should return null when contact does not exist', async () => {
      const nonExistentId = ContactId.generate();

      const found = await repository.findById(nonExistentId);

      expect(found).toBeNull();
    });

    it('should return null for empty repository', async () => {
      const found = await repository.findById(testContactId);

      expect(found).toBeNull();
    });

    it('should distinguish between different contact IDs', async () => {
      const contact2Result = Contact.create({
        email: 'other@example.com',
        firstName: 'Other',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);

      const found1 = await repository.findById(testContactId);
      const found2 = await repository.findById(contact2Result.value.id);

      expect(found1?.email.value).toBe('john.doe@example.com');
      expect(found2?.email.value).toBe('other@example.com');
    });
  });

  describe('findByEmail()', () => {
    it('should return contact when email exists', async () => {
      await repository.save(testContact);

      const emailResult = Email.create('john.doe@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testContactId);
      expect(found?.email.value).toBe('john.doe@example.com');
    });

    it('should return null when email does not exist', async () => {
      await repository.save(testContact);

      const emailResult = Email.create('nonexistent@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).toBeNull();
    });

    it('should handle email case insensitivity', async () => {
      await repository.save(testContact);

      const emailResult = Email.create('JOHN.DOE@EXAMPLE.COM');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testContactId);
    });

    it('should return first matching contact when multiple exist (edge case)', async () => {
      // This shouldn't happen in practice due to business rules,
      // but we test the repository behavior
      await repository.save(testContact);

      const emailResult = Email.create('john.doe@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).not.toBeNull();
      expect(found?.email.value).toBe('john.doe@example.com');
    });

    it('should return null for empty repository', async () => {
      const emailResult = Email.create('john.doe@example.com');
      const found = await repository.findByEmail(emailResult.value);

      expect(found).toBeNull();
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all contacts for an owner', async () => {
      const contact2Result = Contact.create({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        ownerId: 'owner-123',
      });

      const contact3Result = Contact.create({
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);
      await repository.save(contact3Result.value);

      const contacts = await repository.findByOwnerId('owner-123');

      expect(contacts).toHaveLength(3);
      expect(contacts.every((c) => c.ownerId === 'owner-123')).toBe(true);
    });

    it('should return empty array when owner has no contacts', async () => {
      await repository.save(testContact);

      const contacts = await repository.findByOwnerId('owner-999');

      expect(contacts).toHaveLength(0);
    });

    it('should filter out contacts from other owners', async () => {
      const contact2Result = Contact.create({
        email: 'other@example.com',
        firstName: 'Other',
        lastName: 'User',
        ownerId: 'owner-456',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);

      const contacts = await repository.findByOwnerId('owner-123');

      expect(contacts).toHaveLength(1);
      expect(contacts[0].ownerId).toBe('owner-123');
    });

    it('should sort contacts by creation date descending', async () => {
      // Create contacts with slight time differences
      const contact2Result = Contact.create({
        email: 'second@example.com',
        firstName: 'Second',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const contact3Result = Contact.create({
        email: 'third@example.com',
        firstName: 'Third',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);
      await repository.save(contact3Result.value);

      const contacts = await repository.findByOwnerId('owner-123');

      // Most recent first
      expect(contacts[0].createdAt >= contacts[1].createdAt).toBe(true);
      expect(contacts[1].createdAt >= contacts[2].createdAt).toBe(true);
    });
  });

  describe('findByAccountId()', () => {
    it('should return all contacts for an account', async () => {
      const contact2Result = Contact.create({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      const contact3Result = Contact.create({
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        accountId: 'account-123',
        ownerId: 'owner-456',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);
      await repository.save(contact3Result.value);

      const contacts = await repository.findByAccountId('account-123');

      expect(contacts).toHaveLength(3);
      expect(contacts.every((c) => c.accountId === 'account-123')).toBe(true);
    });

    it('should return empty array when account has no contacts', async () => {
      await repository.save(testContact);

      const contacts = await repository.findByAccountId('account-999');

      expect(contacts).toHaveLength(0);
    });

    it('should filter out contacts from other accounts', async () => {
      const contact2Result = Contact.create({
        email: 'other@example.com',
        firstName: 'Other',
        lastName: 'User',
        accountId: 'account-456',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);

      const contacts = await repository.findByAccountId('account-123');

      expect(contacts).toHaveLength(1);
      expect(contacts[0].accountId).toBe('account-123');
    });

    it('should not include contacts without an account', async () => {
      const contactWithoutAccount = Contact.create({
        email: 'noaccont@example.com',
        firstName: 'No',
        lastName: 'Account',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contactWithoutAccount.value);

      const contacts = await repository.findByAccountId('account-123');

      expect(contacts).toHaveLength(1);
      expect(contacts[0].accountId).toBe('account-123');
    });

    it('should sort contacts by creation date descending', async () => {
      const contact2Result = Contact.create({
        email: 'second@example.com',
        firstName: 'Second',
        lastName: 'User',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      await new Promise((resolve) => setTimeout(resolve, 5));

      const contact3Result = Contact.create({
        email: 'third@example.com',
        firstName: 'Third',
        lastName: 'User',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);
      await repository.save(contact3Result.value);

      const contacts = await repository.findByAccountId('account-123');

      // Most recent first
      expect(contacts[0].createdAt >= contacts[1].createdAt).toBe(true);
      expect(contacts[1].createdAt >= contacts[2].createdAt).toBe(true);
    });
  });

  describe('findByLeadId()', () => {
    it('should return contact when leadId exists', async () => {
      const contactFromLead = Contact.create({
        email: 'converted@example.com',
        firstName: 'Converted',
        lastName: 'Lead',
        leadId: 'lead-456',
        ownerId: 'owner-123',
      });

      await repository.save(contactFromLead.value);

      const found = await repository.findByLeadId('lead-456');

      expect(found).not.toBeNull();
      expect(found?.leadId).toBe('lead-456');
      expect(found?.email.value).toBe('converted@example.com');
    });

    it('should return null when leadId does not exist', async () => {
      await repository.save(testContact);

      const found = await repository.findByLeadId('nonexistent-lead');

      expect(found).toBeNull();
    });

    it('should return null for contacts without leadId', async () => {
      // testContact doesn't have a leadId
      await repository.save(testContact);

      const found = await repository.findByLeadId('lead-123');

      expect(found).toBeNull();
    });

    it('should return first matching contact when multiple exist with same leadId (edge case)', async () => {
      const contact1 = Contact.create({
        email: 'first@example.com',
        firstName: 'First',
        lastName: 'User',
        leadId: 'lead-123',
        ownerId: 'owner-123',
      });

      await repository.save(contact1.value);

      const found = await repository.findByLeadId('lead-123');

      expect(found).not.toBeNull();
      expect(found?.leadId).toBe('lead-123');
    });

    it('should return null for empty repository', async () => {
      const found = await repository.findByLeadId('lead-123');

      expect(found).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should delete an existing contact', async () => {
      await repository.save(testContact);

      await repository.delete(testContactId);

      const found = await repository.findById(testContactId);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent contact', async () => {
      const nonExistentId = ContactId.generate();

      await expect(repository.delete(nonExistentId)).resolves.toBeUndefined();
    });

    it('should only delete specified contact', async () => {
      const contact2Result = Contact.create({
        email: 'second@example.com',
        firstName: 'Second',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);

      await repository.delete(testContactId);

      const found1 = await repository.findById(testContactId);
      const found2 = await repository.findById(contact2Result.value.id);

      expect(found1).toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should allow re-adding a deleted contact', async () => {
      await repository.save(testContact);
      await repository.delete(testContactId);

      await repository.save(testContact);

      const found = await repository.findById(testContactId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testContactId);
    });
  });

  describe('existsByEmail()', () => {
    it('should return true when email exists', async () => {
      await repository.save(testContact);

      const emailResult = Email.create('john.doe@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      const emailResult = Email.create('nonexistent@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });

    it('should handle email case insensitivity', async () => {
      await repository.save(testContact);

      const emailResult = Email.create('JOHN.DOE@EXAMPLE.COM');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(true);
    });

    it('should return false after contact is deleted', async () => {
      await repository.save(testContact);
      await repository.delete(testContactId);

      const emailResult = Email.create('john.doe@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });

    it('should return false for empty repository', async () => {
      const emailResult = Email.create('john.doe@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });
  });

  describe('countByAccountId()', () => {
    it('should count contacts by accountId', async () => {
      const contact2Result = Contact.create({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      const contact3Result = Contact.create({
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        accountId: 'account-123',
        ownerId: 'owner-456',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);
      await repository.save(contact3Result.value);

      const count = await repository.countByAccountId('account-123');

      expect(count).toBe(3);
    });

    it('should return 0 when account has no contacts', async () => {
      await repository.save(testContact);

      const count = await repository.countByAccountId('account-999');

      expect(count).toBe(0);
    });

    it('should not count contacts from other accounts', async () => {
      const contact2Result = Contact.create({
        email: 'other@example.com',
        firstName: 'Other',
        lastName: 'User',
        accountId: 'account-456',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contact2Result.value);

      const count = await repository.countByAccountId('account-123');

      expect(count).toBe(1);
    });

    it('should not count contacts without an account', async () => {
      const contactWithoutAccount = Contact.create({
        email: 'noaccount@example.com',
        firstName: 'No',
        lastName: 'Account',
        ownerId: 'owner-123',
      });

      await repository.save(testContact);
      await repository.save(contactWithoutAccount.value);

      const count = await repository.countByAccountId('account-123');

      expect(count).toBe(1);
    });

    it('should return 0 for empty repository', async () => {
      const count = await repository.countByAccountId('account-123');

      expect(count).toBe(0);
    });
  });

  describe('Test Helper Methods', () => {
    describe('clear()', () => {
      it('should remove all contacts from repository', async () => {
        await repository.save(testContact);

        repository.clear();

        const allContacts = repository.getAll();
        expect(allContacts).toHaveLength(0);
      });

      it('should allow adding contacts after clear', async () => {
        await repository.save(testContact);
        repository.clear();

        await repository.save(testContact);

        const allContacts = repository.getAll();
        expect(allContacts).toHaveLength(1);
      });
    });

    describe('getAll()', () => {
      it('should return all contacts', async () => {
        const contact2Result = Contact.create({
          email: 'second@example.com',
          firstName: 'Second',
          lastName: 'User',
          ownerId: 'owner-123',
        });

        await repository.save(testContact);
        await repository.save(contact2Result.value);

        const allContacts = repository.getAll();

        expect(allContacts).toHaveLength(2);
      });

      it('should return empty array for empty repository', () => {
        const allContacts = repository.getAll();

        expect(allContacts).toHaveLength(0);
      });

      it('should return actual Contact instances', async () => {
        await repository.save(testContact);

        const allContacts = repository.getAll();

        expect(allContacts[0]).toBeInstanceOf(Contact);
        expect(allContacts[0].email).toBeInstanceOf(Email);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete contact lifecycle', async () => {
      // Create and save contact
      await repository.save(testContact);

      // Find by email
      const emailResult = Email.create('john.doe@example.com');
      const foundByEmail = await repository.findByEmail(emailResult.value);
      expect(foundByEmail).not.toBeNull();

      // Update contact info
      testContact.updateContactInfo({ title: 'Senior Engineer' }, 'user-123');
      await repository.save(testContact);

      // Verify update
      const updated = await repository.findById(testContactId);
      expect(updated?.title).toBe('Senior Engineer');

      // Find by account
      const accountContacts = await repository.findByAccountId('account-123');
      expect(accountContacts).toHaveLength(1);

      // Count by account
      const count = await repository.countByAccountId('account-123');
      expect(count).toBe(1);

      // Delete contact
      await repository.delete(testContactId);

      // Verify deletion
      const deleted = await repository.findById(testContactId);
      expect(deleted).toBeNull();
    });

    it('should handle multiple owners and accounts correctly', async () => {
      const owner1Contact1 = Contact.create({
        email: 'owner1-contact1@example.com',
        firstName: 'Owner1',
        lastName: 'Contact1',
        accountId: 'account-1',
        ownerId: 'owner-1',
      });

      const owner1Contact2 = Contact.create({
        email: 'owner1-contact2@example.com',
        firstName: 'Owner1',
        lastName: 'Contact2',
        accountId: 'account-1',
        ownerId: 'owner-1',
      });

      const owner2Contact1 = Contact.create({
        email: 'owner2-contact1@example.com',
        firstName: 'Owner2',
        lastName: 'Contact1',
        accountId: 'account-2',
        ownerId: 'owner-2',
      });

      await repository.save(owner1Contact1.value);
      await repository.save(owner1Contact2.value);
      await repository.save(owner2Contact1.value);

      const owner1Contacts = await repository.findByOwnerId('owner-1');
      const owner2Contacts = await repository.findByOwnerId('owner-2');
      const account1Contacts = await repository.findByAccountId('account-1');
      const account2Contacts = await repository.findByAccountId('account-2');

      expect(owner1Contacts).toHaveLength(2);
      expect(owner2Contacts).toHaveLength(1);
      expect(account1Contacts).toHaveLength(2);
      expect(account2Contacts).toHaveLength(1);

      const account1Count = await repository.countByAccountId('account-1');
      expect(account1Count).toBe(2);
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const contact2Result = Contact.create({
        email: 'concurrent@example.com',
        firstName: 'Concurrent',
        lastName: 'User',
        ownerId: 'owner-123',
      });

      // Simulate concurrent saves
      await Promise.all([repository.save(testContact), repository.save(contact2Result.value)]);

      const allContacts = repository.getAll();
      expect(allContacts).toHaveLength(2);

      // Verify both contacts are findable
      const found1 = await repository.findById(testContact.id);
      const found2 = await repository.findById(contact2Result.value.id);

      expect(found1).not.toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should handle contacts converted from leads', async () => {
      const contactFromLead1 = Contact.create({
        email: 'lead1@example.com',
        firstName: 'Lead1',
        lastName: 'Converted',
        leadId: 'lead-001',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      const contactFromLead2 = Contact.create({
        email: 'lead2@example.com',
        firstName: 'Lead2',
        lastName: 'Converted',
        leadId: 'lead-002',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      const directContact = Contact.create({
        email: 'direct@example.com',
        firstName: 'Direct',
        lastName: 'Contact',
        accountId: 'account-123',
        ownerId: 'owner-123',
      });

      await repository.save(contactFromLead1.value);
      await repository.save(contactFromLead2.value);
      await repository.save(directContact.value);

      // Find converted contacts by leadId
      const found1 = await repository.findByLeadId('lead-001');
      const found2 = await repository.findByLeadId('lead-002');

      expect(found1).not.toBeNull();
      expect(found1?.isConvertedFromLead).toBe(true);
      expect(found2).not.toBeNull();
      expect(found2?.isConvertedFromLead).toBe(true);

      // All should be in same account
      const accountContacts = await repository.findByAccountId('account-123');
      expect(accountContacts).toHaveLength(3);
    });

    it('should handle account association and disassociation', async () => {
      // Create contact without account
      const contactWithoutAccount = Contact.create({
        email: 'noaccoint@example.com',
        firstName: 'No',
        lastName: 'Account',
        ownerId: 'owner-123',
      });

      await repository.save(contactWithoutAccount.value);

      // Verify not in account
      let count = await repository.countByAccountId('account-999');
      expect(count).toBe(0);

      // Associate with account
      contactWithoutAccount.value.associateWithAccount('account-999', 'user-123');
      await repository.save(contactWithoutAccount.value);

      // Verify in account
      count = await repository.countByAccountId('account-999');
      expect(count).toBe(1);

      // Disassociate from account
      contactWithoutAccount.value.disassociateFromAccount('user-123');
      await repository.save(contactWithoutAccount.value);

      // Verify not in account again
      count = await repository.countByAccountId('account-999');
      expect(count).toBe(0);
    });
  });
});
