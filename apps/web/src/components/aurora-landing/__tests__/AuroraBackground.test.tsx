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
import { ARTWORK, computeAuroraScene } from '../aurora-scene';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;
let intersectionCallback: ObserverCallback | null;
let resizeCallbacks: Array<() => void>;
let mediaMatches: Record<string, boolean>;
let boxWidth: number;
let boxHeight: number;

function makeRenderer(lost = false) {
  return { render: vi.fn(), resize: vi.fn(), dispose: vi.fn(), isContextLost: vi.fn(() => lost) };
}

let mediaListeners: Record<string, Array<() => void>>;

/** Flip a media query and notify its listeners, as a browser would. */
function setMedia(query: string, matches: boolean) {
  mediaMatches[query] = matches;
  for (const listener of mediaListeners[query] ?? []) listener();
}

function runFrame(timestamp: number) {
  const pending = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const callback of pending) callback(timestamp);
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function root() {
  return screen.getByTestId('aurora-background');
}

/** Fire `load` on both artwork images and let the promise chain settle. */
async function loadArtwork() {
  await act(async () => {
    for (const img of root().querySelectorAll('img')) img.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  createAuroraRenderer.mockReset();
  rafCallbacks = new Map();
  nextRafId = 1;
  intersectionCallback = null;
  resizeCallbacks = [];
  mediaMatches = {};
  mediaListeners = {};
  boxWidth = 1440;
  boxHeight = 1100;

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => boxWidth,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => boxHeight,
  });
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
    vi.fn((id: number) => rafCallbacks.delete(id))
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
      resizeCallbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    })
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return mediaMatches[query] ?? false;
      },
      addEventListener: (_type: string, listener: () => void) => {
        (mediaListeners[query] ??= []).push(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        mediaListeners[query] = (mediaListeners[query] ?? []).filter((l) => l !== listener);
      },
    }))
  );
  setVisibility('visible');
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});

describe('AuroraBackground', () => {
  it('paints the artwork as still images placed exactly where the shader starts', () => {
    render(<AuroraBackground />);
    const scene = computeAuroraScene(1440, 1100);

    expect(root()).toHaveAttribute('data-state', 'static');
    expect(root().firstElementChild).toHaveAttribute('aria-hidden', 'true');
    const ribbon = root().querySelector(`img[src="${ARTWORK.ribbon.src}"]`) as HTMLImageElement;
    expect(ribbon.style.left).toBe(`${scene.ribbon.offsetX}px`);
    expect(ribbon.style.top).toBe(`${scene.ribbon.offsetY + scene.ribbon.scale * 185}px`);
    expect(ribbon.style.width).toBe(`${scene.ribbon.scale * 741}px`);
    expect(ribbon).toHaveAttribute('alt', '');
    expect(root().querySelector(`img[src="${ARTWORK.veil.src}"]`)).not.toBeNull();
    expect(root().querySelector('canvas')).toHaveClass('opacity-0');
  });

  it('draws the sparkles and dot grid from the scene', () => {
    render(<AuroraBackground className="extra" />);
    const scene = computeAuroraScene(1440, 1100);

    expect(root()).toHaveClass('extra');
    // One svg for the wave, one per sparkle, one for the dot grid.
    expect(root().querySelectorAll('svg')).toHaveLength(1 + scene.sparkles.length + 1);
    expect(root().querySelectorAll('circle')).toHaveLength(scene.dots.cols * scene.dots.rows);
  });

  it('waits for both images before starting WebGL, then fades the canvas in', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    expect(createAuroraRenderer).not.toHaveBeenCalled();

    await loadArtwork();

    const [canvas, images] = createAuroraRenderer.mock.calls[0] as [
      HTMLCanvasElement,
      { ribbon: HTMLImageElement; veil: HTMLImageElement },
    ];
    expect(canvas.tagName).toBe('CANVAS');
    expect(images.ribbon.getAttribute('src')).toBe(ARTWORK.ribbon.src);
    expect(images.veil.getAttribute('src')).toBe(ARTWORK.veil.src);
    expect(renderer.render).toHaveBeenCalledWith(0, computeAuroraScene(1440, 1100));
    expect(root()).toHaveAttribute('data-state', 'animated');
    expect(root().querySelector('canvas')).toHaveClass('opacity-100');
  });

  it('starts straight away when the images are already cached', async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const natural = vi
      .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
      .mockReturnValue(741);
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(createAuroraRenderer).toHaveBeenCalled();
    complete.mockRestore();
    natural.mockRestore();
  });

  it('never starts WebGL for visitors who ask for reduced motion', async () => {
    mediaMatches['(prefers-reduced-motion: reduce)'] = true;
    render(<AuroraBackground />);
    await loadArtwork();

    expect(root()).toHaveAttribute('data-state', 'still');
    expect(createAuroraRenderer).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps the still images when WebGL is unavailable', async () => {
    createAuroraRenderer.mockReturnValue(null);
    render(<AuroraBackground />);
    await loadArtwork();

    expect(root()).toHaveAttribute('data-state', 'static');
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps the still images and logs when WebGL setup throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createAuroraRenderer.mockImplementation(() => {
      throw new Error('boom');
    });
    render(<AuroraBackground />);
    await loadArtwork();

    expect(root()).toHaveAttribute('data-state', 'static');
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] WebGL setup threw; keeping the still images.',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('keeps the still layers and logs when the artwork fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<AuroraBackground />);
    await act(async () => {
      root().querySelector('img')!.dispatchEvent(new Event('error'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createAuroraRenderer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] artwork failed to load; keeping the still layers.',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('animates, clamping long frame gaps', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();

    runFrame(1000);
    runFrame(2000); // a one-second gap counts as 100 ms
    const first = renderer.render.mock.calls[1]![0] as number;
    const second = renderer.render.mock.calls[2]![0] as number;
    expect(first).toBe(0);
    expect(second).toBeCloseTo(0.1, 6);
  });

  it('stops drawing off-screen, repaints once on resize, and resumes in view', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();

    act(() => intersectionCallback?.([{ isIntersecting: false }]));
    expect(rafCallbacks.size).toBe(0);

    const before = renderer.render.mock.calls.length;
    act(() => resizeCallbacks.at(-1)!());
    expect(renderer.resize).toHaveBeenCalled();
    expect(renderer.render.mock.calls.length).toBe(before + 1);

    act(() => intersectionCallback?.([{ isIntersecting: true }]));
    expect(rafCallbacks.size).toBe(1);
  });

  it('re-lays out the scene when the box changes size', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();

    boxWidth = 390;
    boxHeight = 1500;
    act(() => resizeCallbacks[0]!());
    runFrame(16);

    expect(renderer.render).toHaveBeenLastCalledWith(0, computeAuroraScene(390, 1500));
  });

  it('pauses while the tab is hidden', async () => {
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);
    await loadArtwork();

    act(() => setVisibility('hidden'));
    expect(rafCallbacks.size).toBe(0);
    act(() => setVisibility('visible'));
    expect(rafCallbacks.size).toBe(1);
  });

  it('falls back to the still images when the GPU drops the context', async () => {
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);
    await loadArtwork();

    act(() => {
      root()
        .querySelector('canvas')!
        .dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });

    expect(root()).toHaveAttribute('data-state', 'static');
    expect(rafCallbacks.size).toBe(0);
  });

  it('works without the observer APIs', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('matchMedia', undefined);
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);
    await loadArtwork();

    expect(root()).toHaveAttribute('data-state', 'animated');
  });

  it('stops the loop, removes listeners and frees the GPU on unmount', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<AuroraBackground />);
    await loadArtwork();

    unmount();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.size).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('does nothing if unmounted before the artwork loads', async () => {
    createAuroraRenderer.mockReturnValue(makeRenderer());
    const { unmount } = render(<AuroraBackground />);
    const images = [...root().querySelectorAll('img')];
    unmount();
    await act(async () => {
      for (const img of images) img.dispatchEvent(new Event('load'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createAuroraRenderer).not.toHaveBeenCalled();
  });

  it('offers a pause button that holds the frame and resumes it (WCAG 2.2.2)', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    expect(screen.queryByRole('button')).toBeNull();
    await loadArtwork();

    const pause = screen.getByRole('button', { name: 'Pause background animation' });
    act(() => pause.click());
    expect(root()).toHaveAttribute('data-state', 'paused');
    expect(rafCallbacks.size).toBe(0);
    expect(root().querySelector('canvas')).toHaveClass('opacity-100');

    // Scrolling back into view must not override the visitor's pause.
    act(() => intersectionCallback?.([{ isIntersecting: true }]));
    expect(rafCallbacks.size).toBe(0);

    act(() => screen.getByRole('button', { name: 'Play background animation' }).click());
    expect(root()).toHaveAttribute('data-state', 'animated');
    expect(rafCallbacks.size).toBe(1);
  });

  it('stops animating when reduced motion is switched on mid-visit, and restarts when it is off', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();
    expect(root()).toHaveAttribute('data-state', 'animated');

    act(() => setMedia('(prefers-reduced-motion: reduce)', true));
    expect(root()).toHaveAttribute('data-state', 'still');
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.size).toBe(0);

    act(() => setMedia('(prefers-reduced-motion: reduce)', false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(root()).toHaveAttribute('data-state', 'static');
  });

  it('reports an image that failed before the listeners were attached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    render(<AuroraBackground />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(createAuroraRenderer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] artwork failed to load; keeping the still layers.',
      expect.any(Error)
    );
    complete.mockRestore();
    warn.mockRestore();
  });

  it('never draws again after the context is lost, even when scrolled back into view', async () => {
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();

    act(() => {
      root()
        .querySelector('canvas')!
        .dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    act(() => intersectionCallback?.([{ isIntersecting: false }]));
    act(() => intersectionCallback?.([{ isIntersecting: true }]));
    act(() => setVisibility('visible'));

    expect(rafCallbacks.size).toBe(0);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the still images if the context is lost during the first draw', async () => {
    createAuroraRenderer.mockReturnValue(makeRenderer(true));
    render(<AuroraBackground />);
    await loadArtwork();

    expect(root()).toHaveAttribute('data-state', 'static');
    expect(rafCallbacks.size).toBe(0);
  });

  it('draws phones at 1x and at most 30 frames a second', async () => {
    mediaMatches['(pointer: coarse)'] = true;
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();

    const pixelRatio = createAuroraRenderer.mock.calls[0]![2] as () => number;
    expect(pixelRatio()).toBe(1);

    const before = renderer.render.mock.calls.length;
    runFrame(1000);
    runFrame(1016); // 16 ms later: skipped
    runFrame(1040); // 40 ms after the last draw: drawn
    expect(renderer.render.mock.calls.length).toBe(before + 2);
  });

  it('uses the window device pixel ratio on desktops', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    createAuroraRenderer.mockReturnValue(makeRenderer());
    render(<AuroraBackground />);
    await loadArtwork();

    expect((createAuroraRenderer.mock.calls[0]![2] as () => number)()).toBe(2);
  });

  it('falls back to window resize events without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const renderer = makeRenderer();
    createAuroraRenderer.mockReturnValue(renderer);
    render(<AuroraBackground />);
    await loadArtwork();
    act(() => intersectionCallback?.([{ isIntersecting: false }]));

    boxWidth = 390;
    boxHeight = 1500;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(renderer.resize).toHaveBeenCalled();
    expect(renderer.render).toHaveBeenLastCalledWith(0, computeAuroraScene(390, 1500));
  });
});
