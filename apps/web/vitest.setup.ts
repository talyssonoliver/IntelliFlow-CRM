import '@testing-library/jest-dom/vitest';
import { vi, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';

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
