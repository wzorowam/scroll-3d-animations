# Scroll Studio

Scroll-driven 3D films. Vite multi-page build, static `dist`, dark bench, pinned reels.

## Stack

- Vite
- Three.js
- GSAP ScrollTrigger
- Lenis

## Scripts

```bash
npm install
npm run dev
npm run build
npm run shots
```

`npm run build` writes `dist`. Vercel uses `vercel.json`: framework `vite`, build `npm run build`, output `dist`.

## Layout

- `src/core/` — shared by every film: reel pin and Lenis, dissolve shader, instanced flakes, fallback detection, film registry.
- `src/animations/<slug>/` — one folder per film.
- `index.html` — gallery.
- `<slug>.html` — film page, added only when that film is ready.

Films are registered in `src/core/films.json`. A later film needs:

1. `src/animations/<slug>/`
2. `<slug>.html`
3. A `films.json` row with `"status": "ready"` and `"page"`
4. A matching rewrite in `vercel.json`

The gallery and the Vite inputs read the registry. Planned cards stay on the index until a page exists.

## Pocket watch

`/watch` pins a 400vh reel. Scroll progress:

- **0%** — rusty watch on the bench, tools at rest
- **30%** — scraper crosses the case, rust flakes fall
- **60%** — cloth burnishes, the case turns, the dissolve is halfway
- **90%** — polished watch, tools withdrawn, light on the metal

Mobile caps device pixel ratio, stays under 25 draw calls, and pauses the loop when the stage leaves the viewport. `prefers-reduced-motion`, a missing WebGL context, or a low-memory device gets a still instead of the reel. `?motion=reduce` and `?motion=full` override that for checks.
