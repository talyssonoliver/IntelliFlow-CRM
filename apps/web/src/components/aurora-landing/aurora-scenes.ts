/**
 * Acted-out product moments on the Aurora landing page. Each is exposed as
 * its own function so the integrator can drive it from any ScrollTrigger;
 * `playScenes` wires the default, self-contained "plays once on the way
 * into view" behaviour used today. With reduced motion every scene is shown
 * at its end state instantly, with no tween ever run.
 *
 * Content-truth rule: nothing here ever blanks real copy to stage an
 * animation. `typeDraft` never touches `textContent` -- the full draft is
 * already in the server-rendered HTML (see ApprovalSection.tsx) and stays
 * there always; the "typing" is a `clip-path` paint animated over text that
 * is already present, and the clip is only ever applied inside the
 * ScrollTrigger callback that immediately reveals it, never at module- or
 * scene-setup time. So the worst case if a trigger never fires is "the
 * flourish didn't play" -- never "the sentence is missing".
 */
import type { gsap as Gsap } from 'gsap';
import type { ScrollTrigger as ScrollTriggerType } from 'gsap/ScrollTrigger';

type GsapType = typeof Gsap;
type ScrollTriggerStatic = typeof ScrollTriggerType;
type GsapTimeline = ReturnType<GsapType['timeline']>;

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
  gsap: GsapType,
  ScrollTrigger: ScrollTriggerStatic,
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

    playApprovalScene(root, gsap, ScrollTrigger, reduced);
    playPipelineScene(root, gsap, ScrollTrigger, reduced);
  }, root);
  return () => ctx.revert();
}

// ---------------------------------------------------------------------------
// Approval queue: reasoning arrives, the draft types out, the cursor
// approves, the queue updates, a toast confirms.
// ---------------------------------------------------------------------------

/** Beat 1: the "what it noticed" sources fade in, and the source card follows. */
export function revealReasoning(scene: HTMLElement, gsap: GsapType): GsapTimeline | undefined {
  const source = byId(scene, 'review-source');
  const whys = [...scene.querySelectorAll<HTMLElement>('.why')];
  if (!source || whys.length === 0) return undefined;
  gsap.set(whys, { autoAlpha: 0, x: -10 });
  gsap.set(source, { autoAlpha: 0, x: -16 });
  return gsap
    .timeline({ defaults: { ease: 'power3.out' } })
    .to(whys, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.18 })
    .to(source, { autoAlpha: 1, x: 0, duration: 0.5 }, '-=0.2');
}

/**
 * Beat 2: the draft "types" -- a clip-path wipe over text that is already
 * fully present in the DOM (see the module docblock). Never clears or
 * rewrites `textContent`.
 */
export function typeDraft(scene: HTMLElement, gsap: GsapType): GsapTimeline | undefined {
  const draft = byId(scene, 'review-draft-text');
  if (!draft) return undefined;
  gsap.set(draft, { clipPath: 'inset(0 100% 0 0)' });
  return gsap.timeline().to(draft, { clipPath: 'inset(0 0% 0 0)', duration: 1.3, ease: 'none' });
}

/** Beat 3: the cursor reads a source, moves to Approve, presses it; the queue and a toast confirm. */
export function confirmApproval(scene: HTMLElement, gsap: GsapType): GsapTimeline | undefined {
  const cursor = byId(scene, 'review-cursor');
  const btn = byId(scene, 'review-approve-btn');
  const state = byId(scene, 'review-q1-state');
  const toast = byId(scene, 'review-toast');
  const why = byId(scene, 'why-renewal');
  const title = scene.querySelector('.review-title');
  if (!cursor || !btn || !state || !toast || !why || !title) return undefined;
  const done = () => {
    state.textContent = 'Approved';
    state.className = 'state done';
  };
  gsap.set(toast, { autoAlpha: 0, y: 14, scale: 0.97 });
  const from = relPos(title, scene);
  const mid = relPos(why, scene);
  const to = relPos(btn, scene);
  gsap.set(cursor, { x: from.x + 160, y: from.y + 40, autoAlpha: 0 });
  return gsap
    .timeline()
    .to(cursor, { autoAlpha: 1, duration: 0.2 })
    .to(cursor, { x: mid.x + 60, y: mid.y, duration: 0.8, ease: 'power2.inOut' })
    .add(() => why.classList.add('hover'))
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
}

function settleApprovalScene(scene: HTMLElement, gsap: GsapType) {
  const draft = byId(scene, 'review-draft-text');
  if (draft) gsap.set(draft, { clipPath: 'inset(0 0 0 0)' });
  const state = byId(scene, 'review-q1-state');
  if (state) {
    state.textContent = 'Approved';
    state.className = 'state done';
  }
}

/** Wires the three approval beats to play in order, once, on the way into view. */
export function playApprovalScene(
  root: HTMLElement,
  gsap: GsapType,
  ScrollTrigger: ScrollTriggerStatic,
  reduced: boolean
): void {
  const scene = byId(root, 'approval-scene');
  if (!scene) return;
  const ready = [
    'review-source',
    'review-draft-text',
    'review-cursor',
    'review-approve-btn',
    'review-q1-state',
    'review-toast',
    'why-renewal',
  ].every((id) => byId(scene, id));
  if (!ready || !scene.querySelector('.review-title')) return;
  if (reduced) {
    settleApprovalScene(scene, gsap);
    return;
  }
  ScrollTrigger.create({
    trigger: scene,
    start: 'top 55%',
    once: true,
    onEnter: () => {
      const reveal = revealReasoning(scene, gsap);
      reveal?.eventCallback('onComplete', () => {
        const type = typeDraft(scene, gsap);
        type?.eventCallback('onComplete', () => confirmApproval(scene, gsap));
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Pipeline: the stalled deal is flagged, then moves stage once its next
// step is sent.
// ---------------------------------------------------------------------------

/** Beat 1: the stalled deal card pulses amber and the next-best-action panel reveals. */
export function flagStalledDeal(board: HTMLElement, gsap: GsapType): GsapTimeline | undefined {
  const mover = byId(board, 'deal-mover');
  const nba = byId(board, 'deal-nba');
  if (!mover || !nba) return undefined;
  gsap.set(nba, { autoAlpha: 0, y: 16 });
  return gsap
    .timeline({ defaults: { ease: 'power3.out' } })
    .fromTo(
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
    .to({}, { duration: 1.1 });
}

/** Beat 2: its next step goes out and the card moves into Proposal. */
export function moveDealForward(board: HTMLElement, gsap: GsapType): GsapTimeline | undefined {
  const mover = byId(board, 'deal-mover');
  const target = board.querySelector<HTMLElement>('[data-stage=proposal]');
  if (!mover || !target) return undefined;
  const first = mover.getBoundingClientRect();
  target.insertBefore(mover, target.querySelector('.deal'));
  const tag = mover.querySelector<HTMLElement>('.tag');
  if (tag) {
    tag.className = 'tag sent';
    tag.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span>Pricing recap sent';
  }
  const last = mover.getBoundingClientRect();
  mover.classList.add('moving');
  return gsap.timeline().fromTo(
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
}

function settlePipelineScene(board: HTMLElement) {
  const mover = byId(board, 'deal-mover');
  const target = board.querySelector<HTMLElement>('[data-stage=proposal]');
  if (!mover || !target) return;
  target.insertBefore(mover, target.querySelector('.deal'));
  const tag = mover.querySelector<HTMLElement>('.tag');
  if (tag) {
    tag.className = 'tag sent';
    tag.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span>Pricing recap sent';
  }
}

/** Wires the two pipeline beats to play in order, once, on the way into view. */
export function playPipelineScene(
  root: HTMLElement,
  gsap: GsapType,
  ScrollTrigger: ScrollTriggerStatic,
  reduced: boolean
): void {
  const board = byId(root, 'board-scene');
  if (!board) return;
  const mover = byId(board, 'deal-mover');
  const nba = byId(board, 'deal-nba');
  const target = board.querySelector('[data-stage=proposal]');
  if (!mover || !nba || !target) return;
  if (reduced) {
    settlePipelineScene(board);
    return;
  }
  ScrollTrigger.create({
    trigger: board,
    start: 'top 55%',
    once: true,
    onEnter: () => {
      const flag = flagStalledDeal(board, gsap);
      flag?.eventCallback('onComplete', () => moveDealForward(board, gsap));
    },
  });
}
