/**
 * Partner router tests (ADR-070)
 *
 * Covers authentication, scopes, idempotency, tenant ownership checks and the
 * contract: the router's input/output schemas must be identical to the ones the
 * published `@intelliflow/partner-sdk` exposes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as sdk from '@intelliflow/partner-sdk';
import { createTestContext, prismaMock } from '../../../test/setup';
import { hashPartnerKey } from '../../../security/partner-auth';

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
  provisionTenantInput,
  provisionTenantOutput,
  getTenantInput,
  getTenantOutput,
  setPlanInput,
  setPlanOutput,
  inviteMemberInput,
  inviteMemberOutput,
  issueLoginLinkInput,
  issueLoginLinkOutput,
  getUsageInput,
  getUsageOutput,
} from '../partner.router';

const KEY = 'pk_test_key_value';
const EXTERNAL_REF = '3f2b8c1e-5a7d-4e29-9b64-0c1d2e3f4a5b';
const ALL_SCOPES = [
  'tenants:read',
  'tenants:write',
  'members:write',
  'auth:login-link',
  'usage:read',
];

function callerWith(opts: { scopes?: string[]; usage?: unknown; header?: string | null } = {}) {
  const ctx = createTestContext({
    req: (opts.header === null
      ? { headers: {} }
      : { headers: { authorization: opts.header ?? `Bearer ${KEY}` } }) as never,
  });
  const usagePort = 'usage' in opts ? opts.usage : { getUsage: vi.fn() };
  (ctx.container.get as any).mockImplementation((name: string) =>
    name === 'tenantUsage' ? (usagePort ?? undefined) : undefined
  );
  prismaMock.partnerApiKey.findUnique.mockResolvedValue({
    id: 'key-1',
    isActive: true,
    expiresAt: null,
    scopes: opts.scopes ?? ALL_SCOPES,
    partner: { id: 'partner-1', slug: 'leangency', status: 'ACTIVE' },
  } as never);
  prismaMock.partnerApiKey.update.mockResolvedValue({} as never);
  return { caller: (partnerRouter as any).createCaller(ctx), usagePort: usagePort as any };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof TRPCError && e.code === code
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PLATFORM_ADMIN_EMAILS;
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock)) as never);
});

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe('contract: router schemas equal the partner-sdk schemas', () => {
  const pairs: Array<[string, z.ZodType, z.ZodType]> = [
    ['provisionTenant.input', provisionTenantInput, sdk.provisionTenantInputSchema],
    ['provisionTenant.output', provisionTenantOutput, sdk.provisionTenantOutputSchema],
    ['getTenant.input', getTenantInput, sdk.getTenantInputSchema],
    ['getTenant.output', getTenantOutput, sdk.getTenantOutputSchema],
    ['setPlan.input', setPlanInput, sdk.setPlanInputSchema],
    ['setPlan.output', setPlanOutput, sdk.setPlanOutputSchema],
    ['inviteMember.input', inviteMemberInput, sdk.inviteMemberInputSchema],
    ['inviteMember.output', inviteMemberOutput, sdk.inviteMemberOutputSchema],
    ['issueLoginLink.input', issueLoginLinkInput, sdk.issueLoginLinkInputSchema],
    ['issueLoginLink.output', issueLoginLinkOutput, sdk.issueLoginLinkOutputSchema],
    ['getUsage.input', getUsageInput, sdk.getUsageInputSchema],
    ['getUsage.output', getUsageOutput, sdk.getUsageOutputSchema],
  ];
  for (const [name, routerSchema, sdkSchema] of pairs) {
    it(name, () => {
      expect(z.toJSONSchema(routerSchema)).toEqual(z.toJSONSchema(sdkSchema));
    });
  }

  it('registers exactly the partner procedures the sdk declares', () => {
    const declared = Object.keys(sdk.PROCEDURES)
      .filter((n) => n.startsWith('partner.'))
      .map((n) => n.slice('partner.'.length))
      .sort();
    expect(Object.keys((partnerRouter as any)._def.procedures).sort()).toEqual(declared);
  });

  it('every procedure requires the scope the sdk declares', async () => {
    for (const [name, def] of Object.entries(sdk.PROCEDURES)) {
      if (!name.startsWith('partner.')) continue;
      const { caller } = callerWith({ scopes: ALL_SCOPES.filter((s) => s !== def.scope) });
      const fn = name.slice('partner.'.length);
      await expectCode(caller[fn]({}), 'FORBIDDEN');
    }
  });
});

describe('authentication', () => {
  it.each([
    ['no header', null],
    ['non-bearer scheme', 'Basic abc'],
    ['bearer that is not a partner key', 'Bearer eyJhbGciOi'],
  ])('rejects %s with UNAUTHORIZED', async (_n, header) => {
    const { caller } = callerWith({ header });
    await expectCode(caller.getTenant({ externalRef: EXTERNAL_REF }), 'UNAUTHORIZED');
  });

  it('looks the key up by its sha256 and records lastUsedAt', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);

    await caller.getTenant({ externalRef: EXTERNAL_REF });

    expect(prismaMock.partnerApiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashPartnerKey(KEY) } })
    );
    expect(prismaMock.partnerApiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects unknown, inactive, expired keys and suspended partners', async () => {
    const { caller } = callerWith();
    const base = { id: 'k', scopes: ALL_SCOPES, partner: { id: 'p', slug: 's', status: 'ACTIVE' } };
    for (const record of [
      null,
      { ...base, isActive: false, expiresAt: null },
      { ...base, isActive: true, expiresAt: new Date(Date.now() - 1000) },
      {
        ...base,
        isActive: true,
        expiresAt: null,
        partner: { id: 'p', slug: 's', status: 'SUSPENDED' },
      },
    ]) {
      prismaMock.partnerApiKey.findUnique.mockResolvedValue(record as never);
      await expectCode(caller.getTenant({ externalRef: EXTERNAL_REF }), 'UNAUTHORIZED');
    }
  });

  it('does not fail the request when the lastUsedAt write fails', async () => {
    const { caller } = callerWith();
    prismaMock.partnerApiKey.update.mockRejectedValue(new Error('db down'));
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(caller.getTenant({ externalRef: EXTERNAL_REF })).resolves.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats a non-array scopes value as no scopes', async () => {
    const { caller } = callerWith();
    prismaMock.partnerApiKey.findUnique.mockResolvedValue({
      id: 'k',
      isActive: true,
      expiresAt: null,
      scopes: 'tenants:read',
      partner: { id: 'p', slug: 's', status: 'ACTIVE' },
    } as never);
    await expectCode(caller.getTenant({ externalRef: EXTERNAL_REF }), 'FORBIDDEN');
  });
});

describe('partner.provisionTenant', () => {
  const input = {
    externalRef: EXTERNAL_REF,
    name: 'Acme Ltd!',
    plan: 'PARTNER_FREE' as const,
    ownerEmail: 'Owner@Acme.test',
    ownerName: 'Olive Owner',
  };

  it('is idempotent on (partner, externalRef): an existing tenant is returned with created:false', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: 't1',
      slug: 'acme',
      plan: 'STARTER',
    } as never);

    const out = await caller.provisionTenant(input);

    expect(out).toEqual({ tenantId: 't1', slug: 'acme', plan: 'STARTER', created: false });
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { partnerId_externalRef: { partnerId: 'partner-1', externalRef: EXTERNAL_REF } },
      })
    );
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('creates a PARTNER tenant plus an ADMIN owner that shares the Supabase user id', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    prismaMock.tenant.create.mockResolvedValue({
      id: 't-new',
      slug: 'acme-ltd-3f2b8c1e',
      plan: 'PARTNER_FREE',
    } as never);
    prismaMock.user.create.mockResolvedValue({} as never);

    const out = await caller.provisionTenant(input);

    expect(out).toEqual({
      tenantId: 't-new',
      slug: 'acme-ltd-3f2b8c1e',
      plan: 'PARTNER_FREE',
      created: true,
    });
    expect(supabaseAdminMock.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'owner@acme.test',
      email_confirm: true,
      user_metadata: { name: 'Olive Owner' },
    });
    expect(prismaMock.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'PARTNER',
          partnerId: 'partner-1',
          externalRef: EXTERNAL_REF,
          plan: 'PARTNER_FREE',
          slug: 'acme-ltd-3f2b8c1e',
        }),
      })
    );
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'sb-1',
        email: 'owner@acme.test',
        role: 'ADMIN',
        tenantId: 't-new',
      }),
    });
  });

  it('uses a requested slug when free and rejects it with CONFLICT when taken', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique
      .mockResolvedValueOnce(null) // by (partner, externalRef)
      .mockResolvedValueOnce({ id: 'other' } as never); // by slug
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expectCode(caller.provisionTenant({ ...input, slug: 'acme' }), 'CONFLICT');
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('honours a free requested slug', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    prismaMock.tenant.create.mockResolvedValue({ id: 't', slug: 'acme', plan: 'STARTER' } as never);
    prismaMock.user.create.mockResolvedValue({} as never);

    await caller.provisionTenant({ ...input, slug: 'acme', plan: 'STARTER', ownerName: undefined });

    expect(prismaMock.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'acme' }) })
    );
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'owner' }),
    });
  });

  it('answers CONFLICT when the owner email already has an account', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u' } as never);

    await expectCode(caller.provisionTenant(input), 'CONFLICT');
  });

  it('refuses to mint an account for a platform operator email', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@leangency.test, OWNER@acme.test';
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expectCode(caller.provisionTenant(input), 'CONFLICT');
    expect(supabaseAdminMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('reuses an Auth user that exists without a CRM row (found via generateLink)', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'exists' },
    });
    supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
      data: { user: { id: 'sb-existing' }, properties: {} },
      error: null,
    });
    prismaMock.tenant.create.mockResolvedValue({ id: 't', slug: 's', plan: 'STARTER' } as never);
    prismaMock.user.create.mockResolvedValue({} as never);

    await caller.provisionTenant({ ...input, plan: 'STARTER' });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'sb-existing' }),
    });
  });

  it('answers INTERNAL_SERVER_ERROR when the Auth user cannot be provisioned', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'boom' },
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expectCode(caller.provisionTenant(input), 'INTERNAL_SERVER_ERROR');
    err.mockRestore();
  });

  it('removes the Auth user it created when the CRM write fails, and rethrows', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    prismaMock.tenant.create.mockRejectedValue(new Error('db down'));

    await expect(caller.provisionTenant(input)).rejects.toThrow('db down');
    expect(supabaseAdminMock.auth.admin.deleteUser).toHaveBeenCalledWith('sb-1');
  });

  it('does not delete a pre-existing Auth user on failure, and tolerates cleanup errors', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
      data: { user: { id: 'sb-old' } },
      error: null,
    });
    prismaMock.tenant.create.mockRejectedValue(new Error('db down'));

    await expect(caller.provisionTenant(input)).rejects.toThrow('db down');
    expect(supabaseAdminMock.auth.admin.deleteUser).not.toHaveBeenCalled();

    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-2' } },
      error: null,
    });
    supabaseAdminMock.auth.admin.deleteUser.mockRejectedValue(new Error('cleanup failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(caller.provisionTenant(input)).rejects.toThrow('db down');
    warn.mockRestore();
  });

  it('resolves a concurrent duplicate (unique violation) to the winner with created:false', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'winner', slug: 'w', plan: 'STARTER' } as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    prismaMock.tenant.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' })
    );

    const out = await caller.provisionTenant(input);

    expect(out).toEqual({ tenantId: 'winner', slug: 'w', plan: 'STARTER', created: false });
  });

  it('answers CONFLICT on a unique violation with no matching winner', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-1' } },
      error: null,
    });
    prismaMock.tenant.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' })
    );

    await expectCode(caller.provisionTenant(input), 'CONFLICT');
  });

  it('rejects plan CUSTOM and malformed input', async () => {
    const { caller } = callerWith();
    await expect(caller.provisionTenant({ ...input, plan: 'CUSTOM' })).rejects.toThrow();
    await expect(caller.provisionTenant({ ...input, externalRef: 'x' })).rejects.toThrow();
  });
});

describe('partner.getTenant', () => {
  it('returns the tenant for (partner, externalRef), or null', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValueOnce({
      id: 't1',
      slug: 'acme',
      plan: 'PARTNER_FREE',
      status: 'ACTIVE',
    } as never);
    expect(await caller.getTenant({ externalRef: EXTERNAL_REF })).toEqual({
      tenantId: 't1',
      slug: 'acme',
      plan: 'PARTNER_FREE',
      status: 'ACTIVE',
    });

    prismaMock.tenant.findUnique.mockResolvedValueOnce(null);
    expect(await caller.getTenant({ externalRef: EXTERNAL_REF })).toBeNull();
  });
});

describe('tenant ownership checks (setPlan, inviteMember, issueLoginLink, getUsage)', () => {
  const calls: Array<[string, (c: any) => Promise<unknown>]> = [
    ['setPlan', (c) => c.setPlan({ tenantId: 't1', plan: 'STARTER' })],
    ['inviteMember', (c) => c.inviteMember({ tenantId: 't1', email: 'a@b.co', role: 'MEMBER' })],
    ['issueLoginLink', (c) => c.issueLoginLink({ tenantId: 't1', email: 'a@b.co' })],
    ['getUsage', (c) => c.getUsage({ tenantId: 't1' })],
  ];

  for (const [name, run] of calls) {
    it(`${name}: NOT_FOUND for a missing tenant`, async () => {
      const { caller } = callerWith();
      prismaMock.tenant.findUnique.mockResolvedValue(null);
      await expectCode(run(caller), 'NOT_FOUND');
    });

    it(`${name}: FORBIDDEN for a tenant another partner (or nobody) sourced`, async () => {
      const { caller } = callerWith();
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', partnerId: 'partner-2' } as never);
      await expectCode(run(caller), 'FORBIDDEN');
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', partnerId: null } as never);
      await expectCode(run(caller), 'FORBIDDEN');
    });
  }
});

describe('partner.setPlan', () => {
  it('updates Tenant.plan for an owned tenant', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', partnerId: 'partner-1' } as never);
    prismaMock.tenant.update.mockResolvedValue({ id: 't1', plan: 'PROFESSIONAL' } as never);

    expect(await caller.setPlan({ tenantId: 't1', plan: 'PROFESSIONAL' })).toEqual({
      tenantId: 't1',
      plan: 'PROFESSIONAL',
    });
    expect(prismaMock.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: { plan: 'PROFESSIONAL' } })
    );
  });
});

describe('partner.inviteMember', () => {
  const owned = { id: 't1', partnerId: 'partner-1' };

  it('returns an existing member of the same tenant with created:false', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' } as never);

    expect(await caller.inviteMember({ tenantId: 't1', email: 'A@b.co', role: 'ADMIN' })).toEqual({
      userId: 'u1',
      created: false,
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'a@b.co' } })
    );
  });

  it('answers CONFLICT for an email that belongs to another tenant', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 'other' } as never);

    await expectCode(
      caller.inviteMember({ tenantId: 't1', email: 'a@b.co', role: 'MEMBER' }),
      'CONFLICT'
    );
  });

  it.each([
    ['ADMIN', 'ADMIN'],
    ['MEMBER', 'USER'],
  ])('creates a %s invitee as UserRole %s', async (role, mapped) => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-9' } },
      error: null,
    });
    prismaMock.user.create.mockResolvedValue({ id: 'sb-9' } as never);

    const out = await caller.inviteMember({ tenantId: 't1', email: 'new@b.co', name: 'New', role });

    expect(out).toEqual({ userId: 'sb-9', created: true });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'sb-9', role: mapped, tenantId: 't1', name: 'New' }),
      })
    );
  });

  it('refuses operator emails, cleans up on failure and maps a unique violation to CONFLICT', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue(null);

    process.env.PLATFORM_ADMIN_EMAILS = 'ops@b.co';
    await expectCode(
      caller.inviteMember({ tenantId: 't1', email: 'ops@b.co', role: 'ADMIN' }),
      'CONFLICT'
    );
    delete process.env.PLATFORM_ADMIN_EMAILS;

    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'sb-9' } },
      error: null,
    });
    prismaMock.user.create.mockRejectedValue(Object.assign(new Error('u'), { code: 'P2002' }));
    await expectCode(
      caller.inviteMember({ tenantId: 't1', email: 'x@b.co', role: 'MEMBER' }),
      'CONFLICT'
    );
    expect(supabaseAdminMock.auth.admin.deleteUser).toHaveBeenCalledWith('sb-9');

    prismaMock.user.create.mockRejectedValue(new Error('db down'));
    await expect(
      caller.inviteMember({ tenantId: 't1', email: 'x@b.co', role: 'MEMBER' })
    ).rejects.toThrow('db down');
  });
});

describe('partner.issueLoginLink', () => {
  const owned = { id: 't1', partnerId: 'partner-1' };

  it('issues a magic link for a member of the tenant', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: 't1' } as never);
    supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://auth.example.com/verify?token=abc' } },
      error: null,
    });

    const out = await caller.issueLoginLink({
      tenantId: 't1',
      email: 'A@b.co',
      redirectTo: 'https://app.example.com/crm',
    });

    expect(out.url).toBe('https://auth.example.com/verify?token=abc');
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now());
    expect(supabaseAdminMock.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'a@b.co',
      options: { redirectTo: 'https://app.example.com/crm' },
    });
  });

  it('omits options when no redirectTo is given', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: 't1' } as never);
    supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://auth.example.com/v' } },
      error: null,
    });

    await caller.issueLoginLink({ tenantId: 't1', email: 'a@b.co' });

    expect(supabaseAdminMock.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'a@b.co',
      options: undefined,
    });
  });

  it('is FORBIDDEN unless the user belongs to that tenant', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);

    prismaMock.user.findUnique.mockResolvedValue(null);
    await expectCode(caller.issueLoginLink({ tenantId: 't1', email: 'a@b.co' }), 'FORBIDDEN');

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: 'other' } as never);
    await expectCode(caller.issueLoginLink({ tenantId: 't1', email: 'a@b.co' }), 'FORBIDDEN');
    expect(supabaseAdminMock.auth.admin.generateLink).not.toHaveBeenCalled();
  });

  it('answers INTERNAL_SERVER_ERROR without leaking when Supabase fails', async () => {
    const { caller } = callerWith();
    prismaMock.tenant.findUnique.mockResolvedValue(owned as never);
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: 't1' } as never);
    supabaseAdminMock.auth.admin.generateLink.mockResolvedValue({
      data: null,
      error: { message: 'secret detail' },
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(caller.issueLoginLink({ tenantId: 't1', email: 'a@b.co' })).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof TRPCError &&
        e.code === 'INTERNAL_SERVER_ERROR' &&
        !e.message.includes('secret')
    );
    err.mockRestore();
  });
});

describe('partner.getUsage', () => {
  const usage = {
    tenantId: 't1',
    plan: 'PARTNER_FREE',
    modules: ['CORE_CRM'],
    quotas: {
      contacts: { used: 2, limit: null },
      seats: { used: 1, limit: null },
      emailsPerMonth: { used: 0, limit: null, measured: true },
      aiSpendCentsPerMonth: { used: 0, limit: null, measured: false },
    },
    asOf: '2026-09-30T12:00:00.000Z',
  };

  it('returns the TenantUsagePort result for an owned tenant', async () => {
    const { caller, usagePort } = callerWith({
      usage: { getUsage: vi.fn().mockResolvedValue(usage) },
    });
    prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', partnerId: 'partner-1' } as never);

    expect(await caller.getUsage({ tenantId: 't1' })).toEqual(usage);
    expect(usagePort.getUsage).toHaveBeenCalledWith('t1');
  });

  it('answers INTERNAL_SERVER_ERROR when the usage port is not wired', async () => {
    const { caller } = callerWith({ usage: null });
    prismaMock.tenant.findUnique.mockResolvedValue({ id: 't1', partnerId: 'partner-1' } as never);

    await expectCode(caller.getUsage({ tenantId: 't1' }), 'INTERNAL_SERVER_ERROR');
  });
});
