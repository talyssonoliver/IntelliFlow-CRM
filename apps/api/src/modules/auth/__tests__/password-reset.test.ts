/**
 * Password Reset Tests
 *
 * Tests for requestPasswordReset and resetPassword tRPC procedures.
 * IMPLEMENTS: IFC-120 (AC-001, AC-002, AC-007, AC-008)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const { mockResetPasswordForEmail, mockUpdateUserPassword, mockSupabaseAdmin } = vi.hoisted(() => ({
  mockResetPasswordForEmail: vi.fn(),
  mockUpdateUserPassword: vi.fn(),
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
  resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
  updateUserPassword: (...args: unknown[]) => mockUpdateUserPassword(...args),
}));

vi.mock('../../../security/login-limiter', () => ({
  getLoginLimiter: () => ({
    checkAllowed: vi.fn(),
    recordFailed: vi.fn(),
    recordSuccess: vi.fn(),
  }),
}));

// Mock the auth endpoint rate-limit middleware so it does not accumulate counts
// across test cases (the in-memory store is module-level and persists).
vi.mock('../../../middleware/rate-limit', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../middleware/rate-limit')>();
  return {
    ...original,
    createAuthEndpointRateLimitMiddleware:
      () =>
      async ({ next }: { next: () => Promise<unknown> }) =>
        next(),
  };
});

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

describe('Password Reset Procedures (IFC-120)', () => {
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
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockUpdateUserPassword.mockResolvedValue({ error: null });
  });

  describe('requestPasswordReset', () => {
    it('calls resetPasswordForEmail with email and redirectTo (AC-001)', async () => {
      const caller = authRouter.createCaller(createMockContext() as any);

      const result = await caller.requestPasswordReset({ email: 'user@example.com' });

      expect(result).toEqual({ success: true });
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('/reset-password/callback')
      );
    });

    it('always returns success even for non-existent email (AC-007)', async () => {
      mockResetPasswordForEmail.mockRejectedValue(new Error('User not found'));

      const caller = authRouter.createCaller(createMockContext() as any);
      const result = await caller.requestPasswordReset({ email: 'nonexistent@example.com' });

      expect(result).toEqual({ success: true });
    });

    it('rate limits to 3 per email per 15 min (AC-008)', async () => {
      const caller = authRouter.createCaller(createMockContext() as any);
      const email = `ratelimit-pw-${Date.now()}@example.com`;

      // First 3 should succeed
      await caller.requestPasswordReset({ email });
      await caller.requestPasswordReset({ email });
      await caller.requestPasswordReset({ email });

      // 4th should be rate limited
      await expect(caller.requestPasswordReset({ email })).rejects.toThrow(TRPCError);

      try {
        await caller.requestPasswordReset({ email });
      } catch (err) {
        expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
      }
    });
  });

  describe('resetPassword', () => {
    const validInput = {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid-payload-here',
      password: 'NewSecureP@ss1', // pragma: allowlist secret
      confirmPassword: 'NewSecureP@ss1', // pragma: allowlist secret
    };

    it('calls updateUserPassword and returns success (AC-002)', async () => {
      const caller = authRouter.createCaller(createMockContext() as any);

      const result = await caller.resetPassword(validInput);

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserPassword).toHaveBeenCalledWith(validInput.token, validInput.password);
    });

    it('throws UNAUTHORIZED for expired/invalid token', async () => {
      mockUpdateUserPassword.mockResolvedValue({
        error: new Error('Token expired or invalid'),
      });

      const caller = authRouter.createCaller(createMockContext() as any);

      try {
        await caller.resetPassword(validInput);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects password mismatch via Zod validation', async () => {
      const caller = authRouter.createCaller(createMockContext() as any);

      await expect(
        caller.resetPassword({
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid-payload-here',
          password: 'NewSecureP@ss1', // pragma: allowlist secret
          confirmPassword: 'DifferentP@ss2', // pragma: allowlist secret
        })
      ).rejects.toThrow();
    });
  });
});
