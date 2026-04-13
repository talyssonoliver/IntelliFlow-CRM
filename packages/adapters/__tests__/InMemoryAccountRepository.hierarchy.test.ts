/**
 * InMemoryAccountRepository Hierarchy Tests (PG-134)
 *
 * Tests for hierarchy methods: findWithChildren, findAncestors, getHierarchyDepth
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryAccountRepository } from '../src/repositories/InMemoryAccountRepository';
import { Account, AccountId } from '@intelliflow/domain';

const TENANT = 'tenant-001';
const OWNER = 'owner-001';

function createAccount(overrides: {
  name: string;
  parentAccountId?: string;
  industry?: string;
  revenue?: number;
}): Account {
  return Account.create({
    name: overrides.name,
    industry: overrides.industry,
    revenue: overrides.revenue,
    parentAccountId: overrides.parentAccountId,
    ownerId: OWNER,
    tenantId: TENANT,
  }).value;
}

describe('InMemoryAccountRepository — Hierarchy (PG-134)', () => {
  let repository: InMemoryAccountRepository;

  beforeEach(() => {
    repository = new InMemoryAccountRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 7, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── findWithChildren ──────────────────────────────────────────────

  describe('findWithChildren()', () => {
    it('should return null for non-existent account', async () => {
      const result = await repository.findWithChildren(AccountId.generate(), 5, TENANT);
      expect(result).toBeNull();
    });

    it('should return node with empty children for leaf account', async () => {
      const account = createAccount({ name: 'Leaf' });
      await repository.save(account);

      const result = await repository.findWithChildren(account.id, 5, TENANT);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(account.id.value);
      expect(result!.name).toBe('Leaf');
      expect(result!.childAccounts).toHaveLength(0);
      expect(result!._count).toEqual({ contacts: 0, opportunities: 0 });
    });

    it('should include direct children', async () => {
      const parent = createAccount({ name: 'Parent' });
      await repository.save(parent);

      const child1 = createAccount({ name: 'Child A', parentAccountId: parent.id.value });
      const child2 = createAccount({ name: 'Child B', parentAccountId: parent.id.value });
      await repository.save(child1);
      await repository.save(child2);

      const result = await repository.findWithChildren(parent.id, 5, TENANT);

      expect(result!.childAccounts).toHaveLength(2);
      const names = result!.childAccounts!.map((c) => c.name).sort();
      expect(names).toEqual(['Child A', 'Child B']);
    });

    it('should include nested grandchildren', async () => {
      const root = createAccount({ name: 'Root' });
      await repository.save(root);

      const child = createAccount({ name: 'Child', parentAccountId: root.id.value });
      await repository.save(child);

      const grandchild = createAccount({ name: 'Grandchild', parentAccountId: child.id.value });
      await repository.save(grandchild);

      const result = await repository.findWithChildren(root.id, 5, TENANT);

      expect(result!.childAccounts).toHaveLength(1);
      expect(result!.childAccounts![0].name).toBe('Child');
      expect(result!.childAccounts![0].childAccounts).toHaveLength(1);
      expect(result!.childAccounts![0].childAccounts![0].name).toBe('Grandchild');
    });

    it('should respect maxDepth limit', async () => {
      const root = createAccount({ name: 'Root' });
      await repository.save(root);

      const child = createAccount({ name: 'Child', parentAccountId: root.id.value });
      await repository.save(child);

      const grandchild = createAccount({ name: 'Grandchild', parentAccountId: child.id.value });
      await repository.save(grandchild);

      // maxDepth=1: only root + immediate children
      const result = await repository.findWithChildren(root.id, 1, TENANT);

      expect(result!.childAccounts).toHaveLength(1);
      expect(result!.childAccounts![0].name).toBe('Child');
      // Grandchild should not be included (depth exhausted)
      expect(result!.childAccounts![0].childAccounts).toHaveLength(0);
    });

    it('should map industry and revenue', async () => {
      const account = createAccount({ name: 'Rich', industry: 'Finance', revenue: 10000000 });
      await repository.save(account);

      const result = await repository.findWithChildren(account.id, 5, TENANT);

      expect(result!.industry).toBe('Finance');
      expect(result!.revenue).toBe(10000000);
    });

    it('should set null for missing industry and revenue', async () => {
      const account = createAccount({ name: 'Minimal' });
      await repository.save(account);

      const result = await repository.findWithChildren(account.id, 5, TENANT);

      expect(result!.industry).toBeNull();
      expect(result!.revenue).toBeNull();
    });

    it('should include tenantId in the record', async () => {
      const account = createAccount({ name: 'Tenant Check' });
      await repository.save(account);

      const result = await repository.findWithChildren(account.id, 5, TENANT);

      expect(result!.tenantId).toBe(TENANT);
    });
  });

  // ─── findAncestors ─────────────────────────────────────────────────

  describe('findAncestors()', () => {
    it('should return empty array for root account', async () => {
      const root = createAccount({ name: 'Root' });
      await repository.save(root);

      const ancestors = await repository.findAncestors(root.id, TENANT);

      expect(ancestors).toHaveLength(0);
    });

    it('should return parent for child account', async () => {
      const parent = createAccount({ name: 'Parent' });
      await repository.save(parent);

      const child = createAccount({ name: 'Child', parentAccountId: parent.id.value });
      await repository.save(child);

      const ancestors = await repository.findAncestors(child.id, TENANT);

      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].name).toBe('Parent');
    });

    it('should return full ancestor chain in order', async () => {
      const grandparent = createAccount({ name: 'Grandparent' });
      await repository.save(grandparent);

      const parent = createAccount({ name: 'Parent', parentAccountId: grandparent.id.value });
      await repository.save(parent);

      const child = createAccount({ name: 'Child', parentAccountId: parent.id.value });
      await repository.save(child);

      const ancestors = await repository.findAncestors(child.id, TENANT);

      expect(ancestors).toHaveLength(2);
      // Should be ordered root-to-leaf: [Grandparent, Parent]
      expect(ancestors[0].name).toBe('Grandparent');
      expect(ancestors[1].name).toBe('Parent');
    });

    it('should return empty for non-existent account', async () => {
      const ancestors = await repository.findAncestors(AccountId.generate(), TENANT);

      expect(ancestors).toHaveLength(0);
    });

    it('should handle broken chain (parent not in repo)', async () => {
      const child = createAccount({
        name: 'Orphan',
        parentAccountId: '00000000-0000-0000-0000-000000000099',
      });
      await repository.save(child);

      const ancestors = await repository.findAncestors(child.id, TENANT);

      expect(ancestors).toHaveLength(0);
    });
  });

  // ─── getHierarchyDepth ─────────────────────────────────────────────

  describe('getHierarchyDepth()', () => {
    it('should return 0 for root account', async () => {
      const root = createAccount({ name: 'Root' });
      await repository.save(root);

      const depth = await repository.getHierarchyDepth(root.id, TENANT);

      expect(depth).toBe(0);
    });

    it('should return 1 for child of root', async () => {
      const root = createAccount({ name: 'Root' });
      await repository.save(root);

      const child = createAccount({ name: 'Child', parentAccountId: root.id.value });
      await repository.save(child);

      const depth = await repository.getHierarchyDepth(child.id, TENANT);

      expect(depth).toBe(1);
    });

    it('should return correct depth for deep nesting', async () => {
      const accounts: Account[] = [];
      let previousId: string | undefined;

      for (let i = 0; i < 4; i++) {
        const account = createAccount({ name: `Level ${i}`, parentAccountId: previousId });
        await repository.save(account);
        accounts.push(account);
        previousId = account.id.value;
      }

      const depth = await repository.getHierarchyDepth(accounts[3].id, TENANT);

      expect(depth).toBe(3);
    });

    it('should return 0 for non-existent account', async () => {
      const depth = await repository.getHierarchyDepth(AccountId.generate(), TENANT);

      expect(depth).toBe(0);
    });
  });
});
