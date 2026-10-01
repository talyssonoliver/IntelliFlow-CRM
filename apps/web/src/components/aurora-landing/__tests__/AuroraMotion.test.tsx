/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

type Trigger = {
  trigger?: Element;
  onToggle?: (self: { isActive: boolean }) => void;
  onUpdate?: (self: { scroll: () => number }) => void;
  onEnter?: () => void;
  onLeave?: () => void;
  onLeaveBack?: () => void;
  kill: () => void;
};
const triggers: Trigger[] = [];
const scrollTrigger = {
  create: vi.fn((opts: Omit<Trigger, 'kill'>) => {
    const t = { ...opts, kill: vi.fn() };
    triggers.push(t);
    return t;
  }),
};
vi.mock('gsap', () => ({
  gsap: {
    registerPlugin: vi.fn(),
    utils: {
      toArray: (selector: string, root: ParentNode = document) =>
        Array.from((root as ParentNode).querySelectorAll(selector)),
    },
  },
}));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: scrollTrigger }));

const stopScenes = vi.fn();
const playScenes = vi.fn((..._args: unknown[]) => stopScenes);
vi.mock('../aurora-scenes', () => ({ playScenes: (...a: unknown[]) => playScenes(...a) }));

const stack = {
  setActive: vi.fn(),
  setPresentation: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};
const createStack = vi.fn((..._args: unknown[]) => stack);
vi.mock('../aurora-stack', () => ({ createStack: (...a: unknown[]) => createStack(...a) }));

// The motion-system primitives are the unit under test in
// aurora-motion-system.test.ts; here AuroraMotion is only responsible for
// wiring them onto the right elements with the right arguments, so each is a
// spy returning its own cleanup function.
const configureScrollTrigger = vi.fn();
const hasFinePointer = vi.fn(() => false);
const setupSmoothScroll = vi.fn((..._args: unknown[]) => vi.fn());
const revealCleanup = vi.fn();
const createReveal = vi.fn((..._args: unknown[]) => revealCleanup);
const exitCleanup = vi.fn();
const createExitDrift = vi.fn((..._args: unknown[]) => exitCleanup);
const bridgeCleanup = vi.fn();
const createSectionBridge = vi.fn((..._args: unknown[]) => bridgeCleanup);
const recedeCleanup = vi.fn();
const createBackgroundRecede = vi.fn((..._args: unknown[]) => recedeCleanup);
type OnStep = (index: number, progress: number, entering: boolean) => void;
let lastOnStep: OnStep | undefined;
const scrubCleanup = vi.fn();
const createScrubSteps = vi.fn(
  (_steps: HTMLElement[], _gsap: unknown, _st: unknown, opts?: { onStep?: OnStep }) => {
    lastOnStep = opts?.onStep;
    return scrubCleanup;
  }
);
vi.mock('../aurora-motion-system', () => ({
  configureScrollTrigger: (...a: unknown[]) => configureScrollTrigger(...a),
  hasFinePointer: () => hasFinePointer(),
  setupSmoothScroll: (...a: unknown[]) => setupSmoothScroll(...a),
  createReveal: (...a: unknown[]) => createReveal(...a),
  createExitDrift: (...a: unknown[]) => createExitDrift(...a),
  createSectionBridge: (...a: unknown[]) => createSectionBridge(...a),
  createBackgroundRecede: (...a: unknown[]) => createBackgroundRecede(...a),
  createScrubSteps: (...a: unknown[]) => (createScrubSteps as (...a: unknown[]) => unknown)(...a),
  MOTION: {
    stagger: { normal: 0.08 },
    duration: { xs: 0.22, sm: 0.42, md: 0.62, lg: 0.9, xl: 1.4 },
  },
  // RANGE and MOBILE_QUERY are real constants (not spies) AuroraMotion reads
  // directly to compute the mobile StackStage scrub range — see AuroraMotion.tsx.
  RANGE: { enterAt: 'top 88%', settledAt: 'top 55%', exitAt: 'top 12%', goneAt: 'top -10%' },
  MOBILE_QUERY: '(max-width: 960px)',
}));

const lenisInstance = { on: vi.fn(), raf: vi.fn(), destroy: vi.fn() };
const LenisCtor = vi.fn();
vi.mock('lenis', () => ({
  default: class {
    constructor(...args: unknown[]) {
      LenisCtor(...args);
      return lenisInstance;
    }
  },
}));

import { AuroraMotion, BOOT_TIMEOUT_MS } from '../AuroraMotion';

function mountPage(withStack = true) {
  document.body.innerHTML = `
    <div id="aurora-page" class="aurora-page boot" style="--font-manrope: 'Manrope Test'">
      <header class="nav"><details class="nav-menu" open><nav><a href="#pricing">Pricing</a><span>label</span></nav></details></header>
      <section class="stage" data-bridge-section>
        <div class="hero-bg"></div>
        <div class="hero">Hero</div>
        <div class="walk">Walk</div>
        <article class="layer-step" data-layer="agents"></article>
        <article class="layer-step" data-layer="control"></article>
        <div class="stage-end"></div>
        ${withStack ? '<canvas id="stack"></canvas>' : ''}
      </section>
      <section class="proof" data-bridge-section></section>
      <p class="reveal">Reveal me</p>
    </div>`;
  return document.getElementById('aurora-page')!;
}

beforeEach(() => {
  triggers.length = 0;
  lastOnStep = undefined;
  vi.clearAllMocks();
  hasFinePointer.mockReturnValue(false);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: vi.fn(() => Promise.resolve([])) },
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AuroraMotion', () => {
  it('builds the stack with the page fonts, then shows the first screen in one move', async () => {
    const root = mountPage();
    render(<AuroraMotion />);

    await waitFor(() => expect(root.classList.contains('boot')).toBe(false));
    expect(createStack).toHaveBeenCalledWith(root.querySelector('#stack'), {
      fonts: { text: "'Manrope Test'", icons: "'Material Symbols Outlined'" },
      reducedMotion: false,
    });
    expect(document.fonts.load).toHaveBeenCalledWith(expect.stringContaining("'Manrope Test'"));
    expect(playScenes).toHaveBeenCalledWith(root, expect.anything(), scrollTrigger, false);
    expect(configureScrollTrigger).toHaveBeenCalledWith(scrollTrigger);
  });

  it('wires the reveal, section-bridge and background-recede primitives onto the right elements', async () => {
    const root = mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());

    expect(createReveal).toHaveBeenCalledWith(
      root,
      expect.anything(),
      scrollTrigger,
      '.reveal, [data-reveal]',
      expect.objectContaining({ duration: 0.22, stagger: 0 })
    );
    const [stageSection, proofSection] = [
      root.querySelector('.stage')!,
      root.querySelector('.proof')!,
    ];
    expect(createSectionBridge).toHaveBeenCalledWith(
      stageSection,
      proofSection,
      expect.anything(),
      scrollTrigger
    );
    expect(createBackgroundRecede).toHaveBeenCalledWith(
      root.querySelector('.hero-bg'),
      root.querySelector('.walk'),
      root.querySelector('.stage-end'),
      expect.anything(),
      scrollTrigger
    );
  });

  it('keeps the layer being read on top, and returns to rest only at the hero and the stage end', async () => {
    mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createScrubSteps).toHaveBeenCalled());
    const steps = createScrubSteps.mock.calls[0]![0] as HTMLElement[];
    expect(steps.map((s) => s.dataset.layer)).toEqual(['agents', 'control']);

    lastOnStep!(1, 0.3, true);
    expect(stack.setActive).toHaveBeenLastCalledWith('control');
    // Past the middle of its range the same layer stays on top: no flash of the rest state between cards.
    lastOnStep!(1, 0.7, false);
    expect(stack.setActive).toHaveBeenLastCalledWith('control');
    const calls = stack.setActive.mock.calls.length;
    lastOnStep!(1, 1, false);
    lastOnStep!(0, 0, true);
    expect(stack.setActive.mock.calls.length).toBe(calls);

    const root = document.getElementById('aurora-page')!;
    triggers.find((t) => t.trigger === root.querySelector('.hero'))!.onToggle!({ isActive: true });
    expect(stack.setActive).toHaveBeenLastCalledWith(null);
    const end = triggers.find((t) => t.trigger === root.querySelector('.stage-end'))!;
    end.onLeaveBack!();
    expect(stack.setActive).toHaveBeenLastCalledWith('foundation');
    end.onEnter!();
    expect(stack.setActive).toHaveBeenLastCalledWith(null);
  });

  it('pauses the stack render loop off-screen and in a hidden tab', async () => {
    let ioCallback: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    class FakeIO {
      constructor(cb: typeof ioCallback) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());

    ioCallback([{ isIntersecting: false }]);
    expect(stack.pause).toHaveBeenCalled();
    ioCallback([{ isIntersecting: true }]);
    expect(stack.resume).toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stack.pause).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stack.resume).toHaveBeenCalledTimes(2);

    // Back in the tab while scrolled past the stack: the loop stays stopped.
    ioCallback([{ isIntersecting: false }]);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stack.resume).toHaveBeenCalledTimes(2);
  });

  it('fills the nav once the page moves', async () => {
    const root = mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());

    const nav = triggers.find((t) => t.onUpdate)!;
    nav.onUpdate!({ scroll: () => 200 });
    expect(root.querySelector('.nav')!.classList.contains('scrolled')).toBe(true);
  });

  it('adds smooth scroll on a fine pointer, outside reduced motion, and never on touch', async () => {
    hasFinePointer.mockReturnValue(true);
    mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(setupSmoothScroll).toHaveBeenCalled());
    const createLenis = setupSmoothScroll.mock.calls[0]![2] as () => unknown;
    createLenis();
    expect(LenisCtor).toHaveBeenCalledWith({ anchors: true });
  });

  it('never installs smooth scroll on a coarse (touch) pointer', async () => {
    hasFinePointer.mockReturnValue(false);
    mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());
    expect(setupSmoothScroll).not.toHaveBeenCalled();
    expect(LenisCtor).not.toHaveBeenCalled();
  });

  it('closes the phone menu once one of its links is followed', async () => {
    const root = mountPage();
    render(<AuroraMotion />);
    const menu = root.querySelector('details')!;

    root.querySelector('.nav-menu span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.hasAttribute('open')).toBe(true);
    root.querySelector('.nav-menu a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.hasAttribute('open')).toBe(false);
  });

  it('tears everything down on unmount', async () => {
    mountPage();
    const { unmount } = render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());
    unmount();

    expect(stack.dispose).toHaveBeenCalled();
    expect(stopScenes).toHaveBeenCalled();
    expect(revealCleanup).toHaveBeenCalled();
    expect(bridgeCleanup).toHaveBeenCalled();
    expect(recedeCleanup).toHaveBeenCalled();
    expect(scrubCleanup).toHaveBeenCalled();
    expect(
      triggers.every((t) => (t.kill as ReturnType<typeof vi.fn>).mock.calls.length === 1)
    ).toBe(true);
  });

  it('still shows the page, and says why, when WebGL is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createStack.mockImplementationOnce(() => {
      throw new Error('no webgl');
    });
    const root = mountPage();
    render(<AuroraMotion />);

    await waitFor(() => expect(root.classList.contains('boot')).toBe(false));
    expect(warn).toHaveBeenCalledWith('[aurora] stack unavailable', expect.any(Error));
    expect(createScrubSteps).not.toHaveBeenCalled();
  });

  it('shows the page when the motion code fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    playScenes.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const root = mountPage();
    render(<AuroraMotion />);

    await waitFor(() => expect(root.classList.contains('boot')).toBe(false));
    expect(warn).toHaveBeenCalledWith('[aurora] motion unavailable', expect.any(Error));
  });

  it('shows the page without a stack canvas', async () => {
    const root = mountPage(false);
    render(<AuroraMotion />);
    await waitFor(() => expect(root.classList.contains('boot')).toBe(false));
    expect(createStack).not.toHaveBeenCalled();
  });

  it('never keeps the first screen hidden longer than the boot timeout', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: () => new Promise(() => {}) },
    });
    const root = mountPage();
    render(<AuroraMotion />);
    expect(root.classList.contains('boot')).toBe(true);
    vi.advanceTimersByTime(BOOT_TIMEOUT_MS);
    expect(root.classList.contains('boot')).toBe(false);
  });

  it('passes reduced motion through to the stack, the scenes and the reveal primitive', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    hasFinePointer.mockReturnValue(true);
    const root = mountPage();
    render(<AuroraMotion />);
    await waitFor(() =>
      expect(createStack).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reducedMotion: true })
      )
    );
    expect(playScenes).toHaveBeenCalledWith(root, expect.anything(), scrollTrigger, true);
    // Reduced motion never installs smooth scroll, even on a fine pointer.
    expect(setupSmoothScroll).not.toHaveBeenCalled();
  });

  it('does nothing outside the Aurora page', () => {
    document.body.innerHTML = '';
    expect(() => render(<AuroraMotion />)).not.toThrow();
  });

  it("on a phone, lifts each card's layer out to face the reader, then dissolves it as the next card arrives", async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(max-width: 960px)', media: q }));
    vi.stubGlobal('innerHeight', 1000);
    const root = mountPage();
    const walk = root.querySelector<HTMLElement>('.walk')!;
    const copy = document.createElement('div');
    copy.className = 'stage-copy';
    walk.before(copy);
    copy.append(walk, ...root.querySelectorAll('.layer-step'));
    const [agents, control] = [...root.querySelectorAll<HTMLElement>('.layer-step')];
    const place = (el: HTMLElement, top: number) =>
      (el.getBoundingClientRect = () => ({ top }) as DOMRect);
    render(<AuroraMotion />);
    await waitFor(() => expect(triggers.some((t) => t.trigger === copy)).toBe(true));
    const story = triggers.find((t) => t.trigger === copy)!;
    expect(createScrubSteps).not.toHaveBeenCalled();
    const last = () => stack.setPresentation.mock.lastCall![0];

    // The first card is still below the screen: every layer rests in the stack.
    place(agents!, 1200);
    place(control!, 2000);
    story.onUpdate!({ scroll: () => 0 });
    expect(last().agents).toEqual({ present: 0, dissolve: 0 });

    // Its card at 70% of the screen: the layer is fully out, facing the reader.
    place(agents!, 700);
    story.onUpdate!({ scroll: () => 0 });
    expect(last().agents.present).toBeCloseTo(1);
    expect(last().agents.dissolve).toBe(0);

    // The next card fills the bottom fifth: the layer has dissolved, the next one is rising.
    place(agents!, -400);
    place(control!, 800);
    story.onUpdate!({ scroll: () => 0 });
    expect(last().agents.dissolve).toBeCloseTo(1);
    expect(last().control.present).toBeCloseTo(2 / 3);

    story.onLeave!();
    expect(stack.setPresentation).toHaveBeenLastCalledWith(null);

    // Scrolling back up past the stage end never hides the stack on a phone.
    triggers.find((t) => t.trigger === root.querySelector('.stage-end'))!.onLeaveBack!();
    expect(stack.setActive).toHaveBeenLastCalledWith(null);
  });

  it('clears the stack only when the pinned frame is about to unstick, measuring the sticky frame on desktop', async () => {
    const root = mountPage();
    const object = document.createElement('div');
    object.className = 'stage-object stack-visual';
    object.style.cssText = 'position: relative; top: 0px; height: 6000px';
    const frame = document.createElement('div');
    frame.className = 'object-sticky';
    frame.style.cssText = 'position: sticky; top: 72px; height: 828px';
    object.append(frame);
    root.querySelector('.stage')!.append(object);
    render(<AuroraMotion />);
    const end = root.querySelector('.stage-end')!;
    await waitFor(() =>
      expect(scrollTrigger.create).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: end, start: 'bottom top+=900' })
      )
    );
    const clear = triggers.find(
      (t) => t.trigger === end && (t as { start?: string }).start === 'bottom top+=900'
    )!;
    clear.onEnter!();
    expect(stack.hide).toHaveBeenCalled();
    clear.onLeaveBack!();
    expect(stack.show).toHaveBeenCalled();
  });
});
