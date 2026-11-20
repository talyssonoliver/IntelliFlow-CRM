import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The landing page's controls must be tappable on a phone. A browser decides that from the real
 * layout, which jsdom does not have (the real-browser proof is tests/e2e/landing-taps.spec.ts and
 * the elementFromPoint probe). This pins the CSS that makes it true, so a later edit to the stage
 * cannot quietly put the pinned stack canvas back over the hero buttons.
 */
const css = readFileSync(resolve(__dirname, '../stack-stage.css'), 'utf8');
const stage = readFileSync(resolve(__dirname, '../../aurora-landing.css'), 'utf8');

const PHONE = '@media (max-width: 960px)';
/** Where the base (all widths) rule that gives the canvas pointer events starts. */
const baseCanvasRule = css.indexOf('.aurora-page .stage-object.stack-visual #stack,');
/** The last phone block: the tap rules. */
const phoneTapStart = css.lastIndexOf(PHONE);
const phoneTap = css.slice(phoneTapStart);

describe('stack stage: taps reach the controls on a phone', () => {
  it('gives the canvas pointer events at every width in the base rule (the desktop drag)', () => {
    expect(baseCanvasRule).toBeGreaterThan(-1);
    const base = css.slice(baseCanvasRule, css.indexOf('}', baseCanvasRule));
    expect(base).toMatch(/pointer-events:\s*auto/);
  });

  it('turns them off on a phone in a block that comes AFTER the base rule (same specificity: the later wins)', () => {
    expect(phoneTapStart).toBeGreaterThan(baseCanvasRule);
    expect(phoneTap).toMatch(
      /\.stage-object\.stack-visual #stack,[^{]*\{[^}]*pointer-events:\s*none/s
    );
    expect(phoneTap).toMatch(/\.object-sticky #stack\s*\{[^}]*pointer-events:\s*none/s);
  });

  it('paints the hero above the pinned stack, which sits at z-index 1', () => {
    expect(css).toMatch(/\.stage-object\.stack-visual\s*\{[^}]*z-index:\s*1[;\s]/s);
    expect(phoneTap).toMatch(/\.hero\s*\{[^}]*position:\s*relative[^}]*z-index:\s*2/s);
  });

  it('relies on the stage grid passing events through and re-enabling links and buttons', () => {
    expect(stage).toMatch(/\.aurora-page \.stage-grid\s*\{[^}]*pointer-events:\s*none/s);
    expect(stage).toMatch(
      /\.stage-grid :is\(a, button, summary\)\s*\{[^}]*pointer-events:\s*auto/s
    );
  });

  it('keeps the tap rules out of the desktop widths', () => {
    expect(css.slice(0, phoneTapStart)).toMatch(/touch-action:\s*pan-y/);
    expect(phoneTap).not.toContain('min-width');
  });
});
