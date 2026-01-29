/**
 * Session Service Unit Tests
 *
 * Tests session management including:
 * - Session creation with device tracking
 * - Concurrent session enforcement
 * - Session validation and refresh
 * - Session revocation
 *
 * @module @intelliflow/api/services/tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SessionService,
  DEFAULT_SESSION_CONFIG,
  type CreateSessionInput,
  type DeviceInfo,
} from '../session.service';

// Test constants
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000002';

const TEST_DEVICE_INFO: DeviceInfo = {
  browser: 'Chrome',
  browserVersion: '120.0',
  os: 'Windows',
  osVersion: '11',
  device: 'Desktop',
  isMobile: false,
};

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
    // Create service without Prisma for unit tests
    service = new SessionService(undefined, {
      maxConcurrentSessions: 3,
      defaultSessionDurationMs: 24 * 60 * 60 * 1000, // 24 hours
      rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      inactivityTimeoutMs: 4 * 60 * 60 * 1000, // 4 hours
    });
    // Clear any sessions from previous tests (module-level stores persist)
    service.clearAll();
  });

  afterEach(() => {
    service.clearAll();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const defaultService = new SessionService();
      expect(defaultService).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customService = new SessionService(undefined, {
        maxConcurrentSessions: 5,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('createSession', () => {
    it('should create a new session with basic input', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      const session = await service.createSession(input);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.userId).toBe(TEST_USER_ID);
      expect(session.tenantId).toBe(TEST_TENANT_ID);
      expect(session.rememberMe).toBe(false);
    });

    it('should create session with device info', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        deviceInfo: TEST_DEVICE_INFO,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome/120.0',
      };

      const session = await service.createSession(input);

      expect(session.deviceInfo).toEqual(TEST_DEVICE_INFO);
      expect(session.ipAddress).toBe('192.168.1.1');
      expect(session.userAgent).toBe('Mozilla/5.0 Chrome/120.0');
    });

    it('should set correct expiration for default session', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: false,
      };

      const session = await service.createSession(input);

      const expectedExpiration = new Date('2024-01-16T10:00:00Z'); // 24 hours later
      expect(session.expiresAt.getTime()).toBe(expectedExpiration.getTime());
    });

    it('should set correct expiration for remember me session', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: true,
      };

      const session = await service.createSession(input);

      const expectedExpiration = new Date('2024-02-14T10:00:00Z'); // 30 days later
      expect(session.expiresAt.getTime()).toBe(expectedExpiration.getTime());
    });

    it('should store refresh token', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        refreshToken: 'test-refresh-token',
      };

      const session = await service.createSession(input);

      expect(session.refreshToken).toBe('test-refresh-token');
    });

    it('should set createdAt and lastActiveAt to current time', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      const session = await service.createSession(input);

      const now = new Date('2024-01-15T10:00:00Z');
      expect(session.createdAt.getTime()).toBe(now.getTime());
      expect(session.lastActiveAt.getTime()).toBe(now.getTime());
    });
  });

  describe('concurrent session enforcement', () => {
    it('should allow up to maxConcurrentSessions', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      const session1 = await service.createSession(input);
      const session2 = await service.createSession(input);
      const session3 = await service.createSession(input);

      // All three should exist
      const result1 = await service.validateSession(session1.id);
      const result2 = await service.validateSession(session2.id);
      const result3 = await service.validateSession(session3.id);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result3.valid).toBe(true);
    });

    it('should revoke oldest session when limit exceeded', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      // Create 3 sessions (the limit)
      const session1 = await service.createSession(input);
      vi.advanceTimersByTime(1000); // 1 second later
      const session2 = await service.createSession(input);
      vi.advanceTimersByTime(1000);
      const session3 = await service.createSession(input);
      vi.advanceTimersByTime(1000);

      // Create 4th session - should revoke session1 (oldest)
      const session4 = await service.createSession(input);

      // Session 1 should be revoked
      const result1 = await service.validateSession(session1.id);
      expect(result1.valid).toBe(false);

      // Sessions 2, 3, 4 should still be valid
      const result2 = await service.validateSession(session2.id);
      const result3 = await service.validateSession(session3.id);
      const result4 = await service.validateSession(session4.id);

      expect(result2.valid).toBe(true);
      expect(result3.valid).toBe(true);
      expect(result4.valid).toBe(true);
    });
  });

  describe('validateSession', () => {
    it('should return valid for active session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const result = await service.validateSession(session.id);

      expect(result.valid).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.id).toBe(session.id);
    });

    it('should return invalid for non-existent session', async () => {
      const result = await service.validateSession('non-existent-session-id');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('should return invalid for expired session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: false,
      });

      // Advance time past expiration (24 hours + 1 minute)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 60000);

      const result = await service.validateSession(session.id);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session expired');
    });

    it('should return invalid for inactive session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past inactivity timeout (4 hours + 1 minute)
      vi.advanceTimersByTime(4 * 60 * 60 * 1000 + 60000);

      const result = await service.validateSession(session.id);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session timed out due to inactivity');
    });

    it('should update lastActiveAt on validation', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time by 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000);

      const result = await service.validateSession(session.id);

      expect(result.valid).toBe(true);
      expect(result.session?.lastActiveAt.getTime()).toBe(
        new Date('2024-01-15T11:00:00Z').getTime()
      );
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(service.isSessionValid(session)).toBe(true);
    });

    it('should return false for expired session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(service.isSessionValid(session)).toBe(false);
    });

    it('should return false for inactive session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past inactivity timeout
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      expect(service.isSessionValid(session)).toBe(false);
    });
  });

  describe('revokeSession', () => {
    it('should revoke an existing session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      await service.revokeSession(session.id);

      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(false);
    });

    it('should handle revoking non-existent session gracefully', async () => {
      // Should not throw
      await expect(
        service.revokeSession('non-existent-session')
      ).resolves.not.toThrow();
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should revoke all sessions for a user', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      const session1 = await service.createSession(input);
      const session2 = await service.createSession(input);
      const session3 = await service.createSession(input);

      await service.revokeAllUserSessions(TEST_USER_ID);

      const result1 = await service.validateSession(session1.id);
      const result2 = await service.validateSession(session2.id);
      const result3 = await service.validateSession(session3.id);

      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result3.valid).toBe(false);
    });

    it('should handle user with no sessions', async () => {
      await expect(
        service.revokeAllUserSessions('user-with-no-sessions')
      ).resolves.not.toThrow();
    });
  });

  describe('getUserSessions', () => {
    it('should return all active sessions for a user', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        deviceInfo: TEST_DEVICE_INFO,
      };

      await service.createSession(input);
      await service.createSession(input);

      const sessions = await service.getUserSessions(TEST_USER_ID);

      expect(sessions).toHaveLength(2);
      sessions.forEach((session) => {
        expect(session.deviceInfo).toEqual(TEST_DEVICE_INFO);
      });
    });

    it('should return empty array for user with no sessions', async () => {
      const sessions = await service.getUserSessions('user-with-no-sessions');
      expect(sessions).toHaveLength(0);
    });

    it('should mark current session correctly', async () => {
      const session1 = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const sessions = await service.getUserSessions(TEST_USER_ID, session1.id);

      const currentSession = sessions.find((s) => s.id === session1.id);
      const otherSession = sessions.find((s) => s.id !== session1.id);

      expect(currentSession?.isCurrent).toBe(true);
      expect(otherSession?.isCurrent).toBe(false);
    });

    it('should not include expired sessions', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time to expire the session
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      // Create a new session
      vi.setSystemTime(new Date('2024-01-16T11:00:00Z'));
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const sessions = await service.getUserSessions(TEST_USER_ID);

      expect(sessions).toHaveLength(1);
    });
  });

  describe('extendSession', () => {
    it('should extend session expiration', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: false,
      });

      const originalExpiration = session.expiresAt;

      // Advance time by 2 hours (within 4-hour inactivity timeout)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      const extendedSession = await service.extendSession(session.id);

      expect(extendedSession).toBeDefined();
      expect(extendedSession!.expiresAt.getTime()).toBeGreaterThan(
        originalExpiration.getTime()
      );
    });

    it('should return null for non-existent session', async () => {
      const result = await service.extendSession('non-existent-session');
      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      const result = await service.extendSession(session.id);
      expect(result).toBeNull();
    });

    it('should update to rememberMe duration when specified', async () => {
      const session = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        rememberMe: false,
      });

      // Advance time by 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000);

      const extendedSession = await service.extendSession(session.id, true);

      expect(extendedSession).toBeDefined();
      expect(extendedSession!.rememberMe).toBe(true);
      // Should expire ~30 days from now (minus the 1 hour we advanced)
      const expectedExpiration = new Date('2024-02-14T11:00:00Z');
      expect(extendedSession!.expiresAt.getTime()).toBe(expectedExpiration.getTime());
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return 0 for user with no sessions', () => {
      const count = service.getActiveSessionCount('user-with-no-sessions');
      expect(count).toBe(0);
    });

    it('should return correct count for active sessions', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      await service.createSession(input);
      await service.createSession(input);

      const count = service.getActiveSessionCount(TEST_USER_ID);
      expect(count).toBe(2);
    });

    it('should not count expired sessions', async () => {
      await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Advance time to expire
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      const count = service.getActiveSessionCount(TEST_USER_ID);
      expect(count).toBe(0);
    });
  });

  describe('parseDeviceInfo', () => {
    it('should return empty object for undefined user agent', () => {
      const info = service.parseDeviceInfo(undefined);
      expect(info).toEqual({});
    });

    it('should detect Chrome browser', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
      );
      expect(info.browser).toBe('Chrome');
      expect(info.browserVersion).toBe('120.0.0.0');
    });

    it('should detect Firefox browser', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
      );
      expect(info.browser).toBe('Firefox');
      expect(info.browserVersion).toBe('120.0');
    });

    it('should detect Safari browser', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
      );
      expect(info.browser).toBe('Safari');
      expect(info.browserVersion).toBe('17.2');
    });

    it('should detect Edge browser', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      );
      expect(info.browser).toBe('Edge');
      expect(info.browserVersion).toBe('120.0.0.0');
    });

    it('should detect Windows OS', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );
      expect(info.os).toBe('Windows');
      expect(info.osVersion).toBe('10');
    });

    it('should detect macOS', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      );
      expect(info.os).toBe('macOS');
      expect(info.osVersion).toBe('10.15.7');
    });

    it('should detect mobile devices', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      );
      expect(info.isMobile).toBe(true);
      expect(info.device).toBe('Mobile');
    });

    it('should detect desktop devices', () => {
      const info = service.parseDeviceInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );
      expect(info.isMobile).toBe(false);
      expect(info.device).toBe('Desktop');
    });
  });

  describe('revokeOtherSessions', () => {
    it('should revoke all sessions except current', async () => {
      const input: CreateSessionInput = {
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      const session1 = await service.createSession(input);
      const session2 = await service.createSession(input);
      const currentSession = await service.createSession(input);

      const revokedCount = await service.revokeOtherSessions(
        TEST_USER_ID,
        currentSession.id
      );

      expect(revokedCount).toBe(2);

      // Current session should still be valid
      const currentResult = await service.validateSession(currentSession.id);
      expect(currentResult.valid).toBe(true);

      // Other sessions should be revoked
      const result1 = await service.validateSession(session1.id);
      const result2 = await service.validateSession(session2.id);
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });

    it('should return 0 when user has no sessions', async () => {
      const revokedCount = await service.revokeOtherSessions(
        'user-with-no-sessions',
        'some-session-id'
      );
      expect(revokedCount).toBe(0);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', async () => {
      const created = await service.createSession({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      const session = await service.getSession(created.id);

      expect(session).toBeDefined();
      expect(session?.id).toBe(created.id);
    });

    it('should return null for non-existent session', async () => {
      const session = await service.getSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('DEFAULT_SESSION_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SESSION_CONFIG.maxConcurrentSessions).toBe(3);
      expect(DEFAULT_SESSION_CONFIG.defaultSessionDurationMs).toBe(
        24 * 60 * 60 * 1000
      );
      expect(DEFAULT_SESSION_CONFIG.rememberMeDurationMs).toBe(
        30 * 24 * 60 * 60 * 1000
      );
      expect(DEFAULT_SESSION_CONFIG.inactivityTimeoutMs).toBe(
        4 * 60 * 60 * 1000
      );
    });
  });
});
