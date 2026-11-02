import { describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '../mailbox-errors';
import { resolvePublicHost, type LookupFn } from '../public-host';

const lookupReturning = (...addresses: Array<[string, 4 | 6]>): LookupFn =>
  vi.fn(async () => addresses.map(([address, family]) => ({ address, family })));

describe('resolvePublicHost', () => {
  it('resolves once and returns the checked public address with the original name for SNI', async () => {
    const lookup = lookupReturning(['8.8.8.8', 4], ['2001:4860:4860::8888', 6]);
    await expect(
      resolvePublicHost('smtp.example.com', 587, { allowedPorts: [465, 587], lookup })
    ).resolves.toEqual({
      address: '8.8.8.8',
      family: 4,
      servername: 'smtp.example.com',
      port: 587,
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('smtp.example.com');
  });

  it('refuses a port outside the allow-list without resolving', async () => {
    const lookup = lookupReturning(['8.8.8.8', 4]);
    await expect(
      resolvePublicHost('smtp.example.com', 25, { allowedPorts: [465, 587], lookup })
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    ['loopback', ['127.0.0.1', 4]],
    ['cloud metadata', ['169.254.169.254', 4]],
    ['private IPv6', ['fd00::1', 6]],
    ['IPv4-mapped loopback', ['::ffff:7f00:1', 6]],
  ] as const)('refuses a host resolving to %s', async (_label, answer) => {
    await expect(
      resolvePublicHost('evil.example.com', 465, {
        allowedPorts: [465],
        lookup: lookupReturning([answer[0], answer[1]]),
      })
    ).rejects.toBeInstanceOf(MailboxTransportError);
  });

  it('refuses when ANY resolved address is private (no partial pinning)', async () => {
    await expect(
      resolvePublicHost('mixed.example.com', 465, {
        allowedPorts: [465],
        lookup: lookupReturning(['8.8.8.8', 4], ['10.0.0.1', 4]),
      })
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
  });

  it('refuses an empty answer and maps DNS errors to CONNECT_FAILED without echoing them', async () => {
    await expect(
      resolvePublicHost('none.example.com', 465, { allowedPorts: [465], lookup: lookupReturning() })
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    const failing: LookupFn = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND none.example.com');
    });
    const error = await resolvePublicHost('none.example.com', 465, {
      allowedPorts: [465],
      lookup: failing,
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'CONNECT_FAILED' });
    expect(String((error as Error).message)).not.toContain('getaddrinfo');
  });

  it('refuses an IP literal host outright', async () => {
    const lookup = lookupReturning(['8.8.8.8', 4]);
    await expect(
      resolvePublicHost('8.8.8.8', 465, { allowedPorts: [465], lookup })
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('MailboxTransportError', () => {
  it('carries only a code and a fixed message', () => {
    const error = new MailboxTransportError('AUTH_FAILED');
    expect(error.code).toBe('AUTH_FAILED');
    expect(error.message).toBe('Mailbox transport failed: AUTH_FAILED');
    expect(error.name).toBe('MailboxTransportError');
  });
});
