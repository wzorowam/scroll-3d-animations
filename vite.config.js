import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const films = JSON.parse(readFileSync(resolve(root, 'src/core/films.json'), 'utf8'));

function inputFromFilms() {
  const input = { main: resolve(root, 'index.html') };
  for (const film of films) {
    if (film.status !== 'ready') continue;
    if (!film.page) {
      throw new Error(`Film "${film.slug}" is ready but has no page.`);
    }
    input[film.slug] = resolve(root, film.page);
  }
  return input;
}

function rewriteFilmUrls() {
  const routes = new Map();
  for (const film of films) {
    if (film.status === 'ready' && film.page) {
      routes.set(`/${film.slug}`, `/${film.page}`);
      routes.set(`/${film.slug}/`, `/${film.page}`);
    }
  }

  const middleware = (req, _res, next) => {
    const raw = req.url || '';
    const q = raw.indexOf('?');
    const path = q === -1 ? raw : raw.slice(0, q);
    const query = q === -1 ? '' : raw.slice(q);
    const target = routes.get(path);
    if (target) req.url = `${target}${query}`;
    next();
  };

  return {
    name: 'film-rewrites',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [rewriteFilmUrls()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: inputFromFilms(),
    },
  },
});
