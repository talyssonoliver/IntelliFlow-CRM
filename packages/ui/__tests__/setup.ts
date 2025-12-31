import { expect, afterEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock Pointer Capture API for Radix UI compatibility in JSDOM
// JSDOM doesn't support these methods which Radix UI components rely on
beforeAll(() => {
  // Only mock DOM APIs if running in jsdom environment
  if (typeof Element !== 'undefined') {
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();

    // Mock scrollIntoView for Select components
    Element.prototype.scrollIntoView = vi.fn();
  }

  // Mock ResizeObserver for components that need it (available in both environments)
  globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Cleanup after each test
afterEach(() => {
  cleanup();
});
