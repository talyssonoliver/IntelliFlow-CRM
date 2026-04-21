/**
 * ContactService Additional Tests
 *
 * Supplementary tests to improve coverage for uncovered methods and branches:
 * - getContactById
 * - getContactByEmail
 * - getContactByLeadId
 * - listContacts (all filter branches)
 * - linkToLead / unlinkFromLead (IFC-184)
 * - Persistence error paths
 * - Invalid ID error paths
 * - Event publishing resilience
 * - mergeContacts with account association transfer
 * - findPotentialDuplicates with invalid ID
 * - deleteContact persistence error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactService } from '../ContactService';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryLeadRepository } from '../../../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Contact, Account, Lead } from '@intelliflow/domain';

describe('ContactService (additional coverage)', () => {
  let contactRepository: InMemoryContactRepository;
  let accountRepository: InMemoryAccountRepository;
  let leadRepository: InMemoryLeadRepository;
  let eventBus: InMemoryEventBus;
  let service: ContactService;

  beforeEach(() => {
    contactRepository = new InMemoryContactRepository();
    accountRepository = new InMemoryAccountRepository();
    leadRepository = new InMemoryLeadRepository();
    eventBus = new InMemoryEventBus();
    service = new ContactService(contactRepository, accountRepository, leadRepository, eventBus);
  });

  // =========================================================================
  // getContactById
  // =========================================================================
  describe('getContactById()', () => {
    it('should return contact when found', async () => {
      const contact = Contact.create({
        email: 'find@example.com',
        firstName: 'Find',
        lastName: 'Me',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.getContactById(contact.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('find@example.com');
    });

    it('should fail when contact not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.getContactById(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail with invalid ID format', async () => {
      const result = await service.getContactById('not-a-uuid');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // getContactByEmail
  // =========================================================================
  describe('getContactByEmail()', () => {
    it('should return contact when found', async () => {
      const contact = Contact.create({
        email: 'email@example.com',
        firstName: 'Email',
        lastName: 'Test',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.getContactByEmail('email@example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.firstName).toBe('Email');
    });

    it('should fail when contact not found by email', async () => {
      const result = await service.getContactByEmail('nobody@example.com');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail with invalid email format', async () => {
      const result = await service.getContactByEmail('invalid-email');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // getContactByLeadId
  // =========================================================================
  describe('getContactByLeadId()', () => {
    it('should return contact when found by lead ID', async () => {
      const contact = Contact.create({
        email: 'lead@example.com',
        firstName: 'Lead',
        lastName: 'Contact',
        leadId: 'original-lead-id',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.getContactByLeadId('original-lead-id');

      expect(result).not.toBeNull();
      expect(result!.email.value).toBe('lead@example.com');
    });

    it('should return null when no contact found for lead', async () => {
      const result = await service.getContactByLeadId('non-existent-lead');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // listContacts
  // =========================================================================
  describe('listContacts()', () => {
    beforeEach(async () => {
      const account = Account.create({
        name: 'Test Corp',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const contacts = [
        {
          email: 'alice@corp.com',
          firstName: 'Alice',
          lastName: 'Smith',
          department: 'Sales',
          accountId: account.id.value,
        },
        { email: 'bob@corp.com', firstName: 'Bob', lastName: 'Jones', department: 'Engineering' },
        {
          email: 'carol@corp.com',
          firstName: 'Carol',
          lastName: 'White',
          department: 'Sales',
          title: 'VP Sales',
        },
      ];

      for (const c of contacts) {
        const contact = Contact.create({
          ...c,
          ownerId: 'owner-1',
        } as any).value;
        await contactRepository.save(contact);
      }
    });

    it('should list contacts by ownerId', async () => {
      const result = await service.listContacts({ ownerId: 'owner-1' });

      expect(result.total).toBe(3);
      expect(result.contacts).toHaveLength(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should list contacts by accountId', async () => {
      const accounts = await accountRepository.findByOwnerId('owner-1');
      const account = accounts[0];

      const result = await service.listContacts({ accountId: account.id.value });

      expect(result.total).toBe(1);
      expect(result.contacts[0].email.value).toBe('alice@corp.com');
    });

    it('should return empty when no ownerId or accountId', async () => {
      const result = await service.listContacts({});

      expect(result.total).toBe(0);
      expect(result.contacts).toHaveLength(0);
    });

    it('should filter by query (name search)', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        query: 'alice',
      });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe('Alice');
    });

    it('should filter by query (email search)', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        query: 'bob@corp',
      });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe('Bob');
    });

    it('should filter by query (last name search)', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        query: 'white',
      });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe('Carol');
    });

    it('should filter by query (title search)', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        query: 'VP',
      });

      expect(result.total).toBe(1);
      expect(result.contacts[0].firstName).toBe('Carol');
    });

    it('should filter by department', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        department: 'Sales',
      });

      expect(result.total).toBe(2);
    });

    it('should paginate results', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        page: 1,
        limit: 2,
      });

      expect(result.contacts).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should return second page', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        page: 2,
        limit: 2,
      });

      expect(result.contacts).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should combine query and department filters', async () => {
      const result = await service.listContacts({
        ownerId: 'owner-1',
        query: 'alice',
        department: 'Sales',
      });

      expect(result.total).toBe(1);
    });
  });

  // =========================================================================
  // linkToLead (IFC-184)
  // =========================================================================
  describe('linkToLead()', () => {
    it('should link contact to lead successfully', async () => {
      const contact = Contact.create({
        email: 'link@example.com',
        firstName: 'Link',
        lastName: 'Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const lead = Lead.create({
        email: 'lead@example.com',
        firstName: 'Lead',
        lastName: 'Person',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await leadRepository.save(lead);

      const result = await service.linkToLead(contact.id.value, lead.id.value, 'linker');

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if contact not found', async () => {
      const lead = Lead.create({
        email: 'lead@example.com',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await leadRepository.save(lead);

      const fakeContactId = '00000000-0000-0000-0000-000000000000';
      const result = await service.linkToLead(fakeContactId, lead.id.value, 'linker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail if lead not found', async () => {
      const contact = Contact.create({
        email: 'nolead@example.com',
        firstName: 'No',
        lastName: 'Lead',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const fakeLeadId = '00000000-0000-0000-0000-000000000000';
      const result = await service.linkToLead(contact.id.value, fakeLeadId, 'linker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Lead not found');
    });

    it('should fail with invalid contact ID', async () => {
      const result = await service.linkToLead(
        'bad-id',
        '00000000-0000-0000-0000-000000000000',
        'linker'
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail with invalid lead ID', async () => {
      const contact = Contact.create({
        email: 'badlead@example.com',
        firstName: 'Bad',
        lastName: 'Lead',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.linkToLead(contact.id.value, 'bad-id', 'linker');

      expect(result.isFailure).toBe(true);
    });

    it('should fail for cross-tenant linking', async () => {
      const contact = Contact.create({
        email: 'tenant1@example.com',
        firstName: 'Tenant1',
        lastName: 'Contact',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const lead = Lead.create({
        email: 'tenant2@example.com',
        ownerId: 'owner-1',
        tenantId: 'tenant-2',
      } as any).value;
      await leadRepository.save(lead);

      const result = await service.linkToLead(contact.id.value, lead.id.value, 'linker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('same tenant');
    });

    it('should handle unique constraint error on save', async () => {
      const contact = Contact.create({
        email: 'unique@example.com',
        firstName: 'Unique',
        lastName: 'Contact',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const lead = Lead.create({
        email: 'uniquelead@example.com',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await leadRepository.save(lead);

      // Mock save to throw unique constraint error
      contactRepository.save = vi.fn().mockRejectedValue(new Error('Unique constraint violated'));

      const result = await service.linkToLead(contact.id.value, lead.id.value, 'linker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already linked');
    });

    it('should handle generic persistence error on save', async () => {
      const contact = Contact.create({
        email: 'persist@example.com',
        firstName: 'Persist',
        lastName: 'Error',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const lead = Lead.create({
        email: 'persistlead@example.com',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await leadRepository.save(lead);

      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB connection lost'));

      const result = await service.linkToLead(contact.id.value, lead.id.value, 'linker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });
  });

  // =========================================================================
  // unlinkFromLead (IFC-184)
  // =========================================================================
  describe('unlinkFromLead()', () => {
    it('should unlink contact from lead successfully', async () => {
      const contact = Contact.create({
        email: 'unlink@example.com',
        firstName: 'Unlink',
        lastName: 'Test',
        leadId: 'lead-to-unlink',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.unlinkFromLead(contact.id.value, 'unlinker');

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if contact not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.unlinkFromLead(fakeId, 'unlinker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail with invalid contact ID', async () => {
      const result = await service.unlinkFromLead('bad-id', 'unlinker');

      expect(result.isFailure).toBe(true);
    });

    it('should succeed idempotently if contact is not linked to a lead', async () => {
      const contact = Contact.create({
        email: 'nolink@example.com',
        firstName: 'No',
        lastName: 'Link',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.unlinkFromLead(contact.id.value, 'unlinker');

      // Domain entity's unlinkFromLead is idempotent - returns ok when no lead linked
      expect(result.isSuccess).toBe(true);
    });

    it('should handle persistence error on save', async () => {
      const contact = Contact.create({
        email: 'savefail@example.com',
        firstName: 'Save',
        lastName: 'Fail',
        leadId: 'some-lead',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.unlinkFromLead(contact.id.value, 'unlinker');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });
  });

  // =========================================================================
  // Persistence error paths
  // =========================================================================
  describe('persistence error handling', () => {
    it('should return PersistenceError when save fails on create', async () => {
      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.createContact({
        email: 'fail@example.com',
        firstName: 'Fail',
        lastName: 'Save',
        ownerId: 'owner-1',
      } as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });

    it('should return PersistenceError when save fails on updateContactInfo', async () => {
      const contact = Contact.create({
        email: 'updatefail@example.com',
        firstName: 'Update',
        lastName: 'Fail',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateContactInfo(
        contact.id.value,
        { firstName: 'New' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });

    it('should return PersistenceError when save fails on updateContactEmail', async () => {
      const contact = Contact.create({
        email: 'emailfail@example.com',
        firstName: 'Email',
        lastName: 'Fail',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateContactEmail(
        contact.id.value,
        'newemail@example.com',
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });

    it('should return PersistenceError when save fails on associateWithAccount', async () => {
      const contact = Contact.create({
        email: 'assocfail@example.com',
        firstName: 'Assoc',
        lastName: 'Fail',
        ownerId: 'owner-1',
      } as any).value;
      const account = Account.create({
        name: 'Fail Company',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);
      await accountRepository.save(account);

      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.associateWithAccount(contact.id.value, account.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });

    it('should return PersistenceError when save fails on disassociateFromAccount', async () => {
      const account = Account.create({
        name: 'Disassoc Company',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'disassocfail@example.com',
        firstName: 'Disassoc',
        lastName: 'Fail',
        accountId: account.id.value,
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      contactRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.disassociateFromAccount(contact.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save contact');
    });

    it('should return PersistenceError when delete fails', async () => {
      const contact = Contact.create({
        email: 'deletefail@example.com',
        firstName: 'Delete',
        lastName: 'Fail',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      contactRepository.delete = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.deleteContact(contact.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to delete contact');
    });

    it('should return PersistenceError when merge save/delete fails', async () => {
      const primary = Contact.create({
        email: 'mergeprimary@example.com',
        firstName: 'Primary',
        lastName: 'Contact',
        ownerId: 'owner-1',
      } as any).value;
      const secondary = Contact.create({
        email: 'mergesecondary@example.com',
        firstName: 'Secondary',
        lastName: 'Contact',
        title: 'Manager',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      // IFC-310: merge now delegates to repository.mergeInTransaction; mock
      // that to simulate the atomic tx failing mid-flight.
      contactRepository.mergeInTransaction = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to complete contact merge');
    });
  });

  // =========================================================================
  // Invalid ID error paths
  // =========================================================================
  describe('invalid ID error paths', () => {
    it('should fail updateContactEmail with invalid ID', async () => {
      const result = await service.updateContactEmail('bad-id', 'new@example.com', 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail associateWithAccount with invalid contact ID', async () => {
      const result = await service.associateWithAccount(
        'bad-id',
        '00000000-0000-0000-0000-000000000000',
        'u'
      );
      expect(result.isFailure).toBe(true);
    });

    it('should fail associateWithAccount with invalid account ID', async () => {
      const contact = Contact.create({
        email: 'badaccount@example.com',
        firstName: 'Bad',
        lastName: 'Account',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.associateWithAccount(contact.id.value, 'bad-id', 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail disassociateFromAccount with invalid ID', async () => {
      const result = await service.disassociateFromAccount('bad-id', 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail deleteContact with invalid ID', async () => {
      const result = await service.deleteContact('bad-id');
      expect(result.isFailure).toBe(true);
    });

    it('should fail mergeContacts with invalid primary ID', async () => {
      const result = await service.mergeContacts(
        'bad-id',
        '00000000-0000-0000-0000-000000000000',
        'u'
      );
      expect(result.isFailure).toBe(true);
    });

    it('should fail mergeContacts with invalid secondary ID', async () => {
      const result = await service.mergeContacts(
        '00000000-0000-0000-0000-000000000000',
        'bad-id',
        'u'
      );
      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // Event publishing resilience
  // =========================================================================
  describe('event publishing resilience', () => {
    it('should not fail when event publishing throws on create', async () => {
      eventBus.publishAll = vi.fn().mockRejectedValue(new Error('Event bus down'));

      const result = await service.createContact({
        email: 'eventfail@example.com',
        firstName: 'Event',
        lastName: 'Fail',
        ownerId: 'owner-1',
      } as any);

      expect(result.isSuccess).toBe(true);
    });

    it('should not fail when event publishing throws on update', async () => {
      const contact = Contact.create({
        email: 'eventupdatefail@example.com',
        firstName: 'Event',
        lastName: 'Update',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      eventBus.publishAll = vi.fn().mockRejectedValue(new Error('Event bus down'));

      const result = await service.updateContactInfo(
        contact.id.value,
        { firstName: 'Updated' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  // =========================================================================
  // mergeContacts - account association transfer
  // =========================================================================
  describe('mergeContacts() - extended', () => {
    it('should transfer department from secondary when primary lacks it', async () => {
      const primary = Contact.create({
        email: 'deptprimary@example.com',
        firstName: 'Primary',
        lastName: 'NoDept',
        ownerId: 'owner-1',
      } as any).value;
      const secondary = Contact.create({
        email: 'deptsecondary@example.com',
        firstName: 'Secondary',
        lastName: 'WithDept',
        department: 'Engineering',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isSuccess).toBe(true);
      expect(result.value.fieldsUpdated).toContain('department');
    });

    it('should transfer account from secondary when primary has no account', async () => {
      const account = Account.create({
        name: 'Merge Account',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const primary = Contact.create({
        email: 'noaccount@example.com',
        firstName: 'No',
        lastName: 'Account',
        ownerId: 'owner-1',
      } as any).value;
      const secondary = Contact.create({
        email: 'hasaccount@example.com',
        firstName: 'Has',
        lastName: 'Account',
        accountId: account.id.value,
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isSuccess).toBe(true);
      expect(result.value.fieldsUpdated).toContain('accountId');
    });

    it('should not transfer fields when both contacts lack them', async () => {
      const primary = Contact.create({
        email: 'empty1@example.com',
        firstName: 'Empty',
        lastName: 'One',
        ownerId: 'owner-1',
      } as any).value;
      const secondary = Contact.create({
        email: 'empty2@example.com',
        firstName: 'Empty',
        lastName: 'Two',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(primary);
      await contactRepository.save(secondary);

      const result = await service.mergeContacts(primary.id.value, secondary.id.value, 'merger');

      expect(result.isSuccess).toBe(true);
      expect(result.value.fieldsUpdated).toHaveLength(0);
    });
  });

  // =========================================================================
  // findPotentialDuplicates - extended
  // =========================================================================
  describe('findPotentialDuplicates() - extended', () => {
    it('should return empty for invalid contact ID', async () => {
      const duplicates = await service.findPotentialDuplicates('not-a-uuid');

      expect(duplicates).toHaveLength(0);
    });

    it('should find duplicates by last name match', async () => {
      const contact1 = Contact.create({
        email: 'john@domain1.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      } as any).value;
      const contact2 = Contact.create({
        email: 'jane@domain2.com',
        firstName: 'Jane',
        lastName: 'Doe',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact1);
      await contactRepository.save(contact2);

      const duplicates = await service.findPotentialDuplicates(contact1.id.value);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].lastName).toBe('Doe');
    });

    it('should not include the contact itself in duplicates', async () => {
      const contact = Contact.create({
        email: 'solo@domain.com',
        firstName: 'Solo',
        lastName: 'Contact',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const duplicates = await service.findPotentialDuplicates(contact.id.value);

      expect(duplicates).toHaveLength(0);
    });
  });

  // =========================================================================
  // getContactStatistics - extended
  // =========================================================================
  describe('getContactStatistics() - extended', () => {
    it('should return zeros without ownerId', async () => {
      const stats = await service.getContactStatistics();

      expect(stats.total).toBe(0);
      expect(stats.withAccount).toBe(0);
      expect(stats.withoutAccount).toBe(0);
      expect(stats.convertedFromLeads).toBe(0);
    });

    it('should count converted from leads', async () => {
      const contact = Contact.create({
        email: 'converted@example.com',
        firstName: 'Converted',
        lastName: 'Lead',
        leadId: 'original-lead',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const stats = await service.getContactStatistics('owner-1');

      expect(stats.convertedFromLeads).toBe(1);
    });

    it('should group by Unassigned department', async () => {
      const contact = Contact.create({
        email: 'nodept@example.com',
        firstName: 'No',
        lastName: 'Dept',
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const stats = await service.getContactStatistics('owner-1');

      expect(stats.byDepartment['Unassigned']).toBe(1);
    });
  });

  // =========================================================================
  // updateContactEmail - contact not found
  // =========================================================================
  describe('updateContactEmail() - extended', () => {
    it('should fail if contact not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.updateContactEmail(fakeId, 'new@test.com', 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });
  });

  // =========================================================================
  // createContact - invalid account ID format
  // =========================================================================
  describe('createContact() - extended', () => {
    it('should fail with invalid account ID format', async () => {
      const result = await service.createContact({
        email: 'badaccount@example.com',
        firstName: 'Bad',
        lastName: 'Account',
        accountId: 'not-a-uuid',
        ownerId: 'owner-1',
      } as any);

      expect(result.isFailure).toBe(true);
    });
  });
});
