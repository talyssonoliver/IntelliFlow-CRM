/**
 * PG-205 contact type colours (A11Y-2): every token maps to fixed classes, unknown
 * tokens fall back to slate, and the contrast of the shipped classes is computed —
 * this test FAILS the run when a swatch outline drops below 3:1 against the card
 * (SC 1.4.11) or a badge's text drops below 4.5:1 on its fill (SC 1.4.3), in the
 * light and the dark theme. axe runs with color-contrast off elsewhere, so this is
 * the contrast check for these tokens.
 */
import { describe, it, expect } from 'vitest';
import colors from 'tailwindcss/colors';
import { CONTACT_TYPE_COLOR_TOKENS } from '@intelliflow/validators';
import {
  CONTACT_TYPE_BADGE_CLASSES,
  CONTACT_TYPE_COLOR_LABELS,
  CONTACT_TYPE_SWATCH_OUTLINE,
  contactTypeBadgeClass,
  contactTypeSwatchClass,
  toContactTypeColorToken,
} from '../contact-type-colors';

/** Card surfaces from apps/web/src/app/globals.css (--card, light and dark). */
const CARD_LIGHT = [255, 255, 255];
const CARD_DARK = [0x1e, 0x29, 0x36];

/** oklch(L% C H) → sRGB 0..255 (CSS Color 4 reference conversion, gamut-clipped). */
function oklchToRgb(value: string): number[] {
  const match = /oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/.exec(value);
  if (!match) throw new Error(`not an oklch colour: ${value}`);
  const l = Number(match[1]) / 100;
  const c = Number(match[2]);
  const h = (Number(match[3]) * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return linear.map((v) => {
    const clipped = Math.min(1, Math.max(0, v));
    const srgb = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  });
}

function luminance([r, g, b]: number[]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `bg-amber-200` / `text-amber-900` / `ring-slate-500` → sRGB. */
function classColour(cls: string): number[] {
  const match = /^(?:dark:)?(?:bg|text|ring)-([a-z]+)-(\d{2,3})$/.exec(cls);
  if (!match) throw new Error(`no colour in ${cls}`);
  const palette = (colors as unknown as Record<string, Record<string, string>>)[match[1]];
  return oklchToRgb(palette[match[2]]);
}

function pick(classes: string, prefix: 'bg' | 'text', dark: boolean): string {
  const parts = classes.split(/\s+/);
  const themed = parts.find((p) => p.startsWith(`dark:${prefix}-`));
  if (dark && themed) return themed;
  const plain = parts.find((p) => p.startsWith(`${prefix}-`));
  if (!plain) throw new Error(`no ${prefix} class in "${classes}"`);
  return plain;
}

describe('contact type colour maps', () => {
  it('covers all 18 tokens with a label, a swatch and a badge', () => {
    expect(CONTACT_TYPE_COLOR_TOKENS).toHaveLength(18);
    for (const token of CONTACT_TYPE_COLOR_TOKENS) {
      expect(CONTACT_TYPE_COLOR_LABELS[token]).toMatch(/^[A-Z][a-z]+$/);
      expect(contactTypeSwatchClass(token)).toContain(`bg-${token}-500`);
      expect(contactTypeSwatchClass(token)).toContain(CONTACT_TYPE_SWATCH_OUTLINE);
      expect(contactTypeBadgeClass(token)).toBe(CONTACT_TYPE_BADGE_CLASSES[token]);
    }
  });

  it('narrows unknown or malicious tokens to slate (classes come from the fixed map only)', () => {
    expect(toContactTypeColorToken('teal')).toBe('teal');
    expect(toContactTypeColorToken('magenta')).toBe('slate');
    expect(toContactTypeColorToken('red; background:url(x)')).toBe('slate');
    expect(contactTypeSwatchClass('magenta')).toBe(contactTypeSwatchClass('slate'));
    expect(contactTypeBadgeClass('nope')).toBe(CONTACT_TYPE_BADGE_CLASSES.slate);
  });
});

describe('contact type colour contrast (A11Y-2)', () => {
  const ring = classColour('ring-slate-500');

  it.each([
    ['light', CARD_LIGHT],
    ['dark', CARD_DARK],
  ])('the swatch outline keeps at least 3:1 against the %s card', (_theme, card) => {
    expect(CONTACT_TYPE_SWATCH_OUTLINE).toContain('ring-slate-500');
    expect(contrast(ring, card)).toBeGreaterThanOrEqual(3);
  });

  it.each(
    CONTACT_TYPE_COLOR_TOKENS.flatMap((token) => [[token, false] as const, [token, true] as const])
  )('badge text on fill is at least 4.5:1 for %s (dark=%s)', (token, dark) => {
    const classes = CONTACT_TYPE_BADGE_CLASSES[token];
    const fg = classColour(pick(classes, 'text', dark));
    const bg = classColour(pick(classes, 'bg', dark));
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
