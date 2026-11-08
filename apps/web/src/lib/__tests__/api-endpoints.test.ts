/**
 * Where the tRPC client connects. Replaces copies in app/__tests__/providers.supplementary2,
 * whose production getWsUrl returned `wss://<host>/ws` while the real one returns
 * NEXT_PUBLIC_WS_URL or nothing (#1216).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBaseUrl, getWsUrl } from '../api-endpoints';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** As on the server: no window. */
const onServer = () => vi.stubGlobal('window', undefined);

describe('getWsUrl', () => {
  it('in production, uses NEXT_PUBLIC_WS_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_WS_URL', ' wss://ws.example.invalid ');
    expect(getWsUrl()).toBe('wss://ws.example.invalid');
  });

  it('in production, has no WebSocket when NEXT_PUBLIC_WS_URL is unset or blank', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '');
    expect(getWsUrl()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '   ');
    expect(getWsUrl()).toBeNull();
  });

  it('in development, connects to the local WS server on NEXT_PUBLIC_WS_PORT or 3001', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_WS_PORT', '');
    // happy-dom serves pages over http, so the protocol is ws:.
    expect(getWsUrl()).toMatch(/^ws:\/\/localhost:/);
    vi.stubEnv('NEXT_PUBLIC_WS_PORT', '4100');
    expect(getWsUrl()).toBe('ws://localhost:4100');
  });

  it('in development on an https page, uses wss', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_WS_PORT', '4100');
    vi.stubGlobal('location', { protocol: 'https:' });
    expect(getWsUrl()).toBe('wss://localhost:4100');
  });

  it('on the server, has no WebSocket', () => {
    onServer();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'wss://ws.example.invalid');
    expect(getWsUrl()).toBeNull();
  });
});

describe('getBaseUrl', () => {
  it('in the browser, uses NEXT_PUBLIC_API_URL or same-origin', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.invalid');
    expect(getBaseUrl()).toBe('https://api.example.invalid');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(getBaseUrl()).toBe('');
  });

  it('on the server, prefers the Vercel URL, then NEXT_PUBLIC_APP_URL', () => {
    onServer();
    vi.stubEnv('VERCEL_URL', 'preview.example.invalid');
    expect(getBaseUrl()).toBe('https://preview.example.invalid');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.invalid');
    expect(getBaseUrl()).toBe('https://app.example.invalid');
  });

  it('on the server outside production, falls back to localhost on PORT', () => {
    onServer();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('PORT', '4000');
    expect(getBaseUrl()).toBe('http://localhost:4000');
  });

  it('on the server in production, refuses to fall back to localhost', () => {
    onServer();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
