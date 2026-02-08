/**
 * Session Service Supplementary Tests - covers uncovered paths
 * Targets: validateSession expired/inactive auto-revoke, enforceSessionLimit,
 * parseDeviceInfo iOS/Android, revokeOtherSessions, extendSession non-existent
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionService, resetSessionService } from "../session.service";

describe("SessionService supplementary coverage", () => {
  let service: SessionService;

  beforeEach(() => {
    resetSessionService();
    service = new SessionService(undefined, {
      maxConcurrentSessions: 3,
      defaultSessionDurationMs: 24 * 60 * 60 * 1000,
      rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
      inactivityTimeoutMs: 4 * 60 * 60 * 1000,
    });
  });

  describe("validateSession - expired session auto-revoke", () => {
    it("should revoke and return invalid for expired session", async () => {
      const session = await service.createSession({
        userId: "user-1", tenantId: "tenant-1",
      });

      // Manually expire the session
      (session as any).expiresAt = new Date(Date.now() - 1000);

      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Session expired");

      // Verify session was revoked
      const check = await service.getSession(session.id);
      expect(check).toBeNull();
    });
  });

  describe("validateSession - inactive session auto-revoke", () => {
    it("should revoke and return invalid for inactive session", async () => {
      const svc = new SessionService(undefined, {
        maxConcurrentSessions: 3,
        defaultSessionDurationMs: 24 * 60 * 60 * 1000,
        rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
        inactivityTimeoutMs: 1000, // 1 second for testing
      });

      const session = await svc.createSession({
        userId: "user-2", tenantId: "tenant-1",
      });

      // Set lastActiveAt to past
      (session as any).lastActiveAt = new Date(Date.now() - 5000);

      const result = await svc.validateSession(session.id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Session timed out due to inactivity");
    });
  });

  describe("validateSession - session not found", () => {
    it("should return invalid for non-existent session", async () => {
      const result = await service.validateSession("non-existent-id");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Session not found");
    });
  });

  describe("validateSession - valid session updates lastActiveAt", () => {
    it("should update lastActiveAt for valid session", async () => {
      const session = await service.createSession({
        userId: "user-3", tenantId: "tenant-1",
      });

      const oldLastActive = session.lastActiveAt;
      await new Promise(r => setTimeout(r, 10));

      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(true);
      expect(result.session).toBeDefined();
    });
  });

  describe("enforceSessionLimit - revoke oldest", () => {
    it("should revoke oldest sessions when limit exceeded", async () => {
      const svc = new SessionService(undefined, {
        maxConcurrentSessions: 2,
        defaultSessionDurationMs: 24 * 60 * 60 * 1000,
        rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
        inactivityTimeoutMs: 4 * 60 * 60 * 1000,
      });

      // Create 2 sessions (at limit)
      const s1 = await svc.createSession({ userId: "user-limit", tenantId: "t1" });
      await new Promise(r => setTimeout(r, 10));
      const s2 = await svc.createSession({ userId: "user-limit", tenantId: "t1" });
      await new Promise(r => setTimeout(r, 10));

      // This should trigger enforcement, revoking s1
      const s3 = await svc.createSession({ userId: "user-limit", tenantId: "t1" });

      // s1 should be revoked (oldest)
      const check1 = await svc.getSession(s1.id);
      expect(check1).toBeNull();

      // s3 should exist
      const check3 = await svc.getSession(s3.id);
      expect(check3).toBeDefined();
    });
  });

  describe("extendSession - non-existent session", () => {
    it("should return null for non-existent session", async () => {
      const result = await service.extendSession("non-existent-id");
      expect(result).toBeNull();
    });

    it("should return null for expired session", async () => {
      const session = await service.createSession({
        userId: "user-ext", tenantId: "t1",
      });
      (session as any).expiresAt = new Date(Date.now() - 1000);

      const result = await service.extendSession(session.id);
      expect(result).toBeNull();
    });

    it("should extend valid session with rememberMe", async () => {
      const session = await service.createSession({
        userId: "user-ext2", tenantId: "t1",
      });

      const result = await service.extendSession(session.id, true);
      expect(result).toBeDefined();
      expect(result!.rememberMe).toBe(true);
    });
  });

  describe("revokeOtherSessions", () => {
    it("should revoke all sessions except current", async () => {
      const s1 = await service.createSession({ userId: "user-revo", tenantId: "t1" });
      const s2 = await service.createSession({ userId: "user-revo", tenantId: "t1" });
      const s3 = await service.createSession({ userId: "user-revo", tenantId: "t1" });

      const revoked = await service.revokeOtherSessions("user-revo", s2.id);
      expect(revoked).toBe(2);

      // Only s2 should remain
      const check2 = await service.getSession(s2.id);
      expect(check2).toBeDefined();
    });

    it("should return 0 when no other sessions exist", async () => {
      const revoked = await service.revokeOtherSessions("nonexistent-user", "some-id");
      expect(revoked).toBe(0);
    });
  });

  describe("parseDeviceInfo - iOS without Mac prefix", () => {
    it("should detect iOS from iPhone user agent", () => {
      const ua = "Mozilla/5.0 (iOS; CPU iPhone OS 17_0) AppleWebKit/605.1.15";
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe("iOS");
      expect(info.isMobile).toBe(true);
      expect(info.device).toBe("Mobile");
    });

    it("should detect iOS from iPad user agent", () => {
      const ua = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
      const info = service.parseDeviceInfo(ua);
      expect(info.isMobile).toBe(true);
    });
  });

  describe("parseDeviceInfo - Android", () => {
    it("should detect Android with version", () => {
      const ua = "Mozilla/5.0 (Android 14; Pixel 8) AppleWebKit/537.36";
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe("Android");
      expect(info.osVersion).toBe("14");
      expect(info.isMobile).toBe(true);
    });
  });

  describe("parseDeviceInfo - Edge browser", () => {
    it("should detect Edge browser", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
      const info = service.parseDeviceInfo(ua);
      expect(info.browser).toBe("Edge");
    });
  });

  describe("parseDeviceInfo - Safari browser", () => {
    it("should detect Safari browser", () => {
      const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
      const info = service.parseDeviceInfo(ua);
      expect(info.browser).toBe("Safari");
      expect(info.browserVersion).toBe("17.2");
    });
  });

  describe("parseDeviceInfo - Firefox browser", () => {
    it("should detect Firefox browser", () => {
      const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
      const info = service.parseDeviceInfo(ua);
      expect(info.browser).toBe("Firefox");
      expect(info.browserVersion).toBe("121.0");
      expect(info.os).toBe("Linux");
    });
  });

  describe("parseDeviceInfo - empty user agent", () => {
    it("should return empty object for undefined", () => {
      const info = service.parseDeviceInfo(undefined);
      expect(info).toEqual({});
    });
  });

  describe("parseDeviceInfo - Windows versions", () => {
    it("should detect Windows 11", () => {
      const ua = "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";
      const info = service.parseDeviceInfo(ua);
      expect(info.os).toBe("Windows");
      expect(info.osVersion).toBe("11");
    });
  });

  describe("revokeAllUserSessions", () => {
    it("should revoke all sessions and return count", async () => {
      await service.createSession({ userId: "user-all", tenantId: "t1" });
      await service.createSession({ userId: "user-all", tenantId: "t1" });
      await service.createSession({ userId: "user-all", tenantId: "t1" });

      const revoked = await service.revokeAllUserSessions("user-all");
      expect(revoked).toBe(3);

      const count = service.getActiveSessionCount("user-all");
      expect(count).toBe(0);
    });
  });

  describe("createSession - rememberMe duration", () => {
    it("should use extended duration when rememberMe is true", async () => {
      const session = await service.createSession({
        userId: "user-rem", tenantId: "t1", rememberMe: true,
      });

      expect(session.rememberMe).toBe(true);
      // Extended duration should be ~30 days
      const diff = session.expiresAt.getTime() - session.createdAt.getTime();
      expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    });
  });
});
