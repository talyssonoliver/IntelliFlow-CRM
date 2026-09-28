'use client';

import * as React from 'react';
import { createAuroraRenderer, type AuroraRenderer } from './aurora-renderer';

/** Animation seconds advanced per real second. The ribbon should drift, not swim. */
const TIME_SCALE = 0.6;
/** The single frame drawn when the visitor asks for reduced motion. */
const STILL_FRAME_TIME = 8;
/** How quickly the ribbon follows the pointer, per frame (0..1). */
const POINTER_EASE = 0.05;

export type AuroraBackgroundState = 'fallback' | 'still' | 'animated';

/**
 * Painted until the first WebGL frame lands, and kept for good when WebGL is
 * unavailable. It approximates the shader's composition so nothing jumps.
 */
const FALLBACK_STYLE: React.CSSProperties = {
  backgroundColor: '#F3F4FB',
  backgroundImage: [
    'radial-gradient(38% 32% at 0% 48%, rgba(56, 189, 248, 0.38), transparent 70%)',
    'radial-gradient(34% 28% at 22% 70%, rgba(124, 77, 245, 0.22), transparent 70%)',
    'radial-gradient(32% 26% at 100% 0%, rgba(139, 92, 246, 0.34), transparent 70%)',
  ].join(', '),
};

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function hasFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

/**
 * Live aurora ribbon behind the landing hero. Purely decorative: the content
 * above it never depends on it having rendered, and it stops drawing whenever
 * it is off-screen or the tab is hidden.
 */
export function AuroraBackground({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [state, setState] = React.useState<AuroraBackgroundState>('fallback');

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: AuroraRenderer | null = null;
    try {
      renderer = createAuroraRenderer(canvas);
    } catch (error) {
      console.warn('[AuroraBackground] WebGL setup threw; keeping the CSS fallback.', error);
    }
    if (!renderer) return;
    const active = renderer;

    const reduced = prefersReducedMotion();
    const pointer: [number, number, number] = [0.5, 0.5, 0];
    const target: [number, number, number] = [0.5, 0.5, 0];
    let frame = 0;
    let visible = true;
    let pageVisible = document.visibilityState !== 'hidden';
    let animationTime = STILL_FRAME_TIME;
    let lastTimestamp: number | null = null;

    const drawStill = () => active.render(STILL_FRAME_TIME, [0.5, 0.5, 0]);

    const tick = (timestamp: number) => {
      if (lastTimestamp !== null) {
        animationTime += (Math.min(timestamp - lastTimestamp, 100) / 1000) * TIME_SCALE;
      }
      lastTimestamp = timestamp;
      for (let i = 0; i < 3; i++) pointer[i] += (target[i] - pointer[i]) * POINTER_EASE;
      active.render(animationTime, pointer);
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduced || frame || !visible || !pageVisible) return;
      lastTimestamp = null;
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    drawStill();
    setState(reduced ? 'still' : 'animated');
    start();

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            active.resize();
            if (reduced || !frame) drawStill();
          })
        : null;
    resizeObserver?.observe(canvas);

    const intersectionObserver =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            if (visible) start();
            else stop();
          })
        : null;
    intersectionObserver?.observe(canvas);

    const onVisibility = () => {
      pageVisible = document.visibilityState !== 'hidden';
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const trackPointer = !reduced && hasFinePointer();
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      target[0] = x;
      target[1] = y;
      target[2] = inside ? 1 : 0;
    };
    if (trackPointer) window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onContextLost = (event: Event) => {
      event.preventDefault();
      stop();
      setState('fallback');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    return () => {
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (trackPointer) window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      active.dispose();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      data-testid="aurora-background"
      data-state={state}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ''}`}
      style={FALLBACK_STYLE}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
          state === 'fallback' ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <AuroraDecorations />
    </div>
  );
}

const SPARKLE_PATH = 'M0 -10 C1 -3 3 -1 10 0 C3 1 1 3 0 10 C-1 3 -3 1 -10 0 C-3 -1 -1 -3 0 -10 Z';

/** A four-point star, `size` px across. Purely decorative. */
function Sparkle({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className="absolute" style={style}>
      <path d={SPARKLE_PATH} fill={color} />
    </svg>
  );
}

/** A rows x cols grid of small dots. Purely decorative. */
function DotGrid({
  cols,
  rows,
  style,
}: {
  cols: number;
  rows: number;
  style: React.CSSProperties;
}) {
  const gap = 18;
  return (
    <svg
      width={(cols - 1) * gap + 6}
      height={(rows - 1) * gap + 6}
      className="absolute opacity-60"
      style={style}
    >
      {Array.from({ length: cols * rows }, (_, i) => (
        <circle
          key={i}
          cx={3 + (i % cols) * gap}
          cy={3 + Math.floor(i / cols) * gap}
          r={2.5}
          fill="#7C83E8"
        />
      ))}
    </svg>
  );
}

const CYAN = '#38BDF8';
const VIOLET = '#8B5CF6';

/**
 * The mockup's sparkles and dot grids. Positions mirror the shader's two
 * compositions: the desktop set shows from the lg breakpoint, the phone set
 * below it, and both stay clear of the hero copy.
 */
function AuroraDecorations() {
  return (
    <>
      <div className="hidden lg:block">
        <Sparkle size={26} color={CYAN} style={{ left: 104, top: 22 }} />
        <Sparkle size={14} color={CYAN} style={{ left: 136, top: 52 }} />
        <Sparkle size={20} color="#60A5FA" style={{ right: 44, top: 318 }} />
        <Sparkle size={30} color={VIOLET} style={{ right: 58, top: 420 }} />
        <DotGrid cols={3} rows={6} style={{ right: 28, top: 500 }} />
        <DotGrid cols={3} rows={3} style={{ left: 36, top: 860 }} />
      </div>
      <div className="lg:hidden">
        <Sparkle size={20} color={CYAN} style={{ left: 18, top: 18 }} />
        <Sparkle size={12} color={CYAN} style={{ left: 44, top: 44 }} />
        <Sparkle size={18} color={VIOLET} style={{ right: 16, top: 640 }} />
        <DotGrid cols={3} rows={4} style={{ right: 14, top: 700 }} />
      </div>
    </>
  );
}
