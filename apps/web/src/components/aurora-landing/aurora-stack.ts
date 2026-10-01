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
    g.roundRect(24, 24, canvas.width - 48, canvas.height - 48, 40);
    g.stroke();
  }
  return new THREE.CanvasTexture(canvas);
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

export interface AuroraStack {
  setActive(id: LayerId | null): void;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    const face = new THREE.MeshBasicMaterial({
      map: faceTexture(layer.id, layer.colour, fonts),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
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
        color: colour,
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
      tilt: 0,
      state: { lift: 0, glow: 0, peel: 0 } as LayerTarget,
    };
  });
  const turn = new THREE.Quaternion();
  const follow = new THREE.Quaternion();
  const followEuler = new THREE.Euler();

  let activeIndex = -1;
  /** The last time the page scrolled or the active layer changed. */
  let movedAt = -Infinity;
  const onScroll = () => {
    movedAt = performance.now();
  };
  const size = { w: 1, h: 1 };
  const cam = { y: REST_Y, zoom: 1 };
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
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const ease = reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);
    items.forEach((item, index) => {
      const target = layerTarget(index, activeIndex);
      const s = item.state;
      s.lift += (target.lift - s.lift) * ease;
      s.glow += (target.glow - s.glow) * ease;
      s.peel += (target.peel - s.peel) * ease;
      item.group.position.y = baseY(index) + s.lift + s.peel * 3.4;
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

      rippleRings(reducedMotion ? 0 : s.peel).forEach(({ scale, opacity }, r) => {
        const ring = item.rings[r]!;
        ring.visible = opacity > 0.01;
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = opacity;
      });
    });
    const aim = cameraFrame(activeIndex, size);
    const k = reducedMotion ? 1 : 1 - Math.pow(0.02, dt);
    cam.y += (aim.y - cam.y) * k;
    cam.zoom += (aim.zoom - cam.zoom) * k;
    // A steep view (about 50 degrees down), so the printed faces read rather than lie flat.
    camera.position.set(9, CAMERA_HEIGHT + cam.y - REST_Y, 9);
    camera.lookAt(0, cam.y, 0);
    camera.zoom = cam.zoom;
    camera.updateProjectionMatrix();
    if (!reducedMotion) {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      root.rotation.y = pointer.x * 0.06;
      root.rotation.x = pointer.y * 0.03;
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
  start();

  return {
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
