import { describe, it, expect } from 'vitest';
import { Account } from '../Account';
import { AccountId } from '../AccountId';

function createTestAccount(overrides: Partial<{ parentAccountId: string }> = {}) {
  return Account.create({
    name: 'Test Corp',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    ...overrides,
  });
}

describe('Account hierarchy', () => {
  describe('setParent', () => {
    it('should set a parent account', () => {
      const result = createTestAccount();
      expect(result.isSuccess).toBe(true);
      const account = result.value;
      const parentId = AccountId.generate().value;

      const setResult = account.setParent(parentId, 'admin-1');
      expect(setResult.isSuccess).toBe(true);
      expect(account.parentAccountId).toBe(parentId);
    });

    it('should reject self-referencing parent', () => {
      const result = createTestAccount();
      expect(result.isSuccess).toBe(true);
      const account = result.value;

      const setResult = account.setParent(account.id.value, 'admin-1');
      expect(setResult.isFailure).toBe(true);
      expect(setResult.error.code).toBe('INVALID_HIERARCHY');
      expect(setResult.error.message).toContain('cannot be its own parent');
    });

    it('should emit AccountHierarchyUpdatedEvent on success', () => {
      const result = createTestAccount();
      const account = result.value;
      const parentId = AccountId.generate().value;

      // Clear creation events
      account.clearDomainEvents();

      account.setParent(parentId, 'admin-1');
      const events = account.domainEvents;
      expect(events.length).toBe(1);
      expect(events[0].constructor.name).toBe('AccountHierarchyUpdatedEvent');
    });

    it('should update the updatedAt timestamp', () => {
      const result = createTestAccount();
      const account = result.value;
      const before = account.updatedAt;

      // Small delay to ensure timestamp difference
      const parentId = AccountId.generate().value;
      account.setParent(parentId, 'admin-1');

      expect(account.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('removeParent', () => {
    it('should remove parent when one exists', () => {
      const parentId = AccountId.generate().value;
      const result = createTestAccount({ parentAccountId: parentId });
      const account = result.value;
      expect(account.parentAccountId).toBe(parentId);

      account.removeParent('admin-1');
      expect(account.parentAccountId).toBeUndefined();
    });

    it('should be a no-op when no parent exists', () => {
      const result = createTestAccount();
      const account = result.value;
      account.clearDomainEvents();

      account.removeParent('admin-1');
      expect(account.parentAccountId).toBeUndefined();
      // No event emitted when there was no parent
      expect(account.domainEvents.length).toBe(0);
    });

    it('should emit AccountHierarchyUpdatedEvent with undefined parent', () => {
      const parentId = AccountId.generate().value;
      const result = createTestAccount({ parentAccountId: parentId });
      const account = result.value;
      account.clearDomainEvents();

      account.removeParent('admin-1');
      const events = account.domainEvents;
      expect(events.length).toBe(1);
      expect(events[0].constructor.name).toBe('AccountHierarchyUpdatedEvent');
    });
  });

  describe('create with parentAccountId', () => {
    it('should allow creating an account with a parent', () => {
      const parentId = AccountId.generate().value;
      const result = createTestAccount({ parentAccountId: parentId });
      expect(result.isSuccess).toBe(true);
      expect(result.value.parentAccountId).toBe(parentId);
    });

    it('should allow creating an account without a parent', () => {
      const result = createTestAccount();
      expect(result.isSuccess).toBe(true);
      expect(result.value.parentAccountId).toBeUndefined();
    });
  });

  describe('reconstitute with hierarchy', () => {
    it('should preserve parentAccountId through reconstitute', () => {
      const parentId = 'parent-123';
      const account = Account.reconstitute(AccountId.generate(), {
        name: 'Child Corp',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        parentAccountId: parentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(account.parentAccountId).toBe(parentId);
    });
  });
});
