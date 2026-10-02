/**
 * Portal login assertion verification (ADR-071, contract section b).
 *
 * One test per rule of the contract, in the order the verifier applies them, plus the
 * equivalence of the API's mirrored schemas with the published `@intelliflow/partner-sdk` ones.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as sdk from '@intelliflow/partner-sdk';
import {
  AssertionError,
  ASSERTION_MAX_BYTES,
  assertionClaimsSchema,
  assertionHeaderSchema,
  assertionTenantSchema,
  isAssertionRequired,
  isInheritedMembershipEnabled,
  verifyAssertion,
  type AssertionFailure,
} from '../partner-assertion';
import { MEMBERSHIP_ERROR_REASONS } from '../../modules/partner/membership';
import {
  claimsFor,
  newKeyPair,
  newRsaPublicKeyPem,
  signAssertion,
  EXTERNAL_REF,
} from '../../test/assertion-fixtures';

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const keys = newKeyPair();

function verify(assertion: string, over: Partial<Parameters<typeof verifyAssertion>[0]> = {}) {
  return verifyAssertion({
    assertion,
    publicKeyPem: keys.publicKeyPem,
    partnerSlug: 'leangency',
    email: 'alice@client.test',
    nowMs: NOW,
    ...over,
  });
}

function failure(fn: () => unknown): AssertionFailure {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AssertionError);
    return (error as AssertionError).check;
  }
  throw new Error('expected the assertion to be rejected');
}

const signed = (over: Record<string, unknown> = {}, nowMs = NOW) =>
  signAssertion(claimsFor(over, nowMs), keys.privateKey);

describe('verifyAssertion: accepts a well-formed assertion', () => {
  it('returns the claims', () => {
    const claims = verify(signed());
    expect(claims).toMatchObject({
      iss: 'leangency',
      aud: 'intelliflow-crm',
      sub: 'alice@client.test',
      kind: 'member',
      role: 'MEMBER',
      tenant: { externalRef: EXTERNAL_REF },
    });
  });

  it('accepts an IntelliFlow tenantId instead of an externalRef, and kind=staff', () => {
    const claims = verify(
      signed({ tenant: { tenantId: 'tenant-1' }, kind: 'staff', role: 'ADMIN' })
    );
    expect(claims.tenant).toEqual({ tenantId: 'tenant-1' });
    expect(claims.kind).toBe('staff');
  });

  it('normalises the requested email (trim, lower-case) before comparing', () => {
    expect(() => verify(signed(), { email: '  Alice@Client.TEST ' })).not.toThrow();
  });

  it('tolerates the documented clock leeway at both ends', () => {
    // issued 5 s in the future, expired 5 s ago
    expect(() => verify(signed({ iat: NOW / 1000 + 5, exp: NOW / 1000 + 35 }))).not.toThrow();
    expect(() => verify(signed({ iat: NOW / 1000 - 40, exp: NOW / 1000 - 5 }))).not.toThrow();
  });
});

describe('step 1: presence, size, three segments', () => {
  it.each([
    ['empty', ''],
    ['one segment', 'abc'],
    ['two segments', 'abc.def'],
    ['four segments', 'a.b.c.d'],
    ['an empty segment', 'a..c'],
  ])('rejects %s as malformed', (_name, token) => {
    expect(failure(() => verify(token))).toBe('malformed');
  });

  it('rejects a token over the size cap', () => {
    expect(failure(() => verify('a'.repeat(ASSERTION_MAX_BYTES + 1)))).toBe('too_large');
  });

  it('rejects padded or non-url-safe base64 (two spellings must not share signed bytes)', () => {
    const [h, p, s] = signed().split('.');
    expect(failure(() => verify(`${h}=.${p}.${s}`))).toBe('malformed');
    // the payload is only decoded after the signature check, which already fails on the bytes
    expect(failure(() => verify(`${h}.${p}+.${s}`))).toBe('bad_signature');
    expect(failure(() => verify(`${h}.${p}./${s}`))).toBe('malformed');
  });
});

describe('step 2: the header is exactly EdDSA / intelliflow-assertion+jwt', () => {
  const claims = () => claimsFor({}, NOW);

  it.each([
    ['alg none', { alg: 'none', typ: 'intelliflow-assertion+jwt' }],
    ['HS256', { alg: 'HS256', typ: 'intelliflow-assertion+jwt' }],
    ['RS256', { alg: 'RS256', typ: 'intelliflow-assertion+jwt' }],
    ['ES256', { alg: 'ES256', typ: 'intelliflow-assertion+jwt' }],
    ['a lower-case eddsa', { alg: 'eddsa', typ: 'intelliflow-assertion+jwt' }],
    ['a wrong typ', { alg: 'EdDSA', typ: 'JWT' }],
    ['a missing typ', { alg: 'EdDSA' }],
    ['a kid', { alg: 'EdDSA', typ: 'intelliflow-assertion+jwt', kid: 'k1' }],
    ['an embedded jwk', { alg: 'EdDSA', typ: 'intelliflow-assertion+jwt', jwk: { kty: 'OKP' } }],
    ['an x5c chain', { alg: 'EdDSA', typ: 'intelliflow-assertion+jwt', x5c: ['AAAA'] }],
  ])('rejects %s', (_name, header) => {
    const token = signAssertion(claims(), keys.privateKey, { header });
    expect(failure(() => verify(token))).toBe('bad_header');
  });

  it('rejects an unsigned token (alg none, empty signature segment)', () => {
    const [h, p] = signAssertion(claims(), keys.privateKey, {
      header: { alg: 'none', typ: 'intelliflow-assertion+jwt' },
    }).split('.');
    expect(failure(() => verify(`${h}.${p}.`))).toBe('malformed');
  });

  it('rejects a header that is not JSON', () => {
    const token = signAssertion(claims(), keys.privateKey, { rawHeader: 'bm90LWpzb24' });
    expect(failure(() => verify(token))).toBe('bad_header');
  });
});

describe('step 3: the calling partner must have a registered key', () => {
  it.each([null, undefined, ''])('rejects when the stored key is %j', (stored) => {
    expect(failure(() => verify(signed(), { publicKeyPem: stored }))).toBe('no_public_key');
  });

  it('rejects a stored key that is not parseable or not Ed25519', () => {
    expect(failure(() => verify(signed(), { publicKeyPem: 'not a pem' }))).toBe('bad_public_key');
    expect(failure(() => verify(signed(), { publicKeyPem: newRsaPublicKeyPem() }))).toBe(
      'bad_public_key'
    );
  });
});

describe('step 4: the Ed25519 signature', () => {
  it('rejects a token signed by another key (a forged assertion)', () => {
    const attacker = newKeyPair();
    const forged = signAssertion(claimsFor({}, NOW), attacker.privateKey);
    expect(failure(() => verify(forged))).toBe('bad_signature');
  });

  it('rejects a payload altered after signing', () => {
    const token = signAssertion(claimsFor({}, NOW), keys.privateKey, {
      tamperPayload: claimsFor({ sub: 'victim@client.test', role: 'ADMIN' }, NOW),
    });
    expect(failure(() => verify(token, { email: 'victim@client.test' }))).toBe('bad_signature');
  });

  it('rejects a signature of the wrong length', () => {
    const token = signAssertion(claimsFor({}, NOW), keys.privateKey, {
      signature: Buffer.alloc(10, 1),
    });
    expect(failure(() => verify(token))).toBe('bad_signature');
  });

  it('rejects an all-zero 64-byte signature', () => {
    const token = signAssertion(claimsFor({}, NOW), keys.privateKey, {
      signature: Buffer.alloc(64),
    });
    expect(failure(() => verify(token))).toBe('bad_signature');
  });
});

describe('step 5: the payload is exactly the contract claims', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['an extra claim', { extra: 1 }],
    ['a wrong audience', { aud: 'someone-else' }],
    ['an unknown kind', { kind: 'admin' }],
    ['a role outside ADMIN/MEMBER', { role: 'OWNER' }],
    ['a non-lower-case sub', { sub: 'Alice@client.test' }],
    ['a sub that is not an email', { sub: 'alice' }],
    ['both tenant forms', { tenant: { externalRef: EXTERNAL_REF, tenantId: 't1' } }],
    ['no tenant form', { tenant: {} }],
    ['a non-uuid externalRef', { tenant: { externalRef: 'not-a-uuid' } }],
    ['a short jti', { jti: 'short' }],
    ['a jti with illegal characters', { jti: `${'a'.repeat(15)}!` }],
    ['a ttl over 60 s', { iat: NOW / 1000, exp: NOW / 1000 + 61 }],
    ['exp before iat', { iat: NOW / 1000, exp: NOW / 1000 - 1 }],
    ['a fractional timestamp', { iat: NOW / 1000 + 0.5 }],
  ];
  it.each(cases)('rejects %s', (_name, over) => {
    const token = signed(over);
    expect(failure(() => verify(token))).toBe('bad_claims');
  });

  it('rejects a payload that is not JSON, even when correctly signed', () => {
    const token = signAssertion(null, keys.privateKey, { rawPayload: 'bm90LWpzb24' });
    expect(failure(() => verify(token))).toBe('bad_claims');
  });
});

describe('step 6: the issuer is the calling partner', () => {
  it('a key for partner A cannot carry an assertion issued as partner B', () => {
    expect(failure(() => verify(signed({ iss: 'other-partner' })))).toBe('wrong_issuer');
  });
});

describe('step 7: the clock', () => {
  it('rejects an assertion issued more than 5 s in the future', () => {
    const iat = NOW / 1000 + 6;
    expect(failure(() => verify(signed({ iat, exp: iat + 30 })))).toBe('issued_in_future');
  });

  it('rejects an expired assertion', () => {
    const exp = NOW / 1000 - 6;
    expect(failure(() => verify(signed({ iat: exp - 30, exp })))).toBe('expired');
  });
});

describe('step 8: the subject is the requested email', () => {
  it('rejects a different person', () => {
    expect(failure(() => verify(signed(), { email: 'bob@client.test' }))).toBe('subject_mismatch');
  });
});

describe('PARTNER_REQUIRE_ASSERTION', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['0', false],
    ['false', false],
    ['1', true],
    ['true', true],
    ['yes', true],
    ['on', true],
    [' Enabled ', true],
    ['all', true],
    ['*', true],
    ['other, yes', true],
    ['leangency', true],
    ['other', false],
    ['other, Leangency', true],
    ['  ,  ', false],
  ])('%j -> %s for leangency', (value, expected) => {
    expect(isAssertionRequired('leangency', { PARTNER_REQUIRE_ASSERTION: value })).toBe(expected);
  });
});

describe('INHERITED_MEMBERSHIP_ENABLED', () => {
  it.each([
    [undefined, false],
    ['0', false],
    ['', false],
    ['yes', false],
    ['1', true],
    ['true', true],
    [' TRUE ', true],
  ])('%j -> %s', (value, expected) => {
    expect(isInheritedMembershipEnabled({ INHERITED_MEMBERSHIP_ENABLED: value })).toBe(expected);
  });
});

describe('contract: the API schemas equal the partner-sdk schemas', () => {
  const pairs: Array<[string, z.ZodType, z.ZodType]> = [
    ['assertion header', assertionHeaderSchema, sdk.assertionHeaderSchema],
    ['assertion tenant', assertionTenantSchema, sdk.assertionTenantSchema],
    ['assertion claims', assertionClaimsSchema, sdk.assertionClaimsSchema],
  ];
  for (const [name, mine, theirs] of pairs) {
    it(name, () => {
      const opts = { unrepresentable: 'any' as const };
      expect(z.toJSONSchema(mine, opts)).toEqual(z.toJSONSchema(theirs, opts));
    });
  }

  it('shares the constants', () => {
    expect(ASSERTION_MAX_BYTES).toBe(4096);
    expect(sdk.ASSERTION_ALG).toBe('EdDSA');
    expect(sdk.ASSERTION_TYP).toBe('intelliflow-assertion+jwt');
    expect(sdk.ASSERTION_AUDIENCE).toBe('intelliflow-crm');
    expect(sdk.ASSERTION_MAX_TTL_SECONDS).toBe(60);
    expect(sdk.ASSERTION_CLOCK_LEEWAY_SECONDS).toBe(5);
  });

  it('shares the membership error reasons', () => {
    expect([...MEMBERSHIP_ERROR_REASONS]).toEqual([...sdk.MEMBERSHIP_ERROR_REASONS]);
  });
});
