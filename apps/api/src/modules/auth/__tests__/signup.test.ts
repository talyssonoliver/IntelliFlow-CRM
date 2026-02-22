/**
 * Signup Tests
 *
 * Tests for the signup tRPC procedure.
 * IMPLEMENTS: IFC-120 (AC-003)
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

describe('Signup Procedure (IFC-120)', () => {
  const createMockContext = () => ({
    prisma: {} as any,
    req: {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'Mozilla/5.0 Test Agent',
      },
    } as unknown as Request,
    user: undefined,
  });

  const validSignup = {
    email: 'newuser@example.com',
    password: 'StrongP@ss1',
    confirmPassword: 'StrongP@ss1',
    name: 'New User',
    acceptTerms: true as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseAdmin.auth.signUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'newuser@example.com',
          identities: [{ id: 'identity-1' }],
        },
        session: null,
      },
      error: null,
    });
  });

  it('calls supabaseAdmin.auth.signUp and returns needsEmailVerification (AC-003)', async () => {
    const caller = authRouter.createCaller(createMockContext() as any);

    const result = await caller.signup(validSignup);

    expect(result).toEqual({ success: true, needsEmailVerification: true });
    expect(mockSupabaseAdmin.auth.signUp).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      password: 'StrongP@ss1',
      options: { data: { name: 'New User' } },
    });
  });

  it('throws CONFLICT for duplicate email (already registered error)', async () => {
    mockSupabaseAdmin.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    });

    const caller = authRouter.createCaller(createMockContext() as any);

    try {
      await caller.signup(validSignup);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('CONFLICT');
    }
  });

  it('throws CONFLICT for empty identities (Supabase duplicate detection)', async () => {
    mockSupabaseAdmin.auth.signUp.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'existing@example.com', identities: [] },
        session: null,
      },
      error: null,
    });

    const caller = authRouter.createCaller(createMockContext() as any);

    try {
      await caller.signup(validSignup);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('CONFLICT');
    }
  });

  it('throws INTERNAL_SERVER_ERROR for generic Supabase error', async () => {
    mockSupabaseAdmin.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Database connection failed' },
    });

    const caller = authRouter.createCaller(createMockContext() as any);

    try {
      await caller.signup(validSignup);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
    }
  });

  it('rejects validation errors — weak password', async () => {
    const caller = authRouter.createCaller(createMockContext() as any);

    await expect(
      caller.signup({
        email: 'user@example.com',
        password: 'weak',
        confirmPassword: 'weak',
        name: 'User',
        acceptTerms: true as const,
      })
    ).rejects.toThrow();
  });
});
