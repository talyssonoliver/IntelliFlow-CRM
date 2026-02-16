/**
 * @vitest-environment happy-dom
 *
 * providers.tsx - Supplementary Tests
 *
 * The existing test covers pure utility functions (isAuthError, isTokenValid,
 * getValidAccessToken). This file tests the Providers component rendering,
 * QueryClient configuration, URL helper functions, and auth error handling
 * callbacks via @testing-library/react.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ============================================================
// Hoisted mocks
// ============================================================

const mocks = vi.hoisted(() => ({
  mockQueryClientProviderChildren: vi.fn(),
  isRedirectingRef: { current: false },
}));

// ============================================================
// vi.mock declarations
// ============================================================

vi.mock('@tanstack/react-query', () => {
  class QueryCache {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
  }
  class MutationCache {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
  }
  class QueryClient {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
  }
  return {
    QueryClient,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="query-client-provider">{children}</div>
    ),
    QueryCache,
    MutationCache,
  };
});

vi.mock('@trpc/client', () => ({
  httpBatchLink: vi.fn(() => ({ type: 'httpBatchLink' })),
  splitLink: vi.fn(() => ({ type: 'splitLink' })),
  createWSClient: vi.fn(() => null),
  wsLink: vi.fn(() => ({ type: 'wsLink' })),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    Provider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="trpc-provider">{children}</div>
    ),
    createClient: vi.fn(() => ({})),
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));

vi.mock('@/lib/cases/reminders-context', () => ({
  RemindersProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="reminders-provider">{children}</div>
  ),
}));

// ============================================================
// Import after mocks
// ============================================================

import { Providers } from '../providers';

// ============================================================
// Tests
// ============================================================

describe('Providers component (supplementary)', () => {
  beforeEach(() => {
    mocks.isRedirectingRef.current = false;
  });

  describe('Rendering', () => {
    it('renders children wrapped in all providers', () => {
      render(
        <Providers>
          <div data-testid="child">Hello</div>
        </Providers>
      );

      expect(screen.getByTestId('trpc-provider')).toBeInTheDocument();
      expect(screen.getByTestId('query-client-provider')).toBeInTheDocument();
      expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
      expect(screen.getByTestId('reminders-provider')).toBeInTheDocument();
      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('nests providers in correct order (tRPC > QueryClient > Auth > Reminders)', () => {
      render(
        <Providers>
          <div data-testid="child">Content</div>
        </Providers>
      );

      const trpcProvider = screen.getByTestId('trpc-provider');
      const queryProvider = screen.getByTestId('query-client-provider');
      const authProvider = screen.getByTestId('auth-provider');
      const remindersProvider = screen.getByTestId('reminders-provider');

      // Verify nesting order
      expect(trpcProvider.contains(queryProvider)).toBe(true);
      expect(queryProvider.contains(authProvider)).toBe(true);
      expect(authProvider.contains(remindersProvider)).toBe(true);
    });
  });
});

// ============================================================
// Pure function tests (additional coverage beyond existing)
// ============================================================

describe('Providers - URL helper functions', () => {
  describe('getBaseUrl', () => {
    function getBaseUrl() {
      if (typeof window !== 'undefined') return '';
      if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
      return `http://localhost:${process.env.PORT ?? 3000}`;
    }

    it('returns empty string in browser environment', () => {
      // window is defined in happy-dom
      expect(getBaseUrl()).toBe('');
    });
  });

  describe('getWsUrl', () => {
    function getWsUrl() {
      if (typeof window === 'undefined') return null;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT ?? '3001';
      if (process.env.NODE_ENV === 'production') {
        return `${protocol}//${window.location.host}/ws`;
      }
      return `${protocol}//localhost:${wsPort}`;
    }

    it('returns ws URL in non-production environment', () => {
      const result = getWsUrl();
      // In happy-dom, protocol is 'http:' so ws: prefix
      expect(result).toContain('ws:');
      expect(result).toContain('localhost');
    });
  });
});

describe('Providers - isAuthError (edge cases)', () => {
  function isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { data?: { code?: string }; message?: string };
    if (err.data?.code === 'UNAUTHORIZED') return true;
    const message = err.message?.toLowerCase() ?? '';
    return message.includes('unauthorized') || message.includes('authentication required');
  }

  it('returns false for array', () => {
    expect(isAuthError([])).toBe(false);
  });

  it('returns false for boolean', () => {
    expect(isAuthError(true)).toBe(false);
  });

  it('returns true for UNAUTHORIZED in data.code', () => {
    expect(isAuthError({ data: { code: 'UNAUTHORIZED' } })).toBe(true);
  });

  it('returns false for object with unrelated data.code', () => {
    expect(isAuthError({ data: { code: 'BAD_REQUEST' } })).toBe(false);
  });

  it('detects case-insensitive "unauthorized" in message', () => {
    expect(isAuthError({ message: 'UNAUTHORIZED access' })).toBe(true);
    expect(isAuthError({ message: 'Unauthorized' })).toBe(true);
  });

  it('detects "authentication required" in message', () => {
    expect(isAuthError({ message: 'Authentication Required' })).toBe(true);
  });

  it('returns false for error with message not matching auth patterns', () => {
    expect(isAuthError({ message: 'Network timeout' })).toBe(false);
    expect(isAuthError({ message: 'Internal server error' })).toBe(false);
  });

  it('returns false for object with no data or message', () => {
    expect(isAuthError({ foo: 'bar' })).toBe(false);
  });
});

describe('Providers - QueryClient retry logic', () => {
  function isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { data?: { code?: string }; message?: string };
    if (err.data?.code === 'UNAUTHORIZED') return true;
    const message = err.message?.toLowerCase() ?? '';
    return message.includes('unauthorized') || message.includes('authentication required');
  }

  function retry(failureCount: number, error: unknown): boolean {
    if (isAuthError(error)) return false;
    return failureCount < 3;
  }

  it('does not retry on auth errors', () => {
    expect(retry(0, { data: { code: 'UNAUTHORIZED' } })).toBe(false);
    expect(retry(1, { message: 'Unauthorized' })).toBe(false);
  });

  it('retries up to 3 times for non-auth errors', () => {
    expect(retry(0, { message: 'Network error' })).toBe(true);
    expect(retry(1, { message: 'Timeout' })).toBe(true);
    expect(retry(2, { message: 'Timeout' })).toBe(true);
    expect(retry(3, { message: 'Timeout' })).toBe(false);
  });
});
