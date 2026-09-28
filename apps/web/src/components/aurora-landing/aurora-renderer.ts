/**
 * Aurora ribbon background — a single full-screen fragment shader.
 *
 * Two ribbons, each a path through a few control points, drawn as four
 * overlapping folds (the same stacked bands as the logo mark). The path is
 * sampled on the CPU every frame, so the folds can drift, breathe and lean
 * toward the pointer; the shader only measures each pixel's distance to that
 * path. No textures, meshes or libraries: one triangle, one program.
 *
 * Kept free of React so the GL plumbing and the path maths can be unit-tested.
 */

/** Points each ribbon's path is sampled into. The shader loops over them. */
export const RIBBON_SAMPLES = 33;
/** vec4 slots holding RIBBON_SAMPLES packed vec2 points. */
const PACKED_SLOTS = Math.ceil(RIBBON_SAMPLES / 2);
/** Refuse devices that cannot hold both ribbons plus the scalar uniforms. */
export const MIN_FRAGMENT_UNIFORM_VECTORS = 48;

export const AURORA_VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const AURORA_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_wide;
uniform vec4 u_left[${PACKED_SLOTS}];
uniform vec4 u_right[${PACKED_SLOTS}];
uniform vec3 u_leftBand;  // fold spacing, fold width (canvas px), side (+1 left of travel, -1 right)
uniform vec3 u_rightBand;

const vec3 PAGE = vec3(0.953, 0.957, 0.984); // #F3F4FB

// Cyan (0) to lilac (1), through the logo's blue and violet.
vec3 palette(float t) {
  vec3 c0 = vec3(0.420, 0.890, 0.945); // #6BE3F1
  vec3 c1 = vec3(0.220, 0.741, 0.973); // #38BDF8
  vec3 c2 = vec3(0.231, 0.424, 0.965); // #3B6CF6
  vec3 c3 = vec3(0.427, 0.247, 0.910); // #6D3FE8
  vec3 c4 = vec3(0.604, 0.482, 0.973); // #9A7BF8
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  return mix(c3, c4, t - 3.0);
}

float sq(float v) {
  return v * v;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Closest approach of p to segment a-b. Keeps the squared distance, the signed
// distance (positive on the path's left) and how far along the path it is.
void segment(vec2 p, vec2 a, vec2 b, float index,
             inout float bestD, inout float bestS, inout float bestT) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  vec2 d = p - (a + ab * h);
  float dd = dot(d, d);
  if (dd < bestD) {
    vec2 dir = normalize(ab);
    float side = dot(d, vec2(dir.y, -dir.x));
    bestD = dd;
    bestS = (side < 0.0 ? -1.0 : 1.0) * sqrt(dd);
    bestT = (index + h) / ${(RIBBON_SAMPLES - 1).toFixed(1)};
  }
}

vec2 pathCoord(vec2 p, vec4 pts[${PACKED_SLOTS}]) {
  float bestD = 1e12;
  float bestS = 0.0;
  float bestT = 0.0;
  for (int i = 0; i < ${PACKED_SLOTS - 1}; i++) {
    float index = float(i) * 2.0;
    segment(p, pts[i].xy, pts[i].zw, index, bestD, bestS, bestT);
    segment(p, pts[i].zw, pts[i + 1].xy, index + 1.0, bestD, bestS, bestT);
  }
  return vec2(bestS, bestT);
}

// Four folds stacked outward from the path, innermost first, each partly
// covering the one before and casting a soft shadow onto it.
vec3 drawRibbon(vec3 col, vec2 st, vec3 band, vec4 tone, float taper, float seed) {
  float s = st.x * band.z;
  float t = st.y;
  float shrink = mix(1.0, 0.35, smoothstep(0.62, 1.0, t) * taper);
  float fade = 1.0 - smoothstep(0.80, 1.0, t) * taper;
  float hw = band.y * 0.5 * shrink;
  float aa = 2.0;

  for (int i = 0; i < 4; i++) {
    float k = float(i);
    float breath = 1.0 + 0.14 * sin(u_time * 0.8 + k * 1.3 + t * 7.0 + seed);
    float center = k * band.x * shrink * breath;
    float inner = center - hw;

    if (i > 0) {
      float e = inner - s;
      float shadow = exp(-sq(e / (0.35 * hw))) * step(0.0, e) * 0.22 * fade;
      col *= 1.0 - shadow;
    }

    float n = (s - center) / hw;
    float inside = 1.0 - smoothstep(1.0 - aa / hw, 1.0, abs(n));
    float hue = tone[i] + t * 0.30;
    vec3 c = palette(hue) * mix(1.10, 0.82, (n + 1.0) * 0.5);
    c += vec3(0.30) * exp(-sq((n + 0.80) * 7.0));
    col = mix(col, c, inside * fade);
  }
  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 uv = p / u_resolution;
  float scale = u_resolution.x / mix(390.0, 1440.0, u_wide);

  vec3 col = PAGE;

  // Soft lavender blobs low on both sides.
  vec2 blobA = vec2(0.02, mix(0.86, 0.80, u_wide)) * u_resolution;
  vec2 blobB = vec2(0.98, mix(0.62, 0.70, u_wide)) * u_resolution;
  float r = 260.0 * scale;
  col = mix(col, vec3(0.894, 0.882, 0.984), 0.7 * exp(-dot(p - blobA, p - blobA) / (r * r)));
  col = mix(col, vec3(0.906, 0.898, 0.984), 0.8 * exp(-dot(p - blobB, p - blobB) / (r * r)));

  vec2 left = pathCoord(p, u_left);
  col = drawRibbon(col, left, u_leftBand, vec4(0.80, 0.56, 0.30, 0.06), 1.0, 0.0);

  vec2 right = pathCoord(p, u_right);
  col = drawRibbon(col, right, u_rightBand, vec4(0.40, 0.58, 0.76, 0.92), 0.0, 2.0);

  // A soft white wave the cards sit on.
  float waveY = u_resolution.y * mix(0.80, 0.70, u_wide)
    + 28.0 * scale * sin(uv.x * 5.0 + u_time * 0.2);
  float below = smoothstep(-40.0 * scale, 40.0 * scale, p.y - waveY);
  col = mix(col, vec3(0.984, 0.984, 0.996), below * 0.55);

  // Melt into the page colour at the bottom so the section below has no seam.
  col = mix(col, PAGE, smoothstep(0.88, 1.0, uv.y));
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Canvas pixels per CSS pixel. The folds are soft-edged, so half resolution is invisible. */
export const RENDER_SCALE = 0.5;
const MAX_DPR = 2;
/** From this CSS width the hero sits in two columns and the desktop composition is used. */
export const WIDE_BREAKPOINT_PX = 1024;

export interface RenderSize {
  width: number;
  height: number;
  wide: boolean;
}

export function computeRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): RenderSize {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DPR);
  return {
    width: Math.max(1, Math.round(cssWidth * dpr * RENDER_SCALE)),
    height: Math.max(1, Math.round(cssHeight * dpr * RENDER_SCALE)),
    wide: cssWidth >= WIDE_BREAKPOINT_PX,
  };
}

export interface RibbonSpec {
  /** Width of the layout the points were drawn on. */
  refWidth: number;
  /** Which edge x is measured from, so the ribbon stays pinned to it on wider screens. */
  anchor: 'left' | 'right';
  /** Largest enlargement past the reference width. */
  maxScale: number;
  /** Control points in reference CSS px, y measured down from the top of the background. */
  points: ReadonlyArray<readonly [number, number]>;
  /** Distance between folds and width of one fold, in reference CSS px. */
  spacing: number;
  width: number;
  /** Which side of the path the folds stack on, seen along its direction of travel. */
  side: 'left' | 'right';
}

/**
 * The compositions, drawn against the approved mockup. The left ribbon keeps
 * clear of the hero copy (which starts at x=168 on desktop and is centred on
 * phones) and sweeps under the feature cards.
 */
export const RIBBONS: Record<'wide' | 'narrow', { left: RibbonSpec; right: RibbonSpec }> = {
  wide: {
    left: {
      refWidth: 1440,
      anchor: 'left',
      maxScale: 1.2,
      points: [
        [-120, 30],
        [20, 40],
        [96, 110],
        [100, 230],
        [86, 360],
        [96, 480],
        [124, 600],
        [230, 690],
        [420, 730],
        [640, 745],
        [900, 750],
      ],
      spacing: 34,
      width: 52,
      // Stack outward: off-screen on the vertical run, down behind the cards on
      // the sweep, so the folds never reach into the hero copy.
      side: 'right',
    },
    right: {
      refWidth: 1440,
      anchor: 'right',
      maxScale: 1.2,
      points: [
        [1060, -100],
        [1150, -10],
        [1250, 90],
        [1350, 170],
        [1450, 210],
        [1560, 215],
      ],
      spacing: 36,
      width: 54,
      side: 'left',
    },
  },
  narrow: {
    left: {
      refWidth: 390,
      anchor: 'left',
      maxScale: 1.5,
      points: [
        [-110, 560],
        [-30, 590],
        [20, 680],
        [22, 820],
        [-4, 950],
        [20, 1060],
        [120, 1130],
        [280, 1160],
        [430, 1160],
      ],
      spacing: 22,
      width: 34,
      side: 'left',
    },
    right: {
      refWidth: 390,
      anchor: 'right',
      maxScale: 1.5,
      points: [
        [250, -60],
        [300, 20],
        [350, 80],
        [410, 110],
        [470, 115],
      ],
      spacing: 20,
      width: 30,
      side: 'left',
    },
  },
};

/** How far each control point drifts, in reference px. */
const DRIFT_PX = 10;
/** How far the path leans toward the pointer at full influence, in reference px. */
const POINTER_PULL_PX = 18;
const POINTER_REACH_PX = 170;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export interface RibbonFrame {
  /** RIBBON_SAMPLES points packed two per vec4, in canvas px (y down). */
  packed: Float32Array;
  /** Fold spacing and width in canvas px, then the side the folds stack on (+1 / -1). */
  band: [number, number, number];
}

/**
 * Place a ribbon for one frame: scale and anchor its control points to the
 * canvas, let each drift on its own phase, smooth them into a Catmull-Rom path
 * and bend that path toward the pointer.
 */
export function buildRibbonFrame(
  spec: RibbonSpec,
  cssWidth: number,
  canvasWidth: number,
  timeSeconds: number,
  pointer: readonly [number, number, number],
  canvasHeight: number
): RibbonFrame {
  const cssScale = Math.min(cssWidth / spec.refWidth, spec.maxScale);
  const toCanvas = cssWidth > 0 ? canvasWidth / cssWidth : 0;
  const unit = cssScale * toCanvas;

  const control = spec.points.map(([x, y], i) => {
    const driftX = DRIFT_PX * Math.sin(timeSeconds * 0.6 + i * 1.7);
    const driftY = DRIFT_PX * Math.cos(timeSeconds * 0.5 + i * 1.3);
    const cssX =
      spec.anchor === 'left'
        ? (x + driftX) * cssScale
        : cssWidth - (spec.refWidth - x - driftX) * cssScale;
    return [cssX * toCanvas, (y + driftY) * unit] as const;
  });

  const px = pointer[0] * canvasWidth;
  const py = pointer[1] * canvasHeight;
  const reach = POINTER_REACH_PX * unit;
  const pull = POINTER_PULL_PX * unit * pointer[2];

  const packed = new Float32Array(PACKED_SLOTS * 4);
  const last = control.length - 1;
  for (let s = 0; s < RIBBON_SAMPLES; s++) {
    const u = (s / (RIBBON_SAMPLES - 1)) * last;
    const i = Math.min(Math.floor(u), last - 1);
    const f = u - i;
    const p0 = control[Math.max(i - 1, 0)]!;
    const p1 = control[i]!;
    const p2 = control[i + 1]!;
    const p3 = control[Math.min(i + 2, last)]!;
    let x = catmullRom(p0[0], p1[0], p2[0], p3[0], f);
    let y = catmullRom(p0[1], p1[1], p2[1], p3[1], f);

    if (pull > 0) {
      const dx = px - x;
      const dy = py - y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-3) {
        const weight = Math.exp(-(dist * dist) / (reach * reach));
        x += (dx / dist) * pull * weight;
        y += (dy / dist) * pull * weight;
      }
    }
    packed[s * 2] = x;
    packed[s * 2 + 1] = y;
  }

  return {
    packed,
    band: [spec.spacing * unit, spec.width * unit, spec.side === 'left' ? 1 : -1],
  };
}

export interface AuroraRenderer {
  /** Resize the drawing buffer to the canvas' current CSS box. */
  resize(): void;
  /** Draw one frame at `timeSeconds` of animation time. */
  render(timeSeconds: number, pointer: readonly [number, number, number]): void;
  dispose(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[AuroraBackground] shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Build a renderer on `canvas`, or return null when WebGL is unavailable, too
 * small for the shader, or the program fails to build — callers then keep the
 * CSS fallback on screen.
 */
export function createAuroraRenderer(
  canvas: HTMLCanvasElement,
  getDevicePixelRatio: () => number = () => window.devicePixelRatio
): AuroraRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  }) as WebGLRenderingContext | null;
  if (!gl) return null;

  // Distances are measured in pixels, which overflow mediump (max ~16384).
  const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!high || high.precision === 0) {
    console.warn('[AuroraBackground] no highp in fragment shaders; keeping the CSS fallback.');
    return null;
  }

  const uniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number;
  if (uniformVectors < MIN_FRAGMENT_UNIFORM_VECTORS) {
    console.warn(
      `[AuroraBackground] GPU allows ${uniformVectors} fragment uniform vectors; ` +
        `the shader needs ${MIN_FRAGMENT_UNIFORM_VECTORS}. Keeping the CSS fallback.`
    );
    return null;
  }

  const vs = compile(gl, gl.VERTEX_SHADER, AURORA_VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, AURORA_FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[AuroraBackground] program link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // One oversized triangle covers the viewport with no diagonal seam.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, 'u_resolution');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uWide = gl.getUniformLocation(program, 'u_wide');
  const uLeft = gl.getUniformLocation(program, 'u_left');
  const uRight = gl.getUniformLocation(program, 'u_right');
  const uLeftBand = gl.getUniformLocation(program, 'u_leftBand');
  const uRightBand = gl.getUniformLocation(program, 'u_rightBand');

  let wide = true;
  let cssWidth = canvas.clientWidth;

  const resize = () => {
    cssWidth = canvas.clientWidth;
    const size = computeRenderSize(cssWidth, canvas.clientHeight, getDevicePixelRatio());
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    wide = size.wide;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  resize();

  return {
    resize,
    render(timeSeconds, pointer) {
      const layout = wide ? RIBBONS.wide : RIBBONS.narrow;
      const left = buildRibbonFrame(
        layout.left,
        cssWidth,
        canvas.width,
        timeSeconds,
        pointer,
        canvas.height
      );
      const right = buildRibbonFrame(
        layout.right,
        cssWidth,
        canvas.width,
        timeSeconds + 3.1,
        pointer,
        canvas.height
      );
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, timeSeconds);
      gl.uniform1f(uWide, wide ? 1 : 0);
      gl.uniform4fv(uLeft, left.packed);
      gl.uniform4fv(uRight, right.packed);
      gl.uniform3f(uLeftBand, left.band[0], left.band[1], left.band[2]);
      gl.uniform3f(uRightBand, right.band[0], right.band[1], right.band[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
