'use client';

import * as React from 'react';
import type { LayerId } from './aurora-face';

/** The first screen never waits longer than this for the stack before it shows. */
export const BOOT_TIMEOUT_MS = 2500;

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/**
 * Wires the motion on the Aurora landing page to the server-rendered markup under
 * `#aurora-page`: the stack walkthrough, the acted-out scenes, the nav background
 * and the entrance reveals. Renders nothing itself.
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

    // Entrance reveals, one shared pattern.
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('revealed');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -10% 0px' }
    );
    root
      .querySelectorAll('.reveal')
      .forEach((el) => (reduced ? el.classList.add('revealed') : io.observe(el)));
    cleanups.push(() => io.disconnect());

    void (async () => {
      const [{ gsap }, { ScrollTrigger }, { playScenes }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('./aurora-scenes'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const triggers: Array<{ kill(): void }> = [];
      cleanups.push(() => triggers.forEach((t) => t.kill()));

      const nav = root.querySelector('.nav');
      triggers.push(
        ScrollTrigger.create({
          start: 40,
          onUpdate: (self) => nav?.classList.toggle('scrolled', self.scroll() > 40),
        })
      );
      const heroBg = root.querySelector('.hero-bg');
      const walk = root.querySelector('.walk');
      if (heroBg && walk) {
        triggers.push(
          ScrollTrigger.create({
            trigger: walk,
            start: 'top 70%',
            endTrigger: root.querySelector('.stage') ?? walk,
            end: 'bottom top',
            onToggle: (self) => heroBg.classList.toggle('reading', self.isActive),
          })
        );
      }
      cleanups.push(playScenes(root, gsap, ScrollTrigger, reduced));

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
        root.querySelectorAll<HTMLElement>('.layer-step').forEach((step) => {
          triggers.push(
            ScrollTrigger.create({
              trigger: step,
              start: 'top 55%',
              end: 'bottom 55%',
              onToggle: (self) => {
                step.classList.toggle('on', self.isActive);
                if (self.isActive) s.setActive(step.dataset.layer as LayerId);
              },
            })
          );
        });
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
              onLeaveBack: () => s.setActive('foundation'),
            })
          );
        }
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
