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

const BRUSH_KEYS = [
  { t: 0, x: -1.18, y: 0.16, z: 0.18, rx: 0.08, ry: 1.15, rz: 0.12 },
  { t: 0.12, x: -1.18, y: 0.16, z: 0.18, rx: 0.08, ry: 1.15, rz: 0.12 },
  { t: 0.22, x: -0.28, y: 0.42, z: 0.22, rx: 1.05, ry: 0.25, rz: 0.12 },
  { t: 0.34, x: 0.16, y: 0.4, z: 0.2, rx: 1.02, ry: -0.1, rz: 0.04 },
  { t: 0.46, x: 0.55, y: 0.36, z: 0.28, rx: 0.85, ry: -0.35, rz: -0.12 },
  { t: 0.6, x: 1.15, y: 0.16, z: 0.62, rx: 0.2, ry: -0.45, rz: -0.7 },
  { t: 1, x: 1.28, y: 0.13, z: 0.28, rx: 0.12, ry: -0.3, rz: -0.85 },
];

const CLOTH_KEYS = [
  { t: 0, x: 1.05, y: 0.14, z: -0.42, rx: 0.1, ry: -0.2, rz: 0.05 },
  { t: 0.4, x: 1.05, y: 0.14, z: -0.42, rx: 0.1, ry: -0.2, rz: 0.05 },
  { t: 0.5, x: -0.08, y: 0.7, z: 0.12, rx: 0.25, ry: 0.2, rz: 0.08 },
  { t: 0.66, x: 0.26, y: 0.66, z: 0.05, rx: 0.2, ry: -0.15, rz: -0.02 },
  { t: 0.82, x: 1.12, y: 0.16, z: 0.34, rx: 0.18, ry: 0.1, rz: 0.06 },
  { t: 1, x: 1.22, y: 0.13, z: 0.02, rx: 0.1, ry: 0.05, rz: 0.04 },
];

const LEATHER = '#f1ebe1';
const HEEL = '#e5ddd0';
const TONGUE = '#e8e1d4';
const FOXING = '#f6f3ee';
const GUM = '#c4a06a';
const STRIPE = '#8d9a86';
const LACE = '#2a2622';

function paint(geometry, hex, variation = 0) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const position = geometry.attributes.position;
  for (let i = 0; i < count; i += 1) {
    let shade = 1;
    if (variation) {
      const n = hash3(position.getX(i), position.getY(i), position.getZ(i));
      shade = 1 + (n - 0.5) * variation;
    }
    colors[i * 3] = color.r * shade;
    colors[i * 3 + 1] = color.g * shade;
    colors[i * 3 + 2] = color.b * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeParts(parts) {
  const prepared = parts.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Could not merge sneaker geometry.');
  return merged;
}

function box(width, height, depth, x, y, z, color, rotationZ = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (rotationZ) geometry.rotateZ(rotationZ);
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

function toDirt(geometry) {
  const color = geometry.getAttribute('color');
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const blotch = hash3(x * 1.4, y * 1.1, z * 1.4);
    const speck = hash3(x * 6.4, y * 3.2, z * 6.4);
    const keep = 0.22;
    let r = (0.27 + blotch * 0.1) * (1 - keep) + color.getX(i) * keep;
    let g = (0.18 + blotch * 0.05) * (1 - keep) + color.getY(i) * keep;
    let b = (0.09 + blotch * 0.03) * (1 - keep) + color.getZ(i) * keep;
    if (speck > 0.58) {
      r *= 0.4;
      g *= 0.36;
      b *= 0.28;
    }
    if (y < 0.1) {
      r = r * 0.55 + 0.08;
      g = g * 0.55 + 0.05;
      b = b * 0.55 + 0.03;
    }
    color.setXYZ(i, r, g, b);
  }
  color.needsUpdate = true;
  return geometry;
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 64, 12, 128, 64, 120);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function studioEnvironment() {
  const environment = new THREE.Scene();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const shell = new THREE.Mesh(
    boxGeo,
    new THREE.MeshBasicMaterial({ color: 0x14110f, side: THREE.BackSide }),
  );
  shell.scale.set(14, 9, 14);
  environment.add(shell);

  const warm = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x6a4328 }));
  warm.position.set(-3.2, 3.1, 2.4);
  warm.scale.set(5.2, 3.2, 0.3);
  environment.add(warm);

  const cool = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x314056 }));
  cool.position.set(4.2, 2.2, -2.4);
  cool.scale.set(2.4, 4.4, 0.3);
  environment.add(cool);

  const floor = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x3a2c24 }));
  floor.position.set(0, -3.2, 0);
  floor.scale.set(12, 0.4, 12);
  environment.add(floor);
  return environment;
}

function footprintShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, -0.26);
  shape.bezierCurveTo(-0.86, -0.28, -0.98, -0.06, -0.92, 0.1);
  shape.bezierCurveTo(-0.88, 0.24, -0.64, 0.32, -0.36, 0.28);
  shape.lineTo(0.3, 0.26);
  shape.bezierCurveTo(0.66, 0.3, 1.0, 0.14, 1.0, -0.02);
  shape.bezierCurveTo(1.0, -0.18, 0.68, -0.32, 0.3, -0.28);
  shape.lineTo(-0.48, -0.26);
  return shape;
}

function extrudeFootprint(thickness, bottom, color, scale = 1) {
  const geometry = new THREE.ExtrudeGeometry(footprintShape(), {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: Math.min(0.012, thickness * 0.25),
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 12,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(scale, 1, scale);
  geometry.translate(0, bottom, 0);
  return paint(geometry, color, 0.06);
}

function upperSilhouette() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, 0);
  shape.bezierCurveTo(-0.98, 0, -1.02, 0.34, -0.62, 0.48);
  shape.bezierCurveTo(-0.32, 0.56, 0.02, 0.46, 0.28, 0.36);
  shape.bezierCurveTo(0.52, 0.3, 0.74, 0.24, 0.84, 0.14);
  shape.bezierCurveTo(1.02, 0.06, 0.98, -0.02, 0.72, 0);
  shape.lineTo(-0.55, 0);
  return shape;
}

function extrudeProfile(shape, depth, bottom, color, variation = 0.05) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.translate(0, bottom, 0);
  return paint(geometry, color, variation);
}

function buildBench() {
  const parts = [
    box(4.6, 0.1, 2.6, 0, 0, 0, '#6a4b38'),
    box(4.35, 0.025, 2.36, 0, 0.06, 0, '#7d5942'),
    box(4.2, 0.14, 0.08, 0, -0.04, 1.22, '#4e382c'),
    box(4.2, 0.14, 0.08, 0, -0.04, -1.22, '#3f2e24'),
    box(0.14, 0.92, 0.14, -2.0, -0.48, -1.05, '#2c211b'),
    box(0.14, 0.92, 0.14, 2.0, -0.48, -1.05, '#2c211b'),
    box(0.14, 0.92, 0.14, -2.0, -0.48, 1.05, '#2c211b'),
    box(0.14, 0.92, 0.14, 2.0, -0.48, 1.05, '#2c211b'),
  ];

  const bottle = new THREE.CylinderGeometry(0.07, 0.08, 0.24, 16);
  bottle.translate(-1.22, 0.22, -0.62);
  parts.push(paint(bottle, '#e6e0d4'));

  const label = new THREE.CylinderGeometry(0.074, 0.074, 0.09, 16);
  label.translate(-1.22, 0.2, -0.62);
  parts.push(paint(label, '#8d9a86'));

  const cap = new THREE.CylinderGeometry(0.042, 0.045, 0.07, 12);
  cap.translate(-1.22, 0.36, -0.62);
  parts.push(paint(cap, '#2a2622'));

  return mergeParts(parts);
}

function buildSneaker() {
  const parts = [
    extrudeFootprint(0.07, 0, GUM, 1),
    extrudeFootprint(0.05, 0.064, FOXING, 0.95),
    extrudeProfile(upperSilhouette(), 0.44, 0.11, LEATHER, 0.06),
  ];

  const collar = new THREE.TorusGeometry(0.11, 0.022, 8, 18);
  collar.rotateX(Math.PI / 2);
  collar.scale(1.15, 1, 0.9);
  collar.translate(-0.32, 0.64, 0);
  parts.push(paint(collar, HEEL, 0.04));

  const tongue = new THREE.BoxGeometry(0.46, 0.035, 0.16);
  tongue.rotateZ(-0.2);
  tongue.translate(0.02, 0.6, 0);
  parts.push(paint(tongue, TONGUE));

  const tab = new THREE.BoxGeometry(0.06, 0.1, 0.12);
  tab.translate(-0.78, 0.58, 0);
  parts.push(paint(tab, STRIPE));

  for (let i = 0; i < 4; i += 1) {
    const lace = new THREE.CylinderGeometry(0.011, 0.011, 0.26, 6);
    lace.rotateX(Math.PI / 2);
    lace.translate(-0.08 + i * 0.12, 0.62 - i * 0.035, 0);
    parts.push(paint(lace, LACE));
  }

  parts.push(box(0.62, 0.16, 0.016, 0.02, 0.32, 0.228, '#e6ded0', -0.1));
  parts.push(box(0.62, 0.16, 0.016, 0.02, 0.32, -0.228, '#e6ded0', -0.1));
  parts.push(box(0.7, 0.05, 0.018, 0.06, 0.3, 0.242, STRIPE, -0.12));
  parts.push(box(0.7, 0.05, 0.018, 0.06, 0.3, -0.242, STRIPE, -0.12));

  return mergeParts(parts);
}

function buildBrush() {
  const bristles = new THREE.BoxGeometry(0.32, 0.055, 0.11);
  bristles.translate(0, -0.03, 0);
  paint(bristles, '#d2b48a', 0.08);
  const ferrule = new THREE.CylinderGeometry(0.028, 0.03, 0.06, 10);
  ferrule.rotateX(Math.PI / 2);
  ferrule.translate(0, 0.01, 0.07);
  paint(ferrule, '#c5ccd1');
  const handle = new THREE.CylinderGeometry(0.02, 0.022, 0.52, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(0, 0.012, 0.34);
  paint(handle, '#6a432c');
  return mergeParts([bristles, ferrule, handle]);
}

function buildCloth() {
  const pad = new THREE.SphereGeometry(0.16, 16, 12);
  pad.scale(1.45, 0.28, 0.9);
  paint(pad, '#3e5348');
  const fold = new THREE.BoxGeometry(0.12, 0.035, 0.08);
  fold.translate(0.04, 0.035, 0.01);
  paint(fold, '#2c3d34');
  return mergeParts([pad, fold]);
}

/**
 * Draw budget, all frames:
 * bench, contact shadow, dirty shoe, clean shoe, brush, cloth, dirt flakes.
 * Seven draw calls. Lights and the environment probe are not draws.
 */
export function createSneakerScene(canvas) {
  const mobile = isMobileViewport();
  const renderer = createStudioRenderer(canvas, { mobile });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0b0a');

  const camera = new THREE.PerspectiveCamera(mobile ? 40 : 30, 1, 0.05, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.05).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.95;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x1a1412, 0.45);
  const key = new THREE.DirectionalLight(0xffe3b5, 1.7);
  key.position.set(-2.2, 3.8, 2.4);
  const rim = new THREE.DirectionalLight(0xb9c9ff, 0.62);
  rim.position.set(3.2, 1.6, -2.6);
  const fill = new THREE.DirectionalLight(0xfff8ee, 0.28);
  fill.position.set(0.4, 1.2, 3.4);
  const spark = new THREE.PointLight(0xffb15a, 0, 1.5);
  const gleam = new THREE.PointLight(0xfff6df, 0, 2.2);
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
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.15, 1.05),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.102;
  scene.add(bench, shadow);

  const dissolve = createDissolveUniform(0, 0.08);
  const cleanGeo = buildSneaker();
  const dirtyGeo = toDirt(cleanGeo.clone());

  const conceal = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.02,
    envMapIntensity: 0.22,
  });
  const reveal = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.9,
  });
  applyDissolve(conceal, dissolve, 'conceal');
  applyDissolve(reveal, dissolve, 'reveal');
  conceal.polygonOffset = true;
  conceal.polygonOffsetFactor = -1;
  conceal.polygonOffsetUnits = -1;

  const shoe = new THREE.Group();
  shoe.position.set(0, 0.11, 0);
  const spin = new THREE.Group();
  shoe.add(spin);

  const dirty = new THREE.Mesh(dirtyGeo, conceal);
  const clean = new THREE.Mesh(cleanGeo, reveal);
  spin.add(dirty, clean);
  scene.add(shoe);

  const brush = new THREE.Mesh(
    buildBrush(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.22,
      envMapIntensity: 0.55,
    }),
  );
  const cloth = new THREE.Mesh(
    buildCloth(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  scene.add(brush, cloth);

  const flakes = createFlakeField({ count: mobile ? 90 : 150, color: '#6a4a32' });
  scene.add(flakes.mesh);

  const emitter = new THREE.Object3D();
  emitter.scale.set(1.55, 1, 1.15);
  spin.add(emitter);

  const look = new THREE.Vector3(0, 0.32, 0);

  function resize() {
    const mobileNow = isMobileViewport();
    applyPixelRatio(renderer, mobileNow);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.fov = mobileNow ? 40 : 30;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function setProgress(progress) {
    const p = Math.min(1, Math.max(0, progress));
    dissolve.uCut.value = smoothstep(0.34, 0.86, p);
    const turn = smoothstep(0.18, 0.88, p);
    spin.rotation.y = lerp(0.7, 0.7 + Math.PI, turn);

    const travel = smoothstep(0, 1, p);
    camera.position.set(
      lerp(0.35, 0.05, travel),
      lerp(1.72, 1.42, travel),
      lerp(2.25, 1.95, travel),
    );
    camera.lookAt(look);

    applyPose(brush, poseAt(p, BRUSH_KEYS));
    applyPose(cloth, poseAt(p, CLOTH_KEYS));
    flakes.apply(p, emitter);

    const scrub = smoothstep(0.16, 0.24, p) * (1 - smoothstep(0.42, 0.54, p));
    spark.intensity = scrub * 0.85;
    spark.position.copy(brush.position);
    spark.position.y += 0.04;

    const finish = smoothstep(0.72, 0.96, p);
    gleam.intensity = finish * 0.55;
    gleam.position.set(0.2, 0.85, 0.7);
    key.intensity = lerp(1.55, 1.95, finish);
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
