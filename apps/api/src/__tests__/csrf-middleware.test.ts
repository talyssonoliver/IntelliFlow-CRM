import { describe, it, expect } from 'vitest';
import { assertMutationCsrfSafe } from '../trpc';

/** Build a minimal Fetch-Request-like object with case-insensitive headers. */
function reqWith(headers: Record<string, string>) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: {
      get: (n: string) => map.get(n.toLowerCase()) ?? null,
      has: (n: string) => map.has(n.toLowerCase()),
    },
  };
}

const PROD_WEB = 'https://intelli-flow-crm-web.vercel.app';
const PROD_API_HOST = 'api-production-e9c1.up.railway.app';

describe('assertMutationCsrfSafe (CSRF + cross-origin web→API)', () => {
  // The PERF-08/09 regression: web (Vercel) and API (Railway) are DIFFERENT
  // hosts, and localhost is exempt — so this exact case could not surface in
  // local testing. A cross-host mutation carrying the Authorization header (the
  // CORS-preflighted Bearer client) MUST be allowed.
  it('allows a cross-host prod mutation that carries Authorization', () => {
    expect(() =>
      assertMutationCsrfSafe(
        reqWith({ origin: PROD_WEB, host: PROD_API_HOST, authorization: 'Bearer abc.def.ghi' })
      )
    ).not.toThrow();
  });

  it('allows a cross-host mutation that carries x-csrf-token', () => {
    expect(() =>
      assertMutationCsrfSafe(
        reqWith({ origin: PROD_WEB, host: PROD_API_HOST, 'x-csrf-token': 'tok' })
      )
    ).not.toThrow();
  });

  it('REJECTS a cross-host mutation with no custom anti-CSRF header', () => {
    expect(() =>
      assertMutationCsrfSafe(reqWith({ origin: 'https://evil.example.com', host: PROD_API_HOST }))
    ).toThrow(/Origin does not match Host/);
  });

  it('allows a same-host mutation', () => {
    expect(() =>
      assertMutationCsrfSafe(reqWith({ origin: `https://${PROD_API_HOST}`, host: PROD_API_HOST }))
    ).not.toThrow();
  });

  it('allows the local web:3000 → api:4000 cross-host case (localhost exempt)', () => {
    expect(() =>
      assertMutationCsrfSafe(reqWith({ origin: 'http://localhost:3000', host: 'localhost:4000' }))
    ).not.toThrow();
  });

  it('allows a server-to-server mutation with no Origin but an Authorization header (SSR)', () => {
    expect(() =>
      assertMutationCsrfSafe(reqWith({ host: PROD_API_HOST, authorization: 'Bearer abc.def.ghi' }))
    ).not.toThrow();
  });

  it('REJECTS a mutation with no Origin and no custom header', () => {
    expect(() => assertMutationCsrfSafe(reqWith({ host: PROD_API_HOST }))).toThrow(
      /Missing Origin or custom anti-CSRF headers/
    );
  });

  it('REJECTS a malformed Origin', () => {
    expect(() =>
      assertMutationCsrfSafe(reqWith({ origin: 'not-a-url', host: PROD_API_HOST }))
    ).toThrow(/Malformed Origin header/);
  });
});
