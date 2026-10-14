import films from './films.json';

export function listFilms() {
  return films;
}

export function filmBySlug(slug) {
  return films.find((film) => film.slug === slug) ?? null;
}

export function readyFilms() {
  return films.filter((film) => film.status === 'ready' && film.page);
}
