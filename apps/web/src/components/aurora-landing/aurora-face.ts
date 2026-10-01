/**
 * The top face of each layer in the Aurora stack: a small, legible piece of the
 * product (a white panel with a header and three rows) drawn on a canvas that
 * three.js then maps onto the slab. Content is a sample workspace, never a claim.
 */
import { roundedRect } from './round-rect';

export type LayerId = 'foundation' | 'service' | 'pipeline' | 'control' | 'agents';

export interface FaceFonts {
  /** CSS font-family list for text, e.g. the next/font Manrope family. */
  text: string;
  /** CSS font-family list for Material Symbols ligatures. */
  icons: string;
}

/** A row: its icon, label and value; `button` draws the value as a primary button. */
interface Row {
  icon: string;
  label: string;
  value: string;
  accent: string;
  button?: boolean;
}
/** A kanban column: name, accent dot colour, and its cards (amount + win probability). */
type Card = readonly [amount: string, probability: number];
type Column = readonly [name: string, dot: string, cards: readonly Card[]];

interface Face {
  icon: string;
  title: string;
  pill: readonly [string, string];
  rows?: readonly Row[];
  board?: readonly Column[];
}

// 15 named agent types exist (apps/web/src/lib/active-agents/agent-utils.ts); the pill
// on the slab must print a number the product can back, never a guess.
const AGENT_TYPE_COUNT = 15;

export const FACES: Record<LayerId, Face> = {
  // Short labels on purpose: the slab is seen at an angle, so every word is drawn large.
  agents: {
    icon: 'smart_toy',
    title: 'AI agents',
    pill: [`${AGENT_TYPE_COUNT} types`, '#7655F6'],
    rows: [
      { icon: 'insights', label: 'Lead scored', value: '92', accent: '#2A78F6' },
      { icon: 'edit_note', label: 'Follow-up drafted', value: 'Ready', accent: '#7655F6' },
      { icon: 'trending_down', label: 'Churn risk flagged', value: 'High', accent: '#C43B3B' },
    ],
  },
  control: {
    icon: 'task_alt',
    title: 'Approval queue',
    pill: ['3 waiting', '#C27C00'],
    rows: [
      {
        icon: 'edit_note',
        label: 'Reply to Maya',
        value: 'Approve',
        accent: '#2A78F6',
        button: true,
      },
      { icon: 'insights', label: 'Score Acme Ltd', value: 'Review', accent: '#C27C00' },
      { icon: 'trending_down', label: 'SLA breached', value: 'Escalate', accent: '#C43B3B' },
    ],
  },
  pipeline: {
    icon: 'view_kanban',
    title: 'Deal board',
    pill: ['£283k open', '#2A78F6'],
    board: [
      [
        'New',
        '#BCA8FF',
        [
          ['£24k', 0.2],
          ['£18k', 0.15],
        ],
      ],
      [
        'Qualified',
        '#2A78F6',
        [
          ['£40k', 0.45],
          ['£21k', 0.4],
        ],
      ],
      ['Proposal', '#7655F6', [['£32k', 0.7]]],
      ['Won', '#28D9D4', [['£46k', 1]]],
    ],
  },
  service: {
    icon: 'support_agent',
    title: 'Tickets & SLAs',
    pill: ['On track', '#0A8F8A'],
    rows: [
      { icon: 'timer', label: 'Northwind', value: '2h 14m', accent: '#0A8F8A' },
      { icon: 'timer', label: 'Fabrikam', value: '38m', accent: '#C27C00' },
      {
        icon: 'sentiment_satisfied',
        label: 'Tone this week',
        value: 'Positive',
        accent: '#0A8F8A',
      },
    ],
  },
  foundation: {
    icon: 'shield_lock',
    title: 'Enterprise-grade',
    pill: ['Protected', '#0A8F8A'],
    rows: [
      { icon: 'lock', label: 'Data isolated', value: 'On', accent: '#0A8F8A' },
      { icon: 'verified_user', label: 'MFA', value: 'Available', accent: '#0A8F8A' },
      { icon: 'history', label: 'Audit log', value: 'Recording', accent: '#2A78F6' },
    ],
  },
};

/** The face canvas size; the face plane in the stack keeps this aspect ratio. */
export const FACE_SIZE = { width: 1400, height: 940 } as const;

const NAVY = '#11175B';
const LINE = 'rgba(17,23,91,0.10)';

export function drawFace(
  g: CanvasRenderingContext2D,
  id: LayerId,
  colour: string,
  fonts: FaceFonts
): void {
  const f = FACES[id];
  const { width: w, height: h } = FACE_SIZE;
  const pad = 40;
  const rr = (x: number, y: number, rw: number, rh: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    roundedRect(g, x, y, rw, rh, r);
    g.fill();
  };
  const icon = (name: string, x: number, y: number, size: number, fill: string) => {
    g.font = `${size}px ${fonts.icons}`;
    g.fillStyle = fill;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(name, x, y);
  };
  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    weight: number,
    fill: string,
    align: CanvasTextAlign = 'left'
  ) => {
    g.font = `${weight} ${size}px ${fonts.text}`;
    g.fillStyle = fill;
    g.textBaseline = 'middle';
    g.textAlign = align;
    g.fillText(s, x, y);
  };
  const widthOf = (s: string, size: number) => {
    g.font = `800 ${size}px ${fonts.text}`;
    return g.measureText(s).width;
  };

  g.clearRect(0, 0, w, h);
  g.shadowColor = 'rgba(17,23,91,0.25)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 8;
  rr(pad, pad, w - pad * 2, h - pad * 2, 56, '#FFFFFF');
  g.shadowColor = 'transparent';
  const x0 = pad + 56;
  const x1 = w - pad - 56;

  // Header: the layer's colour chip, its title and a status pill. Everything is
  // drawn large: the slab is seen at an angle and the face is only ~500px wide.
  rr(x0, 84, 128, 128, 32, colour);
  icon(f.icon, x0 + 24, 148, 80, '#FFFFFF');
  const [pill, pillColour] = f.pill;
  const pw = widthOf(pill, 48) + 64;
  // The title takes the room left of the pill, shrinking from 84px if it must.
  const room = x1 - pw - 32 - (x0 + 160);
  const titleSize = Math.max(56, Math.min(84, Math.floor((84 * room) / widthOf(f.title, 84))));
  text(f.title, x0 + 160, 150, titleSize, 800, NAVY);
  rr(x1 - pw, 112, pw, 76, 38, `${pillColour}22`);
  text(pill, x1 - pw / 2, 151, 48, 800, pillColour, 'center');
  g.fillStyle = LINE;
  g.fillRect(x0, 244, x1 - x0, 4);

  if (f.board) {
    const cw = (x1 - x0 - 3 * 28) / 4;
    f.board.forEach(([name, dot, cards], i) => {
      const x = x0 + i * (cw + 28);
      rr(x, 282, 24, 24, 12, dot);
      text(name, x + 36, 295, 46, 800, NAVY);
      cards.forEach(([amount, probability], j) => {
        const y = 350 + j * 236;
        rr(x, y, cw, 212, 28, i === 3 ? 'rgba(40,217,212,0.16)' : '#F3F5FC');
        text(amount, x + 28, y + 84, 72, 800, NAVY);
        // A probability bar under the amount, the real board's "how likely to win" read.
        const barW = cw - 56;
        rr(x + 28, y + 150, barW, 16, 8, 'rgba(17,23,91,0.12)');
        rr(x + 28, y + 150, Math.max(16, barW * probability), 16, 8, dot);
      });
    });
    return;
  }

  (f.rows ?? []).forEach(({ icon: ic, label, value, accent, button }, i) => {
    const y = 272 + i * 208;
    if (i) {
      g.fillStyle = LINE;
      g.fillRect(x0, y - 8, x1 - x0, 3);
    }
    rr(x0, y + 28, 128, 128, 32, `${accent}1F`);
    icon(ic, x0 + 28, y + 92, 72, accent);
    text(label, x0 + 160, y + 92, 64, 700, NAVY);
    const vw = widthOf(value, 52) + 64;
    if (button) {
      rr(x1 - vw, y + 50, vw, 84, 22, '#2A78F6');
      text(value, x1 - vw / 2, y + 93, 52, 800, '#FFFFFF', 'center');
    } else {
      rr(x1 - vw, y + 50, vw, 84, 42, `${accent}1F`);
      text(value, x1 - vw / 2, y + 93, 52, 800, accent, 'center');
    }
  });
}
