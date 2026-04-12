/**
 * Email Verification Tests
 *
 * Tests for verifyEmail and resendVerification tRPC procedures.
 * IMPLEMENTS: IFC-120 (AC-004, AC-005, AC-007, AC-008)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const { mockSupabaseAdmin } = vi.hoisted(() => ({
  mockSupabaseAdmin: {
    auth: {
      resetPasswordForEmail: vi.fn(),
      signUp: vi.fn(),
      verifyOtp: vi.fn(),
      resend: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/supabase', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  signOutUser: vi.fn(),
  getSession: vi.fn(),
  verifyToken: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  supabaseAdmin: mockSupabaseAdmin,
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  updateUserPassword: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('../../../security/login-limiter', () => ({
  getLoginLimiter: () => ({
    checkAllowed: vi.fn(),
    recordFailed: vi.fn(),
    recordSuccess: vi.fn(),
  }),
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({
    logLoginFailure: vi.fn(),
    logLoginSuccess: vi.fn(),
    log: vi.fn(),
  }),
}));

vi.mock('../../../services/mfa.service', () => ({
  getMfaService: () => ({
    isUserMfaEnabled: vi.fn(),
    getAvailableMfaMethods: vi.fn(),
    createChallenge: vi.fn(),
    getChallengeInfo: vi.fn(),
    verifyChallenge: vi.fn(),
    generateTotpSecret: vi.fn(),
    sendSmsOtp: vi.fn(),
    sendEmailOtp: vi.fn(),
    getUserMfaSettings: vi.fn(),
    verifyTotp: vi.fn(),
    saveUserMfaSettings: vi.fn(),
    generateBackupCodes: vi.fn(),
    hashBackupCodes: vi.fn(),
  }),
}));

vi.mock('../../../services/session.service', () => ({
  getSessionService: () => ({
    parseDeviceInfo: vi.fn(),
    createSession: vi.fn(),
    getUserSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllUserSessions: vi.fn(),
  }),
}));

import { authRouter } from '../auth.router';

describe('Email Verification Procedures (IFC-120)', () => {
  const createMockContext = () => ({
    prisma: {} as any,
    req: {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'Mozilla/5.0 Test Agent',
      },
    } as any,
    user: undefined,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyEmail', () => {
    it('calls verifyOtp with token_hash and type, returns success with email (AC-004)', async () => {
      mockSupabaseAdmin.auth.verifyOtp.mockResolvedValue({
        data: { user: { email: 'verified@example.com' } },
        error: null,
      });

      const caller = authRouter.createCaller(createMockContext() as any);

      const result = await caller.verifyEmail({
        token_hash: 'abc123def456',
        type: 'email',
      });

      expect(result).toEqual({ success: true, email: 'verified@example.com' });
      expect(mockSupabaseAdmin.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'abc123def456',
        type: 'email',
      });
    });

    it('throws for invalid/expired token', async () => {
      mockSupabaseAdmin.auth.verifyOtp.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token has expired or is invalid' },
      });

      const caller = authRouter.createCaller(createMockContext() as any);

      try {
        await caller.verifyEmail({ token_hash: 'expired123456', type: 'signup' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('resendVerification', () => {
    it('calls supabaseAdmin.auth.resend with type signup (AC-005)', async () => {
      mockSupabaseAdmin.auth.resend.mockResolvedValue({ error: null });

      const caller = authRouter.createCaller(createMockContext() as any);

      const result = await caller.resendVerification({ email: 'user@example.com' });

      expect(result).toEqual({ success: true });
      expect(mockSupabaseAdmin.auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'user@example.com',
      });
    });

    it('always returns success regardless of email existence (AC-007)', async () => {
      mockSupabaseAdmin.auth.resend.mockRejectedValue(new Error('User not found'));

      const caller = authRouter.createCaller(createMockContext() as any);

      const result = await caller.resendVerification({ email: 'nonexistent@example.com' });

      expect(result).toEqual({ success: true });
    });

    it('rate limits to 3 per email per 15 min (AC-008)', async () => {
      mockSupabaseAdmin.auth.resend.mockResolvedValue({ error: null });

      const caller = authRouter.createCaller(createMockContext() as any);
      const email = `resend-ratelimit-${Date.now()}@example.com`;

      // First 3 should succeed
      await caller.resendVerification({ email });
      await caller.resendVerification({ email });
      await caller.resendVerification({ email });

      // 4th should be rate limited
      try {
        await caller.resendVerification({ email });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
      }
    });
  });
});
