/**
 * A small stable-fluids solver for the "stir the ribbon" touch effect, after
 * Pavel Dobryakov's WebGL-Fluid-Simulation (MIT): splat, curl, vorticity,
 * divergence, pressure (Jacobi), gradient subtract, advection.
 *
 * It keeps a velocity field (read by the ribbon shader to swirl the artwork)
 * and a dye field (the stirred ribbon colour, drawn over the scene). Both run
 * at a fraction of the canvas resolution. It needs half-float render targets;
 * on GPUs without them it returns null and the page simply has no touch effect.
 */

export const FLUID = {
  /** Short side of the velocity grid, cells. */
  simShortSide: 128,
  /** Short side of the dye texture, texels. */
  dyeShortSide: 512,
  /** Per-second decay: velocity fades quickly so the ribbon settles; dye lingers a little. */
  velocityDissipation: 1.8,
  dyeDissipation: 1.1,
  pressureRetain: 0.8,
  pressureIterations: 18,
  curl: 8,
  /** Gaussian splat radius in squared uv units. */
  radius: 0.0007,
  /** Velocity injected per canvas pixel of pointer travel (scaled by canvas width). */
  force: 1800,
} as const;

export const FLUID_VERTEX_SHADER = `
attribute vec2 a_position;
uniform vec2 u_texel;
varying vec2 v_uv;
varying vec2 v_l;
varying vec2 v_r;
varying vec2 v_t;
varying vec2 v_b;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_l = v_uv - vec2(u_texel.x, 0.0);
  v_r = v_uv + vec2(u_texel.x, 0.0);
  v_t = v_uv + vec2(0.0, u_texel.y);
  v_b = v_uv - vec2(0.0, u_texel.y);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const HEADER = `
precision highp float;
varying vec2 v_uv;
varying vec2 v_l;
varying vec2 v_r;
varying vec2 v_t;
varying vec2 v_b;
`;

export const FLUID_SHADERS = {
  splat: `${HEADER}
uniform sampler2D u_target;
uniform float u_aspect;
uniform float u_radius;
uniform vec3 u_color;
uniform vec2 u_point;
void main() {
  vec2 p = v_uv - u_point;
  p.x *= u_aspect;
  vec3 s = exp(-dot(p, p) / u_radius) * u_color;
  gl_FragColor = vec4(texture2D(u_target, v_uv).xyz + s, 1.0);
}`,
  advect: `${HEADER}
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_velTexel;
uniform float u_dt;
uniform float u_dissipation;
void main() {
  vec2 coord = v_uv - u_dt * texture2D(u_velocity, v_uv).xy * u_velTexel;
  gl_FragColor = texture2D(u_source, coord) / (1.0 + u_dissipation * u_dt);
}`,
  divergence: `${HEADER}
uniform sampler2D u_velocity;
void main() {
  float l = texture2D(u_velocity, v_l).x;
  float r = texture2D(u_velocity, v_r).x;
  float t = texture2D(u_velocity, v_t).y;
  float b = texture2D(u_velocity, v_b).y;
  vec2 c = texture2D(u_velocity, v_uv).xy;
  if (v_l.x < 0.0) l = -c.x;
  if (v_r.x > 1.0) r = -c.x;
  if (v_t.y > 1.0) t = -c.y;
  if (v_b.y < 0.0) b = -c.y;
  gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`,
  curl: `${HEADER}
uniform sampler2D u_velocity;
void main() {
  float l = texture2D(u_velocity, v_l).y;
  float r = texture2D(u_velocity, v_r).y;
  float t = texture2D(u_velocity, v_t).x;
  float b = texture2D(u_velocity, v_b).x;
  gl_FragColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}`,
  vorticity: `${HEADER}
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform float u_curlStrength;
uniform float u_dt;
void main() {
  float l = texture2D(u_curl, v_l).x;
  float r = texture2D(u_curl, v_r).x;
  float t = texture2D(u_curl, v_t).x;
  float b = texture2D(u_curl, v_b).x;
  float c = texture2D(u_curl, v_uv).x;
  vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  force /= length(force) + 0.0001;
  force *= u_curlStrength * c;
  force.y *= -1.0;
  vec2 v = texture2D(u_velocity, v_uv).xy + force * u_dt;
  gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
  pressure: `${HEADER}
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
void main() {
  float l = texture2D(u_pressure, v_l).x;
  float r = texture2D(u_pressure, v_r).x;
  float t = texture2D(u_pressure, v_t).x;
  float b = texture2D(u_pressure, v_b).x;
  float d = texture2D(u_divergence, v_uv).x;
  gl_FragColor = vec4((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: `${HEADER}
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
void main() {
  float l = texture2D(u_pressure, v_l).x;
  float r = texture2D(u_pressure, v_r).x;
  float t = texture2D(u_pressure, v_t).x;
  float b = texture2D(u_pressure, v_b).x;
  gl_FragColor = vec4(texture2D(u_velocity, v_uv).xy - vec2(r - l, t - b), 0.0, 1.0);
}`,
  scale: `${HEADER}
uniform sampler2D u_texture;
uniform float u_value;
void main() {
  gl_FragColor = u_value * texture2D(u_texture, v_uv);
}`,
} as const;

type ProgramName = keyof typeof FLUID_SHADERS;

interface Target {
  texture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
}

interface Pair {
  read: Target;
  write: Target;
  swap(): void;
}

interface Program {
  program: WebGLProgram;
  uniform(name: string): WebGLUniformLocation | null;
}

export interface AuroraFluid {
  /** Match the canvas: grids keep their short side and follow the canvas aspect. */
  resize(canvasWidth: number, canvasHeight: number): void;
  /** Push fluid at canvas pixel (x, y), y down, moving by (dx, dy) canvas px; add `color` dye. */
  splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: readonly [number, number, number]
  ): void;
  /** Advance the simulation by `dt` seconds. Leaves the default framebuffer bound. */
  step(dt: number): void;
  velocity(): WebGLTexture | null;
  dye(): WebGLTexture | null;
  dispose(): void;
}

type HalfFloatExtension = { HALF_FLOAT_OES: number };

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[AuroraBackground] fluid shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Build the solver on `gl`, or return null when the GPU cannot render to
 * half-float textures or a program fails to build.
 */
export function createAuroraFluid(
  gl: WebGLRenderingContext,
  canvasWidth: number,
  canvasHeight: number
): AuroraFluid | null {
  const half = gl.getExtension('OES_texture_half_float') as HalfFloatExtension | null;
  if (!half) return null;
  const linear = gl.getExtension('OES_texture_half_float_linear') !== null;
  const type = half.HALF_FLOAT_OES;

  const shaders: WebGLShader[] = [];
  const vs = compile(gl, gl.VERTEX_SHADER, FLUID_VERTEX_SHADER);
  if (!vs) return null;
  shaders.push(vs);
  const programs = {} as Record<ProgramName, Program>;
  const glPrograms: WebGLProgram[] = [];
  const release = () => {
    for (const p of glPrograms) gl.deleteProgram(p);
    for (const s of shaders) gl.deleteShader(s);
  };
  for (const name of Object.keys(FLUID_SHADERS) as ProgramName[]) {
    const fs = compile(gl, gl.FRAGMENT_SHADER, FLUID_SHADERS[name]);
    const program = fs ? gl.createProgram() : null;
    if (!fs || !program) {
      release();
      return null;
    }
    shaders.push(fs);
    glPrograms.push(program);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[AuroraBackground] fluid program link failed:', gl.getProgramInfoLog(program));
      release();
      return null;
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    programs[name] = {
      program,
      uniform(uniform) {
        if (!cache.has(uniform)) cache.set(uniform, gl.getUniformLocation(program, uniform));
        return cache.get(uniform) ?? null;
      },
    };
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const targets: Target[] = [];
  const makeTarget = (width: number, height: number, filter: number): Target => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const target = { texture, framebuffer, width, height };
    targets.push(target);
    return target;
  };
  const makePair = (width: number, height: number, filter: number): Pair => {
    let read = makeTarget(width, height, filter);
    let write = makeTarget(width, height, filter);
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        [read, write] = [write, read];
      },
    };
  };
  const freeTargets = () => {
    for (const t of targets) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    targets.length = 0;
  };

  const filter = linear ? gl.LINEAR : gl.NEAREST;
  let velocity!: Pair;
  let dye!: Pair;
  let pressure!: Pair;
  let divergence!: Target;
  let curl!: Target;
  let aspect = 1;

  const grid = (shortSide: number, w: number, h: number) =>
    w >= h
      ? { width: Math.max(1, Math.round(shortSide * (w / h))), height: shortSide }
      : { width: shortSide, height: Math.max(1, Math.round(shortSide * (h / w))) };

  const allocate = (w: number, h: number) => {
    freeTargets();
    const width = Math.max(w, 1);
    const height = Math.max(h, 1);
    aspect = width / height;
    const sim = grid(FLUID.simShortSide, width, height);
    const dyeSize = grid(FLUID.dyeShortSide, width, height);
    velocity = makePair(sim.width, sim.height, filter);
    dye = makePair(dyeSize.width, dyeSize.height, filter);
    pressure = makePair(sim.width, sim.height, gl.NEAREST);
    divergence = makeTarget(sim.width, sim.height, gl.NEAREST);
    curl = makeTarget(sim.width, sim.height, gl.NEAREST);
  };
  allocate(canvasWidth, canvasHeight);

  // Some GPUs expose the extension but cannot render to it.
  gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.framebuffer);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) {
    freeTargets();
    gl.deleteBuffer(quad);
    release();
    return null;
  }

  const activate = (name: ProgramName, texelOf: Target) => {
    const p = programs[name];
    gl.useProgram(p.program);
    gl.uniform2f(p.uniform('u_texel'), 1 / texelOf.width, 1 / texelOf.height);
    return p;
  };
  const bind = (p: Program, uniform: string, texture: WebGLTexture | null, unit: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(p.uniform(uniform), unit);
  };
  const draw = (p: Program, target: Target) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const position = gl.getAttribLocation(p.program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let width = canvasWidth;
  let height = canvasHeight;

  return {
    resize(w, h) {
      if (w === width && h === height) return;
      width = w;
      height = h;
      allocate(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    splat(x, y, dx, dy, color) {
      gl.disable(gl.BLEND);
      const point = [x / Math.max(width, 1), 1 - y / Math.max(height, 1)] as const;
      const s = activate('splat', velocity.read);
      bind(s, 'u_target', velocity.read.texture, 0);
      gl.uniform1f(s.uniform('u_aspect'), aspect);
      gl.uniform2f(s.uniform('u_point'), point[0], point[1]);
      const k = FLUID.force / Math.max(width, 1);
      gl.uniform3f(s.uniform('u_color'), dx * k, -dy * k, 0);
      gl.uniform1f(s.uniform('u_radius'), FLUID.radius);
      draw(s, velocity.write);
      velocity.swap();
      bind(s, 'u_target', dye.read.texture, 0);
      gl.uniform3f(s.uniform('u_color'), color[0], color[1], color[2]);
      gl.uniform1f(s.uniform('u_radius'), FLUID.radius * 1.6);
      draw(s, dye.write);
      dye.swap();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    step(dt) {
      gl.disable(gl.BLEND);
      let p = activate('curl', velocity.read);
      bind(p, 'u_velocity', velocity.read.texture, 0);
      draw(p, curl);

      p = activate('vorticity', velocity.read);
      bind(p, 'u_velocity', velocity.read.texture, 0);
      bind(p, 'u_curl', curl.texture, 1);
      gl.uniform1f(p.uniform('u_curlStrength'), FLUID.curl);
      gl.uniform1f(p.uniform('u_dt'), dt);
      draw(p, velocity.write);
      velocity.swap();

      p = activate('divergence', velocity.read);
      bind(p, 'u_velocity', velocity.read.texture, 0);
      draw(p, divergence);

      p = activate('scale', pressure.read);
      bind(p, 'u_texture', pressure.read.texture, 0);
      gl.uniform1f(p.uniform('u_value'), FLUID.pressureRetain);
      draw(p, pressure.write);
      pressure.swap();

      p = activate('pressure', pressure.read);
      bind(p, 'u_divergence', divergence.texture, 1);
      for (let i = 0; i < FLUID.pressureIterations; i++) {
        bind(p, 'u_pressure', pressure.read.texture, 0);
        draw(p, pressure.write);
        pressure.swap();
      }

      p = activate('gradient', velocity.read);
      bind(p, 'u_pressure', pressure.read.texture, 0);
      bind(p, 'u_velocity', velocity.read.texture, 1);
      draw(p, velocity.write);
      velocity.swap();

      p = activate('advect', velocity.read);
      gl.uniform2f(p.uniform('u_velTexel'), 1 / velocity.read.width, 1 / velocity.read.height);
      bind(p, 'u_velocity', velocity.read.texture, 0);
      bind(p, 'u_source', velocity.read.texture, 1);
      gl.uniform1f(p.uniform('u_dt'), dt);
      gl.uniform1f(p.uniform('u_dissipation'), FLUID.velocityDissipation);
      draw(p, velocity.write);
      velocity.swap();

      p = activate('advect', dye.read);
      gl.uniform2f(p.uniform('u_velTexel'), 1 / velocity.read.width, 1 / velocity.read.height);
      bind(p, 'u_velocity', velocity.read.texture, 0);
      bind(p, 'u_source', dye.read.texture, 1);
      gl.uniform1f(p.uniform('u_dissipation'), FLUID.dyeDissipation);
      draw(p, dye.write);
      dye.swap();

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    velocity: () => velocity.read.texture,
    dye: () => dye.read.texture,
    dispose() {
      freeTargets();
      gl.deleteBuffer(quad);
      release();
    },
  };
}
