/**
 * updateUserPassword sends the caller's own token to GoTrue's `PUT /auth/v1/user`.
 *
 * The previous helper called `auth.updateUser()` on a client that only had a global
 * Authorization header. supabase-js reads the session from its own storage there, finds none,
 * and returns AuthSessionMissingError without sending anything, so a password reset could never
 * complete. These tests fake `fetch` and check the request that actually goes out: they fail on
 * that helper, because no request is made at all.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateUserPassword } from '../supabase';

const TOKEN = ['header', 'payload', 'signature'].join('.');
/** Generated per run: never a fixed value in the source. */
const NEW_PASSWORD = randomUUID();

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('updateUserPassword', () => {
  it('sends PUT /auth/v1/user with the caller token and the new password', async () => {
    const fetchMock = stubFetch(200, { id: 'user-1' });

    await expect(updateUserPassword(TOKEN, NEW_PASSWORD)).resolves.toEqual({ error: null });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/auth\/v1\/user$/);
    expect(init.method).toBe('PUT');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('apikey')).toBeTruthy();
    expect(JSON.parse(String(init.body))).toEqual({ password: NEW_PASSWORD });
  });

  it("returns GoTrue's message when the update is refused", async () => {
    stubFetch(422, { msg: 'Password should be at least 6 characters.' });

    const { error } = await updateUserPassword(TOKEN, 'x');

    expect(error?.message).toBe('Password should be at least 6 characters.');
  });

  it('falls back to the status when the refusal has no message', async () => {
    stubFetch(401, {});

    const { error } = await updateUserPassword(TOKEN, NEW_PASSWORD);

    expect(error?.message).toBe('Password update failed (401)');
  });

  it('returns a network failure as an error instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    await expect(updateUserPassword(TOKEN, NEW_PASSWORD)).resolves.toMatchObject({
      error: expect.objectContaining({ message: 'fetch failed' }),
    });
  });
});
