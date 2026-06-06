/**
 * Auth Router Tests
 *
 * @implements PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { authRouter, clearStatusCache } from '../auth.router';
import type { UserSession } from '../../../context';
import { createTestContext, prismaMock } from '../../../test/setup';

const {
  mockLoginLimiter,
  mockAuditLogger,
  mockMfaService,
  mockSessionService,
  mockSignIn,
  mockSignOut,
  mockSignOutUser,
  mockGetSession,
  mockVerifyToken,
  mockSignInWithOAuth,
  mockExchangeCodeForSession,
  mockVerifyOtp,
  mockSupabaseSignUp,
  mockSupabaseResend,
  mockResetPasswordForEmail,
  mockUpdateUserPassword,
} = vi.hoisted(() => ({
  mockLoginLimiter: {
    checkAllowed: vi.fn(),
    recordFailed: vi.fn(),
    recordSuccess: vi.fn(),
  },
  mockAuditLogger: {
    logLoginFailure: vi.fn(),
    logLoginSuccess: vi.fn(),
    log: vi.fn(),
  },
  mockMfaService: {
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
    verifyTotpTimingSafe: vi.fn(),
    saveUserMfaSettings: vi.fn(),
    generateBackupCodes: vi.fn(),
    hashBackupCodes: vi.fn(),
  },
  mockSessionService: {
    parseDeviceInfo: vi.fn(),
    createSession: vi.fn(),
    getUserSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllUserSessions: vi.fn(),
  },
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
  mockSignOutUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockSignInWithOAuth: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockSupabaseSignUp: vi.fn(),
  mockSupabaseResend: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
  mockUpdateUserPassword: vi.fn(),
}));

// Test UUIDs for valid input
const TEST_UUIDS = {
  user: '12345678-1234-4000-8000-000000000001',
  session: '12345678-1234-4000-8000-000000000002',
  challenge: '12345678-1234-4000-8000-000000000003',
  tenant: '12345678-1234-4000-8000-000000000004',
  nonExistentSession: '12345678-1234-4000-8000-000000000099',
  expiredChallenge: '12345678-1234-4000-8000-000000000098',
};

// Mock data that will be reused
const mockSupabaseUser = {
  id: TEST_UUIDS.user,
  email: 'test@example.com',
  user_metadata: {
    name: 'Test User',
    role: 'USER',
  },
};

const mockSupabaseSession = {
  access_token: 'access_token_123',
  refresh_token: 'refresh_token_123',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: mockSupabaseUser,
};

// Mock the service factory functions
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

// Avoid cross-test pollution from the module-scoped authProcedure rate limiter.
// Dedicated middleware/trpc suites cover the actual 5 req/min behavior.
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

// IFC-120: Mock supabaseAdmin for new auth flows
// Mock Supabase
vi.mock('../../../lib/supabase', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  signOutUser: (...args: unknown[]) => mockSignOutUser(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
  exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
  // IFC-120: Supabase admin client for auth flows
  supabaseAdmin: {
    auth: {
      signUp: (...args: unknown[]) => mockSupabaseSignUp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      resend: (...args: unknown[]) => mockSupabaseResend(...args),
    },
  },
  resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
  updateUserPassword: (...args: unknown[]) => mockUpdateUserPassword(...args),
}));

// Import mocked supabase after mocking
import {
  signIn,
  signOut,
  getSession,
  signInWithOAuth,
  exchangeCodeForSession,
} from '../../../lib/supabase';

describe('authRouter', () => {
  // Create mock context using createTestContext from test/setup (returns BaseContext)
  const createMockContext = (options: { authenticated?: boolean } = {}) => {
    if (options.authenticated) {
      return createTestContext({
        prisma: prismaMock,
        user: {
          userId: TEST_UUIDS.user,
          email: 'test@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
        } as UserSession,
      });
    }

    return createTestContext({
      prisma: prismaMock,
      user: undefined,
    });
  };

  // Helper to reset and setup all mocks with default values
  function setupDefaultMocks() {
    // Reset all mocks
    vi.clearAllMocks();

    // Login limiter defaults
    mockLoginLimiter.checkAllowed.mockReturnValue(undefined);
    mockLoginLimiter.recordFailed.mockReturnValue({ isLocked: false });
    mockLoginLimiter.recordSuccess.mockReturnValue(undefined);

    // Audit logger defaults
    mockAuditLogger.logLoginFailure.mockReturnValue(undefined);
    mockAuditLogger.logLoginSuccess.mockReturnValue(undefined);
    mockAuditLogger.log.mockReturnValue(undefined);

    // MFA service defaults
    mockMfaService.isUserMfaEnabled.mockResolvedValue(false);
    mockMfaService.getAvailableMfaMethods.mockResolvedValue(['totp']);
    mockMfaService.createChallenge.mockReturnValue({ id: TEST_UUIDS.challenge });
    mockMfaService.getChallengeInfo.mockReturnValue({ exists: true, userId: TEST_UUIDS.user });
    mockMfaService.verifyChallenge.mockResolvedValue({ success: true });
    mockMfaService.generateTotpSecret.mockReturnValue({
      secret: 'ABCDEFGHIJ',
      otpauthUrl: 'otpauth://totp/IntelliFlow:test@example.com?secret=ABCDEFGHIJ',
    });
    mockMfaService.sendSmsOtp.mockResolvedValue({ success: true });
    mockMfaService.sendEmailOtp.mockResolvedValue({ success: true });
    mockMfaService.getUserMfaSettings.mockResolvedValue({
      totpSecret: 'ABCDEFGHIJ',
      totpEnabled: false,
    });
    mockMfaService.verifyTotp.mockReturnValue(true);
    mockMfaService.verifyTotpTimingSafe.mockReturnValue(true);
    mockMfaService.saveUserMfaSettings.mockResolvedValue(undefined);
    mockMfaService.generateBackupCodes.mockReturnValue({
      codes: ['CODE1', 'CODE2', 'CODE3'],
      generatedAt: new Date(),
    });
    mockMfaService.hashBackupCodes.mockReturnValue(['hashed1', 'hashed2', 'hashed3']);

    // Session service defaults
    mockSessionService.parseDeviceInfo.mockReturnValue({
      browser: 'Chrome',
      os: 'Windows',
      device: 'Desktop',
    });
    mockSessionService.createSession.mockResolvedValue({ id: TEST_UUIDS.session });
    mockSessionService.getUserSessions.mockResolvedValue([]);
    mockSessionService.revokeSession.mockResolvedValue(true);
    mockSessionService.revokeAllUserSessions.mockResolvedValue(1);

    // Supabase defaults
    mockSignIn.mockResolvedValue({
      user: mockSupabaseUser,
      session: mockSupabaseSession,
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });
    mockSignOutUser.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({
      session: mockSupabaseSession,
      error: null,
    });
    mockVerifyToken.mockResolvedValue({
      user: mockSupabaseUser,
      error: null,
    });
    mockSignInWithOAuth.mockResolvedValue({
      url: 'https://oauth.example.com/authorize',
      error: null,
    });
    mockExchangeCodeForSession.mockResolvedValue({
      session: mockSupabaseSession,
      user: mockSupabaseUser,
      error: null,
    });
    mockVerifyOtp.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
      error: null,
    });
    mockSupabaseSignUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockSupabaseResend.mockResolvedValue({ data: {}, error: null });
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mockUpdateUserPassword.mockResolvedValue({ data: {}, error: null });

    const defaultUserRow = {
      id: TEST_UUIDS.user,
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER',
      tenantId: TEST_UUIDS.tenant,
      avatarUrl: null,
      stripeCustomerId: null,
      timezone: 'UTC',
    };
    prismaMock.user.findUnique.mockResolvedValue(defaultUserRow as any);
    // ensureAppUserSession fires `prisma.user.update(...).catch(...)` on every
    // authenticated flow (login / oauthCallback / verifyMfa). Without a default
    // thenable, `.catch` is called on undefined and throws.
    prismaMock.user.update.mockResolvedValue(defaultUserRow as any);
  }

  beforeEach(() => {
    setupDefaultMocks();
    // getStatus no longer keeps its own result cache (it reuses ctx.user); this
    // is now a no-op retained for back-compat. Harmless to keep calling.
    clearStatusCache();
  });

  // ============================================
  // Login Tests
  // ============================================

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.login({
        email: 'test@example.com',
        password: 'password123!!',
      });

      expect(result.success).toBe(true);
      expect(result.requiresMfa).toBe(false);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('test@example.com');
      expect(result.session).toBeDefined();
      expect(mockLoginLimiter.checkAllowed).toHaveBeenCalled();
      expect(mockLoginLimiter.recordSuccess).toHaveBeenCalled();
      expect(mockAuditLogger.logLoginSuccess).toHaveBeenCalled();
      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_UUIDS.user,
          tenantId: TEST_UUIDS.tenant,
        })
      );
    });

    it('should return MFA challenge when MFA is enabled', async () => {
      mockMfaService.isUserMfaEnabled.mockResolvedValueOnce(true);
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.login({
        email: 'test@example.com',
        password: 'password123!!',
      });

      expect(result.success).toBe(false);
      expect(result.requiresMfa).toBe(true);
      expect(result.mfaChallengeId).toBe(TEST_UUIDS.challenge);
      expect(result.mfaMethods).toContain('totp');
    });

    it('should reject invalid credentials', async () => {
      mockSignIn.mockResolvedValueOnce({
        user: null,
        session: null,
        error: { message: 'Invalid credentials' } as Error,
      });

      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.login({
          email: 'test@example.com',
          password: 'wrong_password',
        })
      ).rejects.toThrow(TRPCError);

      expect(mockLoginLimiter.recordFailed).toHaveBeenCalled();
      expect(mockAuditLogger.logLoginFailure).toHaveBeenCalled();
    });

    it('should lock account after too many failed attempts', async () => {
      mockSignIn.mockResolvedValueOnce({
        user: null,
        session: null,
        error: { message: 'Invalid credentials' } as Error,
      });

      mockLoginLimiter.recordFailed.mockReturnValueOnce({
        isLocked: true,
        lockoutDuration: 900000, // 15 minutes
      });

      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.login({
          email: 'test@example.com',
          password: 'wrong_password',
        })
      ).rejects.toThrow(/Account locked/);
    });
  });

  // ============================================
  // OAuth Tests
  // ============================================

  describe('loginWithOAuth', () => {
    it('should initiate OAuth flow and return URL', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.loginWithOAuth({
        provider: 'google',
        redirectTo: 'https://app.example.com/callback',
      });

      expect(result.url).toBe('https://oauth.example.com/authorize');
      expect(result.provider).toBe('google');
    });

    it('should throw error when OAuth fails', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({
        url: null,
        error: { message: 'OAuth failed' } as Error,
      });

      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.loginWithOAuth({
          provider: 'google',
          redirectTo: 'https://app.example.com/callback',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('oauthCallback', () => {
    it('should exchange code for session', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.oauthCallback({
        code: 'auth_code_123',
        state: 'state_123',
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('test@example.com');
      expect(result.session).toBeDefined();
      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_UUIDS.user,
          tenantId: TEST_UUIDS.tenant,
        })
      );
      expect(mockAuditLogger.logLoginSuccess).toHaveBeenCalled();
    });

    it('should handle OAuth error response', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      // When error is provided, code can be a placeholder since error takes precedence
      await expect(
        caller.oauthCallback({
          code: 'unused_code',
          state: 'state_123',
          error: 'access_denied',
          errorDescription: 'User denied access',
        })
      ).rejects.toThrow(/User denied access/);
    });
  });

  // ============================================
  // MFA Tests
  // ============================================

  describe('verifyMfa', () => {
    it('should verify MFA code and complete login', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.verifyMfa({
        challengeId: TEST_UUIDS.challenge,
        code: '123456',
        method: 'totp',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(mockMfaService.verifyChallenge).toHaveBeenCalledWith(TEST_UUIDS.challenge, '123456');
      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_UUIDS.user,
          tenantId: TEST_UUIDS.tenant,
        })
      );
    });

    it('should reject invalid MFA code', async () => {
      mockMfaService.verifyChallenge.mockResolvedValueOnce({
        success: false,
        error: 'Invalid code',
      });

      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.verifyMfa({
          challengeId: TEST_UUIDS.challenge,
          code: '000000',
          method: 'totp',
        })
      ).rejects.toThrow(/Invalid code/);
    });

    it('should reject expired challenge', async () => {
      mockMfaService.getChallengeInfo.mockReturnValueOnce({ exists: false });

      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.verifyMfa({
          challengeId: TEST_UUIDS.expiredChallenge,
          code: '123456',
          method: 'totp',
        })
      ).rejects.toThrow(/Invalid or expired MFA challenge/);
    });
  });

  describe('resendMfaCode', () => {
    it('should resend SMS MFA code', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.resendMfaCode({
        method: 'sms',
        phone: '+1234567890',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('SMS code sent');
      expect(mockMfaService.sendSmsOtp).toHaveBeenCalledWith('+1234567890', expect.any(String));
    });

    it('should resend email MFA code', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.resendMfaCode({
        method: 'email',
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Email code sent');
      expect(mockMfaService.sendEmailOtp).toHaveBeenCalled();
    });
  });

  // ============================================
  // Logout Tests
  // ============================================

  describe('logout', () => {
    it('should logout user and revoke sessions', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.logout();

      expect(result.success).toBe(true);
      expect(result.sessionsRevoked).toBe(1);
      expect(mockSignOutUser).toHaveBeenCalledWith(TEST_UUIDS.user);
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(TEST_UUIDS.user);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'UserLogout',
          action: 'LOGOUT',
        })
      );
    });
  });

  // ============================================
  // Session Management Tests
  // ============================================

  describe('refreshSession', () => {
    it('should refresh session token', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.refreshSession({
        refreshToken: 'refresh_token_123',
      });

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.accessToken).toBeDefined();
    });

    it('should throw error for expired session', async () => {
      mockGetSession.mockResolvedValueOnce({
        session: null,
        error: { message: 'Session expired' } as Error,
      });

      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.refreshSession({
          refreshToken: 'expired_token',
        })
      ).rejects.toThrow(/Session expired/);
    });
  });

  describe('getSessions', () => {
    it('should return user sessions', async () => {
      mockSessionService.getUserSessions.mockResolvedValue([
        { id: 'session_1', deviceInfo: { browser: 'Chrome' } },
        { id: 'session_2', deviceInfo: { browser: 'Firefox' } },
      ]);

      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.getSessions();

      expect(result.sessions).toHaveLength(2);
      expect(result.maxSessions).toBe(3);
    });
  });

  describe('revokeSession', () => {
    it('should revoke specific session', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.revokeSession({
        sessionId: TEST_UUIDS.session,
      });

      expect(result.success).toBe(true);
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(TEST_UUIDS.session);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'SessionRevoked',
          action: 'DELETE',
        })
      );
    });

    it('should throw error for non-existent session', async () => {
      mockSessionService.revokeSession.mockResolvedValue(false);

      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.revokeSession({
          sessionId: TEST_UUIDS.nonExistentSession,
        })
      ).rejects.toThrow(/Session not found/);
    });
  });

  // ============================================
  // MFA Setup Tests
  // ============================================

  describe('setupMfa', () => {
    it('should setup TOTP MFA', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.setupMfa({
        method: 'totp',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('totp');
      if (result.method !== 'totp') {
        throw new Error(`Expected TOTP MFA setup, received ${result.method}`);
      }
      expect(result.secret).toBeDefined();
      expect(result.qrCodeUrl).toContain('otpauth://');
    });

    it('should setup SMS MFA', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.setupMfa({
        method: 'sms',
        phone: '+1234567890',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('sms');
      if (result.method !== 'sms') {
        throw new Error(`Expected SMS MFA setup, received ${result.method}`);
      }
      expect(result.codeSentTo).toBe('+1234567890');
      expect(mockMfaService.sendSmsOtp).toHaveBeenCalled();
    });

    it('should require phone for SMS MFA', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.setupMfa({
          method: 'sms',
        })
      ).rejects.toThrow(/Phone number required/);
    });

    it('should setup email MFA', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.setupMfa({
        method: 'email',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('email');
      expect(mockMfaService.sendEmailOtp).toHaveBeenCalled();
    });
  });

  describe('confirmMfa', () => {
    it('should confirm and enable TOTP MFA', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.confirmMfa({
        method: 'totp',
        code: '123456',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('totp');
      expect(mockMfaService.verifyTotpTimingSafe).toHaveBeenCalled();
      expect(mockMfaService.saveUserMfaSettings).toHaveBeenCalled();
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MfaEnabled',
        })
      );
    });

    it('should reject invalid TOTP code', async () => {
      mockMfaService.verifyTotp.mockReturnValue(false);
      mockMfaService.verifyTotpTimingSafe.mockReturnValue(false);

      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      await expect(
        caller.confirmMfa({
          method: 'totp',
          code: '000000',
        })
      ).rejects.toThrow(/Invalid verification code/);
    });
  });

  describe('getBackupCodes', () => {
    it('should generate backup codes', async () => {
      const mockContext = createMockContext({ authenticated: true });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.getBackupCodes();

      expect(result.codes).toHaveLength(3);
      expect(result.generatedAt).toBeDefined();
      expect(result.warning).toContain('Save these codes');
      expect(mockMfaService.saveUserMfaSettings).toHaveBeenCalled();
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'BackupCodesGenerated',
        })
      );
    });
  });

  // ============================================
  // Auth Status Tests
  // ============================================

  describe('getStatus', () => {
    it('should return authenticated status from ctx.user (no DB round-trip)', async () => {
      // getStatus reuses the already-resolved ctx.user (resolved + cached once
      // per request in context.ts). It performs NO database read of its own —
      // the avatar travels on the session.
      const mockContext = createTestContext({
        prisma: prismaMock,
        user: {
          userId: TEST_UUIDS.user,
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
          avatarUrl: 'https://cdn.example.com/avatar.png',
        },
      });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.getStatus();

      expect(result.authenticated).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('test@example.com');
      expect(result.user?.role).toBe('USER');
      expect(result.user?.avatar).toBe('https://cdn.example.com/avatar.png');
    });

    it('should not issue any Prisma user query (N+1 elimination)', async () => {
      const mockContext = createTestContext({
        prisma: prismaMock,
        user: {
          userId: TEST_UUIDS.user,
          email: 'test@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
        },
      });
      const caller = authRouter.createCaller(mockContext);

      await caller.getStatus();

      // The whole point of the unification: getStatus must not re-resolve the
      // user from the database — that is the N+1 we removed.
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('should return null avatar when the session has none', async () => {
      const mockContext = createTestContext({
        prisma: prismaMock,
        user: {
          userId: TEST_UUIDS.user,
          email: 'noavatar@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
        },
      });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.getStatus();

      expect(result.authenticated).toBe(true);
      expect(result.user?.avatar).toBeNull();
    });

    it('should return unauthenticated when ctx.user is absent', async () => {
      const mockContext = createTestContext({
        prisma: prismaMock,
        user: undefined,
      });
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.getStatus();

      expect(result.authenticated).toBe(false);
    });
  });

  // ============================================
  // Email Verification Tests
  // ============================================

  describe('verifyEmail', () => {
    it('should process email verification via Supabase (IFC-120)', async () => {
      // Re-set after vi.clearAllMocks() wipes declaration-time mockResolvedValue
      mockVerifyOtp.mockResolvedValue({
        data: { user: { email: 'test@example.com' } },
        error: null,
      });
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.verifyEmail({
        token_hash: 'a'.repeat(64), // Supabase token hash
        type: 'email',
      });

      expect(result.success).toBe(true);
      expect(result.email).toBeDefined();
    });
  });

  describe('resendVerification', () => {
    it('should resend verification email and always return success (AC-007)', async () => {
      mockSupabaseResend.mockResolvedValue({ data: {}, error: null });
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.resendVerification({
        email: 'test@example.com',
      });

      // IFC-120: Always returns success to prevent email enumeration
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Security Fix #6: authProcedure rate limiting
  // ============================================

  describe('Fix #6: login/signup/resetPassword use authProcedure (5 req/min)', () => {
    it('should successfully call login — authProcedure does not block legitimate requests', async () => {
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      // A single login request must succeed (rate limit is 5/min; one call is fine)
      const result = await caller.login({
        email: 'test@example.com',
        password: 'password123!!',
      });

      expect(result.success).toBe(true);
    });

    it('should successfully call requestPasswordReset — authProcedure does not block', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.requestPasswordReset({
        email: 'test@example.com',
      });

      // Always returns success to prevent email enumeration
      expect(result.success).toBe(true);
    });

    it('should successfully call resetPassword — authProcedure does not block', async () => {
      mockUpdateUserPassword.mockResolvedValue({ data: {}, error: null });
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.resetPassword({
        token: 'a'.repeat(20),
        password: 'NewSecureP@ss12',
        confirmPassword: 'NewSecureP@ss12',
      });

      expect(result.success).toBe(true);
    });

    it('should successfully call signup — authProcedure does not block', async () => {
      mockSupabaseSignUp.mockResolvedValue({
        data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
        error: null,
      });
      const mockContext = createMockContext();
      const caller = authRouter.createCaller(mockContext);

      const result = await caller.signup({
        email: 'newuser2@example.com',
        password: 'StrongP@ssword1',
        confirmPassword: 'StrongP@ssword1',
        name: 'New User',
        acceptTerms: true,
      });

      expect(result.success).toBe(true);
    });
  });
});
