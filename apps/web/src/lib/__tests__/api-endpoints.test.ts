/**
 * Where the tRPC client connects. Replaces copies in app/__tests__/providers.supplementary2,
 * whose production getWsUrl returned `wss://<host>/ws` while the real one returns
 * NEXT_PUBLIC_WS_URL or nothing (#1216).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBaseUrl, getWsUrl } from '../api-endpoints';

afterEach(() => vi.unstubAllEnvs());

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
});

describe('getBaseUrl', () => {
  it('in the browser, uses NEXT_PUBLIC_API_URL or same-origin', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.invalid');
    expect(getBaseUrl()).toBe('https://api.example.invalid');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(getBaseUrl()).toBe('');
  });
});
