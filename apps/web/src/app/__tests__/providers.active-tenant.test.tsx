/**
 * @vitest-environment happy-dom
 *
 * providers.tsx - active tenant (ADR-071)
 *
 * Every API call carries `x-active-tenant`: the batched HTTP link (with and without WebSocket),
 * and the WebSocket connection params. A stored selection the API rejects with NOT_A_MEMBER is
 * dropped and the app reloads into the home tenant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ACTIVE_TENANT_STORAGE_KEY, setActiveTenantId } from '@/lib/tenant/active-tenant';

interface LinkOptions {
  headers?: () => Record<string, string>;
}
interface WsOptions {
  connectionParams?: () => Record<string, string | undefined>;
}
interface CacheConfig {
  onError?: (error: unknown, query?: unknown) => void;
}

const h = vi.hoisted(() => ({
  httpBatchLink: vi.fn(),
  createWSClient: vi.fn(),
  caches: {
    query: undefined as CacheConfig | undefined,
    mutation: undefined as CacheConfig | undefined,
  },
}));

vi.mock('@tanstack/react-query', () => {
  class QueryCache {
    constructor(config: CacheConfig) {
      h.caches.query = config;
    }
  }
  class MutationCache {
    constructor(config: CacheConfig) {
      h.caches.mutation = config;
    }
  }
  class QueryClient {}
  return {
    QueryClient,
    QueryCache,
    MutationCache,
    QueryClientProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
  };
});
vi.mock('@trpc/client', () => ({
  httpBatchLink: (options: LinkOptions) => h.httpBatchLink(options),
  splitLink: vi.fn(() => ({ type: 'splitLink' })),
  createWSClient: (options: WsOptions) => h.createWSClient(options),
  wsLink: vi.fn(() => ({ type: 'wsLink' })),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    Provider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
    createClient: vi.fn(() => ({})),
  },
}));
vi.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
}));
vi.mock('@/providers/TimezoneProvider', () => ({
  TimezoneProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
}));
vi.mock('@/lib/cases/reminders-context', () => ({
  RemindersProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
}));

import { Providers } from '../providers';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';

function lastHttpHeaders(): Record<string, string> {
  const options = h.httpBatchLink.mock.calls.at(-1)?.[0] as LinkOptions;
  return options.headers?.() ?? {};
}

describe('Providers active tenant', () => {
  const reload = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'intelliflow_active_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    vi.stubEnv(FLAG, '1');
    h.httpBatchLink.mockReturnValue({ type: 'httpBatchLink' });
    h.createWSClient.mockReturnValue(null);
    h.caches.query = undefined;
    h.caches.mutation = undefined;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '', pathname: '/dashboard', protocol: 'http:', reload, assign: vi.fn() },
    });
  });

  describe('HTTP link', () => {
    it('sends x-active-tenant for the selected tenant', () => {
      setActiveTenantId('tenant_client_1');
      render(<Providers>x</Providers>);

      expect(lastHttpHeaders()['x-active-tenant']).toBe('tenant_client_1');
    });

    it('re-reads the selection on every request (a switch needs no new client)', () => {
      render(<Providers>x</Providers>);
      const options = h.httpBatchLink.mock.calls.at(-1)?.[0] as LinkOptions;

      expect(options.headers?.()['x-active-tenant']).toBeUndefined();
      setActiveTenantId('tenant_client_2');
      expect(options.headers?.()['x-active-tenant']).toBe('tenant_client_2');
    });

    it('sends no header in the home tenant', () => {
      render(<Providers>x</Providers>);
      expect(lastHttpHeaders()).not.toHaveProperty('x-active-tenant');
    });

    it('still sends the header while the web flag is off (API-on / web-off skew)', () => {
      setActiveTenantId('tenant_client_1');
      vi.stubEnv(FLAG, '0');
      render(<Providers>x</Providers>);

      expect(lastHttpHeaders()['x-active-tenant']).toBe('tenant_client_1');
    });

    it('also sets it on the HTTP link used beside the WebSocket link', () => {
      h.createWSClient.mockReturnValue({ close: vi.fn().mockResolvedValue(undefined) });
      setActiveTenantId('tenant_client_1');
      render(<Providers>x</Providers>);

      expect(lastHttpHeaders()['x-active-tenant']).toBe('tenant_client_1');
    });
  });

  describe('WebSocket', () => {
    it('passes the active tenant in the connection params', () => {
      h.createWSClient.mockReturnValue({ close: vi.fn().mockResolvedValue(undefined) });
      setActiveTenantId('tenant_client_1');
      render(<Providers>x</Providers>);

      const options = h.createWSClient.mock.calls.at(-1)?.[0] as WsOptions;
      expect(options.connectionParams?.()['x-active-tenant']).toBe('tenant_client_1');
    });
  });

  describe('stale selection', () => {
    const notAMember = { data: { code: 'FORBIDDEN', reason: 'NOT_A_MEMBER' } };

    it.each(['query', 'mutation'] as const)(
      'clears the selection and reloads on NOT_A_MEMBER from a %s',
      (kind) => {
        setActiveTenantId('tenant_revoked');
        render(<Providers>x</Providers>);

        h.caches[kind]?.onError?.(notAMember, { queryKey: ['deal', 'list'] });

        expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
        expect(reload).toHaveBeenCalledTimes(1);
      }
    );

    it('heals from a NOT_A_MEMBER on the auth status query too (no /login bounce loop)', () => {
      setActiveTenantId('tenant_revoked');
      render(<Providers>x</Providers>);

      h.caches.query?.onError?.(notAMember, { queryKey: [['auth', 'getStatus']] });

      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('forgets the selection when the session ends (UNAUTHORIZED), so a new sign-in starts at home', () => {
      setActiveTenantId('tenant_client_1');
      render(<Providers>x</Providers>);

      h.caches.query?.onError?.(
        { data: { code: 'UNAUTHORIZED' }, message: 'This staff session has expired.' },
        { queryKey: ['deal', 'list'] }
      );

      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('does not reload when no selection is stored (no reload loop)', () => {
      render(<Providers>x</Providers>);
      h.caches.query?.onError?.(notAMember, { queryKey: ['deal', 'list'] });

      expect(reload).not.toHaveBeenCalled();
    });

    it('leaves the selection alone for other errors', () => {
      setActiveTenantId('tenant_client_1');
      render(<Providers>x</Providers>);

      h.caches.query?.onError?.(
        { data: { code: 'FORBIDDEN', reason: 'HOME_ONLY' } },
        { queryKey: [] }
      );

      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client_1');
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
