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
      expect(written).toEqual(expect.arrayContaining([column, ...cards]));
  });

  it('draws icons in the icon font and words in the text font', () => {
    const { g, texts } = recorder();
    drawFace(g, 'agents', '#7655F6', fonts);

    const icon = texts.find((t) => t.text === 'smart_toy');
    expect(icon?.font).toContain('Material Symbols');
    expect(texts.find((t) => t.text === 'AI agents')?.font).toContain('Manrope');
  });

  it('draws the approval row as a primary button with white text', () => {
    const { g, texts } = recorder();
    drawFace(g, 'control', '#28D9D4', fonts);

    expect(texts.find((t) => t.text === 'Approve')?.fill).toBe('#FFFFFF');
    expect(texts.find((t) => t.text === 'Pending')?.fill).toBe('#C27C00');
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

  it('claims nothing the product cannot back: ten agents, sample names only', () => {
    expect(FACES.agents.pill[0]).toBe('10 at work');
    const all = JSON.stringify(FACES);
    expect(all).not.toMatch(/SAP|SOC ?2|GDPR|ISO/);
  });
});
