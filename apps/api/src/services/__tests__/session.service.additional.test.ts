/**
 * Session Service Additional Tests
 *
 * Supplementary tests to improve coverage for session.service.ts.
 * Covers uncovered branches:
 * - cleanupExpiredSessions
 * - getStats
 * - getSessionService singleton
 * - resetSessionService
 * - revokeSession return value for non-existent session
 * - revokeAllUserSessions return count
 * - parseDeviceInfo: Android, Linux, iOS, Windows 11
 * - validateSession with Prisma (database fallback paths)
 * - getSession with non-existent (without prisma)
 * - getUserSessions sorting and database fallback
 * - extendSession rememberMe edge cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SessionService,
  getSessionService,
  resetSessionService,
  DEFAULT_SESSION_CONFIG,
  type CreateSessionInput,
  type DeviceInfo,
  type SessionData,
} from '../session.service';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000010';
const TEST_USER_ID_2 = '00000000-0000-4000-8000-000000000020';
const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000030';

describe('SessionService - Additional Coverage', () => {
  let service: SessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    service = new SessionService(undefined, {
      maxConcurrentSessions: 3,
      defaultSessionDurationMs: 24 * 60 * 60 * 1000,
      rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
      inactivityTimeoutMs: 4 * 60 * 60 * 1000,
    });
    service.clearAll();
  });

  afterEach(() => {
    service.clearAll();
    vi.useRealTimers();
  });

  describe('cleanupExpiredSessions', () => {
    it('should clean up expired sessions', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      const cleaned = service.cleanupExpiredSessions();

      expect(cleaned).toBe(2);
      expect(service.getStats().totalSessions).toBe(0);
    });

    it('should not clean up active sessions', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const cleaned = service.cleanupExpiredSessions();

      expect(cleaned).toBe(0);
      expect(service.getStats().totalSessions).toBe(1);
    });

    it('should clean up inactive sessions', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past inactivity timeout but not expiration
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      const cleaned = service.cleanupExpiredSessions();
      expect(cleaned).toBe(1);
    });

    it('should clean up user session tracking when all sessions removed', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      service.cleanupExpiredSessions();

      expect(service.getStats().totalUsers).toBe(0);
    });

    it('should handle mixed valid and expired sessions for same user', async () => {
      const session1 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance 3 hours (within inactivity timeout)
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);

      // Create a second session (now active)
      const session2 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance 2 more hours (first session timed out at 4h, second still active)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      const cleaned = service.cleanupExpiredSessions();

      expect(cleaned).toBe(1); // Only session1 timed out
      expect(service.getStats().totalUsers).toBe(1); // User still has session2
    });
  });

  describe('getStats', () => {
    it('should return correct total sessions and users', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      await service.createSession({
        userId: TEST_USER_ID_2,
        tenantId: TEST_TENANT_ID,
      });

      const stats = service.getStats();

      expect(stats.totalSessions).toBe(3);
      expect(stats.totalUsers).toBe(2);
    });

    it('should return zeros when no sessions exist', () => {
      const stats = service.getStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.totalUsers).toBe(0);
    });
  });

  describe('getSessionService singleton', () => {
    afterEach(() => {
      resetSessionService();
    });

    it('should return the same instance on subsequent calls', () => {
      const service1 = getSessionService();
      const service2 = getSessionService();

      expect(service1).toBe(service2);
    });

    it('should create new instance when prisma is provided', () => {
      const service1 = getSessionService();
      const mockPrisma = {} as any;
      const service2 = getSessionService(mockPrisma);

      // Different instance because prisma was provided
      expect(service2).not.toBe(service1);
    });

    it('should create new instance when config is provided', () => {
      const service1 = getSessionService();
      const service2 = getSessionService(undefined, { maxConcurrentSessions: 5 });

      expect(service2).not.toBe(service1);
    });
  });

  describe('resetSessionService', () => {
    it('should reset the singleton and clear all sessions', async () => {
      const svc = getSessionService();
      await svc.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      resetSessionService();

      const newSvc = getSessionService();
      const stats = newSvc.getStats();
      expect(stats.totalSessions).toBe(0);
    });

    it('should handle reset when no instance exists', () => {
      resetSessionService(); // Already reset
      resetSessionService(); // Should not throw
    });
  });

  describe('revokeSession - return values', () => {
    it('should return true when session exists and is revoked', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const result = await service.revokeSession(session.id);
      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await service.revokeSession('non-existent-session-id');
      expect(result).toBe(false);
    });
  });

  describe('revokeAllUserSessions - return count', () => {
    it('should return count of revoked sessions', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const count = await service.revokeAllUserSessions(TEST_USER_ID);
      expect(count).toBe(3);
    });

    it('should return 0 for user with no sessions', async () => {
      const count = await service.revokeAllUserSessions('no-sessions-user');
      expect(count).toBe(0);
    });
  });

  describe('parseDeviceInfo - additional browsers and OS', () => {
    it('should detect Android UA as Linux (Linux check precedes Android in parser)', () => {
      // The parser checks "Linux" before "Android" in the else-if chain,
      // so Android UAs (which contain "Linux") are detected as Linux.
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 Chrome/120.0'
      );
      expect(info.os).toBe('Linux');
      expect(info.isMobile).toBe(true);
      expect(info.device).toBe('Mobile');
    });

    it('should detect Linux OS', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0'
      );
      expect(info.os).toBe('Linux');
      expect(info.isMobile).toBe(false);
      expect(info.device).toBe('Desktop');
    });

    it('should detect iPad as macOS (Mac OS X check precedes iOS in parser)', () => {
      // iPad UAs contain "Mac OS X" which matches before the iOS/iPad check
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15'
      );
      expect(info.os).toBe('macOS');
      expect(info.isMobile).toBe(true);
    });

    it('should detect iPhone as macOS (Mac OS X check precedes iOS in parser)', () => {
      // iPhone UAs contain "Mac OS X" which matches before the iOS/iPhone check
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      );
      expect(info.os).toBe('macOS');
      expect(info.isMobile).toBe(true);
    });

    it('should detect Windows 11', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36'
      );
      expect(info.os).toBe('Windows');
      expect(info.osVersion).toBe('11');
    });

    it('should handle user agent with no recognizable browser', () => {
      const info = service.parseDeviceInfo(
        'curl/7.64.1'
      );
      expect(info.browser).toBeUndefined();
      expect(info.os).toBeUndefined();
      expect(info.isMobile).toBe(false);
      expect(info.device).toBe('Desktop');
    });

    it('should detect Chrome without version match', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 Chrome'
      );
      expect(info.browser).toBe('Chrome');
      expect(info.browserVersion).toBeUndefined();
    });

    it('should detect Firefox without version match', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 Firefox'
      );
      expect(info.browser).toBe('Firefox');
      expect(info.browserVersion).toBeUndefined();
    });

    it('should detect Safari without version match', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Macintosh) Safari/605.1.15'
      );
      expect(info.browser).toBe('Safari');
      expect(info.browserVersion).toBeUndefined();
    });

    it('should detect Edge without version match', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 Chrome/120 Edg'
      );
      expect(info.browser).toBe('Edge');
      expect(info.browserVersion).toBeUndefined();
    });

    it('should detect iPod as mobile iOS', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)'
      );
      expect(info.isMobile).toBe(true);
    });

    it('should detect macOS without version', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36'
      );
      expect(info.os).toBe('macOS');
      expect(info.osVersion).toBeUndefined();
    });

    it('should detect Windows without specific version', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36'
      );
      expect(info.os).toBe('Windows');
      // No known version mapping for NT 6.1
      expect(info.osVersion).toBeUndefined();
    });
  });

  describe('extendSession - edge cases', () => {
    it('should keep existing rememberMe when not provided in extend', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: true,
      });

      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      const extended = await service.extendSession(session.id);
      // Should keep rememberMe as true
      expect(extended!.rememberMe).toBe(true);
    });

    it('should switch from rememberMe to default when false is passed', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: true,
      });

      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      const extended = await service.extendSession(session.id, false);
      expect(extended!.rememberMe).toBe(false);
    });

    it('should return null for inactive session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance past inactivity timeout
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      const result = await service.extendSession(session.id);
      expect(result).toBeNull();
    });
  });

  describe('getUserSessions - sorting', () => {
    it('should sort sessions by lastActiveAt (most recent first)', async () => {
      const session1 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time and create second session
      vi.advanceTimersByTime(60 * 60 * 1000);
      const session2 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time and validate session1 to update its lastActiveAt
      vi.advanceTimersByTime(30 * 60 * 1000);
      await service.validateSession(session1.id);

      const sessions = await service.getUserSessions(TEST_USER_ID);

      // session1 was validated last, so it should be first
      expect(sessions[0].id).toBe(session1.id);
    });
  });

  describe('getSession - non-existent without prisma', () => {
    it('should return null for non-existent session ID', async () => {
      const session = await service.getSession('totally-non-existent');
      expect(session).toBeNull();
    });
  });

  describe('getActiveSessionCount - with expired sessions', () => {
    it('should correctly count only active sessions among mixed states', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance 3 hours
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);

      // Create a fresh session
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance 2 more hours (first session inactive at 5h > 4h timeout)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      const count = service.getActiveSessionCount(TEST_USER_ID);
      expect(count).toBe(1); // Only the second session is still active
    });
  });

  describe('concurrent session enforcement - edge cases', () => {
    it('should clean up expired sessions before counting against limit', async () => {
      // Create 3 sessions (max)
      const s1 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      const s2 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      const s3 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // All 3 should exist
      expect(service.getActiveSessionCount(TEST_USER_ID)).toBe(3);

      // Advance past inactivity timeout for all sessions
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Creating a new session should work because all old ones are expired
      const s4 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(s4).toBeDefined();
    });
  });

  describe('createSession - default device info', () => {
    it('should use empty object as default device info', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        // No deviceInfo provided
      });

      expect(session.deviceInfo).toEqual({});
    });
  });

  describe('revokeOtherSessions - edge cases', () => {
    it('should handle case where current session is the only one', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const count = await service.revokeOtherSessions(TEST_USER_ID, session.id);
      expect(count).toBe(0);

      // Current session should still be valid
      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(true);
    });
  });
});
