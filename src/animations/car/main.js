import '../../styles/fonts.js';
import '../../styles/base.css';
import './car.css';
import { detectFallback, mountReel } from '../../core/index.js';

const beats = [
  {
    at: 0,
    kicker: '01  Dull',
    title: 'Left in the dust',
    body: 'A coupe under road film. The mitt and pad are still.',
  },
  {
    at: 0.18,
    kicker: '02  Lift',
    title: 'Dirt lets go',
    body: 'The mitt works the panel. Grit falls away in a scatter.',
  },
  {
    at: 0.46,
    kicker: '03  Turn',
    title: 'Pad on paint',
    body: 'The coupe turns on the disc while the polisher finds the depth.',
  },
  {
    at: 0.74,
    kicker: '04  Reveal',
    title: 'The dissolve',
    body: 'The dull coat gives way. Clearcoat catches the bay light.',
  },
];

const kicker = document.querySelector('[data-kicker]');
const title = document.querySelector('[data-title]');
const body = document.querySelector('[data-body]');
const rail = document.querySelector('[data-rail]');

function applyCopy(progress) {
  let beat = beats[0];
  for (const next of beats) {
    if (progress >= next.at) beat = next;
  }
  if (kicker.textContent !== beat.kicker) {
    kicker.textContent = beat.kicker;
    title.textContent = beat.title;
    body.textContent = beat.body;
  }
  rail.style.height = `${Math.round(progress * 100)}%`;
}

function showFallback(reason) {
  document.documentElement.dataset.mode = reason;
  document.getElementById('film').hidden = true;
  document.querySelector('[data-fallback]').hidden = false;
}

const reason = detectFallback();
if (reason) {
  showFallback(reason);
} else {
  startFilm();
}

async function startFilm() {
  const canvas = document.querySelector('[data-canvas]');
  const root = document.querySelector('[data-pin-root]');
  const stage = document.querySelector('[data-pin]');
  const { createCarScene } = await import('./scene.js');
  const scene = createCarScene(canvas);

  const studio = {
    ready: false,
    progress: 0,
    rendered: false,
    drawCalls: 0,
    pixelRatio: scene.getPixelRatio(),
    scrollToProgress: () => 0,
  };
  window.__studio = studio;

  let visible = true;
  let raf = 0;

  function publish(progress) {
    studio.progress = progress;
    scene.setProgress(progress);
    applyCopy(progress);
    if (!visible || document.hidden) return;
    studio.drawCalls = scene.render();
    studio.pixelRatio = scene.getPixelRatio();
    studio.rendered = true;
  }

  function loop() {
    raf = 0;
    if (!visible || document.hidden) return;
    studio.drawCalls = scene.render();
    studio.pixelRatio = scene.getPixelRatio();
    studio.rendered = true;
    raf = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const reel = mountReel({
    root,
    stage,
    onProgress: publish,
  });
  studio.scrollToProgress = (progress) => {
    const actual = reel.scrollToProgress(progress);
    studio.progress = actual;
    return actual;
  };
  studio.pause = stopLoop;
  studio.resume = startLoop;

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !document.hidden) {
      publish(studio.progress);
      startLoop();
    } else {
      stopLoop();
    }
  });
  observer.observe(stage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (visible) startLoop();
  });

  window.addEventListener('resize', () => {
    scene.resize();
    reel.refresh();
    publish(studio.progress);
  });

  scene.resize();
  reel.refresh();
  publish(0);
  studio.ready = true;
  startLoop();
}
