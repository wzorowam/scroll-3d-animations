const REDUCED = '(prefers-reduced-motion: reduce)';

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
      || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    return Boolean(gl);
  } catch {
    return false;
  }
}

function lowEndDevice() {
  const memory = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if (typeof memory === 'number' && memory > 0 && memory <= 2) return true;
  if (typeof cores === 'number' && cores > 0 && cores <= 2 && typeof memory === 'number' && memory <= 4) {
    return true;
  }
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return true;
  return false;
}

/**
 * Returns a reason string when the film should take the still path, or null
 * when the WebGL reel may run. `?motion=full` and `?motion=reduce` override.
 */
export function detectFallback(search = window.location.search) {
  const override = new URLSearchParams(search).get('motion');
  if (override === 'full') return null;
  if (override === 'reduce') return 'reduced-motion';
  if (window.matchMedia && window.matchMedia(REDUCED).matches) return 'reduced-motion';
  if (!webglAvailable()) return 'no-webgl';
  if (lowEndDevice()) return 'low-end';
  return null;
}
