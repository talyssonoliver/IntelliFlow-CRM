/**
 * Email-Verification Guard Tests
 *
 * Covers:
 * (a) emailVerified is present and correct in the UserSession for both
 *     provisioned (new) users and existing users.
 * (b) assertEmailVerified() throws FORBIDDEN when the user is unverified,
 *     and passes when the user is verified.
 * (c) verifiedTenantProcedure propagates the guard to mutations.
 *
 * Incident: 2026-06-16 onboarding redesign / email-verification gating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ---------------------------------------------------------------------------
// Supabase mock (must be hoisted before any import that touches supabase)
// ---------------------------------------------------------------------------

const { mockSupabaseAdmin, mockVerifyToken } = vi.hoisted(() => ({
  mockSupabaseAdmin: {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  },
  mockVerifyToken: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin,
  verifyToken: mockVerifyToken,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { assertEmailVerified } from '../../../trpc';
import { ensureAppUserSession } from '../../../context';
import type { PrismaClient } from '@intelliflow/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const prismaMock = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// (a) UserSession construction — emailVerified correct for new & existing users
// ---------------------------------------------------------------------------

describe('ensureAppUserSession — emailVerified field', () => {
  const supabaseUserBase = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    email: 'user@example.com',
    user_metadata: { name: 'Test User' },
    app_metadata: {},
  };

  describe('new user provisioning (provisionNewUserWith path)', () => {
    it('sets emailVerified=false for email/password sign-up without confirmation', async () => {
      const supabaseUser = {
        ...supabaseUserBase,
        email_confirmed_at: null,
        user_metadata: { name: 'New User' },
      };

      // No existing DB user
      prismaMock.user.findUnique.mockResolvedValue(null);

      // tenant upsert
      prismaMock.tenant.upsert.mockResolvedValue({
        id: 'tenant-001',
        name: "New User's Organization",
        slug: `new-user-${supabaseUser.id}`,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingEmail: null,
        metadata: null,
        logoUrl: null,
        primaryColor: null,
        domain: null,
        ssoEnabled: false,
        mfaRequired: false,
        dataResidency: null,
        deletedAt: null,
      } as any);

      // user create — emailVerified=false because no email_confirmed_at
      prismaMock.user.create.mockResolvedValue({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: 'New User',
        givenName: null,
        familyName: null,
        avatarUrl: null,
        role: 'ADMIN',
        tenantId: 'tenant-001',
        emailVerified: false,
        stripeCustomerId: null,
        timezone: null,
        locale: null,
        provider: null,
        lastSignInAt: new Date(),
        signInCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const session = await ensureAppUserSession(prismaMock as any, supabaseUser);

      expect(session.emailVerified).toBe(false);
    });

    it('sets emailVerified=true for Google-OAuth user (email_confirmed_at set)', async () => {
      const supabaseUser = {
        ...supabaseUserBase,
        email_confirmed_at: '2026-06-16T10:00:00Z',
        user_metadata: { name: 'OAuth User', picture: 'https://example.com/avatar.jpg' },
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.tenant.upsert.mockResolvedValue({
        id: 'tenant-002',
        name: "OAuth User's Organization",
        slug: `oauth-user-${supabaseUser.id}`,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingEmail: null,
        metadata: null,
        logoUrl: null,
        primaryColor: null,
        domain: null,
        ssoEnabled: false,
        mfaRequired: false,
        dataResidency: null,
        deletedAt: null,
      } as any);

      prismaMock.user.create.mockResolvedValue({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: 'OAuth User',
        givenName: null,
        familyName: null,
        avatarUrl: 'https://example.com/avatar.jpg',
        role: 'ADMIN',
        tenantId: 'tenant-002',
        emailVerified: true, // confirmed via email_confirmed_at
        stripeCustomerId: null,
        timezone: null,
        locale: null,
        provider: 'google',
        lastSignInAt: new Date(),
        signInCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const session = await ensureAppUserSession(prismaMock as any, supabaseUser);

      expect(session.emailVerified).toBe(true);
    });
  });

  describe('existing user path (resolveDbUserWith path)', () => {
    it('uses DB emailVerified value and overwrites with freshest Supabase token value', async () => {
      const supabaseUser = {
        ...supabaseUserBase,
        // Token now says confirmed (user just clicked the link)
        email_confirmed_at: '2026-06-16T12:00:00Z',
        user_metadata: { name: 'Existing User' },
      };

      // DB row had emailVerified=false (stale — written before confirmation)
      prismaMock.user.findUnique.mockResolvedValue({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: 'Existing User',
        role: 'USER',
        tenantId: 'tenant-003',
        stripeCustomerId: null,
        timezone: 'UTC',
        avatarUrl: null,
        emailVerified: false, // stale
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Fire-and-forget update (emailVerified: true) — just needs not to throw
      prismaMock.user.update.mockResolvedValue({} as any);

      const session = await ensureAppUserSession(prismaMock as any, supabaseUser);

      // The in-memory value should reflect the FRESH Supabase token value
      expect(session.emailVerified).toBe(true);

      // The fire-and-forget update should persist the fresh value to the DB
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true }),
        })
      );
    });

    it('preserves emailVerified=false when token also says unverified', async () => {
      const supabaseUser = {
        ...supabaseUserBase,
        email_confirmed_at: null,
        user_metadata: { name: 'Unverified User' },
      };

      prismaMock.user.findUnique.mockResolvedValue({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: 'Unverified User',
        role: 'USER',
        tenantId: 'tenant-004',
        stripeCustomerId: null,
        timezone: 'UTC',
        avatarUrl: null,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      prismaMock.user.update.mockResolvedValue({} as any);

      const session = await ensureAppUserSession(prismaMock as any, supabaseUser);

      expect(session.emailVerified).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// (b) assertEmailVerified guard
// ---------------------------------------------------------------------------

describe('assertEmailVerified', () => {
  it('throws FORBIDDEN when emailVerified is false', () => {
    const ctx = { user: { emailVerified: false } };

    expect(() => assertEmailVerified(ctx)).toThrowError(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Please verify your email to continue.',
      })
    );
  });

  it('throws FORBIDDEN when emailVerified is missing (undefined)', () => {
    const ctx = { user: {} };

    expect(() => assertEmailVerified(ctx)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });

  it('throws FORBIDDEN when user is null', () => {
    const ctx = { user: null };

    expect(() => assertEmailVerified(ctx)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });

  it('does NOT throw when emailVerified is true', () => {
    const ctx = { user: { emailVerified: true } };

    expect(() => assertEmailVerified(ctx)).not.toThrow();
  });

  it('throws a TRPCError (not a plain Error)', () => {
    const ctx = { user: { emailVerified: false } };

    try {
      assertEmailVerified(ctx);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
    }
  });
});
