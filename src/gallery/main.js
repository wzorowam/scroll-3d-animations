import '../styles/fonts.js';
import '../styles/base.css';
import './gallery.css';
import { listFilms } from '../core/registry.js';

const grid = document.querySelector('[data-grid]');
const films = listFilms();

films.forEach((film, index) => {
  const ready = film.status === 'ready' && film.page;
  const node = document.createElement(ready ? 'a' : 'article');
  node.className = `card ${ready ? 'card--ready' : 'card--soon'}`;
  node.style.setProperty('--accent', film.accent || '#c6a15a');
  if (ready) {
    node.href = `/${film.slug}`;
  } else {
    node.setAttribute('aria-disabled', 'true');
  }

  const number = String(index + 1).padStart(2, '0');
  node.innerHTML = `
    <span class="card__index">${number}  ${film.kicker}</span>
    <h2>${film.title}</h2>
    <p>${film.summary}</p>
    ${ready ? `<div class="medallion medallion--${film.slug}" aria-hidden="true"></div>` : ''}
    <div class="card__meta"><span>${ready ? 'Enter' : 'Soon'}</span><span>${ready ? 'Reel' : 'Registered'}</span></div>
  `;
  grid.append(node);
});

const count = document.querySelector('[data-count]');
if (count) {
  const ready = films.filter((film) => film.status === 'ready').length;
  count.textContent = `${ready} of ${films.length} on the bench`;
}
