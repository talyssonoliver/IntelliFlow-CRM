import { describe, it, expect } from 'vitest';
import { pickTrustedForwardedIp } from '../client-ip';

describe('pickTrustedForwardedIp', () => {
  it('returns undefined for missing/empty values', () => {
    expect(pickTrustedForwardedIp(undefined)).toBeUndefined();
    expect(pickTrustedForwardedIp(null)).toBeUndefined();
    expect(pickTrustedForwardedIp('')).toBeUndefined();
    expect(pickTrustedForwardedIp('   ')).toBeUndefined();
    expect(pickTrustedForwardedIp(',,')).toBeUndefined();
  });

  it('returns the only hop when there is a single entry', () => {
    expect(pickTrustedForwardedIp('203.0.113.7')).toBe('203.0.113.7');
    expect(pickTrustedForwardedIp('  203.0.113.7  ')).toBe('203.0.113.7');
  });

  it('returns the rightmost (trusted, edge-set) hop, not the spoofable leftmost', () => {
    // An attacker prepends an arbitrary IP; the edge appends the real client IP.
    expect(pickTrustedForwardedIp('1.1.1.1, 203.0.113.7')).toBe('203.0.113.7');
    expect(pickTrustedForwardedIp('client, proxy1, proxy2, 198.51.100.42')).toBe('198.51.100.42');
  });

  it('trims whitespace and ignores empty trailing segments', () => {
    expect(pickTrustedForwardedIp('1.1.1.1,   203.0.113.7  ')).toBe('203.0.113.7');
    expect(pickTrustedForwardedIp('1.1.1.1, 203.0.113.7, ,')).toBe('203.0.113.7');
  });
});
