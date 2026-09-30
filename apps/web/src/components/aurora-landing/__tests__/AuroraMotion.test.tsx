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
vi.mock('gsap', () => ({ gsap: { registerPlugin: vi.fn() } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: scrollTrigger }));
const stopScenes = vi.fn();
const playScenes = vi.fn((..._args: unknown[]) => stopScenes);
vi.mock('../aurora-scenes', () => ({ playScenes: (...a: unknown[]) => playScenes(...a) }));
const stack = { setActive: vi.fn(), dispose: vi.fn() };
const createStack = vi.fn((..._args: unknown[]) => stack);
vi.mock('../aurora-stack', () => ({ createStack: (...a: unknown[]) => createStack(...a) }));

import { AuroraMotion, BOOT_TIMEOUT_MS } from '../AuroraMotion';

function mountPage(withStack = true) {
  document.body.innerHTML = `
    <div id="aurora-page" class="aurora-page boot" style="--font-manrope: 'Manrope Test'">
      <header class="nav"><details class="nav-menu" open><nav><a href="#pricing">Pricing</a><span>label</span></nav></details></header>
      <section class="stage">
        <div class="hero-bg"></div>
        <div class="hero">Hero</div>
        <div class="walk">Walk</div>
        <article class="layer-step" data-layer="agents"></article>
        <article class="layer-step" data-layer="control"></article>
        <div class="stage-end"></div>
        ${withStack ? '<canvas id="stack"></canvas>' : ''}
      </section>
      <p class="reveal">Reveal me</p>
    </div>`;
  return document.getElementById('aurora-page')!;
}

const observed: Element[] = [];
beforeEach(() => {
  triggers.length = 0;
  observed.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private cb: (e: Array<{ isIntersecting: boolean; target: Element }>) => void) {}
      observe(el: Element) {
        observed.push(el);
        this.cb([{ isIntersecting: true, target: el }]);
      }
      unobserve() {}
      disconnect() {}
    }
  );
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
  });

  it('points the stack at the layer being read, and back to rest around it', async () => {
    const root = mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());

    const step = root.querySelector('[data-layer=control]')!;
    const forStep = triggers.find((t) => t.trigger === step)!;
    forStep.onToggle!({ isActive: true });
    expect(stack.setActive).toHaveBeenLastCalledWith('control');
    expect(step.classList.contains('on')).toBe(true);
    forStep.onToggle!({ isActive: false });
    expect(step.classList.contains('on')).toBe(false);

    triggers.find((t) => t.trigger === root.querySelector('.hero'))!.onToggle!({ isActive: true });
    expect(stack.setActive).toHaveBeenLastCalledWith(null);
    const end = triggers.find((t) => t.trigger === root.querySelector('.stage-end'))!;
    end.onLeaveBack!();
    expect(stack.setActive).toHaveBeenLastCalledWith('foundation');
    end.onEnter!();
    expect(stack.setActive).toHaveBeenLastCalledWith(null);
  });

  it('softens the waves while the stack is read and fills the nav once the page moves', async () => {
    const root = mountPage();
    render(<AuroraMotion />);
    await waitFor(() => expect(createStack).toHaveBeenCalled());

    triggers.find((t) => t.trigger === root.querySelector('.walk'))!.onToggle!({ isActive: true });
    expect(root.querySelector('.hero-bg')!.classList.contains('reading')).toBe(true);
    const nav = triggers.find((t) => t.onUpdate)!;
    nav.onUpdate!({ scroll: () => 200 });
    expect(root.querySelector('.nav')!.classList.contains('scrolled')).toBe(true);
    expect(root.querySelector('.reveal')!.classList.contains('revealed')).toBe(true);
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
    expect(triggers.some((t) => t.trigger?.classList.contains('layer-step'))).toBe(false);
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

  it('shows reveals at once when motion is reduced', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    const root = mountPage();
    render(<AuroraMotion />);
    expect(root.querySelector('.reveal')!.classList.contains('revealed')).toBe(true);
    expect(observed).toHaveLength(0);
    await waitFor(() =>
      expect(createStack).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reducedMotion: true })
      )
    );
  });

  it('does nothing outside the Aurora page', () => {
    document.body.innerHTML = '';
    expect(() => render(<AuroraMotion />)).not.toThrow();
  });
});
