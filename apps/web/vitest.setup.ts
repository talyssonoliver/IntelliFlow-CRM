import '@testing-library/jest-dom/vitest';
import { vi, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Next.js Navigation Mock
// =============================================================================
// Global mock for next/navigation to prevent "invariant expected app router
// to be mounted" errors in component tests.
//
// This mock provides default implementations for all next/navigation hooks.
// Individual tests can override specific behaviors using vi.mocked().

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/',
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
  redirect: vi.fn(),
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
}));

// =============================================================================
// Next.js Link Mock
// =============================================================================
// Mock next/link to render as a simple anchor tag in tests

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

// =============================================================================
// Next.js Image Mock
// =============================================================================
// Mock next/image to render as a simple img tag in tests

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) =>
    React.createElement('img', { src, alt, ...props }),
}));

// =============================================================================
// tRPC Subscriptions Mock
// =============================================================================
// Mock tRPC subscription hooks to prevent "Unable to find tRPC Context" errors

const mockSubscriptionState = {
  activities: [],
  status: 'connected' as const,
  metrics: { averageLatency: 10, messagesReceived: 0 },
};

const mockHealthState = {
  isHealthy: true,
  latency: 10,
  lastPing: Date.now(),
};

vi.mock('@/hooks/use-trpc-subscriptions', () => ({
  useLeadScoredSubscription: vi.fn(() => mockSubscriptionState),
  useTaskAssignedSubscription: vi.fn(() => mockSubscriptionState),
  useSystemEventSubscription: vi.fn(() => mockSubscriptionState),
  useRealtimeHealth: vi.fn(() => mockHealthState),
  useActivitySubscription: vi.fn(() => mockSubscriptionState),
}));

// Also mock the re-export module
vi.mock('@/hooks/use-subscription', () => ({
  useLeadScoredSubscription: vi.fn(() => mockSubscriptionState),
  useTaskAssignedSubscription: vi.fn(() => mockSubscriptionState),
  useSystemEventSubscription: vi.fn(() => mockSubscriptionState),
  useRealtimeHealth: vi.fn(() => mockHealthState),
  useActivitySubscription: vi.fn(() => mockSubscriptionState),
}));

// =============================================================================
// Auth Context Mock
// =============================================================================
// Mock the AuthContext to provide default authenticated state for tests.
// Individual tests can override these values as needed.

const mockAuthUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'USER',
  avatar: null,
};

const mockAuthContext = {
  user: null as typeof mockAuthUser | null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
};

// Helper to set authenticated state for tests that need it
export function setMockAuthenticated(authenticated: boolean) {
  mockAuthContext.isAuthenticated = authenticated;
  mockAuthContext.user = authenticated ? mockAuthUser : null;
}

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: mockAuthContext.isAuthenticated }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// =============================================================================
// Export mocks for test access
// =============================================================================
// Tests can import these to set up specific behaviors or assertions:
// import { mockRouter, mockAuthContext } from '../../../vitest.setup';

export { mockRouter, mockSearchParams, mockAuthContext, mockAuthUser };

// =============================================================================
// localStorage Mock
// =============================================================================
// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

// Only mock if not already defined (some environments provide it)
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.getItem) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}

// CRITICAL: Clean up after each test to prevent memory leaks
afterEach(() => {
  // Clean up React testing library rendered components
  cleanup();

  // Clear localStorage mock state
  localStorageMock.clear();

  // Reset Next.js router mock state
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
  mockRouter.forward.mockClear();
  mockRouter.refresh.mockClear();
  mockRouter.prefetch.mockClear();

  // Clear all mock calls and reset state
  vi.clearAllMocks();

  // Vitest v4: Explicitly unstub globals and envs that might accumulate
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Final cleanup when all tests complete
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();

  // Explicit garbage collection if --expose-gc flag is set
  // Helps prevent OOM during test cleanup
  if (global.gc) {
    global.gc();
  }
});
