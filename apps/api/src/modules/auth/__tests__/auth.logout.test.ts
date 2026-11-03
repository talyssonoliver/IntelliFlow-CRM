/**
 * Logout revokes the caller's Supabase sessions (#1154).
 *
 * The real router and the real supabase-js client with fetch faked, so nothing
 * leaves the machine and the test sees what would really be sent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authRouter } from '../auth.router';
import { resetSessionService } from '../../../services/session.service';
import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';

const audit = vi.hoisted(() => ({ log: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../../security/audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../security/audit-logger')>()),
  getAuditLogger: () => audit,
}));

const CALLER_JWT = ['header', 'payload', 'signature'].join('.');

const fakeFetch = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>();

const requestWith = (authorization?: string) =>
  new Request('https://api.example.invalid/api/trpc/auth.logout', {
    method: 'POST',
    headers: { 'x-csrf-token': 'test', ...(authorization ? { authorization } : {}) },
  });

const logoutAs = (req: Request) => authRouter.createCaller(createTestContext({ req })).logout();

const bearerSent = () => new Headers(fakeFetch.mock.calls[0]?.[1]?.headers).get('authorization');

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSessionService();
  audit.log.mockClear();
  fakeFetch.mockReset();
  fakeFetch.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fakeFetch);
  prismaMock.session.findMany.mockResolvedValue([]);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

describe('auth.logout', () => {
  it('sends the caller JWT as the bearer on a global sign-out', async () => {
    const result = await logoutAs(requestWith(`Bearer ${CALLER_JWT}`));

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const url = new URL(String(fakeFetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/auth/v1/logout');
    expect(url.searchParams.get('scope')).toBe('global');
    expect(bearerSent()).toBe(`Bearer ${CALLER_JWT}`);
    expect(bearerSent()).not.toContain(TEST_UUIDS.user1);

    expect(result).toEqual({ success: true, providerSignOut: 'REVOKED', sessionsRevoked: 0 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'UserLogout', actionResult: 'SUCCESS' })
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says so, logs and audits when Supabase refuses, and still ends app sessions', async () => {
    fakeFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'refused' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await logoutAs(requestWith(`Bearer ${CALLER_JWT}`));

    expect(result).toEqual({ success: false, providerSignOut: 'FAILED', sessionsRevoked: 0 });
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(CALLER_JWT);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'UserLogout',
        actionResult: 'PARTIAL',
        actionReason: 'FAILED',
      })
    );
  });

  it('counts a session that is already gone as revoked', async () => {
    fakeFetch.mockResolvedValue(
      new Response(JSON.stringify({ error_code: 'session_not_found', msg: 'gone' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await logoutAs(requestWith(`Bearer ${CALLER_JWT}`));

    expect(result).toEqual({ success: true, providerSignOut: 'REVOKED', sessionsRevoked: 0 });
    expect(consoleError).not.toHaveBeenCalled();
  });

  // A refused key answers 401 or 403 too, so those alone must not read as revoked.
  it.each([401, 403])('does not count a plain %i as revoked', async (status) => {
    fakeFetch.mockResolvedValue(
      new Response(JSON.stringify({ msg: 'refused' }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await logoutAs(requestWith(`Bearer ${CALLER_JWT}`));

    expect(result).toMatchObject({ success: false, providerSignOut: 'FAILED' });
  });

  it('says so when the network call itself fails', async () => {
    fakeFetch.mockRejectedValue(new TypeError('fetch failed'));

    const result = await logoutAs(requestWith(`Bearer ${CALLER_JWT}`));

    expect(result).toMatchObject({ success: false, providerSignOut: 'FAILED' });
  });

  it.each([
    ['no header', undefined],
    ['a header that is not a bearer', `Basic ${CALLER_JWT}`],
  ])('with %s it calls nothing and says no token was available', async (_name, header) => {
    const result = await logoutAs(requestWith(header));

    expect(fakeFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, providerSignOut: 'NO_TOKEN', sessionsRevoked: 0 });
    expect(consoleError).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actionResult: 'PARTIAL', actionReason: 'NO_TOKEN' })
    );
  });
});
