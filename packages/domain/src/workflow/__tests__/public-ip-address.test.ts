/**
 * PG-207 (CA-4): table-driven SSRF predicate. Tenant-supplied SMTP/IMAP hosts
 * resolve to addresses checked here before any connection, so every reserved
 * range and every way of writing an address must be refused.
 */
import { describe, expect, it } from 'vitest';
import { isPublicIpAddress } from '../node-catalog';

describe('isPublicIpAddress — IPv4 reserved ranges', () => {
  it.each([
    ['0.0.0.0/8', '0.1.2.3'],
    ['10.0.0.0/8', '10.20.30.40'],
    ['100.64.0.0/10 low', '100.64.0.1'],
    ['100.64.0.0/10 high', '100.127.255.254'],
    ['127.0.0.0/8', '127.8.9.10'],
    ['169.254.0.0/16 (cloud metadata)', '169.254.169.254'],
    ['172.16.0.0/12 low', '172.16.0.1'],
    ['172.16.0.0/12 high', '172.31.255.254'],
    ['192.0.0.0/24', '192.0.0.8'],
    ['192.0.2.0/24 (TEST-NET-1)', '192.0.2.10'],
    ['192.168.0.0/16', '192.168.1.1'],
    ['198.18.0.0/15 low', '198.18.0.1'],
    ['198.18.0.0/15 high', '198.19.255.254'],
    ['198.51.100.0/24 (TEST-NET-2)', '198.51.100.7'],
    ['203.0.113.0/24 (TEST-NET-3)', '203.0.113.9'],
    ['224.0.0.0/4 multicast', '239.1.2.3'],
    ['240.0.0.0/4 reserved', '240.0.0.1'],
    ['broadcast', '255.255.255.255'],
  ])('refuses %s (%s)', (_label, address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '100.128.0.1', '172.32.0.1', '198.20.0.1', '192.0.3.1'])(
    'accepts public %s',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    }
  );

  it.each(['256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '0x7f.0.0.1', '2130706433', ''])(
    'refuses malformed or non-canonical %j',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  );
});

describe('isPublicIpAddress — IPv6 reserved ranges and forms', () => {
  it.each([
    ['unspecified', '::'],
    ['loopback', '::1'],
    ['expanded loopback', '0:0:0:0:0:0:0:1'],
    ['bracketed loopback', '[::1]'],
    ['IPv4-mapped dotted', '::ffff:127.0.0.1'],
    ['IPv4-mapped hex', '::ffff:7f00:1'],
    ['IPv4-mapped expanded', '0:0:0:0:0:ffff:a00:1'],
    ['IPv4-compatible', '::127.0.0.1'],
    ['NAT64 to loopback', '64:ff9b::7f00:1'],
    ['NAT64 dotted to metadata', '64:ff9b::169.254.169.254'],
    ['6to4 to loopback', '2002:7f00:1::'],
    ['Teredo', '2001:0:4136:e378::1'],
    ['documentation', '2001:db8::1'],
    ['unique local fc', 'fc00::1'],
    ['unique local fd', 'fd12:3456:789a::1'],
    ['link local', 'fe80::1'],
    ['link local with zone', 'fe80::1%eth0'],
    ['site local', 'fec0::1'],
    ['multicast', 'ff02::1'],
    ['discard-only', '100::1'],
  ])('refuses %s (%s)', (_label, address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each([
    '2001:4860:4860::8888',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:808:808::1',
  ])('accepts public %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([':::', '1::2::3', 'gggg::1', '1:2:3:4:5:6:7:8:9', 'example.com', '12345::1'])(
    'refuses malformed %j',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  );
});
