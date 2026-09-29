/**
 * Geometry for the two Aurora ribbons (left ribbon, right veil) in the mockup's
 * frame coordinates.
 *
 * Each ribbon is a strip that follows its own spine and spans its artwork from
 * the outside edge to the inside edge. The strip never moves: the shader slides
 * the painted sheets across it (u along the ribbon, v across), so at rest every
 * pixel samples the artwork exactly where it was painted and the first frame is
 * the mockup itself.
 *
 * Pure and framework-free so it can be unit-tested without a GPU.
 */
import { ARTWORK, type AuroraScene, type Placement } from './aurora-scene';

type Point = readonly [number, number];

/** Spacing between the painted sheets along the ribbon: a start value eased through steps. */
export interface GapSchedule {
  start: number;
  steps: ReadonlyArray<{ from: number; to: number; value: number }>;
}

export interface RibbonSpec {
  /** Which cut-out image the strip samples. */
  art: { x: number; y: number; width: number; height: number };
  /** Centre line, frame px; the first points sit off the page where the ribbon is anchored. */
  spine: ReadonlyArray<Point>;
  /** Painted sheets in the artwork. */
  layers: number;
  gap: GapSchedule;
  /** How far the strip reaches past the outer sheets; the image's alpha trims it. */
  margin: number;
  /** u range over which the motion eases in from the anchored edge. */
  anchor: readonly [number, number];
  /** Shading strength, 1 = full; lower it for faint, translucent artwork, which greys when darkened. */
  light: number;
  /** Phase offset so the two sides never move in step. */
  phase: number;
}

export const RIBBON_SPECS: { ribbon: RibbonSpec; veil: RibbonSpec } = {
  ribbon: {
    art: ARTWORK.ribbon,
    spine: [
      [-220, 366],
      [-60, 372],
      [30, 392],
      [92, 428],
      [128, 490],
      [138, 570],
      [168, 628],
      [225, 676],
      [310, 708],
      [410, 714],
      [510, 700],
      [600, 700],
      [665, 725],
      [720, 765],
      [770, 815],
    ],
    layers: 4,
    gap: {
      start: 90,
      steps: [
        { from: 0.19, to: 0.33, value: 48 },
        { from: 0.34, to: 0.56, value: 26 },
      ],
    },
    margin: 70,
    anchor: [0.15, 0.3],
    light: 1,
    phase: 0,
  },
  /** The right-hand ribbon; frame px of the owner's 2556 px composition. */
  veil: {
    art: ARTWORK.veil,
    spine: [
      [2720, -170],
      [2560, -45],
      [2450, 40],
      [2331, 120],
      [2251, 180],
      [2171, 240],
      [2091, 305],
      [2011, 370],
      [1931, 420],
      [1851, 455],
      [1771, 470],
      [1691, 462],
      [1611, 444],
      [1531, 432],
      [1440, 445],
      [1330, 455],
      [1230, 462],
    ],
    layers: 4,
    gap: { start: 75, steps: [{ from: 0.35, to: 0.7, value: 32 }] },
    // Wide: near the corner the painted sheets reach well past the spine's inside edge.
    margin: 160,
    anchor: [0.12, 0.28],
    light: 1,
    phase: 1.9,
  },
};

/** Floats per vertex: rest x, y; outside edge x, y; inside edge x, y; u; v. */
export const RIBBON_VERTEX_FLOATS = 8;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function gapAt(schedule: GapSchedule, u: number): number {
  let gap = schedule.start;
  for (const step of schedule.steps) gap = mix(gap, step.value, smoothstep(step.from, step.to, u));
  return gap;
}

/** `n` points on the Catmull-Rom spline through `points` (endpoints included). */
export function catmullRom(points: ReadonlyArray<Point>, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seg = points.length - 1;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * seg;
    const k = Math.min(Math.floor(f), seg - 1);
    const t = f - k;
    const p0 = points[Math.max(k - 1, 0)]!;
    const p1 = points[k]!;
    const p2 = points[k + 1]!;
    const p3 = points[Math.min(k + 2, seg)]!;
    const c = (a: number, b: number, cc: number, d: number) =>
      0.5 *
      (2 * b +
        (-a + cc) * t +
        (2 * a - 5 * b + 4 * cc - d) * t * t +
        (-a + 3 * b - 3 * cc + d) * t * t * t);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/** u (0..1 by arc length) at each of `n` samples along the spine. */
function arcLengths(samples: ReadonlyArray<Point>): number[] {
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1]!;
    const [x1, y1] = samples[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = lengths[lengths.length - 1] || 1;
  return lengths.map((l) => l / total);
}

/**
 * The strip edge on one side of the spine. Offsets the spine's control points
 * (not every sample: that folds the inside edge at tight bends), interpolates,
 * then relaxes the result with fixed ends so no cusp survives.
 */
function edgeCurve(spec: RibbonSpec, side: -1 | 1, u: number[], n: number) {
  const { spine } = spec;
  const seg = spine.length - 1;
  const half = 0.5 * (spec.layers - 1);
  const control = spine.map((p, i) => {
    const q = spine[Math.min(i + 1, seg)]!;
    const o = spine[Math.max(i - 1, 0)]!;
    const length = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
    const tx = (q[0] - o[0]) / length;
    const ty = (q[1] - o[1]) / length;
    const at = u[Math.round((i / seg) * (n - 1))]!;
    const offset = side * ((half + 0.5) * gapAt(spec.gap, at) + spec.margin);
    return [p[0] - ty * offset, p[1] + tx * offset] as const;
  });
  let curve = catmullRom(control, n);
  for (let pass = 0; pass < 60; pass++) {
    curve = curve.map((p, i) => {
      if (i === 0 || i === n - 1) return p;
      const a = curve[i - 1]!;
      const b = curve[i + 1]!;
      return [0.5 * p[0] + 0.25 * (a[0] + b[0]), 0.5 * p[1] + 0.25 * (a[1] + b[1])];
    });
  }
  return curve;
}

/** Triangle list for one ribbon: `samples` along its spine, `across` cells from edge to edge. */
export function buildRibbonMesh(spec: RibbonSpec, samples = 240, across = 48): Float32Array {
  const u = arcLengths(catmullRom(spec.spine, samples));
  const outside = edgeCurve(spec, -1, u, samples);
  const inside = edgeCurve(spec, 1, u, samples);
  const data = new Float32Array((samples - 1) * across * 6 * RIBBON_VERTEX_FLOATS);
  let w = 0;
  const vertex = (i: number, j: number) => {
    const t = j / across;
    const a = outside[i]!;
    const b = inside[i]!;
    data[w++] = mix(a[0], b[0], t);
    data[w++] = mix(a[1], b[1], t);
    data[w++] = a[0];
    data[w++] = a[1];
    data[w++] = b[0];
    data[w++] = b[1];
    data[w++] = u[i]!;
    data[w++] = t * 2 - 1;
  };
  for (let i = 0; i < samples - 1; i++) {
    for (let j = 0; j < across; j++) {
      vertex(i, j);
      vertex(i + 1, j);
      vertex(i, j + 1);
      vertex(i, j + 1);
      vertex(i + 1, j);
      vertex(i + 1, j + 1);
    }
  }
  return data;
}

/** Straight (not premultiplied) RGBA pixels of a cut-out image, as from getImageData. */
export interface ArtworkPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** Alpha below this is the image's soft fringe, not ribbon. */
const HIT_ALPHA = 0.15;

function sampleArt(
  pixels: ArtworkPixels,
  art: RibbonSpec['art'],
  placement: Placement,
  x: number,
  y: number
): [number, number, number, number] | null {
  const fx = (x - placement.offsetX) / placement.scale - art.x;
  const fy = (y - placement.offsetY) / placement.scale - art.y;
  // The image may be decoded at another size than its frame rectangle.
  const ix = Math.floor((fx / art.width) * pixels.width);
  const iy = Math.floor((fy / art.height) * pixels.height);
  if (ix < 0 || iy < 0 || ix >= pixels.width || iy >= pixels.height) return null;
  const i = (iy * pixels.width + ix) * 4;
  const alpha = pixels.data[i + 3]! / 255;
  if (alpha < HIT_ALPHA) return null;
  return [pixels.data[i]! / 255, pixels.data[i + 1]! / 255, pixels.data[i + 2]! / 255, alpha];
}

/**
 * The painted ribbon colour under CSS point (x, y), or null if the point is not
 * on a ribbon. The ribbon is checked first: it is drawn above the veil.
 */
export function ribbonColourAt(
  scene: AuroraScene,
  pixels: { ribbon: ArtworkPixels; veil: ArtworkPixels },
  x: number,
  y: number
): [number, number, number, number] | null {
  return (
    sampleArt(pixels.ribbon, RIBBON_SPECS.ribbon.art, scene.ribbon, x, y) ??
    sampleArt(pixels.veil, RIBBON_SPECS.veil.art, scene.veil, x, y)
  );
}
