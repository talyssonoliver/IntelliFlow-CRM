/**
 * MFA Management Router Tests
 * PG-125: Tests for getMfaStatus, disableMfa, regenerateBackupCodes
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createMockMfaService } from './fixtures/mock-mfa-service';

// Test UUIDs
const TEST_USER = {
  userId: '12345678-1234-4000-8000-000000000001',
  email: 'test@example.com',
  tenantId: '12345678-1234-4000-8000-000000000004',
  role: 'USER' as const,
};

// Mock services
const mockMfaService = createMockMfaService();
const mockAuditLogger = {
  logLoginFailure: vi.fn(),
  logLoginSuccess: vi.fn(),
  log: vi.fn(),
};

const mockSignIn = vi.fn();

// Mock modules
vi.mock('../../../services/mfa.service', () => ({
  getMfaService: () => mockMfaService,
  resetMfaService: vi.fn(),
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => mockAuditLogger,
}));

vi.mock('../../../security/login-limiter', () => ({
  getLoginLimiter: () => ({
    checkAllowed: vi.fn(),
    recordFailed: vi.fn().mockReturnValue({ isLocked: false }),
    recordSuccess: vi.fn(),
  }),
}));

vi.mock('../../../services/session.service', () => ({
  getSessionService: () => ({
    parseDeviceInfo: vi.fn().mockReturnValue({}),
    createSession: vi.fn(),
    getUserSessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn(),
    revokeAllUserSessions: vi.fn(),
  }),
}));

vi.mock('../../../lib/supabase', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOutUser: vi.fn().mockResolvedValue({ error: null }),
  getSession: vi.fn().mockResolvedValue({ session: null, error: null }),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyToken: vi.fn(),
  supabaseAdmin: { auth: { signUp: vi.fn(), resend: vi.fn(), verifyOtp: vi.fn() } },
  resetPasswordForEmail: vi.fn(),
  updateUserPassword: vi.fn(),
}));

// Import router after mocks — loaded in beforeAll to avoid top-level await
let authRouter: any;

// Create caller helpers
function createProtectedCaller() {
  const headers = new Headers();
  headers.set('x-csrf-token', 'test-csrf-token');
  const ctx = {
    prisma: {} as any,
    user: TEST_USER,
    req: { headers },
  };
  return authRouter.createCaller(ctx);
}

// Each test advances Date.now by 16 min so in-memory rate limiter window resets
let testTimeOffset = 0;
const realDateNow = Date.now;

describe('MFA Management Router (PG-125)', () => {
  beforeAll(async () => {
    const mod = await import('../auth.router.js');
    authRouter = mod.authRouter;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    testTimeOffset += 16 * 60 * 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => realDateNow() + testTimeOffset);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMfaStatus', () => {
    it('should return disabled status when MFA is not set up', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue(null);
      const caller = createProtectedCaller();
      const result = await caller.getMfaStatus();
      expect(result.enabled).toBe(false);
      expect(result.methods.totp).toBe(false);
      expect(result.backupCodesRemaining).toBe(0);
    });

    it('should return enabled status with methods', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue({
        userId: TEST_USER.userId,
        totpEnabled: true,
        totpSecret: 'secret',
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: ['h1', 'h2', 'h3'],
      });
      const caller = createProtectedCaller();
      const result = await caller.getMfaStatus();
      expect(result.enabled).toBe(true);
      expect(result.methods.totp).toBe(true);
      expect(result.backupCodesRemaining).toBe(3);
    });

    it('should not expose TOTP secret', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue({
        userId: TEST_USER.userId,
        totpEnabled: true,
        totpSecret: 'SUPER_SECRET',
        smsEnabled: false,
        emailEnabled: false,
      });
      const caller = createProtectedCaller();
      const result = await caller.getMfaStatus();
      expect(JSON.stringify(result)).not.toContain('SUPER_SECRET');
    });
  });

  describe('disableMfa', () => {
    beforeEach(() => {
      mockMfaService.getUserMfaSettings.mockResolvedValue({
        userId: TEST_USER.userId,
        totpEnabled: true,
        totpSecret: 'secret',
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: ['h1'],
      });
    });

    it('should disable MFA with valid TOTP code', async () => {
      mockMfaService.verifyTotpTimingSafe.mockReturnValue(true);
      mockMfaService.saveUserMfaSettings.mockResolvedValue(undefined);
      mockAuditLogger.log.mockResolvedValue(undefined);

      const caller = createProtectedCaller();
      const result = await caller.disableMfa({ totpCode: '123456' });
      expect(result.success).toBe(true);
      expect(mockMfaService.saveUserMfaSettings).toHaveBeenCalledWith(
        expect.objectContaining({ totpEnabled: false }),
        TEST_USER.tenantId
      );
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MfaDisabled' })
      );
    });

    it('should disable MFA with valid password', async () => {
      mockSignIn.mockResolvedValue({ user: {}, session: {}, error: null });
      mockMfaService.saveUserMfaSettings.mockResolvedValue(undefined);
      mockAuditLogger.log.mockResolvedValue(undefined);

      const caller = createProtectedCaller();
      const result = await caller.disableMfa({ password: 'ValidP@ssword1' }); // pragma: allowlist secret
      expect(result.success).toBe(true);
    });

    it('should reject invalid TOTP code', async () => {
      mockMfaService.verifyTotpTimingSafe.mockReturnValue(false);

      const caller = createProtectedCaller();
      await expect(caller.disableMfa({ totpCode: '000000' })).rejects.toThrow(TRPCError);
    });

    it('should reject invalid password', async () => {
      mockSignIn.mockResolvedValue({ user: null, session: null, error: new Error('Invalid') });

      const caller = createProtectedCaller();
      await expect(caller.disableMfa({ password: 'WrongPassword1' })).rejects.toThrow(TRPCError);
    });

    it('should return BAD_REQUEST when MFA already disabled', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue({
        userId: TEST_USER.userId,
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
      });

      const caller = createProtectedCaller();
      await expect(caller.disableMfa({ totpCode: '123456' })).rejects.toThrow('not currently enabled');
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should regenerate codes with valid TOTP', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue({
        userId: TEST_USER.userId,
        totpEnabled: true,
        totpSecret: 'secret',
        smsEnabled: false,
        emailEnabled: false,
      });
      mockMfaService.verifyTotpTimingSafe.mockReturnValue(true);
      mockMfaService.generateBackupCodes.mockReturnValue({
        codes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5', 'CODE6', 'CODE7', 'CODE8'],
        generatedAt: new Date(),
      });
      mockMfaService.hashBackupCodes.mockReturnValue(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8']);
      mockMfaService.saveUserMfaSettings.mockResolvedValue(undefined);
      mockAuditLogger.log.mockResolvedValue(undefined);

      const caller = createProtectedCaller();
      const result = await caller.regenerateBackupCodes({ totpCode: '123456' });
      expect(result.codes).toHaveLength(8);
      expect(result.warning).toContain('invalidated');
    });

    it('should reject invalid TOTP code', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue({
        userId: TEST_USER.userId,
        totpEnabled: true,
        totpSecret: 'secret',
        smsEnabled: false,
        emailEnabled: false,
      });
      mockMfaService.verifyTotpTimingSafe.mockReturnValue(false);

      const caller = createProtectedCaller();
      await expect(caller.regenerateBackupCodes({ totpCode: '000000' })).rejects.toThrow('Invalid TOTP');
    });

    it('should reject when MFA not enabled', async () => {
      mockMfaService.getUserMfaSettings.mockResolvedValue(null);

      const caller = createProtectedCaller();
      await expect(caller.regenerateBackupCodes({ totpCode: '123456' })).rejects.toThrow('must be enabled');
    });
  });
});
