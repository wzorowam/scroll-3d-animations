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

const BLADE_KEYS = [
  { t: 0, x: -0.78, y: 0.15, z: 1.02, rx: 0.15, ry: 1.15, rz: 0.35 },
  { t: 0.1, x: -0.78, y: 0.15, z: 1.02, rx: 0.15, ry: 1.15, rz: 0.35 },
  { t: 0.22, x: -0.04, y: 0.92, z: 0.62, rx: -0.85, ry: 0.05, rz: 0.08 },
  { t: 0.34, x: 0.0, y: 0.78, z: 0.42, rx: -1.05, ry: 0, rz: 0 },
  { t: 0.5, x: 0.82, y: 0.32, z: 0.95, rx: 0.2, ry: -0.55, rz: -0.45 },
  { t: 1, x: 1.22, y: 0.16, z: 1.05, rx: 0.12, ry: -0.35, rz: -0.55 },
];

const TAMPER_KEYS = [
  { t: 0, x: 0.98, y: 0.1, z: -0.28, rx: 0.04, ry: -0.15, rz: 0.02 },
  { t: 0.32, x: 0.98, y: 0.1, z: -0.28, rx: 0.04, ry: -0.15, rz: 0.02 },
  { t: 0.42, x: 0.0, y: 0.86, z: 0.36, rx: 0.04, ry: 0, rz: 0 },
  { t: 0.5, x: 0.0, y: 0.58, z: 0.22, rx: 0, ry: 0, rz: 0 },
  { t: 0.58, x: 0.9, y: 0.42, z: 0.9, rx: 0.18, ry: 0.25, rz: 0.12 },
  { t: 1, x: 1.24, y: 0.12, z: 0.62, rx: 0.05, ry: 0.1, rz: 0.04 },
];

const BEAN_RADIUS = 0.42;
const BEAN_SY = 0.8;
const BEAN_HALF_Y = BEAN_RADIUS * BEAN_SY;
const PAD_TOP = 0.122;

function paint(geometry, color) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const sample = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    if (typeof color === 'function') color(sample, geometry.attributes.position, i);
    else sample.set(color);
    colors[i * 3] = sample.r;
    colors[i * 3 + 1] = sample.g;
    colors[i * 3 + 2] = sample.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Could not merge coffee geometry.');
  return merged;
}

function box(width, height, depth, x, y, z, color) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
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
  const shellGeo = new THREE.BoxGeometry(1, 1, 1);
  const shell = new THREE.Mesh(
    shellGeo,
    new THREE.MeshBasicMaterial({ color: 0x14110f, side: THREE.BackSide }),
  );
  shell.scale.set(14, 9, 14);
  environment.add(shell);

  const warm = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0x6a3d24 }));
  warm.position.set(-3.2, 3.1, 2.4);
  warm.scale.set(5.2, 3.2, 0.3);
  environment.add(warm);

  const cool = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0x2e3c50 }));
  cool.position.set(4.2, 2.2, -2.4);
  cool.scale.set(2.4, 4.4, 0.3);
  environment.add(cool);

  const floor = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0x3a2a22 }));
  floor.position.set(0, -3.2, 0);
  floor.scale.set(12, 0.4, 12);
  environment.add(floor);
  return environment;
}

function buildCounter() {
  const parts = [
    box(4.4, 0.1, 2.5, 0, 0, 0, '#5a3d2e'),
    box(4.15, 0.025, 2.28, 0, 0.06, 0, '#6d4b38'),
    box(4.05, 0.14, 0.08, 0, -0.04, 1.18, '#3e2c22'),
    box(4.05, 0.14, 0.08, 0, -0.04, -1.18, '#34241c'),
    box(0.14, 0.92, 0.14, -1.9, -0.48, -1.02, '#241911'),
    box(0.14, 0.92, 0.14, 1.9, -0.48, -1.02, '#241911'),
    box(0.14, 0.92, 0.14, -1.9, -0.48, 1.02, '#241911'),
    box(0.14, 0.92, 0.14, 1.9, -0.48, 1.02, '#241911'),
  ];
  const tin = new THREE.CylinderGeometry(0.075, 0.08, 0.2, 18);
  tin.translate(-0.86, 0.18, -0.48);
  parts.push(paint(tin, '#4a3024'));
  const lid = new THREE.CylinderGeometry(0.082, 0.082, 0.03, 18);
  lid.translate(-0.86, 0.29, -0.48);
  parts.push(paint(lid, '#c6a15a'));
  return mergeParts(parts);
}

function buildBoard() {
  const disc = new THREE.CylinderGeometry(0.66, 0.68, 0.045, 48);
  disc.translate(0, 0.095, 0);
  paint(disc, '#3b241c');
  const stitch = new THREE.TorusGeometry(0.58, 0.01, 8, 56);
  stitch.rotateX(Math.PI / 2);
  stitch.translate(0, 0.118, 0);
  paint(stitch, '#2a1812');
  return mergeParts([disc, stitch]);
}

function colorBean(color, position, index) {
  const x = position.getX(index);
  const y = position.getY(index);
  const z = position.getZ(index);
  const n = hash3(x * 2.4, y * 2.4, z * 2.4);
  const ax = Math.abs(x);
  if (ax < 0.016) {
    color.setRGB(0.42 + n * 0.08, 0.22 + n * 0.04, 0.12);
    return;
  }
  const roast = 0.28 + n * 0.28;
  const oil = n > 0.84 ? 1.22 : 1;
  const lit = y > 0.02 ? 1.2 : 0.78;
  const seam = ax < 0.06 ? 0.72 : 1;
  color.setRGB(roast * 0.72 * oil * lit * seam, roast * 0.36 * oil * lit * seam, roast * 0.18 * lit * seam);
}

function buildBeanHalf(sign) {
  const phiStart = sign < 0 ? -Math.PI / 2 : Math.PI / 2;
  const geo = new THREE.SphereGeometry(BEAN_RADIUS, 40, 28, phiStart, Math.PI);
  geo.scale(0.88, BEAN_SY, 1.42);
  const pos = geo.attributes.position;
  const halfLen = BEAN_RADIUS * 1.42;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const along = Math.min(1, Math.abs(z) / halfLen);
    if (y > 0.02 && Math.abs(x) < 0.09) {
      const groove = (1 - Math.abs(x) / 0.09) * (1 - along * 0.4);
      pos.setY(i, y - groove * 0.075);
    }
    const n = hash3(x, y, z);
    if (Math.abs(x) > 0.03) {
      pos.setXYZ(
        i,
        x * (1 + (n - 0.5) * 0.035),
        pos.getY(i) * (1 + (n - 0.5) * 0.03),
        z * (1 + (hash3(z, x, y) - 0.5) * 0.03),
      );
    }
  }
  geo.computeVertexNormals();
  return paint(geo, colorBean);
}

function buildGrounds(foot) {
  const geo = new THREE.SphereGeometry(0.4, 28, 18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = hash3(x, y, z);
    if (y < 0) pos.setY(i, -0.02);
    else {
      pos.setY(i, y * (0.32 + n * 0.06));
      pos.setX(i, x * (1 + (n - 0.5) * 0.1));
      pos.setZ(i, z * (1 + (hash3(z, x, y) - 0.5) * 0.1));
    }
  }
  geo.computeVertexNormals();
  paint(geo, (color, position, i) => {
    const n = hash3(position.getX(i) * 2, position.getY(i) * 2, position.getZ(i) * 2);
    const lift = position.getY(i) > 0.06 ? 1.18 : 0.82;
    color.setRGB((0.24 + n * 0.18) * lift, (0.11 + n * 0.07) * lift, 0.055 * lift);
  });
  geo.translate(0, foot + 0.02, 0);
  return geo;
}

function buildBloom() {
  const parts = [];
  const dome = new THREE.SphereGeometry(0.32, 24, 14);
  dome.scale(1, 0.4, 1);
  parts.push(dome);
  for (let i = 0; i < 6; i += 1) {
    const bubble = new THREE.SphereGeometry(0.03 + (i % 3) * 0.012, 8, 6);
    const angle = i * 1.2;
    bubble.translate(Math.cos(angle) * 0.14, 0.05 + (i % 2) * 0.02, Math.sin(angle) * 0.12);
    parts.push(bubble);
  }
  return mergeGeometries(parts, false);
}

function buildEspresso(foot) {
  const parts = [];
  const saucerH = 0.032;
  const saucer = new THREE.CylinderGeometry(0.54, 0.54, saucerH, 48);
  saucer.translate(0, foot + saucerH / 2, 0);
  parts.push(paint(saucer, '#f4efe6'));

  const well = new THREE.CylinderGeometry(0.3, 0.3, 0.016, 32);
  well.translate(0, foot + saucerH + 0.004, 0);
  parts.push(paint(well, '#e6dccb'));

  const saucerRim = new THREE.TorusGeometry(0.5, 0.014, 8, 48);
  saucerRim.rotateX(Math.PI / 2);
  saucerRim.translate(0, foot + saucerH * 0.7, 0);
  parts.push(paint(saucerRim, '#e7dcc8'));

  const bodyH = 0.38;
  const bodyBottom = foot + saucerH + 0.008;
  const body = new THREE.CylinderGeometry(0.24, 0.17, bodyH, 48, 1, true);
  body.translate(0, bodyBottom + bodyH / 2, 0);
  parts.push(paint(body, (color, position, i) => {
    const n = hash3(position.getX(i), position.getY(i), position.getZ(i));
    const shade = position.getY(i) > bodyBottom + bodyH * 0.55 ? 1.04 : 0.94;
    color.setRGB((0.93 + n * 0.04) * shade, (0.88 + n * 0.03) * shade, (0.8 + n * 0.03) * shade);
  }));

  const bodyTop = bodyBottom + bodyH;
  const inner = new THREE.CylinderGeometry(0.2, 0.16, 0.1, 32);
  inner.translate(0, bodyTop - 0.07, 0);
  parts.push(paint(inner, '#140c09'));

  const rim = new THREE.TorusGeometry(0.232, 0.02, 10, 48);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, bodyTop, 0);
  parts.push(paint(rim, '#f7f2e8'));

  const handle = new THREE.TorusGeometry(0.1, 0.018, 10, 24, Math.PI * 1.3);
  handle.rotateZ(-Math.PI * 0.12);
  handle.translate(0.32, bodyBottom + bodyH * 0.48, 0);
  parts.push(paint(handle, '#f3ece2'));

  return mergeParts(parts);
}

function cupBodyTop(foot) {
  return foot + 0.032 + 0.008 + 0.38;
}

function buildCrema(foot) {
  const bodyTop = cupBodyTop(foot);
  const crema = new THREE.SphereGeometry(0.186, 32, 18);
  crema.scale(1, 0.3, 1);
  crema.translate(0, bodyTop - 0.048, 0);
  const highlight = new THREE.Color('#f0c56a');
  paint(crema, (color, position, i) => {
    const radial = Math.min(1, Math.hypot(position.getX(i), position.getZ(i)) / 0.186);
    const n = hash3(position.getX(i), position.getY(i), position.getZ(i));
    const shade = 1.05 - radial * 0.42;
    color.setRGB((0.55 + n * 0.1) * shade, (0.28 + n * 0.05) * shade, 0.06 * shade);
    if (radial < 0.22) color.lerp(highlight, 0.4);
    if (n > 0.88) color.multiplyScalar(0.7);
  });
  const stripe = new THREE.TorusGeometry(0.06, 0.007, 6, 16);
  stripe.rotateX(Math.PI / 2);
  stripe.translate(0.015, bodyTop - 0.012, 0.01);
  paint(stripe, '#7a4a22');
  return mergeParts([crema, stripe]);
}

function buildBlade() {
  const blade = new THREE.BoxGeometry(0.15, 0.012, 0.04);
  paint(blade, '#d5dde2');
  const ferrule = new THREE.CylinderGeometry(0.016, 0.016, 0.04, 10);
  ferrule.rotateX(Math.PI / 2);
  ferrule.translate(0, 0.01, 0.038);
  paint(ferrule, '#c6a15a');
  const handle = new THREE.CylinderGeometry(0.016, 0.02, 0.42, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(0, 0.01, 0.26);
  paint(handle, '#6a432c');
  return mergeParts([blade, ferrule, handle]);
}

function buildTamper() {
  const base = new THREE.CylinderGeometry(0.11, 0.11, 0.028, 24);
  paint(base, '#d5dbe0');
  const neck = new THREE.CylinderGeometry(0.02, 0.022, 0.05, 12);
  neck.translate(0, 0.04, 0);
  paint(neck, '#c6a15a');
  const handle = new THREE.CylinderGeometry(0.03, 0.034, 0.26, 14);
  handle.translate(0, 0.18, 0);
  paint(handle, '#6a432c');
  const cap = new THREE.SphereGeometry(0.036, 12, 8);
  cap.translate(0, 0.32, 0);
  paint(cap, '#4e3424');
  return mergeParts([base, neck, handle, cap]);
}

/**
 * Draw budget while the shot is resolving:
 * counter, board, shadow, grounds, bloom, espresso, crema, blade, tamper, chaff.
 * Ten calls. The bean halves are hidden once the grind finishes.
 * Lights and the environment probe are not draws.
 */
export function createCoffeeScene(canvas) {
  const mobile = isMobileViewport();
  const renderer = createStudioRenderer(canvas, { mobile });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0b0a');

  const camera = new THREE.PerspectiveCamera(mobile ? 36 : 28, 1, 0.05, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.05).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.95;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x1a1412, 0.46);
  const key = new THREE.DirectionalLight(0xffe3b5, 1.7);
  key.position.set(-2.2, 3.8, 2.4);
  const rim = new THREE.DirectionalLight(0xc5d2ff, 0.5);
  rim.position.set(3.2, 1.8, -2.2);
  const fill = new THREE.DirectionalLight(0xfff8ee, 0.3);
  fill.position.set(0.3, 1.3, 3.3);
  const spark = new THREE.PointLight(0xffb15a, 0, 1.3);
  const gleam = new THREE.PointLight(0xffe2b0, 0, 1.7);
  scene.add(hemi, key, rim, fill, spark, gleam);

  const counter = new THREE.Mesh(
    buildCounter(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.04,
      envMapIntensity: 0.4,
    }),
  );
  const board = new THREE.Mesh(
    buildBoard(),
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
  shadow.position.y = PAD_TOP + 0.004;
  scene.add(counter, board, shadow);

  const dissolve = createDissolveUniform(0, 0.08);
  const foot = -BEAN_HALF_Y;

  const beanMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.56,
    metalness: 0.05,
    clearcoat: 0.24,
    clearcoatRoughness: 0.38,
    envMapIntensity: 0.6,
  });
  const left = new THREE.Mesh(buildBeanHalf(-1), beanMat);
  const right = new THREE.Mesh(buildBeanHalf(1), beanMat);

  const groundsMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.02,
    envMapIntensity: 0.25,
  });
  applyDissolve(groundsMat, dissolve, 'conceal');
  const grounds = new THREE.Mesh(buildGrounds(foot), groundsMat);

  const bloomMat = new THREE.MeshPhysicalMaterial({
    color: '#e7c48a',
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    envMapIntensity: 0.4,
  });
  const bloom = new THREE.Mesh(buildBloom(), bloomMat);
  bloom.position.y = foot + 0.2;

  const espressoMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.34,
    clearcoatRoughness: 0.24,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide,
  });
  applyDissolve(espressoMat, dissolve, 'reveal');
  const espresso = new THREE.Mesh(buildEspresso(foot), espressoMat);
  const cremaMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.3,
  });
  applyDissolve(cremaMat, dissolve, 'reveal');
  const crema = new THREE.Mesh(buildCrema(foot), cremaMat);

  const hero = new THREE.Group();
  hero.position.set(0, PAD_TOP + BEAN_HALF_Y, 0);
  const spin = new THREE.Group();
  spin.add(left, right, grounds, bloom, espresso, crema);
  hero.add(spin);
  scene.add(hero);

  const blade = new THREE.Mesh(
    buildBlade(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.38,
      envMapIntensity: 0.7,
    }),
  );
  const tamper = new THREE.Mesh(
    buildTamper(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.28,
      envMapIntensity: 0.65,
    }),
  );
  scene.add(blade, tamper);

  const chaff = createFlakeField({ count: mobile ? 90 : 140, color: '#ffffff' });
  scene.add(chaff.mesh);

  const look = new THREE.Vector3(0, 0.4, 0);

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
    const open = smoothstep(0.12, 0.46, p);
    const grind = smoothstep(0.4, 0.64, p);
    const mound = smoothstep(0.36, 0.58, p);
    const bloomIn = smoothstep(0.44, 0.54, p);
    const bloomOut = 1 - smoothstep(0.52, 0.62, p);
    const bloomAmt = bloomIn * bloomOut;
    const cut = smoothstep(0.36, 0.8, p);
    dissolve.uCut.value = cut;

    const gap = 0.01 + open * 0.22 * (1 - grind * 0.7);
    const drop = grind * 0.24;
    const shrink = lerp(1, 0.08, grind);
    left.position.set(-gap, -drop, 0);
    right.position.set(gap, -drop, 0);
    left.rotation.set(grind * 1.15, open * 0.28, -open * 0.55);
    right.rotation.set(-grind * 0.9, -open * 0.18, open * 0.55);
    left.scale.setScalar(shrink);
    right.scale.setScalar(shrink);
    const beanVisible = grind < 0.9;
    left.visible = beanVisible;
    right.visible = beanVisible;

    grounds.scale.setScalar(lerp(0.15, 1, mound));
    grounds.visible = mound > 0.04 && cut < 0.985;

    bloom.position.y = foot + lerp(0.12, 0.28, bloomIn);
    bloom.scale.set(lerp(0.35, 1.05, bloomIn), lerp(0.25, 0.85, bloomIn), lerp(0.35, 1.05, bloomIn));
    bloomMat.opacity = bloomAmt * 0.78;
    bloom.visible = bloomAmt > 0.04;

    espresso.visible = cut > 0.012;
    crema.visible = espresso.visible;

    const turn = smoothstep(0.18, 0.8, p);
    spin.rotation.y = lerp(-0.42, 0.48, p) + Math.sin(turn * Math.PI) * 1.15;

    const travel = smoothstep(0, 1, p);
    camera.position.set(
      lerp(0.28, 0.06, travel),
      lerp(1.8, 1.7, travel),
      lerp(2.35, 1.72, travel),
    );
    camera.lookAt(look);

    applyPose(blade, poseAt(p, BLADE_KEYS));
    applyPose(tamper, poseAt(p, TAMPER_KEYS));
    hero.updateMatrixWorld(true);
    chaff.apply(p, spin);

    const crackLight = smoothstep(0.16, 0.26, p) * (1 - smoothstep(0.4, 0.52, p));
    spark.intensity = crackLight * 2.1;
    spark.position.copy(blade.position);
    spark.position.y += 0.05;

    const finish = smoothstep(0.72, 0.96, p);
    gleam.intensity = finish * 0.55;
    gleam.position.set(0.12, 0.92, 0.7);
    key.intensity = lerp(1.6, 1.75, finish);
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
