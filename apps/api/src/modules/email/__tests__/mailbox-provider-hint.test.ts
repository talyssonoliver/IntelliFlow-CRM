/**
 * MVP-001: the provider an address's mail runs on, read from its MX records.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __resetProviderHintCache,
  providerFromMx,
  providerHintFor,
} from '../mailbox-provider-hint';

const mx = (...hosts: string[]) =>
  hosts.map((exchange, i) => ({ exchange, priority: (i + 1) * 10 }));

beforeEach(() => __resetProviderHintCache());

describe('providerFromMx', () => {
  it.each([
    [['aspmx.l.google.com', 'alt1.aspmx.l.google.com'], 'GOOGLE'],
    [['smtp.google.com.'], 'GOOGLE'],
    [['business-example.mail.protection.outlook.com'], 'MICROSOFT'],
    [['mx.zoho.com', 'mx2.zoho.com', 'mx3.zoho.com'], 'ZOHO'],
    [['mx.zoho.eu'], 'ZOHO'],
    [['mx.zohocloud.ca'], 'ZOHO'],
    [['mail.business.example.invalid'], 'OTHER'],
    [[], 'UNKNOWN'],
  ])('maps %j to %s', (hosts, expected) => {
    expect(providerFromMx(hosts)).toBe(expected);
  });

  it('is not fooled by a lookalike host', () => {
    expect(providerFromMx(['google.com.attacker.example.invalid'])).toBe('OTHER');
    expect(providerFromMx(['mx.zoho.com.attacker.example.invalid'])).toBe('OTHER');
  });
});

describe('providerHintFor', () => {
  it('reads the domain MX, best priority first, and caches it', async () => {
    const resolveMx = vi.fn(async () => mx('mx.zoho.com', 'mx2.zoho.com'));
    const first = await providerHintFor('Owner@Business.example.invalid', resolveMx);
    const second = await providerHintFor('sales@business.example.invalid', resolveMx);

    expect(first).toEqual({
      domain: 'business.example.invalid',
      provider: 'ZOHO',
      personal: false,
    });
    expect(second.provider).toBe('ZOHO');
    expect(resolveMx).toHaveBeenCalledTimes(1);
    expect(resolveMx).toHaveBeenCalledWith('business.example.invalid');
  });

  it('knows personal addresses without a lookup', async () => {
    const resolveMx = vi.fn();
    await expect(providerHintFor('someone@gmail.com', resolveMx)).resolves.toEqual({
      domain: 'gmail.com',
      provider: 'GOOGLE',
      personal: true,
    });
    await expect(providerHintFor('someone@hotmail.co.uk', resolveMx)).resolves.toMatchObject({
      provider: 'MICROSOFT',
      personal: true,
    });
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it('answers UNKNOWN when the lookup fails, never an error', async () => {
    const resolveMx = vi.fn(async () => {
      throw Object.assign(new Error('queryMx ENOTFOUND'), { code: 'ENOTFOUND' });
    });
    await expect(providerHintFor('a@nowhere.example.invalid', resolveMx)).resolves.toMatchObject({
      provider: 'UNKNOWN',
      personal: false,
    });
  });

  it('gives up on a lookup that never answers', async () => {
    vi.useFakeTimers();
    try {
      const hint = providerHintFor('a@slow.example.invalid', () => new Promise(() => undefined));
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(hint).resolves.toMatchObject({ provider: 'UNKNOWN' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('looks a domain up again once the cache entry is old', async () => {
    let now = 0;
    const resolveMx = vi.fn(async () => mx('aspmx.l.google.com'));
    await providerHintFor('a@cached.example.invalid', resolveMx, () => now);
    now = 11 * 60_000;
    await providerHintFor('a@cached.example.invalid', resolveMx, () => now);
    expect(resolveMx).toHaveBeenCalledTimes(2);
  });
});
