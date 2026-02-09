/**
 * AccountService Hierarchy Tests (PG-134)
 *
 * Tests for hierarchy features: getHierarchy, setParent,
 * getAccountContacts, getAccountOpportunities, getAccountActivity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AccountService } from '../AccountService';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Account, Contact, Opportunity } from '@intelliflow/domain';

const TENANT = 'tenant-001';
const OWNER = 'owner-001';

function createAccount(overrides: Partial<{ name: string; industry: string; revenue: number; parentAccountId: string }> = {}): Account {
  return Account.create({
    name: overrides.name ?? 'Test Account',
    industry: overrides.industry,
    revenue: overrides.revenue,
    parentAccountId: overrides.parentAccountId,
    ownerId: OWNER,
    tenantId: TENANT,
  }).value;
}

describe('AccountService — Hierarchy (PG-134)', () => {
  let accountRepo: InMemoryAccountRepository;
  let contactRepo: InMemoryContactRepository;
  let opportunityRepo: InMemoryOpportunityRepository;
  let eventBus: InMemoryEventBus;
  let service: AccountService;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    contactRepo = new InMemoryContactRepository();
    opportunityRepo = new InMemoryOpportunityRepository();
    eventBus = new InMemoryEventBus();
    service = new AccountService(accountRepo, contactRepo, opportunityRepo, eventBus);
  });

  // ─── getHierarchy ──────────────────────────────────────────────────

  describe('getHierarchy()', () => {
    it('should return a flat hierarchy for a root account', async () => {
      const account = createAccount({ name: 'Root Co' });
      await accountRepo.save(account);

      const result = await service.getHierarchy(account.id.value, TENANT);

      expect(result.isSuccess).toBe(true);
      expect(result.value.current.name).toBe('Root Co');
      expect(result.value.current.children).toHaveLength(0);
      expect(result.value.ancestors).toHaveLength(0);
      expect(result.value.rootAccount).toBeNull();
    });

    it('should include children in the hierarchy', async () => {
      const parent = createAccount({ name: 'Parent Co' });
      await accountRepo.save(parent);

      const child1 = createAccount({ name: 'Child 1', parentAccountId: parent.id.value });
      const child2 = createAccount({ name: 'Child 2', parentAccountId: parent.id.value });
      await accountRepo.save(child1);
      await accountRepo.save(child2);

      const result = await service.getHierarchy(parent.id.value, TENANT);

      expect(result.isSuccess).toBe(true);
      expect(result.value.current.children).toHaveLength(2);
      const childNames = result.value.current.children.map((c) => c.name).sort();
      expect(childNames).toEqual(['Child 1', 'Child 2']);
    });

    it('should return ancestor breadcrumbs', async () => {
      const grandparent = createAccount({ name: 'Grandparent' });
      await accountRepo.save(grandparent);

      const parent = createAccount({ name: 'Parent', parentAccountId: grandparent.id.value });
      await accountRepo.save(parent);

      const child = createAccount({ name: 'Child', parentAccountId: parent.id.value });
      await accountRepo.save(child);

      const result = await service.getHierarchy(child.id.value, TENANT);

      expect(result.isSuccess).toBe(true);
      expect(result.value.ancestors).toHaveLength(2);
      expect(result.value.ancestors[0].name).toBe('Grandparent');
      expect(result.value.ancestors[1].name).toBe('Parent');
      expect(result.value.rootAccount).not.toBeNull();
      // rootAccount is ancestorList[last] — the direct parent in the chain
      expect(result.value.rootAccount!.name).toBe('Parent');
    });

    it('should fail for non-existent account', async () => {
      const result = await service.getHierarchy('00000000-0000-0000-0000-000000000000', TENANT);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail for account from different tenant', async () => {
      const account = createAccount({ name: 'Other Tenant' });
      await accountRepo.save(account);

      const result = await service.getHierarchy(account.id.value, 'wrong-tenant');

      expect(result.isFailure).toBe(true);
    });

    it('should map revenue and industry to hierarchy nodes', async () => {
      const account = createAccount({ name: 'Rich Co', revenue: 5000000, industry: 'Technology' });
      await accountRepo.save(account);

      const result = await service.getHierarchy(account.id.value, TENANT);

      expect(result.value.current.revenue).toBe(5000000);
      expect(result.value.current.industry).toBe('Technology');
    });

    it('should handle deeply nested hierarchy', async () => {
      const accounts: Account[] = [];
      let previousId: string | undefined;

      for (let i = 0; i < 4; i++) {
        const account = createAccount({
          name: `Level ${i}`,
          parentAccountId: previousId,
        });
        await accountRepo.save(account);
        accounts.push(account);
        previousId = account.id.value;
      }

      // Query deepest account
      const result = await service.getHierarchy(accounts[3].id.value, TENANT);

      expect(result.isSuccess).toBe(true);
      expect(result.value.ancestors).toHaveLength(3);
    });
  });

  // ─── setParent ─────────────────────────────────────────────────────

  describe('setParent()', () => {
    it('should set a parent account', async () => {
      const parent = createAccount({ name: 'Parent' });
      const child = createAccount({ name: 'Child' });
      await accountRepo.save(parent);
      await accountRepo.save(child);

      const result = await service.setParent(child.id.value, parent.id.value, TENANT, OWNER);

      expect(result.isSuccess).toBe(true);
      expect(result.value.parentAccountId).toBe(parent.id.value);
    });

    it('should remove parent when null', async () => {
      const parent = createAccount({ name: 'Parent' });
      const child = createAccount({ name: 'Child', parentAccountId: parent.id.value });
      await accountRepo.save(parent);
      await accountRepo.save(child);

      const result = await service.setParent(child.id.value, null, TENANT, OWNER);

      expect(result.isSuccess).toBe(true);
      expect(result.value.parentAccountId).toBeUndefined();
    });

    it('should detect circular hierarchy (direct cycle)', async () => {
      const a = createAccount({ name: 'A' });
      const b = createAccount({ name: 'B', parentAccountId: a.id.value });
      await accountRepo.save(a);
      await accountRepo.save(b);

      // Try to set A's parent to B (B→A→B is a cycle)
      const result = await service.setParent(a.id.value, b.id.value, TENANT, OWNER);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Circular');
    });

    it('should detect self-referencing parent', async () => {
      const account = createAccount({ name: 'Self' });
      await accountRepo.save(account);

      const result = await service.setParent(account.id.value, account.id.value, TENANT, OWNER);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Circular');
    });

    it('should enforce max depth limit', async () => {
      // Build chain of 5 levels: L0 → L1 → L2 → L3 → L4
      const accounts: Account[] = [];
      let previousId: string | undefined;

      for (let i = 0; i < 5; i++) {
        const account = createAccount({
          name: `Level ${i}`,
          parentAccountId: previousId,
        });
        await accountRepo.save(account);
        accounts.push(account);
        previousId = account.id.value;
      }

      // Try to add level 6
      const newChild = createAccount({ name: 'Too Deep' });
      await accountRepo.save(newChild);

      const result = await service.setParent(newChild.id.value, accounts[4].id.value, TENANT, OWNER);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('depth');
    });

    it('should fail if account not found', async () => {
      const result = await service.setParent(
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000001',
        TENANT,
        OWNER
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail if parent not found', async () => {
      const child = createAccount({ name: 'Orphan' });
      await accountRepo.save(child);

      const result = await service.setParent(
        child.id.value,
        '00000000-0000-0000-0000-000000000000',
        TENANT,
        OWNER
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail if parent belongs to different tenant', async () => {
      const parent = Account.create({
        name: 'Other Tenant Parent',
        ownerId: OWNER,
        tenantId: 'other-tenant',
      }).value;
      const child = createAccount({ name: 'Child' });
      await accountRepo.save(parent);
      await accountRepo.save(child);

      const result = await service.setParent(child.id.value, parent.id.value, TENANT, OWNER);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('different tenant');
    });

    it('should publish domain events after setting parent', async () => {
      const parent = createAccount({ name: 'Parent' });
      const child = createAccount({ name: 'Child' });
      await accountRepo.save(parent);
      await accountRepo.save(child);

      eventBus.clearPublishedEvents();
      await service.setParent(child.id.value, parent.id.value, TENANT, OWNER);

      expect(eventBus.getPublishedEvents().length).toBeGreaterThan(0);
    });
  });

  // ─── getAccountContacts ────────────────────────────────────────────

  describe('getAccountContacts()', () => {
    it('should return contacts for an account', async () => {
      const account = createAccount({ name: 'With Contacts' });
      await accountRepo.save(account);

      const contact = Contact.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await contactRepo.save(contact);

      const result = await service.getAccountContacts(account.id.value, TENANT, { limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contacts).toHaveLength(1);
      expect(result.value.contacts[0].firstName).toBe('John');
      expect(result.value.contacts[0].lastName).toBe('Doe');
      expect(result.value.total).toBe(1);
    });

    it('should return empty list when no contacts', async () => {
      const account = createAccount({ name: 'No Contacts' });
      await accountRepo.save(account);

      const result = await service.getAccountContacts(account.id.value, TENANT, { limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contacts).toHaveLength(0);
      expect(result.value.total).toBe(0);
    });

    it('should fail if account not found', async () => {
      const result = await service.getAccountContacts(
        '00000000-0000-0000-0000-000000000000',
        TENANT,
        { limit: 20 }
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail for wrong tenant', async () => {
      const account = createAccount({ name: 'Tenant Check' });
      await accountRepo.save(account);

      const result = await service.getAccountContacts(account.id.value, 'wrong-tenant', { limit: 20 });

      expect(result.isFailure).toBe(true);
    });
  });

  // ─── getAccountOpportunities ───────────────────────────────────────

  describe('getAccountOpportunities()', () => {
    it('should return opportunities with summary', async () => {
      const account = createAccount({ name: 'With Opps' });
      await accountRepo.save(account);

      const opp = Opportunity.create({
        name: 'Big Deal',
        value: 100000,
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await opportunityRepo.save(opp);

      const result = await service.getAccountOpportunities(account.id.value, TENANT, { limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunities).toHaveLength(1);
      expect(result.value.opportunities[0].name).toBe('Big Deal');
      expect(result.value.opportunities[0].value).toBe(100000);
      expect(result.value.summary.totalValue).toBe(100000);
      expect(result.value.total).toBe(1);
    });

    it('should calculate weighted value from probability', async () => {
      const account = createAccount({ name: 'Weighted' });
      await accountRepo.save(account);

      const opp = Opportunity.create({
        name: 'Deal',
        value: 100000,
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await opportunityRepo.save(opp);

      const result = await service.getAccountOpportunities(account.id.value, TENANT, { limit: 20 });

      expect(result.value.summary.weightedValue).toBeGreaterThan(0);
    });

    it('should return empty list when no opportunities', async () => {
      const account = createAccount({ name: 'No Opps' });
      await accountRepo.save(account);

      const result = await service.getAccountOpportunities(account.id.value, TENANT, { limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunities).toHaveLength(0);
      expect(result.value.summary.totalValue).toBe(0);
    });

    it('should fail for wrong tenant', async () => {
      const account = createAccount({ name: 'Tenant Check' });
      await accountRepo.save(account);

      const result = await service.getAccountOpportunities(account.id.value, 'wrong-tenant', { limit: 20 });

      expect(result.isFailure).toBe(true);
    });

    it('should track stage breakdown', async () => {
      const account = createAccount({ name: 'Stages' });
      await accountRepo.save(account);

      const opp1 = Opportunity.create({
        name: 'Deal 1',
        value: 50000,
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      const opp2 = Opportunity.create({
        name: 'Deal 2',
        value: 75000,
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await opportunityRepo.save(opp1);
      await opportunityRepo.save(opp2);

      const result = await service.getAccountOpportunities(account.id.value, TENANT, { limit: 20 });

      expect(Object.keys(result.value.summary.stageBreakdown).length).toBeGreaterThan(0);
    });
  });

  // ─── getAccountActivity ────────────────────────────────────────────

  describe('getAccountActivity()', () => {
    it('should return activity feed from contacts and opportunities', async () => {
      const account = createAccount({ name: 'Active Account' });
      await accountRepo.save(account);

      const contact = Contact.create({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await contactRepo.save(contact);

      const opp = Opportunity.create({
        name: 'Activity Deal',
        value: 50000,
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await opportunityRepo.save(opp);

      const result = await service.getAccountActivity(account.id.value, TENANT, { limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.activities.length).toBeGreaterThanOrEqual(2);

      const types = result.value.activities.map((a) => a.entityType);
      expect(types).toContain('CONTACT');
      expect(types).toContain('OPPORTUNITY');
    });

    it('should return empty activity for account with no related entities', async () => {
      const account = createAccount({ name: 'Quiet Account' });
      await accountRepo.save(account);

      const result = await service.getAccountActivity(account.id.value, TENANT, { limit: 20 });

      expect(result.isSuccess).toBe(true);
      expect(result.value.activities).toHaveLength(0);
    });

    it('should fail for non-existent account', async () => {
      const result = await service.getAccountActivity(
        '00000000-0000-0000-0000-000000000000',
        TENANT,
        { limit: 20 }
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail for wrong tenant', async () => {
      const account = createAccount({ name: 'Tenant Activity' });
      await accountRepo.save(account);

      const result = await service.getAccountActivity(account.id.value, 'wrong-tenant', { limit: 20 });

      expect(result.isFailure).toBe(true);
    });

    it('should sort activities by date descending', async () => {
      const account = createAccount({ name: 'Sorted Activity' });
      await accountRepo.save(account);

      const contact1 = Contact.create({
        firstName: 'First',
        lastName: 'Contact',
        email: 'first@example.com',
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      const contact2 = Contact.create({
        firstName: 'Second',
        lastName: 'Contact',
        email: 'second@example.com',
        accountId: account.id.value,
        ownerId: OWNER,
      }).value;
      await contactRepo.save(contact1);
      await contactRepo.save(contact2);

      const result = await service.getAccountActivity(account.id.value, TENANT, { limit: 20 });

      if (result.value.activities.length >= 2) {
        const dates = result.value.activities.map((a) => a.createdAt.getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
        }
      }
    });
  });
});
