/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playScenes } from '../aurora-scenes';

/**
 * A GSAP stand-in that plays everything at once: tweens jump to their end values,
 * timeline callbacks run in order, and a scroll trigger fires as soon as it is made.
 */
function fakeGsap() {
  const tweens: Array<{ target: unknown; vars: Record<string, unknown> }> = [];
  const apply = (target: unknown, vars: Record<string, unknown>) => {
    tweens.push({ target, vars });
    if (
      target &&
      typeof target === 'object' &&
      !(target instanceof Element) &&
      !Array.isArray(target)
    ) {
      for (const [k, v] of Object.entries(vars))
        if (typeof v === 'number') (target as Record<string, number>)[k] = v;
    }
    (vars.onUpdate as (() => void) | undefined)?.();
    (vars.onComplete as (() => void) | undefined)?.();
  };
  const timeline = () => {
    const tl = {
      to: (t: unknown, v: Record<string, unknown>) => (apply(t, v), tl),
      fromTo: (t: unknown, _from: unknown, v: Record<string, unknown>) => (apply(t, v), tl),
      add: (fn: () => void) => (fn(), tl),
      play: vi.fn(),
    };
    return tl;
  };
  const reverts: Array<() => void> = [];
  const gsap = {
    set: vi.fn(),
    to: (t: unknown, v: Record<string, unknown>) => apply(t, v),
    fromTo: (t: unknown, _from: unknown, v: Record<string, unknown>) => apply(t, v),
    timeline,
    context: (fn: () => void) => {
      fn();
      const revert = vi.fn();
      reverts.push(revert);
      return { revert };
    },
  };
  const ScrollTrigger = { create: vi.fn((opts: { onEnter?: () => void }) => opts.onEnter?.()) };
  return { gsap, ScrollTrigger, tweens, reverts };
}

function page() {
  document.body.innerHTML = `
    <div id="root">
      <div class="app tilt">window</div>
      <div id="approval-scene">
        <h3 class="d-title">Follow up</h3>
        <div class="why" id="why-renewal">Renewal</div><div class="why">No reply</div>
        <div id="fsource">Source</div>
        <p id="typed">Hi Maya, ahead of your renewal</p>
        <button id="approve-btn">Approve</button>
        <span id="q1-state" class="state pending">Pending</span>
        <div id="toast">Approved by you</div>
        <svg id="cursor"></svg>
      </div>
      <div id="board-scene">
        <div data-stage="new"><div class="deal" id="mover"><span class="tag cold">No reply</span></div></div>
        <div data-stage="proposal"><div class="deal">Existing</div></div>
        <div id="nba">Next best action</div>
      </div>
    </div>`;
  return document.getElementById('root')!;
}

describe('playScenes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('acts out the approval: the draft types out and the item ends approved', () => {
    const root = page();
    const { gsap, ScrollTrigger } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, false);

    expect(document.getElementById('typed')!.textContent).toBe('Hi Maya, ahead of your renewal');
    expect(document.getElementById('q1-state')!.textContent).toBe('Approved');
    expect(document.getElementById('q1-state')!.className).toBe('state done');
    expect(document.getElementById('why-renewal')!.classList.contains('hover')).toBe(false);
    expect(document.getElementById('approve-btn')!.classList.contains('pressed')).toBe(false);
  });

  it('moves the stalled deal to Proposal once its recap is sent', () => {
    const root = page();
    const { gsap, ScrollTrigger } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, false);

    const mover = document.getElementById('mover')!;
    expect(mover.parentElement!.dataset.stage).toBe('proposal');
    expect(mover.parentElement!.firstElementChild).toBe(mover);
    expect(mover.querySelector('.tag')!.className).toBe('tag sent');
    expect(mover.textContent).toContain('Pricing recap sent');
    expect(mover.classList.contains('moving')).toBe(false);
  });

  it('settles tilted windows as they scroll in', () => {
    const root = page();
    const { gsap, ScrollTrigger, tweens } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, false);

    const tilt = tweens.find((t) => t.target === root.querySelector('.app.tilt'));
    expect(tilt?.vars).toMatchObject({ rotateX: 0, rotateY: 0, rotateZ: 0 });
  });

  it('shows every scene at its end state, without motion, when motion is reduced', () => {
    const root = page();
    const { gsap, ScrollTrigger } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, true);

    expect(document.getElementById('q1-state')!.textContent).toBe('Approved');
    expect((root.querySelector('.app.tilt') as HTMLElement).style.transform).toBe('none');
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
    expect(document.getElementById('mover')!.parentElement!.dataset.stage).toBe('new');
  });

  it('does nothing for a scene whose markup is missing', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { gsap, ScrollTrigger } = fakeGsap();
    expect(() =>
      playScenes(document.getElementById('root')!, gsap as never, ScrollTrigger as never, false)
    ).not.toThrow();
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  it('reverts everything it made on cleanup', () => {
    const root = page();
    const { gsap, ScrollTrigger, reverts } = fakeGsap();
    const cleanup = playScenes(root, gsap as never, ScrollTrigger as never, false);
    cleanup();
    expect(reverts[0]).toHaveBeenCalled();
  });
});
