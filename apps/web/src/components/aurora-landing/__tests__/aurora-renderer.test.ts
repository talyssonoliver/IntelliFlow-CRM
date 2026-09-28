/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AURORA_FRAGMENT_SHADER,
  buildRibbonFrame,
  computeRenderSize,
  createAuroraRenderer,
  MIN_FRAGMENT_UNIFORM_VECTORS,
  RENDER_SCALE,
  RIBBON_SAMPLES,
  RIBBONS,
  WIDE_BREAKPOINT_PX,
  type RibbonSpec,
} from '../aurora-renderer';

type FakeGl = ReturnType<typeof makeFakeGl>;

function makeFakeGl(
  options: {
    compileOk?: boolean;
    linkOk?: boolean;
    shader?: boolean;
    uniformVectors?: number;
    highPrecision?: number;
  } = {}
) {
  const {
    compileOk = true,
    linkOk = true,
    shader = true,
    uniformVectors = 221,
    highPrecision = 23,
  } = options;
  return {
    MAX_FRAGMENT_UNIFORM_VECTORS: 9,
    HIGH_FLOAT: 10,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    getParameter: vi.fn(() => uniformVectors),
    getShaderPrecisionFormat: vi.fn(() => ({ precision: highPrecision })),
    createShader: vi.fn(() => (shader ? {} : null)),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compileOk),
    getShaderInfoLog: vi.fn(() => 'compile log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
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
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ name })),
    viewport: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4fv: vi.fn(),
    drawArrays: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
  };
}

function makeCanvas(gl: FakeGl | null, cssWidth = 1440, cssHeight = 900) {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => cssWidth });
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => cssHeight });
  canvas.getContext = vi.fn(() => gl) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

describe('computeRenderSize', () => {
  it('renders at half resolution of the CSS box times the device pixel ratio', () => {
    expect(computeRenderSize(1440, 900, 2)).toEqual({ width: 1440, height: 900, wide: true });
    expect(RENDER_SCALE).toBe(0.5);
    expect(WIDE_BREAKPOINT_PX).toBe(1024);
  });

  it('caps the device pixel ratio at 2 and floors it at 1', () => {
    expect(computeRenderSize(390, 1000, 3)).toEqual({ width: 390, height: 1000, wide: false });
    expect(computeRenderSize(400, 200, 0)).toEqual({ width: 200, height: 100, wide: false });
  });

  it('never returns an empty drawing buffer', () => {
    expect(computeRenderSize(0, 0, 1)).toEqual({ width: 1, height: 1, wide: false });
  });

  it('switches to the wide composition at the tablet breakpoint', () => {
    expect(computeRenderSize(WIDE_BREAKPOINT_PX - 1, 800, 1).wide).toBe(false);
    expect(computeRenderSize(WIDE_BREAKPOINT_PX, 800, 1).wide).toBe(true);
  });
});

describe('fragment shader source', () => {
  it('never calls pow(), which is undefined for negative bases in GLSL', () => {
    expect(AURORA_FRAGMENT_SHADER).not.toMatch(/\bpow\s*\(/);
  });

  it('declares every uniform the renderer sets', () => {
    for (const name of [
      'u_resolution',
      'u_time',
      'u_wide',
      'u_left',
      'u_right',
      'u_leftBand',
      'u_rightBand',
    ]) {
      expect(AURORA_FRAGMENT_SHADER).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
    }
  });

  it('uses no GLSL ES reserved words as identifiers', () => {
    expect(AURORA_FRAGMENT_SHADER).not.toMatch(/\b(half|fixed|input|output|filter|sample)\b/);
  });

  it('packs every path sample into the uniform arrays', () => {
    const slots = Math.ceil(RIBBON_SAMPLES / 2);
    expect(AURORA_FRAGMENT_SHADER).toContain(`uniform vec4 u_left[${slots}]`);
    expect(AURORA_FRAGMENT_SHADER).toContain(`uniform vec4 u_right[${slots}]`);
  });
});

describe('createAuroraRenderer', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('returns null when the browser has no WebGL', () => {
    expect(createAuroraRenderer(makeCanvas(null), () => 1)).toBeNull();
  });

  it('returns null on GPUs without highp fragment precision', () => {
    expect(createAuroraRenderer(makeCanvas(makeFakeGl({ highPrecision: 0 })), () => 1)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[AuroraBackground] no highp in fragment shaders; keeping the CSS fallback.'
    );
  });

  it('returns null on GPUs too small to hold both ribbons', () => {
    const gl = makeFakeGl({ uniformVectors: MIN_FRAGMENT_UNIFORM_VECTORS - 1 });
    expect(createAuroraRenderer(makeCanvas(gl), () => 1)).toBeNull();
    expect(gl.createShader).not.toHaveBeenCalled();
  });

  it('returns null and logs the reason when a shader fails to compile', () => {
    const gl = makeFakeGl({ compileOk: false });
    expect(createAuroraRenderer(makeCanvas(gl), () => 1)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[AuroraBackground] shader compile failed:', 'compile log');
    expect(gl.deleteShader).toHaveBeenCalled();
  });

  it('returns null when the context cannot create shaders', () => {
    expect(createAuroraRenderer(makeCanvas(makeFakeGl({ shader: false })), () => 1)).toBeNull();
  });

  it('returns null when the program cannot be created', () => {
    const gl = makeFakeGl();
    gl.createProgram.mockReturnValue(null as unknown as object);
    expect(createAuroraRenderer(makeCanvas(gl), () => 1)).toBeNull();
  });

  it('returns null and logs the reason when the program fails to link', () => {
    const gl = makeFakeGl({ linkOk: false });
    expect(createAuroraRenderer(makeCanvas(gl), () => 1)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[AuroraBackground] program link failed:', 'link log');
  });

  it('sizes the canvas on creation and draws one full-screen triangle per frame', () => {
    const gl = makeFakeGl();
    const canvas = makeCanvas(gl, 1440, 900);
    const renderer = createAuroraRenderer(canvas, () => 2);

    expect(renderer).not.toBeNull();
    expect(canvas.width).toBe(1440);
    expect(canvas.height).toBe(900);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 1440, 900);

    renderer!.render(3.5, [0.25, 0.75, 1]);
    expect(gl.uniform2f).toHaveBeenCalledWith({ name: 'u_resolution' }, 1440, 900);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_time' }, 3.5);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_wide' }, 1);
    expect(gl.uniform4fv).toHaveBeenCalledWith({ name: 'u_left' }, expect.any(Float32Array));
    expect(gl.uniform4fv).toHaveBeenCalledWith({ name: 'u_right' }, expect.any(Float32Array));
    // Desktop: the left ribbon stacks outward (-1), the right toward its corner (+1).
    expect(gl.uniform3f).toHaveBeenCalledWith({ name: 'u_leftBand' }, 34, 52, -1);
    expect(gl.uniform3f).toHaveBeenCalledWith({ name: 'u_rightBand' }, 36, 54, 1);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
  });

  it('switches to the phone composition after a resize below the breakpoint', () => {
    const gl = makeFakeGl();
    let width = 1440;
    const canvas = makeCanvas(gl);
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => width });
    const renderer = createAuroraRenderer(canvas, () => 1)!;

    width = 390;
    renderer.resize();
    renderer.render(0, [0.5, 0.5, 0]);

    expect(canvas.width).toBe(195);
    expect(gl.uniform1f).toHaveBeenCalledWith({ name: 'u_wide' }, 0);
  });

  it('releases its GL objects on dispose', () => {
    const gl = makeFakeGl();
    createAuroraRenderer(makeCanvas(gl), () => 1)!.dispose();

    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it("reads the window's device pixel ratio by default", () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const canvas = makeCanvas(makeFakeGl(), 800, 400);
    createAuroraRenderer(canvas);
    vi.unstubAllGlobals();

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
  });

  it('asks for a cheap, opaque context', () => {
    const gl = makeFakeGl();
    const canvas = makeCanvas(gl);
    createAuroraRenderer(canvas, () => 1);

    expect(canvas.getContext).toHaveBeenCalledWith(
      'webgl',
      expect.objectContaining({ alpha: false, antialias: false, powerPreference: 'low-power' })
    );
  });
});

describe('buildRibbonFrame', () => {
  const spec: RibbonSpec = {
    refWidth: 1000,
    anchor: 'left',
    maxScale: 1.2,
    points: [
      [0, 0],
      [500, 0],
      [1000, 0],
    ],
    spacing: 10,
    width: 20,
    side: 'left',
  };
  const still = [0, 0, 0] as const;

  function samples(frame: { packed: Float32Array }) {
    return Array.from({ length: RIBBON_SAMPLES }, (_, i) => [
      frame.packed[i * 2]!,
      frame.packed[i * 2 + 1]!,
    ]);
  }

  it('samples the path from its first control point to its last', () => {
    // Control points drift by at most 10 reference px on each axis.
    const points = samples(buildRibbonFrame(spec, 1000, 1000, 0, still, 500));
    expect(points).toHaveLength(RIBBON_SAMPLES);
    expect(Math.abs(points[0]![0]! - 0)).toBeLessThanOrEqual(10);
    expect(Math.abs(points.at(-1)![0]! - 1000)).toBeLessThanOrEqual(10);
    for (const [, y] of points) expect(Math.abs(y!)).toBeLessThanOrEqual(10.5);
  });

  it('scales with the layout and converts to canvas pixels', () => {
    const frame = buildRibbonFrame(spec, 500, 250, 0, still, 100);
    expect(Math.abs(samples(frame).at(-1)![0]! - 250)).toBeLessThanOrEqual(2.5);
    expect(frame.band).toEqual([2.5, 5, 1]);
  });

  it('stops growing past its maximum scale', () => {
    const frame = buildRibbonFrame(spec, 3000, 3000, 0, still, 1000);
    expect(frame.band[0]).toBeCloseTo(12, 5);
  });

  it('pins right-anchored ribbons to the right edge on wider screens', () => {
    const right: RibbonSpec = { ...spec, anchor: 'right', side: 'right' };
    const frame = buildRibbonFrame(right, 2000, 2000, 0, still, 1000);
    expect(Math.abs(samples(frame).at(-1)![0]! - 2000)).toBeLessThanOrEqual(12);
    expect(frame.band[2]).toBe(-1);
  });

  it('bends the path toward the pointer and leaves far parts alone', () => {
    const base = samples(buildRibbonFrame(spec, 1000, 1000, 0, still, 1000));
    const pulled = samples(buildRibbonFrame(spec, 1000, 1000, 0, [0.5, 0.2, 1], 1000));
    const middle = Math.floor(RIBBON_SAMPLES / 2);
    expect(pulled[middle]![1]).toBeGreaterThan(base[middle]![1]!);
    expect(pulled[0]![1]).toBeCloseTo(base[0]![1]!, 3);
  });

  it('ignores a pointer sitting exactly on a sample', () => {
    const base = samples(buildRibbonFrame(spec, 1000, 1000, 0, still, 1000));
    const onPath = samples(buildRibbonFrame(spec, 1000, 1000, 0, [0, 0.01, 1], 1000));
    expect(onPath[0]![0]).toBeCloseTo(base[0]![0]!, 4);
    expect(onPath[0]![1]).toBeCloseTo(base[0]![1]!, 4);
  });

  it('drifts over time', () => {
    const a = samples(buildRibbonFrame(spec, 1000, 1000, 0, still, 1000));
    const b = samples(buildRibbonFrame(spec, 1000, 1000, 2, still, 1000));
    expect(a).not.toEqual(b);
  });

  it('copes with an unmeasured canvas', () => {
    expect(buildRibbonFrame(spec, 0, 0, 0, still, 0).band).toEqual([0, 0, 1]);
  });

  it('keeps the desktop hero copy clear of the left ribbon', () => {
    // The copy starts at x=168 in the 1440 layout. On the vertical run the folds
    // stack outward, so only the inner half-fold plus the drift reaches inward.
    const { points, width, side } = RIBBONS.wide.left;
    expect(side).toBe('right');
    for (const [x, y] of points) {
      if (y > 60 && y < 620) expect(x + 10 + width / 2).toBeLessThan(168);
    }
  });
});
