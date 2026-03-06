import { expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import * as vitestAxeMatchers from 'vitest-axe/matchers';

// Extend Vitest's expect with jest-dom matchers and vitest-axe matchers
expect.extend(matchers);
expect.extend(vitestAxeMatchers);

// Store original implementations for cleanup
let originalHasPointerCapture: typeof Element.prototype.hasPointerCapture | undefined;
let originalSetPointerCapture: typeof Element.prototype.setPointerCapture | undefined;
let originalReleasePointerCapture: typeof Element.prototype.releasePointerCapture | undefined;
let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined;
let originalResizeObserver: typeof ResizeObserver | undefined;

// Mock Pointer Capture API for Radix UI compatibility in JSDOM
// JSDOM doesn't support these methods which Radix UI components rely on
beforeAll(() => {
  if (typeof Element !== 'undefined') {
    originalHasPointerCapture = Element.prototype.hasPointerCapture;
    originalSetPointerCapture = Element.prototype.setPointerCapture;
    originalReleasePointerCapture = Element.prototype.releasePointerCapture;
    originalScrollIntoView = Element.prototype.scrollIntoView;

    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  }

  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class MockResizeObserver implements ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(_callback: ResizeObserverCallback) {}
  };
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Restore original implementations after all tests complete
afterAll(() => {
  if (typeof Element !== 'undefined') {
    if (originalHasPointerCapture !== undefined) {
      Element.prototype.hasPointerCapture = originalHasPointerCapture;
    }
    if (originalSetPointerCapture !== undefined) {
      Element.prototype.setPointerCapture = originalSetPointerCapture;
    }
    if (originalReleasePointerCapture !== undefined) {
      Element.prototype.releasePointerCapture = originalReleasePointerCapture;
    }
    if (originalScrollIntoView !== undefined) {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  }
  if (originalResizeObserver !== undefined) {
    globalThis.ResizeObserver = originalResizeObserver;
  }
  vi.clearAllMocks();
});
