import { describe, expect, it } from 'vitest';
import { e164FromChatId, e164FromWaId, isE164, normalizeE164 } from '../e164';

// Ofcom reserves 07700 900000-900999 for drama use; built from parts, never a real number.
const NATIONAL = '07700' + ' 900123';
const E164 = '+44' + '7700900123';

describe('normalizeE164', () => {
  it.each([
    ['+44 7700 900123', E164],
    ['+44-7700-900123', E164],
    ['0044 7700 900123', E164],
    [NATIONAL, E164],
    ['(07700) 900.123', E164],
    ['+44 (0) 7700 900123', E164],
    ['  +44 7700 900123  ', E164],
    ['0044 (0) 7700 900123', E164],
    ['+44 (0)20 7946 0123', '+442079460123'],
    ['+49 (0)30 12345678', '+493012345678'],
    ['+353 (0)1 2345678', '+35312345678'],
    // Italy keeps the zero, so the plain form stays +3902...
    ['+39 02 12345678', '+390212345678'],
  ])('reads %s', (input, expected) => {
    expect(normalizeE164(input)).toBe(expected);
  });

  it.each(['+44', '+49', '+33', '+31', '+61', '+64', '+41', '+43', '+32', '+353'])(
    'drops a bracketed trunk zero after %s',
    (code) => {
      expect(normalizeE164(`${code} (0) 12345678`)).toBe(`${code}12345678`);
    }
  );

  it.each([
    ['+39 (0)2 12345678'],
    ['+378 (0) 549 123456'],
    ['+379 (0) 6 698 12345'],
    ['+1 (0) 555 0123456'],
    ['+55 (0) 11 912345678'],
    ['+44 (0) 20 (0) 7946 0123'],
    ['+44 20 (0) 7946 0123'],
  ])('rejects the ambiguous bracketed zero in %s', (input) => {
    expect(normalizeE164(input)).toBeNull();
  });

  it('uses the given default country for national numbers', () => {
    expect(normalizeE164('0 1 55 5550123', { defaultCountryCallingCode: '55' })).toBe(
      '+55' + '1555550123'
    );
  });

  it.each([
    [''],
    ['abc'],
    ['07700 900123 ext 5'],
    ['7700900123'],
    ['447700900123'],
    ['+44 7700 900123 +1'],
    ['44+7700900123'],
    ['+0 7700 900123'],
    ['+39 (0) 2 12345678'],
    ['(0) 7700 900123'],
    ['+44 12'],
    ['+49 030 12345678'],
    ['+33 01 23456789'],
    ['+44 (7700 900123'],
    ['+44 7700) 900123'],
    ['+1234567890123456'],
    ['+44 07700 900123'],
    ['0044 07700 900123'],
    ['+44\t7700 900123'],
    ['0044'],
    ['0'],
  ])('rejects %j', (input) => {
    expect(normalizeE164(input)).toBeNull();
  });

  it('rejects a bad default country code', () => {
    expect(normalizeE164(NATIONAL, { defaultCountryCallingCode: '+44' })).toBeNull();
    expect(normalizeE164(NATIONAL, { defaultCountryCallingCode: '0' })).toBeNull();
  });
});

describe('non-string input', () => {
  it('gives null instead of throwing', () => {
    expect(normalizeE164(undefined as never)).toBeNull();
    expect(e164FromWaId(null as never)).toBeNull();
  });
});

describe('isE164', () => {
  it('accepts only the canonical form', () => {
    expect(isE164(E164)).toBe(true);
    expect(isE164('447700900123')).toBe(false);
    expect(isE164('+44 7700900123')).toBe(false);
    expect(isE164('+123456')).toBe(false);
    expect(isE164('+6835000')).toBe(true);
  });
});

describe('e164FromWaId', () => {
  it('adds the plus to a Meta wa_id', () => {
    expect(e164FromWaId('447700900123')).toBe(E164);
  });
  it('rejects non-numbers and a leading zero', () => {
    expect(e164FromWaId('0447700900123')).toBeNull();
    expect(e164FromWaId('abc')).toBeNull();
    expect(e164FromWaId('')).toBeNull();
  });
});

describe('e164FromChatId', () => {
  it('reads 1:1 chat ids', () => {
    expect(e164FromChatId('447700900123@c.us')).toBe(E164);
    expect(e164FromChatId('447700900123@s.whatsapp.net')).toBe(E164);
    expect(e164FromChatId('447700900123:12@s.whatsapp.net')).toBe(E164);
    expect(e164FromChatId(' 447700900123@C.US ')).toBe(E164);
  });
  it('gives null for groups, broadcast, status and linked ids', () => {
    expect(e164FromChatId('120363000000000000@g.us')).toBeNull();
    expect(e164FromChatId('status@broadcast')).toBeNull();
    expect(e164FromChatId('123456789012345@lid')).toBeNull();
    expect(e164FromChatId('447700900123')).toBeNull();
    expect(e164FromChatId('@c.us')).toBeNull();
  });
});
