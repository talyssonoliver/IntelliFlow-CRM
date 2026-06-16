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
  tenantUpsert = vi.fn().mockResolvedValue({ id: 'new-tenant-id' }),
  userCreate = vi.fn().mockRejectedValue(PROVISION_ERROR),
}: {
  findUnique?: ReturnType<typeof vi.fn>;
  tenantFindUnique?: ReturnType<typeof vi.fn>;
  tenantUpsert?: ReturnType<typeof vi.fn>;
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
      // Provisioning upserts the per-user org (idempotent on the deterministic slug).
      upsert: tenantUpsert,
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

  it('provisions a NEW org for the sign-up (own tenant, never a shared default)', async () => {
    const prisma = makePrismaStub({
      findUnique: vi.fn().mockResolvedValue(null),
      // Reflect the create input so we can assert the user is bound to the new tenant.
      userCreate: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
          tenantId: data.tenantId,
        })
      ),
    });

    const session = await ensureAppUserSession(prisma as any, SUPABASE_USER);

    // A brand-new org tenant is provisioned (idempotent upsert) — the shared
    // 'default' lookup is GONE.
    expect(prisma.tenant.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    // Upsert is keyed by the per-user slug so a retry reuses THIS user's org.
    const upsertArg = (prisma.tenant.upsert as any).mock.calls[0][0];
    expect(upsertArg.where.slug).toBe(upsertArg.create.slug);
    expect(upsertArg.create.slug).toContain(SUPABASE_USER.id);
    // The user is bound to THAT new tenant, and is its admin/owner.
    expect(session.tenantId).toBe('new-tenant-id');
    expect(session.userId).toBe(SUPABASE_USER.id);
    expect(session.tenantId).not.toBe('');
    expect(session.role).toBe('ADMIN');
  });

  it('SECURITY: two different sign-ups create SEPARATE org tenants (no co-mingling)', async () => {
    const capturedSlugs: string[] = [];
    function stub() {
      return {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...data })),
          update: vi.fn(),
        },
        tenant: {
          findUnique: vi.fn(),
          upsert: vi.fn().mockImplementation(({ create }: any) => {
            capturedSlugs.push(create.slug);
            return Promise.resolve({ id: `tenant-${create.slug}`, slug: create.slug });
          }),
        },
      };
    }

    const a = await ensureAppUserSession(stub() as any, {
      id: 'aaaaaaaa-1111-4111-8111-111111111111',
      email: 'a@acme.com',
      user_metadata: {},
    });
    const b = await ensureAppUserSession(stub() as any, {
      id: 'bbbbbbbb-2222-4222-8222-222222222222',
      email: 'b@globex.com',
      user_metadata: {},
    });

    // Distinct sign-ups MUST land in distinct tenants — the whole point of the fix.
    expect(capturedSlugs[0]).not.toBe(capturedSlugs[1]);
    expect(a.tenantId).not.toBe(b.tenantId);
  });

  it('RESILIENCE: a failed user.create does NOT lock the user out — retry reuses the org (no slug collision)', async () => {
    // Simulate DB upsert semantics: the same deterministic slug maps to the same
    // tenant row, so a retry reuses it instead of colliding on the unique column.
    const tenantsBySlug = new Map<string, { id: string; slug: string }>();
    const upsert = vi.fn().mockImplementation(({ where, create }: any) => {
      const existing = tenantsBySlug.get(where.slug);
      if (existing) return Promise.resolve(existing);
      const row = { id: `tenant-${tenantsBySlug.size}`, slug: create.slug };
      tenantsBySlug.set(create.slug, row);
      return Promise.resolve(row);
    });

    // First sign-in attempt: user.create fails AFTER the tenant is upserted,
    // leaving an "orphan" tenant for this user's deterministic slug.
    const prismaA = makePrismaStub({
      tenantUpsert: upsert,
      userCreate: vi.fn().mockRejectedValue(new Error('transient write failure')),
    });
    await expect(ensureAppUserSession(prismaA as any, SUPABASE_USER)).rejects.toThrow();
    expect(tenantsBySlug.size).toBe(1);

    // Second attempt for the SAME user: upsert REUSES the org (no unique-slug
    // collision) and provisioning succeeds — the user is not locked out forever.
    const prismaB = makePrismaStub({
      tenantUpsert: upsert,
      userCreate: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...data })),
    });
    const session = await ensureAppUserSession(prismaB as any, SUPABASE_USER);

    // Exactly one tenant for this user (reused, never duplicated), bound as ADMIN,
    expect(tenantsBySlug.size).toBe(1);
    expect(session.tenantId).toBe([...tenantsBySlug.values()][0].id);
    expect(session.role).toBe('ADMIN');
    // and the non-idempotent create() path (which would collide) is never used.
    expect(prismaB.tenant.create as any).not.toHaveBeenCalled();
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
