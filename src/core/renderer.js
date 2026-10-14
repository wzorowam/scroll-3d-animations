import * as THREE from 'three';

export function isMobileViewport() {
  return window.innerWidth < 760;
}

export function pixelRatioCap(mobile = isMobileViewport()) {
  return mobile ? 1.25 : 1.75;
}

export function createStudioRenderer(canvas, { mobile = isMobileViewport() } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: false,
    powerPreference: mobile ? 'low-power' : 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor('#0c0b0a', 1);
  renderer.shadowMap.enabled = false;
  applyPixelRatio(renderer, mobile);

  return renderer;
}

export function applyPixelRatio(renderer, mobile = isMobileViewport()) {
  const cap = pixelRatioCap(mobile);
  const next = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(next);
  return next;
}
