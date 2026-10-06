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

/** Runs a function so any animation it creates belongs to the scenes' gsap context. */
type Within = (fn: () => void) => void;
const direct: Within = (fn) => fn();

/** Wires the scenes under `root`. Returns a cleanup that kills every tween and trigger it made. */
export function playScenes(
  root: HTMLElement,
  gsap: GsapType,
  ScrollTrigger: ScrollTriggerStatic,
  reduced: boolean
): () => void {
  // Scene beats are built later, from ScrollTrigger and onComplete callbacks,
  // after gsap.context has stopped recording. Running them through ctx.add
  // keeps them in the context, so the cleanup's revert kills them too.
  let ctx: ReturnType<GsapType['context']> | null = null;
  const within: Within = (fn) => {
    if (ctx) ctx.add(fn);
    else fn();
  };
  // The approval scene loops for as long as it is on screen, so its beats are
  // not recorded in the context (that list would grow every cycle); it keeps
  // only its live timeline and hands back a stop for the cleanup.
  let stopApproval: () => void = () => undefined;
  ctx = gsap.context(() => {
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

    stopApproval = playApprovalScene(root, gsap, ScrollTrigger, reduced);
    playPipelineScene(root, gsap, ScrollTrigger, reduced, within);
  }, root);
  return () => {
    stopApproval();
    ctx.revert();
  };
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
 * Beat 2: the draft "types" -- a clip-path wipe, top to bottom, over text that
 * is already fully present in the DOM (see the module docblock), so the lines
 * appear one after another. `textContent` is only ever set by `loadReviewItem`.
 */
export function typeDraft(scene: HTMLElement, gsap: GsapType): GsapTimeline | undefined {
  const draft = byId(scene, 'review-draft-text');
  if (!draft) return undefined;
  gsap.set(draft, { clipPath: 'inset(0 0 100% 0)' });
  return gsap.timeline().to(draft, { clipPath: 'inset(0 0 0% 0)', duration: 2.6, ease: 'none' });
}

/** Beat 3: the cursor reads a source, moves to Approve, presses it; the queue and a toast confirm. */
export function confirmApproval(
  scene: HTMLElement,
  gsap: GsapType,
  state: HTMLElement | null = byId(scene, 'review-q1-state')
): GsapTimeline | undefined {
  const cursor = byId(scene, 'review-cursor');
  const btn = byId(scene, 'review-approve-btn');
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

/** One item in the review queue the scene works through, in a sample workspace. */
export interface ReviewItem {
  /** Index of its row in the queue list. */
  row: number;
  badge: { icon: string; label: string };
  sla: string;
  title: string;
  confidence: string;
  whys: ReadonlyArray<readonly [icon: string, text: string, source: string]>;
  source: readonly [title: string, detail: string];
  draft: string;
  sent: string;
}

/** The scene cycles through these; the first is the one the page's HTML shows. */
export const REVIEW_ITEMS: readonly ReviewItem[] = [
  {
    row: 0,
    badge: { icon: 'draft', label: 'Email draft' },
    sla: 'SLA in 4h 12m',
    title: 'Follow up with Maya Chen at Northwind before the renewal.',
    confidence: '92%',
    whys: [
      ['event', 'Renewal date is in 14 days', 'Contract'],
      ['mark_email_unread', 'No reply to the last two emails', 'Inbox'],
      ['trending_down', 'Account score dropped this week', 'Scoring'],
    ],
    source: ['Northwind contract', 'Renews 14 Oct · auto-renew off'],
    draft:
      "Hi Maya,\n\nAhead of your renewal on the 14th, I wanted to check the new reporting is working for your team. Your managers' weekly exports have been lighter for two weeks, so I've put together a short guide to the scheduled reports they asked about in March.\n\nWould 20 minutes on Thursday suit you to walk through it together?\n\nBest,\nTom",
    sent: 'Email sent to Maya Chen',
  },
  {
    row: 2,
    badge: { icon: 'trending_down', label: 'Churn risk' },
    sla: 'SLA breached',
    title: 'Check in with Contoso before usage drops further.',
    confidence: '88%',
    whys: [
      ['trending_down', 'Usage down three weeks running', 'Product'],
      ['support_agent', 'Two support tickets still open', 'Tickets'],
      ['person', 'Their main contact changed role last month', 'Contacts'],
    ],
    source: ['Contoso usage', 'Weekly logins down 38% since 2 Sep'],
    draft:
      "Hi Daniel,\n\nI noticed your team has been logging in less over the last few weeks, and two of your support tickets are still open. I've asked our support lead to close both by Friday.\n\nIt would help to understand what changed on your side. Could we find half an hour next week to make sure Aurora is still working for the new team?\n\nThanks,\nTom",
    sent: 'Email sent to Contoso',
  },
  {
    row: 5,
    badge: { icon: 'route', label: 'Next best action' },
    sla: 'SLA in 1h 05m',
    title: 'Send Fabrikam a pricing recap while the proposal is fresh.',
    confidence: '90%',
    whys: [
      ['visibility', 'Opened the proposal twice this week', 'Email'],
      ['schedule', 'No reply since Tuesday', 'Inbox'],
      ['view_kanban', 'Deal in Proposal for 9 days', 'Pipeline'],
    ],
    source: ['Fabrikam proposal', '£41,000 · opened twice this week'],
    draft:
      'Hi Priya,\n\nThanks for taking another look at the proposal. Here is the short version of the pricing: one plan for all 40 seats, every agent included, and the onboarding you asked for in the first month.\n\nIf it helps, I can send a version with annual billing for your finance team to compare.\n\nKind regards,\nTom',
    sent: 'Recap sent to Fabrikam',
  },
];

/** Puts one review item's content into the detail panel and the floating cards. */
export function loadReviewItem(scene: HTMLElement, item: ReviewItem): void {
  const set = (el: Element | null | undefined, text: string) => {
    if (el) el.textContent = text;
  };
  const setText = (el: Element | null | undefined, text: string) => {
    const node = el
      ? [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue?.trim())
      : null;
    if (node) node.nodeValue = text;
  };
  const badge = scene.querySelector('.review-detail__head .type-badge');
  set(badge?.querySelector('.material-symbols-outlined'), item.badge.icon);
  setText(badge, item.badge.label);
  const sla = byId(scene, 'review-sla');
  setText(sla, item.sla);
  sla?.classList.toggle('breached', item.sla === 'SLA breached');
  setText(scene.querySelector('.review-title'), item.title);
  set(scene.querySelector('.review-confidence b'), item.confidence);
  scene.querySelectorAll<HTMLElement>('.why').forEach((li, i) => {
    const why = item.whys[i];
    if (!why) return;
    set(li.querySelector('.material-symbols-outlined'), why[0]);
    setText(li, why[1]);
    set(li.querySelector('em'), why[2]);
  });
  const source = byId(scene, 'review-source');
  set(source?.querySelector('b'), item.source[0]);
  set(source?.querySelector('span'), item.source[1]);
  set(byId(scene, 'review-draft-text'), item.draft);
  set(byId(scene, 'review-toast')?.querySelector('small'), item.sent);
  scene
    .querySelectorAll<HTMLElement>('#review-queue > .q')
    .forEach((row, i) => row.classList.toggle('active', i === item.row));
}

/** The status chip of an item's queue row, which turns to "Approved" when the cursor approves. */
function rowState(scene: HTMLElement, item: ReviewItem): HTMLElement | null {
  const row = scene.querySelectorAll<HTMLElement>('#review-queue > .q')[item.row];
  const chip = row?.querySelector<HTMLElement>('.state, .sla-chip, .claim-btn');
  return chip ?? (item.row === 0 ? byId(scene, 'review-q1-state') : null);
}

/**
 * Plays the approval queue as a loop while it is on screen: the reasoning
 * arrives, the draft types, the cursor approves, then the next item in the
 * queue opens. After the last item the queue resets and it starts again.
 * It pauses whenever the scene leaves the screen.
 */
export function playApprovalScene(
  root: HTMLElement,
  gsap: GsapType,
  ScrollTrigger: ScrollTriggerStatic,
  reduced: boolean
): () => void {
  const none = () => undefined;
  const scene = byId(root, 'approval-scene');
  if (!scene) return none;
  const ready = [
    'review-source',
    'review-draft-text',
    'review-cursor',
    'review-approve-btn',
    'review-q1-state',
    'review-toast',
    'why-renewal',
  ].every((id) => byId(scene, id));
  if (!ready || !scene.querySelector('.review-title')) return none;
  if (reduced) {
    settleApprovalScene(scene, gsap);
    return none;
  }
  const queue = byId(scene, 'review-queue');
  const initialQueue = queue?.innerHTML ?? '';
  let index = 0;
  let current: GsapTimeline | undefined;
  let running = false;

  /** Only one timeline is ever live: the one before it is killed, never kept. */
  const play = (timeline: GsapTimeline | undefined) => {
    if (current && current !== timeline) current.kill();
    current = timeline;
    return timeline;
  };
  const next = () => {
    index = (index + 1) % REVIEW_ITEMS.length;
    play(gsap.timeline().to({}, { duration: 1.6 }))?.eventCallback('onComplete', () => playItem());
  };
  const playItem = (): void => {
    if (!running) return;
    const item = REVIEW_ITEMS[index]!;
    if (index === 0 && queue) queue.innerHTML = initialQueue;
    loadReviewItem(scene, item);
    const toast = byId(scene, 'review-toast');
    if (toast) gsap.set(toast, { autoAlpha: 0 });
    play(revealReasoning(scene, gsap))?.eventCallback('onComplete', () =>
      play(typeDraft(scene, gsap))?.eventCallback('onComplete', () =>
        play(confirmApproval(scene, gsap, rowState(scene, item)))?.eventCallback('onComplete', next)
      )
    );
  };

  ScrollTrigger.create({
    trigger: scene,
    start: 'top 70%',
    end: 'bottom 20%',
    onToggle: (self) => {
      running = self.isActive;
      if (!running) current?.pause();
      else if (current) current.resume();
      else playItem();
    },
  });
  return () => {
    running = false;
    current?.kill();
    current = undefined;
  };
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
  reduced: boolean,
  within: Within = direct
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
    onEnter: () =>
      within(() => {
        const flag = flagStalledDeal(board, gsap);
        flag?.eventCallback('onComplete', () => within(() => moveDealForward(board, gsap)));
      }),
  });
}
