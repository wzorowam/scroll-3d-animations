import * as THREE from 'three';
import { clamp, smoothstep } from './math.js';

function mulberry(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Instanced flakes. One draw call. Positions are a pure function of scroll
 * progress and an emitter matrix, so a given progress always looks the same.
 */
export function createFlakeField({ count = 150, color = '#8d4c2e' } = {}) {
  const geometry = new THREE.BoxGeometry(0.05, 0.007, 0.03);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.12,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;

  const rand = mulberry(0x5eed);
  const seeds = [];
  const colorArray = new Float32Array(count * 3);
  const rust = new THREE.Color('#9a5432');
  const dark = new THREE.Color('#4a3024');
  for (let i = 0; i < count; i += 1) {
    seeds.push({
      angle: rand() * Math.PI * 2,
      radius: 0.22 + rand() * 0.28,
      delay: rand(),
      drift: (rand() - 0.5) * 0.6,
      driftZ: (rand() - 0.5) * 0.35,
      spin: rand() * Math.PI * 2,
      tilt: rand() * Math.PI,
      lift: rand() * 0.1,
      scale: 0.4 + rand() * 1.05,
    });
    const mix = rand();
    colorArray[i * 3] = rust.r * (1 - mix) + dark.r * mix;
    colorArray[i * 3 + 1] = rust.g * (1 - mix) + dark.g * mix;
    colorArray[i * 3 + 2] = rust.b * (1 - mix) + dark.b * mix;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);

  const dummy = new THREE.Object3D();
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();

  function apply(progress, emitter) {
    emitter.updateMatrixWorld(true);
    const fade = 1 - smoothstep(0.7, 0.88, progress);
    for (let i = 0; i < count; i += 1) {
      const seed = seeds[i];
      const emitAt = 0.1 + seed.delay * 0.4;
      const life = clamp((progress - emitAt) / 0.34, 0, 1);
      const visible = life > 0 && fade > 0.03;
      if (!visible) {
        dummy.position.set(0, -8, 0);
        dummy.scale.setScalar(0.0001);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      local.set(
        Math.cos(seed.angle) * seed.radius,
        0.05 + seed.lift,
        Math.sin(seed.angle) * seed.radius,
      );
      world.copy(local).applyMatrix4(emitter.matrixWorld);
      const fall = life * life * 0.7;
      dummy.position.set(
        world.x + seed.drift * life,
        Math.max(0.075, world.y - fall),
        world.z + seed.driftZ * life,
      );
      dummy.rotation.set(seed.tilt + life, seed.spin + life * 2.2, seed.tilt * 0.4);
      dummy.scale.setScalar(seed.scale * fade * Math.min(1, life * 5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, apply, count };
}
