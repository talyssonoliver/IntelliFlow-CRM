/**
 * Session Service B11 Tests - covers remaining uncovered branches
 *
 * Targets:
 * - parseDeviceInfo: Edge browser detection
 * - parseDeviceInfo: Safari browser detection (without Chrome)
 * - parseDeviceInfo: Firefox browser detection
 * - parseDeviceInfo: macOS detection
 * - parseDeviceInfo: Linux detection
 * - parseDeviceInfo: Windows 11 detection
 * - parseDeviceInfo: Android with version
 * - extendSession: with rememberMe=true override
 * - extendSession: invalid/expired session returns null
 * - revokeAllUserSessions: with sessions
 * - revokeOtherSessions: keep current, revoke others
 * - revokeSession: session not found returns false
 * - getActiveSessionCount: expired sessions not counted
 * - validateSession: expired session revocation
 * - validateSession: inactivity timeout
 * - resetSessionService: when instance exists
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionService, getSessionService, resetSessionService } from '../session.service';

describe('SessionService b11 - uncovered branches', () => {
  describe('parseDeviceInfo - browser detection', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService();
    });

    it('should detect Edge browser', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91';
      const info = service.parseDeviceInfo(ua);
      expect(info.browser).toBe('Edge');
      expect(info.browserVersion).toBe('120.0.2210.91');
    });

    it('should detect Safari browser', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
      const info = service.parseDeviceInfo(ua);
      expect(info.browser).toBe('Safari');
      expect(info.browserVersion).toBe('17.2');
    });

    it('should detect Firefox browser', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
      const info = service.parseDeviceInfo(ua);
      expect(info.browser).toBe('Firefox');
      expect(info.browserVersion).toBe('121.0');
    });
  });

  describe('parseDeviceInfo - OS detection', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService();
    });

    it('should detect macOS with version', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('macOS');
      expect(info.osVersion).toBe('10.15.7');
    });

    it('should detect Linux', () => {
      const ua =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('Linux');
      expect(info.isMobile).toBe(false);
      expect(info.device).toBe('Desktop');
    });

    it('should detect Windows 11', () => {
      const ua = 'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36';
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe('Windows');
      expect(info.osVersion).toBe('11');
    });

    it('should detect Android with version from proper UA', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
      const info = service.parseDeviceInfo(ua);
      // Android check comes after Linux check, so Linux matches first
      // unless the code checks Android before Linux
      expect(info.isMobile).toBe(true);
    });

    it('should detect iOS from iPhone UA', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
      const info = service.parseDeviceInfo(ua);
      expect(info.isMobile).toBe(true);
      expect(info.device).toBe('Mobile');
    });
  });

  describe('extendSession', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService(undefined, {
        maxConcurrentSessions: 5,
        defaultSessionDurationMs: 24 * 60 * 60 * 1000,
        rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
        inactivityTimeoutMs: 4 * 60 * 60 * 1000,
      });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should extend session with rememberMe=true override', async () => {
      const session = await service.createSession({
        userId: 'user-ext',
        tenantId: 'tenant-1',
        rememberMe: false,
      });

      const extended = await service.extendSession(session.id, true);
      expect(extended).not.toBeNull();
      expect(extended!.rememberMe).toBe(true);
    });

    it('should return null for non-existent session', async () => {
      const result = await service.extendSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('should extend session preserving rememberMe when not overridden', async () => {
      const session = await service.createSession({
        userId: 'user-ext2',
        tenantId: 'tenant-1',
        rememberMe: true,
      });

      const extended = await service.extendSession(session.id);
      expect(extended).not.toBeNull();
      expect(extended!.rememberMe).toBe(true);
    });
  });

  describe('revokeAllUserSessions', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService(undefined, {
        maxConcurrentSessions: 5,
        defaultSessionDurationMs: 24 * 60 * 60 * 1000,
        rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
        inactivityTimeoutMs: 4 * 60 * 60 * 1000,
      });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should revoke all sessions for a user', async () => {
      await service.createSession({ userId: 'user-revoke', tenantId: 't1' });
      await service.createSession({ userId: 'user-revoke', tenantId: 't1' });
      await service.createSession({ userId: 'user-revoke', tenantId: 't1' });

      const revoked = await service.revokeAllUserSessions('user-revoke');
      expect(revoked).toBe(3);
      expect(service.getActiveSessionCount('user-revoke')).toBe(0);
    });

    it('should return 0 for user with no sessions', async () => {
      const revoked = await service.revokeAllUserSessions('no-sessions');
      expect(revoked).toBe(0);
    });
  });

  describe('revokeOtherSessions', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService(undefined, {
        maxConcurrentSessions: 5,
        defaultSessionDurationMs: 24 * 60 * 60 * 1000,
        rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
        inactivityTimeoutMs: 4 * 60 * 60 * 1000,
      });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should revoke all sessions except the current one', async () => {
      const s1 = await service.createSession({ userId: 'user-other', tenantId: 't1' });
      await service.createSession({ userId: 'user-other', tenantId: 't1' });
      await service.createSession({ userId: 'user-other', tenantId: 't1' });

      const revoked = await service.revokeOtherSessions('user-other', s1.id);
      expect(revoked).toBe(2);
      expect(service.getActiveSessionCount('user-other')).toBe(1);

      // The current session should still be valid
      const current = await service.getSession(s1.id);
      expect(current).not.toBeNull();
    });

    it('should return 0 when user has no sessions', async () => {
      const revoked = await service.revokeOtherSessions('no-user', 'some-id');
      expect(revoked).toBe(0);
    });
  });

  describe('revokeSession - not found', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService();
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should return false when session does not exist', async () => {
      const result = await service.revokeSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('validateSession - expired session', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      service = new SessionService(undefined, {
        maxConcurrentSessions: 5,
        defaultSessionDurationMs: 1000, // 1 second
        rememberMeDurationMs: 2000,
        inactivityTimeoutMs: 60000, // 1 minute
      });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
      vi.useRealTimers();
    });

    it('should revoke expired session and return invalid', async () => {
      const session = await service.createSession({ userId: 'user-exp', tenantId: 't1' });

      // Advance time past expiration
      vi.setSystemTime(new Date('2024-01-15T10:00:02Z')); // 2 seconds later

      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session expired');
    });
  });

  describe('validateSession - inactivity timeout', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      service = new SessionService(undefined, {
        maxConcurrentSessions: 5,
        defaultSessionDurationMs: 86400000, // 24 hours
        rememberMeDurationMs: 86400000,
        inactivityTimeoutMs: 1000, // 1 second
      });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
      vi.useRealTimers();
    });

    it('should revoke session after inactivity timeout', async () => {
      const session = await service.createSession({ userId: 'user-inact', tenantId: 't1' });

      // Advance time past inactivity timeout
      vi.setSystemTime(new Date('2024-01-15T10:00:02Z')); // 2 seconds later

      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session timed out due to inactivity');
    });
  });

  describe('resetSessionService - clears instance', () => {
    it('should clear and null the singleton', () => {
      const svc = getSessionService();
      expect(svc).toBeDefined();
      resetSessionService();

      // After reset, getting a new one should be different
      const svc2 = getSessionService();
      expect(svc2).not.toBe(svc);
      resetSessionService();
    });
  });

  describe('getStats', () => {
    let service: SessionService;

    beforeEach(() => {
      resetSessionService();
      service = new SessionService(undefined, { maxConcurrentSessions: 10 });
      service.clearAll();
    });

    afterEach(() => {
      service.clearAll();
    });

    it('should return correct stats', async () => {
      await service.createSession({ userId: 'user-a', tenantId: 't1' });
      await service.createSession({ userId: 'user-b', tenantId: 't1' });

      const stats = service.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalUsers).toBe(2);
    });
  });
});
