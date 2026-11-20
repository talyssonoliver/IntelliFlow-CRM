import { describe, expect, it, vi } from 'vitest';
import { generateUuid, isValidCuid, isValidEntityId, isValidUuid } from '../uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateUuid', () => {
  it('makes an RFC 4122 v4 UUID from the platform random source', () => {
    const id = generateUuid();

    expect(id).toMatch(V4);
    expect(isValidUuid(id)).toBe(true);
    expect(generateUuid()).not.toBe(id);
  });

  it('uses the global Web Crypto randomUUID when it exists', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('crypto', { randomUUID });

    expect(generateUuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('builds a v4 UUID from secure random bytes where randomUUID is missing', () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T): T => {
      (array as unknown as Uint8Array).fill(0xff);
      return array;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const id = generateUuid();

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    // All-ones bytes with the version and variant bits forced.
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(id).toMatch(V4);
  });

  it('refuses to make an id from a weak source when there is no secure one', () => {
    vi.stubGlobal('crypto', undefined);

    expect(() => generateUuid()).toThrow(/No secure random source/);
  });
});

describe('id validators', () => {
  it('accepts UUIDs and cuids, and nothing else', () => {
    expect(isValidUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidCuid('cmw5j72u40001p5ug01kf3vot')).toBe(true);
    expect(isValidCuid('xyz')).toBe(false);
    expect(isValidEntityId('cmw5j72u40001p5ug01kf3vot')).toBe(true);
    expect(isValidEntityId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isValidEntityId('')).toBe(false);
    expect(isValidUuid(undefined as unknown as string)).toBe(false);
    expect(isValidCuid(42 as unknown as string)).toBe(false);
  });
});
