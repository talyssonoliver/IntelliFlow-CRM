import { describe, it, expect } from 'vitest';
import { drawFace, FACES, FACE_SIZE, type LayerId } from '../aurora-face';

/** A 2D context that records what was written and with which font. */
function recorder() {
  const texts: Array<{ text: string; font: string; fill: string; x: number }> = [];
  const state = { font: '', fillStyle: '' };
  const g = {
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
    },
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    textBaseline: '',
    textAlign: '',
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    measureText: (s: string) => ({ width: s.length * 20 }),
    fillText: (text: string, x: number) =>
      texts.push({ text, font: state.font, fill: state.fillStyle, x }),
  };
  return { g: g as unknown as CanvasRenderingContext2D, texts };
}

const fonts = { text: 'Manrope, sans-serif', icons: 'Material Symbols' };
const ids = Object.keys(FACES) as LayerId[];

describe('drawFace', () => {
  it.each(ids)('prints the %s layer title, its status and every row', (id) => {
    const { g, texts } = recorder();
    drawFace(g, id, '#7655F6', fonts);
    const written = texts.map((t) => t.text);
    const face = FACES[id];

    expect(written).toContain(face.title);
    expect(written).toContain(face.pill[0]);
    for (const row of face.rows ?? [])
      expect(written).toEqual(expect.arrayContaining([row.label, row.value]));
    for (const [column, , cards] of face.board ?? [])
      expect(written).toEqual(expect.arrayContaining([column, ...cards.map(([amount]) => amount)]));
  });

  it('draws a probability bar under every pipeline card, sized to its win chance', () => {
    const { g, texts } = recorder();
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    g.roundRect = ((x: number, y: number, w: number, h: number) => {
      rects.push({ x, y, w, h });
    }) as CanvasRenderingContext2D['roundRect'];
    drawFace(g, 'pipeline', '#2A78F6', fonts);
    void texts;

    // Every card draws a track rect then a fill rect on top of it, both 16px tall.
    const bars = rects.filter((r) => r.h === 16);
    const totalCards = FACES.pipeline.board!.reduce((n, [, , cards]) => n + cards.length, 0);
    expect(bars.length).toBe(totalCards * 2);
    for (let i = 0; i < bars.length; i += 2) {
      const [track, fill] = [bars[i]!, bars[i + 1]!];
      expect(fill.w).toBeLessThanOrEqual(track.w);
      expect(fill.w).toBeGreaterThan(0);
    }
  });

  it('draws icons in the icon font and words in the text font', () => {
    const { g, texts } = recorder();
    drawFace(g, 'agents', '#7655F6', fonts);

    const icon = texts.find((t) => t.text === 'smart_toy');
    expect(icon?.font).toContain('Material Symbols');
    expect(texts.find((t) => t.text === 'AI agents')?.font).toContain('Manrope');
  });

  it('draws the approval row as a primary button with white text, and escalates a breached SLA in red', () => {
    const { g, texts } = recorder();
    drawFace(g, 'control', '#28D9D4', fonts);

    expect(texts.find((t) => t.text === 'Approve')?.fill).toBe('#FFFFFF');
    expect(texts.find((t) => t.text === 'Review')?.fill).toBe('#C27C00');
    expect(texts.find((t) => t.text === 'Escalate')?.fill).toBe('#C43B3B');
  });

  it('keeps every word inside the panel', () => {
    for (const id of ids) {
      const { g, texts } = recorder();
      drawFace(g, id, '#11175B', fonts);
      for (const t of texts) {
        expect(t.x).toBeGreaterThan(0);
        expect(t.x).toBeLessThan(FACE_SIZE.width);
      }
    }
  });

  it('claims nothing the product cannot back: 15 agent types, sample names only', () => {
    // apps/web/src/lib/active-agents/agent-utils.ts defines 15 named agent types —
    // the pill must print that real, verifiable number, never a guessed "at work" count.
    expect(FACES.agents.pill[0]).toBe('15 types');
    const all = JSON.stringify(FACES);
    expect(all).not.toMatch(/SAP|SOC ?2|GDPR|ISO/);
    expect(all).not.toMatch(/\bprotects every account\b/i);
  });
});

describe('face legibility', () => {
  it('draws every word at 46px or more on the 1400px face, so it reads at an angle', () => {
    for (const id of ids) {
      const { g, texts } = recorder();
      drawFace(g, id, '#7655F6', fonts);
      for (const t of texts) {
        const size = Number(t.font.split('px')[0]!.split(' ').pop());
        expect(size, `${id}: "${t.text}" at ${size}px`).toBeGreaterThanOrEqual(46);
      }
    }
  });

  it('keeps every row label short enough to sit clear of its value', () => {
    for (const face of Object.values(FACES)) {
      for (const row of face.rows ?? []) expect(row.label.length).toBeLessThanOrEqual(18);
    }
  });
});
