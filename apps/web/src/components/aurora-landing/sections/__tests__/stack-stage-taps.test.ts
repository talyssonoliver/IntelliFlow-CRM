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

/** The body of the last `@media (max-width: 960px)` block: the phone tap rules. */
function phoneTapBlock(): string {
  const start = css.lastIndexOf('@media (max-width: 960px)');
  expect(start).toBeGreaterThan(-1);
  return css.slice(start);
}

describe('stack stage: taps reach the controls on a phone', () => {
  it('turns pointer events off on the stack canvas on a phone', () => {
    expect(phoneTapBlock()).toMatch(/#stack\s*\{[^}]*pointer-events:\s*none/);
  });

  it('puts that rule after the base rule that turns them on, which has the same specificity', () => {
    const base = css.indexOf(
      '#stack,\n.aurora-page .object-sticky #stack {\n  pointer-events: auto'
    );
    const phone = css.lastIndexOf('pointer-events: none', css.length);
    expect(base).toBeGreaterThan(-1);
    expect(css.lastIndexOf('.aurora-page .object-sticky #stack')).toBeGreaterThan(base);
    expect(phone).toBeGreaterThan(base);
  });

  it('paints the hero above the pinned stack (z-index 1) and lets only its controls take pointer events', () => {
    const block = phoneTapBlock();
    expect(block).toMatch(/\.hero\s*\{[^}]*position:\s*relative[^}]*z-index:\s*2/s);
    expect(block).toMatch(/\.hero\s*\{[^}]*pointer-events:\s*none/s);
    expect(block).toMatch(/\.hero a,[^{]*\.hero button\s*\{[^}]*pointer-events:\s*auto/s);
  });

  it('keeps the story cards tappable while the copy column passes events through', () => {
    const block = phoneTapBlock();
    expect(block).toMatch(/\.stage-copy\s*\{[^}]*pointer-events:\s*none/s);
    expect(block).toMatch(/\.layer-step-inner\s*\{[^}]*pointer-events:\s*auto/s);
  });

  it('leaves the desktop stack drag alone (the base rule is not inside a max-width block)', () => {
    const base = css.indexOf('#stack:active');
    const phone = css.lastIndexOf('@media (max-width: 960px)');
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(phone);
    expect(css.slice(0, phone)).toMatch(/touch-action:\s*pan-y/);
  });
});
