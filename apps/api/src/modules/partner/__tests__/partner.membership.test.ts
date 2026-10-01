/**
 * Inherited membership through the partner API (ADR-071).
 *
 * `partner.issueLoginLink` with a Portal assertion (members, pinned staff, replay, forgery,
 * takeover attempts), the legacy key-only path, and `removeMember` / `setMemberRole` /
 * `listMembers`. The Prisma client is a deep mock; what is asserted is which writes happen,
 * which do not, and which reason the caller sees.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { QuotaExceededError } from '@intelliflow/domain';
import * as sdk from '@intelliflow/partner-sdk';
import { createTestContext, prismaMock } from '../../../test/setup';
import {
  EXTERNAL_REF,
  claimsFor,
  newKeyPair,
  signAssertion,
} from '../../../test/assertion-fixtures';
import { invalidateUserSessions, registerSessionCacheInvalidator } from '../membership';
import { baseSessionCache, resolvedSessionCache } from '../../../security/session-cache';

const supabaseAdminMock = vi.hoisted(() => ({
  auth: {
    admin: {
      createUser: vi.fn(),
      generateLink: vi.fn(),
      deleteUser: vi.fn(),
    },
  },
}));
vi.mock('../../../lib/supabase', () => ({ supabaseAdmin: supabaseAdminMock }));

import {
  partnerRouter,
  removeMemberInput,
  removeMemberOutput,
  setMemberRoleInput,
  setMemberRoleOutput,
  listMembersInput,
  listMembersOutput,
} from '../partner.router';
import { z } from 'zod';

const KEY = 'pk_test_key_value';
const ALL_SCOPES = [
  'tenants:read',
  'tenants:write',
  'members:write',
  'auth:login-link',
  'usage:read',
];
const keys = newKeyPair();

// ---------------------------------------------------------------------------
// World: tenants and users the mocks answer for
// ---------------------------------------------------------------------------

interface TenantFixture {
  id: string;
  partnerId: string | null;
  externalRef: string | null;
}
const TENANTS: Record<string, TenantFixture> = {
  t1: { id: 't1', partnerId: 'partner-1', externalRef: EXTERNAL_REF },
  t2: { id: 't2', partnerId: 'partner-1', externalRef: '9a1b2c3d-0000-4000-8000-000000000002' },
  foreign: { id: 'foreign', partnerId: 'partner-2', externalRef: null },
  direct: { id: 'direct', partnerId: null, externalRef: null },
  agency: { id: 'agency', partnerId: null, externalRef: null },
};

interface UserFixture {
  id: string;
  tenantId: string;
  role: string;
}
let users: Record<string, UserFixture>;

function installWorld(
  opts: {
    partner?: Partial<{ assertionPublicKey: string | null; ownerTenantId: string | null }>;
  } = {}
) {
  prismaMock.partner.findUnique.mockResolvedValue({
    assertionPublicKey: keys.publicKeyPem,
    ownerTenantId: 'agency',
    ...opts.partner,
  } as never);
  prismaMock.tenant.findUnique.mockImplementation(
    (async ({ where }: { where: { id: string } }) => TENANTS[where.id] ?? null) as never
  );
  prismaMock.user.findUnique.mockImplementation((async ({
    where,
  }: {
    where: { email?: string; id?: string };
  }) => {
    if (where.email) return users[where.email] ?? null;
    return Object.values(users).find((u) => u.id === where.id) ?? null;
  }) as never);
  prismaMock.tenantMembership.findUnique.mockResolvedValue(null as never);
  prismaMock.tenantMembership.findFirst.mockResolvedValue(null as never);
  prismaMock.partnerLoginGrant.findFirst.mockResolvedValue(null as never);
  prismaMock.partnerLoginGrant.create.mockResolvedValue({ id: 'grant-1' } as never);
  prismaMock.tenantMembershipAudit.create.mockResolvedValue({} as never);
}

function callerWith(opts: { scopes?: string[]; quota?: unknown } = {}) {
  const ctx = createTestContext({ req: { headers: { authorization: `Bearer ${KEY}` } } as never });
  if (opts.quota) (ctx as any).services = { ...(ctx as any).services, quota: opts.quota };
  prismaMock.partnerApiKey.findUnique.mockResolvedValue({
    id: 'key-1',
    isActive: true,
    expiresAt: null,
    scopes: opts.scopes ?? ALL_SCOPES,
    partner: { id: 'partner-1', slug: 'leangency', status: 'ACTIVE' },
  } as never);
  prismaMock.partnerApiKey.update.mockResolvedValue({} as never);
  return (partnerRouter as any).createCaller(ctx);
}

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    return error as TRPCError;
  }
  throw new Error('expected a TRPCError');
}

async function expectReason(promise: Promise<unknown>, code: string, reason: string) {
  const error = await rejection(promise);
  expect(error.code).toBe(code);
  expect(error.message.startsWith(`${reason}: `)).toBe(true);
  expect((error.cause as { reason?: string }).reason).toBe(reason);
  return error;
}

function auditRows() {
  return prismaMock.tenantMembershipAudit.create.mock.calls.map(
    ([arg]) => (arg as { data: Record<string, any> }).data
  );
}

function assertionFor(over: Record<string, unknown> = {}) {
  return signAssertion(claimsFor(over), keys.privateKey);
}

const enableInherited = () => vi.stubEnv('INHERITED_MEMBERSHIP_ENABLED', '1');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_URL', 'https://crm.example.com');
  users = {};
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock)) as never);
  supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'hashed-abc' } },
    error: null,
  });
  installWorld();
});

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

describe('contract: new router schemas equal the partner-sdk schemas', () => {
  const pairs: Array<[string, z.ZodType, z.ZodType]> = [
    ['removeMember.input', removeMemberInput, sdk.removeMemberInputSchema],
    ['removeMember.output', removeMemberOutput, sdk.removeMemberOutputSchema],
    ['setMemberRole.input', setMemberRoleInput, sdk.setMemberRoleInputSchema],
    ['setMemberRole.output', setMemberRoleOutput, sdk.setMemberRoleOutputSchema],
    ['listMembers.input', listMembersInput, sdk.listMembersInputSchema],
    ['listMembers.output', listMembersOutput, sdk.listMembersOutputSchema],
  ];
  for (const [name, mine, theirs] of pairs) {
    it(name, () => {
      expect(z.toJSONSchema(mine)).toEqual(z.toJSONSchema(theirs));
    });
  }
});

// ---------------------------------------------------------------------------
// issueLoginLink: enforcement and the key-only takeover
// ---------------------------------------------------------------------------

describe('issueLoginLink: a stolen API key without an assertion', () => {
  beforeEach(() => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'ADMIN' };
  });

  it.each([['1'], ['true'], ['leangency'], ['other,leangency']])(
    'is refused with ASSERTION_REQUIRED when PARTNER_REQUIRE_ASSERTION=%s',
    async (value) => {
      vi.stubEnv('PARTNER_REQUIRE_ASSERTION', value);
      const caller = callerWith();

      await expectReason(
        caller.issueLoginLink({ tenantId: 't1', email: 'alice@client.test' }),
        'FORBIDDEN',
        'ASSERTION_REQUIRED'
      );

      expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
      expect(prismaMock.partnerLoginGrant.create).not.toHaveBeenCalled();
      expect(auditRows()).toEqual([
        expect.objectContaining({
          action: 'DENIED',
          tenantId: 't1',
          partnerId: 'partner-1',
          actor: 'partner:leangency',
          detail: expect.objectContaining({ reason: 'ASSERTION_REQUIRED', kind: 'none' }),
        }),
      ]);
    }
  );

  it('still works while the partner is not enforced (rollout), as a legacy link', async () => {
    vi.stubEnv('PARTNER_REQUIRE_ASSERTION', 'someone-else');
    const caller = callerWith();

    const out = await caller.issueLoginLink({ tenantId: 't1', email: 'ALICE@client.test' });

    const url = new URL(out.url);
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('token_hash')).toBe('hashed-abc');
    expect(url.searchParams.get('tenant')).toBe('t1');
    expect(url.searchParams.get('grant')).toBe('grant-1');
    expect(out.pinned).toBeUndefined();
    expect(out.role).toBeUndefined();
    expect(prismaMock.partnerLoginGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'legacy',
        pinned: false,
        jti: null,
        userId: 'u-alice',
      }),
      select: { id: true },
    });
  });

  it('a failure to record the legacy grant never blocks the login', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    prismaMock.partnerLoginGrant.create.mockRejectedValue(new Error('db down'));
    const caller = callerWith();

    const out = await caller.issueLoginLink({ tenantId: 't1', email: 'alice@client.test' });

    expect(new URL(out.url).searchParams.get('grant')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('issueLoginLink: the legacy path honours removals and pinning', () => {
  it('refuses a user outside the tenant, and a missing user, with NOT_A_MEMBER', async () => {
    users['bob@other.test'] = { id: 'u-bob', tenantId: 'direct', role: 'USER' };
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email: 'bob@other.test' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
    await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email: 'nobody@other.test' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('refuses a home user whose membership was revoked (the removal holds)', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'USER',
      source: 'HOME',
      pinned: false,
      revokedAt: new Date(),
      expiresAt: null,
    } as never);
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email: 'alice@client.test' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
  });

  it('accepts a live non-pinned membership only while the feature is on', async () => {
    users['carol@client.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'USER',
      source: 'PORTAL_MEMBER',
      pinned: false,
      revokedAt: null,
      expiresAt: null,
    } as never);
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email: 'carol@client.test' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );

    enableInherited();
    const out = await caller.issueLoginLink({ tenantId: 't1', email: 'carol@client.test' });
    expect(out.url).toContain('token_hash=hashed-abc');
  });

  it('never mints a key-only link for a pinned staff membership', async () => {
    enableInherited();
    users['staff@agency.test'] = { id: 'u-staff', tenantId: 'agency', role: 'ADMIN' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'ADMIN',
      source: 'PORTAL_STAFF',
      pinned: true,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    } as never);
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email: 'staff@agency.test' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('refuses an operator email with RESERVED_EMAIL', async () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'ops@leangency.test');
    users['ops@leangency.test'] = { id: 'u-ops', tenantId: 't1', role: 'ADMIN' };
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email: 'OPS@leangency.test' }),
      'CONFLICT',
      'RESERVED_EMAIL'
    );
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// issueLoginLink: verification failures
// ---------------------------------------------------------------------------

describe('issueLoginLink: an invalid assertion never reaches a user lookup or a link', () => {
  beforeEach(() => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
  });

  async function expectInvalid(assertion: string, check: string, email = 'alice@client.test') {
    const caller = callerWith();
    const error = await expectReason(
      caller.issueLoginLink({ tenantId: 't1', email, assertion }),
      'FORBIDDEN',
      'ASSERTION_INVALID'
    );
    // The response never says which check failed.
    expect(error.message).toBe('ASSERTION_INVALID: The login assertion is not valid.');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.partnerLoginGrant.create).not.toHaveBeenCalled();
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
    const denied = auditRows().filter((r) => r.action === 'DENIED');
    expect(denied).toHaveLength(1);
    expect(denied[0].detail).toEqual(
      expect.objectContaining({ reason: 'ASSERTION_INVALID', check })
    );
    expect(JSON.stringify(denied[0])).not.toContain(assertion);
  }

  it('a forged assertion (signed by another key)', async () => {
    const forged = signAssertion(claimsFor(), newKeyPair().privateKey);
    await expectInvalid(forged, 'bad_signature');
  });

  it('an assertion for another person than the link is requested for', async () => {
    await expectInvalid(assertionFor({ sub: 'victim@client.test' }), 'subject_mismatch');
  });

  it('an assertion issued for another partner', async () => {
    await expectInvalid(assertionFor({ iss: 'other-partner' }), 'wrong_issuer');
  });

  it('an expired assertion', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expectInvalid(assertionFor({ iat: now - 120, exp: now - 90 }), 'expired');
  });

  it('an assertion for a tenant other than the call tenant', async () => {
    await expectInvalid(
      assertionFor({ tenant: { externalRef: '9a1b2c3d-0000-4000-8000-000000000002' } }),
      'tenant_mismatch'
    );
  });

  it('an assertion naming an IntelliFlow tenant id of another tenant', async () => {
    await expectInvalid(assertionFor({ tenant: { tenantId: 't2' } }), 'tenant_mismatch');
  });

  it('an assertion naming a tenant the partner did not source', async () => {
    // t1 is partner-1's; an assertion carrying a foreign tenantId cannot resolve to it.
    await expectInvalid(assertionFor({ tenant: { tenantId: 'foreign' } }), 'tenant_mismatch');
  });

  it('garbage in the assertion field', async () => {
    await expectInvalid('not.a.token', 'bad_header');
  });

  it('a partner with no registered public key (trust anchor unset)', async () => {
    installWorld({ partner: { assertionPublicKey: null } });
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    await expectInvalid(assertionFor(), 'no_public_key');
  });

  it('is not rescued by a flag: kind=staff with a bad signature is invalid, not "not provisioned"', async () => {
    enableInherited();
    const forged = signAssertion(
      claimsFor({ kind: 'staff', role: 'ADMIN' }),
      newKeyPair().privateKey
    );
    await expectInvalid(forged, 'bad_signature');
  });
});

// ---------------------------------------------------------------------------
// issueLoginLink: kind=member
// ---------------------------------------------------------------------------

describe('issueLoginLink: kind=member', () => {
  it('creates the identity just in time, home = the tenant, then mints a link bound to a grant', async () => {
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-alice' } },
      error: null,
    });
    prismaMock.user.create.mockResolvedValue({} as never);
    const caller = callerWith();
    const assertion = assertionFor({ role: 'ADMIN' });

    const out = await caller.issueLoginLink({
      tenantId: 't1',
      email: 'Alice@client.test',
      assertion,
    });

    expect(supabaseAdminMock.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'alice@client.test',
      email_confirm: true,
      user_metadata: {},
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'sb-alice',
        email: 'alice@client.test',
        role: 'ADMIN',
        tenantId: 't1',
        provider: 'partner',
      }),
    });
    expect(prismaMock.partnerLoginGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partnerId: 'partner-1',
        userId: 'sb-alice',
        tenantId: 't1',
        kind: 'member',
        role: 'ADMIN',
        pinned: false,
        jti: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/),
        expiresAt: expect.any(Date),
      }),
      select: { id: true },
    });
    const url = new URL(out.url);
    expect(url.origin).toBe('https://crm.example.com');
    expect(url.searchParams.get('token_hash')).toBe('hashed-abc');
    expect(url.searchParams.get('tenant')).toBe('t1');
    expect(url.searchParams.get('grant')).toBe('grant-1');
    expect(out.pinned).toBe(false);
    expect(out.role).toBe('ADMIN');
    // the claim window covers the whole OTP lifetime (60 min), so a late redemption stays pinned
    const ttl = Date.parse(out.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000);

    const rows = auditRows();
    expect(rows.map((r) => r.action)).toEqual(['MEMBER_ATTACHED', 'LINK_ISSUED']);
    expect(rows[0].detail).toEqual(expect.objectContaining({ kind: 'member', created: true }));
    expect(rows[1].detail).toEqual(
      expect.objectContaining({ kind: 'member', grantId: 'grant-1', jti: expect.any(String) })
    );
    for (const row of rows) expect(JSON.stringify(row)).not.toContain(assertion);
  });

  it('maps a plain member role to UserRole USER', async () => {
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    const caller = callerWith();
    await caller.issueLoginLink({
      tenantId: 't1',
      email: 'alice@client.test',
      assertion: assertionFor({ role: 'MEMBER' }),
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'USER' }),
    });
  });

  it('takes the seat lock and refuses with QUOTA_EXCEEDED when the plan is full, creating nothing', async () => {
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const quota = { getLimits: vi.fn().mockResolvedValue({ seats: 2 }) };
    const caller = callerWith({ quota });

    const error = await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      }),
      'FORBIDDEN',
      'QUOTA_EXCEEDED'
    );

    // the formatter also exposes the quota payload through the cause
    expect(error.cause).toBeInstanceOf(QuotaExceededError);
    expect(error.cause).toMatchObject({ key: 'seats', used: 2, limit: 2 });
    const locks = (prismaMock.$executeRaw as any).mock.calls
      .map(([strings, ...values]: [string[], ...unknown[]]) => [strings.join('?'), values])
      .filter(([sql]: [string]) => sql.includes('pg_advisory_xact_lock'));
    expect(locks.some(([, v]: [string, unknown[]]) => v[0] === 'quota:t1:seats')).toBe(true);
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.partnerLoginGrant.create).not.toHaveBeenCalled();
  });

  it('allows the last free seat and fails closed when the quota service is not wired in production', async () => {
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const caller = callerWith({ quota: { getLimits: vi.fn().mockResolvedValue({ seats: 2 }) } });
    await caller.issueLoginLink({
      tenantId: 't1',
      email: 'alice@client.test',
      assertion: assertionFor(),
    });
    expect(prismaMock.user.create).toHaveBeenCalled();

    // production-like: no test escape hatch and no quota service
    vi.stubEnv('QUOTA_GUARD_ALLOW_MISSING_SERVICE', '0');
    prismaMock.user.create.mockClear();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bare = callerWith();
    const error = await rejection(
      bare.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      })
    );
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('answers ACCOUNT_IN_OTHER_TENANT when an Auth identity exists that the CRM does not know', async () => {
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'exists' },
    });
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      }),
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT'
    );
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('removes the Auth user it created when minting the link fails, and rolls back', async () => {
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
      data: null,
      error: { message: 'secret detail' },
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const caller = callerWith();

    const error = await rejection(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      })
    );

    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.message).not.toContain('secret');
    expect(supabaseAdminMock.auth.admin.deleteUser).toHaveBeenCalledWith('sb-1');
    err.mockRestore();
  });

  it('victim email in another (non-partner) tenant: ACCOUNT_IN_OTHER_TENANT, never adopted', async () => {
    enableInherited();
    users['victim@bank.test'] = { id: 'u-victim', tenantId: 'direct', role: 'ADMIN' };
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'victim@bank.test',
        assertion: assertionFor({ sub: 'victim@bank.test', role: 'ADMIN' }),
      }),
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT'
    );

    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(prismaMock.partnerLoginGrant.create).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: 'DENIED',
        detail: expect.objectContaining({ reason: 'ACCOUNT_IN_OTHER_TENANT', kind: 'member' }),
      }),
    ]);
  });

  it("victim in another partner's tenant is not adopted either", async () => {
    enableInherited();
    users['victim@bank.test'] = { id: 'u-victim', tenantId: 'foreign', role: 'USER' };
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'victim@bank.test',
        assertion: assertionFor({ sub: 'victim@bank.test' }),
      }),
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT'
    );
  });

  it('operator email through the member path is refused (RESERVED_EMAIL), even for a perfect assertion', async () => {
    enableInherited();
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'ops@leangency.test');
    users['ops@leangency.test'] = { id: 'u-ops', tenantId: 't2', role: 'ADMIN' };
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'ops@leangency.test',
        assertion: assertionFor({ sub: 'ops@leangency.test', role: 'ADMIN' }),
      }),
      'CONFLICT',
      'RESERVED_EMAIL'
    );
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('an existing home user gets a link and no membership write', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    const caller = callerWith();

    const out = await caller.issueLoginLink({
      tenantId: 't1',
      email: 'alice@client.test',
      assertion: assertionFor(),
    });

    expect(out.role).toBe('MEMBER');
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
    expect(auditRows().map((r) => r.action)).toEqual(['LINK_ISSUED']);
  });

  it('a home user keeps the CRM role they hold, whatever role the assertion carries', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'ADMIN' };
    const caller = callerWith();

    const out = await caller.issueLoginLink({
      tenantId: 't1',
      email: 'alice@client.test',
      assertion: assertionFor({ role: 'MEMBER' }),
    });

    expect(out.role).toBe('ADMIN');
    expect(prismaMock.partnerLoginGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'ADMIN' }),
      select: { id: true },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('revives a home user whose membership was revoked, after a seat check', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'USER',
      source: 'HOME',
      pinned: false,
      revokedAt: new Date(Date.now() - 1000),
      expiresAt: null,
    } as never);
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const caller = callerWith({ quota: { getLimits: vi.fn().mockResolvedValue({ seats: 5 }) } });

    await caller.issueLoginLink({
      tenantId: 't1',
      email: 'alice@client.test',
      assertion: assertionFor(),
    });

    expect(prismaMock.tenantMembership.update).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'u-alice', tenantId: 't1' } },
      data: { revokedAt: null, expiresAt: null },
    });
    expect(auditRows().map((r) => r.action)).toEqual(['MEMBER_ATTACHED', 'LINK_ISSUED']);
  });

  describe('an existing identity of another client of the same partner', () => {
    beforeEach(() => {
      users['carol@client.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    });

    it('is attached as a non-pinned PORTAL_MEMBER membership when the feature is on', async () => {
      enableInherited();
      const caller = callerWith({
        quota: { getLimits: vi.fn().mockResolvedValue({ seats: null }) },
      });

      const out = await caller.issueLoginLink({
        tenantId: 't1',
        email: 'carol@client.test',
        assertion: assertionFor({ sub: 'carol@client.test', role: 'ADMIN' }),
      });

      expect(prismaMock.tenantMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_tenantId: { userId: 'u-carol', tenantId: 't1' } },
          create: expect.objectContaining({
            userId: 'u-carol',
            tenantId: 't1',
            role: 'ADMIN',
            source: 'PORTAL_MEMBER',
            grantedByPartnerId: 'partner-1',
            pinned: false,
            expiresAt: null,
            revokedAt: null,
          }),
        })
      );
      expect(out.pinned).toBe(false);
      expect(auditRows().map((r) => r.action)).toEqual(['MEMBER_ATTACHED', 'LINK_ISSUED']);
    });

    it('is refused with NOT_A_MEMBER while the feature is off (byte-for-byte legacy behaviour)', async () => {
      const caller = callerWith();
      await expectReason(
        caller.issueLoginLink({
          tenantId: 't1',
          email: 'carol@client.test',
          assertion: assertionFor({ sub: 'carol@client.test' }),
        }),
        'FORBIDDEN',
        'NOT_A_MEMBER'
      );
      expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    });

    it('counts a seat: a full tenant refuses the attach', async () => {
      enableInherited();
      prismaMock.user.count.mockResolvedValue(2);
      prismaMock.tenantMembership.count.mockResolvedValue(0);
      const caller = callerWith({ quota: { getLimits: vi.fn().mockResolvedValue({ seats: 2 }) } });

      await expectReason(
        caller.issueLoginLink({
          tenantId: 't1',
          email: 'carol@client.test',
          assertion: assertionFor({ sub: 'carol@client.test' }),
        }),
        'FORBIDDEN',
        'QUOTA_EXCEEDED'
      );
      expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    });

    it('an already live membership refreshes the role without taking another seat', async () => {
      enableInherited();
      prismaMock.tenantMembership.findUnique.mockResolvedValue({
        pinned: false,
        revokedAt: null,
        expiresAt: null,
      } as never);
      const getLimits = vi.fn().mockResolvedValue({ seats: 1 });
      const caller = callerWith({ quota: { getLimits } });

      await caller.issueLoginLink({
        tenantId: 't1',
        email: 'carol@client.test',
        assertion: assertionFor({ sub: 'carol@client.test', role: 'ADMIN' }),
      });

      expect(getLimits).not.toHaveBeenCalled();
      expect(prismaMock.tenantMembership.upsert).toHaveBeenCalled();
      expect(auditRows().map((r) => r.action)).toEqual(['LINK_ISSUED']);
    });

    it('a pinned staff row cannot be loosened into a member row', async () => {
      enableInherited();
      prismaMock.tenantMembership.findUnique.mockResolvedValue({
        pinned: true,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      } as never);
      const caller = callerWith();

      await expectReason(
        caller.issueLoginLink({
          tenantId: 't1',
          email: 'carol@client.test',
          assertion: assertionFor({ sub: 'carol@client.test' }),
        }),
        'CONFLICT',
        'ACCOUNT_IN_OTHER_TENANT'
      );
      expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    });

    it('an identity in the footprint through a granted membership (home elsewhere) is attachable', async () => {
      enableInherited();
      users['dave@x.test'] = { id: 'u-dave', tenantId: 'direct', role: 'USER' };
      prismaMock.tenantMembership.findFirst.mockResolvedValue({ id: 'granted' } as never);
      const caller = callerWith({
        quota: { getLimits: vi.fn().mockResolvedValue({ seats: null }) },
      });

      await caller.issueLoginLink({
        tenantId: 't1',
        email: 'dave@x.test',
        assertion: assertionFor({ sub: 'dave@x.test' }),
      });

      expect(prismaMock.tenantMembership.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'u-dave', grantedByPartnerId: 'partner-1' }),
        select: { id: true },
      });
      expect(prismaMock.tenantMembership.upsert).toHaveBeenCalled();
    });
  });

  it("the partner's own staff identity never enters through the member path", async () => {
    enableInherited();
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'agency', role: 'ADMIN' };
    // even with a previously granted membership that would put it in the footprint
    prismaMock.tenantMembership.findFirst.mockResolvedValue({ id: 'granted' } as never);
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'boss@agency.test',
        assertion: assertionFor({ sub: 'boss@agency.test', role: 'ADMIN' }),
      }),
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT'
    );
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// issueLoginLink: replay
// ---------------------------------------------------------------------------

describe('issueLoginLink: single use', () => {
  beforeEach(() => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
  });

  it('a jti already recorded for the partner is a replay: ASSERTION_INVALID before any write', async () => {
    prismaMock.partnerLoginGrant.findFirst.mockResolvedValue({ id: 'earlier' } as never);
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      }),
      'FORBIDDEN',
      'ASSERTION_INVALID'
    );
    expect(prismaMock.partnerLoginGrant.findFirst).toHaveBeenCalledWith({
      where: { partnerId: 'partner-1', jti: expect.any(String) },
      select: { id: true },
    });
    expect(prismaMock.partnerLoginGrant.create).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('a unique-index violation (two replays racing) is also ASSERTION_INVALID', async () => {
    prismaMock.partnerLoginGrant.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' })
    );
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      }),
      'FORBIDDEN',
      'ASSERTION_INVALID'
    );
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('a racing replay of a JIT create removes the Auth user it created', async () => {
    users = {};
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-new' } },
      error: null,
    });
    prismaMock.partnerLoginGrant.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' })
    );
    const caller = callerWith();

    await expectReason(
      caller.issueLoginLink({
        tenantId: 't1',
        email: 'alice@client.test',
        assertion: assertionFor(),
      }),
      'FORBIDDEN',
      'ASSERTION_INVALID'
    );
    expect(supabaseAdminMock.auth.admin.deleteUser).toHaveBeenCalledWith('sb-new');
  });

  it('serializes on the person: the email advisory lock is taken before anything is read', async () => {
    const caller = callerWith();
    await caller.issueLoginLink({
      tenantId: 't1',
      email: 'alice@client.test',
      assertion: assertionFor(),
    });
    const lockValues = (prismaMock.$executeRaw as any).mock.calls.map(
      ([, ...values]: unknown[]) => values[0]
    );
    expect(lockValues[0]).toBe('partner-provision-email:alice@client.test');
  });
});

// ---------------------------------------------------------------------------
// issueLoginLink: kind=staff
// ---------------------------------------------------------------------------

describe('issueLoginLink: kind=staff', () => {
  const staffAssertion = (over: Record<string, unknown> = {}) =>
    assertionFor({ sub: 'boss@agency.test', kind: 'staff', role: 'ADMIN', ...over });
  const call = (caller: any, assertion = staffAssertion()) =>
    caller.issueLoginLink({ tenantId: 't1', email: 'boss@agency.test', assertion });

  beforeEach(() => {
    enableInherited();
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'agency', role: 'ADMIN' };
  });

  it('writes a pinned, expiring PORTAL_STAFF membership and a pinned grant, and counts no seat', async () => {
    const getLimits = vi.fn();
    const caller = callerWith({ quota: { getLimits } });

    const out = await call(caller);

    const upsert = prismaMock.tenantMembership.upsert.mock.calls[0]![0] as any;
    expect(upsert.where).toEqual({ userId_tenantId: { userId: 'u-boss', tenantId: 't1' } });
    for (const branch of [upsert.create, upsert.update]) {
      expect(branch).toMatchObject({
        role: 'ADMIN',
        source: 'PORTAL_STAFF',
        grantedByPartnerId: 'partner-1',
        pinned: true,
        revokedAt: null,
      });
      const ttl = (branch.expiresAt as Date).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(23.9 * 3_600_000);
      expect(ttl).toBeLessThanOrEqual(24 * 3_600_000);
    }
    expect(prismaMock.partnerLoginGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-boss',
        tenantId: 't1',
        kind: 'staff',
        pinned: true,
        role: 'ADMIN',
      }),
      select: { id: true },
    });
    expect(out.pinned).toBe(true);
    expect(out.role).toBe('ADMIN');
    expect(new URL(out.url).searchParams.get('grant')).toBe('grant-1');
    expect(getLimits).not.toHaveBeenCalled();
    expect(prismaMock.user.count).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
    expect(auditRows().map((r) => r.action)).toEqual(['MEMBER_ATTACHED', 'LINK_ISSUED']);
  });

  it('is STAFF_NOT_PROVISIONED while INHERITED_MEMBERSHIP_ENABLED is off', async () => {
    vi.stubEnv('INHERITED_MEMBERSHIP_ENABLED', '0');
    await expectReason(call(callerWith()), 'FORBIDDEN', 'STAFF_NOT_PROVISIONED');
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('is STAFF_NOT_PROVISIONED when the partner has no owner tenant', async () => {
    installWorld({ partner: { ownerTenantId: null } });
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'agency', role: 'ADMIN' };
    await expectReason(call(callerWith()), 'FORBIDDEN', 'STAFF_NOT_PROVISIONED');
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
  });

  it('is STAFF_NOT_PROVISIONED when there is no identity (staff are never created just in time)', async () => {
    users = {};
    await expectReason(call(callerWith()), 'FORBIDDEN', 'STAFF_NOT_PROVISIONED');
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('is STAFF_NOT_PROVISIONED when the identity lives outside the partner owner tenant', async () => {
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'direct', role: 'ADMIN' };
    await expectReason(call(callerWith()), 'FORBIDDEN', 'STAFF_NOT_PROVISIONED');
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('an unrelated client user cannot be passed off as staff', async () => {
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 't2', role: 'ADMIN' };
    await expectReason(call(callerWith()), 'FORBIDDEN', 'STAFF_NOT_PROVISIONED');
  });

  it('allows an operator email, because it is pinned and non-operator inside the tenant', async () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'boss@agency.test');
    const out = await call(callerWith());
    expect(out.pinned).toBe(true);
    expect(prismaMock.tenantMembership.upsert).toHaveBeenCalled();
  });

  it('a tenant the partner did not source is refused before the assertion is even read', async () => {
    const caller = callerWith();
    await expect(
      caller.issueLoginLink({
        tenantId: 'foreign',
        email: 'boss@agency.test',
        assertion: staffAssertion(),
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(prismaMock.partnerLoginGrant.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe('partner.removeMember', () => {
  const live = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    role: 'USER',
    source: 'PORTAL_MEMBER',
    pinned: false,
    revokedAt: null,
    expiresAt: null,
    ...over,
  });

  it('is idempotent: an unknown email or a non-member removes nothing', async () => {
    const caller = callerWith();
    expect(await caller.removeMember({ tenantId: 't1', email: 'nobody@x.test' })).toEqual({
      removed: false,
    });

    users['bob@x.test'] = { id: 'u-bob', tenantId: 'direct', role: 'USER' };
    expect(await caller.removeMember({ tenantId: 't1', email: 'bob@x.test' })).toEqual({
      removed: false,
    });
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
    expect(prismaMock.tenantMembership.create).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('only acts on tenants the partner sourced', async () => {
    const caller = callerWith();
    await expect(
      caller.removeMember({ tenantId: 'foreign', email: 'a@b.co' })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(caller.removeMember({ tenantId: 'nope', email: 'a@b.co' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('revokes an attached member, closes their grants, audits, and drops the session cache', async () => {
    const invalidate = vi.fn();
    registerSessionCacheInvalidator(invalidate);
    users['carol@client.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(live() as never);
    const caller = callerWith();

    expect(await caller.removeMember({ tenantId: 't1', email: 'Carol@client.test' })).toEqual({
      removed: true,
    });

    expect(prismaMock.tenantMembership.update).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'u-carol', tenantId: 't1' } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prismaMock.partnerLoginGrant.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-carol', tenantId: 't1', sessionExpiresAt: { not: null } },
      data: { sessionExpiresAt: expect.any(Date) },
    });
    expect(prismaMock.partnerLoginGrant.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'u-carol', tenantId: 't1', claimedAt: null }),
      data: { expiresAt: expect.any(Date) },
    });
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: 'MEMBER_REMOVED',
        tenantId: 't1',
        userId: 'u-carol',
        actor: 'partner:leangency',
      }),
    ]);
    expect(invalidate).toHaveBeenCalledWith('u-carol');
    registerSessionCacheInvalidator(null);
  });

  it('evicts the real session cache by default, with no invalidator registered', async () => {
    registerSessionCacheInvalidator(null);
    baseSessionCache.set('u-carol', 'u-carol', { tenantId: 't2' });
    resolvedSessionCache.set('u-carol', 'u-carol|t1|s1', { tenantId: 't1' });
    resolvedSessionCache.set('u-dave', 'u-dave||s1', { tenantId: 't3' });

    await invalidateUserSessions('u-carol');

    expect(baseSessionCache.get('u-carol')).toBeNull();
    expect(resolvedSessionCache.get('u-carol|t1|s1')).toBeNull();
    expect(resolvedSessionCache.get('u-dave||s1')).not.toBeNull();
    resolvedSessionCache.clear();
  });

  it('a home user is not deleted: a revoked HOME row is written, so access ends', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    prismaMock.partner.findUnique.mockResolvedValue({} as never);
    const caller = callerWith();

    expect(await caller.removeMember({ tenantId: 't1', email: 'alice@client.test' })).toEqual({
      removed: true,
    });

    expect(prismaMock.tenantMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-alice',
        tenantId: 't1',
        source: 'HOME',
        revokedAt: expect.any(Date),
      }),
    });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('a second removal of a revoked member is a no-op', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(
      live({ source: 'HOME', revokedAt: new Date(Date.now() - 1000) }) as never
    );
    const caller = callerWith();
    expect(await caller.removeMember({ tenantId: 't1', email: 'alice@client.test' })).toEqual({
      removed: false,
    });
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
  });

  it('refuses to remove the last ADMIN', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'ADMIN' };
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const caller = callerWith();

    await expectReason(
      caller.removeMember({ tenantId: 't1', email: 'alice@client.test' }),
      'CONFLICT',
      'LAST_ADMIN'
    );
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
    expect(prismaMock.tenantMembership.create).not.toHaveBeenCalled();
  });

  it('removes an ADMIN when another live admin remains, excluding the target from the count', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'ADMIN' };
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const caller = callerWith();

    expect(await caller.removeMember({ tenantId: 't1', email: 'alice@client.test' })).toEqual({
      removed: true,
    });
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: 't1', role: 'ADMIN', id: { not: 'u-alice' } }),
    });
  });

  it('pinned staff are always removable, even as the only admin (they are not the tenant admins)', async () => {
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'agency', role: 'ADMIN' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(
      live({
        role: 'ADMIN',
        source: 'PORTAL_STAFF',
        pinned: true,
        expiresAt: new Date(Date.now() + 3_600_000),
      }) as never
    );
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const caller = callerWith();

    expect(await caller.removeMember({ tenantId: 't1', email: 'boss@agency.test' })).toEqual({
      removed: true,
    });
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('an expired staff membership is already gone', async () => {
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'agency', role: 'ADMIN' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(
      live({
        pinned: true,
        source: 'PORTAL_STAFF',
        expiresAt: new Date(Date.now() - 1000),
      }) as never
    );
    const caller = callerWith();
    expect(await caller.removeMember({ tenantId: 't1', email: 'boss@agency.test' })).toEqual({
      removed: false,
    });
  });

  it('takes the per-tenant advisory lock first, so concurrent removals cannot both pass LAST_ADMIN', async () => {
    users['carol@client.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(live() as never);
    await callerWith().removeMember({ tenantId: 't1', email: 'carol@client.test' });
    expect((prismaMock.$executeRaw as any).mock.calls[0]!.slice(1)).toEqual(['partner-members:t1']);
  });
});

// ---------------------------------------------------------------------------
// setMemberRole
// ---------------------------------------------------------------------------

describe('partner.setMemberRole', () => {
  const live = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    role: 'USER',
    source: 'PORTAL_MEMBER',
    pinned: false,
    revokedAt: null,
    expiresAt: null,
    ...over,
  });

  it('is NOT_A_MEMBER for an unknown user and for a user with no live membership', async () => {
    const caller = callerWith();
    await expectReason(
      caller.setMemberRole({ tenantId: 't1', email: 'nobody@x.test', role: 'ADMIN' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
    users['bob@x.test'] = { id: 'u-bob', tenantId: 'direct', role: 'USER' };
    await expectReason(
      caller.setMemberRole({ tenantId: 't1', email: 'bob@x.test', role: 'ADMIN' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
    users['carol@x.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(
      live({ revokedAt: new Date(Date.now() - 1) }) as never
    );
    await expectReason(
      caller.setMemberRole({ tenantId: 't1', email: 'carol@x.test', role: 'ADMIN' }),
      'FORBIDDEN',
      'NOT_A_MEMBER'
    );
  });

  it('refuses pinned memberships with HOME_ONLY (they are managed by assertion)', async () => {
    users['boss@agency.test'] = { id: 'u-boss', tenantId: 'agency', role: 'ADMIN' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(
      live({
        pinned: true,
        source: 'PORTAL_STAFF',
        role: 'ADMIN',
        expiresAt: new Date(Date.now() + 60_000),
      }) as never
    );
    const error = await expectReason(
      callerWith().setMemberRole({ tenantId: 't1', email: 'boss@agency.test', role: 'MEMBER' }),
      'FORBIDDEN',
      'HOME_ONLY'
    );
    expect(error.message).toBe('HOME_ONLY: pinned memberships are managed by assertion');
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
  });

  it('is idempotent: the same role reports changed:false and writes nothing', async () => {
    users['carol@x.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(live() as never);
    expect(
      await callerWith().setMemberRole({ tenantId: 't1', email: 'carol@x.test', role: 'MEMBER' })
    ).toEqual({ userId: 'u-carol', role: 'MEMBER', changed: false });
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('a MANAGER or SALES_REP home user already reads as MEMBER: demotion to MEMBER changes nothing', async () => {
    users['mgr@client.test'] = { id: 'u-mgr', tenantId: 't1', role: 'MANAGER' };
    expect(
      await callerWith().setMemberRole({ tenantId: 't1', email: 'mgr@client.test', role: 'MEMBER' })
    ).toEqual({ userId: 'u-mgr', role: 'MEMBER', changed: false });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('promotes an attached member to ADMIN, audits and invalidates sessions', async () => {
    const invalidate = vi.fn();
    registerSessionCacheInvalidator(invalidate);
    users['carol@x.test'] = { id: 'u-carol', tenantId: 't2', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue(live() as never);

    expect(
      await callerWith().setMemberRole({ tenantId: 't1', email: 'carol@x.test', role: 'ADMIN' })
    ).toEqual({ userId: 'u-carol', role: 'ADMIN', changed: true });

    expect(prismaMock.tenantMembership.update).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'u-carol', tenantId: 't1' } },
      data: { role: 'ADMIN' },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: 'ROLE_CHANGED',
        detail: { from: 'MEMBER', role: 'ADMIN' },
      }),
    ]);
    expect(invalidate).toHaveBeenCalledWith('u-carol');
    registerSessionCacheInvalidator(null);
  });

  it("updates users.role when the tenant is the user's home", async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    expect(
      await callerWith().setMemberRole({
        tenantId: 't1',
        email: 'alice@client.test',
        role: 'ADMIN',
      })
    ).toEqual({ userId: 'u-alice', role: 'ADMIN', changed: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-alice' },
      data: { role: 'ADMIN' },
    });
  });

  it('refuses to demote the last ADMIN', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'ADMIN' };
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    await expectReason(
      callerWith().setMemberRole({ tenantId: 't1', email: 'alice@client.test', role: 'MEMBER' }),
      'CONFLICT',
      'LAST_ADMIN'
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('demotes an ADMIN when another admin remains', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'ADMIN' };
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.tenantMembership.count.mockResolvedValue(1);
    expect(
      await callerWith().setMemberRole({
        tenantId: 't1',
        email: 'alice@client.test',
        role: 'MEMBER',
      })
    ).toEqual({ userId: 'u-alice', role: 'MEMBER', changed: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-alice' },
      data: { role: 'USER' },
    });
  });
});

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

describe('partner.listMembers', () => {
  const at = (iso: string) => new Date(iso);

  it('lists home users, live attached members and pinned staff; hides revoked and expired rows', async () => {
    const future = new Date(Date.now() + 3_600_000);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'u-owner',
        email: 'owner@client.test',
        name: 'Olive',
        role: 'ADMIN',
        provider: 'partner',
        createdAt: at('2026-09-01T00:00:00Z'),
      },
      {
        id: 'u-plain',
        email: 'plain@client.test',
        name: null,
        role: 'MANAGER',
        provider: 'email',
        createdAt: at('2026-09-02T00:00:00Z'),
      },
      {
        id: 'u-gone',
        email: 'gone@client.test',
        name: null,
        role: 'USER',
        provider: 'partner',
        createdAt: at('2026-09-03T00:00:00Z'),
      },
    ] as never);
    prismaMock.tenantMembership.findMany.mockResolvedValue([
      // revoked home row hides the home user
      {
        userId: 'u-gone',
        role: 'USER',
        source: 'HOME',
        pinned: false,
        revokedAt: at('2026-09-10T00:00:00Z'),
        expiresAt: null,
        createdAt: at('2026-09-03T00:00:00Z'),
        user: { id: 'u-gone', email: 'gone@client.test', name: null, tenantId: 't1' },
      },
      // live attached member
      {
        userId: 'u-carol',
        role: 'ADMIN',
        source: 'PORTAL_MEMBER',
        pinned: false,
        revokedAt: null,
        expiresAt: null,
        createdAt: at('2026-09-04T00:00:00Z'),
        user: { id: 'u-carol', email: 'carol@x.test', name: 'Carol', tenantId: 't2' },
      },
      // live pinned staff
      {
        userId: 'u-boss',
        role: 'ADMIN',
        source: 'PORTAL_STAFF',
        pinned: true,
        revokedAt: null,
        expiresAt: future,
        createdAt: at('2026-09-05T00:00:00Z'),
        user: { id: 'u-boss', email: 'boss@agency.test', name: null, tenantId: 'agency' },
      },
      // expired staff and revoked member are excluded
      {
        userId: 'u-old',
        role: 'ADMIN',
        source: 'PORTAL_STAFF',
        pinned: true,
        revokedAt: null,
        expiresAt: at('2026-01-01T00:00:00Z'),
        createdAt: at('2026-09-06T00:00:00Z'),
        user: { id: 'u-old', email: 'old@agency.test', name: null, tenantId: 'agency' },
      },
      {
        userId: 'u-rev',
        role: 'USER',
        source: 'PORTAL_MEMBER',
        pinned: false,
        revokedAt: at('2026-09-07T00:00:00Z'),
        expiresAt: null,
        createdAt: at('2026-09-06T00:00:00Z'),
        user: { id: 'u-rev', email: 'rev@x.test', name: null, tenantId: 't2' },
      },
    ] as never);

    const out = await callerWith().listMembers({ tenantId: 't1' });

    expect(out.tenantId).toBe('t1');
    expect(out.members).toEqual([
      {
        userId: 'u-owner',
        email: 'owner@client.test',
        name: 'Olive',
        role: 'ADMIN',
        source: 'PARTNER_CREATED',
        pinned: false,
        expiresAt: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        userId: 'u-plain',
        email: 'plain@client.test',
        name: null,
        role: 'MEMBER',
        source: 'HOME',
        pinned: false,
        expiresAt: null,
        createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        userId: 'u-carol',
        email: 'carol@x.test',
        name: 'Carol',
        role: 'ADMIN',
        source: 'PORTAL_MEMBER',
        pinned: false,
        expiresAt: null,
        createdAt: '2026-09-04T00:00:00.000Z',
      },
      {
        userId: 'u-boss',
        email: 'boss@agency.test',
        name: null,
        role: 'ADMIN',
        source: 'PORTAL_STAFF',
        pinned: true,
        expiresAt: future.toISOString(),
        createdAt: '2026-09-05T00:00:00.000Z',
      },
    ]);
    // the output obeys the published contract
    expect(sdk.listMembersOutputSchema.parse(out)).toEqual(out);
  });

  it('only lists tenants the partner sourced', async () => {
    await expect(callerWith().listMembers({ tenantId: 'foreign' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('needs the tenants:read scope', async () => {
    await expect(
      callerWith({ scopes: ['members:write'] }).listMembers({ tenantId: 't1' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ---------------------------------------------------------------------------
// inviteMember: re-inviting a removed person
// ---------------------------------------------------------------------------

describe('partner.inviteMember after a removal', () => {
  it('revives a revoked home user (seat checked under the lock) instead of leaving them out', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    prismaMock.tenantMembership.findUnique.mockResolvedValue({
      id: 'm1',
      role: 'USER',
      source: 'HOME',
      pinned: false,
      revokedAt: new Date(Date.now() - 1000),
      expiresAt: null,
    } as never);
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.tenantMembership.count.mockResolvedValue(0);
    const caller = callerWith({ quota: { getLimits: vi.fn().mockResolvedValue({ seats: 5 }) } });

    const out = await caller.inviteMember({
      tenantId: 't1',
      email: 'alice@client.test',
      role: 'MEMBER',
    });

    expect(out).toEqual({ userId: 'u-alice', created: false });
    expect(prismaMock.tenantMembership.update).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'u-alice', tenantId: 't1' } },
      data: { revokedAt: null, expiresAt: null },
    });
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: 'MEMBER_ATTACHED',
        detail: expect.objectContaining({ revived: true }),
      }),
    ]);
  });

  it('leaves a live home user untouched', async () => {
    users['alice@client.test'] = { id: 'u-alice', tenantId: 't1', role: 'USER' };
    const out = await callerWith().inviteMember({
      tenantId: 't1',
      email: 'alice@client.test',
      role: 'MEMBER',
    });
    expect(out).toEqual({ userId: 'u-alice', created: false });
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled();
  });
});
