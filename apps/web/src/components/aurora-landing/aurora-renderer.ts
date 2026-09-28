/**
 * Aurora background renderer — the mockup's own ribbon, animated.
 *
 * The left ribbon and right veil are cut-out images of the approved artwork.
 * One full-screen fragment shader paints the ground procedurally (page
 * gradient, white wave, lavender circle, all regenerated from measurements of
 * the mockup), then samples the two images through a smooth, time-varying
 * displacement field: zero where each ribbon enters the frame, largest in the
 * tail, with a different phase per row so the folds slide against each other.
 * The field is zero at t=0, so the first frame is the mockup itself.
 *
 * Kept free of React so the GL plumbing can be unit-tested with a fake context.
 */
import { ARTWORK, GROUND, type AuroraScene, type Placement } from './aurora-scene';

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

uniform sampler2D u_ribbon;
uniform sampler2D u_veil;

// Placements in canvas px: (offsetX, offsetY, scale). Frame px = (p - offset) / scale.
uniform vec3 u_ribbonAt;
uniform vec3 u_veilAt;
uniform vec3 u_groundAt;

uniform vec4 u_ribbonRect; // x, y, w, h of the image in frame px
uniform vec4 u_veilRect;

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
  edge += 3.0 * u_ramp * sin(u_time * TAU / 22.0 + f.x * 0.0015);
  return smoothstep(edge - blur, edge + blur, f.y);
}

float circleCover(vec2 f, float blur) {
  float r = u_circle.z + 2.0 * u_ramp * sin(u_time * TAU / 26.0 + 1.7);
  float d = distance(f, u_circle.xy);
  return u_circleColor.a * (1.0 - smoothstep(r - blur, r + blur, d));
}

// u: 0 at the anchored edge, 1 at the free edge. v: row fraction, only shifts phase.
vec2 flow(vec2 amp, vec2 periodX, vec2 periodY, float bands, float u, float v) {
  float reach = smoothstep(0.0, 1.0, u);
  float phase = v * bands * TAU;
  float dx = sin(u_time * TAU / periodX.x + phase) * 0.62
           + sin(u_time * TAU / periodX.y + phase * 1.7 + 1.3) * 0.38;
  float dy = sin(u_time * TAU / periodY.x + phase * 0.6 + 0.7) * 0.7
           + sin(u_time * TAU / periodY.y * 1.31 + phase * 1.2 + 2.1) * 0.3;
  return vec2(dx * amp.x, dy * amp.y) * reach * u_ramp;
}

vec4 layer(sampler2D tex, vec4 rect, vec2 f, vec2 amp, vec2 periodX, vec2 periodY,
           float bands, float anchorRight) {
  vec2 local = (f - rect.xy) / rect.zw;
  float u = anchorRight > 0.5 ? 1.0 - local.x : local.x;
  vec2 warped = (f + flow(amp, periodX, periodY, bands, u, local.y) - rect.xy) / rect.zw;
  if (warped.x < 0.0 || warped.y < 0.0 || warped.x > 1.0 || warped.y > 1.0) return vec4(0.0);
  return texture2D(tex, warped);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);

  vec3 col = gradient(p);
  vec2 g = toFrame(p, u_groundAt);
  float blur = 1.5 / u_groundAt.z;
  col = mix(col, u_waveColor, waveCover(g, 3.0 + blur));
  col = mix(col, u_circleColor.rgb, circleCover(g, 4.0 + blur));

  vec4 veil = layer(u_veil, u_veilRect, toFrame(p, u_veilAt),
                    vec2(9.0, 6.0), vec2(8.5, 12.5), vec2(10.5, 10.5), 2.3, 1.0);
  col = col * (1.0 - veil.a) + veil.rgb;

  vec2 rf = toFrame(p, u_ribbonAt);
  vec4 rib = layer(u_ribbon, u_ribbonRect, rf,
                   vec2(17.0, 11.0), vec2(6.5, 10.0), vec2(8.2, 5.3), 3.1, 0.0);
  // A faint light sheen drifting along the folds, only where the ribbon is.
  float diag = (rf.x - u_ribbonRect.x) / u_ribbonRect.z + (rf.y - u_ribbonRect.y) / u_ribbonRect.w;
  float sheen = smoothstep(0.16, 0.0, abs(fract(diag - u_time * 0.055) - 0.5)) * 0.05 * u_ramp;
  col = col * (1.0 - rib.a) + rib.rgb + sheen * rib.a;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Device pixels per CSS pixel are capped here: the artwork is soft, so more buys nothing. */
const MAX_PIXEL_RATIO = 1.5;
/** Drawing-buffer limits: stay inside every GPU's viewport and bound the per-frame work. */
const MAX_BUFFER_SIDE = 4096;
const MAX_BUFFER_PIXELS = 4_000_000;
/** Seconds for the motion to ease in from the still first frame. */
const RAMP_SECONDS = 2.4;

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

export interface AuroraRenderer {
  /** Resize the drawing buffer to the canvas' current CSS box. */
  resize(): void;
  /** Draw one frame of `scene` at `timeSeconds` of animation time. */
  render(timeSeconds: number, scene: AuroraScene): void;
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

/**
 * Build a renderer on `canvas`, or return null when WebGL is unavailable, lacks
 * highp, or the program fails to build — callers then keep the still images.
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

  // Frame coordinates run to ~1400 px, past what mediump can hold precisely.
  const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!high || high.precision === 0) {
    console.warn('[AuroraBackground] no highp in fragment shaders; keeping the still images.');
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

  gl.activeTexture(gl.TEXTURE0);
  const ribbonTexture = upload(gl, images.ribbon);
  gl.activeTexture(gl.TEXTURE1);
  const veilTexture = upload(gl, images.veil);

  const at = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(at('u_ribbon'), 0);
  gl.uniform1i(at('u_veil'), 1);

  // Constants measured from the mockup: set once.
  const { gradient, wave, circle } = GROUND;
  const packed = new Float32Array(18);
  for (let i = 0; i < 6; i++) {
    packed[i * 3] = gradient.r[i]!;
    packed[i * 3 + 1] = gradient.g[i]!;
    packed[i * 3 + 2] = gradient.b[i]!;
  }
  gl.uniform3fv(at('u_grad'), packed);
  gl.uniform4f(at('u_wave'), wave.coefs[0], wave.coefs[1], wave.coefs[2], wave.coefs[3]);
  gl.uniform1f(at('u_wavePeriod'), wave.period);
  gl.uniform3f(at('u_waveColor'), wave.color[0], wave.color[1], wave.color[2]);
  gl.uniform3f(at('u_circle'), circle.x, circle.y, circle.radius);
  gl.uniform4f(
    at('u_circleColor'),
    circle.color[0],
    circle.color[1],
    circle.color[2],
    circle.alpha
  );
  const { ribbon, veil } = ARTWORK;
  gl.uniform4f(at('u_ribbonRect'), ribbon.x, ribbon.y, ribbon.width, ribbon.height);
  gl.uniform4f(at('u_veilRect'), veil.x, veil.y, veil.width, veil.height);

  const uRes = at('u_res');
  const uTime = at('u_time');
  const uRamp = at('u_ramp');
  const uRibbonAt = at('u_ribbonAt');
  const uVeilAt = at('u_veilAt');
  const uGroundAt = at('u_groundAt');

  let cssWidth = canvas.clientWidth;

  const resize = () => {
    cssWidth = canvas.clientWidth;
    const size = computeRenderSize(cssWidth, canvas.clientHeight, getDevicePixelRatio());
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const placement = (location: WebGLUniformLocation | null, p: Placement, k: number) =>
    gl.uniform3f(location, p.offsetX * k, p.offsetY * k, p.scale * k);

  resize();

  return {
    resize,
    render(timeSeconds, scene) {
      const k = cssWidth > 0 ? canvas.width / cssWidth : 1;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, timeSeconds);
      gl.uniform1f(uRamp, rampAt(timeSeconds));
      placement(uRibbonAt, scene.ribbon, k);
      placement(uVeilAt, scene.veil, k);
      placement(uGroundAt, scene.ground, k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    isContextLost() {
      return gl.isContextLost();
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(ribbonTexture);
      gl.deleteTexture(veilTexture);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
