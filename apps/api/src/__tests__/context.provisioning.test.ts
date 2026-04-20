/**
 * Tests for JIT user provisioning in createContext / ensureAppUserSession.
 *
 * L5: provisionNewUserWith failure must throw TRPCError(INTERNAL_SERVER_ERROR)
 * instead of returning a UserSession with tenantId: '' (which bypassed tenant isolation).
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// ---------------------------------------------------------------------------
// Minimal prisma stub — covers the provisioning path
// ---------------------------------------------------------------------------
const PROVISION_ERROR = new Error('DB constraint violation');

function makePrismaStub({
  findUnique = vi.fn().mockResolvedValue(null),
  tenantFindUnique = vi.fn().mockResolvedValue({ id: 'default-tenant-id', slug: 'default' }),
  userCreate = vi.fn().mockRejectedValue(PROVISION_ERROR),
}: {
  findUnique?: ReturnType<typeof vi.fn>;
  tenantFindUnique?: ReturnType<typeof vi.fn>;
  userCreate?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    user: {
      findUnique,
      create: userCreate,
      update: vi.fn(),
    },
    tenant: {
      findUnique: tenantFindUnique,
      create: vi.fn().mockResolvedValue({ id: 'new-tenant-id' }),
    },
  };
}

// ---------------------------------------------------------------------------
// We test ensureAppUserSession which is exported from context.ts
// ---------------------------------------------------------------------------
// We need to mock supabaseAdmin before importing context to avoid network calls
vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  },
  verifyToken: vi.fn(),
}));

vi.mock('../container', () => ({
  container: {},
  apiPrisma: {},
}));

import { ensureAppUserSession } from '../context';

const SUPABASE_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'newuser@example.com',
  user_metadata: { name: 'New User' },
};

describe('ensureAppUserSession — JIT provisioning failure (L5)', () => {
  it('throws TRPCError INTERNAL_SERVER_ERROR when user.create fails', async () => {
    const prisma = makePrismaStub({
      // resolveDbUserWith → returns null (user not in DB yet)
      findUnique: vi.fn().mockResolvedValue(null),
      // provisionNewUserWith → tenant exists but user.create throws
      tenantFindUnique: vi.fn().mockResolvedValue({ id: 'default-tenant-id', slug: 'default' }),
      userCreate: vi.fn().mockRejectedValue(PROVISION_ERROR),
    });

    await expect(ensureAppUserSession(prisma as any, SUPABASE_USER)).rejects.toThrow(TRPCError);

    await expect(ensureAppUserSession(prisma as any, SUPABASE_USER)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'JIT user provisioning failed',
    });
  });

  it('does NOT return tenantId: "" on provisioning failure', async () => {
    const prisma = makePrismaStub({
      findUnique: vi.fn().mockResolvedValue(null),
      tenantFindUnique: vi.fn().mockResolvedValue({ id: 'default-tenant-id', slug: 'default' }),
      userCreate: vi.fn().mockRejectedValue(PROVISION_ERROR),
    });

    // eslint-disable-next-line no-useless-assignment -- sentinel value read after both branches
    let result: unknown = 'did-not-throw';
    try {
      result = await ensureAppUserSession(prisma as any, SUPABASE_USER);
    } catch {
      result = 'threw';
    }

    expect(result).toBe('threw');
  });

  it('returns a valid UserSession when provisioning succeeds', async () => {
    const newUser = {
      id: SUPABASE_USER.id,
      email: SUPABASE_USER.email,
      name: 'New User',
      role: 'USER',
      tenantId: 'default-tenant-id',
      stripeCustomerId: null,
      timezone: 'Europe/London',
    };

    const prisma = makePrismaStub({
      findUnique: vi.fn().mockResolvedValue(null),
      tenantFindUnique: vi.fn().mockResolvedValue({ id: 'default-tenant-id', slug: 'default' }),
      userCreate: vi.fn().mockResolvedValue(newUser),
    });

    const session = await ensureAppUserSession(prisma as any, SUPABASE_USER);

    expect(session.tenantId).toBe('default-tenant-id');
    expect(session.userId).toBe(SUPABASE_USER.id);
    expect(session.tenantId).not.toBe('');
  });
});
