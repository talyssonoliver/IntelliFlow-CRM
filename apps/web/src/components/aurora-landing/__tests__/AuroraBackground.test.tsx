/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const createAuroraRenderer = vi.fn();
vi.mock('../aurora-renderer', () => ({
  createAuroraRenderer: (...args: unknown[]) => createAuroraRenderer(...args),
}));

import { AuroraBackground } from '../AuroraBackground';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;
let intersectionCallback: ObserverCallback | null;
let resizeCallback: (() => void) | null;
let mediaMatches: Record<string, boolean>;

function makeRenderer() {
  return { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
}

function runFrame(timestamp: number) {
  const pending = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, callback] of pending) callback(timestamp);
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  createAuroraRenderer.mockReset();
  rafCallbacks = new Map();
  nextRafId = 1;
  intersectionCallback = null;
  resizeCallback = null;
  mediaMatches = {};

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      rafCallbacks.delete(id);
    })
  );
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function (this: unknown, callback: ObserverCallback) {
      intersectionCallback = callback;
      return { observe: vi.fn(), disconnect: vi.fn() };
    })
  );
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function (this: unknown, callback: () => void) {
      resizeCallback = callback;
      return { observe: vi.fn(), disconnect: vi.fn() };
    })
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: mediaMatches[query] ?? false }))
  );
  setVisibility('visible');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuroraBackground', () => {
  it('keeps the CSS fallback when WebGL is unavailable', () => {
    createAuroraRenderer.mockReturnValue(null);
    render(<AuroraBackground />);

    const root = screen.getByTestId('aurora-background');
    expect(root).toHaveAttribute('data-state', 'fallback');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelector('canvas')).toHaveClass('opacity-0');
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps the CSS fallback and logs when WebGL setup throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createAuroraRenderer.mockImplementation(() => {
      throw new Error('boom');
    });
    render(<AuroraBackground />);

    expect(screen.getByTestId('aurora-background')).toHaveAttribute('data-state', 'fallback');
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] WebGL setup threw; keeping the CSS fallback.',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('draws a single still frame and never animates under reduced motion', () => {
    mediaMatches['(prefers-reduced-motion: reduce)'] = true;
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);

    expect(screen.getByTestId('aurora-background')).toHaveAttribute('data-state', 'still');
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    act(() => resizeCallback?.());
    expect(renderer.resize).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it('animates, advancing time slowly and clamping long frame gaps', () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);

    expect(screen.getByTestId('aurora-background')).toHaveAttribute('data-state', 'animated');
    expect(screen.getByTestId('aurora-background').querySelector('canvas')).toHaveClass(
      'opacity-100'
    );

    runFrame(1000);
    runFrame(2000); // a one-second gap counts as 100 ms of real time
    const [firstTime] = renderer.render.mock.calls[1] as [number];
    const [secondTime] = renderer.render.mock.calls[2] as [number];
    expect(secondTime - firstTime).toBeCloseTo(0.1 * 0.6, 5);
  });

  it('stops drawing off-screen and resumes when scrolled back into view', () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);

    act(() => intersectionCallback?.([{ isIntersecting: false }]));
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(rafCallbacks.size).toBe(0);

    // A resize while paused repaints once so the still picture fits.
    const before = renderer.render.mock.calls.length;
    act(() => resizeCallback?.());
    expect(renderer.render.mock.calls.length).toBe(before + 1);

    act(() => intersectionCallback?.([{ isIntersecting: true }]));
    expect(rafCallbacks.size).toBe(1);
  });

  it('pauses while the tab is hidden', () => {
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);

    act(() => setVisibility('hidden'));
    expect(rafCallbacks.size).toBe(0);

    act(() => setVisibility('visible'));
    expect(rafCallbacks.size).toBe(1);
  });

  it('leans toward a fine pointer inside the canvas and lets go outside it', () => {
    mediaMatches['(pointer: fine)'] = true;
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);

    const canvas = screen.getByTestId('aurora-background').querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 25 }));
    });
    for (let i = 0; i < 200; i++) runFrame(i * 16);
    const inside = renderer.render.mock.calls.at(-1)![1] as number[];
    expect(inside[0]).toBeCloseTo(0.75, 2);
    expect(inside[1]).toBeCloseTo(0.25, 2);
    expect(inside[2]).toBeCloseTo(1, 2);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 500 }));
    });
    for (let i = 200; i < 400; i++) runFrame(i * 16);
    const outside = renderer.render.mock.calls.at(-1)![1] as number[];
    expect(outside[2]).toBeCloseTo(0, 2);
  });

  it('ignores pointer events while the canvas has no size', () => {
    mediaMatches['(pointer: fine)'] = true;
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);

    const canvas = screen.getByTestId('aurora-background').querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
    });
    runFrame(16);
    expect((renderer.render.mock.calls.at(-1)![1] as number[])[2]).toBe(0);
  });

  it('falls back to CSS when the GPU drops the context', () => {
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);

    const canvas = screen.getByTestId('aurora-background').querySelector('canvas')!;
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });

    expect(screen.getByTestId('aurora-background')).toHaveAttribute('data-state', 'fallback');
    expect(rafCallbacks.size).toBe(0);
  });

  it('works without the observer APIs', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('matchMedia', undefined);
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);

    expect(screen.getByTestId('aurora-background')).toHaveAttribute('data-state', 'animated');
  });

  it('stops the loop, removes listeners and frees the GPU on unmount', () => {
    mediaMatches['(pointer: fine)'] = true;
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<AuroraBackground className="extra" />);

    expect(screen.getByTestId('aurora-background')).toHaveClass('extra');
    unmount();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.size).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    removeSpy.mockRestore();
  });
});
