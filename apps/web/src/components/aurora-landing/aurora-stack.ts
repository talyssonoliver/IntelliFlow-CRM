/**
 * The Aurora stack: five product layers as slabs under a fixed isometric camera.
 * The page reads them top-down. The layer being read lifts and the camera closes
 * in on it; every layer above it has already been read, so it rises and fades out.
 *
 * Nothing moves on its own: motion follows the scroll position and the pointer,
 * so there is nothing to pause (WCAG 2.2.2). While the visitor scrolls, the layer
 * being read turns a few degrees towards them and follows the pointer, then eases
 * back to flat once the scroll settles. A layer that peels away leaves a ripple
 * where it lay, like the hero ribbons under the pointer.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { drawFace, FACE_SIZE, type FaceFonts, type LayerId } from './aurora-face';
import { roundedRect } from './round-rect';

/** Bottom to top. */
export const LAYERS: ReadonlyArray<{ id: LayerId; colour: string }> = [
  { id: 'foundation', colour: '#11175B' },
  { id: 'service', colour: '#BCA8FF' },
  { id: 'pipeline', colour: '#2A78F6' },
  { id: 'control', colour: '#28D9D4' },
  { id: 'agents', colour: '#7655F6' },
];

const W = 5.0;
const D = 3.5;
const H = 0.34;
const GAP = 0.92;
/** Half the camera's vertical view, in world units. */
const VIEW = 5.1;
/** Where the camera looks when no layer is active: the middle of the whole stack. */
const REST_Y = 2.35;
/** Camera height above the rest point; 9 across and 9 deep. */
const CAMERA_HEIGHT = 15;
const MIST = new THREE.Color('#F5F7FF');
/** How far the layer being read turns towards the viewer, in radians (about 11 degrees). */
const TILT = 0.19;
/** How long after the last scroll the layer being read stays turned, in ms. */
const SETTLE_MS = 650;
/** The axis that turns a slab's face towards the camera, which sits 9 across and 9 deep. */
const TILT_AXIS = new THREE.Vector3(1, 0, -1).normalize();

/**
 * Act 0's starting turn about the vertical axis: a quarter-turn. The slabs
 * stay on a diagonal to the camera, so their edges show depth the whole way
 * round and the face text stays upright (an eighth of a turn lines them up
 * with the camera and reads as a flat card; owner 2026-10-01).
 */
const INTRO_TURN = Math.PI / 2;

/**
 * The dissolve a presented layer leaves through: fragments below a moving
 * threshold of soft 3D noise are discarded, and a band just above it glows
 * cyan into violet, so the slab breaks up behind a bright aurora edge rather
 * than fading. `uDissolve` runs from about 0 (whole) to 1 (gone).
 */
const DISSOLVE_NOISE = `
uniform float uDissolve;
varying vec3 vDissolvePos;
float dissolveHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dissolveNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dissolveHash(i), dissolveHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(dissolveHash(i + vec3(0.0, 1.0, 0.0)), dissolveHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(dissolveHash(i + vec3(0.0, 0.0, 1.0)), dissolveHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(dissolveHash(i + vec3(0.0, 1.0, 1.0)), dissolveHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

/** Gives a material the dissolve, driven by the shared `uniform`. */
function addDissolve(material: THREE.Material, uniform: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDissolvePos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DISSOLVE_NOISE}`)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uDissolve > 0.0) {
          // Fine grain over a sweep from left to right across the layer.
          float grain = dissolveNoise(vDissolvePos * 3.2) * 0.6 + dissolveNoise(vDissolvePos * 9.0) * 0.4;
          float sweep = clamp(vDissolvePos.x / 5.2 + 0.5, 0.0, 1.0);
          float n = mix(grain, sweep, 0.55);
          float t = uDissolve * 1.08 - 0.04;
          if (n < t) discard;
          float edge = 1.0 - smoothstep(t, t + 0.028, n);
          vec3 glow = mix(vec3(0.62, 1.0, 0.98), vec3(0.74, 0.66, 1.0), grain);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, glow * 1.35, edge * 0.9);
        }`
      );
  };
  // One compiled program for every layer that dissolves.
  material.customProgramCacheKey = () => 'aurora-dissolve';
}

/** A spring like the site's magnetic buttons (GSAP elastic.out(1, 0.3)): quick, with one soft overshoot. */
const SPRING = { stiffness: 260, damping: 11 };
/** How far the stack follows a drag, as a share of the pointer's travel. */
const DRAG_FOLLOW = 0.3;

/** Space between the frame's top and a presented layer, in CSS px. */
const PRESENT_PAD_PX = 20;
/** How far the camera rises while a layer is presented, so the stack sits lower. */
const PRESENT_DROP = 1.4;
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * How strongly each of the two ripple rings shows while a layer peels (0 to 1).
 * The second ring trails the first, so the edge reads as a wave spreading out.
 */
export function rippleRings(peel: number): Array<{ scale: number; opacity: number }> {
  return [0, 0.35].map((lag) => {
    const q = Math.min(1, Math.max(0, (peel - lag) / (1 - lag)));
    return { scale: 1 + q * 0.45, opacity: q > 0 && q < 1 ? Math.sin(q * Math.PI) * 0.75 : 0 };
  });
}

export const baseY = (index: number) => index * (H + GAP);

export interface LayerTarget {
  lift: number;
  glow: number;
  /** 1 once the layer has been read and has risen out of view. */
  peel: number;
}

/** What a layer should do, given which layer is being read (-1: none). */
export function layerTarget(index: number, activeIndex: number): LayerTarget {
  const on = index === activeIndex;
  return {
    lift: on ? 0.28 : 0,
    glow: on ? 1 : 0,
    peel: activeIndex >= 0 && index > activeIndex ? 1 : 0,
  };
}

/**
 * Where the camera looks and how close it is. It frames the active layer as close
 * as the canvas allows without clipping the slab's corners, and the whole stack otherwise.
 */
export function cameraFrame(
  activeIndex: number,
  size: { w: number; h: number }
): { y: number; zoom: number } {
  // The slab is about (W + D) / sqrt(2) wide on screen; keep 10% of the canvas free.
  const fit = (VIEW * (size.w / size.h) * 2 * 0.9) / ((W + D) * Math.SQRT1_2);
  if (activeIndex < 0) return { y: REST_Y, zoom: Math.min(1, fit) };
  return { y: baseY(activeIndex) + 0.15, zoom: Math.min(size.w < 600 ? 1.6 : 1.3, fit) };
}

/** The face canvas is drawn at this multiple of its layout size. */
const FACE_SCALE = 2;

function faceTexture(id: LayerId, colour: string, fonts: FaceFonts): THREE.CanvasTexture {
  // Drawn at twice the layout size, so the words stay sharp when the camera closes in.
  const canvas = document.createElement('canvas');
  canvas.width = FACE_SIZE.width * FACE_SCALE;
  canvas.height = FACE_SIZE.height * FACE_SCALE;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(FACE_SCALE, FACE_SCALE);
    drawFace(g, id, colour, fonts);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

/** The glowing outline of a slab, drawn once and tinted per layer for the ripple. */
function rippleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * D) / W);
  const g = canvas.getContext('2d');
  if (g) {
    g.strokeStyle = '#ffffff';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 18;
    g.lineWidth = 6;
    g.beginPath();
    roundedRect(g, 24, 24, canvas.width - 48, canvas.height - 48, 40);
    g.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

/** A soft round glow, the sprite every dissolve spark is drawn with. */
function sparkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Sparks lifting off a dissolving layer; each one is born where the edge passes it. */
export const SPARK_COUNT = 220;
/** How much of the dissolve a spark lives for. */
const SPARK_LIFE = 0.2;

/**
 * Where spark `i` is at dissolve `d`, in the layer's own space, and how bright
 * it is (0 to 1). Deterministic, so scrolling back runs the sparks backwards.
 */
export function sparkAt(i: number, d: number): { x: number; y: number; z: number; glow: number } {
  // A fixed pseudo-random point on the face for each spark.
  const r1 = fract(Math.sin(i * 12.9898) * 43758.5453);
  const r2 = fract(Math.sin(i * 78.233) * 12543.123);
  const r3 = fract(Math.sin(i * 39.425) * 24634.633);
  const x = (r1 - 0.5) * W * 0.94;
  const z = (r2 - 0.5) * D * 0.9;
  // Born when the sweeping edge reaches it (the shader's threshold, roughly).
  const birth = (x / 5.2 + 0.5) * 0.55 + r3 * 0.45 * 0.6;
  const age = (d * 1.08 - 0.04 - birth) / SPARK_LIFE;
  if (age <= 0 || age >= 1) return { x, y: H / 2, z, glow: 0 };
  // Up off the face, drifting the way the sweep travels, fading as it goes.
  return {
    x: x + age * 0.6 * (0.4 + r3),
    y: H / 2 + age * (0.5 + r1 * 0.9),
    z: z - age * 0.35 * (r2 - 0.3),
    glow: Math.sin(age * Math.PI) * (0.6 + 0.4 * r3),
  };
}
const fract = (v: number) => v - Math.floor(v);

/** Eases `from` toward `to` by `k`, landing exactly once within a hair of it. */
function approach(from: number, to: number, k: number): number {
  const next = from + (to - from) * k;
  return Math.abs(to - next) < 0.001 ? to : next;
}

/** A soft contact shadow under the stack. */
function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(17,23,91,0.26)');
    grad.addColorStop(0.5, 'rgba(17,23,91,0.09)');
    grad.addColorStop(1, 'rgba(17,23,91,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How far a layer has lifted out to face the viewer, and how far it has dissolved. */
export interface Presentation {
  present: number;
  dissolve: number;
}

export interface AuroraStack {
  setActive(id: LayerId | null): void;
  /**
   * Act 0 on a phone, from 0 to 1: the stack arrives tightly stacked and
   * turned a quarter, then turns back and spreads to its floating state.
   * 1 (the default) is that state.
   */
  setIntro(progress: number): void;
  /**
   * Phone story: lifts each named layer out of the stack to the top of the
   * frame, square to the viewer, by `present`, and fades it by `dissolve`.
   * `null` returns every layer to the stack.
   */
  setPresentation(layers: Partial<Record<LayerId, Presentation>> | null): void;
  /** Stops the render loop (off-screen, or the tab is hidden). Idempotent. */
  pause(): void;
  /** Restarts the render loop after pause(). Idempotent. */
  resume(): void;
  /**
   * Clears the canvas to fully transparent on the next frame instead of
   * drawing the scene, and keeps doing so every frame until `show()`. A CSS
   * opacity of 0 on the canvas's DOM wrapper does NOT do this: the canvas
   * element keeps its last-rendered, fully-opaque WebGL pixels in its own
   * backing buffer regardless of the wrapper's CSS, and anything that reads
   * that buffer directly — e.g. a 2D `drawImage(canvas, ...)` readback —
   * still sees the slab artwork sitting there. Needed for the one moment the
   * pinned canvas un-sticks and slides up through the fixed nav's band on
   * its way off-screen (see AuroraMotion.tsx): the slab must actually be
   * gone by then, not just invisible-by-CSS (fixer 2026-09-30).
   */
  hide(): void;
  /** Resumes drawing the scene every frame after hide(). Idempotent. */
  show(): void;
  dispose(): void;
}

export function createStack(
  canvas: HTMLCanvasElement,
  { fonts, reducedMotion }: { fonts: FaceFonts; reducedMotion: boolean }
): AuroraStack {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  // Phones and touch screens draw at 1.5x: the page already runs a second WebGL
  // canvas (the aurora background), and 2x on both is where scrolling lagged.
  const compact = window.matchMedia?.('(pointer: coarse), (max-width: 960px)').matches ?? false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;

  const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9cff3', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(4, 10, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fe9ff', 0.6);
  rim.position.set(-6, 4, -4);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.45, D * 1.5),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.3;
  root.add(shadow);

  const slabGeometry = new RoundedBoxGeometry(W, H, D, 6, 0.22);
  const faceGeometry = new THREE.PlaneGeometry(
    W * 0.94,
    (W * 0.94 * FACE_SIZE.height) / FACE_SIZE.width
  );

  // One spark cloud, lent to whichever presented layer is dissolving.
  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkColours = new Float32Array(SPARK_COUNT * 4);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  // Four components: each spark carries its own alpha.
  sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColours, 4));
  const sparkMap = sparkTexture();
  const sparkMaterial = new THREE.PointsMaterial({
    map: sparkMap,
    // CSS pixels: under an orthographic camera three.js draws points at a fixed size.
    size: 9,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // Normal blending: added light vanishes on the pale page behind the stack.
    toneMapped: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.visible = false;
  sparks.frustumCulled = false;
  root.add(sparks);
  const sparkPoint = new THREE.Vector3();
  const CYAN = new THREE.Color('#28D9D4');
  const LILAC = new THREE.Color('#7655F6');

  const rippleGeometry = new THREE.PlaneGeometry(W * 1.08, D * 1.08);
  const rippleMap = rippleTexture();

  const items = LAYERS.map((layer, index) => {
    const group = new THREE.Group();
    const colour = new THREE.Color(layer.colour);
    const slab = new THREE.MeshPhysicalMaterial({
      color: MIST.clone().lerp(colour, index === 0 ? 1 : 0.96),
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.3,
      transparent: true,
      emissive: colour,
      emissiveIntensity: 0,
    });
    group.add(new THREE.Mesh(slabGeometry, slab));
    const dissolve = { value: 0 };
    addDissolve(slab, dissolve);
    const face = new THREE.MeshBasicMaterial({
      map: faceTexture(layer.id, layer.colour, fonts),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    addDissolve(face, dissolve);
    const faceMesh = new THREE.Mesh(faceGeometry, face);
    faceMesh.rotation.x = -Math.PI / 2;
    faceMesh.position.y = H / 2 + 0.004;
    group.add(faceMesh);
    group.position.y = baseY(index);
    root.add(group);
    // The ripple stays where the layer lay while the layer itself rises away.
    const rings = [0, 1].map(() => {
      const material = new THREE.MeshBasicMaterial({
        map: rippleMap,
        // Navy reads as a dark box, not a glow: the bottom layer ripples in Violet.
        color: index === 0 ? new THREE.Color('#7655F6') : colour,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(rippleGeometry, material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = baseY(index) + H / 2;
      ring.visible = false;
      root.add(ring);
      return ring;
    });
    return {
      group,
      slab,
      face,
      rings,
      dissolve,
      /** The presentation, eased toward what the scroll asks for, so it never steps. */
      shown: { present: 0, dissolve: 0 },
      tilt: 0,
      state: { lift: 0, glow: 0, peel: 0 } as LayerTarget,
    };
  });
  const turn = new THREE.Quaternion();
  /** Lays a ripple ring flat on its slab's face (rings are planes facing +Z). */
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const peelTurn = new THREE.Quaternion();
  const peelAxis = new THREE.Vector3(1, 0, 0);
  const follow = new THREE.Quaternion();
  const followEuler = new THREE.Euler();

  let activeIndex = -1;
  let intro = 1;
  let shownIntro = 1;
  let introSet = false;
  /** Per layer, how far it is presented (0 to 1) and how far it has dissolved (0 to 1). */
  let presentation: Presentation[] = [];
  const presented = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const towards = new THREE.Vector3();
  const down = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  /**
   * Where a presented layer sits: centred across the frame, its top edge just
   * under the frame's top, square to the camera and in front of the stack.
   */
  const presentPose = (view: { y: number; zoom: number }, frame: { w: number; h: number }) => {
    forward.set(-9, -(CAMERA_HEIGHT - REST_Y), -9).normalize();
    right.crossVectors(forward, worldUp).normalize();
    up.crossVectors(right, forward).normalize();
    towards.copy(forward).multiplyScalar(-1);
    down.copy(up).multiplyScalar(-1);
    // Local +Y (the printed face) towards the camera, the face's top edge up the screen.
    basis.makeBasis(right, towards, down);
    presented.setFromRotationMatrix(basis);
    const halfH = VIEW / view.zoom;
    const halfW = (VIEW * (frame.w / frame.h)) / view.zoom;
    // As wide as the frame allows, but never more than about a third of its height.
    const scale = Math.min((halfW * 2 * 0.88) / W, (halfH * 2 * 0.36) / D);
    const unitsPerPx = (halfH * 2) / frame.h;
    const offset = halfH - PRESENT_PAD_PX * unitsPerPx - (D * scale) / 2;
    return {
      x: up.x * offset + towards.x * 6,
      y: view.y + up.y * offset + towards.y * 6,
      z: up.z * offset + towards.z * 6,
      quaternion: presented,
      scale,
      up,
    };
  };
  /** The last time the page scrolled or the active layer changed. */
  let movedAt = -Infinity;
  const onScroll = () => {
    movedAt = performance.now();
  };
  const size = { w: 1, h: 1 };
  const cam = { y: REST_Y, zoom: 1 };
  /** Press and drag: the stack follows on a spring and springs home on release. */
  const drag = {
    active: false,
    id: -1,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    press: 0,
    vp: 0,
  };
  const screenRight = new THREE.Vector3(1, 0, -1).normalize();
  const screenUp = new THREE.Vector3()
    .crossVectors(screenRight, new THREE.Vector3(-9, -(CAMERA_HEIGHT - REST_Y), -9).normalize())
    .normalize();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    size.w = Math.max(1, rect.width);
    size.h = Math.max(1, rect.height);
    renderer.setSize(size.w, size.h, false);
    const aspect = size.w / size.h;
    camera.left = -VIEW * aspect;
    camera.right = VIEW * aspect;
    camera.updateProjectionMatrix();
  };
  const onPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    if (drag.active && e.pointerId === drag.id) {
      drag.tx = (e.clientX - drag.sx) * DRAG_FOLLOW;
      drag.ty = (e.clientY - drag.sy) * DRAG_FOLLOW;
    }
  };
  const onPress = (e: PointerEvent) => {
    if (e.button > 0) return;
    drag.active = true;
    drag.id = e.pointerId;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    drag.tx = 0;
    drag.ty = 0;
  };
  const onRelease = (e: PointerEvent) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    drag.tx = 0;
    drag.ty = 0;
  };
  /** One spring step toward `target`; returns [position, velocity]. */
  const spring = (x: number, v: number, target: number, dt: number): [number, number] => {
    if (reducedMotion) return [target, 0];
    const a = (target - x) * SPRING.stiffness - v * SPRING.damping;
    const nv = v + a * dt;
    return [x + nv * dt, nv];
  };

  /**
   * Places a presented layer against its frame and runs its dissolve. Returns
   * where its ripple ring sits and how large it is drawn.
   */
  const present = (
    item: (typeof items)[number],
    pose: NonNullable<ReturnType<typeof presentPose>>,
    sparkFrom: { group: THREE.Group | null; d: number }
  ) => {
    const shown = item.shown;
    const e = smooth(shown.present);
    const d = reducedMotion ? 0 : shown.dissolve;
    const p = item.group.position;
    p.set(p.x + (pose.x - p.x) * e, p.y + (pose.y - p.y) * e, p.z + (pose.z - p.z) * e);
    const ringAt = { x: p.x, y: p.y, z: p.z };
    // A short drift up while it dissolves; the shader does the leaving.
    const rise = smooth(d) * 0.7 * pose.scale;
    p.set(p.x + pose.up.x * rise, p.y + pose.up.y * rise, p.z + pose.up.z * rise);
    item.group.quaternion.slerp(pose.quaternion, e);
    const dissolving = d > 0 && d < 1;
    if (dissolving) {
      item.group.quaternion.multiply(peelTurn.setFromAxisAngle(peelAxis, -smooth(d) * 0.22));
      sparkFrom.group = item.group;
      sparkFrom.d = d;
    }
    const ringScale = (1 + (pose.scale - 1) * e) * (1 + smooth(d) * 0.04);
    item.group.scale.set(ringScale, ringScale, ringScale);
    item.dissolve.value = d;
    // Under reduced motion the layer simply goes, with no dissolve to watch.
    item.group.visible = reducedMotion ? shown.dissolve < 0.5 : d < 0.995;
    item.slab.opacity = 1;
    item.face.opacity = 1;
    item.slab.emissiveIntensity = 0.12;
    return { ringAt, ringScale };
  };

  /** Lends the spark cloud to the dissolving layer, in its current pose. */
  const placeSparks = (group: THREE.Group | null, d: number) => {
    sparks.visible = !reducedMotion && group !== null;
    if (!group) return;
    group.updateMatrix();
    for (let i = 0; i < SPARK_COUNT; i++) {
      const sp = sparkAt(i, d);
      sparkPoint.set(sp.x, sp.y, sp.z).applyMatrix4(group.matrix);
      sparkPositions[i * 3] = sparkPoint.x;
      sparkPositions[i * 3 + 1] = sparkPoint.y;
      sparkPositions[i * 3 + 2] = sparkPoint.z;
      const tint = i % 3 === 0 ? LILAC : CYAN;
      sparkColours[i * 4] = tint.r;
      sparkColours[i * 4 + 1] = tint.g;
      sparkColours[i * 4 + 2] = tint.b;
      sparkColours[i * 4 + 3] = sp.glow;
    }
    sparkGeometry.attributes.position!.needsUpdate = true;
    sparkGeometry.attributes.color!.needsUpdate = true;
  };

  /** Springs the dragged stack back to rest and offsets it on the screen plane. */
  const placeDrag = (dt: number) => {
    [drag.x, drag.vx] = spring(drag.x, drag.vx, drag.tx, dt);
    [drag.y, drag.vy] = spring(drag.y, drag.vy, drag.ty, dt);
    [drag.press, drag.vp] = spring(drag.press, drag.vp, drag.active ? 1 : 0, dt);
    // Pointer pixels to world units on the screen plane.
    const unit = (VIEW * 2) / cam.zoom / size.h;
    const ox = drag.x * unit;
    const oy = -drag.y * unit;
    root.position.set(
      screenRight.x * ox + screenUp.x * oy,
      screenRight.y * ox + screenUp.y * oy,
      screenRight.z * ox + screenUp.z * oy
    );
    const pressed = 1 - drag.press * 0.035;
    root.scale.set(pressed, pressed, pressed);
  };

  let raf = 0;
  let running = false;
  let hidden = false;
  let last = performance.now();
  const frame = (now: number) => {
    if (hidden) {
      renderer.clear();
      if (running) raf = requestAnimationFrame(frame);
      return;
    }
    // Clamped: a frame stamped before the last one must never step backwards.
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const ease = reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);
    // Scroll arrives in steps (touch momentum especially); ease toward it each frame.
    const follow2 = reducedMotion ? 1 : 1 - Math.pow(0.0005, dt);
    items.forEach((item, index) => {
      const want = presentation[index] ?? { present: 0, dissolve: 0 };
      item.shown.present = approach(item.shown.present, want.present, follow2);
      item.shown.dissolve = approach(item.shown.dissolve, want.dissolve, follow2);
    });
    shownIntro += (intro - shownIntro) * follow2;
    const presenting = items.some((item) => item.shown.present > 0);

    // The camera moves first: a presented layer is placed against its frame.
    const aim = cameraFrame(presenting ? -1 : activeIndex, size);
    // While a layer is presented the rest of the stack sits lower, out from under it.
    const lower = presenting ? PRESENT_DROP : 0;
    const k = reducedMotion ? 1 : 1 - Math.pow(0.02, dt);
    cam.y += (aim.y + lower - cam.y) * k;
    cam.zoom += (aim.zoom - cam.zoom) * k;
    // A steep view (about 50 degrees down), so the printed faces read rather than lie flat.
    camera.position.set(9, CAMERA_HEIGHT + cam.y - REST_Y, 9);
    camera.lookAt(0, cam.y, 0);
    camera.zoom = cam.zoom;
    camera.updateProjectionMatrix();
    const pose = presenting ? presentPose(cam, size) : null;

    // Act 0: layers close together around the stack's centre, turned a quarter.
    const opened = reducedMotion ? 1 : smooth(shownIntro);
    const spread = 0.28 + 0.72 * opened;
    const sparkFrom: { group: THREE.Group | null; d: number } = { group: null, d: 0 };
    items.forEach((item, index) => {
      const target = layerTarget(index, activeIndex);
      const s = item.state;
      s.lift += (target.lift - s.lift) * ease;
      s.glow += (target.glow - s.glow) * ease;
      s.peel += (target.peel - s.peel) * ease;
      const slotY = REST_Y + (baseY(index) - REST_Y) * spread;
      item.group.position.set(0, slotY + s.lift + s.peel * 3.4, 0);
      item.group.visible = s.peel < 0.985;
      item.slab.opacity = 1 - s.peel;
      item.slab.emissiveIntensity = 0.12 * s.glow;
      item.face.opacity = 1 - s.peel;

      // Turned towards the viewer while the page moves, flat once it settles.
      const turning = index === activeIndex && now - movedAt < SETTLE_MS ? 1 : 0;
      item.tilt += (turning - item.tilt) * (reducedMotion ? 1 : 1 - Math.pow(0.02, dt));
      const wobble = s.peel > 0 && s.peel < 1 ? Math.sin(s.peel * Math.PI * 2) * 0.07 : 0;
      turn.setFromAxisAngle(TILT_AXIS, reducedMotion ? 0 : item.tilt * TILT + wobble);
      followEuler.set(pointer.y * 0.09 * s.glow, pointer.x * 0.12 * s.glow, 0);
      item.group.quaternion.copy(turn).multiply(follow.setFromEuler(followEuler));
      item.group.scale.set(1, 1, 1);

      // Phone story: the layer lifts out to the top of the frame and faces the
      // viewer while its card scrolls past. Once the card has left the screen
      // it peels away as layers always have: it drifts up, wobbles and fades,
      // leaving a ripple where it was.
      item.dissolve.value = 0;
      const placed = pose && item.shown.present > 0 ? present(item, pose, sparkFrom) : null;
      const presented = placed !== null;
      const ripple = placed ? 0 : s.peel;
      const ringAt = placed?.ringAt ?? { x: 0, y: baseY(index) + H / 2, z: 0 };
      const ringScale = placed?.ringScale ?? 1;

      rippleRings(reducedMotion ? 0 : ripple).forEach(({ scale, opacity }, r) => {
        const ring = item.rings[r]!;
        ring.visible = opacity > 0.01;
        ring.position.set(ringAt.x, ringAt.y, ringAt.z);
        // On the slab's face: flat in the stack, square to the viewer when presented.
        if (presented) ring.quaternion.copy(item.group.quaternion).multiply(flat);
        else ring.quaternion.copy(flat);
        ring.scale.set(scale * ringScale, scale * ringScale, 1);
        ring.material.opacity = opacity;
      });
    });
    placeSparks(sparkFrom.group, sparkFrom.d);
    placeDrag(dt);
    if (!reducedMotion) {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      // No pointer sway while a layer is presented, so it faces the viewer squarely.
      const sway = presenting ? 0 : 1;
      root.rotation.y = pointer.x * 0.06 * sway + (1 - opened) * INTRO_TURN + drag.x * 0.004;
      root.rotation.x = pointer.y * 0.03 * sway + drag.y * 0.003;
    }
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  };
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  canvas.addEventListener('pointerdown', onPress);
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);
  start();

  return {
    setIntro(progress) {
      intro = Math.min(1, Math.max(0, progress));
      // The first value lands at once: the stack must not visibly close on load.
      if (reducedMotion || !introSet) shownIntro = intro;
      introSet = true;
    },
    setPresentation(next) {
      presentation = LAYERS.map((l) => next?.[l.id] ?? { present: 0, dissolve: 0 });
    },
    setActive(id) {
      const next = id ? LAYERS.findIndex((l) => l.id === id) : -1;
      if (next !== activeIndex) movedAt = performance.now();
      activeIndex = next;
    },
    pause: stop,
    resume: start,
    hide() {
      hidden = true;
      // Force one clear immediately even if the render loop happens to be
      // paused right now (e.g. the canvas is currently off-screen per the
      // IntersectionObserver in AuroraMotion.tsx) — otherwise the buffer
      // would keep whatever was drawn last until the loop next runs.
      renderer.clear();
    },
    show() {
      hidden = false;
    },
    dispose() {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerdown', onPress);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('scroll', onScroll);
      items.forEach((item) => {
        item.rings.forEach((ring) => ring.material.dispose());
        item.slab.dispose();
        item.face.map?.dispose();
        item.face.dispose();
      });
      slabGeometry.dispose();
      faceGeometry.dispose();
      rippleGeometry.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
      sparkMap.dispose();
      rippleMap.dispose();
      shadow.geometry.dispose();
      shadow.material.map?.dispose();
      shadow.material.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
