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

describe('ensureAppUserSession — avatar backfill from provider metadata', () => {
  const EXISTING_USER_ID = '22222222-2222-4222-8222-222222222222';

  function existingUserRow(avatarUrl: string | null) {
    return {
      id: EXISTING_USER_ID,
      email: 'existing@example.com',
      name: 'Existing User',
      role: 'USER',
      tenantId: 'default-tenant-id',
      stripeCustomerId: null,
      timezone: 'Europe/London',
      avatarUrl,
    };
  }

  it('backfills avatarUrl from metadata when the DB value is null', async () => {
    const prisma = makePrismaStub({
      findUnique: vi.fn().mockResolvedValue(existingUserRow(null)),
    });
    const update = vi.fn().mockResolvedValue({});
    (prisma.user as any).update = update;

    const session = await ensureAppUserSession(prisma as any, {
      id: EXISTING_USER_ID,
      email: 'existing@example.com',
      user_metadata: { avatar_url: 'https://cdn.example.com/pic.png' },
    });

    // returned session carries the avatar this request (in-memory backfill)
    expect(session.avatarUrl).toBe('https://cdn.example.com/pic.png');
    // and the fire-and-forget sign-in update persists it to the DB
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarUrl: 'https://cdn.example.com/pic.png' }),
      })
    );
  });

  it('does NOT overwrite an existing DB avatarUrl', async () => {
    const prisma = makePrismaStub({
      findUnique: vi.fn().mockResolvedValue(existingUserRow('https://db.example.com/existing.png')),
    });
    const update = vi.fn().mockResolvedValue({});
    (prisma.user as any).update = update;

    const session = await ensureAppUserSession(prisma as any, {
      id: EXISTING_USER_ID,
      email: 'existing@example.com',
      user_metadata: { picture: 'https://oauth.example.com/new.png' },
    });

    expect(session.avatarUrl).toBe('https://db.example.com/existing.png');
    // sign-in update must NOT include an avatarUrl write
    expect((update.mock.calls[0][0] as any).data.avatarUrl).toBeUndefined();
  });
});
