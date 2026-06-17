/**
 * @vitest-environment node
 *
 * Tests for trpc-server.ts
 *
 * Verifies that:
 * getAccessToken:
 * - Returns the cookie value when the token is usable
 * - Returns null when isTokenUsable returns false
 * - Returns null when the cookie is absent
 *
 * createCallerFromToken:
 * - Calls createTRPCClient with the correct url derived from NEXT_PUBLIC_API_URL
 * - Passes a headers function returning { Authorization: 'Bearer <token>' } when token provided
 * - Passes headers: undefined when token is null
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Stub next/headers ─────────────────────────────────────────────────────────
const mockCookiesGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockCookiesGet })),
}));

// ── Stub @intelliflow/api-client ──────────────────────────────────────────────
const mockCreateTRPCClient = vi.fn();
vi.mock('@intelliflow/api-client', () => ({
  createTRPCClient: (...args: unknown[]) => mockCreateTRPCClient(...args),
}));

// ── Stub @/lib/auth/jwt ───────────────────────────────────────────────────────
const mockIsTokenUsable = vi.fn();
vi.mock('@/lib/auth/jwt', () => ({
  isTokenUsable: (...args: unknown[]) => mockIsTokenUsable(...args),
}));

import { getAccessToken, createCallerFromToken } from '../trpc-server';

const ORIG_API_URL = process.env['NEXT_PUBLIC_API_URL'];

afterEach(() => {
  vi.clearAllMocks();
  // restore env
  if (ORIG_API_URL === undefined) {
    delete process.env['NEXT_PUBLIC_API_URL'];
  } else {
    process.env['NEXT_PUBLIC_API_URL'] = ORIG_API_URL;
  }
});

// ── getAccessToken ────────────────────────────────────────────────────────────

describe('getAccessToken', () => {
  it('returns the cookie value when isTokenUsable returns true', async () => {
    mockCookiesGet.mockReturnValue({ value: 'tok' });
    mockIsTokenUsable.mockReturnValue(true);

    const result = await getAccessToken();

    expect(result).toBe('tok');
  });

  it('returns null when isTokenUsable returns false', async () => {
    mockCookiesGet.mockReturnValue({ value: 'expired-tok' });
    mockIsTokenUsable.mockReturnValue(false);

    const result = await getAccessToken();

    expect(result).toBeNull();
  });

  it('returns null when the accessToken cookie is absent', async () => {
    // cookieStore.get() returns undefined → optional-chain ?. value is undefined → ?? null
    mockCookiesGet.mockReturnValue(undefined);
    mockIsTokenUsable.mockReturnValue(false);

    const result = await getAccessToken();

    expect(result).toBeNull();
  });
});

// ── createCallerFromToken ─────────────────────────────────────────────────────

describe('createCallerFromToken', () => {
  const SENTINEL = Symbol('tRPCClientSentinel');

  it('calls createTRPCClient with the correct url when NEXT_PUBLIC_API_URL is set', async () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.example.com';
    mockCreateTRPCClient.mockReturnValue(SENTINEL);

    await createCallerFromToken('my-token');

    expect(mockCreateTRPCClient).toHaveBeenCalledOnce();
    const [arg] = mockCreateTRPCClient.mock.calls[0];
    expect(arg.url).toBe('https://api.example.com/api/trpc');
  });

  it('uses an empty string for the base url when NEXT_PUBLIC_API_URL is not set', async () => {
    delete process.env['NEXT_PUBLIC_API_URL'];
    mockCreateTRPCClient.mockReturnValue(SENTINEL);

    await createCallerFromToken('my-token');

    const [arg] = mockCreateTRPCClient.mock.calls[0];
    expect(arg.url).toBe('/api/trpc');
  });

  it('passes a headers function that returns Authorization Bearer when token is provided', async () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.example.com';
    mockCreateTRPCClient.mockReturnValue(SENTINEL);

    await createCallerFromToken('my-jwt-token');

    const [arg] = mockCreateTRPCClient.mock.calls[0];
    expect(typeof arg.headers).toBe('function');
    expect(arg.headers()).toEqual({ Authorization: 'Bearer my-jwt-token' });
  });

  it('passes headers: undefined when token is null', async () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.example.com';
    mockCreateTRPCClient.mockReturnValue(SENTINEL);

    await createCallerFromToken(null);

    const [arg] = mockCreateTRPCClient.mock.calls[0];
    expect(arg.headers).toBeUndefined();
  });

  it('returns the value produced by createTRPCClient', async () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.example.com';
    mockCreateTRPCClient.mockReturnValue(SENTINEL);

    const result = await createCallerFromToken('tok');

    expect(result).toBe(SENTINEL);
  });
});
