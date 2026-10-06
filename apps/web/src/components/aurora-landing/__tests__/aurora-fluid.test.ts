import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuroraFluid, FLUID, FLUID_SHADERS } from '../aurora-fluid';

const PROGRAMS = Object.keys(FLUID_SHADERS).length;

function makeFakeGl(
  options: {
    halfFloat?: boolean;
    linear?: boolean;
    complete?: boolean;
    compileOk?: boolean;
    linkOk?: boolean;
  } = {}
) {
  const {
    halfFloat = true,
    linear = true,
    complete = true,
    compileOk = true,
    linkOk = true,
  } = options;
  let textures = 0;
  let framebuffers = 0;
  let programs = 0;
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    TEXTURE_2D: 11,
    TEXTURE0: 100,
    RGBA: 16,
    FRAMEBUFFER: 18,
    BLEND: 19,
    LINEAR: 30,
    NEAREST: 31,
    TEXTURE_MIN_FILTER: 32,
    TEXTURE_MAG_FILTER: 33,
    TEXTURE_WRAP_S: 34,
    TEXTURE_WRAP_T: 35,
    CLAMP_TO_EDGE: 36,
    COLOR_ATTACHMENT0: 37,
    COLOR_BUFFER_BIT: 38,
    FRAMEBUFFER_COMPLETE: 39,
    getExtension: vi.fn((name: string) => {
      if (name === 'OES_texture_half_float') return halfFloat ? { HALF_FLOAT_OES: 99 } : null;
      if (name === 'OES_texture_half_float_linear') return linear ? {} : null;
      return null;
    }),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compileOk),
    getShaderInfoLog: vi.fn(() => 'compile log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn((): object | null => ({ program: programs++ })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => linkOk),
    getProgramInfoLog: vi.fn(() => 'link log'),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn((_p: unknown, name: string) => ({ name })),
    getAttribLocation: vi.fn(() => 0),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: vi.fn(() => ({ texture: textures++ })),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    createFramebuffer: vi.fn(() => ({ framebuffer: framebuffers++ })),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => (complete ? 39 : 0)),
    deleteFramebuffer: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    disable: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    drawArrays: vi.fn(),
  };
}

type FakeGl = ReturnType<typeof makeFakeGl>;
const asGl = (gl: FakeGl) => gl as unknown as WebGLRenderingContext;

/** Two pairs (velocity, dye, pressure) and two singles (divergence, curl). */
const TARGETS = 3 * 2 + 2;

describe('createAuroraFluid', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('returns null without half-float textures, before building anything', () => {
    const gl = makeFakeGl({ halfFloat: false });
    expect(createAuroraFluid(asGl(gl), 1440, 1000)).toBeNull();
    expect(gl.createShader).not.toHaveBeenCalled();
  });

  it('returns null and frees everything when the GPU cannot render to half floats', () => {
    const gl = makeFakeGl({ complete: false });
    expect(createAuroraFluid(asGl(gl), 1440, 1000)).toBeNull();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(TARGETS);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(TARGETS);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(PROGRAMS);
    expect(gl.deleteShader).toHaveBeenCalledTimes(PROGRAMS + 1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
  });

  it('returns null when the shared vertex shader fails to compile', () => {
    const gl = makeFakeGl({ compileOk: false });
    expect(createAuroraFluid(asGl(gl), 1440, 1000)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] fluid shader compile failed:',
      'compile log'
    );
  });

  it('returns null when a fragment shader fails, freeing what was built', () => {
    const gl = makeFakeGl();
    gl.getShaderParameter
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    expect(createAuroraFluid(asGl(gl), 1440, 1000)).toBeNull();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  });

  it('returns null when the context cannot create a program', () => {
    const gl = makeFakeGl();
    gl.createProgram.mockReturnValue(null);
    expect(createAuroraFluid(asGl(gl), 1440, 1000)).toBeNull();
  });

  it('returns null and logs when a program fails to link', () => {
    const gl = makeFakeGl({ linkOk: false });
    expect(createAuroraFluid(asGl(gl), 1440, 1000)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[AuroraBackground] fluid program link failed:', 'link log');
  });

  it('sizes its grids by their short side, following the canvas aspect', () => {
    const gl = makeFakeGl();
    createAuroraFluid(asGl(gl), 1440, 1000);
    const sizes = gl.texImage2D.mock.calls.map((c) => `${c[3]}x${c[4]}`);
    expect(sizes).toContain(`${Math.round(FLUID.simShortSide * 1.44)}x${FLUID.simShortSide}`);
    expect(sizes).toContain(`${Math.round(FLUID.dyeShortSide * 1.44)}x${FLUID.dyeShortSide}`);

    const tall = makeFakeGl({ linear: false });
    createAuroraFluid(asGl(tall), 390, 1560);
    const tallSizes = tall.texImage2D.mock.calls.map((c) => `${c[3]}x${c[4]}`);
    expect(tallSizes).toContain(`${FLUID.simShortSide}x${FLUID.simShortSide * 4}`);
    // Without linear half-float filtering, every grid samples nearest.
    expect(tall.texParameteri).not.toHaveBeenCalledWith(11, 32, 30);
  });

  it('splats velocity then dye at the pointer, y flipped, and returns to the screen', () => {
    const gl = makeFakeGl();
    const fluid = createAuroraFluid(asGl(gl), 1000, 500)!;
    gl.drawArrays.mockClear();
    fluid.splat(250, 100, 10, -20, [0.1, 0.2, 0.3]);

    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.uniform2f).toHaveBeenCalledWith({ name: 'u_point' }, 0.25, 0.8);
    const k = FLUID.force / 1000;
    expect(gl.uniform3f).toHaveBeenCalledWith({ name: 'u_color' }, 10 * k, 20 * k, 0);
    expect(gl.uniform3f).toHaveBeenCalledWith({ name: 'u_color' }, 0.1, 0.2, 0.3);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_aspect' }, 2);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  });

  it('runs a full solver step: curl, vorticity, divergence, pressure, gradient, advection', () => {
    const gl = makeFakeGl();
    const fluid = createAuroraFluid(asGl(gl), 1440, 1000)!;
    gl.drawArrays.mockClear();
    fluid.step(1 / 60);

    // curl + vorticity + divergence + pressure decay + Jacobi + gradient + 2 advections
    expect(gl.drawArrays).toHaveBeenCalledTimes(7 + FLUID.pressureIterations);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_dissipation' }, FLUID.velocityDissipation);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_dissipation' }, FLUID.dyeDissipation);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_dt' }, 1 / 60);
    expect(gl.disable).toHaveBeenCalledWith(gl.BLEND);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  });

  it('ping-pongs: the velocity it exposes changes after each write', () => {
    const gl = makeFakeGl();
    const fluid = createAuroraFluid(asGl(gl), 1440, 1000)!;
    const before = fluid.velocity();
    fluid.splat(10, 10, 1, 1, [0, 0, 0]);
    expect(fluid.velocity()).not.toBe(before);
    expect(fluid.dye()).not.toBeNull();
  });

  it('reallocates only when the canvas size changes', () => {
    const gl = makeFakeGl();
    const fluid = createAuroraFluid(asGl(gl), 1440, 1000)!;
    gl.createTexture.mockClear();
    fluid.resize(1440, 1000);
    expect(gl.createTexture).not.toHaveBeenCalled();
    fluid.resize(800, 1000);
    expect(gl.createTexture).toHaveBeenCalledTimes(TARGETS);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(TARGETS);
  });

  it('releases every GL object on dispose', () => {
    const gl = makeFakeGl();
    createAuroraFluid(asGl(gl), 1440, 1000)!.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(TARGETS);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(TARGETS);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(PROGRAMS);
    expect(gl.deleteShader).toHaveBeenCalledTimes(PROGRAMS + 1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
  });
});
