/**
 * PG-199 BYOK: the provider key check calls fixed hosts, sends the key in a header only,
 * never follows redirects and never puts the key in a returned message.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkProviderKey } from '../ai-provider-key-check';

const FAKE_KEY = 'a'.repeat(16) + 'b'.repeat(16) + 'wxyz';

function fetchReturning(status: number) {
  return vi
    .fn()
    .mockResolvedValue({ status, body: { cancel: vi.fn().mockResolvedValue(undefined) } });
}

describe('checkProviderKey', () => {
  it.each([
    ['anthropic', 'https://api.anthropic.com/', 'x-api-key'],
    ['openai', 'https://api.openai.com/', 'Authorization'],
    ['openrouter', 'https://openrouter.ai/api/v1/auth/key', 'Authorization'],
  ] as const)('%s: fixed host, key only in the %s header', async (provider, host, header) => {
    const fetchImpl = fetchReturning(200);
    await expect(checkProviderKey(provider, FAKE_KEY, fetchImpl)).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url).startsWith(host)).toBe(true);
    expect(String(url)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(init.headers)).toContain(FAKE_KEY);
    expect(Object.keys(init.headers)).toContain(header);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
  });

  it('401 means the key is invalid; 403 too, except on OpenAI where it is a restricted key', async () => {
    await expect(checkProviderKey('openai', FAKE_KEY, fetchReturning(401))).resolves.toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    for (const provider of ['anthropic', 'openrouter'] as const) {
      const result = await checkProviderKey(provider, FAKE_KEY, fetchReturning(403));
      expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    }
    const restricted = await checkProviderKey('openai', FAKE_KEY, fetchReturning(403));
    expect(restricted).toMatchObject({ ok: false, reason: 'unavailable' });
    expect((restricted as { message: string }).message).toMatch(/Models: Read/);
  });

  it('a 400 is not a verdict on the key', async () => {
    await expect(checkProviderKey('openai', FAKE_KEY, fetchReturning(400))).resolves.toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('429 and 5xx are unavailable, not invalid', async () => {
    for (const status of [429, 500, 503]) {
      const result = await checkProviderKey('anthropic', FAKE_KEY, fetchReturning(status));
      expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
    }
  });

  it('a network error or timeout is unavailable and the message never holds the key', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(`socket hang up ${FAKE_KEY}`));
    const result = await checkProviderKey('openai', FAKE_KEY, fetchImpl);
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
  });
});
