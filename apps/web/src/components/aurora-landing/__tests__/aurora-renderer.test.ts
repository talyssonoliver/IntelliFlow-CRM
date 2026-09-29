/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AURORA_FRAGMENT_SHADER,
  AURORA_VERTEX_SHADER,
  DYE_FRAGMENT_SHADER,
  DYE_VERTEX_SHADER,
  RIBBON_FRAGMENT_SHADER,
  RIBBON_VERTEX_SHADER,
  computeRenderSize,
  createAuroraRenderer,
  rampAt,
} from '../aurora-renderer';
import { FLUID_SHADERS, FLUID_VERTEX_SHADER } from '../aurora-fluid';
import { RIBBON_SPECS } from '../aurora-ribbon-mesh';
import { computeAuroraScene } from '../aurora-scene';

const fluid = {
  resize: vi.fn(),
  splat: vi.fn(),
  step: vi.fn(),
  velocity: vi.fn(() => ({ texture: 'velocity' })),
  dye: vi.fn(() => ({ texture: 'dye' })),
  dispose: vi.fn(),
};
const createAuroraFluid = vi.fn((..._args: unknown[]): typeof fluid | null => null);
vi.mock('../aurora-fluid', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../aurora-fluid')>()),
  createAuroraFluid: (...args: unknown[]) => createAuroraFluid(...args),
}));

type FakeGl = ReturnType<typeof makeFakeGl>;

function makeFakeGl(
  options: { compileOk?: boolean; linkOk?: boolean; shader?: boolean; highPrecision?: number } = {}
) {
  const { compileOk = true, linkOk = true, shader = true, highPrecision = 23 } = options;
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
    HIGH_FLOAT: 10,
    TEXTURE_2D: 11,
    TEXTURE0: 12,
    TEXTURE1: 13,
    UNPACK_FLIP_Y_WEBGL: 14,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 15,
    RGBA: 16,
    UNSIGNED_BYTE: 17,
    FRAMEBUFFER: 18,
    BLEND: 19,
    ONE: 20,
    ONE_MINUS_SRC_ALPHA: 21,
    getShaderPrecisionFormat: vi.fn(() => ({ precision: highPrecision })),
    createShader: vi.fn(() => (shader ? {} : null)),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compileOk),
    getShaderInfoLog: vi.fn(() => 'compile log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn((): object | null => ({ id: programs++ })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => linkOk),
    getProgramInfoLog: vi.fn(() => 'link log'),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    activeTexture: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ name })),
    viewport: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniform3fv: vi.fn(),
    drawArrays: vi.fn(),
    bindFramebuffer: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    isContextLost: vi.fn(() => false),
    deleteBuffer: vi.fn(),
    deleteTexture: vi.fn(),
    deleteProgram: vi.fn(),
  };
}

function makeCanvas(gl: FakeGl | null, cssWidth = 1440, cssHeight = 1000) {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => cssWidth });
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => cssHeight });
  canvas.getContext = vi.fn(() => gl) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

const images = {
  ribbon: document.createElement('img'),
  veil: document.createElement('img'),
};

/** Every call of `mock` whose first argument is the uniform `name`. */
const callsFor = (mock: { mock: { calls: unknown[][] } }, name: string) =>
  mock.mock.calls.filter((call) => (call[0] as { name?: string } | null)?.name === name);

describe('computeRenderSize', () => {
  it('matches the device pixel ratio, capped at 1.5 and floored at 1', () => {
    expect(computeRenderSize(1440, 1000, 1)).toEqual({ width: 1440, height: 1000 });
    expect(computeRenderSize(390, 1000, 3)).toEqual({ width: 585, height: 1500 });
    expect(computeRenderSize(400, 200, 0)).toEqual({ width: 400, height: 200 });
  });

  it('shrinks the buffer to stay within the GPU side and pixel budgets', () => {
    // A very tall page: 1.5x would be 585 x 12000, past the 4096 side limit.
    expect(computeRenderSize(390, 8000, 1.5).height).toBeLessThanOrEqual(4096);
    // A huge desktop: capped near 4 megapixels.
    const big = computeRenderSize(2560, 1600, 1.5);
    expect(big.width * big.height).toBeLessThanOrEqual(4_000_100);
  });

  it('never returns an empty drawing buffer', () => {
    expect(computeRenderSize(0, 0, 1)).toEqual({ width: 1, height: 1 });
  });
});

describe('rampAt', () => {
  it('holds the first frame still and eases the motion in', () => {
    expect(rampAt(0)).toBe(0);
    expect(rampAt(-5)).toBe(0);
    expect(rampAt(0.6)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(rampAt(30)).toBeCloseTo(1, 6);
  });
});

describe('shader sources', () => {
  const sources: Record<string, string> = {
    AURORA_VERTEX_SHADER,
    AURORA_FRAGMENT_SHADER,
    RIBBON_VERTEX_SHADER,
    RIBBON_FRAGMENT_SHADER,
    DYE_VERTEX_SHADER,
    DYE_FRAGMENT_SHADER,
    FLUID_VERTEX_SHADER,
    ...Object.fromEntries(Object.entries(FLUID_SHADERS).map(([k, v]) => [`fluid ${k}`, v])),
  };

  for (const [name, source] of Object.entries(sources)) {
    it(`${name}: no pow() (undefined for negative bases), no reserved words, no backticks`, () => {
      expect(source).not.toMatch(/\bpow\s*\(/);
      expect(source).not.toMatch(/\b(half|fixed|input|output|filter|sample)\b/);
      expect(source).not.toContain('`');
    });
  }

  it('declares every uniform the renderer sets on the ground', () => {
    for (const name of [
      'u_res',
      'u_time',
      'u_ramp',
      'u_groundAt',
      'u_grad',
      'u_wave',
      'u_wavePeriod',
      'u_waveColor',
      'u_circle',
      'u_circleColor',
    ]) {
      expect(AURORA_FRAGMENT_SHADER).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
    }
  });

  it('declares every uniform the renderer sets on the ribbons and the dye', () => {
    const ribbon = RIBBON_VERTEX_SHADER + RIBBON_FRAGMENT_SHADER;
    for (const name of [
      'u_res',
      'u_at',
      'u_image',
      'u_velocity',
      'u_art',
      'u_anchor',
      'u_time',
      'u_ramp',
      'u_light',
      'u_phase',
      'u_fluid',
    ]) {
      expect(ribbon).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
    }
    for (const name of ['u_dye', 'u_strength']) {
      expect(DYE_FRAGMENT_SHADER).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
    }
  });

  it('gates every ribbon motion term by the ramp, so the first frame is the artwork', () => {
    expect(RIBBON_FRAGMENT_SHADER).toMatch(/float amp = AMP \* wave \* env \* u_ramp;/);
    expect(RIBBON_FRAGMENT_SHADER).toMatch(/line \*= .*\* u_ramp;/);
    expect(RIBBON_FRAGMENT_SHADER).toMatch(/\* u_fluid \*/);
  });
});

describe('createAuroraRenderer', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createAuroraFluid.mockReset();
    createAuroraFluid.mockReturnValue(null);
    for (const fn of Object.values(fluid)) fn.mockClear();
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('returns null when the browser has no WebGL', () => {
    expect(createAuroraRenderer(makeCanvas(null), images, () => 1)).toBeNull();
  });

  it('returns null on GPUs without highp fragment precision', () => {
    const gl = makeFakeGl({ highPrecision: 0 });
    expect(createAuroraRenderer(makeCanvas(gl), images, () => 1)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] no highp in fragment shaders; keeping the still images.'
    );
    expect(gl.createShader).not.toHaveBeenCalled();
  });

  it('returns null when the context cannot create shaders', () => {
    expect(
      createAuroraRenderer(makeCanvas(makeFakeGl({ shader: false })), images, () => 1)
    ).toBeNull();
  });

  it('returns null and logs the reason when a shader fails to compile', () => {
    const gl = makeFakeGl({ compileOk: false });
    expect(createAuroraRenderer(makeCanvas(gl), images, () => 1)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[AuroraBackground] shader compile failed:', 'compile log');
    expect(gl.deleteShader).toHaveBeenCalled();
  });

  it('returns null when the program cannot be created', () => {
    const gl = makeFakeGl();
    gl.createProgram.mockReturnValue(null);
    expect(createAuroraRenderer(makeCanvas(gl), images, () => 1)).toBeNull();
  });

  it('returns null and logs the reason when the program fails to link', () => {
    const gl = makeFakeGl({ linkOk: false });
    expect(createAuroraRenderer(makeCanvas(gl), images, () => 1)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[AuroraBackground] program link failed:', 'link log');
  });

  it('frees the programs already built when a later one fails', () => {
    const gl = makeFakeGl();
    // ground links, the ribbon program does not
    gl.getProgramParameter.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(createAuroraRenderer(makeCanvas(gl), images, () => 1)).toBeNull();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('uploads both images premultiplied, unflipped and clamped', () => {
    const gl = makeFakeGl();
    createAuroraRenderer(makeCanvas(gl), images, () => 1);

    expect(gl.texImage2D).toHaveBeenCalledWith(11, 0, 16, 16, 17, images.ribbon);
    expect(gl.texImage2D).toHaveBeenCalledWith(11, 0, 16, 16, 17, images.veil);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, false);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  });

  it('sets the ground constants measured from the mockup once', () => {
    const gl = makeFakeGl();
    createAuroraRenderer(makeCanvas(gl), images, () => 1);

    expect(gl.uniform3fv).toHaveBeenCalledWith({ name: 'u_grad' }, expect.any(Float32Array));
    expect((gl.uniform3fv.mock.calls[0]![1] as Float32Array).length).toBe(18);
    expect(callsFor(gl.uniform4f, 'u_wave')).toHaveLength(1);
    expect(callsFor(gl.uniform4f, 'u_circleColor')).toHaveLength(1);
  });

  it('draws ground, then the right ribbon, then the left ribbon, in canvas pixels', () => {
    const gl = makeFakeGl();
    const canvas = makeCanvas(gl, 1440, 1000);
    const renderer = createAuroraRenderer(canvas, images, () => 1.5)!;
    const scene = computeAuroraScene(1440, 1000);

    expect(canvas.width).toBe(2160);
    renderer.render(4, scene);

    expect(gl.uniform2f).toHaveBeenCalledWith({ name: 'u_res' }, 2160, 1500);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_time' }, 4);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_ramp' }, rampAt(4));
    expect(gl.uniform3f).toHaveBeenCalledWith(
      { name: 'u_groundAt' },
      scene.ground.offsetX * 1.5,
      scene.ground.offsetY * 1.5,
      scene.ground.scale * 1.5
    );
    expect(callsFor(gl.uniform3f, 'u_at')).toEqual([
      [
        { name: 'u_at' },
        scene.veil.offsetX * 1.5,
        scene.veil.offsetY * 1.5,
        scene.veil.scale * 1.5,
      ],
      [
        { name: 'u_at' },
        scene.ribbon.offsetX * 1.5,
        scene.ribbon.offsetY * 1.5,
        scene.ribbon.scale * 1.5,
      ],
    ]);
    const { veil, ribbon } = RIBBON_SPECS;
    expect(callsFor(gl.uniform4f, 'u_art')).toEqual([
      [{ name: 'u_art' }, veil.art.x, veil.art.y, veil.art.width, veil.art.height],
      [{ name: 'u_art' }, ribbon.art.x, ribbon.art.y, ribbon.art.width, ribbon.art.height],
    ]);
    // Ground first as one triangle, then one mesh per ribbon, blended premultiplied.
    expect(gl.drawArrays.mock.calls[0]).toEqual([gl.TRIANGLES, 0, 3]);
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // No fluid on this GPU: the ribbons ignore it.
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_fluid' }, 0);
  });

  it('follows the canvas when it is resized', () => {
    const gl = makeFakeGl();
    let width = 1440;
    const canvas = makeCanvas(gl);
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => width });
    const renderer = createAuroraRenderer(canvas, images, () => 1)!;

    width = 390;
    renderer.resize();
    renderer.render(0, computeAuroraScene(390, 1000));

    expect(canvas.width).toBe(390);
    expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 390, 1000);
  });

  it('copes with an unmeasured canvas', () => {
    const gl = makeFakeGl();
    const renderer = createAuroraRenderer(makeCanvas(gl, 0, 0), images, () => 1)!;
    renderer.render(0, computeAuroraScene(390, 1000));
    expect(gl.drawArrays).toHaveBeenCalled();
  });

  it("reads the window's device pixel ratio by default", () => {
    vi.stubGlobal('devicePixelRatio', 1.25);
    const canvas = makeCanvas(makeFakeGl(), 800, 400);
    createAuroraRenderer(canvas, images);
    expect(canvas.width).toBe(1000);
  });

  it('reports when the GPU has dropped the context', () => {
    const gl = makeFakeGl();
    const renderer = createAuroraRenderer(makeCanvas(gl), images, () => 1)!;
    expect(renderer.isContextLost()).toBe(false);
    gl.isContextLost.mockReturnValue(true);
    expect(renderer.isContextLost()).toBe(true);
  });

  it('releases its GL objects on dispose', () => {
    const gl = makeFakeGl();
    createAuroraRenderer(makeCanvas(gl), images, () => 1)!.dispose();

    expect(gl.deleteBuffer).toHaveBeenCalledTimes(3); // triangle + two ribbon meshes
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
    expect(gl.deleteShader).toHaveBeenCalledTimes(6);
  });

  it('asks for a cheap, opaque context', () => {
    const canvas = makeCanvas(makeFakeGl());
    createAuroraRenderer(canvas, images, () => 1);

    expect(canvas.getContext).toHaveBeenCalledWith(
      'webgl',
      expect.objectContaining({ alpha: false, antialias: false, powerPreference: 'low-power' })
    );
  });

  describe('touch fluid', () => {
    it('is off, and strokes are refused, when the GPU cannot run it', () => {
      const renderer = createAuroraRenderer(makeCanvas(makeFakeGl()), images, () => 1)!;
      expect(renderer.interactive).toBe(false);
      expect(renderer.stir(10, 10, 2, 2, [1, 0, 0, 1])).toBe(false);
    });

    it('keeps the ribbons animating when the fluid setup throws', () => {
      createAuroraFluid.mockImplementation(() => {
        throw new Error('no float targets');
      });
      const renderer = createAuroraRenderer(makeCanvas(makeFakeGl()), images, () => 1);
      expect(renderer).not.toBeNull();
      expect(renderer!.interactive).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        '[AuroraBackground] touch fluid unavailable:',
        expect.any(Error)
      );
    });

    it('turns a CSS stroke into a canvas-pixel splat of the ribbon colour', () => {
      createAuroraFluid.mockReturnValue(fluid);
      const gl = makeFakeGl();
      const renderer = createAuroraRenderer(makeCanvas(gl, 1440, 1000), images, () => 1.5)!;
      expect(renderer.interactive).toBe(true);
      expect(createAuroraFluid).toHaveBeenCalledWith(gl, 2160, 1500);

      expect(renderer.stir(100, 200, 4, -2, [0.5, 1, 0.25, 0.5])).toBe(true);
      const [x, y, dx, dy, colour] = fluid.splat.mock.calls[0]!;
      expect([x, y, dx, dy]).toEqual([150, 300, 6, -3]);
      // A light wash: 0.07 of the colour, times the ribbon's alpha.
      expect(colour[0]).toBeCloseTo(0.5 * 0.07 * 0.5, 9);
      expect(colour[1]).toBeCloseTo(1 * 0.07 * 0.5, 9);
      expect(colour[2]).toBeCloseTo(0.25 * 0.07 * 0.5, 9);
    });

    it('steps only after a stroke, then lets go and stops stepping', () => {
      createAuroraFluid.mockReturnValue(fluid);
      const gl = makeFakeGl();
      const renderer = createAuroraRenderer(makeCanvas(gl), images, () => 1)!;
      const scene = computeAuroraScene(1440, 1000);

      renderer.render(0, scene);
      renderer.render(0.05, scene);
      expect(fluid.step).not.toHaveBeenCalled(); // idle: the fluid costs nothing

      renderer.stir(10, 10, 3, 3, [1, 1, 1, 1]);
      renderer.render(0.1, scene);
      expect(fluid.step).toHaveBeenCalledWith(0.05);
      expect(callsFor(gl.uniform1f, 'u_fluid').at(-1)![1]).toBeGreaterThan(0.9);
      // The stirred colour is washed over the scene: ground + two ribbons + dye.
      expect(gl.drawArrays).toHaveBeenCalledTimes(3 * 3 + 1);

      // A long frame gap is clamped, and ~3.5 s later everything has settled.
      renderer.render(10, scene);
      expect(fluid.step).toHaveBeenLastCalledWith(0.05);
      for (let t = 10; t < 14; t += 0.05) renderer.render(t, scene);
      const steps = fluid.step.mock.calls.length;
      renderer.render(14.1, scene);
      expect(fluid.step.mock.calls.length).toBe(steps);
      expect(callsFor(gl.uniform1f, 'u_fluid').at(-1)![1]).toBe(0);
    });

    it('resizes and frees the fluid with the canvas', () => {
      createAuroraFluid.mockReturnValue(fluid);
      let width = 1440;
      const canvas = makeCanvas(makeFakeGl());
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => width });
      const renderer = createAuroraRenderer(canvas, images, () => 1)!;
      width = 800;
      renderer.resize();
      expect(fluid.resize).toHaveBeenLastCalledWith(800, 1000);
      renderer.dispose();
      expect(fluid.dispose).toHaveBeenCalled();
    });
  });
});
