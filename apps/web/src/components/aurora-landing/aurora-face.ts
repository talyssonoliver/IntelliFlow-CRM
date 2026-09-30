/**
 * The top face of each layer in the Aurora stack: a small, legible piece of the
 * product (a white panel with a header and three rows) drawn on a canvas that
 * three.js then maps onto the slab. Content is a sample workspace, never a claim.
 */

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
type Column = readonly [string, string, readonly string[]];

interface Face {
  icon: string;
  title: string;
  pill: readonly [string, string];
  rows?: readonly Row[];
  board?: readonly Column[];
}

export const FACES: Record<LayerId, Face> = {
  agents: {
    icon: 'smart_toy',
    title: 'AI agents',
    pill: ['10 at work', '#7655F6'],
    rows: [
      { icon: 'insights', label: 'Lead scored · Acme Ltd', value: '92', accent: '#2A78F6' },
      { icon: 'edit_note', label: 'Follow-up drafted', value: 'Ready', accent: '#7655F6' },
      { icon: 'trending_down', label: 'Churn risk · Contoso', value: 'High', accent: '#D14A45' },
    ],
  },
  control: {
    icon: 'task_alt',
    title: 'Approval queue',
    pill: ['3 waiting', '#C27C00'],
    rows: [
      {
        icon: 'mail',
        label: 'Follow-up to Maya Chen',
        value: 'Approve',
        accent: '#2A78F6',
        button: true,
      },
      { icon: 'star', label: 'Re-score 12 new leads', value: 'Pending', accent: '#C27C00' },
      { icon: 'reply', label: 'Reply to Adatum', value: 'Pending', accent: '#C27C00' },
    ],
  },
  pipeline: {
    icon: 'view_kanban',
    title: 'Deal board',
    pill: ['£283k open', '#2A78F6'],
    board: [
      ['New', '#BCA8FF', ['£24k', '£18k', '£12k']],
      ['Qualified', '#2A78F6', ['£40k', '£21k']],
      ['Proposal', '#7655F6', ['£32k', '£19k']],
      ['Won', '#28D9D4', ['£46k']],
    ],
  },
  service: {
    icon: 'support_agent',
    title: 'Cases & SLAs',
    pill: ['On track', '#0A8F8A'],
    rows: [
      { icon: 'timer', label: 'Northwind · Billing', value: '2h 14m', accent: '#0A8F8A' },
      { icon: 'timer', label: 'Fabrikam · Access', value: '38m', accent: '#C27C00' },
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
    title: 'Foundation',
    pill: ['Protected', '#0A8F8A'],
    rows: [
      { icon: 'lock', label: 'Workspace data isolated', value: 'On', accent: '#0A8F8A' },
      { icon: 'verified_user', label: 'Multi-factor sign-in', value: 'On', accent: '#0A8F8A' },
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
    g.roundRect(x, y, rw, rh, r);
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

  // Header: the layer's colour chip, its title and a status pill.
  rr(x0, 96, 104, 104, 28, colour);
  icon(f.icon, x0 + 22, 148, 60, '#FFFFFF');
  text(f.title, x0 + 136, 150, 64, 800, NAVY);
  const [pill, pillColour] = f.pill;
  const pw = widthOf(pill, 38) + 56;
  rr(x1 - pw, 120, pw, 60, 30, `${pillColour}22`);
  text(pill, x1 - pw / 2, 151, 38, 800, pillColour, 'center');
  g.fillStyle = LINE;
  g.fillRect(x0, 236, x1 - x0, 3);

  if (f.board) {
    const cw = (x1 - x0 - 3 * 24) / 4;
    f.board.forEach(([name, dot, cards], i) => {
      const x = x0 + i * (cw + 24);
      rr(x, 272, 18, 18, 9, dot);
      text(name, x + 30, 282, 36, 800, NAVY);
      cards.forEach((amount, j) => {
        const y = 324 + j * 116;
        rr(x, y, cw, 100, 20, i === 3 ? 'rgba(40,217,212,0.16)' : '#F3F5FC');
        rr(x + 20, y + 22, cw * 0.55, 16, 8, 'rgba(17,23,91,0.18)');
        text(amount, x + 20, y + 68, 38, 800, NAVY);
      });
    });
    return;
  }

  (f.rows ?? []).forEach(({ icon: ic, label, value, accent, button }, i) => {
    const y = 272 + i * 128;
    if (i) {
      g.fillStyle = LINE;
      g.fillRect(x0, y - 6, x1 - x0, 2);
    }
    rr(x0, y + 18, 80, 80, 22, `${accent}1F`);
    icon(ic, x0 + 16, y + 58, 48, accent);
    text(label, x0 + 108, y + 58, 44, 700, NAVY);
    const vw = widthOf(value, 38) + 48;
    if (button) {
      rr(x1 - vw, y + 28, vw, 60, 16, '#2A78F6');
      text(value, x1 - vw / 2, y + 59, 38, 800, '#FFFFFF', 'center');
    } else {
      rr(x1 - vw, y + 28, vw, 60, 30, `${accent}1F`);
      text(value, x1 - vw / 2, y + 59, 38, 800, accent, 'center');
    }
  });
}
