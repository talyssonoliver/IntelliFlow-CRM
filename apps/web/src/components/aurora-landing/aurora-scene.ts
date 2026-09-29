/**
 * Where each piece of the Aurora background sits, for any container size.
 *
 * The left ribbon comes from the approved mockup (a 1320x1370 frame); the right
 * ribbon (`veil`) from the owner's full-width composition (a 2556 px wide
 * frame). Both are cut-out images; the page gradient, white wave and big circle
 * are regenerated from measurements of the mockup. Each piece gets
 * its own placement here, so the ribbon can stay beside the hero copy instead
 * of behind it (brand rule: no ribbon behind critical UI text) while keeping
 * the mockup's proportions.
 *
 * Pure and framework-free: the WebGL renderer and the static fallback both
 * read the same scene, so the still images and the first animated frame line
 * up exactly.
 */

/** A layer placement: frame point (x, y) lands at (offsetX + scale*x, offsetY + scale*y) CSS px. */
export interface Placement {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface SceneSparkle {
  x: number;
  y: number;
  size: number;
}

export interface AuroraScene {
  width: number;
  height: number;
  wide: boolean;
  ribbon: Placement;
  veil: Placement;
  ground: Placement;
  sparkles: SceneSparkle[];
  dots: { x: number; y: number; gap: number; cols: number; rows: number };
  smallCircle: { x: number; y: number; radius: number };
}

/** The cut-out layers: file, intrinsic size and where they sat in the mockup frame. */
export const ARTWORK = {
  ribbon: { src: '/brand/aurora/bg/ribbon-left.webp', x: 0, y: 185, width: 741, height: 675 },
  /** The right-hand ribbon, in its own frame: the owner's full-width composition, 2556 px wide. */
  veil: { src: '/brand/aurora/bg/ribbon-right.webp', x: 1211, y: 0, width: 1345, height: 660 },
  veilFrameWidth: 2556,
  frameWidth: 1320,
  frameHeight: 1370,
} as const;

/**
 * Ground measured from the mockup, in frame px. The wave edge is
 * y(x) = c0 + c1*x + c2*cos(2*pi*x/period) + c3*sin(2*pi*x/period) (RMSE 0.36 px
 * over 47 columns); the circle is a least-squares fit to 27 edge points.
 */
export const GROUND = {
  gradient: {
    r: [238.2315, -3.1538, -4.7755, -0.1896, 4.3439, -4.0343],
    g: [240.2715, -4.2532, -2.6204, -2.6948, 1.0451, -2.0892],
    b: [249.7522, -1.2996, -1.4978, 0.0552, 0.5336, -1.5041],
  },
  wave: { coefs: [912.859, 0.02946, -15.51, 35.523], period: 1000, color: [0.983, 0.978, 0.987] },
  circle: { x: -41.3, y: 1040.8, radius: 195, color: [0.8, 0.824, 0.945], alpha: 0.32 },
} as const;

/** Sparkles as placed around the ribbon in the mockup (frame px; size is the star's width). */
const RIBBON_SPARKLES = [
  { x: 170, y: 190, size: 34 },
  { x: 218, y: 216, size: 22 },
  { x: 333, y: 488, size: 34 },
];

/** From this CSS width the hero sits in two columns (Tailwind `lg`). */
export const WIDE_BREAKPOINT_PX = 1024;
/** The hero's content column: Tailwind max-w-6xl plus px-6. */
const CONTENT_MAX_PX = 1152;
const CONTENT_GUTTER_PX = 24;
/** On desktop the ribbon's sweep must pass below the "Take the tour" link (y ~605). */
const DESKTOP_SWEEP_TOP_PX = 625;
/** Frame y of the sweep's upper edge where it crosses the hero column. */
const FRAME_SWEEP_TOP = 600;
/** Frame x where the crest's drop ends; everything left of it is the vertical run. */
const FRAME_CREST_RIGHT = 250;
/** Frame y of the crest's top edge. */
const FRAME_CREST_TOP = 213;
/** Smallest ribbon scale worth putting in the margin (about 1400px wide and up). */
const MIN_MARGIN_SCALE = 0.55;
/** Without a margin, the crest starts here: below the tour link, behind the cards. */
const BELOW_COPY_PX = 700;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Left edge of the hero copy for a container `width` wide. */
export function contentLeft(width: number): number {
  return Math.max(CONTENT_GUTTER_PX, (width - CONTENT_MAX_PX) / 2 + CONTENT_GUTTER_PX);
}

function place(placement: Placement, x: number, y: number) {
  return { x: placement.offsetX + placement.scale * x, y: placement.offsetY + placement.scale * y };
}

/** Frame y of the white wave's edge at frame x. */
export function waveEdge(x: number): number {
  const [c0, c1, c2, c3] = GROUND.wave.coefs;
  const w = (2 * Math.PI) / GROUND.wave.period;
  return c0 + c1 * x + c2 * Math.cos(w * x) + c3 * Math.sin(w * x);
}

export function computeAuroraScene(width: number, height: number): AuroraScene {
  const wide = width >= WIDE_BREAKPOINT_PX;

  if (wide) {
    const left = contentLeft(width);
    // The vertical run (frame x 0-250) goes in the margin beside the copy when
    // the margin can hold it at a readable size. Narrower desktops (the copy
    // starts near the edge) get the ribbon below the copy instead, rising from
    // behind the feature cards.
    const marginScale = (left - 14) / FRAME_CREST_RIGHT;
    const inMargin = marginScale >= MIN_MARGIN_SCALE;
    const scale = inMargin ? Math.min(marginScale, 1) : MIN_MARGIN_SCALE;
    const ribbon = {
      offsetX: 0,
      offsetY: inMargin
        ? DESKTOP_SWEEP_TOP_PX - FRAME_SWEEP_TOP * scale
        : BELOW_COPY_PX - FRAME_CREST_TOP * scale,
      scale,
    };

    // As in the owner's composition: from the top-right corner, sized to the page.
    const veilScale = clamp(width / ARTWORK.veilFrameWidth, 0.45, 0.75);
    const veil = {
      offsetX: width - ARTWORK.veilFrameWidth * veilScale,
      offsetY: 0,
      scale: veilScale,
    };

    const groundScale = width / ARTWORK.frameWidth;
    const ground = {
      offsetX: 0,
      offsetY: height * 0.74 - GROUND.wave.coefs[0] * groundScale,
      scale: groundScale,
    };

    const sparkles = RIBBON_SPARKLES.map((s) => ({
      ...place(ribbon, s.x, s.y),
      size: s.size * scale,
    })).filter((s) => s.x + s.size / 2 < left - 12);
    const waveY = place(ground, 0, waveEdge(0)).y;
    return {
      width,
      height,
      wide,
      ribbon,
      veil,
      ground,
      sparkles,
      dots: { x: Math.max(16, left - 96), y: waveY - 10, gap: 24, cols: 3, rows: 4 },
      smallCircle: { x: Math.max(40, left - 44), y: waveY + 118, radius: 16 },
    };
  }

  // Phones and tablets: the copy is centred, so the ribbon starts just below the
  // "Take the tour" link, runs down the left edge behind the product preview's
  // frosted glass, and sweeps out through the gap beneath it.
  const unit = width / 390;
  const scale = 0.55 * unit;
  const ribbon = { offsetX: 0, offsetY: 646 - 213 * scale, scale };

  const veilScale = 0.19 * unit;
  // As in the phone mockup: sweeping in from the right edge just under the
  // header, beside the badge and headline, its faint tail reaching toward them.
  const veil = {
    offsetX: width - ARTWORK.veilFrameWidth * veilScale,
    offsetY: 2 * unit,
    scale: veilScale,
  };

  const groundScale = 0.6 * unit;
  const ground = {
    offsetX: 0,
    offsetY: height * 0.69 - GROUND.wave.coefs[0] * groundScale,
    scale: groundScale,
  };

  const sparkles = RIBBON_SPARKLES.slice(0, 2).map((s) => ({
    ...place(ribbon, s.x, s.y),
    size: s.size * scale * 1.2,
  }));
  const waveY = place(ground, 0, waveEdge(0)).y;
  return {
    width,
    height,
    wide,
    ribbon,
    veil,
    ground,
    sparkles,
    dots: { x: width - 56, y: 640 * unit, gap: 16, cols: 3, rows: 3 },
    smallCircle: { x: 34, y: waveY + 70, radius: 12 },
  };
}

/** SVG path of the white wave's region (edge down to the bottom), for the static fallback. */
export function wavePath(scene: AuroraScene, steps = 48): string {
  const { ground, width, height } = scene;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const cssX = (i / steps) * width;
    const frameX = (cssX - ground.offsetX) / ground.scale;
    const y = ground.offsetY + ground.scale * waveEdge(frameX);
    points.push(`${cssX.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${points.join(' L')} L${width} ${height} L0 ${height} Z`;
}
