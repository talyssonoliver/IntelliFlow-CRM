/**
 * The inline fonts-ready script gates icon visibility, so it must add the class
 * once the icon font loads AND fail open whenever it cannot know (no Font
 * Loading API, a rejected load, or a load slower than the 3s block period).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FONTS_READY_CLASS, FONTS_READY_SCRIPT } from '../fonts-ready';

const run = () => new Function(FONTS_READY_SCRIPT)();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const hasClass = () => document.documentElement.classList.contains(FONTS_READY_CLASS);

describe('FONTS_READY_SCRIPT', () => {
  let originalFonts: PropertyDescriptor | undefined;

  beforeEach(() => {
    document.documentElement.classList.remove(FONTS_READY_CLASS);
    originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else delete (document as unknown as { fonts?: unknown }).fonts;
  });

  const setFonts = (fonts: unknown) =>
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });

  it('adds the class the script names, matching FONTS_READY_CLASS', () => {
    expect(FONTS_READY_SCRIPT).toContain(`'${FONTS_READY_CLASS}'`);
  });

  it('loads the Material Symbols face and adds the class once it resolves', async () => {
    let resolveLoad!: () => void;
    const load = vi.fn(() => new Promise<void>((resolve) => (resolveLoad = resolve)));
    setFonts({ load });

    run();
    expect(load).toHaveBeenCalledWith('24px "Material Symbols Outlined"');
    await flush();
    expect(hasClass()).toBe(false);

    resolveLoad();
    await flush();
    expect(hasClass()).toBe(true);
  });

  it('fails open when the font load rejects', async () => {
    setFonts({ load: () => Promise.reject(new Error('network')) });
    run();
    await flush();
    expect(hasClass()).toBe(true);
  });

  it('fails open when the Font Loading API is missing', () => {
    setFonts(undefined);
    run();
    expect(hasClass()).toBe(true);
  });

  it('fails open after 3s when the load never settles', () => {
    vi.useFakeTimers();
    setFonts({ load: () => new Promise(() => {}) });
    run();
    vi.advanceTimersByTime(2999);
    expect(hasClass()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hasClass()).toBe(true);
  });
});
