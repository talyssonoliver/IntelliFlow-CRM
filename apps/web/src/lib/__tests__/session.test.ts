/**
 * Tests for session.ts
 * Covers: createServerClient, decrypt, encrypt, getSession,
 * createSessionFromAuth, clearSession, hasRole, constants
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockCreateClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: any[]) => mockCreateClient(...a) }));

const mockCookieGet = vi.fn();
const mockCookieDelete = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet, delete: mockCookieDelete }),
}));

import {
  createServerClient,
  decrypt,
  encrypt,
  getSession,
  createSessionFromAuth,
  clearSession,
  hasRole,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
  type SessionData,
} from '../session';

describe('session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mockCreateClient return value after clearAllMocks
    mockCreateClient.mockReturnValue({ auth: { getUser: mockGetUser } });
  });

  describe('createServerClient', () => {
    it('creates client with correct options', () => {
      createServerClient();
      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ auth: { autoRefreshToken: false, persistSession: false } })
      );
    });
  });

  describe('decrypt', () => {
    it('returns null for undefined', async () => expect(await decrypt(undefined)).toBeNull());
    it('returns null for empty', async () => expect(await decrypt('')).toBeNull());
    it('returns null for invalid JSON', async () => expect(await decrypt('bad')).toBeNull());
    it('returns null for expired', async () => {
      const s = {
        userId: 'u',
        email: 'e',
        role: 'R',
        accessToken: 't',
        expiresAt: Math.floor(Date.now() / 1000) - 3600,
      };
      expect(await decrypt(JSON.stringify(s))).toBeNull();
    });
    it('returns null when getUser fails', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad') });
      const s = {
        userId: 'u',
        email: 'e',
        role: 'R',
        accessToken: 't',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      expect(await decrypt(JSON.stringify(s))).toBeNull();
    });
    it('returns session for valid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { role: 'ADMIN' } } },
        error: null,
      });
      const s = {
        userId: 'u1',
        email: 'a@b.com',
        role: 'USER',
        accessToken: 'tok',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      const r = await decrypt(JSON.stringify(s));
      expect(r?.userId).toBe('u1');
      expect(r?.role).toBe('ADMIN');
    });
    it('defaults role to USER', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
        error: null,
      });
      const s = {
        userId: 'u1',
        email: '',
        role: '',
        accessToken: 't',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      const r = await decrypt(JSON.stringify(s));
      expect(r?.role).toBe('USER');
    });
    it('handles undefined email', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: undefined, user_metadata: {} } },
        error: null,
      });
      const s = {
        userId: 'u1',
        email: '',
        role: '',
        accessToken: 't',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      const r = await decrypt(JSON.stringify(s));
      expect(r?.email).toBe('');
    });
  });

  describe('encrypt', () => {
    it('serializes to JSON', async () => {
      const s: SessionData = {
        userId: 'u',
        email: 'e',
        role: 'R',
        accessToken: 't',
        expiresAt: 123,
      };
      expect(JSON.parse(await encrypt(s))).toEqual(s);
    });
  });

  describe('getSession', () => {
    it('returns null without cookie', async () => {
      mockCookieGet.mockReturnValue(undefined);
      expect(await getSession()).toBeNull();
    });
    it('returns session from valid cookie', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { role: 'USER' } } },
        error: null,
      });
      const s = {
        userId: 'u1',
        email: 'a@b.com',
        role: 'USER',
        accessToken: 'tok',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      mockCookieGet.mockReturnValue({ value: JSON.stringify(s) });
      const r = await getSession();
      expect(r?.userId).toBe('u1');
    });
  });

  describe('createSessionFromAuth', () => {
    it('creates session with expiration', () => {
      const before = Math.floor(Date.now() / 1000);
      const s = createSessionFromAuth('u1', 'e@e.com', 'tok', 'ref', 3600, 'ADMIN');
      expect(s.userId).toBe('u1');
      expect(s.role).toBe('ADMIN');
      expect(s.expiresAt).toBeGreaterThanOrEqual(before + 3600);
    });
    it('defaults role to USER', () => {
      const s = createSessionFromAuth('u1', 'e@e.com', 'tok', undefined, 3600);
      expect(s.role).toBe('USER');
    });
  });

  describe('clearSession', () => {
    it('deletes cookie', async () => {
      await clearSession();
      expect(mockCookieDelete).toHaveBeenCalledWith('session');
    });
  });

  describe('hasRole', () => {
    it('false for null session', () => expect(hasRole(null, ['ADMIN'])).toBe(false));
    it('true when matching', () => {
      const s: SessionData = {
        userId: 'u',
        email: 'e',
        role: 'ADMIN',
        accessToken: 't',
        expiresAt: 0,
      };
      expect(hasRole(s, ['ADMIN', 'MANAGER'])).toBe(true);
    });
    it('false when not matching', () => {
      const s: SessionData = {
        userId: 'u',
        email: 'e',
        role: 'USER',
        accessToken: 't',
        expiresAt: 0,
      };
      expect(hasRole(s, ['ADMIN'])).toBe(false);
    });
  });

  describe('constants', () => {
    it('PROTECTED_ROUTES has expected entries', () => {
      expect(PROTECTED_ROUTES['/admin']).toEqual(['ADMIN']);
      expect(PROTECTED_ROUTES['/analytics']).toEqual(['MANAGER', 'ADMIN']);
    });
    it('PUBLIC_ROUTES has login and signup', () => {
      expect(PUBLIC_ROUTES).toContain('/login');
      expect(PUBLIC_ROUTES).toContain('/signup');
      expect(PUBLIC_ROUTES).toContain('/');
    });
  });
});
