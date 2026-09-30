/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MOTION,
  RANGE,
  prefersReducedMotion,
  hasFinePointer,
  withWillChange,
  configureScrollTrigger,
  setupSmoothScroll,
  createReveal,
  createScrubSteps,
  createSectionBridge,
  createBackgroundRecede,
  createTypeReveal,
} from '../aurora-motion-system';

// A small, faithful-enough fake of the slice of gsap/ScrollTrigger these
// primitives call, so each is exercised end to end rather than only having
// its call arguments inspected (see AuroraMotion.test.tsx for the wiring
// tests, which mock this module instead).
type Trigger = {
  trigger?: Element;
  start?: string;
  end?: string;
  endTrigger?: Element;
  scrub?: number;
  onEnter?: () => void;
  onLeaveBack?: () => void;
  onUpdate?: (self: { progress: number; isActive: boolean }) => void;
  onLeave?: () => void;
  onEnterBack?: () => void;
  kill: ReturnType<typeof vi.fn>;
};

function makeScrollTrigger() {
  const created: Trigger[] = [];
  const ScrollTrigger = {
    create: vi.fn((opts: Omit<Trigger, 'kill'>) => {
      const t: Trigger = { ...opts, kill: vi.fn() };
      created.push(t);
      return t;
    }),
    config: vi.fn(),
    defaults: vi.fn(),
  };
  return { ScrollTrigger, created };
}

function makeGsap() {
  type Tween = {
    vars: Record<string, unknown>;
    target: unknown;
    play: ReturnType<typeof vi.fn>;
    reverse: ReturnType<typeof vi.fn>;
    progress: ReturnType<typeof vi.fn>;
  };
  const tweens: Tween[] = [];
  const applyVars = (target: unknown, vars: Record<string, unknown>) => {
    if (target && typeof target === 'object' && 'style' in (target as object)) {
      const style = (target as HTMLElement).style;
      if ('autoAlpha' in vars) style.opacity = String(vars.autoAlpha);
      if ('y' in vars) style.transform = `translateY(${vars.y}px)`;
    }
  };
  const makeTween = (target: unknown, vars: Record<string, unknown>): Tween => {
    const tween: Tween = {
      vars,
      target,
      play: vi.fn(() => {
        (vars.onStart as (() => void) | undefined)?.();
        applyVars(target, vars);
        (vars.onComplete as (() => void) | undefined)?.();
      }),
      reverse: vi.fn(() => {
        (vars.onReverseComplete as (() => void) | undefined)?.();
      }),
      progress: vi.fn((p: number) => {
        applyVars(target, { ...vars, autoAlpha: vars.autoAlpha });
        void p;
      }),
    };
    tweens.push(tween);
    return tween;
  };
  const gsap = {
    utils: {
      toArray: <T extends Element>(selector: string, root: ParentNode = document) =>
        Array.from((root as ParentNode).querySelectorAll(selector)) as unknown as T[],
    },
    set: vi.fn((targets: unknown, vars: Record<string, unknown>) => {
      const arr = Array.isArray(targets) ? targets : [targets];
      arr.forEach((t) => applyVars(t, vars));
    }),
    to: vi.fn((target: unknown, vars: Record<string, unknown>) => makeTween(target, vars)),
    timeline: vi.fn((_opts?: Record<string, unknown>) => {
      const self = {
        fromTo: vi.fn(() => self),
        to: vi.fn(() => self),
        progress: vi.fn(() => self),
        play: vi.fn(() => self),
        kill: vi.fn(() => self),
      };
      return self;
    }),
    ticker: { add: vi.fn(), remove: vi.fn(), lagSmoothing: vi.fn() },
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert: vi.fn() };
    }),
  };
  return { gsap, tweens };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tokens', () => {
  it('exposes one shared duration/ease/distance/stagger set', () => {
    expect(MOTION.duration.md).toBeGreaterThan(MOTION.duration.sm);
    expect(MOTION.ease.exit).not.toBe(MOTION.ease.enter);
    expect(RANGE.enterAt).toBe('top 88%');
  });
});

describe('environment', () => {
  it('reads prefers-reduced-motion and pointer: fine from matchMedia', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    expect(prefersReducedMotion()).toBe(true);
    expect(hasFinePointer()).toBe(false);
  });
});

describe('withWillChange', () => {
  it('sets will-change only while active, and clears it on leave', () => {
    const el = document.createElement('div');
    withWillChange(el, 'opacity, transform', true);
    expect(el.style.willChange).toBe('opacity, transform');
    withWillChange(el, '', false);
    expect(el.style.willChange).toBe('');
  });
});

describe('configureScrollTrigger', () => {
  it('sets ignoreMobileResize and a reversible default toggleActions', () => {
    const { ScrollTrigger } = makeScrollTrigger();
    configureScrollTrigger(ScrollTrigger as never);
    expect(ScrollTrigger.config).toHaveBeenCalledWith({ ignoreMobileResize: true });
    expect(ScrollTrigger.defaults).toHaveBeenCalledWith({
      toggleActions: 'play none none reverse',
    });
  });
});

describe('setupSmoothScroll', () => {
  it('never installs Lenis under reduced motion or on a coarse pointer', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    const createLenis = vi.fn();
    setupSmoothScroll(gsap as never, ScrollTrigger as never, createLenis);
    expect(createLenis).not.toHaveBeenCalled();
  });

  it('wires Lenis to the gsap ticker and ScrollTrigger.update on a fine pointer', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer'), media: q }));
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    const lenis = { raf: vi.fn(), on: vi.fn(), destroy: vi.fn() };
    const createLenis = vi.fn(() => lenis);
    const cleanup = setupSmoothScroll(gsap as never, ScrollTrigger as never, createLenis);
    expect(lenis.on).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(gsap.ticker.add).toHaveBeenCalled();
    expect(gsap.ticker.lagSmoothing).toHaveBeenCalledWith(0);

    cleanup();
    expect(gsap.ticker.remove).toHaveBeenCalled();
    // The ticker is global: leaving the page puts GSAP's default lag smoothing back.
    expect(gsap.ticker.lagSmoothing).toHaveBeenLastCalledWith(500, 33);
    expect(lenis.destroy).toHaveBeenCalled();
  });
});

describe('createReveal', () => {
  it('does nothing for an empty selector', () => {
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    const cleanup = createReveal(document, gsap as never, ScrollTrigger as never, '.nope');
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('reduced motion: settles every element visible with no trigger created', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    document.body.innerHTML = '<p class="reveal">a</p>';
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    createReveal(document, gsap as never, ScrollTrigger as never);
    expect(gsap.set).toHaveBeenCalledWith(
      expect.arrayContaining([document.querySelector('.reveal')]),
      expect.objectContaining({ autoAlpha: 1, y: 0 })
    );
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  it('plays forward on enter and reverses on leaving back — enter AND exit', () => {
    document.body.innerHTML = '<p class="reveal">a</p>';
    const { gsap } = makeGsap();
    const { ScrollTrigger, created } = makeScrollTrigger();
    const cleanup = createReveal(document, gsap as never, ScrollTrigger as never);
    expect(created).toHaveLength(1);
    expect(created[0]!.start).toBe(RANGE.enterAt);

    created[0]!.onEnter!();
    const tween = gsap.to.mock.results[0]!.value as { play: ReturnType<typeof vi.fn> };
    expect(tween.play).toHaveBeenCalled();

    created[0]!.onLeaveBack!();
    const reverseTween = gsap.to.mock.results[0]!.value as { reverse: ReturnType<typeof vi.fn> };
    expect(reverseTween.reverse).toHaveBeenCalled();

    cleanup();
    expect(created[0]!.kill).toHaveBeenCalled();
  });
});

describe('createScrubSteps', () => {
  it('does nothing for an empty step list', () => {
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    const cleanup = createScrubSteps([], gsap as never, ScrollTrigger as never);
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('reduced motion: every step settles visible and onStep still fires once each', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    const steps = [document.createElement('div'), document.createElement('div')];
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    const onStep = vi.fn();
    createScrubSteps(steps, gsap as never, ScrollTrigger as never, { onStep });
    expect(gsap.set).toHaveBeenCalledWith(steps, { autoAlpha: 1, y: 0 });
    expect(onStep).toHaveBeenCalledWith(0, 1, false);
    expect(onStep).toHaveBeenCalledWith(1, 1, false);
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  it('scrubs continuously from scroll progress, one trigger per step, and settles to readOpacity', () => {
    const steps = [document.createElement('div')];
    const { gsap } = makeGsap();
    const { ScrollTrigger, created } = makeScrollTrigger();
    const onStep = vi.fn();
    createScrubSteps(steps, gsap as never, ScrollTrigger as never, {
      onStep,
      readOpacity: 0.32,
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.scrub).toBe(MOTION.scrubSmoothing);
    expect(gsap.set).toHaveBeenCalledWith(steps[0], { autoAlpha: 0.32, y: 0 });

    created[0]!.onUpdate!({ progress: 0.2, isActive: true });
    expect(onStep).toHaveBeenCalledWith(0, 0.2, true);
    created[0]!.onUpdate!({ progress: 0.8, isActive: true });
    expect(onStep).toHaveBeenCalledWith(0, 0.8, false);
    created[0]!.onLeave!();
    expect(onStep).toHaveBeenCalledWith(0, 1, false);
    created[0]!.onEnterBack!();
    expect(onStep).toHaveBeenCalledWith(0, 0.5, true);
  });
});

describe('createSectionBridge', () => {
  it('reduced motion: sets --bridge to 0 on both elements with no trigger', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    const outgoing = document.createElement('section');
    const incoming = document.createElement('section');
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    createSectionBridge(outgoing, incoming, gsap as never, ScrollTrigger as never);
    expect(outgoing.style.getPropertyValue('--bridge')).toBe('0');
    expect(incoming.style.getPropertyValue('--bridge')).toBe('0');
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  it('drives --bridge on both sections from the incoming section crossing the boundary', () => {
    const outgoing = document.createElement('section');
    const incoming = document.createElement('section');
    const { gsap } = makeGsap();
    const { ScrollTrigger, created } = makeScrollTrigger();
    const cleanup = createSectionBridge(outgoing, incoming, gsap as never, ScrollTrigger as never);
    expect(created).toHaveLength(1);
    expect(created[0]!.trigger).toBe(incoming);

    created[0]!.onUpdate!({ progress: 0.5, isActive: true });
    const tween = gsap.to.mock.results.at(-1)!.value as {
      progress: ReturnType<typeof vi.fn>;
    };
    expect(tween.progress).toHaveBeenCalledWith(0.5);

    cleanup();
    expect(created[0]!.kill).toHaveBeenCalled();
    expect(outgoing.style.getPropertyValue('--bridge')).toBe('');
    expect(incoming.style.getPropertyValue('--bridge')).toBe('');
  });
});

describe('createBackgroundRecede', () => {
  it('reduced motion: sets --reading to 1 immediately, with no trigger', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    const heroBg = document.createElement('div');
    const walk = document.createElement('div');
    const end = document.createElement('div');
    const { gsap } = makeGsap();
    const { ScrollTrigger } = makeScrollTrigger();
    createBackgroundRecede(heroBg, walk, end, gsap as never, ScrollTrigger as never);
    expect(heroBg.style.getPropertyValue('--reading')).toBe('1');
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  it('scrubs --reading on the wave from the walk to the stage end', () => {
    const heroBg = document.createElement('div');
    const walk = document.createElement('div');
    const end = document.createElement('div');
    const { gsap } = makeGsap();
    const { ScrollTrigger, created } = makeScrollTrigger();
    createBackgroundRecede(heroBg, walk, end, gsap as never, ScrollTrigger as never);
    expect(created[0]!.trigger).toBe(walk);
    expect(created[0]!.endTrigger).toBe(end);

    created[0]!.onUpdate!({ progress: 0.75, isActive: true });
    const tween = gsap.to.mock.results.at(-1)!.value as {
      progress: ReturnType<typeof vi.fn>;
    };
    expect(tween.progress).toHaveBeenCalledWith(0.75);
  });
});

describe('createTypeReveal', () => {
  it('reduced motion: opens the clip-path immediately, no timeline', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    const el = document.createElement('span');
    const { gsap } = makeGsap();
    createTypeReveal(el, gsap as never);
    expect(el.style.clipPath).toBe('inset(0 0 0 0)');
  });

  it('starts fully clipped and never removes the underlying text', () => {
    const el = document.createElement('span');
    el.textContent = 'Hi Maya, ahead of your renewal on the 14th…';
    const { gsap } = makeGsap();
    const handle = createTypeReveal(el, gsap as never);
    expect(el.style.clipPath).toBe('inset(0 100% 0 0)');
    expect(el.textContent).toContain('Hi Maya');
    handle.kill();
    expect(el.style.clipPath).toBe('inset(0 0 0 0)');
    expect(el.textContent).toContain('Hi Maya');
  });
});
