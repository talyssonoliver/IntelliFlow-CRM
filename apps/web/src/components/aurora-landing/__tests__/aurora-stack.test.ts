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
    }
  }
  class Obj {
    position = new Vec();
    rotation = new Vec();
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
import { baseY, cameraFrame, createStack, layerTarget, LAYERS } from '../aurora-stack';

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
  type Group = { visible: boolean; position: { y: number } };
  const renderer = () =>
    (
      THREE as unknown as {
        renderers: Array<{ renders: number; scene: { children: Array<{ children: Group[] }> } }>;
      }
    ).renderers.at(-1)!;
  /** The five layer groups, bottom to top (the stack's root holds the shadow first). */
  const layers = () => renderer().scene.children.at(-1)!.children.slice(1);

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
