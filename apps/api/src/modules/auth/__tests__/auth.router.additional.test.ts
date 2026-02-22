/**
 * Auth Router Additional Tests - covers uncovered error handling paths
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockSignOutUser = vi.fn();
const mockGetSession = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockExchangeCodeForSession = vi.fn();
const mockVerifyToken = vi.fn();

// IFC-120: Module-scope mocks for supabaseAdmin (closure pattern required for vi.mock)
const mockVerifyOtp = vi.fn().mockResolvedValue({ data: {}, error: { message: 'Token expired' } });
const mockSupabaseSignUp = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
const mockSupabaseResend = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockResetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockUpdateUserPassword = vi.fn().mockResolvedValue({ data: {}, error: null });

const mockLoginLimiter = {
  checkAllowed: vi.fn(),
  recordFailed: vi.fn().mockReturnValue({ isLocked: false }),
  recordSuccess: vi.fn(),
};
const mockAuditLogger = {
  logLoginFailure: vi.fn(),
  logLoginSuccess: vi.fn(),
  log: vi.fn(),
};
const mockMfaService = {
  isUserMfaEnabled: vi.fn(),
  getAvailableMfaMethods: vi.fn(),
  createChallenge: vi.fn(),
  getChallengeInfo: vi.fn(),
  verifyChallenge: vi.fn(),
  generateTotpSecret: vi.fn(),
  sendSmsOtp: vi.fn(),
  sendEmailOtp: vi.fn(),
  verifyTotp: vi.fn(),
  getUserMfaSettings: vi.fn(),
  saveUserMfaSettings: vi.fn(),
  generateBackupCodes: vi.fn(),
  hashBackupCodes: vi.fn(),
};
const mockSessionService = {
  parseDeviceInfo: vi.fn().mockReturnValue({}),
  createSession: vi.fn().mockResolvedValue({ id: 'sess-1' }),
  getUserSessions: vi.fn().mockResolvedValue([]),
  revokeSession: vi.fn().mockResolvedValue(true),
  revokeAllUserSessions: vi.fn().mockResolvedValue(1),
};

vi.mock('../../../lib/supabase', () => ({
  signIn: (...args: any[]) => mockSignIn(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  signOutUser: (...args: any[]) => mockSignOutUser(...args),
  getSession: (...args: any[]) => mockGetSession(...args),
  signInWithOAuth: (...args: any[]) => mockSignInWithOAuth(...args),
  exchangeCodeForSession: (...args: any[]) => mockExchangeCodeForSession(...args),
  verifyToken: (...args: any[]) => mockVerifyToken(...args),
  // IFC-120: Supabase admin client for auth flows (closure pattern)
  supabaseAdmin: {
    auth: {
      signUp: (...args: any[]) => mockSupabaseSignUp(...args),
      verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
      resend: (...args: any[]) => mockSupabaseResend(...args),
    },
  },
  resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
  updateUserPassword: (...args: any[]) => mockUpdateUserPassword(...args),
}));

vi.mock('../../../security/login-limiter', () => ({
  getLoginLimiter: () => mockLoginLimiter,
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => mockAuditLogger,
}));

vi.mock('../../../services/mfa.service', () => ({
  getMfaService: () => mockMfaService,
}));

vi.mock('../../../services/session.service', () => ({
  getSessionService: () => mockSessionService,
}));

import { authRouter } from '../auth.router';
import { createTestContext, createPublicContext } from '../../../test/setup';

describe('authRouter additional coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginLimiter.recordFailed.mockReturnValue({ isLocked: false });
  });

  describe('oauthCallback - exchange failure', () => {
    it('should throw UNAUTHORIZED when code exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        session: null,
        user: null,
        error: { message: 'Invalid code' },
      });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.oauthCallback({ code: 'invalid-code' })
      ).rejects.toThrow('Invalid code');
    });
  });

  describe('login - generic error catch', () => {
    it('should throw INTERNAL_SERVER_ERROR for non-TRPCError', async () => {
      mockLoginLimiter.checkAllowed.mockImplementation(() => {
        throw new Error('Unexpected database error');
      });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.login({
          email: 'test@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('login - locked account', () => {
    it('should show lockout message when account is locked', async () => {
      mockSignIn.mockResolvedValue({ error: new Error('invalid'), user: null, session: null });
      mockLoginLimiter.recordFailed.mockReturnValue({ isLocked: true, lockoutDuration: 300000 });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.login({
          email: 'test@example.com',
          password: 'wrong-password-123',
        })
      ).rejects.toThrow('Account locked');
    });
  });

  describe('logout - supabase error continuation', () => {
    it('should continue with app session cleanup even if supabase signout fails', async () => {
      mockSignOutUser.mockResolvedValue({ error: new Error('Supabase error') });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.logout();
      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('verifyMfa - session failure', () => {
    it('should throw UNAUTHORIZED when session expired after MFA', async () => {
      mockMfaService.getChallengeInfo.mockReturnValue({ exists: true });
      mockMfaService.verifyChallenge.mockResolvedValue({ success: true });
      mockGetSession.mockResolvedValue({ session: null, error: new Error('expired') });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.verifyMfa({
          challengeId: '00000000-0000-4000-8000-000000000011',
          code: '123456',
          method: 'totp',
        })
      ).rejects.toThrow('Session expired');
    });
  });

  describe('resendMfaCode - SMS with challengeId', () => {
    it('should extract userId from challenge and send SMS', async () => {
      mockMfaService.getChallengeInfo.mockReturnValue({ exists: true, userId: 'user-123' });
      mockMfaService.sendSmsOtp.mockResolvedValue({ success: true });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.resendMfaCode({
        method: 'sms',
        phone: '+1234567890',
        challengeId: '00000000-0000-4000-8000-000000000012',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('SMS code sent');
    });

    it('should handle SMS send failure', async () => {
      mockMfaService.getChallengeInfo.mockReturnValue({ exists: false });
      mockMfaService.sendSmsOtp.mockResolvedValue({ success: false, error: 'No provider' });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.resendMfaCode({
        method: 'sms',
        phone: '+1234567890',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('resendMfaCode - email', () => {
    it('should send email OTP', async () => {
      mockMfaService.getChallengeInfo.mockReturnValue({ exists: true, userId: 'user-456' });
      mockMfaService.sendEmailOtp.mockResolvedValue({ success: true });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.resendMfaCode({
        method: 'email',
        email: 'test@example.com',
        challengeId: '00000000-0000-4000-8000-000000000013',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('resendMfaCode - invalid method', () => {
    it('should return failure for missing contact info', async () => {
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.resendMfaCode({ method: 'totp' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid MFA method');
    });
  });

  describe('resendMfaCode - exception handling', () => {
    it('should catch exceptions and return failure', async () => {
      mockMfaService.sendSmsOtp.mockRejectedValue(new Error('Network error'));
      mockMfaService.getChallengeInfo.mockReturnValue({ exists: false });
      const ctx = createPublicContext();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const caller = authRouter.createCaller(ctx);

      const result = await caller.resendMfaCode({
        method: 'sms',
        phone: '+1234567890',
      });

      expect(result.success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('setupMfa - SMS without phone', () => {
    it('should throw BAD_REQUEST when phone missing for SMS', async () => {
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.setupMfa({
          method: 'sms',
        })
      ).rejects.toThrow('Phone number required');
    });
  });

  describe('setupMfa - SMS send failure', () => {
    it('should throw INTERNAL_SERVER_ERROR when SMS send fails', async () => {
      mockMfaService.sendSmsOtp.mockResolvedValue({ success: false, error: 'Provider unavailable' });
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.setupMfa({
          method: 'sms',
          phone: '+1234567890',
        })
      ).rejects.toThrow('Provider unavailable');
    });
  });

  describe('setupMfa - email method', () => {
    it('should send email OTP for email method', async () => {
      mockMfaService.sendEmailOtp.mockResolvedValue({ success: true });
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.setupMfa({ method: 'email' });
      expect(result.success).toBe(true);
      expect(result.method).toBe('email');
    });

    it('should throw when email send fails', async () => {
      mockMfaService.sendEmailOtp.mockResolvedValue({ success: false, error: 'Failed' });
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      await expect(caller.setupMfa({ method: 'email' })).rejects.toThrow();
    });
  });

  describe('confirmMfa - no TOTP secret', () => {
    it('should throw BAD_REQUEST when MFA setup not found', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue(null);
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      await expect(
        caller.confirmMfa({
          method: 'totp',
          code: '123456',
        })
      ).rejects.toThrow('MFA setup not found');
    });
  });

  describe('getBackupCodes - no existing settings', () => {
    it('should create new settings when none exist', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue(null);
      mockMfaService.generateBackupCodes.mockReturnValue({
        codes: ['code1', 'code2'],
        generatedAt: new Date(),
      });
      mockMfaService.hashBackupCodes.mockReturnValue(['hash1', 'hash2']);
      mockMfaService.saveUserMfaSettings.mockResolvedValue(undefined);
      const ctx = createTestContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.getBackupCodes();
      expect(result.codes).toHaveLength(2);
      expect(result.warning).toContain('Save these codes');
    });
  });

  describe('getStatus - no auth header', () => {
    it('should return unauthenticated when no headers', async () => {
      const ctx = createPublicContext({
        req: { headers: { get: () => null } } as any,
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const caller = authRouter.createCaller(ctx);

      const result = await caller.getStatus();
      expect(result.authenticated).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('getStatus - invalid auth header format', () => {
    it('should return unauthenticated for non-Bearer token', async () => {
      const ctx = createPublicContext({
        req: {
          headers: {
            get: (name: string) => {
              if (name === 'Authorization' || name === 'authorization') return 'Basic abc123';
              return null;
            },
          },
        } as any,
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const caller = authRouter.createCaller(ctx);

      const result = await caller.getStatus();
      expect(result.authenticated).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('verifyEmail - error handling', () => {
    it('should throw BAD_REQUEST on Supabase OTP verification failure (IFC-120)', async () => {
      // IFC-120: verifyEmail now uses Supabase verifyOtp, throws BAD_REQUEST on failure
      // Re-set after vi.clearAllMocks() wipes declaration-time mockResolvedValue
      mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token expired' } });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      // verifyOtp mock returns error → BAD_REQUEST
      await expect(
        caller.verifyEmail({
          token_hash: 'invalid-hash',
          type: 'email',
        })
      ).rejects.toThrow('Verification link is invalid or has expired');
    });
  });

  describe('resendVerification - error handling', () => {
    it('should always return success even on Supabase failure (IFC-120 AC-007)', async () => {
      // IFC-120: resendVerification silently swallows errors to prevent email enumeration
      mockSupabaseResend.mockResolvedValue({ data: {}, error: { message: 'Rate limited' } });
      const ctx = createPublicContext();
      const caller = authRouter.createCaller(ctx);

      const result = await caller.resendVerification({
        email: 'test@example.com',
      });

      // Always returns success regardless of internal errors (AC-007)
      expect(result.success).toBe(true);
    });
  });
});
