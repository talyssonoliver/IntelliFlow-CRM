/**
 * Acted-out product moments on the Aurora landing page. Each plays once when it
 * scrolls into view; with reduced motion every scene is shown at its end state.
 */
import type { gsap as Gsap } from 'gsap';
import type { ScrollTrigger as ScrollTriggerType } from 'gsap/ScrollTrigger';

function relPos(el: Element, host: Element) {
  const a = el.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  return { x: a.left - b.left + a.width * 0.45, y: a.top - b.top + a.height * 0.55 };
}

function byId<T extends Element = HTMLElement>(root: ParentNode, id: string): T | null {
  return root.querySelector<T & Element>(`#${id}`);
}

/** Wires the scenes under `root`. Returns a cleanup that kills every tween and trigger it made. */
export function playScenes(
  root: HTMLElement,
  gsap: typeof Gsap,
  ScrollTrigger: typeof ScrollTriggerType,
  reduced: boolean
): () => void {
  const ctx = gsap.context(() => {
    // Windows start tilted in space and settle flat as they come into view.
    root.querySelectorAll<HTMLElement>('.app.tilt, .app.tilt-soft').forEach((app) => {
      if (reduced) {
        app.style.transform = 'none';
        return;
      }
      gsap.to(app, {
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0,
        ease: 'none',
        scrollTrigger: { trigger: app, start: 'top 95%', end: 'top 35%', scrub: 0.6 },
      });
    });

    approvalScene(root, gsap, ScrollTrigger, reduced);
    boardScene(root, gsap, ScrollTrigger, reduced);
  }, root);
  return () => ctx.revert();
}

/** Reasoning arrives, the draft types out, the cursor approves, the queue updates, a toast confirms. */
function approvalScene(
  root: HTMLElement,
  gsap: typeof Gsap,
  ScrollTrigger: typeof ScrollTriggerType,
  reduced: boolean
) {
  const scene = byId(root, 'approval-scene');
  const toast = byId(root, 'toast');
  const source = byId(root, 'fsource');
  const cursor = byId(root, 'cursor');
  const btn = byId(root, 'approve-btn');
  const state = byId(root, 'q1-state');
  const typed = byId(root, 'typed');
  const why = byId(root, 'why-renewal');
  const title = scene?.querySelector('.d-title');
  if (!scene || !toast || !source || !cursor || !btn || !state || !typed || !why || !title) return;
  const whys = [...scene.querySelectorAll('.why')];
  const full = typed.textContent ?? '';
  const done = () => {
    state.textContent = 'Approved';
    state.className = 'state done';
  };
  if (reduced) {
    done();
    return;
  }
  gsap.set(toast, { autoAlpha: 0, y: 14, scale: 0.97 });
  gsap.set(source, { autoAlpha: 0, x: -16 });
  gsap.set(whys, { autoAlpha: 0, x: -10 });
  typed.textContent = '';
  const counter = { n: 0 };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  tl.to(whys, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.18 })
    .to(source, { autoAlpha: 1, x: 0, duration: 0.5 }, '-=0.2')
    .to(
      counter,
      {
        n: full.length,
        duration: 1.6,
        ease: 'none',
        onUpdate: () => {
          typed.textContent = full.slice(0, Math.round(counter.n));
        },
      },
      '-=0.3'
    )
    .add(() => {
      const from = relPos(title, scene);
      const mid = relPos(why, scene);
      const to = relPos(btn, scene);
      gsap.set(cursor, { x: from.x + 160, y: from.y + 40, autoAlpha: 0 });
      gsap
        .timeline()
        .to(cursor, { autoAlpha: 1, duration: 0.2 })
        .to(cursor, { x: mid.x + 60, y: mid.y, duration: 0.8, ease: 'power2.inOut' })
        .add(() => why.classList.add('hover'))
        .to(source, { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' })
        .to({}, { duration: 0.5 })
        .add(() => why.classList.remove('hover'))
        .to(cursor, { x: to.x, y: to.y, duration: 0.8, ease: 'power2.inOut' })
        .add(() => btn.classList.add('pressed'))
        .to({}, { duration: 0.18 })
        .add(() => {
          btn.classList.remove('pressed');
          done();
        })
        .to(toast, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)' })
        .to(cursor, { autoAlpha: 0, duration: 0.4 }, '+=0.6');
    }, '+=0.2');
  ScrollTrigger.create({
    trigger: scene,
    start: 'top 55%',
    once: true,
    onEnter: () => void tl.play(),
  });
}

/** The stalled deal is flagged, then moves to Proposal once its next step is taken. */
function boardScene(
  root: HTMLElement,
  gsap: typeof Gsap,
  ScrollTrigger: typeof ScrollTriggerType,
  reduced: boolean
) {
  const board = byId(root, 'board-scene');
  const mover = byId(root, 'mover');
  const nba = byId(root, 'nba');
  const target = board?.querySelector('[data-stage=proposal]');
  if (!board || !mover || !nba || !target || reduced) return;
  gsap.set(nba, { autoAlpha: 0, y: 16 });
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  tl.fromTo(
    mover,
    { boxShadow: '0 0 0 1px rgba(17,23,91,.09)' },
    {
      boxShadow: '0 0 0 2px rgba(255,170,0,.65), 0 10px 24px -12px rgba(255,170,0,.6)',
      duration: 0.5,
      repeat: 1,
      yoyo: true,
    }
  )
    .to(nba, { autoAlpha: 1, y: 0, duration: 0.55 }, '-=0.2')
    .add(() => {
      const first = mover.getBoundingClientRect();
      target.insertBefore(mover, target.querySelector('.deal'));
      const tag = mover.querySelector<HTMLElement>('.tag');
      if (tag) {
        tag.className = 'tag sent';
        tag.innerHTML =
          '<span class="material-symbols-outlined">auto_awesome</span>Pricing recap sent';
      }
      const last = mover.getBoundingClientRect();
      mover.classList.add('moving');
      gsap.fromTo(
        mover,
        { x: first.left - last.left, y: first.top - last.top, rotate: -2 },
        {
          x: 0,
          y: 0,
          rotate: 0,
          duration: 0.9,
          ease: 'power3.inOut',
          onComplete: () => mover.classList.remove('moving'),
        }
      );
    }, '+=1.1');
  ScrollTrigger.create({
    trigger: board,
    start: 'top 55%',
    once: true,
    onEnter: () => void tl.play(),
  });
}
