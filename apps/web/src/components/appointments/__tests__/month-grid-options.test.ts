import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopMonthGridOptions } from '../month-grid-options';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }));
  window.matchMedia = ((query: string) => ({ matches, media: query })) as typeof window.matchMedia;
}

describe('desktopMonthGridOptions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('caps month cells at three events on desktop', () => {
    stubMatchMedia(true);
    expect(desktopMonthGridOptions()).toEqual({ monthGridOptions: { nEventsPerDay: 3 } });
  });

  it('leaves the Schedule-X default on narrow screens', () => {
    stubMatchMedia(false);
    expect(desktopMonthGridOptions()).toEqual({});
  });
});
