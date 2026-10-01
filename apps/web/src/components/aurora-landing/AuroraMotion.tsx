'use client';

import * as React from 'react';
import type { LayerId } from './aurora-face';
import type { Presentation } from './aurora-stack';

/** The first screen never waits longer than this for the stack before it shows. */
export const BOOT_TIMEOUT_MS = 2500;

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

type Gsap = typeof import('gsap').gsap;
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger').ScrollTrigger;
type Motion = typeof import('./aurora-motion-system');
type Stack = ReturnType<typeof import('./aurora-stack').createStack>;
type Scenes = typeof import('./aurora-scenes').playScenes;
interface Wiring {
  root: HTMLElement;
  gsap: Gsap;
  ScrollTrigger: ScrollTriggerStatic;
  motion: Motion;
  triggers: Array<{ kill(): void }>;
  cleanups: Array<() => void>;
}

/** Nav background, reveals, section hand-offs, the product scenes and the wave's recede. */
function wirePage(
  { root, gsap, ScrollTrigger, motion, triggers, cleanups }: Wiring,
  playScenes: Scenes,
  reduced: boolean
) {
  const nav = root.querySelector('.nav');
  triggers.push(
    ScrollTrigger.create({
      start: 40,
      onUpdate: (self) => nav?.classList.toggle('scrolled', self.scroll() > 40),
    })
  );

  // Entrance reveals: enter AND exit, reversible on scroll-back. A fast,
  // fixed duration (not MOTION.duration.md's 0.62s default) — a wall-
  // clock tween that is still running when a visitor stops scrolling
  // leaves real copy sitting at some mid-fade opacity for as long as it
  // takes to finish, which reads as a rendering glitch, not motion (owner
  // 2026-09-30, reproduced sitewide by the step-judge: "reveals left at
  // 0.7"). MOTION.duration.xs (0.22s) reliably finishes inside a normal
  // scroll-and-settle pause; nothing here needed the longer flourish.
  cleanups.push(
    motion.createReveal(root, gsap, ScrollTrigger, '.reveal, [data-reveal]', {
      duration: motion.MOTION.duration.xs,
    })
  );
  // Staggered groups: every direct child of a [data-reveal-stagger]
  // container reveals in sequence — same fast duration, and a tight
  // stagger (not MOTION.stagger.normal's 0.08s) so a 6-item group's last
  // child still starts well inside the settle window above, rather than
  // queuing behind up to 0.4s of cumulative delay before its own tween
  // even begins.
  root.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
    cleanups.push(
      motion.createReveal(group, gsap, ScrollTrigger, ':scope > *', {
        stagger: motion.MOTION.stagger.tight,
        duration: motion.MOTION.duration.xs,
      })
    );
  });

  // On the way out the same blocks drift up and fade. The stacking cards are
  // left out: they stay pinned while the next card covers them.
  cleanups.push(
    motion.createExitDrift(
      root,
      gsap,
      ScrollTrigger,
      '.reveal:not(.bento), [data-reveal]:not(.bento)'
    )
  );

  // Section hand-offs: each consecutive pair of [data-bridge-section]
  // elements gets a scrubbed colour-wash seam instead of a stacked cut.
  const sections = gsap.utils.toArray<HTMLElement>('[data-bridge-section]', root);
  for (let i = 0; i < sections.length - 1; i += 1) {
    cleanups.push(motion.createSectionBridge(sections[i]!, sections[i + 1]!, gsap, ScrollTrigger));
  }

  cleanups.push(playScenes(root, gsap, ScrollTrigger, reduced));

  // The wave recedes to Mist as the visitor reads into the stack walk,
  // scrubbed to scroll position — never a class-toggle + wall-clock fade.
  const heroBg = root.querySelector<HTMLElement>('.hero-bg');
  const walk = root.querySelector<HTMLElement>('.walk');
  const stageEndForRecede = root.querySelector<HTMLElement>('.stage-end');
  if (heroBg && walk && stageEndForRecede) {
    cleanups.push(
      motion.createBackgroundRecede(heroBg, walk, stageEndForRecede, gsap, ScrollTrigger)
    );
  }
}

/** The render loop never spends a frame off-screen or in a hidden tab. */
/**
 * Stacking cards pin at 96px; a card taller than the screen pins later, once its
 * bottom is in view, so every line of it is read before the next card covers it.
 */
export function fitStickyCards(root: HTMLElement, cleanups: Array<() => void>): void {
  const cards = [...root.querySelectorAll<HTMLElement>('.bento .bcard')];
  if (cards.length === 0) return;
  const fit = () =>
    cards.forEach((card) => {
      const top = Math.min(96, window.innerHeight - card.offsetHeight - 24);
      card.style.setProperty('--stick-top', `${Math.round(top)}px`);
    });
  fit();
  window.addEventListener('resize', fit);
  cleanups.push(() => window.removeEventListener('resize', fit));
}

function pauseWhenHidden(canvas: HTMLCanvasElement, s: Stack, cleanups: Array<() => void>) {
  // The render loop never spends a frame off-screen or in a hidden tab.
  let onScreen = true;
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      // Entries arrive oldest first; only the newest reflects where the canvas is now.
      onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      if (onScreen && document.visibilityState !== 'hidden') s.resume();
      else s.pause();
    });
    io.observe(canvas);
    cleanups.push(() => io.disconnect());
  }
  const onVisibility = () => {
    // Back in the tab, the loop restarts only if the canvas is still on screen.
    if (document.visibilityState === 'hidden') s.pause();
    else if (onScreen) s.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
}

/**
 * The phone story's state for each layer, from where its card is on screen.
 * A layer lifts out as its card rises from the bottom edge to 70% of the
 * screen, and dissolves as the next card rises from the bottom edge to 80%.
 */
export function phoneStory(
  cards: HTMLElement[],
  viewport: number
): Partial<Record<LayerId, Presentation>> {
  const rise = (card: HTMLElement | undefined, span: number) => {
    if (!card) return 0;
    const top = card.getBoundingClientRect().top / viewport;
    return Math.min(1, Math.max(0, (1 - top) / span));
  };
  const story: Partial<Record<LayerId, Presentation>> = {};
  cards.forEach((card, i) => {
    const layer = card.dataset.layer as LayerId;
    story[layer] = { present: rise(card, 0.3), dissolve: rise(cards[i + 1], 0.2) };
  });
  return story;
}

/** Points the stack at the layer being read, and back to rest at the hero and the stage end. */
function followLayers({ root, gsap, ScrollTrigger, motion, triggers, cleanups }: Wiring, s: Stack) {
  // The stack points at whichever layer is being read, scrubbed 1:1 to
  // scroll position (one number driving both the DOM opacity and the
  // WebGL camera, replacing the old binary onToggle → setActive call).
  // `.walk.walk-card` (the "Five layers..." intro, no `data-layer`) is
  // included first: it is the first thing in `.stage-copy` to transit
  // the pinned canvas's band on mobile, so it needs the exact same
  // measured-geometry snap the five layer cards get below — see
  // stack-stage.css. `steps[index]?.dataset.layer` is undefined for it,
  // which the onStep guard below treats as "no active layer".
  const steps = gsap.utils.toArray<HTMLElement>('.walk.walk-card, .layer-step', root);

  const phone = window.matchMedia(motion.MOBILE_QUERY).matches;
  if (phone) {
    // Phone story (stack-stage.css): the stack stays pinned while the story
    // cards scroll up over it. As a card comes up from the bottom, its layer
    // lifts out of the stack to the top of the frame and turns to face the
    // reader; it stays there while the card scrolls past, and dissolves as the
    // next card fills the bottom fifth of the screen.
    const copy = root.querySelector('.stage-copy');
    if (copy) {
      const cards = steps.filter((step) => step.dataset.layer);
      triggers.push(
        ScrollTrigger.create({
          trigger: copy,
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: () => s.setPresentation(phoneStory(cards, window.innerHeight)),
          onLeave: () => s.setPresentation(null),
          onLeaveBack: () => s.setPresentation(null),
        })
      );
    }
  } else {
    cleanups.push(
      motion.createScrubSteps(steps, gsap, ScrollTrigger, {
        getFadeTarget: (step) => step.querySelector<HTMLElement>('.layer-step-inner') ?? step,
        // The layer whose card is moving through its range is the one on
        // top; the hero and stage-end triggers return the stack to rest.
        onStep: (index, progress) => {
          const layer = steps[index]?.dataset.layer as LayerId | undefined;
          if (layer && progress > 0 && progress < 1) s.setActive(layer);
        },
      })
    );
  }
  const hero = root.querySelector('.hero');
  if (hero) {
    triggers.push(
      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom 55%',
        onToggle: (self) => self.isActive && s.setActive(null),
      })
    );
  }
  const end = root.querySelector('.stage-end');
  if (end) {
    triggers.push(
      ScrollTrigger.create({
        trigger: end,
        start: 'top 55%',
        onEnter: () => s.setActive(null),
        // On a phone the story's presentation shows the layers; the whole stack stays put.
        onLeaveBack: () => s.setActive(phone ? null : 'foundation'),
      })
    );
  }
  return end;
}

/** Clears the canvas before the unstuck stack slides up under the fixed nav. */
function hideAtStageEnd(
  { root, ScrollTrigger, triggers, cleanups }: Wiring,
  s: Stack,
  end: Element | null
) {
  // The pinned canvas un-sticks once its grid row's own bottom edge
  // (`.stage-end`, the row's last child) scrolls up to the canvas's
  // stuck-bottom position — ordinary `position: sticky` behaviour, not
  // a bug in itself. But once unstuck it continues in normal flow
  // attached near the top of that row, so it then slides UP through
  // y:0-72 on its way fully off-screen — straight through the fixed
  // nav's own band, including its "Get started" button — before
  // finally clearing the viewport. Measured live (fixer 2026-09-30):
  // the isometric slab's own painted pixels sat under the nav CTA's
  // text for several hundred px of scroll there.
  //
  // A CSS opacity fade on `stackVisual` does NOT fix this: the
  // `<canvas>`'s WebGL backing buffer keeps its last-rendered, fully-
  // opaque pixels regardless of the wrapper's CSS (confirmed by
  // measuring the step-judge's canvas readback unchanged either way).
  // `s.hide()`/`s.show()` (aurora-stack.ts) actually clear the buffer
  // to transparent, so the slab is genuinely gone, not just invisible-
  // by-CSS. A plain threshold toggle, not a scrub: the canvas is about
  // to leave its pinned band regardless, so there is no "settled" look
  // to preserve mid-transition here, only a single moment to clear
  // before un-stick begins.
  // The pinned band is whichever element is sticky: the whole stage object on a
  // phone, its inner frame on desktop (the outer column is as tall as the stage,
  // which would fire the hide at load). getComputedStyle, not a live rect: the
  // band's position is fixed by CSS, whether or not it has stuck yet.
  const stackVisual =
    [
      root.querySelector<HTMLElement>('.stage-object.stack-visual'),
      root.querySelector<HTMLElement>('.object-sticky'),
    ].find((el) => el && getComputedStyle(el).position === 'sticky') ?? null;
  const stackStyle = stackVisual ? getComputedStyle(stackVisual) : null;
  const canvasBottomPx = stackStyle
    ? Math.ceil(parseFloat(stackStyle.top) + parseFloat(stackStyle.height))
    : 0;
  if (end && stackVisual && canvasBottomPx > 0) {
    triggers.push(
      ScrollTrigger.create({
        trigger: end,
        start: `bottom top+=${canvasBottomPx}`,
        onEnter: () => s.hide(),
        onLeaveBack: () => s.show(),
      })
    );
    cleanups.push(() => s.show());
  }
}

/**
 * Wires the single motion system (aurora-motion-system.ts) onto the
 * server-rendered markup under `#aurora-page`: entrance reveals (enter AND
 * exit, reversible), the section hand-offs, the wave's background recede,
 * the scrubbed stack walkthrough, the acted-out product scenes, and the nav
 * background. Renders nothing itself.
 *
 * The first screen (hero, waves and stack) is hidden by the `boot` class until the
 * fonts and the stack are ready, then shown in one move, so nothing reflows or pops in.
 */
export function AuroraMotion() {
  React.useEffect(() => {
    const root = document.getElementById('aurora-page');
    if (!root) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const reveal = () => root.classList.remove('boot');
    const bootTimer = window.setTimeout(reveal, BOOT_TIMEOUT_MS);
    cleanups.push(() => window.clearTimeout(bootTimer));

    // The phone menu closes once one of its links is followed.
    const menu = root.querySelector('details.nav-menu');
    const closeMenu = (e: Event) => {
      if ((e.target as Element).closest('a')) menu?.removeAttribute('open');
    };
    menu?.addEventListener('click', closeMenu);
    cleanups.push(() => menu?.removeEventListener('click', closeMenu));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }, { playScenes }, motion] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('./aurora-scenes'),
        import('./aurora-motion-system'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      motion.configureScrollTrigger(ScrollTrigger);

      // Smooth scroll: desktop, fine-pointer only, never under reduced motion.
      // Lenis's own defaults leave touch scroll untouched even un-gated, but
      // there is no reason to pay for its rAF loop on a device that never
      // sends a wheel event (see aurora-motion-system.ts's docblock).
      if (motion.hasFinePointer() && !reduced) {
        try {
          const { default: Lenis } = await import('lenis');
          if (cancelled) return;
          cleanups.push(
            motion.setupSmoothScroll(gsap, ScrollTrigger, () => new Lenis({ anchors: true }))
          );
        } catch (error) {
          console.warn('[aurora] smooth scroll unavailable', error);
        }
      }

      const triggers: Array<{ kill(): void }> = [];
      cleanups.push(() => triggers.forEach((t) => t.kill()));

      const wiring: Wiring = { root, gsap, ScrollTrigger, motion, triggers, cleanups };
      wirePage(wiring, playScenes, reduced);
      fitStickyCards(root, cleanups);

      // The stack: its faces print text and icons, so the fonts come first.
      const canvas = root.querySelector<HTMLCanvasElement>('#stack');
      if (!canvas) return reveal();
      const fonts = {
        text: cssVar(root, '--font-manrope', 'system-ui, sans-serif'),
        icons: cssVar(document.body, '--font-material-symbols', "'Material Symbols Outlined'"),
      };
      await Promise.all([
        document.fonts.load(`800 64px ${fonts.text}`),
        document.fonts.load(`700 44px ${fonts.text}`),
        document.fonts.load(`48px ${fonts.icons}`, 'task_alt'),
      ]).catch(() => undefined);
      const { createStack } = await import('./aurora-stack');
      if (cancelled) return;
      let stack: ReturnType<typeof createStack> | null = null;
      try {
        stack = createStack(canvas, { fonts, reducedMotion: reduced });
      } catch (error) {
        // No WebGL: the copy still reads on its own; say why the stack is missing.
        console.warn('[aurora] stack unavailable', error);
      }
      if (stack) {
        const s = stack;
        cleanups.push(() => s.dispose());

        pauseWhenHidden(canvas, s, cleanups);
        const end = followLayers(wiring, s);
        hideAtStageEnd(wiring, s, end);
      }
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    })().catch((error: unknown) => {
      console.warn('[aurora] motion unavailable', error);
      reveal();
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
  return null;
}
