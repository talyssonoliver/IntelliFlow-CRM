import { describe, it, expect } from 'vitest';
import {
  ARTWORK,
  computeAuroraScene,
  contentLeft,
  GROUND,
  waveEdge,
  wavePath,
  WIDE_BREAKPOINT_PX,
} from '../aurora-scene';

/** Where a frame point of a layer lands, in CSS px. */
function at(p: { offsetX: number; offsetY: number; scale: number }, x: number, y: number) {
  return { x: p.offsetX + p.scale * x, y: p.offsetY + p.scale * y };
}

describe('contentLeft', () => {
  it('follows the centred max-w-6xl column and never drops below the gutter', () => {
    expect(contentLeft(1440)).toBe(168);
    expect(contentLeft(1920)).toBe(408);
    expect(contentLeft(390)).toBe(24);
  });
});

describe('waveEdge', () => {
  it('evaluates the wave measured from the mockup', () => {
    const [c0, , c2] = GROUND.wave.coefs;
    expect(waveEdge(0)).toBeCloseTo(c0 + c2, 6);
  });
});

describe('computeAuroraScene: desktop', () => {
  for (const width of [1440, 1920, 2560]) {
    it(`puts the ribbon in the margin beside the hero copy at ${width}px`, () => {
      const scene = computeAuroraScene(width, 1130);
      expect(scene.wide).toBe(true);
      // The vertical run (frame x <= 250) sits in the margin beside the copy...
      expect(at(scene.ribbon, 250, 0).x).toBeLessThan(contentLeft(width));
      // ...and the sweep crosses the copy column only below the tour link (~605px).
      expect(at(scene.ribbon, 0, 600).y).toBeGreaterThanOrEqual(620);
    });
  }

  for (const width of [1024, 1280, 1366]) {
    it(`drops the ribbon below the hero copy when there is no margin, at ${width}px`, () => {
      const scene = computeAuroraScene(width, 1130);
      // The copy starts near the edge, so the whole ribbon starts below the tour link.
      expect(at(scene.ribbon, 0, 213).y).toBeGreaterThanOrEqual(690);
      // Any sparkle that survives stays left of the copy column.
      for (const s of scene.sparkles) expect(s.x + s.size / 2).toBeLessThan(contentLeft(width));
    });
  }

  it('scales the ribbon with the margin, within bounds', () => {
    expect(computeAuroraScene(1024, 1100).ribbon.scale).toBe(0.55);
    expect(computeAuroraScene(1440, 1100).ribbon.scale).toBeCloseTo(0.616, 3);
    expect(computeAuroraScene(2560, 1100).ribbon.scale).toBe(1);
  });

  it('pins the veil to the right edge', () => {
    const scene = computeAuroraScene(1440, 1130);
    const right = at(scene.veil, ARTWORK.veil.x + ARTWORK.veil.width, 0).x;
    expect(right).toBeCloseTo(1440, 6);
  });

  it('keeps sparkles in the margin', () => {
    for (const width of [1024, 1440, 1920]) {
      const scene = computeAuroraScene(width, 1130);
      for (const s of scene.sparkles) expect(s.x + s.size / 2).toBeLessThan(contentLeft(width));
    }
    expect(computeAuroraScene(1920, 1130).sparkles).toHaveLength(3);
  });

  it('puts the white wave behind the lower part of the hero', () => {
    const scene = computeAuroraScene(1440, 1000);
    expect(at(scene.ground, 0, GROUND.wave.coefs[0]).y).toBeCloseTo(740, 6);
  });
});

describe('computeAuroraScene: phone', () => {
  it('uses the stacked composition below the lg breakpoint', () => {
    expect(computeAuroraScene(WIDE_BREAKPOINT_PX - 1, 1500).wide).toBe(false);
  });

  it('starts the ribbon below the tour link and sweeps the right ribbon in beside the headline', () => {
    const scene = computeAuroraScene(390, 1500);
    // Crest top (frame y 213) sits just under the "Take the tour" link.
    expect(at(scene.ribbon, 0, 213).y).toBeCloseTo(646, 6);
    // As in the phone mockup: the right ribbon's whole body shows just under the
    // header (the background starts there), about a third of the screen width tall, pinned to the right edge.
    const top = at(scene.veil, 0, ARTWORK.veil.y).y;
    const bottom = at(scene.veil, 0, ARTWORK.veil.y + ARTWORK.veil.height).y;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(10);
    expect(bottom - top).toBeGreaterThan(110);
    expect(bottom).toBeLessThan(140);
    expect(at(scene.veil, ARTWORK.veil.x + ARTWORK.veil.width, 0).x).toBeCloseTo(390, 6);
    expect(scene.sparkles).toHaveLength(2);
  });

  it('grows with wider phones and tablets', () => {
    expect(computeAuroraScene(780, 1500).ribbon.scale).toBeCloseTo(
      2 * computeAuroraScene(390, 1500).ribbon.scale,
      6
    );
  });
});

describe('wavePath', () => {
  it('traces the wave across the full width and closes along the bottom', () => {
    const scene = computeAuroraScene(1440, 1000);
    const path = wavePath(scene, 4);
    expect(path.startsWith('M0.0 ')).toBe(true);
    expect(path.endsWith('L1440 1000 L0 1000 Z')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(4 + 2);
  });
});
