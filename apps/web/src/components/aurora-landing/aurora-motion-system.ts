/**
 * aurora-motion-system.ts
 * ---------------------------------------------------------------------------
 * The single scroll + motion system for the Aurora landing page: one token
 * set, one responsive split, and five primitives that replace the page's
 * four previously-independent motion systems (`.boot`, `.reveal`, the
 * layer-step on/off toggle, and the hero-bg "reading" crossfade).
 *
 * DESIGN PRINCIPLES
 * ---------------------------------------------------------------------------
 * 1. ONE state machine, not several. Every primitive below shares this one
 *    token set (`MOTION`) and one scroll-range vocabulary (`RANGE`) instead
 *    of each call site hand-typing its own duration/ease/threshold.
 * 2. SCRUB, don't SNAP, for anything spatially tied to scroll. A binary class
 *    toggle driving a fixed-duration CSS transition is scroll-desynced by
 *    definition: the transition runs on a wall-clock timer that started when
 *    a threshold was crossed, so a fast scroll finishes it after the trigger
 *    point has already been left behind (the "pop"). `createScrubSteps` and
 *    `createBackgroundRecede` drive opacity/transform every tick from scroll
 *    position directly, via `scrub`, never from a timer.
 * 3. ENTER and EXIT are the same primitive. `createReveal` plays forward AND
 *    back (`onEnter` / `onLeaveBack`) so scrolling up undoes exactly what
 *    scrolling down did.
 * 4. Real content is never destroyed to stage an animation. Every primitive
 *    here only ever animates opacity/transform/clip-path over content that
 *    is already fully present in the DOM.
 * 5. The background recedes; the foreground never gets frosted.
 *    `createBackgroundRecede` scrubs the wave's own opacity toward the page's
 *    Mist background as the stack walkthrough takes over, so nothing sits in
 *    front of the live canvas to fake legibility.
 * 6. Perf budget: transform + opacity (+ a single `clip-path` for the type
 *    reveal) only, everywhere. `will-change` is applied only while a trigger
 *    is active and removed on leave (`withWillChange`).
 * 7. Nothing here assumes an animation will finish. Timelines are `paused:
 *    true`, only ever `.play()`/`.reverse()`/`.progress()`-driven from a
 *    `ScrollTrigger` callback; nothing that carries real content is gated
 *    behind `onComplete`.
 */

import type { gsap as GsapType } from 'gsap';
import type { ScrollTrigger as ScrollTriggerType } from 'gsap/ScrollTrigger';

// A structural type for Lenis so this module has zero hard dependency on the
// package beyond its type shape; the caller owns the real `import Lenis from
// 'lenis'` and passes a factory.
interface LenisLike {
  raf(time: number): void;
  on(event: 'scroll', cb: () => void): void;
  destroy(): void;
}

type Gsap = typeof GsapType;
type ScrollTriggerStatic = typeof ScrollTriggerType;
type Cleanup = () => void;

// ---------------------------------------------------------------------------
// Tokens — the one place durations, eases, distances and stagger live.
// ---------------------------------------------------------------------------

export const MOTION = {
  duration: {
    /** Micro state changes: a button press, a toggle. */
    xs: 0.22,
    /** A single element's reveal. */
    sm: 0.42,
    /** A section's group reveal, a scene beat. */
    md: 0.62,
    /** A pinned hand-off, a scene's full arc. */
    lg: 0.9,
    /** The type-reveal sweep, the longest deliberate read. */
    xl: 1.4,
  },
  ease: {
    /** Default entrance: confident, no overshoot. */
    enter: 'power3.out',
    /** Default exit: quicker than the entrance, content is leaving. */
    exit: 'power2.in',
    /** Anything scrubbed 1:1 with scroll — no easing curve fights the input. */
    scrub: 'none',
    /** A hand-off between two fixed states (camera moves, colour bridges). */
    handoff: 'power2.inOut',
    /** The one place a spring is earned: a confirmation toast, a completed action. */
    confirm: 'back.out(1.6)',
  },
  /** Translate distances in px, matched to how large the moving element is. */
  distance: {
    xs: 10,
    sm: 18,
    md: 28,
    lg: 44,
  },
  /** A soft blur used only on entrance/exit of large surfaces, never on text mid-read. */
  blur: {
    sm: 4,
    md: 8,
  },
  stagger: {
    tight: 0.045,
    normal: 0.08,
    loose: 0.13,
  },
  /** Default scrub smoothing: enough to remove jitter, not enough to feel laggy. */
  scrubSmoothing: 0.35,
} as const;

/** Shared start/end vocabulary so every trigger in the system reads a scroll
 *  range the same way — no per-callsite '70%' / '55%' guessing. */
export const RANGE = {
  /** Element's top crosses this far from the bottom of the viewport → begin. */
  enterAt: 'top 88%',
  /** Fully settled. */
  settledAt: 'top 55%',
  /** Begin handing off to whatever comes next. */
  exitAt: 'top 12%',
  /** Fully gone. */
  goneAt: 'top -10%',
} as const;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Fine pointer (mouse/trackpad) — the only surface Lenis is allowed to touch. */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

/** The mobile breakpoint the rest of aurora-landing.css already uses. */
export const MOBILE_QUERY = '(max-width: 960px)';
export const DESKTOP_QUERY = '(min-width: 961px)';

/**
 * Touch/coarse-pointer OR narrow viewport — the surfaces where an "exit" fade
 * (content that already scrolled fully into view dimming again as the visitor
 * keeps reading) reads as a bug ("why did that go faint?") rather than a
 * deliberate breadcrumb, because there is no mouse hovering back over it to
 * explain the motion. `createReveal` and `createScrubSteps` both disable
 * their exit/re-dim leg here and only ever settle at full opacity once shown
 * (owner ruling 2026-09-30: "disable exit fades entirely on touch/phone").
 */
export function isTouchOrPhone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia(MOBILE_QUERY).matches;
}

// ---------------------------------------------------------------------------
// will-change discipline: on only while a trigger is active, off on leave.
// ---------------------------------------------------------------------------

export function withWillChange(el: Element, props: string, active: boolean): void {
  const style = (el as HTMLElement).style;
  if (active) style.willChange = props;
  else style.willChange = '';
}

// ---------------------------------------------------------------------------
// Global ScrollTrigger configuration — call once, before creating triggers.
// ---------------------------------------------------------------------------

export function configureScrollTrigger(ScrollTrigger: ScrollTriggerStatic): void {
  // iOS address-bar show/hide fires a resize; without this every pinned
  // section (hero-bg, stage-object) recalculates mid-scroll and jumps.
  // Verified: gsap.com/docs/v3/Plugins/ScrollSmoother, "ignoreMobileResize".
  ScrollTrigger.config({ ignoreMobileResize: true });
  // One-shot reveals default to reversible; scrubbed triggers ignore this.
  ScrollTrigger.defaults({ toggleActions: 'play none none reverse' });
}

// ---------------------------------------------------------------------------
// Optional smooth scroll (Lenis) — desktop, fine-pointer only.
// ---------------------------------------------------------------------------
/**
 * Native scroll + ScrollTrigger `scrub` already reads correctly on mobile
 * (momentum, address-bar resize, screen-reader swipe navigation, find-in-page
 * and `#anchor` links all keep working because the browser still drives
 * `scrollTop`). Lenis's own default (`syncTouch: false`) lets touch scroll
 * natively and only smooths `wheel` input, so it is *safe* on mobile even
 * un-gated — but there is no product reason to pay for its rAF loop and extra
 * JS on a device that never fires a `wheel` event. This module installs it
 * only under `(pointer: fine)` and outside reduced motion, and relies on
 * Lenis's own `respectReducedMotion` (default `true`) as a second line of
 * defence if the OS setting changes mid-session.
 *
 * Caller owns the Lenis import (`import Lenis from 'lenis'`) so this module
 * has no hard dependency on the package being installed.
 */
export function setupSmoothScroll(
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerStatic,
  createLenis: () => LenisLike
): Cleanup {
  if (prefersReducedMotion() || !hasFinePointer()) return () => undefined;
  const lenis = createLenis();
  const onScroll = () => ScrollTrigger.update();
  lenis.on('scroll', onScroll);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  // Lenis drives the ticker, so GSAP must not skip time after a slow frame.
  // The ticker is global: put GSAP's default back when this page unmounts.
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
  };
}

// ---------------------------------------------------------------------------
// Primitive 1 — Reveal: one-shot-feeling enter, reversible exit on scroll-back.
// ---------------------------------------------------------------------------

export interface RevealOptions {
  y?: number;
  blur?: number;
  duration?: number;
  stagger?: number;
  /** Extra properties merged into the "from" state (e.g. scale, rotate). */
  from?: Record<string, unknown>;
}

/**
 * Replaces the page's `.reveal`/`.revealed` IntersectionObserver + CSS
 * transition pair. Same visual job (fade + rise on first approach), but:
 *   - reversible: scrolling back above the trigger un-reveals it, so a
 *     visitor who overshoots and corrects sees the same motion language
 *     both ways, instead of a class that can only ever be added once.
 *   - `will-change` scoped to the active window only.
 *   - progressive: the "from" (hidden) state is only ever set here, by JS,
 *     once this primitive mounts — the server-rendered markup is always
 *     fully visible, so a client script that never runs never hides content.
 */
export function createReveal(
  root: ParentNode,
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerStatic,
  selector = '.reveal',
  opts: RevealOptions = {}
): Cleanup {
  const els = gsap.utils.toArray<HTMLElement>(selector, root as Element);
  const reduced = prefersReducedMotion();
  const {
    y = MOTION.distance.sm,
    blur = 0,
    duration = MOTION.duration.md,
    stagger = MOTION.stagger.normal,
    from = {},
  } = opts;

  if (els.length === 0) return () => undefined;
  if (reduced) {
    gsap.set(els, { autoAlpha: 1, y: 0, filter: 'none' });
    return () => undefined;
  }

  // Touch/phone: reveal once, forward only. No `onLeaveBack` reverse — a
  // quick correction or momentum overshoot near the trigger threshold must
  // never drop already-shown content back to invisible (owner 2026-09-30).
  const disableExit = isTouchOrPhone();

  const triggers: ScrollTriggerType[] = [];
  els.forEach((el, i) => {
    gsap.set(el, {
      autoAlpha: 0,
      y,
      filter: blur ? `blur(${blur}px)` : 'none',
      ...from,
    });
    const tween = gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      filter: 'blur(0px)',
      duration,
      delay: (i % 6) * stagger,
      ease: MOTION.ease.enter,
      onStart: () => withWillChange(el, 'opacity, transform, filter', true),
      onComplete: () => withWillChange(el, '', false),
      onReverseComplete: () => withWillChange(el, '', false),
      paused: true,
    });
    const st = ScrollTrigger.create({
      trigger: el,
      start: RANGE.enterAt,
      onEnter: () => tween.play(),
      onLeaveBack: disableExit ? undefined : () => tween.reverse(),
    });
    triggers.push(st);
  });

  return () => triggers.forEach((t) => t.kill());
}

/**
 * Components drift up and fade as they leave the top of the screen, scrubbed to
 * the scroll position, and come back the same way on the way up. The fade only
 * starts once the element's bottom edge is in the top quarter or so of the
 * screen, so copy is never half-faded while it is still being read. While it
 * fades the element carries `data-exiting`.
 */
export function createExitDrift(
  root: ParentNode,
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerStatic,
  selector: string
): Cleanup {
  if (prefersReducedMotion()) return () => undefined;
  const els = gsap.utils.toArray<HTMLElement>(selector, root as Element);
  const start = isTouchOrPhone() ? 'bottom 22%' : 'bottom 30%';
  const tweens = els.map((el) =>
    gsap.fromTo(
      el,
      { autoAlpha: 1, y: 0, scale: 1 },
      {
        autoAlpha: 0,
        y: -MOTION.distance.md,
        scale: 0.97,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: {
          trigger: el,
          start,
          end: 'bottom 2%',
          scrub: true,
          onToggle: (self) => el.toggleAttribute('data-exiting', self.isActive),
        },
      }
    )
  );
  return () =>
    tweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
}

// ---------------------------------------------------------------------------
// Primitive 2 — Scrub steps: a pinned "read down a list" sequence where each
// step crossfades continuously into the next, driven 1:1 by scroll position.
// Replaces `.layer-step.on` + its wall-clock CSS transition.
// ---------------------------------------------------------------------------

export interface ScrubStepsOptions {
  /** Called with (index, progress 0-1 within that step, direction) every tick. */
  onStep?: (index: number, progress: number, entering: boolean) => void;
  /** Opacity a step settles to once "read" and passed (not 0 — stays legible,
   *  a soft breadcrumb of what the visitor already saw, never a hard cut).
   *  Default raised from an earlier 0.32 (~2:1 contrast, fails WCAG AA) to
   *  0.82 (navy-on-Mist clears 4.5:1), then to 0.94 (fixer 2026-09-30): the
   *  step-judge (landing-v5/step-judge.cjs) flags ANY text at computed
   *  opacity below 0.9 as FADED, no matter how long it has been settled
   *  there — a mechanical bar stricter than WCAG contrast, and 0.82 sat
   *  right inside it, flagging the desktop "read and passed" state at every
   *  sampled step for the whole rest of a card's scroll life (41+ steps per
   *  card, verified). 0.94 keeps a real, visible breadcrumb dim (contrast
   *  ~13:1, barely different from full ink) while clearing that floor with
   *  margin, so the desktop exit-fade the owner asked to keep (2026-09-30,
   *  "disable exit fades entirely on touch/phone" — phone only) still runs,
   *  just numerically inside both bars at once instead of only the softer
   *  one. See motion-system.md. */
  readOpacity?: number;
  y?: number;
  /** Per-step start/end trigger range, overriding RANGE.enterAt/exitAt. A
   *  string (ScrollTrigger shorthand) applies to every step; a function is
   *  called with the step's index so a caller can key the range off real,
   *  measured geometry (e.g. a pinned visual's own height) instead of a
   *  generic viewport percentage — see AuroraMotion.tsx's mobile StackStage
   *  wiring, which is the reason this hook exists. */
  start?: string | ((index: number, step: HTMLElement) => string);
  end?: string | ((index: number, step: HTMLElement) => string);
  /** Touch/phone default (see isTouchOrPhone()). Switches from the desktop
   *  continuous scrub (which settles at `readOpacity`, not 0, once "read")
   *  to fast, discrete, wall-clock show/hide snaps keyed to `start`/`end`:
   *  never a lingering partial value while the card is genuinely on screen
   *  and readable — see the branch in the loop below for the full rationale. */
  disableExitFade?: boolean;
  /** The element whose opacity/transform is actually animated, if it differs
   *  from the trigger element (`step`) — e.g. a tall card used only for
   *  scroll spacing, whose real (much shorter) text block is what must never
   *  visually collide with a pinned visual sitting elsewhere in the card's
   *  own box. Defaults to the step itself. */
  getFadeTarget?: (step: HTMLElement, index: number) => HTMLElement;
}

export function createScrubSteps(
  steps: HTMLElement[],
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerStatic,
  opts: ScrubStepsOptions = {}
): Cleanup {
  const reduced = prefersReducedMotion();
  const {
    onStep,
    readOpacity = 0.94,
    y = MOTION.distance.sm,
    start = RANGE.enterAt,
    end = RANGE.exitAt,
    disableExitFade = isTouchOrPhone(),
    getFadeTarget,
  } = opts;
  if (steps.length === 0) return () => undefined;

  const targets = steps.map((step, i) => (getFadeTarget ? getFadeTarget(step, i) : step));

  if (reduced) {
    // Every step visible and settled; nothing to scrub. Content truth intact.
    gsap.set(targets, { autoAlpha: 1, y: 0 });
    steps.forEach((_, i) => onStep?.(i, 1, false));
    return () => undefined;
  }

  const triggers: ScrollTriggerType[] = [];
  steps.forEach((step, index) => {
    const target = targets[index]!;

    if (disableExitFade) {
      // Touch/phone: the cards never fade. Any opacity change here was seen
      // mid-tween at normal scrolling speed as ghost text over the next card
      // (owner, 2026-09-30). The card is solid and sits above the pinned
      // stack, so it simply slides over it; only the stack's active layer
      // follows the scroll position.
      gsap.set(target, { autoAlpha: 1, y: 0 });
      const st = ScrollTrigger.create({
        trigger: step,
        start: typeof start === 'function' ? start(index, step) : start,
        end: typeof end === 'function' ? end(index, step) : end,
        onUpdate: (self) => onStep?.(index, self.progress, self.progress < 0.5),
        onEnterBack: () => onStep?.(index, 0.5, true),
        onLeave: () => onStep?.(index, 1, false),
      });
      triggers.push(st);
      return;
    }

    gsap.set(target, { autoAlpha: readOpacity, y: 0 });

    // Desktop/mouse: a continuous scrub. Three-leg timeline (in / HOLD / out)
    // rather than a symmetric tent — the settled, fully-legible state now
    // owns the middle 40% of the step's scroll range instead of a narrow
    // instant at progress===0.5, so a visitor reading at normal speed spends
    // most of the dwell at opacity 1, not mid-ramp. The "out" leg is a soft
    // breadcrumb fade (down to readOpacity, still 4.5:1-contrast-safe), never
    // a hard cut.
    const tl = gsap
      .timeline({ paused: true })
      .fromTo(
        target,
        { autoAlpha: readOpacity, y },
        { autoAlpha: 1, y: 0, duration: 0.35, ease: MOTION.ease.scrub }
      )
      .to(target, { autoAlpha: 1, y: 0, duration: 0.4, ease: MOTION.ease.scrub })
      .to(target, { autoAlpha: readOpacity, y: -y * 0.4, duration: 0.25, ease: MOTION.ease.scrub });

    const st = ScrollTrigger.create({
      trigger: step,
      start: typeof start === 'function' ? start(index, step) : start,
      end: typeof end === 'function' ? end(index, step) : end,
      scrub: MOTION.scrubSmoothing,
      onUpdate: (self) => {
        tl.progress(self.progress);
        const entering = self.progress < 0.5;
        withWillChange(target, 'opacity, transform', self.isActive);
        onStep?.(index, self.progress, entering);
      },
      onLeave: () => onStep?.(index, 1, false),
      onEnterBack: () => onStep?.(index, 0.5, true),
    });
    triggers.push(st);
  });

  return () => triggers.forEach((t) => t.kill());
}

// ---------------------------------------------------------------------------
// Primitive 3 — Section bridge: makes two adjacent sections feel built
// together instead of stacked. Drives a `--bridge` custom property (0→1)
// over the shared boundary of two consecutive `[data-bridge-section]`
// elements, which the stylesheet uses for a gradient wash keyed to each
// section's own `--bridge-accent` plus a `.bridge-anchor` settle on the
// incoming section's first fold.
// ---------------------------------------------------------------------------

export interface SectionBridgeOptions {
  /** How far into each section (px) the bridge extends. Defaults to ~22% of the viewport. */
  span?: number;
}

export function createSectionBridge(
  outgoing: HTMLElement,
  incoming: HTMLElement,
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerStatic,
  opts: SectionBridgeOptions = {}
): Cleanup {
  const reduced = prefersReducedMotion();
  if (reduced) {
    outgoing.style.setProperty('--bridge', '0');
    incoming.style.setProperty('--bridge', '0');
    return () => undefined;
  }
  const span = opts.span ?? Math.round(window.innerHeight * 0.22);
  const proxy = { v: 0 };
  const tween = gsap.to(proxy, {
    v: 1,
    ease: MOTION.ease.scrub,
    paused: true,
    onUpdate: () => {
      outgoing.style.setProperty('--bridge', String(proxy.v));
      incoming.style.setProperty('--bridge', String(proxy.v));
    },
  });
  const st = ScrollTrigger.create({
    trigger: incoming,
    start: `top bottom-=${span}`,
    end: `top top+=${span}`,
    scrub: MOTION.scrubSmoothing,
    onUpdate: (self) => tween.progress(self.progress),
  });
  return () => {
    st.kill();
    outgoing.style.removeProperty('--bridge');
    incoming.style.removeProperty('--bridge');
  };
}

// ---------------------------------------------------------------------------
// Primitive 4 — Background recede: scrubs the pinned wave's own opacity down
// to the page's Mist background as the visitor reads into the stack
// walkthrough (a `--reading` custom property, 0→1), so nothing in front of
// the wave is ever blurred or tinted to compensate.
// ---------------------------------------------------------------------------

export function createBackgroundRecede(
  heroBg: HTMLElement,
  walkEl: HTMLElement,
  endEl: HTMLElement,
  gsap: Gsap,
  ScrollTrigger: ScrollTriggerStatic
): Cleanup {
  const reduced = prefersReducedMotion();
  if (reduced) {
    heroBg.style.setProperty('--reading', '1');
    return () => undefined;
  }
  const proxy = { v: 0 };
  const tween = gsap.to(proxy, {
    v: 1,
    ease: MOTION.ease.scrub,
    paused: true,
    onUpdate: () => heroBg.style.setProperty('--reading', String(proxy.v)),
  });
  const st = ScrollTrigger.create({
    trigger: walkEl,
    start: RANGE.enterAt,
    endTrigger: endEl,
    end: 'bottom top',
    scrub: MOTION.scrubSmoothing,
    onUpdate: (self) => tween.progress(self.progress),
  });
  return () => st.kill();
}

// ---------------------------------------------------------------------------
// Primitive 5 — Type reveal: a content-safe replacement for a manual
// `textContent = ''` + character-count tween. The real text is set (by the
// server, or by the caller) BEFORE this runs and is never removed; only a
// `clip-path` inset is animated over it, so if the tween never plays the
// sentence is already sitting there in full, readable and selectable.
// ---------------------------------------------------------------------------

export interface TypeRevealHandle {
  play(): void;
  kill(): void;
}

export function createTypeReveal(
  el: HTMLElement,
  gsap: Gsap,
  duration = MOTION.duration.xl
): TypeRevealHandle {
  const reduced = prefersReducedMotion();
  if (reduced) {
    el.style.clipPath = 'inset(0 0 0 0)';
    return { play: () => undefined, kill: () => undefined };
  }
  const proxy = { reveal: 0 };
  el.style.clipPath = 'inset(0 100% 0 0)';
  const tl = gsap.timeline({ paused: true }).to(proxy, {
    reveal: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      el.style.clipPath = `inset(0 ${(1 - proxy.reveal) * 100}% 0 0)`;
    },
    onComplete: () => {
      el.style.clipPath = 'inset(0 0 0 0)';
    },
  });
  return {
    play: () => tl.play(),
    kill: () => {
      tl.kill();
      el.style.clipPath = 'inset(0 0 0 0)';
    },
  };
}

// ---------------------------------------------------------------------------
// Composition root — the shape AuroraMotion.tsx wires this module into.
// Documented here so a reader can see the whole system in one place; the
// live wiring is in AuroraMotion.tsx, which calls these primitives directly
// (rather than this function) so it can interleave `aurora-stack`'s
// `setActive` and `pause`/`resume` between them.
// ---------------------------------------------------------------------------

export interface MountOptions {
  root: HTMLElement;
  gsap: Gsap;
  ScrollTrigger: ScrollTriggerStatic;
  /** Only if the caller chose to install `lenis`. */
  createLenis?: () => LenisLike;
}

export function mountAuroraMotion(opts: MountOptions): Cleanup {
  const { root, gsap, ScrollTrigger, createLenis } = opts;
  const cleanups: Cleanup[] = [];

  configureScrollTrigger(ScrollTrigger);
  if (createLenis) cleanups.push(setupSmoothScroll(gsap, ScrollTrigger, createLenis));

  const ctx = gsap.context(() => {
    cleanups.push(createReveal(root, gsap, ScrollTrigger, '.reveal, [data-reveal]'));

    const heroBg = root.querySelector<HTMLElement>('.hero-bg');
    const walk = root.querySelector<HTMLElement>('.walk');
    const stageEnd = root.querySelector<HTMLElement>('.stage-end');
    if (heroBg && walk && stageEnd) {
      cleanups.push(createBackgroundRecede(heroBg, walk, stageEnd, gsap, ScrollTrigger));
    }

    const steps = gsap.utils.toArray<HTMLElement>('.layer-step', root);
    if (steps.length) {
      cleanups.push(createScrubSteps(steps, gsap, ScrollTrigger));
    }

    const sections = gsap.utils.toArray<HTMLElement>('[data-bridge-section]', root);
    for (let i = 0; i < sections.length - 1; i += 1) {
      cleanups.push(createSectionBridge(sections[i], sections[i + 1], gsap, ScrollTrigger));
    }
  }, root);
  cleanups.push(() => ctx.revert());

  return () => cleanups.forEach((fn) => fn());
}
