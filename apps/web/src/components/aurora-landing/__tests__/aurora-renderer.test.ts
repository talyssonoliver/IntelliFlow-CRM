/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AURORA_FRAGMENT_SHADER,
  computeRenderSize,
  createAuroraRenderer,
  rampAt,
} from '../aurora-renderer';
import { ARTWORK, computeAuroraScene } from '../aurora-scene';

type FakeGl = ReturnType<typeof makeFakeGl>;

function makeFakeGl(
  options: { compileOk?: boolean; linkOk?: boolean; shader?: boolean; highPrecision?: number } = {}
) {
  const { compileOk = true, linkOk = true, shader = true, highPrecision = 23 } = options;
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
    getShaderPrecisionFormat: vi.fn(() => ({ precision: highPrecision })),
    createShader: vi.fn(() => (shader ? {} : null)),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compileOk),
    getShaderInfoLog: vi.fn(() => 'compile log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn((): object | null => ({})),
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
    expect(rampAt(1.2)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(rampAt(30)).toBeCloseTo(1, 6);
  });
});

describe('fragment shader source', () => {
  it('never calls pow(), which is undefined for negative bases in GLSL', () => {
    expect(AURORA_FRAGMENT_SHADER).not.toMatch(/\bpow\s*\(/);
  });

  it('uses no GLSL ES reserved words as identifiers', () => {
    expect(AURORA_FRAGMENT_SHADER).not.toMatch(/\b(half|fixed|input|output|filter|sample)\b/);
  });

  it('contains no backticks, which would end the JS template literal', () => {
    expect(AURORA_FRAGMENT_SHADER).not.toContain('`');
  });

  it('declares every uniform the renderer sets', () => {
    for (const name of [
      'u_res',
      'u_time',
      'u_ramp',
      'u_ribbon',
      'u_veil',
      'u_ribbonAt',
      'u_veilAt',
      'u_groundAt',
      'u_ribbonRect',
      'u_veilRect',
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
});

describe('createAuroraRenderer', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('uploads both images premultiplied, unflipped and clamped', () => {
    const gl = makeFakeGl();
    createAuroraRenderer(makeCanvas(gl), images, () => 1);

    expect(gl.texImage2D).toHaveBeenCalledWith(11, 0, 16, 16, 17, images.ribbon);
    expect(gl.texImage2D).toHaveBeenCalledWith(11, 0, 16, 16, 17, images.veil);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, false);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: 'u_ribbon' }, 0);
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: 'u_veil' }, 1);
  });

  it('sets the mockup constants once: artwork rectangles and ground', () => {
    const gl = makeFakeGl();
    createAuroraRenderer(makeCanvas(gl), images, () => 1);

    const { ribbon, veil } = ARTWORK;
    expect(gl.uniform4f).toHaveBeenCalledWith(
      { name: 'u_ribbonRect' },
      ribbon.x,
      ribbon.y,
      ribbon.width,
      ribbon.height
    );
    expect(gl.uniform4f).toHaveBeenCalledWith(
      { name: 'u_veilRect' },
      veil.x,
      veil.y,
      veil.width,
      veil.height
    );
    expect(gl.uniform3fv).toHaveBeenCalledWith({ name: 'u_grad' }, expect.any(Float32Array));
    expect((gl.uniform3fv.mock.calls[0]![1] as Float32Array).length).toBe(18);
  });

  it('draws the scene with every placement converted to canvas pixels', () => {
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
      { name: 'u_ribbonAt' },
      scene.ribbon.offsetX * 1.5,
      scene.ribbon.offsetY * 1.5,
      scene.ribbon.scale * 1.5
    );
    expect(gl.uniform3f).toHaveBeenCalledWith(
      { name: 'u_veilAt' },
      scene.veil.offsetX * 1.5,
      scene.veil.offsetY * 1.5,
      scene.veil.scale * 1.5
    );
    expect(gl.uniform3f).toHaveBeenCalledWith(
      { name: 'u_groundAt' },
      scene.ground.offsetX * 1.5,
      scene.ground.offsetY * 1.5,
      scene.ground.scale * 1.5
    );
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
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

    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('asks for a cheap, opaque context', () => {
    const canvas = makeCanvas(makeFakeGl());
    createAuroraRenderer(canvas, images, () => 1);

    expect(canvas.getContext).toHaveBeenCalledWith(
      'webgl',
      expect.objectContaining({ alpha: false, antialias: false, powerPreference: 'low-power' })
    );
  });
});
