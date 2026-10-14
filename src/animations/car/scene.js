import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  applyDissolve,
  applyPixelRatio,
  createDissolveUniform,
  createFlakeField,
  createStudioRenderer,
  isMobileViewport,
  lerp,
  smoothstep,
} from '../../core/index.js';

const SCALE = 2;

const MITT_KEYS = [
  { t: 0, x: 1.15, y: 0.58, z: 1.02, rx: 0.7, ry: -0.2, rz: 0.35 },
  { t: 0.08, x: 1.15, y: 0.58, z: 1.02, rx: 0.7, ry: -0.2, rz: 0.35 },
  { t: 0.2, x: 0.55, y: 0.92, z: 0.48, rx: 1.05, ry: -0.1, rz: 0.12 },
  { t: 0.36, x: 0.08, y: 1.02, z: 0.38, rx: 0.95, ry: 0.05, rz: 0.08 },
  { t: 0.52, x: -1.35, y: 0.55, z: -1.05, rx: 0.45, ry: 0.4, rz: 0.1 },
  { t: 1, x: -1.55, y: 0.5, z: -1.2, rx: 0.35, ry: 0.25, rz: 0.05 },
];

const PAD_KEYS = [
  { t: 0, x: -0.95, y: 0.62, z: 1.05, rx: 0.45, ry: 0.6, rz: 0.55 },
  { t: 0.38, x: -0.95, y: 0.62, z: 1.05, rx: 0.45, ry: 0.6, rz: 0.55 },
  { t: 0.5, x: 0.04, y: 1.18, z: 0.4, rx: 0.4, ry: 0.1, rz: 0.1 },
  { t: 0.72, x: -0.08, y: 1.14, z: 0.36, rx: 0.45, ry: -0.15, rz: 0.08 },
  { t: 0.9, x: 1.45, y: 0.55, z: -1.15, rx: 0.3, ry: -0.2, rz: 0.08 },
  { t: 1, x: 1.6, y: 0.5, z: -1.28, rx: 0.25, ry: -0.1, rz: 0.04 },
];

const PAINT = '#243656';
const ROOF = '#1a2844';
const TRIM = '#d5dce4';
const TIRE = '#14171b';
const RIM = '#e6ebf1';
const LAMP = '#f6f1e6';
const TAIL = '#a33b44';
const VOID = '#10141c';
const GRILLE = '#0c0f14';

function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Could not merge car geometry.');
  return merged;
}

function solid(geometry, hex) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!source.getAttribute('normal')) source.computeVertexNormals();
  if (!source.getAttribute('uv')) {
    const count = source.getAttribute('position').count;
    source.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return paint(source, hex);
}

function rounded(width, height, depth, x, y, z, color, radius = 0.04) {
  const geometry = new RoundedBoxGeometry(width, height, depth, 2, radius);
  geometry.translate(x, y, z);
  return solid(geometry, color);
}

function poseAt(progress, keys) {
  let index = 0;
  while (index < keys.length - 2 && progress > keys[index + 1].t) index += 1;
  const from = keys[index];
  const to = keys[index + 1];
  const t = smoothstep(from.t, to.t, progress);
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    z: lerp(from.z, to.z, t),
    rx: lerp(from.rx, to.rx, t),
    ry: lerp(from.ry, to.ry, t),
    rz: lerp(from.rz, to.rz, t),
  };
}

function applyPose(mesh, pose) {
  mesh.position.set(pose.x, pose.y, pose.z);
  mesh.rotation.set(pose.rx, pose.ry, pose.rz);
}

function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function toDust(geometry) {
  const color = geometry.getAttribute('color');
  const position = geometry.getAttribute('position');
  const dust = new THREE.Color('#8a8172');
  const grime = new THREE.Color('#3f3830');
  for (let i = 0; i < position.count; i += 1) {
    const n = hash3(position.getX(i), position.getY(i), position.getZ(i));
    const current = new THREE.Color(color.getX(i), color.getY(i), color.getZ(i));
    const luma = current.r * 0.3 + current.g * 0.59 + current.b * 0.11;
    current.lerp(dust, luma > 0.62 ? 0.84 : 0.7);
    if (n > 0.74) current.lerp(grime, 0.72);
    current.multiplyScalar(0.78 + n * 0.28);
    color.setXYZ(i, current.r, current.g, current.b);
  }
  color.needsUpdate = true;
  return geometry;
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 120);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function studioEnvironment() {
  const environment = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const shell = new THREE.Mesh(
    box,
    new THREE.MeshBasicMaterial({ color: 0x121418, side: THREE.BackSide }),
  );
  shell.scale.set(18, 10, 18);
  environment.add(shell);

  const soft = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xd5dde8 }));
  soft.position.set(-2.2, 4.4, 3.4);
  soft.scale.set(7.2, 0.7, 0.25);
  environment.add(soft);

  const warm = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x6d5644 }));
  warm.position.set(4.6, 2.6, -1.6);
  warm.scale.set(0.35, 3.6, 2.4);
  environment.add(warm);

  const floor = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x3a342e }));
  floor.position.set(0, -3.2, 0);
  floor.scale.set(16, 0.4, 16);
  environment.add(floor);
  return environment;
}

function box(width, height, depth, x, y, z, color) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return paint(geometry, color);
}

function buildBay() {
  const parts = [
    box(5.4, 0.16, 3.5, 0, -0.08, 0, '#4a453f'),
    box(5.15, 0.02, 3.28, 0, 0.005, 0, '#5a534c'),
  ];
  const disc = new THREE.CylinderGeometry(1.62, 1.62, 0.045, 64);
  disc.translate(0, 0.02, 0);
  parts.push(paint(disc, '#2a2628'));
  const ring = new THREE.TorusGeometry(1.5, 0.012, 8, 80);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.048, 0);
  parts.push(paint(ring, '#8d939c'));
  const bottle = new THREE.CylinderGeometry(0.055, 0.062, 0.2, 14);
  bottle.translate(-1.85, 0.16, -0.72);
  parts.push(paint(bottle, '#2c333c'));
  const cap = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10);
  cap.translate(-1.85, 0.28, -0.72);
  parts.push(paint(cap, '#d5dbe3'));
  return mergeParts(parts);
}

function wheelPair(x, z) {
  const parts = [];
  for (const side of [z, -z]) {
    const tire = new THREE.CylinderGeometry(0.125, 0.125, 0.07, 28);
    tire.rotateX(Math.PI / 2);
    tire.translate(x, 0.145, side);
    parts.push(solid(tire, TIRE));
    const rim = new THREE.CylinderGeometry(0.074, 0.074, 0.078, 22);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, 0.145, side);
    parts.push(solid(rim, RIM));
    const hub = new THREE.CylinderGeometry(0.02, 0.02, 0.084, 12);
    hub.rotateX(Math.PI / 2);
    hub.translate(x, 0.145, side);
    parts.push(solid(hub, '#2a3038'));
  }
  return parts;
}

function buildCar() {
  const parts = [
    rounded(1.22, 0.18, 0.5, 0.02, 0.28, 0, PAINT, 0.05),
    rounded(1.02, 0.055, 0.44, 0.04, 0.38, 0, PAINT, 0.028),
    rounded(0.5, 0.06, 0.4, 0.32, 0.4, 0, PAINT, 0.028),
    rounded(0.48, 0.14, 0.36, -0.02, 0.46, 0, PAINT, 0.04),
    rounded(0.32, 0.04, 0.3, -0.06, 0.54, 0, ROOF, 0.018),
    rounded(0.3, 0.05, 0.38, -0.44, 0.37, 0, PAINT, 0.02),
    rounded(0.1, 0.07, 0.48, 0.66, 0.2, 0, TRIM, 0.02),
    rounded(0.09, 0.07, 0.48, -0.66, 0.2, 0, TRIM, 0.02),
    rounded(0.028, 0.07, 0.2, 0.71, 0.23, 0, GRILLE, 0.006),
    rounded(0.03, 0.032, 0.09, 0.7, 0.24, 0.16, LAMP, 0.008),
    rounded(0.03, 0.032, 0.09, 0.7, 0.24, -0.16, LAMP, 0.008),
    rounded(0.022, 0.028, 0.1, -0.7, 0.26, 0.15, TAIL, 0.006),
    rounded(0.022, 0.028, 0.1, -0.7, 0.26, -0.15, TAIL, 0.006),
    rounded(0.07, 0.03, 0.045, 0.16, 0.4, 0.21, TRIM, 0.01),
    rounded(0.07, 0.03, 0.045, 0.16, 0.4, -0.21, TRIM, 0.01),
    rounded(0.86, 0.012, 0.012, 0.04, 0.34, 0.248, TRIM, 0.004),
    rounded(0.86, 0.012, 0.012, 0.04, 0.34, -0.248, TRIM, 0.004),
    rounded(0.28, 0.08, 0.24, -0.04, 0.44, 0, VOID, 0.02),
    ...wheelPair(0.4, 0.3),
    ...wheelPair(-0.42, 0.3),
  ];
  return mergeParts(parts);
}

function buildGlass() {
  const windshield = new THREE.BoxGeometry(0.006, 0.055, 0.2);
  windshield.rotateZ(-0.95);
  windshield.translate(0.08, 0.5, 0);
  const rear = new THREE.BoxGeometry(0.006, 0.04, 0.18);
  rear.rotateZ(0.85);
  rear.translate(-0.16, 0.51, 0);
  const left = new THREE.BoxGeometry(0.16, 0.045, 0.008);
  left.translate(-0.02, 0.48, 0.176);
  const right = new THREE.BoxGeometry(0.16, 0.045, 0.008);
  right.translate(-0.02, 0.48, -0.176);
  return mergeParts([
    windshield.toNonIndexed(),
    rear.toNonIndexed(),
    left.toNonIndexed(),
    right.toNonIndexed(),
  ]);
}

function buildMitt() {
  const palm = new THREE.SphereGeometry(0.16, 20, 14);
  palm.scale(1.15, 0.4, 0.88);
  const bar = new THREE.BoxGeometry(0.18, 0.03, 0.08);
  bar.translate(0, 0.08, 0);
  const grip = new THREE.CylinderGeometry(0.022, 0.026, 0.52, 12);
  grip.rotateX(Math.PI / 2);
  grip.translate(0, 0.02, 0.28);
  return mergeParts([
    solid(palm, '#4a5560'),
    solid(bar, '#cbb892'),
    solid(grip, '#5c4632'),
  ]);
}

function buildPolisher() {
  const pad = new THREE.CylinderGeometry(0.16, 0.17, 0.04, 28);
  const backing = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20);
  backing.translate(0, 0.04, 0);
  const grip = new THREE.CylinderGeometry(0.024, 0.028, 0.34, 12);
  grip.rotateX(-0.7);
  grip.translate(0, 0.18, -0.12);
  return mergeParts([
    solid(pad, '#efe4d0'),
    solid(backing, '#1c1e22'),
    solid(grip, '#5c4632'),
  ]);
}

/**
 * Draw budget, all frames:
 * bay, contact shadow, dull coupe, finished coupe, glass, mitt, polisher, dirt.
 * Eight draw calls. Lights and the environment probe are not draws.
 */
export function createCarScene(canvas) {
  const mobile = isMobileViewport();
  const renderer = createStudioRenderer(canvas, { mobile });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0b0a');

  const camera = new THREE.PerspectiveCamera(mobile ? 48 : 30, 1, 0.05, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.04).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 1;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xf2f4f8, 0x1a1614, 0.48);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.15);
  key.position.set(3.4, 5.2, 2.6);
  const rim = new THREE.DirectionalLight(0xc5d4e6, 1.15);
  rim.position.set(-3.6, 2.8, -2.4);
  const fill = new THREE.DirectionalLight(0xe7eef8, 0.62);
  fill.position.set(-0.4, 1.8, 4.4);
  const spark = new THREE.PointLight(0xffd2a2, 0, 1.8);
  const gleam = new THREE.PointLight(0xfff6e4, 0, 2.4);
  scene.add(hemi, key, rim, fill, spark, gleam);

  const bay = new THREE.Mesh(
    buildBay(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.06,
      envMapIntensity: 0.35,
    }),
  );
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 1.7),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  scene.add(bay, shadow);

  const dissolve = createDissolveUniform(0, 0.08);
  const finishGeo = buildCar();
  const dullGeo = toDust(finishGeo.clone());

  const conceal = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.08,
    envMapIntensity: 0.22,
  });
  const reveal = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.22,
    metalness: 0.78,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.25,
  });
  applyDissolve(conceal, dissolve, 'conceal');
  applyDissolve(reveal, dissolve, 'reveal');
  conceal.polygonOffset = true;
  conceal.polygonOffsetFactor = -1;
  conceal.polygonOffsetUnits = -1;

  const spin = new THREE.Group();
  spin.scale.setScalar(SCALE);
  const dull = new THREE.Mesh(dullGeo, conceal);
  const finished = new THREE.Mesh(finishGeo, reveal);
  const glass = new THREE.Mesh(
    buildGlass(),
    new THREE.MeshPhysicalMaterial({
      color: '#b7b1a6',
      roughness: 0.42,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      envMapIntensity: 0.85,
    }),
  );
  const lamps = new THREE.PointLight(0xfff4dd, 0, 1.5);
  lamps.position.set(0.72, 0.24, 0);
  spin.add(dull, finished, glass, lamps);

  const emitter = new THREE.Group();
  emitter.position.set(0.02, 0.58, 0);
  emitter.scale.set(1.35, 0.35, 0.72);
  spin.add(emitter);
  scene.add(spin);

  const mitt = new THREE.Mesh(
    buildMitt(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.08,
      envMapIntensity: 0.4,
    }),
  );
  const polisher = new THREE.Mesh(
    buildPolisher(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.28,
      envMapIntensity: 0.7,
    }),
  );
  scene.add(mitt, polisher);

  const flakes = createFlakeField({ count: mobile ? 80 : 130, color: '#6a5a48' });
  scene.add(flakes.mesh);

  const filthy = new THREE.Color('#9a907f');
  const clearGlass = new THREE.Color('#d5e0ea');
  const look = new THREE.Vector3(0, 0.42, 0);

  function resize() {
    const wide = isMobileViewport();
    applyPixelRatio(renderer, wide);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function setProgress(progress) {
    const p = Math.min(1, Math.max(0, progress));
    const wide = isMobileViewport();
    dissolve.uCut.value = smoothstep(0.32, 0.86, p);
    spin.rotation.y = 0.42 + Math.PI * 2 * smoothstep(0.4, 0.9, p);

    const travel = smoothstep(0, 1, p);
    const pull = wide ? 1.62 : 1;
    camera.fov = wide ? 46 : 32;
    camera.position.set(
      lerp(2.95, 2.45, travel) * pull,
      lerp(1.95, 1.5, travel) * (wide ? 1.12 : 1),
      lerp(3.45, 2.85, travel) * pull,
    );
    look.y = wide ? 0.34 : 0.42;
    camera.lookAt(look);
    camera.updateProjectionMatrix();

    applyPose(mitt, poseAt(p, MITT_KEYS));
    applyPose(polisher, poseAt(p, PAD_KEYS));
    spin.updateMatrixWorld(true);
    flakes.apply(p, emitter);

    const scrub = smoothstep(0.16, 0.24, p) * (1 - smoothstep(0.4, 0.5, p));
    spark.intensity = scrub * 1.7;
    spark.position.copy(mitt.position);
    spark.position.y += 0.05;

    const finish = smoothstep(0.7, 0.96, p);
    gleam.intensity = finish * 1.15;
    gleam.position.set(0.35, 1.15, 0.85);
    key.intensity = lerp(1.85, 2.35, finish);
    lamps.intensity = finish * 0.85;

    const cleaned = smoothstep(0.34, 0.84, p);
    glass.material.roughness = lerp(0.48, 0.06, cleaned);
    glass.material.opacity = lerp(0.62, 0.38, cleaned);
    glass.material.color.copy(filthy).lerp(clearGlass, cleaned);
  }

  function render() {
    renderer.render(scene, camera);
    return renderer.info.render.calls;
  }

  function getDrawCalls() {
    return renderer.info.render.calls;
  }

  function getPixelRatio() {
    return renderer.getPixelRatio();
  }

  resize();
  setProgress(0);

  return { resize, setProgress, render, getDrawCalls, getPixelRatio, camera, renderer };
}
