import { describe, it, expect } from 'vitest';
import {
  buildRibbonMesh,
  catmullRom,
  gapAt,
  RIBBON_SPECS,
  RIBBON_VERTEX_FLOATS,
  ribbonColourAt,
  smoothstep,
  type ArtworkPixels,
} from '../aurora-ribbon-mesh';
import { ARTWORK, computeAuroraScene } from '../aurora-scene';
// Painted pixels of both cut-outs (alpha > 40/255), frame px, every 12th pixel.
// Regenerate with numpy + Pillow when an artwork changes: np.nonzero(alpha[::12, ::12] > 40),
// scaled by 12 and offset by the artwork's frame position.
import painted from './fixtures/aurora-painted-pixels.json';

type Triangle = [number, number, number, number, number, number];

/** The mesh as triangles in frame px, one cell across so each spans edge to edge. */
function triangles(key: 'ribbon' | 'veil'): Triangle[] {
  const mesh = buildRibbonMesh(RIBBON_SPECS[key], 240, 1);
  const out: Triangle[] = [];
  const f = RIBBON_VERTEX_FLOATS;
  for (let i = 0; i < mesh.length; i += f * 3) {
    out.push([
      mesh[i]!,
      mesh[i + 1]!,
      mesh[i + f]!,
      mesh[i + f + 1]!,
      mesh[i + 2 * f]!,
      mesh[i + 2 * f + 1]!,
    ]);
  }
  return out;
}

function inside([ax, ay, bx, by, cx, cy]: Triangle, px: number, py: number): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

describe('smoothstep and gapAt', () => {
  it('eases between the edges and clamps outside them', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('starts at the start value and ends at the last step', () => {
    const { gap } = RIBBON_SPECS.ribbon;
    expect(gapAt(gap, 0)).toBe(90);
    expect(gapAt(gap, 1)).toBe(26);
    expect(gapAt(gap, 0.3)).toBeLessThan(90);
    expect(gapAt(gap, 0.3)).toBeGreaterThan(26);
  });
});

describe('catmullRom', () => {
  it('passes through the first and last control points', () => {
    const points = [
      [0, 0],
      [10, 5],
      [20, 0],
    ] as const;
    const curve = catmullRom(points, 11);
    expect(curve).toHaveLength(11);
    expect(curve[0]).toEqual([0, 0]);
    expect(curve[10]![0]).toBeCloseTo(20, 9);
    expect(curve[10]![1]).toBeCloseTo(0, 9);
  });
});

describe('buildRibbonMesh', () => {
  it('lays two triangles per cell with eight floats per vertex', () => {
    const mesh = buildRibbonMesh(RIBBON_SPECS.ribbon, 10, 4);
    expect(mesh.length).toBe(9 * 4 * 6 * RIBBON_VERTEX_FLOATS);
  });

  it('runs u from 0 at the anchored edge to 1 at the tail, and v from -1 to 1 across', () => {
    const mesh = buildRibbonMesh(RIBBON_SPECS.veil, 20, 2);
    const us: number[] = [];
    const vs: number[] = [];
    for (let i = 0; i < mesh.length; i += RIBBON_VERTEX_FLOATS) {
      us.push(mesh[i + 6]!);
      vs.push(mesh[i + 7]!);
    }
    expect(Math.min(...us)).toBe(0);
    expect(Math.max(...us)).toBeCloseTo(1, 9);
    expect(Math.min(...vs)).toBe(-1);
    expect(Math.max(...vs)).toBe(1);
  });

  it('puts every vertex on the line between its cross-section edges (the strip never moves)', () => {
    const mesh = buildRibbonMesh(RIBBON_SPECS.ribbon, 30, 3);
    for (let i = 0; i < mesh.length; i += RIBBON_VERTEX_FLOATS) {
      const t = (mesh[i + 7]! + 1) / 2;
      expect(mesh[i]!).toBeCloseTo(mesh[i + 2]! + (mesh[i + 4]! - mesh[i + 2]!) * t, 3);
      expect(mesh[i + 1]!).toBeCloseTo(mesh[i + 3]! + (mesh[i + 5]! - mesh[i + 3]!) * t, 3);
    }
  });

  // Any painted pixel outside its strip is never drawn: the ribbon shows a hard cut there.
  for (const key of ['ribbon', 'veil'] as const) {
    it(`covers every painted pixel of the ${key} artwork`, () => {
      const tris = triangles(key);
      const points = (painted as unknown as Record<string, number[][]>)[key]!;
      expect(points.length).toBeGreaterThan(500);
      const missed = points.filter(([x, y]) => !tris.some((t) => inside(t, x!, y!)));
      expect(missed).toEqual([]);
    });
  }
});

describe('ribbonColourAt', () => {
  const solid = (width: number, height: number, rgba: [number, number, number, number]) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
    return { width, height, data } satisfies ArtworkPixels;
  };
  const scene = computeAuroraScene(1440, 1000);
  const at = (p: { offsetX: number; offsetY: number; scale: number }, x: number, y: number) => ({
    x: p.offsetX + p.scale * x,
    y: p.offsetY + p.scale * y,
  });

  it('returns the painted colour under a point on the ribbon', () => {
    const pixels = { ribbon: solid(4, 4, [51, 102, 204, 255]), veil: solid(4, 4, [0, 0, 0, 0]) };
    const { x, y } = at(scene.ribbon, ARTWORK.ribbon.x + 10, ARTWORK.ribbon.y + 10);
    expect(ribbonColourAt(scene, pixels, x, y)).toEqual([0.2, 0.4, 0.8, 1]);
  });

  it('falls through to the right-hand ribbon, and ignores the soft fringe', () => {
    const pixels = { ribbon: solid(4, 4, [0, 0, 0, 0]), veil: solid(2, 2, [255, 0, 255, 128]) };
    const { x, y } = at(scene.veil, ARTWORK.veil.x + 5, ARTWORK.veil.y + 5);
    expect(ribbonColourAt(scene, pixels, x, y)![3]).toBeCloseTo(128 / 255, 6);
    const faint = { ribbon: pixels.ribbon, veil: solid(2, 2, [255, 0, 255, 20]) };
    expect(ribbonColourAt(scene, faint, x, y)).toBeNull();
  });

  it('returns null away from both images', () => {
    const pixels = { ribbon: solid(4, 4, [9, 9, 9, 255]), veil: solid(4, 4, [9, 9, 9, 255]) };
    expect(ribbonColourAt(scene, pixels, 720, -500)).toBeNull();
  });
});
