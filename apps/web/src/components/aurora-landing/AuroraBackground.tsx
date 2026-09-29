'use client';

import * as React from 'react';
import { createAuroraRenderer, type AuroraRenderer } from './aurora-renderer';
import {
  ARTWORK,
  GROUND,
  computeAuroraScene,
  wavePath,
  type AuroraScene,
  type Placement,
} from './aurora-scene';

/** Phones get a lighter frame budget: 30 fps is indistinguishable for a slow drift. */
const COARSE_POINTER_FRAME_MS = 1000 / 30;
/**
 * Slack for rAF timestamp rounding: two 60 Hz frames arrive ~33.3 ms apart,
 * a hair under 1000/30, and without it every second draw slips to ~20 fps.
 */
const FRAME_SLACK_MS = 2;

/**
 * 'static'   the still images (first paint, or WebGL unavailable / lost)
 * 'still'    the still images on purpose: the visitor asked for reduced motion
 * 'animated' the live WebGL canvas, faded in over the still images
 * 'paused'   the live canvas, held on its current frame by the visitor
 */
export type AuroraBackgroundState = 'static' | 'still' | 'animated' | 'paused';

const SPARKLE_PATH = 'M0 -10 C1 -3 3 -1 10 0 C3 1 1 3 0 10 C-1 3 -3 1 -10 0 C-3 -1 -1 -3 0 -10 Z';

// Measure before paint in the browser; plain effect on the server (no warning).
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** Tracks `prefers-reduced-motion` live, so a change mid-visit takes effect. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = mediaQuery('(prefers-reduced-motion: reduce)');
    if (!query) return;
    setReduced(query.matches);
    if (typeof query.addEventListener !== 'function') return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Position a cut-out image exactly where the shader draws it at t=0. */
function layerStyle(
  placement: Placement,
  art: { x: number; y: number; width: number; height: number }
): React.CSSProperties {
  return {
    position: 'absolute',
    left: placement.offsetX + placement.scale * art.x,
    top: placement.offsetY + placement.scale * art.y,
    width: placement.scale * art.width,
    height: placement.scale * art.height,
    maxWidth: 'none',
  };
}

/** Resolves once `image` has decoded; rejects if it failed, even before we started listening. */
function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error(`failed to load ${image.src}`));
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
    };
    const onLoad = () => {
      done();
      resolve();
    };
    const onError = () => {
      done();
      reject(new Error(`failed to load ${image.src}`));
    };
    image.addEventListener('load', onLoad);
    image.addEventListener('error', onError);
  });
}

interface LoopControls {
  setPaused(paused: boolean): void;
  /** Redraw the current frame when the loop is not running (paused or off-screen). */
  repaint(): void;
}

/**
 * The live Aurora ribbon behind the landing hero. It paints the mockup as still
 * images first, then fades a WebGL canvas in over them and lets the folds drift.
 * It stops drawing whenever it is off-screen or the tab is hidden, never animates
 * for visitors who ask for reduced motion, and offers a pause button (WCAG 2.2.2).
 */
export function AuroraBackground({ className }: { className?: string }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const ribbonRef = React.useRef<HTMLImageElement>(null);
  const veilRef = React.useRef<HTMLImageElement>(null);
  const loopRef = React.useRef<LoopControls | null>(null);
  const pausedRef = React.useRef(false);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const [state, setState] = React.useState<AuroraBackgroundState>('static');
  const [paused, setPaused] = React.useState(false);
  const reduced = useReducedMotion();

  const scene = React.useMemo<AuroraScene | null>(
    () => (size ? computeAuroraScene(size.width, size.height) : null),
    [size]
  );
  const sceneRef = React.useRef<AuroraScene | null>(scene);
  sceneRef.current = scene;

  // Measure the box the background fills, before the first paint.
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const width = root.clientWidth;
      const height = root.clientHeight;
      setSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height }
      );
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(root);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const measured = scene !== null;

  // Start WebGL once the layout is known and both images have loaded.
  React.useEffect(() => {
    if (!measured) return;
    if (reduced) {
      setState('still');
      return;
    }
    setState('static');
    const canvas = canvasRef.current;
    const ribbon = ribbonRef.current;
    const veil = veilRef.current;
    if (!canvas || !ribbon || !veil) return;

    let cancelled = false;
    let renderer: AuroraRenderer | null = null;
    let frame = 0;
    let visible = true;
    let pageVisible = document.visibilityState !== 'hidden';
    let time = 0;
    let last: number | null = null;
    let lastDraw = -Infinity;
    const coarse = mediaQuery('(pointer: coarse)')?.matches ?? false;
    const minFrameMs = coarse ? COARSE_POINTER_FRAME_MS : 0;
    const cleanups: Array<() => void> = [];

    const tick = (now: number) => {
      if (last !== null) time += Math.min(now - last, 100) / 1000;
      last = now;
      const current = sceneRef.current;
      if (renderer && current && now - lastDraw >= minFrameMs - FRAME_SLACK_MS) {
        renderer.render(time, current);
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!renderer || frame || !visible || !pageVisible || pausedRef.current) return;
      last = null;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const repaint = () => {
      const latest = sceneRef.current;
      if (renderer && !frame && latest) renderer.render(time, latest);
    };

    // Listen for context loss before any GPU allocation can trigger it.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stop();
      renderer = null; // every GL object is gone; never draw with it again
      setState('static');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    cleanups.push(() => canvas.removeEventListener('webglcontextlost', onContextLost));

    Promise.all([waitForImage(ribbon), waitForImage(veil)])
      .then(() => {
        if (cancelled) return;
        try {
          renderer = createAuroraRenderer(canvas, { ribbon, veil }, () =>
            coarse ? 1 : window.devicePixelRatio
          );
        } catch (error) {
          console.warn('[AuroraBackground] WebGL setup threw; keeping the still images.', error);
        }
        if (!renderer) return;
        const current = sceneRef.current;
        if (current) renderer.render(0, current);
        if (renderer.isContextLost()) {
          renderer = null;
          return;
        }
        loopRef.current = {
          setPaused(next) {
            if (next) stop();
            else start();
          },
          repaint,
        };
        setState(pausedRef.current ? 'paused' : 'animated');
        start();

        const active = renderer;
        const onResize = () => {
          active.resize();
          repaint();
        };
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(onResize);
          observer.observe(canvas);
          cleanups.push(() => observer.disconnect());
        } else {
          window.addEventListener('resize', onResize);
          cleanups.push(() => window.removeEventListener('resize', onResize));
        }
        if (typeof IntersectionObserver === 'function') {
          const observer = new IntersectionObserver((entries) => {
            // Entries arrive oldest first; only the newest reflects where the canvas is now.
            visible = entries[entries.length - 1]?.isIntersecting ?? true;
            if (visible) start();
            else stop();
          });
          observer.observe(canvas);
          cleanups.push(() => observer.disconnect());
        }
        const onVisibility = () => {
          pageVisible = document.visibilityState !== 'hidden';
          if (pageVisible) start();
          else stop();
        };
        document.addEventListener('visibilitychange', onVisibility);
        cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
      })
      .catch((error: unknown) => {
        console.warn('[AuroraBackground] artwork failed to load; keeping the still layers.', error);
      });

    return () => {
      cancelled = true;
      stop();
      loopRef.current = null;
      for (const cleanup of cleanups) cleanup();
      renderer?.dispose();
    };
  }, [measured, reduced]);

  // A new layout while the loop is stopped still has to reach the canvas.
  React.useEffect(() => {
    loopRef.current?.repaint();
  }, [scene]);

  const togglePaused = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    loopRef.current?.setPaused(next);
    const liveState: AuroraBackgroundState = next ? 'paused' : 'animated';
    setState((current) => (current === 'animated' || current === 'paused' ? liveState : current));
  };

  const live = state === 'animated' || state === 'paused';

  return (
    <div
      ref={rootRef}
      data-testid="aurora-background"
      data-state={state}
      className={`pointer-events-none absolute inset-0 ${className ?? ''}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden bg-[#EFF0F9] bg-[linear-gradient(160deg,#F2F3FB_0%,#EEEFF9_55%,#EBE9F7_100%)]"
      >
        {scene && (
          <>
            <svg
              className="absolute inset-0"
              width={scene.width}
              height={scene.height}
              viewBox={`0 0 ${scene.width} ${scene.height}`}
            >
              <path d={wavePath(scene, 96)} fill="#FBF9FC" />
            </svg>
            <div
              className="absolute rounded-full"
              style={{
                left:
                  scene.ground.offsetX +
                  scene.ground.scale * (GROUND.circle.x - GROUND.circle.radius),
                top:
                  scene.ground.offsetY +
                  scene.ground.scale * (GROUND.circle.y - GROUND.circle.radius),
                width: scene.ground.scale * GROUND.circle.radius * 2,
                height: scene.ground.scale * GROUND.circle.radius * 2,
                backgroundColor: `rgba(${GROUND.circle.color.map((c) => Math.round(c * 255)).join(', ')}, ${GROUND.circle.alpha})`,
              }}
            />
            {/* Plain img elements on purpose: WebGL uploads these exact elements as textures. */}
            <img
              ref={veilRef}
              src={ARTWORK.veil.src}
              alt=""
              decoding="async"
              style={layerStyle(scene.veil, ARTWORK.veil)}
            />
            <img
              ref={ribbonRef}
              src={ARTWORK.ribbon.src}
              alt=""
              decoding="async"
              style={layerStyle(scene.ribbon, ARTWORK.ribbon)}
            />
          </>
        )}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
            live ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {scene && (
          <>
            {scene.sparkles.map((sparkle, index) => (
              <svg
                key={index}
                className="absolute"
                width={sparkle.size}
                height={sparkle.size}
                viewBox="-10 -10 20 20"
                style={{ left: sparkle.x - sparkle.size / 2, top: sparkle.y - sparkle.size / 2 }}
              >
                <path d={SPARKLE_PATH} fill="#4FA3E8" />
              </svg>
            ))}
            <svg
              className="absolute opacity-80"
              width={(scene.dots.cols - 1) * scene.dots.gap + 6}
              height={(scene.dots.rows - 1) * scene.dots.gap + 6}
              style={{ left: scene.dots.x, top: scene.dots.y }}
            >
              {Array.from({ length: scene.dots.cols * scene.dots.rows }, (_, i) => (
                <circle
                  key={i}
                  cx={3 + (i % scene.dots.cols) * scene.dots.gap}
                  cy={3 + Math.floor(i / scene.dots.cols) * scene.dots.gap}
                  r={2.5}
                  fill="#7F8CE6"
                />
              ))}
            </svg>
            <div
              className="absolute rounded-full bg-[#E3DEF6]"
              style={{
                left: scene.smallCircle.x - scene.smallCircle.radius,
                top: scene.smallCircle.y - scene.smallCircle.radius,
                width: scene.smallCircle.radius * 2,
                height: scene.smallCircle.radius * 2,
              }}
            />
          </>
        )}
      </div>
      {live && (
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? 'Play background animation' : 'Pause background animation'}
          className="pointer-events-auto absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#D6D8F2] bg-white/85 text-[#11175B] shadow-sm backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2A78F6] focus-visible:ring-offset-2"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            {paused ? 'play_arrow' : 'pause'}
          </span>
        </button>
      )}
    </div>
  );
}
