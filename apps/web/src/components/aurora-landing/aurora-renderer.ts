/**
 * Aurora background renderer: the mockup's own ribbons, animated.
 *
 * Three passes per frame:
 *  1. ground: one full-screen fragment shader paints the page gradient, white
 *     wave and lavender circle, regenerated from measurements of the mockup;
 *  2. ribbons: each cut-out ribbon is drawn on a strip that follows its spine
 *     (aurora-ribbon-mesh). The strip stays put while the painted sheets slide
 *     across one another, as sheets do when they turn; the waves travel toward
 *     the tail and die out there while new ones start at the anchored edge. A
 *     light line runs along with them;
 *  3. touch: pointer strokes over a ribbon stir a small fluid simulation
 *     (aurora-fluid) whose velocity swirls the artwork and whose dye carries
 *     the ribbon's own colour, then everything settles back.
 * Every motion term is gated by the ramp, which is 0 at t=0, so the first frame
 * is the mockup itself.
 *
 * Kept free of React so the GL plumbing can be unit-tested with a fake context.
 */
import { createAuroraFluid, type AuroraFluid } from './aurora-fluid';
import {
  buildRibbonMesh,
  RIBBON_SPECS,
  RIBBON_VERTEX_FLOATS,
  type RibbonSpec,
} from './aurora-ribbon-mesh';
import { GROUND, type AuroraScene, type Placement } from './aurora-scene';

export const AURORA_VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const AURORA_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_res;        // canvas px
uniform float u_time;
uniform float u_ramp;      // 0 at t=0 rising to 1: gates every motion term

// Ground placement in canvas px: (offsetX, offsetY, scale). Frame px = (p - offset) / scale.
uniform vec3 u_groundAt;

uniform vec3 u_grad[6];    // degree-2 polynomial per channel, 0-255
uniform vec4 u_wave;       // c0, c1, c2, c3 (frame px)
uniform float u_wavePeriod;
uniform vec3 u_waveColor;
uniform vec3 u_circle;     // centre x, centre y, radius (frame px)
uniform vec4 u_circleColor; // rgb, alpha

const float TAU = 6.2831853;

vec2 toFrame(vec2 p, vec3 at) {
  return (p - at.xy) / at.z;
}

vec3 gradient(vec2 p) {
  vec2 n = p / u_res * 2.0 - 1.0;
  vec3 c = u_grad[0] + u_grad[1] * n.x + u_grad[2] * n.y
         + u_grad[3] * n.x * n.x + u_grad[4] * n.x * n.y + u_grad[5] * n.y * n.y;
  return c / 255.0;
}

float waveCover(vec2 f, float blur) {
  float w = TAU / u_wavePeriod;
  float edge = u_wave.x + u_wave.y * f.x + u_wave.z * cos(w * f.x) + u_wave.w * sin(w * f.x);
  edge += 9.0 * u_ramp * sin(u_time * TAU / 12.0 + f.x * 0.0035);
  return smoothstep(edge - blur, edge + blur, f.y);
}

float circleCover(vec2 f, float blur) {
  float r = u_circle.z + 6.0 * u_ramp * sin(u_time * TAU / 14.0 + 1.7);
  float d = distance(f, u_circle.xy);
  return u_circleColor.a * (1.0 - smoothstep(r - blur, r + blur, d));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);

  vec3 col = gradient(p);
  vec2 g = toFrame(p, u_groundAt);
  float blur = 1.5 / u_groundAt.z;
  col = mix(col, u_waveColor, waveCover(g, 3.0 + blur));
  col = mix(col, u_circleColor.rgb, circleCover(g, 4.0 + blur));

  gl_FragColor = vec4(col, 1.0);
}
`;

export const RIBBON_VERTEX_SHADER = `
attribute vec2 a_rest;     // this vertex, frame px (the strip never moves)
attribute vec2 a_out;      // the outside and inside edge of this cross-section, frame px
attribute vec2 a_in;
attribute float a_u;       // 0 at the anchored edge, 1 at the tail
attribute float a_v;       // -1 outside edge, 1 inside edge
uniform vec2 u_res;        // canvas px
uniform vec3 u_at;         // placement in canvas px: offsetX, offsetY, scale
varying vec2 v_out;
varying vec2 v_in;
varying vec2 v_screen;
varying float v_u;
varying float v_v;
void main() {
  vec2 p = u_at.xy + u_at.z * a_rest;
  vec2 c = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_out = a_out;
  v_in = a_in;
  v_u = a_u;
  v_v = a_v;
  v_screen = vec2(p.x / u_res.x, 1.0 - p.y / u_res.y);
}
`;

export const RIBBON_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_image;    // premultiplied cut-out
uniform sampler2D u_velocity; // touch fluid, canvas-sized, y up
uniform vec4 u_art;           // image rectangle, frame px
uniform vec2 u_anchor;        // u range where the motion eases in from the anchored edge
uniform float u_time;
uniform float u_ramp;
uniform float u_light;        // shading strength for this ribbon
uniform float u_phase;        // keeps the two sides out of step
uniform float u_fluid;        // 0 when idle: then the fluid has no effect at all

varying vec2 v_out;
varying vec2 v_in;
varying vec2 v_screen;
varying float v_u;
varying float v_v;

const float TAU = 6.2831853;
const float PI = 3.14159265;
const float AMP = 0.11;         // how far the sheets slide across the ribbon, as a share of its width
const float FOLDS = 3.0;        // bands across the ribbon that move against each other
const float WAVES = 1.0;        // waves along the ribbon
const float SPEED = 0.2;        // waves per second, travelling toward the tail
const float LIGHT = 0.4;        // brighter where sheets spread, darker where they bunch
const float SHEEN = 0.2;        // the light lines running to the tail
const float SHEEN_SPEED = 0.1;
const float WARP = 3.5;         // frame px of swirl per unit of fluid velocity
const float MAX_WARP = 40.0;    // the ribbon bends under a finger, it never shreds

// Clamped, not cut: where a ribbon runs off the page the image touches its own
// border, and a look-up that slides past it must keep finding the ribbon there.
// Every other border of the cut-outs is transparent, so clamping changes nothing else.
vec4 art(vec2 p) {
  return texture2D(u_image, clamp((p - u_art.xy) / u_art.zw, 0.0, 1.0));
}

void main() {
  // Motion lives in the ribbon's own coordinates: the silhouette stays put while
  // the painted sheets slide across one another.
  float wave = sin(TAU * (WAVES * v_u - SPEED * u_time) + u_phase);
  float env = smoothstep(u_anchor.x, u_anchor.y, v_u) * (1.0 - smoothstep(0.75, 1.0, v_u));
  float x = PI * (v_v + 1.0) * 0.5 * FOLDS;
  float amp = AMP * wave * env * u_ramp;
  float v2 = v_v + amp * sin(x);
  float stretch = 1.0 + amp * cos(x) * PI * 0.5 * FOLDS;
  vec2 p = mix(v_out, v_in, (v2 + 1.0) * 0.5);

  vec2 d = texture2D(u_velocity, v_screen).xy * u_fluid * WARP;
  float m = length(d);
  if (m > MAX_WARP) d *= MAX_WARP / m;
  p -= vec2(d.x, -d.y);

  vec4 c = art(p);
  float shade = 1.0 + LIGHT * u_light * (stretch - 1.0);
  float head = fract(SHEEN_SPEED * u_time);
  float line = 0.0;
  for (int i = 0; i < 2; i++) {
    float q = fract(head + float(i) * 0.5);
    float g = (v_u - q) * 16.0;
    line += exp(-g * g) * (1.0 - smoothstep(0.55, 0.95, q));
  }
  line *= (0.5 + 0.5 * sin(x * 2.0 + 1.0)) * u_ramp;
  vec3 rgb = c.rgb * shade + c.a * SHEEN * line;
  gl_FragColor = vec4(min(rgb, vec3(c.a)), c.a);
}
`;

export const DYE_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const DYE_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_dye;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec3 c = texture2D(u_dye, v_uv).rgb;
  float m = max(c.r, max(c.g, c.b));
  vec3 hue = c / max(m, 0.0001);    // the stirred ribbon colour, never blown out to white
  float a = (1.0 - exp(-3.0 * m)) * u_strength;
  gl_FragColor = vec4(hue * a, a);
}
`;

/** Device pixels per CSS pixel are capped here: the artwork is soft, so more buys nothing. */
const MAX_PIXEL_RATIO = 1.5;
/** Drawing-buffer limits: stay inside every GPU's viewport and bound the per-frame work. */
const MAX_BUFFER_SIDE = 4096;
const MAX_BUFFER_PIXELS = 4_000_000;
/** Seconds for the motion to ease in from the still first frame. */
const RAMP_SECONDS = 1.2;

export function rampAt(timeSeconds: number): number {
  return 1 - Math.exp(-Math.max(0, timeSeconds) / (RAMP_SECONDS * 0.5));
}

export interface RenderSize {
  width: number;
  height: number;
}

export function computeRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): RenderSize {
  let ratio = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_PIXEL_RATIO);
  const w = Math.max(cssWidth, 1);
  const h = Math.max(cssHeight, 1);
  // Shrink the buffer (the browser scales it back up) rather than exceed a limit.
  ratio = Math.min(
    ratio,
    MAX_BUFFER_SIDE / w,
    MAX_BUFFER_SIDE / h,
    Math.sqrt(MAX_BUFFER_PIXELS / (w * h))
  );
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}

/** Dye added per stroke, times the ribbon's alpha: a light wash, never an opaque blob. */
const STIR_DYE = 0.07;
/** Seconds after the last stroke until the fluid has let go completely. */
const STIR_SETTLE_SECONDS = 3.5;
/** Opacity of the stirred colour over the scene. */
const DYE_STRENGTH = 0.55;
/** Longest simulation step: a stalled tab must not blow the fluid up on its return. */
const MAX_STEP_SECONDS = 0.05;

export interface AuroraRenderer {
  /** Resize the drawing buffer to the canvas' current CSS box. */
  resize(): void;
  /** Draw one frame of `scene` at `timeSeconds` of animation time. */
  render(timeSeconds: number, scene: AuroraScene): void;
  /** True when this GPU can run the touch fluid. */
  readonly interactive: boolean;
  /**
   * Stir the fluid at CSS point (x, y), moving by (dx, dy) CSS px, with the
   * ribbon colour under the pointer (straight RGB plus alpha, 0-1). Returns
   * false when the GPU cannot run the fluid.
   */
  stir(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: readonly [number, number, number, number]
  ): boolean;
  /** True once the GPU has dropped the context; nothing drawn will show. */
  isContextLost(): boolean;
  dispose(): void;
}

export interface AuroraImages {
  ribbon: TexImageSource;
  veil: TexImageSource;
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

interface Linked {
  program: WebGLProgram;
  shaders: [WebGLShader, WebGLShader];
}

function link(gl: WebGLRenderingContext, vertex: string, fragment: string): Linked | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
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
  return { program, shaders: [vs, fs] };
}

function upload(gl: WebGLRenderingContext, image: TexImageSource): WebGLTexture | null {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Image row 0 is the top, matching the shader's y-down frame coordinates.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // Premultiplied, so linear filtering at soft edges never pulls in a dark fringe.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Draw order, back to front: the right ribbon, then the left one. */
const STRIPS = ['veil', 'ribbon'] as const;

/**
 * Build a renderer on `canvas`, or return null when WebGL is unavailable, lacks
 * highp, or a program fails to build — callers then keep the still images. The
 * touch fluid is optional: without half-float render targets the ribbons still
 * animate and `interactive` is false.
 */
export function createAuroraRenderer(
  canvas: HTMLCanvasElement,
  images: AuroraImages,
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

  // Frame coordinates run to ~2700 px, past what mediump can hold precisely.
  const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!high || high.precision === 0) {
    console.warn('[AuroraBackground] no highp in fragment shaders; keeping the still images.');
    return null;
  }

  const linked: Linked[] = [];
  const release = () => {
    for (const l of linked) {
      gl.deleteProgram(l.program);
      gl.deleteShader(l.shaders[0]);
      gl.deleteShader(l.shaders[1]);
    }
  };
  const build = (vertex: string, fragment: string) => {
    const l = link(gl, vertex, fragment);
    if (l) linked.push(l);
    return l;
  };
  const ground = build(AURORA_VERTEX_SHADER, AURORA_FRAGMENT_SHADER);
  const ribbons = ground && build(RIBBON_VERTEX_SHADER, RIBBON_FRAGMENT_SHADER);
  const dyePass = ribbons && build(DYE_VERTEX_SHADER, DYE_FRAGMENT_SHADER);
  if (!ground || !ribbons || !dyePass) {
    release();
    return null;
  }

  // One oversized triangle covers the viewport with no diagonal seam.
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const strips = STRIPS.map((key) => {
    const spec: RibbonSpec = RIBBON_SPECS[key];
    const data = buildRibbonMesh(spec);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const texture = upload(gl, images[key]);
    return { key, spec, buffer, texture, count: data.length / RIBBON_VERTEX_FLOATS };
  });

  const uniforms = (l: Linked) => {
    const cache = new Map<string, WebGLUniformLocation | null>();
    return (name: string) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(l.program, name));
      return cache.get(name) ?? null;
    };
  };
  const g = uniforms(ground);
  const r = uniforms(ribbons);
  const d = uniforms(dyePass);

  // Ground constants measured from the mockup: set once.
  gl.useProgram(ground.program);
  const { gradient, wave, circle } = GROUND;
  const packed = new Float32Array(18);
  for (let i = 0; i < 6; i++) {
    packed[i * 3] = gradient.r[i]!;
    packed[i * 3 + 1] = gradient.g[i]!;
    packed[i * 3 + 2] = gradient.b[i]!;
  }
  gl.uniform3fv(g('u_grad'), packed);
  gl.uniform4f(g('u_wave'), wave.coefs[0], wave.coefs[1], wave.coefs[2], wave.coefs[3]);
  gl.uniform1f(g('u_wavePeriod'), wave.period);
  gl.uniform3f(g('u_waveColor'), wave.color[0], wave.color[1], wave.color[2]);
  gl.uniform3f(g('u_circle'), circle.x, circle.y, circle.radius);
  gl.uniform4f(g('u_circleColor'), circle.color[0], circle.color[1], circle.color[2], circle.alpha);

  const groundPosition = gl.getAttribLocation(ground.program, 'a_position');
  const dyePosition = gl.getAttribLocation(dyePass.program, 'a_position');
  const ribbonAttributes = (
    [
      ['a_rest', 2, 0],
      ['a_out', 2, 8],
      ['a_in', 2, 16],
      ['a_u', 1, 24],
      ['a_v', 1, 28],
    ] as const
  ).map(
    ([name, size, offset]) => [gl.getAttribLocation(ribbons.program, name), size, offset] as const
  );

  let cssWidth = canvas.clientWidth;
  let lastTime: number | null = null;
  let energy = 0; // 1 right after a stroke, easing to 0 as the fluid settles
  let fluid: AuroraFluid | null = null;

  const resize = () => {
    cssWidth = canvas.clientWidth;
    const size = computeRenderSize(cssWidth, canvas.clientHeight, getDevicePixelRatio());
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    fluid?.resize(canvas.width, canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const placement = (location: WebGLUniformLocation | null, p: Placement, k: number) =>
    gl.uniform3f(location, p.offsetX * k, p.offsetY * k, p.scale * k);

  const fullScreen = (position: number) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  resize();
  try {
    fluid = createAuroraFluid(gl, canvas.width, canvas.height);
  } catch (error) {
    console.warn('[AuroraBackground] touch fluid unavailable:', error);
  }

  return {
    resize,
    interactive: fluid !== null,
    render(timeSeconds, scene) {
      const k = cssWidth > 0 ? canvas.width / cssWidth : 1;
      const ramp = rampAt(timeSeconds);
      const dt =
        lastTime === null ? 0 : Math.min(Math.max(timeSeconds - lastTime, 0), MAX_STEP_SECONDS);
      lastTime = timeSeconds;
      if (fluid && energy > 0) {
        fluid.step(dt);
        energy = Math.max(0, energy - dt / STIR_SETTLE_SECONDS);
      }
      const stirred = smooth(energy);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);

      gl.useProgram(ground.program);
      gl.uniform2f(g('u_res'), canvas.width, canvas.height);
      gl.uniform1f(g('u_time'), timeSeconds);
      gl.uniform1f(g('u_ramp'), ramp);
      placement(g('u_groundAt'), scene.ground, k);
      fullScreen(groundPosition);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(ribbons.program);
      gl.uniform2f(r('u_res'), canvas.width, canvas.height);
      gl.uniform1f(r('u_time'), timeSeconds);
      gl.uniform1f(r('u_ramp'), ramp);
      gl.uniform1f(r('u_fluid'), fluid ? stirred : 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fluid ? fluid.velocity() : null);
      gl.uniform1i(r('u_velocity'), 1);
      for (const strip of strips) {
        const { spec } = strip;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, strip.texture);
        gl.uniform1i(r('u_image'), 0);
        gl.uniform4f(r('u_art'), spec.art.x, spec.art.y, spec.art.width, spec.art.height);
        gl.uniform2f(r('u_anchor'), spec.anchor[0], spec.anchor[1]);
        gl.uniform1f(r('u_light'), spec.light);
        gl.uniform1f(r('u_phase'), spec.phase);
        placement(r('u_at'), scene[strip.key], k);
        gl.bindBuffer(gl.ARRAY_BUFFER, strip.buffer);
        for (const [location, size, offset] of ribbonAttributes) {
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, RIBBON_VERTEX_FLOATS * 4, offset);
        }
        gl.drawArrays(gl.TRIANGLES, 0, strip.count);
      }

      if (fluid && stirred > 0) {
        gl.useProgram(dyePass.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fluid.dye());
        gl.uniform1i(d('u_dye'), 0);
        // Fade the wash out before the simulation stops stepping.
        gl.uniform1f(d('u_strength'), DYE_STRENGTH * Math.min(1, stirred * 4));
        fullScreen(dyePosition);
      }
      gl.disable(gl.BLEND);
    },
    stir(x, y, dx, dy, color) {
      if (!fluid) return false;
      const k = cssWidth > 0 ? canvas.width / cssWidth : 1;
      const amount = STIR_DYE * color[3];
      fluid.splat(x * k, y * k, dx * k, dy * k, [
        color[0] * amount,
        color[1] * amount,
        color[2] * amount,
      ]);
      energy = 1;
      return true;
    },
    isContextLost() {
      return gl.isContextLost();
    },
    dispose() {
      gl.deleteBuffer(triangle);
      for (const strip of strips) {
        gl.deleteBuffer(strip.buffer);
        gl.deleteTexture(strip.texture);
      }
      fluid?.dispose();
      release();
    },
  };
}
