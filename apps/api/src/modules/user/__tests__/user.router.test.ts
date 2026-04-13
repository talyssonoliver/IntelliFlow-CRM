/**
 * User Router Tests
 *
 * Tests for getProfile and updateTimezone procedures.
 *
 * Task: IFC-191 — User Timezone Support
 */

import { describe, it, expect } from 'vitest';
import { userRouter } from '../user.router';
import {
  prismaMock,
  createTestContext,
  createPublicContext,
  TEST_UUIDS,
  mockUser,
} from '../../../test/setup';

describe('User Router', () => {
  const ctx = createTestContext();
  const caller = userRouter.createCaller(ctx);

  describe('getProfile', () => {
    it('returns profile with name, email, role, timezone for authenticated user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        name: 'Test User',
        email: 'test@example.com',
        role: 'USER',
        timezone: 'America/New_York',
      } as any);

      const result = await caller.getProfile();

      // Verify core fields (Phase 1 expansion adds avatarUrl, createdAt, etc.)
      expect(result).toMatchObject({
        name: 'Test User',
        email: 'test@example.com',
        role: 'USER',
        timezone: 'America/New_York',
      });
    });

    it('returns timezone UTC when user has default (null)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        name: 'Test',
        email: 'test@example.com',
        role: 'USER',
        timezone: null,
      } as any);

      const result = await caller.getProfile();

      expect(result.timezone).toBe('UTC');
    });

    it('throws UNAUTHORIZED without auth context', async () => {
      const publicCtx = createPublicContext();
      const publicCaller = userRouter.createCaller(publicCtx);

      await expect(publicCaller.getProfile()).rejects.toThrow();
    });

    it('throws NOT_FOUND when user does not exist in database', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(caller.getProfile()).rejects.toThrow('User not found');
    });

    it('throws UNAUTHORIZED when user context has no userId', async () => {
      const noUserIdCtx = createTestContext({
        user: { userId: '', email: 'a@b.com', role: 'USER', tenantId: 'tid' },
      });
      const noUserIdCaller = userRouter.createCaller(noUserIdCtx);

      await expect(noUserIdCaller.getProfile()).rejects.toThrow();
    });
  });

  describe('updateTimezone', () => {
    it('succeeds with America/New_York', async () => {
      prismaMock.user.update.mockResolvedValue({
        ...mockUser,
        timezone: 'America/New_York',
      } as any);

      const result = await caller.updateTimezone({ timezone: 'America/New_York' });

      expect(result.success).toBe(true);
      expect(result.timezone).toBe('America/New_York');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.user1 },
        data: { timezone: 'America/New_York' },
      });
    });

    it('succeeds with Asia/Kolkata', async () => {
      prismaMock.user.update.mockResolvedValue({
        ...mockUser,
        timezone: 'Asia/Kolkata',
      } as any);

      const result = await caller.updateTimezone({ timezone: 'Asia/Kolkata' });

      expect(result.success).toBe(true);
      expect(result.timezone).toBe('Asia/Kolkata');
    });

    it('rejects invalid timezone Foo/Bar with BAD_REQUEST', async () => {
      await expect(caller.updateTimezone({ timezone: 'Foo/Bar' })).rejects.toThrow();
    });

    it('throws UNAUTHORIZED without auth context', async () => {
      const publicCtx = createPublicContext();
      const publicCaller = userRouter.createCaller(publicCtx);

      await expect(publicCaller.updateTimezone({ timezone: 'UTC' })).rejects.toThrow();
    });

    it('throws UNAUTHORIZED when user context has no userId', async () => {
      const noUserIdCtx = createTestContext({
        user: { userId: '', email: 'a@b.com', role: 'USER', tenantId: 'tid' },
      });
      const noUserIdCaller = userRouter.createCaller(noUserIdCtx);

      await expect(noUserIdCaller.updateTimezone({ timezone: 'UTC' })).rejects.toThrow();
    });
  });

  describe('list (IFC-031 FU-005)', () => {
    it('returns users filtered by search term', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.user1,
          name: 'Alice Example',
          email: 'alice@example.com',
          givenName: 'Alice',
          familyName: 'Example',
          avatarUrl: null,
        },
      ] as any);

      const result = await caller.list({ search: 'alice', limit: 5 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0]).toMatchObject({
        id: TEST_UUIDS.user1,
        name: 'Alice Example',
        email: 'alice@example.com',
        avatarUrl: null,
      });
    });

    it('falls back to composed name or email when name is null', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.user2,
          name: null,
          email: 'bob@example.com',
          givenName: 'Bob',
          familyName: 'Tester',
          avatarUrl: null,
        },
      ] as any);

      const result = await caller.list({ limit: 5 });

      expect(result.users[0].name).toBe('Bob Tester');
    });

    it('throws UNAUTHORIZED without auth context', async () => {
      const publicCtx = createPublicContext();
      const publicCaller = userRouter.createCaller(publicCtx);

      await expect(publicCaller.list({ limit: 5 })).rejects.toThrow();
    });
  });
});
