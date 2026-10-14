import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

const SCRAPER_KEYS = [
  { t: 0, x: -0.78, y: 0.13, z: 0.42, rx: 0.35, ry: 0.7, rz: 0.85 },
  { t: 0.12, x: -0.78, y: 0.13, z: 0.42, rx: 0.35, ry: 0.7, rz: 0.85 },
  { t: 0.2, x: -0.34, y: 0.4, z: 0.62, rx: 0.62, ry: 0.45, rz: 0.35 },
  { t: 0.4, x: 0.36, y: 0.39, z: 0.58, rx: 0.58, ry: -0.35, rz: 0.28 },
  { t: 0.56, x: 0.86, y: 0.15, z: 0.34, rx: 0.3, ry: -0.5, rz: -0.55 },
  { t: 1, x: 0.98, y: 0.13, z: 0.22, rx: 0.22, ry: -0.4, rz: -0.7 },
];

const CLOTH_KEYS = [
  { t: 0, x: 0.8, y: 0.13, z: 0.05, rx: 0.15, ry: 0.2, rz: 0.05 },
  { t: 0.4, x: 0.8, y: 0.13, z: 0.05, rx: 0.15, ry: 0.2, rz: 0.05 },
  { t: 0.5, x: -0.22, y: 0.42, z: 0.62, rx: 0.7, ry: 0.4, rz: 0.15 },
  { t: 0.7, x: 0.28, y: 0.41, z: 0.58, rx: 0.66, ry: -0.25, rz: -0.1 },
  { t: 0.86, x: 0.88, y: 0.14, z: 0.18, rx: 0.18, ry: 0.1, rz: 0.08 },
  { t: 1, x: 0.96, y: 0.13, z: 0.02, rx: 0.12, ry: 0.05, rz: 0.04 },
];

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
  if (!merged) throw new Error('Could not merge watch geometry.');
  return merged;
}

function box(width, height, depth, x, y, z, color, rotationY = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (rotationY) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return paint(geometry, color);
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

function toGrime(geometry) {
  const color = geometry.getAttribute('color');
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const luma = color.getX(i) * 0.3 + color.getY(i) * 0.59 + color.getZ(i) * 0.11;
    if (luma < 0.2) {
      color.setXYZ(i, 0.07, 0.045, 0.03);
      continue;
    }
    const n = hash3(position.getX(i), position.getY(i), position.getZ(i));
    const pit = n > 0.72 ? 0.55 : 1;
    color.setXYZ(i, (0.28 + n * 0.36) * pit, (0.09 + n * 0.1) * pit, 0.035 * pit);
  }
  color.needsUpdate = true;
  return geometry;
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 16, 128, 128, 118);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
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
    new THREE.MeshBasicMaterial({ color: 0x14110f, side: THREE.BackSide }),
  );
  shell.scale.set(14, 9, 14);
  environment.add(shell);

  const warm = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x6a4328 }));
  warm.position.set(-3.2, 3.1, 2.4);
  warm.scale.set(5.2, 3.2, 0.3);
  environment.add(warm);

  const cool = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x314056 }));
  cool.position.set(4.2, 2.2, -2.4);
  cool.scale.set(2.4, 4.4, 0.3);
  environment.add(cool);

  const floor = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x3a2c24 }));
  floor.position.set(0, -3.2, 0);
  floor.scale.set(12, 0.4, 12);
  environment.add(floor);
  return environment;
}

function buildBench() {
  const parts = [
    box(4.4, 0.1, 2.5, 0, 0, 0, '#6a4b38'),
    box(4.15, 0.025, 2.28, 0, 0.06, 0, '#7d5942'),
    box(4.05, 0.14, 0.08, 0, -0.04, 1.18, '#4e382c'),
    box(4.05, 0.14, 0.08, 0, -0.04, -1.18, '#3f2e24'),
    box(0.14, 0.92, 0.14, -1.9, -0.48, -1.02, '#2c211b'),
    box(0.14, 0.92, 0.14, 1.9, -0.48, -1.02, '#2c211b'),
    box(0.14, 0.92, 0.14, -1.9, -0.48, 1.02, '#2c211b'),
    box(0.14, 0.92, 0.14, 1.9, -0.48, 1.02, '#2c211b'),
  ];
  const can = new THREE.CylinderGeometry(0.07, 0.08, 0.16, 16);
  can.translate(-0.78, 0.16, -0.42);
  parts.push(paint(can, '#b08948'));
  const canTop = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10);
  canTop.translate(-0.78, 0.26, -0.42);
  parts.push(paint(canTop, '#d7c4a2'));
  return mergeParts(parts);
}

function buildPad() {
  const disc = new THREE.CylinderGeometry(0.62, 0.64, 0.04, 48);
  disc.translate(0, 0.08, 0);
  paint(disc, '#5c2a30');
  const stitch = new THREE.TorusGeometry(0.52, 0.01, 8, 56);
  stitch.rotateX(Math.PI / 2);
  stitch.translate(0, 0.102, 0);
  paint(stitch, '#3a1a20');
  return mergeParts([disc, stitch]);
}

function buildCase() {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.47, 0.5, 0.12, 72);
  paint(body, '#b7b3ac');
  parts.push(body);

  const lip = new THREE.CylinderGeometry(0.5, 0.5, 0.028, 72);
  lip.translate(0, 0.04, 0);
  paint(lip, '#a8a49c');
  parts.push(lip);

  const bezel = new THREE.TorusGeometry(0.455, 0.034, 16, 80);
  bezel.rotateX(Math.PI / 2);
  bezel.translate(0, 0.062, 0);
  paint(bezel, '#c6a15a');
  parts.push(bezel);

  const ring = new THREE.TorusGeometry(0.305, 0.008, 8, 64);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.078, 0);
  paint(ring, '#d7b56a');
  parts.push(ring);

  const stem = new THREE.CylinderGeometry(0.028, 0.028, 0.07, 12);
  stem.rotateZ(Math.PI / 2);
  stem.translate(0.52, 0.012, 0);
  paint(stem, '#d7b56a');
  parts.push(stem);

  const crown = new THREE.CylinderGeometry(0.055, 0.055, 0.045, 18);
  crown.rotateZ(Math.PI / 2);
  crown.translate(0.575, 0.012, 0);
  paint(crown, '#e0c07a');
  parts.push(crown);

  const bowNeck = new THREE.BoxGeometry(0.06, 0.07, 0.05);
  bowNeck.translate(0, 0.07, -0.5);
  paint(bowNeck, '#d5d0c8');
  parts.push(bowNeck);

  const bow = new THREE.TorusGeometry(0.072, 0.014, 10, 28);
  bow.rotateY(Math.PI / 2);
  bow.translate(0, 0.12, -0.52);
  paint(bow, '#c8c4bc');
  parts.push(bow);

  return mergeParts(parts);
}

function buildDial() {
  const parts = [];
  const plate = new THREE.CylinderGeometry(0.355, 0.355, 0.018, 64);
  plate.translate(0, 0.055, 0);
  paint(plate, '#e6d7bc');
  parts.push(plate);

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const length = i % 3 === 0 ? 0.085 : 0.048;
    const tick = new THREE.BoxGeometry(i % 3 === 0 ? 0.018 : 0.01, 0.008, length);
    tick.translate(0, 0, 0.29);
    tick.rotateY(angle);
    tick.translate(0, 0.072, 0);
    paint(tick, '#1a1916');
    parts.push(tick);
  }

  const hour = new THREE.BoxGeometry(0.016, 0.008, 0.16);
  hour.translate(0, 0, -0.07);
  hour.rotateY(1.05);
  hour.translate(0, 0.084, 0);
  paint(hour, '#161513');
  parts.push(hour);

  const minute = new THREE.BoxGeometry(0.012, 0.008, 0.24);
  minute.translate(0, 0, -0.09);
  minute.rotateY(-1.05);
  minute.translate(0, 0.092, 0);
  paint(minute, '#12110f');
  parts.push(minute);

  const cap = new THREE.CylinderGeometry(0.028, 0.028, 0.016, 16);
  cap.translate(0, 0.095, 0);
  paint(cap, '#c6a15a');
  parts.push(cap);

  return mergeParts(parts);
}

function buildCrystal() {
  const glass = new THREE.CylinderGeometry(0.34, 0.34, 0.012, 64);
  glass.translate(0, 0.1, 0);
  return glass;
}

function buildScraper() {
  const blade = new THREE.BoxGeometry(0.16, 0.01, 0.042);
  paint(blade, '#c5ccd1');
  const ferrule = new THREE.CylinderGeometry(0.016, 0.016, 0.04, 10);
  ferrule.rotateX(Math.PI / 2);
  ferrule.translate(0, 0.012, 0.04);
  paint(ferrule, '#c6a15a');
  const handle = new THREE.CylinderGeometry(0.016, 0.018, 0.46, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(0, 0.012, 0.28);
  paint(handle, '#6a432c');
  return mergeParts([blade, ferrule, handle]);
}

function buildCloth() {
  const pad = new THREE.SphereGeometry(0.13, 18, 12);
  pad.scale(1.35, 0.32, 0.85);
  paint(pad, '#3e5348');
  const fold = new THREE.BoxGeometry(0.1, 0.03, 0.07);
  fold.translate(0.03, 0.03, 0.01);
  paint(fold, '#2c3d34');
  return mergeParts([pad, fold]);
}

/**
 * Draw budget, all frames:
 * bench, pad, contact shadow, rust case, polished case,
 * grimy dial, enamel dial, crystal, scraper, cloth, flakes.
 * Eleven draw calls. Lights and the environment probe are not draws.
 */
export function createWatchScene(canvas) {
  const mobile = isMobileViewport();
  const renderer = createStudioRenderer(canvas, { mobile });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0b0a');

  const camera = new THREE.PerspectiveCamera(mobile ? 36 : 28, 1, 0.05, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.05).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.95;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x1a1412, 0.42);
  const key = new THREE.DirectionalLight(0xffe3b5, 1.65);
  key.position.set(-2.4, 3.6, 2.2);
  const rim = new THREE.DirectionalLight(0xb9c9ff, 0.55);
  rim.position.set(3.1, 1.8, -2.4);
  const fill = new THREE.DirectionalLight(0xfff8ee, 0.32);
  fill.position.set(0.2, 1.4, 3.2);
  const spark = new THREE.PointLight(0xffb15a, 0, 1.4);
  const gleam = new THREE.PointLight(0xfff6df, 0, 1.8);
  scene.add(hemi, key, rim, fill, spark, gleam);

  const bench = new THREE.Mesh(
    buildBench(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.04,
      envMapIntensity: 0.4,
    }),
  );
  const pad = new THREE.Mesh(
    buildPad(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
      envMapIntensity: 0.25,
    }),
  );
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.103;
  scene.add(bench, pad, shadow);

  const dissolve = createDissolveUniform(0, 0.08);
  const casePolishGeo = buildCase();
  const caseRustGeo = toGrime(casePolishGeo.clone());
  const dialPolishGeo = buildDial();
  const dialRustGeo = toGrime(dialPolishGeo.clone());

  const caseConceal = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.2,
    envMapIntensity: 0.28,
  });
  const caseReveal = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.32,
    metalness: 0.82,
    clearcoat: 0.28,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.05,
  });
  const dialConceal = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04,
    envMapIntensity: 0.2,
  });
  const dialReveal = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.04,
    envMapIntensity: 0.35,
  });

  applyDissolve(caseConceal, dissolve, 'conceal');
  applyDissolve(caseReveal, dissolve, 'reveal');
  applyDissolve(dialConceal, dissolve, 'conceal');
  applyDissolve(dialReveal, dissolve, 'reveal');
  caseConceal.polygonOffset = true;
  caseConceal.polygonOffsetFactor = -1;
  caseConceal.polygonOffsetUnits = -1;
  dialConceal.polygonOffset = true;
  dialConceal.polygonOffsetFactor = -1;
  dialConceal.polygonOffsetUnits = -1;

  const watch = new THREE.Group();
  watch.position.set(0, 0.32, 0);
  watch.rotation.x = 0.34;
  const spin = new THREE.Group();
  watch.add(spin);

  const caseRust = new THREE.Mesh(caseRustGeo, caseConceal);
  const casePolish = new THREE.Mesh(casePolishGeo, caseReveal);
  const dialRust = new THREE.Mesh(dialRustGeo, dialConceal);
  const dialPolish = new THREE.Mesh(dialPolishGeo, dialReveal);
  const crystal = new THREE.Mesh(
    buildCrystal(),
    new THREE.MeshPhysicalMaterial({
      color: '#d9c4ae',
      roughness: 0.28,
      metalness: 0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      envMapIntensity: 0.8,
    }),
  );
  spin.add(caseRust, casePolish, dialRust, dialPolish, crystal);
  scene.add(watch);

  const scraper = new THREE.Mesh(
    buildScraper(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.35,
      envMapIntensity: 0.7,
    }),
  );
  const cloth = new THREE.Mesh(
    buildCloth(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  scene.add(scraper, cloth);

  const flakes = createFlakeField({ count: mobile ? 90 : 150 });
  scene.add(flakes.mesh);

  const grimy = new THREE.Color('#d9c4ae');
  const clearGlass = new THREE.Color('#f4f1ea');
  const look = new THREE.Vector3(0, 0.34, 0);

  function resize() {
    const mobileNow = isMobileViewport();
    applyPixelRatio(renderer, mobileNow);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.fov = mobileNow ? 36 : 28;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function setProgress(progress) {
    const p = Math.min(1, Math.max(0, progress));
    dissolve.uCut.value = smoothstep(0.32, 0.86, p);
    spin.rotation.y = lerp(-0.35, 0.7, smoothstep(0.08, 0.88, p));

    const travel = smoothstep(0, 1, p);
    camera.position.set(
      lerp(0.35, 0.08, travel),
      lerp(1.72, 1.38, travel),
      lerp(2.55, 2.05, travel),
    );
    camera.lookAt(look);

    applyPose(scraper, poseAt(p, SCRAPER_KEYS));
    applyPose(cloth, poseAt(p, CLOTH_KEYS));
    watch.updateMatrixWorld(true);
    flakes.apply(p, spin);

    const scrape = smoothstep(0.16, 0.24, p) * (1 - smoothstep(0.4, 0.52, p));
    spark.intensity = scrape * 1.6;
    spark.position.copy(scraper.position);
    spark.position.y += 0.06;

    const finish = smoothstep(0.7, 0.96, p);
    gleam.intensity = finish * 0.35;
    gleam.position.set(0.25, 1.05, 0.9);
    key.intensity = lerp(1.55, 1.85, finish);

    const cleaned = smoothstep(0.34, 0.84, p);
    crystal.material.roughness = lerp(0.28, 0.04, cleaned);
    crystal.material.opacity = lerp(0.22, 0.08, cleaned);
    crystal.material.color.copy(grimy).lerp(clearGlass, cleaned);
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
