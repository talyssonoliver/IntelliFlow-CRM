import { describe, it, expect, vi } from 'vitest';
import {
  PARTNER_KEY_PREFIX,
  generatePartnerKey,
  getPlatformAdminEmails,
  hashPartnerKey,
  isPlatformAdmin,
  issuePartnerKey,
} from '../partner-auth';

describe('generatePartnerKey', () => {
  it('returns a pk_ plaintext, its sha256 and a short prefix', () => {
    const key = generatePartnerKey();

    expect(key.plaintext.startsWith(PARTNER_KEY_PREFIX)).toBe(true);
    expect(key.plaintext.length).toBeGreaterThan(40);
    expect(key.keyHash).toBe(hashPartnerKey(key.plaintext));
    expect(key.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(key.keyPrefix).toBe(key.plaintext.slice(0, 11));
    expect(key.keyHash).not.toContain(key.plaintext);
  });

  it('never repeats', () => {
    expect(generatePartnerKey().plaintext).not.toBe(generatePartnerKey().plaintext);
  });
});

describe('platform admin allowlist', () => {
  it('is empty (fail-closed) when PLATFORM_ADMIN_EMAILS is unset or blank', () => {
    expect(getPlatformAdminEmails({}).size).toBe(0);
    expect(getPlatformAdminEmails({ PLATFORM_ADMIN_EMAILS: ' , ' }).size).toBe(0);
    expect(isPlatformAdmin({ email: 'a@b.co', emailVerified: true }, {})).toBe(false);
  });

  it('normalises case and whitespace', () => {
    const env = { PLATFORM_ADMIN_EMAILS: ' Ops@Leangency.test ,two@x.test' };
    expect([...getPlatformAdminEmails(env)]).toEqual(['ops@leangency.test', 'two@x.test']);
    expect(isPlatformAdmin({ email: 'OPS@leangency.test', emailVerified: true }, env)).toBe(true);
  });

  it('requires a verified email and a listed address', () => {
    const env = { PLATFORM_ADMIN_EMAILS: 'ops@leangency.test' };
    expect(isPlatformAdmin({ email: 'ops@leangency.test', emailVerified: false }, env)).toBe(false);
    expect(isPlatformAdmin({ email: 'ops@leangency.test' }, env)).toBe(false);
    expect(isPlatformAdmin({ email: 'other@x.test', emailVerified: true }, env)).toBe(false);
    expect(isPlatformAdmin(null, env)).toBe(false);
    expect(isPlatformAdmin(undefined, env)).toBe(false);
  });

  it('reads process.env by default', () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@leangency.test';
    try {
      expect(isPlatformAdmin({ email: 'ops@leangency.test', emailVerified: true })).toBe(true);
    } finally {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    }
    expect(isPlatformAdmin({ email: 'ops@leangency.test', emailVerified: true })).toBe(false);
  });
});

describe('issuePartnerKey', () => {
  function fakePrisma() {
    return {
      partner: { upsert: vi.fn().mockResolvedValue({ id: 'p1' }) },
      partnerApiKey: { create: vi.fn().mockResolvedValue({ id: 'k1' }) },
    };
  }

  it('upserts the partner and stores only the hash of the returned plaintext', async () => {
    const prisma = fakePrisma();
    const expiresAt = new Date('2027-01-01T00:00:00Z');

    const out = await issuePartnerKey(prisma as never, {
      partnerSlug: 'leangency',
      partnerName: 'Leangency Portal',
      keyName: 'portal-prod',
      scopes: ['tenants:read', 'tenants:write'],
      expiresAt,
    });

    expect(prisma.partner.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'leangency' },
        create: { slug: 'leangency', name: 'Leangency Portal' },
      })
    );
    const stored = prisma.partnerApiKey.create.mock.calls[0]![0].data;
    expect(stored.keyHash).toBe(hashPartnerKey(out.plaintext));
    expect(JSON.stringify(stored)).not.toContain(out.plaintext);
    expect(stored).toMatchObject({
      partnerId: 'p1',
      name: 'portal-prod',
      scopes: ['tenants:read', 'tenants:write'],
      expiresAt,
      keyPrefix: out.keyPrefix,
    });
    expect(out).toMatchObject({ partnerId: 'p1', keyId: 'k1' });
  });

  it('defaults the partner name to its slug and the expiry to none', async () => {
    const prisma = fakePrisma();

    await issuePartnerKey(prisma as never, {
      partnerSlug: 'acme',
      keyName: 'k',
      scopes: ['usage:read'],
    });

    expect(prisma.partner.upsert.mock.calls[0]![0].create).toEqual({ slug: 'acme', name: 'acme' });
    expect(prisma.partnerApiKey.create.mock.calls[0]![0].data.expiresAt).toBeNull();
  });

  it('rejects unknown or missing scopes before touching the database', async () => {
    const prisma = fakePrisma();

    await expect(
      issuePartnerKey(prisma as never, {
        partnerSlug: 'a',
        keyName: 'k',
        scopes: ['tenants:delete'],
      })
    ).rejects.toThrow(/tenants:delete/);
    await expect(
      issuePartnerKey(prisma as never, { partnerSlug: 'a', keyName: 'k', scopes: [] })
    ).rejects.toThrow(/none given/);
    expect(prisma.partner.upsert).not.toHaveBeenCalled();
  });
});
