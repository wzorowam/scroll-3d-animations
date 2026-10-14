import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Pins a stage for the height of its reel and reports 0–1 scroll progress.
 * The reel element should be about 400vh; pin spacing is left off so the
 * section height stays the scroll length.
 */
export function mountReel({ root, stage, onProgress }) {
  const lenis = new Lenis({
    duration: 1.05,
    smoothWheel: true,
    wheelMultiplier: 0.92,
    touchMultiplier: 1.05,
  });

  lenis.on('scroll', ScrollTrigger.update);
  const ticker = (time) => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(ticker);
  gsap.ticker.lagSmoothing(0);

  const trigger = ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'bottom bottom',
    pin: stage,
    pinSpacing: false,
    scrub: true,
    anticipatePin: 1,
    onUpdate: (self) => {
      onProgress(self.progress);
    },
  });

  function scrollToProgress(progress) {
    const p = Math.min(1, Math.max(0, progress));
    const y = trigger.start + (trigger.end - trigger.start) * p;
    lenis.scrollTo(y, { immediate: true, force: true });
    ScrollTrigger.update();
    const actual = trigger.progress;
    onProgress(actual);
    return actual;
  }

  function refresh() {
    ScrollTrigger.refresh();
    onProgress(trigger.progress || 0);
  }

  function destroy() {
    trigger.kill();
    gsap.ticker.remove(ticker);
    lenis.destroy();
  }

  requestAnimationFrame(() => {
    refresh();
  });

  return { lenis, trigger, scrollToProgress, refresh, destroy };
}
