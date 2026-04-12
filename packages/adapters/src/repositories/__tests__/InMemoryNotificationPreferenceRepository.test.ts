/**
 * InMemoryNotificationPreferenceRepository Tests
 *
 * Tests the in-memory implementation of the NotificationPreferenceRepository interface.
 * Coverage target: >90% for repository layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNotificationPreferenceRepository } from '../InMemoryNotificationPreferenceRepository';
import { NotificationPreference } from '@intelliflow/domain';

describe('InMemoryNotificationPreferenceRepository', () => {
  let repo: InMemoryNotificationPreferenceRepository;

  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';

  beforeEach(() => {
    repo = new InMemoryNotificationPreferenceRepository();
  });

  // ==========================================================
  // save() & findByUserId()
  // ==========================================================
  describe('save() and findByUserId()', () => {
    it('should save and retrieve a preference', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, USER_ID);
      await repo.save(pref);

      const found = await repo.findByUserId(TENANT_ID, USER_ID);
      expect(found).not.toBeNull();
      expect(found!.userId).toBe(USER_ID);
      expect(found!.tenantId).toBe(TENANT_ID);
    });

    it('should return null for non-existent preference', async () => {
      const found = await repo.findByUserId(TENANT_ID, 'no-user');
      expect(found).toBeNull();
    });

    it('should overwrite existing preference on re-save', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, USER_ID);
      await repo.save(pref);

      pref.setDoNotDisturb(true);
      await repo.save(pref);

      const found = await repo.findByUserId(TENANT_ID, USER_ID);
      expect(found!.doNotDisturb).toBe(true);
    });

    it('should use composite key of tenantId:userId', async () => {
      const pref1 = NotificationPreference.createDefault('t1', 'u1');
      const pref2 = NotificationPreference.createDefault('t2', 'u1');

      await repo.save(pref1);
      await repo.save(pref2);

      const found1 = await repo.findByUserId('t1', 'u1');
      const found2 = await repo.findByUserId('t2', 'u1');

      expect(found1).not.toBeNull();
      expect(found2).not.toBeNull();
      expect(found1!.tenantId).toBe('t1');
      expect(found2!.tenantId).toBe('t2');
    });
  });

  // ==========================================================
  // findOrCreateDefault()
  // ==========================================================
  describe('findOrCreateDefault()', () => {
    it('should return existing preference if found', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, USER_ID);
      pref.setDoNotDisturb(true);
      await repo.save(pref);

      const found = await repo.findOrCreateDefault(TENANT_ID, USER_ID);
      expect(found.doNotDisturb).toBe(true);
    });

    it('should create default preference if not found', async () => {
      const pref = await repo.findOrCreateDefault(TENANT_ID, 'new-user');
      expect(pref).not.toBeNull();
      expect(pref.userId).toBe('new-user');
      expect(pref.tenantId).toBe(TENANT_ID);
      expect(pref.doNotDisturb).toBe(false);
    });

    it('should persist the newly created default', async () => {
      await repo.findOrCreateDefault(TENANT_ID, 'new-user');

      const found = await repo.findByUserId(TENANT_ID, 'new-user');
      expect(found).not.toBeNull();
    });
  });

  // ==========================================================
  // delete()
  // ==========================================================
  describe('delete()', () => {
    it('should remove the preference', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, USER_ID);
      await repo.save(pref);

      await repo.delete(TENANT_ID, USER_ID);

      const found = await repo.findByUserId(TENANT_ID, USER_ID);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent preference', async () => {
      await expect(repo.delete(TENANT_ID, 'ghost')).resolves.toBeUndefined();
    });
  });

  // ==========================================================
  // exists()
  // ==========================================================
  describe('exists()', () => {
    it('should return true when preference exists', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, USER_ID);
      await repo.save(pref);

      expect(await repo.exists(TENANT_ID, USER_ID)).toBe(true);
    });

    it('should return false when preference does not exist', async () => {
      expect(await repo.exists(TENANT_ID, 'nope')).toBe(false);
    });
  });

  // ==========================================================
  // findUsersWithChannelEnabled()
  // ==========================================================
  describe('findUsersWithChannelEnabled()', () => {
    it('should return user IDs with the specified channel enabled', async () => {
      const pref1 = NotificationPreference.createDefault(TENANT_ID, 'u1');
      // in_app and email are enabled by default
      await repo.save(pref1);

      const pref2 = NotificationPreference.createDefault(TENANT_ID, 'u2');
      pref2.setChannelEnabled('in_app', false);
      await repo.save(pref2);

      const result = await repo.findUsersWithChannelEnabled(TENANT_ID, 'in_app');
      expect(result).toContain('u1');
      expect(result).not.toContain('u2');
    });

    it('should return empty array when no users have the channel enabled', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, 'u1');
      // sms is disabled by default
      await repo.save(pref);

      const result = await repo.findUsersWithChannelEnabled(TENANT_ID, 'sms');
      expect(result).toEqual([]);
    });

    it('should scope by tenantId', async () => {
      const pref1 = NotificationPreference.createDefault(TENANT_ID, 'u1');
      await repo.save(pref1);

      const pref2 = NotificationPreference.createDefault('other-tenant', 'u2');
      await repo.save(pref2);

      const result = await repo.findUsersWithChannelEnabled(TENANT_ID, 'in_app');
      expect(result).toEqual(['u1']);
    });
  });

  // ==========================================================
  // bulkUpdate()
  // ==========================================================
  describe('bulkUpdate()', () => {
    it('should update doNotDisturb for multiple users', async () => {
      const pref1 = NotificationPreference.createDefault(TENANT_ID, 'bu-1');
      const pref2 = NotificationPreference.createDefault(TENANT_ID, 'bu-2');
      await repo.save(pref1);
      await repo.save(pref2);

      const count = await repo.bulkUpdate(TENANT_ID, ['bu-1', 'bu-2'], {
        doNotDisturb: true,
      });
      expect(count).toBe(2);

      const found1 = await repo.findByUserId(TENANT_ID, 'bu-1');
      expect(found1!.doNotDisturb).toBe(true);

      const found2 = await repo.findByUserId(TENANT_ID, 'bu-2');
      expect(found2!.doNotDisturb).toBe(true);
    });

    it('should update quietHoursEnabled for multiple users', async () => {
      const pref1 = NotificationPreference.createDefault(TENANT_ID, 'qh-1');
      await repo.save(pref1);

      const count = await repo.bulkUpdate(TENANT_ID, ['qh-1'], {
        quietHoursEnabled: false,
      });
      expect(count).toBe(1);

      const found = await repo.findByUserId(TENANT_ID, 'qh-1');
      expect(found!.quietHoursEnabled).toBe(false);
    });

    it('should update both fields simultaneously', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, 'both-1');
      await repo.save(pref);

      const count = await repo.bulkUpdate(TENANT_ID, ['both-1'], {
        doNotDisturb: true,
        quietHoursEnabled: false,
      });
      expect(count).toBe(1);

      const found = await repo.findByUserId(TENANT_ID, 'both-1');
      expect(found!.doNotDisturb).toBe(true);
      expect(found!.quietHoursEnabled).toBe(false);
    });

    it('should skip users that do not exist', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, 'exists-1');
      await repo.save(pref);

      const count = await repo.bulkUpdate(TENANT_ID, ['exists-1', 'ghost-1'], {
        doNotDisturb: true,
      });
      expect(count).toBe(1);
    });

    it('should return 0 when no matching users found', async () => {
      const count = await repo.bulkUpdate(TENANT_ID, ['ghost-1', 'ghost-2'], {
        doNotDisturb: true,
      });
      expect(count).toBe(0);
    });

    it('should handle empty user list', async () => {
      const count = await repo.bulkUpdate(TENANT_ID, [], { doNotDisturb: true });
      expect(count).toBe(0);
    });
  });

  // ==========================================================
  // Test helper methods
  // ==========================================================
  describe('test helpers', () => {
    it('clear() should empty the repository', async () => {
      const pref = NotificationPreference.createDefault(TENANT_ID, USER_ID);
      await repo.save(pref);
      expect(repo.count()).toBe(1);

      repo.clear();
      expect(repo.count()).toBe(0);
    });

    it('getAll() should return all preferences', async () => {
      await repo.save(NotificationPreference.createDefault(TENANT_ID, 'u1'));
      await repo.save(NotificationPreference.createDefault(TENANT_ID, 'u2'));

      const all = repo.getAll();
      expect(all.length).toBe(2);
    });

    it('count() should return the number of stored preferences', async () => {
      expect(repo.count()).toBe(0);
      await repo.save(NotificationPreference.createDefault(TENANT_ID, USER_ID));
      expect(repo.count()).toBe(1);
    });
  });
});
