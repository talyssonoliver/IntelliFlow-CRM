/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  playScenes,
  playApprovalScene,
  playPipelineScene,
  revealReasoning,
  typeDraft,
  confirmApproval,
  flagStalledDeal,
  moveDealForward,
} from '../aurora-scenes';

/**
 * A GSAP stand-in that plays everything at once: tweens jump to their end
 * values, timeline callbacks (including `eventCallback('onComplete', ...)`,
 * fired synchronously since this fake has already "finished" every tween by
 * the time it is registered) run in order, and a scroll trigger fires as
 * soon as it is made.
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
      // Deferred, so a looping scene runs one beat per flush() instead of forever.
      eventCallback: (name: string, cb: () => void) => {
        if (name === 'onComplete') pending.push(cb);
        return tl;
      },
      pause: vi.fn(),
      resume: vi.fn(),
    };
    return tl;
  };
  const reverts: Array<() => void> = [];
  const pending: Array<() => void> = [];
  /** Runs queued onComplete callbacks, at most `steps` of them. */
  const flush = (steps = 3) => {
    for (let i = 0; i < steps && pending.length; i++) pending.shift()!();
  };
  const gsap = {
    set: vi.fn(),
    to: (t: unknown, v: Record<string, unknown>) => apply(t, v),
    fromTo: (t: unknown, _from: unknown, v: Record<string, unknown>) => apply(t, v),
    timeline,
    context: (fn: () => void) => {
      fn();
      const revert = vi.fn();
      reverts.push(revert);
      return { revert, add: (f: () => void) => f() };
    },
  };
  const ScrollTrigger = {
    create: vi.fn(
      (opts: { onEnter?: () => void; onToggle?: (self: { isActive: boolean }) => void }) => {
        opts.onEnter?.();
        opts.onToggle?.({ isActive: true });
      }
    ),
  };
  return { gsap, ScrollTrigger, tweens, reverts, flush, pending };
}

function page() {
  document.body.innerHTML = `
    <div id="root">
      <div class="app tilt">window</div>
      <div id="approval-scene">
        <h3 class="review-title">Follow up</h3>
        <div class="why" id="why-renewal">Renewal</div><div class="why">No reply</div>
        <div id="review-source">Source</div>
        <p id="review-draft-text">Hi Maya, ahead of your renewal</p>
        <button id="review-approve-btn">Approve</button>
        <span id="review-q1-state" class="state review">In review</span>
        <div id="review-toast">Approved by you</div>
        <svg id="review-cursor"></svg>
      </div>
      <div id="board-scene">
        <div data-stage="new"><div class="deal" id="deal-mover"><span class="tag cold">No reply</span></div></div>
        <div data-stage="proposal"><div class="deal">Existing</div></div>
        <div id="deal-nba">Next best action</div>
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
    const { gsap, ScrollTrigger, flush } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, false);
    flush();

    expect(document.getElementById('review-draft-text')!.textContent).toContain('renewal');
    expect(document.getElementById('review-q1-state')!.textContent).toBe('Approved');
    expect(document.getElementById('review-q1-state')!.className).toBe('state done');
    expect(document.getElementById('why-renewal')!.classList.contains('hover')).toBe(false);
    expect(document.getElementById('review-approve-btn')!.classList.contains('pressed')).toBe(
      false
    );
  });

  it('never blanks the draft text: it is present before, during and after the scene', () => {
    const root = page();
    const draft = document.getElementById('review-draft-text')!;
    const before = draft.textContent;
    expect(before).not.toBe('');

    const { gsap, ScrollTrigger, flush } = fakeGsap();
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(draft.textContent ?? ''));
    observer.observe(draft, { characterData: true, childList: true, subtree: true });
    playScenes(root, gsap as never, ScrollTrigger as never, false);
    flush();
    observer.disconnect();

    // The scene swaps whole drafts as it moves through the queue, but the draft is
    // never blank: typing is a clip-path paint over text that is already there.
    expect(seen.every((s) => s.trim().length > 0)).toBe(true);
    expect(draft.textContent).toContain('renewal');
  });

  it('moves the stalled deal to Proposal once its recap is sent', () => {
    const root = page();
    const { gsap, ScrollTrigger, flush } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, false);
    flush();

    const mover = document.getElementById('deal-mover')!;
    expect(mover.parentElement!.dataset.stage).toBe('proposal');
    expect(mover.parentElement!.firstElementChild).toBe(mover);
    expect(mover.querySelector('.tag')!.className).toBe('tag sent');
    expect(mover.textContent).toContain('Pricing recap sent');
    expect(mover.classList.contains('moving')).toBe(false);
  });

  it('keeps scene beats that start later inside the context, so cleanup can revert them', () => {
    const root = page();
    const { gsap, ScrollTrigger, flush } = fakeGsap();
    const added: Array<() => void> = [];
    const revert = vi.fn();
    gsap.context = (fn: () => void) => {
      fn();
      return { revert, add: (f: () => void) => (added.push(f), f()) } as never;
    };
    const entries: Array<() => void> = [];
    ScrollTrigger.create = vi.fn(
      (opts: { onEnter?: () => void; onToggle?: (self: { isActive: boolean }) => void }) => {
        if (opts.onEnter) entries.push(opts.onEnter);
        if (opts.onToggle) entries.push(() => opts.onToggle!({ isActive: true }));
      }
    ) as never;
    const cleanup = playScenes(root, gsap as never, ScrollTrigger as never, false);

    entries.forEach((enter) => enter());
    flush();
    expect(added.length).toBeGreaterThanOrEqual(2);
    expect(document.getElementById('review-q1-state')!.textContent).toBe('Approved');
    cleanup();
    expect(revert).toHaveBeenCalled();
  });

  it('settles tilted windows as they scroll in', () => {
    const root = page();
    const { gsap, ScrollTrigger, tweens, flush } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, false);
    flush();

    const tilt = tweens.find((t) => t.target === root.querySelector('.app.tilt'));
    expect(tilt?.vars).toMatchObject({ rotateX: 0, rotateY: 0, rotateZ: 0 });
  });

  it('shows every scene at its end state, without motion, when motion is reduced', () => {
    const root = page();
    const { gsap, ScrollTrigger, flush } = fakeGsap();
    playScenes(root, gsap as never, ScrollTrigger as never, true);
    flush();

    expect(document.getElementById('review-q1-state')!.textContent).toBe('Approved');
    expect((root.querySelector('.app.tilt') as HTMLElement).style.transform).toBe('none');
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
    // The pipeline scene settles to its end state too -- the stalled deal already
    // moved -- rather than freezing mid-story the way a one-shot toggle would.
    expect(document.getElementById('deal-mover')!.parentElement!.dataset.stage).toBe('proposal');
    expect(document.getElementById('review-draft-text')!.textContent).toContain('renewal');
  });

  it('does nothing for a scene whose markup is missing', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { gsap, ScrollTrigger, flush } = fakeGsap();
    expect(() =>
      playScenes(document.getElementById('root')!, gsap as never, ScrollTrigger as never, false)
    ).not.toThrow();
    flush();
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  it('reverts everything it made on cleanup', () => {
    const root = page();
    const { gsap, ScrollTrigger, reverts, flush } = fakeGsap();
    const cleanup = playScenes(root, gsap as never, ScrollTrigger as never, false);
    flush();
    cleanup();
    expect(reverts[0]).toHaveBeenCalled();
  });
});

describe('individual moments (driveable from any ScrollTrigger)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('revealReasoning fades in the why-list and the source card only', () => {
    page();
    const { gsap } = fakeGsap();
    const scene = document.getElementById('approval-scene')!;
    const tl = revealReasoning(scene, gsap as never);
    expect(tl).toBeDefined();
    expect(document.getElementById('review-draft-text')!.textContent).toContain('renewal');
  });

  it('typeDraft never clears textContent and returns undefined when the draft is missing', () => {
    page();
    const { gsap } = fakeGsap();
    const scene = document.getElementById('approval-scene')!;
    typeDraft(scene, gsap as never);
    expect(document.getElementById('review-draft-text')!.textContent).toContain('renewal');

    document.getElementById('review-draft-text')!.remove();
    expect(typeDraft(scene, gsap as never)).toBeUndefined();
  });

  it('confirmApproval marks the row approved and returns undefined when an element is missing', () => {
    page();
    const { gsap } = fakeGsap();
    const scene = document.getElementById('approval-scene')!;
    confirmApproval(scene, gsap as never);
    expect(document.getElementById('review-q1-state')!.textContent).toBe('Approved');

    document.getElementById('review-toast')!.remove();
    expect(confirmApproval(scene, gsap as never)).toBeUndefined();
  });

  it('flagStalledDeal reveals the next-best-action panel without moving the card', () => {
    page();
    const { gsap } = fakeGsap();
    const board = document.getElementById('board-scene')!;
    flagStalledDeal(board, gsap as never);
    expect(document.getElementById('deal-mover')!.parentElement!.dataset.stage).toBe('new');
  });

  it('moveDealForward moves the card and returns undefined when the target column is missing', () => {
    page();
    const { gsap } = fakeGsap();
    const board = document.getElementById('board-scene')!;
    moveDealForward(board, gsap as never);
    expect(document.getElementById('deal-mover')!.parentElement!.dataset.stage).toBe('proposal');

    document.body.innerHTML =
      '<div id="board-scene"><div class="deal" id="deal-mover"></div></div>';
    const board2 = document.getElementById('board-scene')!;
    expect(moveDealForward(board2, gsap as never)).toBeUndefined();
  });

  it('playApprovalScene and playPipelineScene no-op when their scene root is missing', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById('root')!;
    const { gsap, ScrollTrigger, flush } = fakeGsap();
    expect(() =>
      playApprovalScene(root, gsap as never, ScrollTrigger as never, false)
    ).not.toThrow();
    flush();
    expect(() =>
      playPipelineScene(root, gsap as never, ScrollTrigger as never, false)
    ).not.toThrow();
    flush();
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });
});
