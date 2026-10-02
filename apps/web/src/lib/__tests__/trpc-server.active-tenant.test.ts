/**
 * @vitest-environment node
 *
 * SSR side of the active-tenant selection (ADR-071).
 *
 * `getAccessToken` folds the selected tenant (cookie) into the token string so it becomes part
 * of every `'use cache'` key, and `createCallerFromToken` unfolds it into `x-active-tenant`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  createTRPCClient: vi.fn(),
  isTokenUsable: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: (name: string) => {
        const value = h.cookies.get(name);
        return value === undefined ? undefined : { value };
      },
    })
  ),
}));
vi.mock('@intelliflow/api-client', () => ({
  createTRPCClient: (...args: unknown[]) => h.createTRPCClient(...args),
}));
vi.mock('@/lib/auth/jwt', () => ({
  isTokenUsable: (...args: unknown[]) => h.isTokenUsable(...args),
}));

import { getAccessToken, createCallerFromToken } from '../trpc-server';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';
const JWT = 'aaa.bbb.ccc';

function headersOfLastClient(): Record<string, string> | undefined {
  const config = h.createTRPCClient.mock.calls.at(-1)?.[0] as {
    headers?: () => Record<string, string>;
  };
  return config.headers?.();
}

describe('SSR active tenant', () => {
  beforeEach(() => {
    h.cookies.clear();
    h.isTokenUsable.mockReturnValue(true);
    h.createTRPCClient.mockReturnValue({});
    vi.stubEnv(FLAG, '1');
    h.cookies.set('accessToken', JWT);
  });

  describe('getAccessToken', () => {
    it('returns the bare token when no tenant is selected', async () => {
      expect(await getAccessToken()).toBe(JWT);
    });

    it('appends the selected tenant so it is part of every cache key', async () => {
      h.cookies.set('intelliflow_active_tenant', 'tenant_client_1');
      expect(await getAccessToken()).toBe(`${JWT}#tenant=tenant_client_1`);
    });

    it('gives two tenants for the same token two different cache keys', async () => {
      h.cookies.set('intelliflow_active_tenant', 'tenant_a');
      const a = await getAccessToken();
      h.cookies.set('intelliflow_active_tenant', 'tenant_b');
      const b = await getAccessToken();

      expect(a).not.toBe(b);
    });

    it('does not gate the selection on the web flag (the API validates it by data)', async () => {
      vi.stubEnv(FLAG, '0');
      h.cookies.set('intelliflow_active_tenant', 'tenant_client_1');
      expect(await getAccessToken()).toBe(`${JWT}#tenant=tenant_client_1`);
    });

    it('ignores a tampered cookie value', async () => {
      h.cookies.set('intelliflow_active_tenant', 'x\r\nx-evil: 1');
      expect(await getAccessToken()).toBe(JWT);
    });

    it('is still null without a usable token, whatever the selection', async () => {
      h.isTokenUsable.mockReturnValue(false);
      h.cookies.set('intelliflow_active_tenant', 'tenant_client_1');
      expect(await getAccessToken()).toBeNull();
    });
  });

  describe('createCallerFromToken', () => {
    it('forwards x-active-tenant and a clean bearer token for a scoped token', async () => {
      await createCallerFromToken(`${JWT}#tenant=tenant_client_1`);

      expect(headersOfLastClient()).toEqual({
        Authorization: `Bearer ${JWT}`,
        'x-active-tenant': 'tenant_client_1',
      });
    });

    it('sends only Authorization for a plain token (home tenant)', async () => {
      await createCallerFromToken(JWT);
      expect(headersOfLastClient()).toEqual({ Authorization: `Bearer ${JWT}` });
    });

    it('drops an invalid scope instead of forwarding it', async () => {
      await createCallerFromToken(`${JWT}#tenant=bad value`);
      expect(headersOfLastClient()).toEqual({ Authorization: `Bearer ${JWT}` });
    });

    it('sends no headers without a token', async () => {
      await createCallerFromToken(null);
      expect(headersOfLastClient()).toBeUndefined();
    });
  });
});
