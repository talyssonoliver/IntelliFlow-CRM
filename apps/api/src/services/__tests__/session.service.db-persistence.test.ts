/**
 * Session Service — DB Persistence Tests (Fix #9)
 *
 * Verifies that all 4 database persistence methods work correctly:
 * - persistSession: upserts session record on create/extend
 * - loadSessionFromDb: fetches session by ID (validateSession + getSession fallback)
 * - loadUserSessionsFromDb: fetches all non-expired sessions for a user
 * - deleteSessionFromDb: removes session on revoke
 * - updateSessionActivity: updates lastActiveAt on validate
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionService, resetSessionService } from '../session.service';

const FIXED_NOW = new Date('2024-09-01T08:00:00Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function makeDbRecord(overrides: Partial<{
  id: string;
  userId: string;
  tenantId: string;
  deviceInfo: object;
  ipAddress: string | null;
  userAgent: string | null;
  refreshToken: string | null;
  rememberMe: boolean;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'db-session-id-001',
    userId: overrides.userId ?? 'user-db-001',
    tenantId: overrides.tenantId ?? 'tenant-db-001',
    deviceInfo: overrides.deviceInfo ?? { browser: 'Firefox', os: 'Linux' },
    ipAddress: overrides.ipAddress ?? '192.168.1.1',
    userAgent: overrides.userAgent ?? 'Mozilla/5.0',
    refreshToken: overrides.refreshToken ?? null,
    rememberMe: overrides.rememberMe ?? false,
    lastActiveAt: overrides.lastActiveAt ?? FIXED_NOW,
    expiresAt: overrides.expiresAt ?? new Date(FIXED_NOW.getTime() + ONE_DAY_MS),
    createdAt: overrides.createdAt ?? FIXED_NOW,
  };
}

describe('SessionService — DB Persistence (Fix #9)', () => {
  let service: SessionService;
  let mockPrisma: {
    session: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
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
      defaultSessionDurationMs: ONE_DAY_MS,
      rememberMeDurationMs: 30 * ONE_DAY_MS,
      inactivityTimeoutMs: FOUR_HOURS_MS,
    });
    service.clearAll();
  });

  afterEach(() => {
    service.clearAll();
    vi.useRealTimers();
    resetSessionService();
  });

  // ==========================================================================
  // persistSession — called from createSession and extendSession
  // ==========================================================================

  describe('persistSession (via createSession)', () => {
    it('calls prisma.session.upsert with correct create payload', async () => {
      const session = await service.createSession({
        userId: 'user-persist-001',
        tenantId: 'tenant-persist-001',
        deviceInfo: { browser: 'Chrome', os: 'macOS', isMobile: false },
        ipAddress: '10.0.0.5',
        userAgent: 'Mozilla/5.0 (Macintosh)',
        refreshToken: 'tok-abc123',
        rememberMe: true,
      });

      expect(mockPrisma.session.upsert).toHaveBeenCalledOnce();
      const call = mockPrisma.session.upsert.mock.calls[0][0];

      expect(call.where).toEqual({ id: session.id });
      expect(call.create.id).toBe(session.id);
      expect(call.create.userId).toBe('user-persist-001');
      expect(call.create.tenantId).toBe('tenant-persist-001');
      expect(call.create.rememberMe).toBe(true);
      expect(call.create.refreshToken).toBe('tok-abc123');
      expect(call.create.ipAddress).toBe('10.0.0.5');
      expect(call.create.deviceInfo).toMatchObject({ browser: 'Chrome' });
    });

    it('calls prisma.session.upsert with null for optional fields when omitted', async () => {
      await service.createSession({
        userId: 'user-null-fields',
        tenantId: 'tenant-null-fields',
      });

      const call = mockPrisma.session.upsert.mock.calls[0][0];
      expect(call.create.ipAddress).toBeNull();
      expect(call.create.userAgent).toBeNull();
      expect(call.create.refreshToken).toBeNull();
    });

    it('does NOT call prisma when service has no prisma instance', async () => {
      const noPrismaService = new SessionService(undefined, {
        maxConcurrentSessions: 3,
        defaultSessionDurationMs: ONE_DAY_MS,
        rememberMeDurationMs: 30 * ONE_DAY_MS,
        inactivityTimeoutMs: FOUR_HOURS_MS,
      });
      noPrismaService.clearAll();

      await noPrismaService.createSession({ userId: 'u1', tenantId: 't1' });
      expect(mockPrisma.session.upsert).not.toHaveBeenCalled();

      noPrismaService.clearAll();
    });
  });

  describe('persistSession (via extendSession)', () => {
    it('calls prisma.session.upsert again when extending a session', async () => {
      const session = await service.createSession({
        userId: 'user-extend-001',
        tenantId: 'tenant-extend-001',
      });

      mockPrisma.session.upsert.mockClear();

      const extended = await service.extendSession(session.id, true);
      expect(extended).not.toBeNull();
      expect(mockPrisma.session.upsert).toHaveBeenCalledOnce();

      const call = mockPrisma.session.upsert.mock.calls[0][0];
      expect(call.update.rememberMe).toBe(true);
    });
  });

  // ==========================================================================
  // loadSessionFromDb — fallback in validateSession and getSession
  // ==========================================================================

  describe('loadSessionFromDb (via validateSession)', () => {
    it('calls prisma.session.findUnique when session not in memory', async () => {
      const dbRecord = makeDbRecord({
        id: 'db-validate-sess',
        userId: 'user-validate-db',
        tenantId: 'tenant-validate-db',
        // Session is fresh and not yet expired
        lastActiveAt: FIXED_NOW,
        expiresAt: new Date(FIXED_NOW.getTime() + ONE_DAY_MS),
      });
      mockPrisma.session.findUnique.mockResolvedValue(dbRecord);

      const result = await service.validateSession('db-validate-sess');

      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'db-validate-sess' },
      });
      expect(result.valid).toBe(true);
      expect(result.session?.userId).toBe('user-validate-db');
    });

    it('returns session-not-found when DB also has no record', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('completely-missing-session');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('maps null DB fields to undefined in SessionData', async () => {
      const dbRecord = makeDbRecord({
        id: 'db-null-fields-sess',
        ipAddress: null,
        userAgent: null,
        refreshToken: null,
      });
      mockPrisma.session.findUnique.mockResolvedValue(dbRecord);

      const result = await service.validateSession('db-null-fields-sess');
      expect(result.valid).toBe(true);
      expect(result.session?.ipAddress).toBeUndefined();
      expect(result.session?.userAgent).toBeUndefined();
      expect(result.session?.refreshToken).toBeUndefined();
    });
  });

  describe('loadSessionFromDb (via getSession)', () => {
    it('calls prisma.session.findUnique when session not in memory', async () => {
      const dbRecord = makeDbRecord({ id: 'db-get-sess' });
      mockPrisma.session.findUnique.mockResolvedValue(dbRecord);

      const result = await service.getSession('db-get-sess');

      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'db-get-sess' },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('db-get-sess');
    });

    it('returns null when DB has no record for getSession', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      const result = await service.getSession('non-existent');
      expect(result).toBeNull();
    });

    it('caches the DB-loaded session in memory for subsequent calls', async () => {
      const dbRecord = makeDbRecord({ id: 'db-cache-sess' });
      mockPrisma.session.findUnique.mockResolvedValue(dbRecord);

      await service.getSession('db-cache-sess');
      await service.getSession('db-cache-sess'); // second call — should use cache

      // findUnique should only be called once (first call loads it, second reads from cache)
      expect(mockPrisma.session.findUnique).toHaveBeenCalledOnce();
    });
  });

  // ==========================================================================
  // loadUserSessionsFromDb — fallback in getUserSessions
  // ==========================================================================

  describe('loadUserSessionsFromDb (via getUserSessions)', () => {
    it('calls prisma.session.findMany with correct filter when user has no in-memory sessions', async () => {
      const dbRecords = [
        makeDbRecord({ id: 'sess-a', userId: 'user-list-001' }),
        makeDbRecord({ id: 'sess-b', userId: 'user-list-001' }),
      ];
      mockPrisma.session.findMany.mockResolvedValue(dbRecords);

      const sessions = await service.getUserSessions('user-list-001');

      expect(mockPrisma.session.findMany).toHaveBeenCalledOnce();
      const call = mockPrisma.session.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe('user-list-001');
      expect(call.where.expiresAt.gt).toBeInstanceOf(Date);

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.id)).toEqual(expect.arrayContaining(['sess-a', 'sess-b']));
    });

    it('returns empty array when DB has no sessions for user', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);
      const sessions = await service.getUserSessions('user-no-sessions');
      expect(sessions).toEqual([]);
    });

    it('maps deviceInfo from DB record to SessionInfo', async () => {
      const dbRecord = makeDbRecord({
        id: 'sess-device',
        userId: 'user-device-001',
        deviceInfo: { browser: 'Safari', os: 'macOS', isMobile: false },
      });
      mockPrisma.session.findMany.mockResolvedValue([dbRecord]);

      const sessions = await service.getUserSessions('user-device-001');
      expect(sessions[0].deviceInfo).toMatchObject({ browser: 'Safari' });
    });
  });

  // ==========================================================================
  // updateSessionActivity — called by validateSession on valid sessions
  // ==========================================================================

  describe('updateSessionActivity (via validateSession)', () => {
    it('calls prisma.session.update with lastActiveAt for valid in-memory session', async () => {
      const session = await service.createSession({
        userId: 'user-activity-001',
        tenantId: 'tenant-activity-001',
      });

      mockPrisma.session.update.mockClear();

      const result = await service.validateSession(session.id);
      expect(result.valid).toBe(true);

      expect(mockPrisma.session.update).toHaveBeenCalledOnce();
      const call = mockPrisma.session.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: session.id });
      expect(call.data.lastActiveAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // deleteSessionFromDb — called by revokeSession
  // ==========================================================================

  describe('deleteSessionFromDb (via revokeSession)', () => {
    it('calls prisma.session.delete when revoking an in-memory session', async () => {
      const session = await service.createSession({
        userId: 'user-revoke-001',
        tenantId: 'tenant-revoke-001',
      });

      mockPrisma.session.delete.mockClear();

      const revoked = await service.revokeSession(session.id);
      expect(revoked).toBe(true);

      expect(mockPrisma.session.delete).toHaveBeenCalledOnce();
      expect(mockPrisma.session.delete.mock.calls[0][0]).toEqual({
        where: { id: session.id },
      });
    });

    it('silently ignores "not found" errors when deleting from DB', async () => {
      // Simulate DB returning a "not found" error (e.g. already deleted)
      mockPrisma.session.delete.mockRejectedValue(new Error('Record not found'));

      const session = await service.createSession({
        userId: 'user-idempotent-revoke',
        tenantId: 'tenant-idempotent',
      });

      // Should not throw even when DB delete fails
      const revoked = await service.revokeSession(session.id);
      expect(revoked).toBe(true);
    });

    it('returns false and does not call DB delete for non-existent in-memory session', async () => {
      const revoked = await service.revokeSession('completely-unknown-session');
      expect(revoked).toBe(false);
      expect(mockPrisma.session.delete).not.toHaveBeenCalled();
    });
  });
});
