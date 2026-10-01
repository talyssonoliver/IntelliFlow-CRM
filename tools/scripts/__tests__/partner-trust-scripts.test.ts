/**
 * Operator scripts that set a partner's trust anchors (ADR-071): the assertion public key and
 * the owner tenant. Both are dry-run by default and refuse to write to a non-local database
 * without an explicit decision.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  OperatorError,
  assertMayWrite,
  describeTarget,
  fingerprintOfPem,
  parseAssertionPublicKey,
  type PartnerTrustDb,
} from '../lib/partner-trust';
import { setPartnerAssertionKey } from '../set-partner-assertion-key';
import { setPartnerOwnerTenant } from '../set-partner-owner-tenant';

const LOCAL = { host: 'localhost', local: true };
const PROD = { host: 'db.example.supabase.co', local: false };

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  return {
    publicPem: (publicKey.export({ type: 'spki', format: 'pem' }) as string).trim(),
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    privateDerB64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
    spkiDerB64: spkiDer.toString('base64url'),
    raw: spkiDer.subarray(spkiDer.length - 32),
    fingerprint: createHash('sha256').update(spkiDer).digest('hex').slice(0, 16),
  };
}

function fakeDb(
  partner: Record<string, unknown> | null,
  tenant: Record<string, unknown> | null = null
) {
  const update = vi.fn().mockResolvedValue({});
  const db: PartnerTrustDb = {
    partner: {
      findUnique: vi.fn().mockResolvedValue(partner),
      update,
    },
    tenant: { findUnique: vi.fn().mockResolvedValue(tenant) },
  };
  return { db, update };
}

describe('parseAssertionPublicKey', () => {
  it('accepts an SPKI PEM and fingerprints the SPKI DER (sha256, first 16 hex)', () => {
    const k = keyPair();
    const parsed = parseAssertionPublicKey(k.publicPem);
    expect(parsed.pem).toBe(k.publicPem);
    expect(parsed.fingerprint).toBe(k.fingerprint);
    expect(parsed.derivedFromPrivate).toBe(false);
  });

  it('derives the public half of a PKCS8 PEM private key and flags it', () => {
    const k = keyPair();
    const parsed = parseAssertionPublicKey(k.privatePem);
    expect(parsed.pem).toBe(k.publicPem);
    expect(parsed.fingerprint).toBe(k.fingerprint);
    expect(parsed.derivedFromPrivate).toBe(true);
    expect(parsed.pem).not.toContain('PRIVATE');
  });

  it('accepts a PEM written with literal \\n sequences (Portal env style)', () => {
    const k = keyPair();
    const parsed = parseAssertionPublicKey(k.publicPem.replace(/\n/g, '\\n'));
    expect(parsed.fingerprint).toBe(k.fingerprint);
  });

  it.each([
    [
      'raw 32-byte base64url',
      (k: ReturnType<typeof keyPair>) => k.raw.toString('base64url'),
      false,
    ],
    ['raw 32-byte base64', (k: ReturnType<typeof keyPair>) => k.raw.toString('base64'), false],
    ['SPKI DER base64url', (k: ReturnType<typeof keyPair>) => k.spkiDerB64, false],
    ['PKCS8 DER base64url', (k: ReturnType<typeof keyPair>) => k.privateDerB64, true],
  ])('converts %s', (_name, encode, derived) => {
    const k = keyPair();
    const parsed = parseAssertionPublicKey(`  ${encode(k)}\n`);
    expect(parsed.pem).toBe(k.publicPem);
    expect(parsed.fingerprint).toBe(k.fingerprint);
    expect(parsed.derivedFromPrivate).toBe(derived);
  });

  it('rejects a non-Ed25519 key', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    expect(() => parseAssertionPublicKey(pem)).toThrow(/not Ed25519/);
    const { publicKey: ec } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(() =>
      parseAssertionPublicKey(ec.export({ type: 'spki', format: 'pem' }) as string)
    ).toThrow(OperatorError);
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   \n'],
    ['not base64', 'not a key!!'],
    ['a short base64 string', 'AAAA'],
    ['a broken PEM', '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----'],
  ])('rejects %s', (_name, input) => {
    expect(() => parseAssertionPublicKey(input)).toThrow(OperatorError);
  });
});

describe('set-partner-assertion-key', () => {
  const partner = { id: 'p1', slug: 'leangency', assertionPublicKey: null as string | null };

  it('is a dry run by default: prints both fingerprints and writes nothing', async () => {
    const k = keyPair();
    const { db, update } = fakeDb(partner);

    const result = await setPartnerAssertionKey(db, {
      partner: 'leangency',
      keyInput: k.publicPem,
      apply: false,
      target: LOCAL,
    });

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      currentFingerprint: null,
      newFingerprint: k.fingerprint,
      changed: true,
      applied: false,
    });
    expect(result.lines.join('\n')).toContain('current key:     (none)');
    expect(result.lines.join('\n')).toContain(`new key:         ${k.fingerprint}`);
    expect(result.lines.join('\n')).toContain('dry run');
  });

  it('--apply writes the canonical public PEM to the partner row', async () => {
    const k = keyPair();
    const { db, update } = fakeDb(partner);

    const result = await setPartnerAssertionKey(db, {
      partner: 'leangency',
      keyInput: k.privatePem,
      apply: true,
      target: LOCAL,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { assertionPublicKey: k.publicPem },
    });
    expect(result.applied).toBe(true);
    // the private key is never echoed
    expect(result.lines.join('\n')).not.toContain(k.privatePem.split('\n')[1]!);
    expect(result.lines.join('\n')).toContain('PRIVATE key was supplied');
  });

  it('shows the current key fingerprint and replaces it on rotation', async () => {
    const old = keyPair();
    const next = keyPair();
    const { db, update } = fakeDb({ ...partner, assertionPublicKey: old.publicPem });

    const result = await setPartnerAssertionKey(db, {
      partner: 'leangency',
      keyInput: next.publicPem,
      apply: true,
      target: LOCAL,
    });

    expect(result.currentFingerprint).toBe(old.fingerprint);
    expect(result.newFingerprint).toBe(next.fingerprint);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not write when the key is already registered', async () => {
    const k = keyPair();
    const { db, update } = fakeDb({ ...partner, assertionPublicKey: k.publicPem });

    const result = await setPartnerAssertionKey(db, {
      partner: 'leangency',
      keyInput: k.publicPem,
      apply: true,
      target: LOCAL,
    });

    expect(result).toMatchObject({ changed: false, applied: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a stored value that is not a readable key as no current key', async () => {
    const k = keyPair();
    const { db } = fakeDb({ ...partner, assertionPublicKey: 'garbage' });
    const result = await setPartnerAssertionKey(db, {
      partner: 'leangency',
      keyInput: k.publicPem,
      apply: false,
      target: LOCAL,
    });
    expect(result.currentFingerprint).toBeNull();
    expect(fingerprintOfPem('garbage')).toBeNull();
  });

  it('refuses to write to a non-local database without ALLOW_PROD_DB_OPS=1', async () => {
    const k = keyPair();
    const { db, update } = fakeDb(partner);
    await expect(
      setPartnerAssertionKey(db, {
        partner: 'leangency',
        keyInput: k.publicPem,
        apply: true,
        target: PROD,
      })
    ).rejects.toThrow(/not a local database/);
    expect(update).not.toHaveBeenCalled();

    // a dry run against production is always allowed
    await expect(
      setPartnerAssertionKey(db, {
        partner: 'leangency',
        keyInput: k.publicPem,
        apply: false,
        target: PROD,
      })
    ).resolves.toMatchObject({ applied: false });
  });

  it('fails for an unknown partner and for a bad key, before any write', async () => {
    const k = keyPair();
    const missing = fakeDb(null);
    await expect(
      setPartnerAssertionKey(missing.db, {
        partner: 'nope',
        keyInput: k.publicPem,
        apply: true,
        target: LOCAL,
      })
    ).rejects.toThrow(/No partner with slug "nope"/);

    const { db, update } = fakeDb(partner);
    await expect(
      setPartnerAssertionKey(db, {
        partner: 'leangency',
        keyInput: 'not a key!!',
        apply: true,
        target: LOCAL,
      })
    ).rejects.toThrow(OperatorError);
    expect(update).not.toHaveBeenCalled();
    expect(missing.update).not.toHaveBeenCalled();
  });
});

describe('set-partner-owner-tenant', () => {
  const partner = { id: 'p1', slug: 'leangency', ownerTenantId: null as string | null };
  const direct = { id: 'agency', slug: 'agency', partnerId: null, source: 'DIRECT' };

  it('is a dry run by default and prints before and after', async () => {
    const { db, update } = fakeDb(partner, direct);
    const result = await setPartnerOwnerTenant(db, {
      partner: 'leangency',
      tenantId: 'agency',
      apply: false,
      target: LOCAL,
    });
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ before: null, after: 'agency', changed: true, applied: false });
    expect(result.lines.join('\n')).toContain('(none) -> agency (agency)');
  });

  it('--apply writes ownerTenantId', async () => {
    const { db, update } = fakeDb(partner, direct);
    const result = await setPartnerOwnerTenant(db, {
      partner: 'leangency',
      tenantId: 'agency',
      apply: true,
      target: LOCAL,
    });
    expect(update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { ownerTenantId: 'agency' } });
    expect(result.applied).toBe(true);
  });

  it('does not write when already set', async () => {
    const { db, update } = fakeDb({ ...partner, ownerTenantId: 'agency' }, direct);
    const result = await setPartnerOwnerTenant(db, {
      partner: 'leangency',
      tenantId: 'agency',
      apply: true,
      target: LOCAL,
    });
    expect(result).toMatchObject({ changed: false, applied: false });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['a partner-sourced tenant', { ...direct, partnerId: 'p1', source: 'PARTNER' }],
    ['a tenant with a partner but DIRECT source', { ...direct, partnerId: 'p1' }],
    ['a PARTNER-source tenant with no partner id', { ...direct, source: 'PARTNER' }],
  ])('refuses %s: a client tenant can never be the owner tenant', async (_name, tenant) => {
    const { db, update } = fakeDb(partner, tenant);
    await expect(
      setPartnerOwnerTenant(db, {
        partner: 'leangency',
        tenantId: 'agency',
        apply: true,
        target: LOCAL,
      })
    ).rejects.toThrow(/must be a DIRECT tenant with no partner/);
    expect(update).not.toHaveBeenCalled();
  });

  it('fails for an unknown partner or tenant', async () => {
    await expect(
      setPartnerOwnerTenant(fakeDb(null, direct).db, {
        partner: 'nope',
        tenantId: 'agency',
        apply: true,
        target: LOCAL,
      })
    ).rejects.toThrow(/No partner/);
    await expect(
      setPartnerOwnerTenant(fakeDb(partner, null).db, {
        partner: 'leangency',
        tenantId: 'ghost',
        apply: true,
        target: LOCAL,
      })
    ).rejects.toThrow(/No tenant/);
  });

  it('refuses to write to a non-local database without ALLOW_PROD_DB_OPS=1', async () => {
    const { db, update } = fakeDb(partner, direct);
    await expect(
      setPartnerOwnerTenant(db, {
        partner: 'leangency',
        tenantId: 'agency',
        apply: true,
        target: PROD,
      })
    ).rejects.toThrow(/not a local database/);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('database target guard', () => {
  it('treats local hosts as local and anything else as production', () => {
    expect(describeTarget('postgresql://u:p@localhost:5433/intelliflow_test')).toEqual({
      host: 'localhost',
      local: true,
    });
    expect(describeTarget('postgresql://u:p@db.abc.supabase.co:5432/postgres').local).toBe(false);
    expect(describeTarget(undefined)).toEqual({ host: '(none)', local: false });
  });

  it('never leaks credentials into the described target', () => {
    const target = describeTarget('postgresql://admin:s3cret@db.abc.supabase.co:5432/postgres');
    expect(JSON.stringify(target)).not.toContain('s3cret');
  });

  it('assertMayWrite honours ALLOW_PROD_DB_OPS only as the literal 1', () => {
    expect(() => assertMayWrite(PROD, { ALLOW_PROD_DB_OPS: '1' })).not.toThrow();
    expect(() => assertMayWrite(PROD, { ALLOW_PROD_DB_OPS: 'true' })).toThrow(OperatorError);
    expect(() => assertMayWrite(PROD, {})).toThrow(OperatorError);
    expect(() => assertMayWrite(LOCAL, {})).not.toThrow();
  });
});
