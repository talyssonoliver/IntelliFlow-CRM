/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// three.js needs WebGL, which jsdom lacks: a small stand-in records what the stack does.
vi.mock('three', () => {
  class Vec {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      Object.assign(this, { x, y, z });
      return this;
    }
  }
  class Quat {
    angle = 0;
    setFromAxisAngle(_axis: unknown, angle: number) {
      this.angle = angle;
      return this;
    }
    setFromEuler() {
      return this;
    }
    copy(q: Quat) {
      this.angle = q.angle;
      return this;
    }
    slerp(q: Quat, t: number) {
      this.angle += (q.angle - this.angle) * t;
      return this;
    }
    setFromRotationMatrix() {
      this.angle = Math.PI / 2;
      return this;
    }
    multiply() {
      return this;
    }
  }
  class Vector3 extends Vec {
    constructor(x = 0, y = 0, z = 0) {
      super();
      this.set(x, y, z);
    }
    applyMatrix4() {
      return this;
    }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.set(this.x / l, this.y / l, this.z / l);
      return this;
    }
    copy(v: Vec) {
      this.set(v.x, v.y, v.z);
      return this;
    }
    multiplyScalar(k: number) {
      this.set(this.x * k, this.y * k, this.z * k);
      return this;
    }
    crossVectors(a: Vec, b: Vec) {
      this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
      return this;
    }
  }
  class Obj {
    matrix = {};
    frustumCulled = true;
    updateMatrix() {}
    position = new Vec();
    rotation = new Vec();
    scale = new Vec();
    quaternion = new Quat();
    visible = true;
    children: unknown[] = [];
    add(...c: unknown[]) {
      this.children.push(...c);
    }
    lookAt() {}
  }
  class Disposable {
    disposed = false;
    constructor(opts: object = {}) {
      Object.assign(this, opts);
    }
    dispose() {
      this.disposed = true;
    }
  }
  class Mesh extends Obj {
    constructor(
      public geometry: Disposable,
      public material: Disposable & { map?: Disposable }
    ) {
      super();
    }
  }
  class Color {
    clone() {
      return new Color();
    }
    lerp() {
      return this;
    }
  }
  class OrthographicCamera extends Obj {
    left = 0;
    right = 0;
    zoom = 1;
    updateProjectionMatrix() {}
  }
  const renderers: unknown[] = [];
  class WebGLRenderer extends Disposable {
    renders = 0;
    scene: unknown = null;
    constructor(opts: object) {
      super(opts);
      renderers.push(this);
    }
    setPixelRatio() {}
    setSize() {}
    render(scene: unknown) {
      this.renders++;
      this.scene = scene;
    }
  }
  class PMREMGenerator extends Disposable {
    fromScene() {
      return { texture: new Disposable() };
    }
  }
  return {
    renderers,
    WebGLRenderer,
    PMREMGenerator,
    Scene: Obj,
    Group: Obj,
    Mesh,
    Color,
    OrthographicCamera,
    HemisphereLight: Obj,
    DirectionalLight: Obj,
    PlaneGeometry: Disposable,
    MeshBasicMaterial: Disposable,
    MeshPhysicalMaterial: Disposable,
    CanvasTexture: Disposable,
    Quaternion: Quat,
    Points: class extends Obj {
      constructor(
        public geometry: Disposable,
        public material: Disposable
      ) {
        super();
      }
    },
    PointsMaterial: Disposable,
    BufferGeometry: class extends Disposable {
      attributes: Record<string, { needsUpdate: boolean }> = {};
      setAttribute(name: string, attr: { needsUpdate: boolean }) {
        this.attributes[name] = attr;
      }
    },
    BufferAttribute: class {
      needsUpdate = false;
      constructor(public array: Float32Array) {}
    },
    Vector3,
    Matrix4: class {
      makeBasis() {
        return this;
      }
    },
    Euler: class {
      set() {
        return this;
      }
    },
    AdditiveBlending: 2,
    NeutralToneMapping: 1,
    SRGBColorSpace: 'srgb',
  };
});
vi.mock('three/addons/geometries/RoundedBoxGeometry.js', () => ({
  RoundedBoxGeometry: class {
    dispose() {}
  },
}));
vi.mock('three/addons/environments/RoomEnvironment.js', () => ({ RoomEnvironment: class {} }));

import * as THREE from 'three';
import {
  baseY,
  cameraFrame,
  createStack,
  layerTarget,
  LAYERS,
  rippleRings,
  sparkAt,
  SPARK_COUNT,
} from '../aurora-stack';

const fonts = { text: 'Manrope', icons: 'Material Symbols' };

describe('layerTarget', () => {
  it('lifts and lights the layer being read', () => {
    expect(layerTarget(2, 2)).toEqual({ lift: 0.28, glow: 1, peel: 0 });
  });

  it('peels away every layer above it, which has already been read', () => {
    expect(layerTarget(3, 2).peel).toBe(1);
    expect(layerTarget(4, 2).peel).toBe(1);
    expect(layerTarget(1, 2)).toEqual({ lift: 0, glow: 0, peel: 0 });
  });

  it('shows the whole stack at rest when no layer is being read', () => {
    for (let i = 0; i < LAYERS.length; i++)
      expect(layerTarget(i, -1)).toEqual({ lift: 0, glow: 0, peel: 0 });
  });
});

describe('cameraFrame', () => {
  const desktop = { w: 700, h: 830 };

  it('frames the whole stack at rest', () => {
    expect(cameraFrame(-1, desktop)).toEqual({ y: 2.35, zoom: 1 });
  });

  it('centres and closes in on the active layer', () => {
    const top = cameraFrame(4, desktop);
    expect(top.y).toBeCloseTo(baseY(4) + 0.15);
    expect(top.zoom).toBeGreaterThan(1);
  });

  it('never zooms so far that the slab corners clip on a narrow canvas', () => {
    const narrow = cameraFrame(4, { w: 300, h: 800 });
    const slabWidthOnScreen = ((5 + 3.5) * Math.SQRT1_2 * narrow.zoom) / (5.1 * (300 / 800) * 2);
    expect(slabWidthOnScreen).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(cameraFrame(-1, { w: 300, h: 800 }).zoom).toBeLessThan(1);
  });

  it('comes closer on a phone than on a desktop', () => {
    expect(cameraFrame(2, { w: 390, h: 390 }).zoom).toBeGreaterThan(
      cameraFrame(2, { w: 1200, h: 900 }).zoom
    );
  });
});

describe('createStack', () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // jsdom has no 2D canvas: any drawing call is accepted and measures 10px.
    const ctx = new Proxy(
      {},
      { get: () => () => ({ addColorStop() {}, width: 10 }), set: () => true }
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const run = (n: number) => {
    for (let i = 0; i < n; i++) frames.shift()?.(performance.now() + i * 16);
  };
  type Group = { visible: boolean; position: { y: number }; children: unknown[] };
  const renderer = () =>
    (
      THREE as unknown as {
        renderers: Array<{ renders: number; scene: { children: Array<{ children: Group[] }> } }>;
      }
    ).renderers.at(-1)!;
  /** The five layer groups, bottom to top (the root also holds the shadow and the ripple rings). */
  const layers = () =>
    renderer()
      .scene.children.at(-1)!
      .children.filter((c) => c.children.length > 0);

  it('without WebGL2 throws before three.js builds a renderer (which logs console errors)', () => {
    const real = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      return type === 'webgl2'
        ? null
        : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as never);
    const before = (THREE as unknown as { renderers: unknown[] }).renderers.length;
    expect(() =>
      createStack(document.createElement('canvas'), { fonts, reducedMotion: true })
    ).toThrow('WebGL2 is unavailable');
    expect((THREE as unknown as { renderers: unknown[] }).renderers.length).toBe(before);
  });

  it('hands three.js the WebGL2 context it asked for', () => {
    const canvas = document.createElement('canvas');
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
    const stack = createStack(canvas, { fonts, reducedMotion: true });
    expect(getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({ alpha: true }));
    const calls = getContext.mock.calls as unknown[][];
    const webgl2 = getContext.mock.results[calls.findIndex((c) => c[0] === 'webgl2')];
    expect((renderer() as unknown as { context: unknown }).context).toBe(webgl2!.value);
    stack.dispose();
  });

  it('renders every frame and hides the layers above the one being read', () => {
    const canvas = document.createElement('canvas');
    const stack = createStack(canvas, { fonts, reducedMotion: true });
    run(1);
    expect(renderer().renders).toBe(1);
    expect(layers().every((g) => g.visible)).toBe(true);

    stack.setActive('pipeline');
    run(1);
    const [foundation, service, pipeline, control, agents] = layers();
    expect([foundation!.visible, service!.visible, pipeline!.visible]).toEqual([true, true, true]);
    expect([control!.visible, agents!.visible]).toEqual([false, false]);
    expect(pipeline!.position.y).toBeCloseTo(baseY(2) + 0.28);
    stack.dispose();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('lifts a presented layer out to face the viewer, then dissolves it', () => {
    const canvas = document.createElement('canvas');
    // A phone-sized frame.
    canvas.getBoundingClientRect = () => ({ width: 390, height: 772 }) as DOMRect;
    const stack = createStack(canvas, { fonts, reducedMotion: true });
    type Shown = { visible: boolean; position: { y: number }; scale: { x: number } };
    stack.setPresentation({ agents: { present: 1, dissolve: 0 } });
    run(1);
    const agents = layers().at(-1) as unknown as Shown;
    expect(agents.visible).toBe(true);
    expect(agents.position.y).toBeGreaterThan(baseY(4));
    expect(agents.scale.x).toBeGreaterThan(0);

    stack.setPresentation({ agents: { present: 1, dissolve: 1 } });
    run(1);
    expect(agents.visible).toBe(false);

    stack.setPresentation(null);
    run(1);
    expect(agents.visible).toBe(true);
    expect(agents.position.y).toBeCloseTo(baseY(4));
    stack.dispose();
  });

  it('dissolves a presented layer behind a glowing edge as it drifts up, with no outline ripple', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ width: 390, height: 772 }) as DOMRect;
    const stack = createStack(canvas, { fonts, reducedMotion: false });
    type Shown = {
      visible: boolean;
      position: { y: number };
      children: Array<{
        material: { onBeforeCompile?: unknown; customProgramCacheKey?: () => string };
      }>;
    };
    const rings = () =>
      (
        renderer().scene.children.at(-1)!.children as unknown as Array<{
          visible: boolean;
          material?: { blending?: number };
        }>
      ).filter((c) => c.material?.blending === THREE.AdditiveBlending && c.visible);

    stack.setPresentation({ agents: { present: 1, dissolve: 0 } });
    run(60);
    const agents = layers().at(-1) as unknown as Shown;
    const resting = agents.position.y;
    // Slab and face both carry the dissolve shader, compiled once for every layer.
    for (const mesh of agents.children) {
      expect(typeof mesh.material.onBeforeCompile).toBe('function');
      expect(mesh.material.customProgramCacheKey?.()).toBe('aurora-dissolve');
    }

    stack.setPresentation({ agents: { present: 1, dissolve: 0.5 } });
    run(60);
    expect(agents.position.y).toBeGreaterThan(resting);
    expect(agents.visible).toBe(true);
    expect(rings()).toHaveLength(0);

    stack.setPresentation({ agents: { present: 1, dissolve: 1 } });
    run(60);
    expect(agents.visible).toBe(false);
    stack.dispose();
  });

  it('springs back home after a press and drag, and eases scroll steps instead of jumping', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ width: 390, height: 772 }) as DOMRect;
    const stack = createStack(canvas, { fonts, reducedMotion: false });
    const root = () =>
      renderer().scene.children.at(-1) as unknown as { position: { x: number; z: number } };
    run(5);
    const press = (type: string, x: number, y: number, target: EventTarget) => {
      const e = new Event(type, { bubbles: true }) as PointerEvent;
      Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0 });
      target.dispatchEvent(e);
    };
    press('pointerdown', 100, 100, canvas);
    press('pointermove', 300, 100, window);
    run(40);
    const dragged = root().position.x;
    expect(Math.abs(dragged)).toBeGreaterThan(0.1);

    press('pointerup', 300, 100, window);
    run(120);
    expect(Math.abs(root().position.x)).toBeLessThan(0.01);
    stack.dispose();
  });

  it('arrives in Act 0 stacked tight and turned a quarter, then opens to the floating stack', () => {
    const canvas = document.createElement('canvas');
    const stack = createStack(canvas, { fonts, reducedMotion: false });
    const root = () => renderer().scene.children.at(-1) as unknown as { rotation: { y: number } };

    stack.setIntro(0);
    run(1);
    const closed = layers().map((g) => g.position.y);
    const closedSpan = closed.at(-1)! - closed[0]!;
    expect(root().rotation.y).toBeCloseTo(Math.PI / 2);

    stack.setIntro(1);
    run(90);
    const open = layers().map((g) => g.position.y);
    expect(open[4]).toBeCloseTo(baseY(4));
    expect(open.at(-1)! - open[0]!).toBeGreaterThan(closedSpan * 3);
    expect(root().rotation.y).toBeCloseTo(0);

    stack.setIntro(7);
    run(30);
    layers().forEach((g, i) => expect(g.position.y).toBeCloseTo(open[i]!, 6));
    stack.dispose();
  });

  it('skips Act 0 under reduced motion: the stack is shown open from the start', () => {
    const canvas = document.createElement('canvas');
    const stack = createStack(canvas, { fonts, reducedMotion: true });
    stack.setIntro(0);
    run(1);
    expect(layers().at(-1)!.position.y).toBeCloseTo(baseY(4));
    stack.dispose();
  });

  it('eases towards its targets when motion is allowed and follows the pointer', () => {
    const canvas = document.createElement('canvas');
    const stack = createStack(canvas, { fonts, reducedMotion: false });
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
    stack.setActive('agents');
    run(5);
    stack.setActive(null);
    run(2);
    expect(renderer().renders).toBe(7);
    expect(layers().every((g) => g.visible)).toBe(true);
    stack.dispose();
  });

  it('stops listening once disposed', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const stack = createStack(document.createElement('canvas'), { fonts, reducedMotion: true });
    stack.dispose();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });
});

describe('rippleRings', () => {
  it('shows nothing while a layer rests or has fully peeled away', () => {
    expect(rippleRings(0).every((r) => r.opacity === 0)).toBe(true);
    expect(rippleRings(1).every((r) => r.opacity === 0)).toBe(true);
  });

  it('spreads outwards as the layer peels, the second ring trailing the first', () => {
    const [first, second] = rippleRings(0.5);
    expect(first!.opacity).toBeGreaterThan(0.5);
    expect(first!.scale).toBeGreaterThan(second!.scale);
    expect(rippleRings(0.9)[0]!.scale).toBeGreaterThan(first!.scale);
  });
});

describe('sparkAt', () => {
  it('keeps every spark dark before the edge reaches it and after it has burnt out', () => {
    for (let i = 0; i < SPARK_COUNT; i++) {
      expect(sparkAt(i, 0).glow).toBe(0);
      expect(sparkAt(i, 1).glow).toBe(0);
    }
  });

  it('lifts sparks off the face mid-dissolve, the same way every time', () => {
    const lit = Array.from({ length: SPARK_COUNT }, (_, i) => sparkAt(i, 0.5)).filter(
      (sp) => sp.glow > 0
    );
    expect(lit.length).toBeGreaterThan(10);
    expect(lit.every((sp) => sp.y > 0.17)).toBe(true);
    expect(sparkAt(7, 0.5)).toEqual(sparkAt(7, 0.5));
  });
});
