// Point d'entrée : charge les données, valide l'arbre, gère la navigation,
// le thème, la recherche et l'accueil. Chaque activité est un module
// qui exporte mount(container, ctx) et peut renvoyer { onShow() }.

import { validateTree } from './validate.js';
import { buildIndex, formatAgo, h, shuffle } from './utils.js';
import { createCard } from './card.js';
import { mountTree } from './tree.js';

const VIEWS = {
  accueil: { title: 'Accueil' },
  debut:   { title: 'Le grand début', module: './story.js', container: 'story' },
  arbre:   { title: "L'arbre de la vie" },
  frise:   { title: 'La ligne du temps', module: './timeline.js', container: 'timeline' },
  horloge: { title: 'La Terre en 24 heures', module: './clock.js', container: 'clock' },
  voyage:  { title: 'Le voyage de tes ancêtres', module: './journey.js', container: 'journey' },
  premier: { title: 'Qui est apparu en premier ?', module: './whofirst.js', container: 'whofirst' },
  quiz:    { title: 'Le grand quiz', module: './quiz.js', container: 'quiz' },
  echelle: { title: 'Remonter le temps', module: './scale.js', container: 'scale' },
};

const TILES = [
  { view: 'debut',   emoji: '🌋', title: 'Le grand début',            text: 'La naissance de la Terre, de la Lune, des océans… et de la vie !', color: '#ffadad' },
  { view: 'arbre',   emoji: '🌳', title: "L'arbre de la vie",          text: 'Découvre la grande famille de tous les êtres vivants.', color: '#b9fbc0' },
  { view: 'frise',   emoji: '🕰️', title: 'La ligne du temps',          text: 'Voyage à travers les ères, de la première cellule à aujourd\'hui.', color: '#a0c4ff' },
  { view: 'horloge', emoji: '⏰', title: 'La Terre en 24 heures',      text: 'À quelle heure sont arrivés les dinosaures ? Et toi ?', color: '#ffd6a5' },
  { view: 'voyage',  emoji: '🧬', title: 'Le voyage de tes ancêtres',  text: 'Savais-tu que tu as un ancêtre poisson ?', color: '#ffc6ff' },
  { view: 'premier', emoji: '🤔', title: 'Qui est apparu en premier ?', text: 'Deux animaux, une question : à toi de deviner !', color: '#fdffb6' },
  { view: 'quiz',    emoji: '❓', title: 'Le grand quiz',              text: '10 questions pour devenir expert de l\'évolution.', color: '#caffbf' },
  { view: 'echelle', emoji: '🚀', title: 'Remonter le temps',          text: 'Combien de temps pour rejoindre les dinosaures ?', color: '#9bf6ff' },
];

const mounted = new Map();
let ctx = null;
let isFirstRoute = true;

init();

async function init() {
  setupTheme();
  const status = document.getElementById('data-status');

  let data;
  try {
    const response = await fetch('data/evolution_tree.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    status.classList.add('error');
    status.textContent = "Oups ! Impossible de charger les données. Si tu as ouvert le fichier directement, lance plutôt un petit serveur (voir le README).";
    console.error(error);
    return;
  }

  const validation = validateTree(data);
  const index = buildIndex(data);
  data.events ??= [];
  data.quiz ??= [];

  ctx = {
    data,
    index,
    validation,
    openCard: (id) => card.open(id),
    navigate: (view) => { location.hash = view; },
  };
  const card = createCard(ctx);

  reportValidation(validation);
  checkImages(ctx);
  status.textContent = '';

  setupHome(ctx);
  setupSearch(ctx);
  mounted.set('arbre', mountTree(document.getElementById('tree'), ctx));

  window.addEventListener('hashchange', route);
  route();
}

// ---------- Navigation par ancre (#arbre, #quiz…) ----------

async function route() {
  const name = location.hash.slice(1);
  const view = VIEWS[name] ? name : 'accueil';

  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector(`[data-nav="${view}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  document.title = `${VIEWS[view].title} · La grande aventure de la vie sur Terre`;

  const config = VIEWS[view];
  if (config.module && !mounted.has(view)) {
    const container = document.getElementById(config.container);
    try {
      const module = await import(config.module);
      mounted.set(view, module.mount(container, ctx) || {});
    } catch (error) {
      console.error(error);
      container.replaceChildren(h('p', { class: 'data-status error' }, 'Cette activité n\'a pas pu se charger. 😢'));
      mounted.set(view, {});
    }
  }
  mounted.get(view)?.onShow?.();
  const firstRoute = isFirstRoute;
  isFirstRoute = false;

  // Après un changement de vue (pas au premier affichage), on remonte en haut
  // et on place le focus sur le titre pour les lecteurs d'écran.
  if (!firstRoute && name && VIEWS[name]) {
    window.scrollTo({ top: 0 });
    const heading = document.querySelector(`[data-view="${view}"] h1, [data-view="${view}"] h2`);
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
}

// ---------- Thème clair / sombre ----------

function setupTheme() {
  const button = document.getElementById('theme-toggle');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme || (media.matches ? 'dark' : 'light')) === 'dark';
  const refresh = () => {
    const dark = isDark();
    button.textContent = dark ? '☀️' : '🌙';
    button.setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode sombre');
  };
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* ignoré */ }
    refresh();
  });
  media.addEventListener('change', refresh);
  refresh();
}

// ---------- Accueil ----------

function setupHome({ data, openCard }) {
  const tiles = document.getElementById('home-tiles');
  tiles.replaceChildren(...TILES.map((tile) => h('li', {},
    h('a', { class: 'tile', href: `#${tile.view}`, style: { background: tile.color } },
      h('span', { class: 'tile-emoji', 'aria-hidden': 'true' }, tile.emoji),
      h('span', { class: 'tile-title' }, tile.title),
      h('span', { class: 'tile-text' }, tile.text),
    ),
  )));

  // « Le savais-tu ? » : un fait étonnant au hasard, qu'on peut changer.
  const box = document.getElementById('did-you-know');
  const facts = shuffle(data.nodes.filter((n) => n.fun_fact));
  let position = 0;
  const show = () => {
    const node = facts[position % facts.length];
    position += 1;
    box.replaceChildren(
      h('span', { class: 'dyk-emoji', 'aria-hidden': 'true' }, node.emoji),
      h('div', {},
        h('h3', {}, 'Le savais-tu ?'),
        h('p', {}, node.fun_fact),
        h('div', { class: 'chips' },
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => openCard(node.id) }, `Voir la fiche : ${node.name_fr}`),
          h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: show }, '🎲 Un autre !'),
        ),
      ),
    );
  };
  if (facts.length) show();
}

// ---------- Recherche par nom ----------

const normalize = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function setupSearch({ data, openCard }) {
  const input = document.getElementById('search-input');
  const list = document.getElementById('search-results');
  let results = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const choose = (node) => {
    close();
    input.value = '';
    openCard(node.id);
  };

  const highlight = (next) => {
    active = next;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    const current = list.children[active];
    if (current?.id) {
      input.setAttribute('aria-activedescendant', current.id);
      current.scrollIntoView({ block: 'nearest' });
    }
  };

  const render = () => {
    const query = normalize(input.value.trim());
    if (!query) { close(); return; }
    results = data.nodes
      .filter((n) => normalize(`${n.name_fr} ${n.name_sci} ${n.id}`).includes(query))
      .slice(0, 8);
    list.replaceChildren(...(results.length
      ? results.map((node, i) => h('li', {
        id: `search-option-${i}`, role: 'option', 'aria-selected': 'false',
        onmousedown: (event) => { event.preventDefault(); choose(node); },
      },
      h('span', { 'aria-hidden': 'true' }, node.emoji),
      h('span', {}, node.name_fr),
      h('small', {}, formatAgo(node.appeared_mya))))
      : [h('li', { class: 'empty', role: 'option', 'aria-disabled': 'true' }, 'Aucun résultat… essaie « requin » ou « dinosaure » !')]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (event) => {
    if (list.hidden || !results.length) {
      if (event.key === 'Escape') { input.value = ''; close(); }
      return;
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); highlight((active + 1) % results.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); highlight((active - 1 + results.length) % results.length); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[Math.max(active, 0)]); }
    else if (event.key === 'Escape') { close(); }
  });
}

// ---------- Validation ----------

function reportValidation(validation) {
  const summary = document.getElementById('validation-summary');
  if (validation.errors.length) {
    summary.classList.add('has-errors');
    summary.textContent = `⚠ ${validation.errors.length} problème(s) dans les données : les nœuds concernés ont un badge rouge.`;
    console.warn('Erreurs de validation :', validation.errors);
  } else {
    summary.textContent = '✓ Données vérifiées.';
  }
}

// Le navigateur ne peut pas lister les fichiers : on vérifie chaque image en la chargeant.
function checkImages(context) {
  for (const node of context.data.nodes) {
    if (typeof node.image !== 'string' || !node.image) continue;
    const probe = new Image();
    probe.addEventListener('error', () => {
      const message = `Image introuvable : ${node.image}`;
      const list = context.validation.byNode.get(node.id) || [];
      list.push(message);
      context.validation.byNode.set(node.id, list);
      context.validation.errors.push(`[${node.id}] ${message}`);
      reportValidation(context.validation);
      document.dispatchEvent(new CustomEvent('validation-change', { detail: { id: node.id } }));
    });
    probe.src = node.image;
  }
}

