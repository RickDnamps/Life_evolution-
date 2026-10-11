// Point d'entrée : charge les données, valide l'arbre, gère la navigation,
// le thème, la recherche et l'accueil. Chaque activité est un module
// qui exporte mount(container, ctx) et peut renvoyer { onShow() }.

import { validateTree } from './validate.js';
import { buildIndex, formatAgo, h, nodeFunFact, shuffle } from './utils.js';
import { createCard } from './card.js';
import { mountTree } from './tree.js';
import { setupLevel } from './level.js';
import { setupTooltips } from './tooltip.js';

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
  enseignants: { title: 'Pour les enseignants' },
};

// Les activités de l'accueil : icône du sprite SVG (index.html) et couleur de l'activité,
// les mêmes que dans la barre de navigation. `count` ajoute un chiffre tiré des données.
const TILES = [
  { view: 'debut',   icon: 'volcano',  accent: '#ff6b3d', kind: 'Histoire', count: (d) => `${d.story.length} chapitres`, title: 'Le grand début', text: 'La naissance de la Terre, de la Lune, des océans… et de la vie !' },
  { view: 'arbre',   icon: 'tree',     accent: '#22b573', kind: 'Explorer', count: (d) => `${d.nodes.length} groupes`, title: "L'arbre de la vie", text: 'Découvre la grande famille de tous les êtres vivants.' },
  { view: 'frise',   icon: 'timeline', accent: '#3d7bfa', kind: 'Explorer', title: 'La ligne du temps', text: 'Voyage à travers les ères, de la première cellule à aujourd\'hui.' },
  { view: 'horloge', icon: 'clock',    accent: '#f5a524', kind: 'Explorer', title: 'La Terre en 24 heures', text: 'À quelle heure sont arrivés les dinosaures ? Et toi ?' },
  { view: 'voyage',  icon: 'dna',      accent: '#ec4f9f', kind: 'Histoire', title: 'Le voyage de tes ancêtres', text: 'Savais-tu que tu as un ancêtre poisson ?' },
  { view: 'premier', icon: 'medal',    accent: '#8b5cf6', kind: 'Jeu', title: 'Qui est apparu en premier ?', text: 'Deux animaux, une question : à toi de deviner !' },
  { view: 'quiz',    icon: 'quiz',     accent: '#0fb5a6', kind: 'Jeu', title: 'Le grand quiz', text: '10 questions pour devenir expert de l\'évolution.' },
  { view: 'echelle', icon: 'rocket',   accent: '#ef4444', kind: 'Jeu', title: 'Remonter le temps', text: 'Combien de temps pour rejoindre les dinosaures ?' },
];

const mounted = new Map();
let ctx = null;
let isFirstRoute = true;
let currentView = 'accueil';

init();
registerServiceWorker();
setupFrenchTypography();

// Typographie française : espace fine insécable avant ! ? : ; » et après «,
// pour qu'un « ! » ne se retrouve jamais seul en début de ligne.
function setupFrenchTypography() {
  const NNBSP = '\u202f';
  const fix = (text) => text
    .replace(/[ \u00a0]([!?;:»])/g, `${NNBSP}$1`)
    .replace(/« /g, `«${NNBSP}`);
  const walk = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (/[ \u00a0][!?;:»]|« /.test(node.nodeValue)
        && !node.parentElement?.closest('script, style, input, textarea, code, pre')
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => { node.nodeValue = fix(node.nodeValue); });
  };
  walk(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) {
          if (/[ \u00a0][!?;:»]|« /.test(added.nodeValue)) added.nodeValue = fix(added.nodeValue);
        } else if (added.nodeType === Node.ELEMENT_NODE) {
          walk(added);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// Hors ligne : le service worker garde le site en cache (sauf en développement local).
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker indisponible', error));
  });
}

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
    currentView: () => currentView,
  };
  const card = createCard(ctx);
  setupTooltips(ctx);
  setupLevel();

  reportValidation(validation);
  checkImages(ctx);
  status.textContent = '';

  setupHome(ctx);
  setupSearch(ctx);
  setupTreeModes(ctx);

  window.addEventListener('hashchange', route);
  route();
}

// ---------- Navigation par ancre (#arbre, #quiz…) ----------

async function route() {
  let name = decodeURIComponent(location.hash.slice(1));
  // Lien direct vers une fiche : #fiche/<id> (affiche l'arbre derrière la fiche).
  let cardId = null;
  if (name.startsWith('fiche/')) {
    cardId = name.slice(6);
    name = isFirstRoute ? 'arbre' : currentView;
  }
  const view = VIEWS[name] ? name : 'accueil';
  currentView = view;

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
  if (cardId && ctx.index.byId.has(cardId)) {
    ctx.openCard(cardId);
    return;
  }

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
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Icône du sprite SVG défini dans index.html (#i-…).
  const icon = (name, className) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  };

  // ----- Les activités -----
  const tiles = document.getElementById('home-tiles');
  tiles.replaceChildren(...TILES.map((tile, i) => h('li', {},
    h('a', { class: 'tile', href: `#${tile.view}`, style: { '--accent': tile.accent } },
      h('span', { class: 'tile-art' },
        h('span', { class: 'tile-num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
        icon(tile.icon, 'tile-icon')),
      h('span', { class: 'tile-body' },
        h('span', { class: 'tile-kind' }, tile.count ? `${tile.kind} · ${tile.count(data)}` : tile.kind),
        h('span', { class: 'tile-title' }, tile.title),
        h('span', { class: 'tile-text' }, tile.text),
        h('span', { class: 'tile-go', 'aria-hidden': 'true' }, 'C\'est parti', icon('arrow', ''))),
    ),
  )));

  // ----- Les chiffres-clés du planétarium, comptés quand ils apparaissent -----
  const numberFr = (value, digits) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const stats = {
    years: (data.story?.[0]?.mya ?? data.meta?.earth_age_mya ?? 4540) / 1000,
    nodes: data.nodes.length,
    chapters: data.story?.length || 0,
    extinctions: data.events.filter((e) => e.type === 'extinction').length,
  };
  const statEls = [...document.querySelectorAll('[data-stat]')];
  statEls.forEach((el) => {
    const value = stats[el.dataset.stat];
    if (value) el.textContent = numberFr(value, el.dataset.stat === 'years' ? 1 : 0);
  });
  const countUp = () => {
    if (reduceMotion.matches) return;
    const start = performance.now();
    const duration = 1600;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 4;
      statEls.forEach((el) => {
        const value = stats[el.dataset.stat];
        if (value) el.textContent = numberFr(value * eased, el.dataset.stat === 'years' ? 1 : 0);
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const statsBox = document.querySelector('.hero-stats');
  if (statsBox && 'IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { watcher.disconnect(); countUp(); }
    }, { threshold: 0.6 });
    watcher.observe(statsBox);
  }

  // ----- « Le savais-tu ? » : un fait étonnant au hasard, qu'on peut changer -----
  const box = document.getElementById('did-you-know');
  const facts = shuffle(data.nodes.filter((n) => n.fun_fact));
  let position = 0;
  const show = () => {
    const node = facts[position % facts.length];
    position += 1;
    const media = h('div', { class: 'dyk-media' });
    const picture = h('img', { src: node.image, alt: node.image_alt || node.name_fr, loading: 'lazy', decoding: 'async' });
    picture.addEventListener('error', () => media.replaceChildren(h('span', { class: 'dyk-emoji', role: 'img', 'aria-label': node.name_fr }, node.emoji)));
    media.append(picture);
    box.replaceChildren(
      media,
      h('div', { class: 'dyk-body' },
        h('h2', { class: 'dyk-title' }, icon('sparkle', ''), 'Le savais-tu ?'),
        h('p', { class: 'dyk-text' }, nodeFunFact(node)),
        h('div', { class: 'dyk-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => openCard(node.id) }, `Voir la fiche : ${node.name_fr}`),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: show }, '🎲 Un autre !'),
        ),
      ),
    );
  };
  if (facts.length) show();
  document.addEventListener('level-change', () => { position = Math.max(0, position - 1); if (facts.length) show(); });

  // ----- La Terre qui tourne (projection orthographique des continents) -----
  const globe = document.querySelector('.globe-svg');
  const landData = document.getElementById('earth-land');
  if (!globe || !landData) return;
  let rings;
  try { rings = JSON.parse(landData.textContent); } catch (e) { return; }

  const RAD = Math.PI / 180;
  const CENTER = 200;
  const RADIUS = 170;
  const TILT = 20 * RAD; // on regarde la Terre un peu « d'au-dessus » de l'équateur
  const toPoints = (flat, scale = 0.5) => {
    const lonLat = [];
    for (let i = 0; i < flat.length; i += 2) lonLat.push([flat[i] * scale, flat[i + 1] * scale]);
    // Ajoute des points sur les longs segments pour que les côtes restent bien courbes.
    const dense = [];
    lonLat.forEach(([lon, lat], i) => {
      const [lon2, lat2] = lonLat[(i + 1) % lonLat.length];
      dense.push([lon, lat]);
      const gap = Math.hypot(lon2 - lon, lat2 - lat);
      if (gap > 3 && Math.abs(lon2 - lon) < 180) {
        const steps = Math.floor(gap / 3);
        for (let s = 1; s <= steps; s += 1) {
          const f = s / (steps + 1);
          dense.push([lon + (lon2 - lon) * f, lat + (lat2 - lat) * f]);
        }
      }
    });
    return dense.map(([lon, lat]) => [Math.cos(lat * RAD), Math.sin(lat * RAD), lon * RAD]);
  };
  const meanLat = (flat) => {
    let sum = 0;
    for (let i = 1; i < flat.length; i += 2) sum += flat[i];
    return sum / (flat.length / 2) / 2;
  };
  const land = [];
  const ice = [];
  rings.forEach((flat) => (Math.abs(meanLat(flat)) > 66 ? ice : land).push(toPoints(flat)));

  // Quelques nuages : des groupes d'ellipses posés sur la sphère.
  const CLOUDS = [[-28, 8, 9], [42, 48, 7], [96, -14, 8], [158, 28, 10], [-122, -34, 9], [-78, 52, 7],
    [70, 6, 6], [12, -46, 10], [-160, 2, 7], [128, 62, 8], [-40, -20, 6], [178, -40, 8], [-100, 22, 6],
    [-10, 58, 8], [25, 4, 5], [60, -38, 9], [-58, -50, 9], [140, -4, 6], [-140, 44, 8], [100, 34, 5]];
  const clouds = [];
  CLOUDS.forEach(([lon, lat, size]) => {
    [[0, 0, 1], [size * 0.7, size * 0.25, 0.7], [-size * 0.8, size * 0.1, 0.6]].forEach(([dx, dy, k]) => {
      const flat = [];
      for (let a = 0; a < 18; a += 1) {
        const angle = (a / 18) * Math.PI * 2;
        const cLat = lat + dy + Math.sin(angle) * size * 0.32 * k;
        flat.push(lon + dx + (Math.cos(angle) * size * k) / Math.max(0.35, Math.cos(cLat * RAD)), cLat);
      }
      clouds.push(toPoints(flat, 1));
    });
  });

  const sinT = Math.sin(TILT);
  const cosT = Math.cos(TILT);
  const project = (points, lam0) => points.map(([cosLat, sinLat, lon]) => {
    const d = lon - lam0;
    const cosD = Math.cos(d);
    return [cosLat * Math.sin(d), cosT * sinLat - sinT * cosLat * cosD, sinT * sinLat + cosT * cosLat * cosD];
  });
  const fmt = (x, y) => `${(CENTER + RADIUS * x).toFixed(1)} ${(CENTER - RADIUS * y).toFixed(1)}`;
  // Découpe d'un contour par l'horizon : la partie cachée suit le bord du disque.
  const ringPath = (p) => {
    const n = p.length;
    const start = p.findIndex((q) => q[2] >= 0);
    if (start < 0) return '';
    let d = '';
    let exit = null;
    const add = (x, y) => { d += (d ? 'L' : 'M') + fmt(x, y); };
    const cross = (a, b) => {
      const t = a[2] / (a[2] - b[2]);
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      const length = Math.hypot(x, y) || 1;
      return [x / length, y / length];
    };
    const arc = (from, to) => {
      const a0 = Math.atan2(from[1], from[0]);
      let delta = Math.atan2(to[1], to[0]) - a0;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const steps = Math.ceil(Math.abs(delta) / 0.12);
      for (let s = 1; s < steps; s += 1) add(Math.cos(a0 + (delta * s) / steps), Math.sin(a0 + (delta * s) / steps));
    };
    for (let k = 0; k <= n; k += 1) {
      const cur = p[(start + k) % n];
      if (k === 0) { add(cur[0], cur[1]); continue; }
      const prev = p[(start + k - 1) % n];
      const curIn = cur[2] >= 0;
      const prevIn = prev[2] >= 0;
      if (curIn && !prevIn) {
        const entry = cross(prev, cur);
        if (exit) arc(exit, entry);
        add(entry[0], entry[1]);
        exit = null;
      } else if (!curIn && prevIn) {
        exit = cross(prev, cur);
        add(exit[0], exit[1]);
      }
      if (curIn && k < n) add(cur[0], cur[1]);
    }
    return `${d}Z`;
  };
  const shapes = (list, lam0) => list.map((ring) => ringPath(project(ring, lam0))).join('');

  const landPath = globe.querySelector('.globe-land');
  const icePath = globe.querySelector('.globe-ice');
  const cloudPath = globe.querySelector('.globe-clouds');
  let lambda = 12 * RAD; // l'Afrique et l'Europe face à nous au départ
  let cloudShift = 0;
  const draw = () => {
    landPath.setAttribute('d', shapes(land, lambda));
    icePath.setAttribute('d', shapes(ice, lambda));
    cloudPath.setAttribute('d', shapes(clouds, lambda + cloudShift));
  };
  draw();
  globe.classList.add('is-ready');

  // Un tour en 100 secondes ; la Terre tourne d'ouest en est (les continents vont vers la droite).
  const SPEED = (2 * Math.PI) / 100000;
  let visible = false;
  let dragging = null;
  let frame = 0;
  let last = 0;
  const loop = (now) => {
    frame = 0;
    const elapsed = Math.min(64, now - last);
    if (elapsed >= 30) {
      last = now;
      if (!dragging) {
        lambda -= elapsed * SPEED;
        cloudShift += elapsed * SPEED * 0.18;
      }
      draw();
    }
    schedule();
  };
  function schedule() {
    if (frame || !visible || document.hidden || reduceMotion.matches) return;
    frame = requestAnimationFrame(loop);
  }
  const resume = () => { last = performance.now(); schedule(); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) resume();
    }).observe(globe);
  }
  document.addEventListener('visibilitychange', resume);
  reduceMotion.addEventListener?.('change', resume);

  // On peut faire tourner la Terre avec le doigt ou la souris.
  globe.addEventListener('pointerdown', (event) => {
    dragging = { x: event.clientX, lambda };
    globe.classList.add('is-dragging');
    globe.setPointerCapture?.(event.pointerId);
  });
  globe.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const scale = (Math.PI / globe.getBoundingClientRect().width) * 1.2;
    lambda = dragging.lambda - (event.clientX - dragging.x) * scale;
    draw();
  });
  const release = () => { dragging = null; globe.classList.remove('is-dragging'); };
  globe.addEventListener('pointerup', release);
  globe.addEventListener('pointercancel', release);
}

// ---------- Arbre : vue illustrée ou liste ----------

function setupTreeModes(context) {
  const tabs = [...document.querySelectorAll('[data-tree-mode]')];
  let viz = null;
  let list = null;

  const ensureList = () => {
    list ??= mountTree(document.getElementById('tree'), context);
    return list;
  };

  const select = async (mode) => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.treeMode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    try { localStorage.setItem('vue-arbre', mode); } catch (e) { /* ignoré */ }
    if (mode === 'liste') { ensureList(); return; }
    if (!viz) {
      try {
        const module = await import('./treeviz.js');
        viz = module.mountTreeViz(document.getElementById('treeviz'), context) || {};
      } catch (error) {
        console.error(error);
        select('liste');
        return;
      }
    }
    viz.onShow?.();
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => select(tab.dataset.treeMode));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
      next.focus();
      select(next.dataset.treeMode);
    });
  });

  // « Voir dans l'arbre » depuis une fiche : on utilise la vue affichée.
  context.revealInTree = (id) => {
    context.navigate('arbre');
    setTimeout(() => {
      const mode = tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.treeMode;
      if (mode === 'liste' || !viz?.reveal) ensureList().reveal?.(id);
      else viz.reveal(id);
    }, 120);
  };

  let started = false;
  mounted.set('arbre', { onShow: () => {
    if (started) { viz?.onShow?.(); return; }
    started = true;
    let saved = 'illustre';
    try { saved = localStorage.getItem('vue-arbre') === 'liste' ? 'liste' : 'illustre'; } catch (e) { /* ignoré */ }
    select(saved);
  } });
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

