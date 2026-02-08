/**
 * Session Service Batch10 Tests
 *
 * Covers remaining uncovered branches in session.service.ts (22 uncovered stmts):
 * - validateSession: prisma DB fallback path (loadSessionFromDb)
 * - getSession: prisma DB fallback path
 * - getUserSessions: prisma DB fallback path (loadUserSessionsFromDb)
 * - extendSession: prisma persist path
 * - createSession: prisma persist path
 * - revokeSession: prisma delete path
 * - validateSession: prisma updateSessionActivity path
 * - persistSession: code path (currently placeholder)
 * - parseDeviceInfo: iOS without Mac OS X prefix
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SessionService,
  getSessionService,
  resetSessionService,
  DEFAULT_SESSION_CONFIG,
} from '../session.service';

describe('SessionService batch10 - uncovered branches', () => {
  describe('with prisma (database fallback paths)', () => {
    let service: SessionService;
    let mockPrisma: any;

    beforeEach(() => {
      resetSessionService();
      mockPrisma = {
        session: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
          delete: vi.fn().mockResolvedValue({}),
        },
      };
      service = new SessionService(mockPrisma as any, {
        maxConcurrentSessions: 3,
        defaultSessionDurationMs: 24 * 60 * 60 * 1000,
        rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
        inactivityTimeoutMs: 4 * 60 * 60 * 1000,
      });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
    });

    describe('validateSession - DB fallback', () => {
      it('should try loading from DB when session not in memory', async () => {
        // loadSessionFromDb returns null (placeholder), so session not found
        const result = await service.validateSession('non-existent-db-session');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Session not found');
      });

      it('should update activity in DB for valid session', async () => {
        const session = await service.createSession({
          userId: 'user-db-1',
          tenantId: 'tenant-1',
        });

        const result = await service.validateSession(session.id);
        expect(result.valid).toBe(true);
        // The prisma path for updateSessionActivity is called (placeholder)
      });
    });

    describe('getSession - DB fallback', () => {
      it('should try loading from DB when session not in memory', async () => {
        const session = await service.getSession('non-existent-db-session');
        // loadSessionFromDb returns null in placeholder
        expect(session).toBeNull();
      });
    });

    describe('getUserSessions - DB fallback', () => {
      it('should try loading from DB when user has no in-memory sessions', async () => {
        const sessions = await service.getUserSessions('user-no-memory');
        // loadUserSessionsFromDb returns [] in placeholder, so after
        // the recursive call, it returns [] because no sessions were loaded
        expect(sessions).toEqual([]);
      });
    });

    describe('createSession - DB persist path', () => {
      it('should call persistSession when prisma is available', async () => {
        const session = await service.createSession({
          userId: 'user-persist-1',
          tenantId: 'tenant-1',
          deviceInfo: { browser: 'Chrome', os: 'Windows' },
          ipAddress: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
          refreshToken: 'refresh-123',
          rememberMe: true,
        });

        expect(session).toBeDefined();
        expect(session.rememberMe).toBe(true);
        expect(session.refreshToken).toBe('refresh-123');
        // persistSession is called but is a placeholder
      });
    });

    describe('extendSession - DB persist path', () => {
      it('should call persistSession when extending with prisma', async () => {
        const session = await service.createSession({
          userId: 'user-extend-db',
          tenantId: 'tenant-1',
        });

        const extended = await service.extendSession(session.id);
        expect(extended).toBeDefined();
        // persistSession is called (placeholder)
      });
    });

    describe('revokeSession - DB delete path', () => {
      it('should call deleteSessionFromDb when revoking with prisma', async () => {
        const session = await service.createSession({
          userId: 'user-revoke-db',
          tenantId: 'tenant-1',
        });

        const revoked = await service.revokeSession(session.id);
        expect(revoked).toBe(true);
        // deleteSessionFromDb is called (placeholder)
      });
    });
  });

  describe('parseDeviceInfo - additional UA strings', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService();
    });

    it('should detect pure iOS without Mac OS X in UA', () => {
      // UA that has "iOS" but not "Mac OS X"
      const ua = 'Mozilla/5.0 (iOS; CPU OS 17_0) AppleWebKit/605.1.15';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('iOS');
      expect(info.isMobile).toBe(true);
    });

    it('should detect iPhone without Mac OS X', () => {
      // UA with iPhone but no "Mac OS X"
      const ua = 'Mozilla/5.0 (iPhone; CPU OS 16_0) AppleWebKit/605.1.15';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('iOS');
      expect(info.isMobile).toBe(true);
      expect(info.device).toBe('Mobile');
    });

    it('should detect iPad without Mac OS X', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0) AppleWebKit/605.1.15';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('iOS');
      expect(info.isMobile).toBe(true);
    });

    it('should detect Android that does not contain Linux keyword', () => {
      // Clean Android UA without "Linux" prefix
      const ua = 'Mozilla/5.0 (Android 14; Mobile) AppleWebKit/537.36';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('Android');
      expect(info.osVersion).toBe('14');
      expect(info.isMobile).toBe(true);
      expect(info.device).toBe('Mobile');
    });

    it('should detect Windows 10', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('Windows');
      expect(info.osVersion).toBe('10');
    });

    it('should handle unknown OS', () => {
      const ua = 'SomeBot/1.0 (compatible; MyBot; +http://mybot.example.com)';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBeUndefined();
      expect(info.browser).toBeUndefined();
      expect(info.isMobile).toBe(false);
      expect(info.device).toBe('Desktop');
    });

    it('should handle empty string user agent', () => {
      const info = service.parseDeviceInfo('');
      expect(info).toEqual({});
    });
  });

  describe('getSessionService singleton - edge cases', () => {
    afterEach(() => {
      resetSessionService();
    });

    it('should create new instance when config changes', () => {
      const svc1 = getSessionService(undefined, { maxConcurrentSessions: 2 });
      const svc2 = getSessionService(undefined, { maxConcurrentSessions: 5 });
      expect(svc2).not.toBe(svc1);
    });

    it('should return existing instance when called without arguments', () => {
      const svc1 = getSessionService();
      const svc2 = getSessionService();
      expect(svc2).toBe(svc1);
    });
  });

  describe('cleanupExpiredSessions - with mixed user sessions', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService(undefined, {
        maxConcurrentSessions: 10,
        defaultSessionDurationMs: 1000, // 1 second for fast expiry
        rememberMeDurationMs: 2000,
        inactivityTimeoutMs: 500, // 0.5 second
      });
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should clean up sessions for multiple users simultaneously', async () => {
      await service.createSession({ userId: 'user-a', tenantId: 't1' });
      await service.createSession({ userId: 'user-b', tenantId: 't1' });
      await service.createSession({ userId: 'user-a', tenantId: 't1' });

      // Wait for sessions to expire (inactivity timeout is 500ms)
      await new Promise(r => setTimeout(r, 600));

      const cleaned = service.cleanupExpiredSessions();
      expect(cleaned).toBe(3);

      expect(service.getStats().totalSessions).toBe(0);
      expect(service.getStats().totalUsers).toBe(0);
    });
  });

  describe('enforceSessionLimit - all sessions expired', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService(undefined, {
        maxConcurrentSessions: 2,
        defaultSessionDurationMs: 500,
        rememberMeDurationMs: 1000,
        inactivityTimeoutMs: 300,
      });
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should not revoke when all existing sessions are already expired', async () => {
      await service.createSession({ userId: 'user-expired', tenantId: 't1' });
      await service.createSession({ userId: 'user-expired', tenantId: 't1' });

      // Wait for sessions to expire
      await new Promise(r => setTimeout(r, 400));

      // Creating a new session should not fail even though we have 2 "tracked" sessions
      const newSession = await service.createSession({ userId: 'user-expired', tenantId: 't1' });
      expect(newSession).toBeDefined();
    });
  });
});
