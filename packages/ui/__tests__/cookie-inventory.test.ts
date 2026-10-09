import { describe, it, expect } from 'vitest';
import cookieInventoryJson from '../src/components/cookie-consent/cookie-inventory.json';
import {
  COOKIE_INVENTORY,
  parseCookieInventory,
} from '../src/components/cookie-consent/cookie-consent';

/** The cookie list lives in cookie-inventory.json; this pins the load-time check. */
describe('cookie-inventory.json', () => {
  const valid = {
    name: 'session_token',
    category: 'necessary',
    duration: '24 hours',
    description: 'D',
    provider: 'Leangency',
  };

  it('loads every disclosed cookie', () => {
    expect(COOKIE_INVENTORY).toHaveLength((cookieInventoryJson as unknown[]).length);
    expect(parseCookieInventory([valid])).toHaveLength(1);
  });

  it.each([
    ['an unknown category', { ...valid, category: 'tracking' }],
    ['a missing provider', { ...valid, provider: undefined }],
    ['a non-object', 'session_token'],
    ['null', null],
  ])('rejects %s', (_label, entry) => {
    expect(() => parseCookieInventory([valid, entry])).toThrow(
      'cookie-inventory.json: entry 1 is not a CookieInfo'
    );
  });

  it('rejects data that is not a list', () => {
    expect(() => parseCookieInventory({})).toThrow('cookie-inventory.json: expected an array');
  });
});
