// « Si l'histoire de la Terre tenait en 24 heures »
//
// Une horloge ronde (SVG) : 0 h 00 = formation de la Terre (4 540 Ma),
// minuit = aujourd'hui. Heure d'un groupe = (1 − appeared_mya / 4540) × 24 h.
// Les groupes marquants ont un repère sur le cadran et une ligne dans la liste
// « À quelle heure ? ». Trois cadrans : 24 heures, la dernière heure, la dernière
// minute. Le bouton « ▶ Lancer l'horloge » fait tourner l'aiguille et allume
// chaque apparition (sauf si l'enfant préfère réduire les animations).

import { CATEGORY_INFO, EARTH_AGE_MYA, formatAgo, h, prefersReducedMotion } from './utils.js';

const DAY = 24 * 3600;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Les groupes les plus parlants, dans l'ordre de l'histoire (ceux qui existent sont gardés).
const KEY_IDS = [
  'vie', 'cyanobacteries', 'eucaryotes', 'multicellulaires', 'animaux', 'trilobites', 'vertebres',
  'requins', 'insectes', 'tetrapodes', 'amniotes', 'dinosaures', 'mammiferes', 'oiseaux', 't_rex',
  'primates', 'cetaces', 'hominines', 'homo', 'neandertaliens', 'homo_sapiens',
];

const WINDOWS = {
  day: {
    label: '24 heures', emoji: '🕛', start: 0, rings: ['eon', 'era'], duration: 24000, zoom: 'hour',
    title: 'Toute l\'histoire de la Terre en 24 heures',
  },
  hour: {
    label: 'Dernière heure', emoji: '🔍', start: DAY - 3600, rings: ['era', 'period'], duration: 16000, zoom: 'minute',
    title: 'Zoom sur la dernière heure : de 23 h 00 à minuit',
  },
  minute: {
    label: 'Dernière minute', emoji: '🔬', start: DAY - 60, rings: ['era', 'period'], duration: 14000,
    title: 'Super zoom sur la dernière minute : de 23 h 59 min 00 s à minuit',
  },
};

// Rayons du cadran (unités du viewBox).
const R = { label: 222, tickOut: 210, ringOut: 204, ringMid: 184, ringIn: 164, lead: 160, hub: 26 };
const LEVELS = [140, 113, 86, 59];
const MARK_R = 16;

// ---------- Calcul de l'heure ----------

export const clockSeconds = (mya) => Math.min(Math.max((1 - mya / EARTH_AGE_MYA) * DAY, 0), DAY);

const pad = (n) => String(n).padStart(2, '0');

// « 22 h 48 min 12 s » (secondes tronquées : on n'arrondit jamais vers minuit).
export function formatClock(seconds) {
  const total = Math.floor(seconds + 1e-6);
  if (total >= DAY) return 'minuit pile';
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${hh}\u00a0h\u00a0${pad(mm)}\u00a0min\u00a0${pad(ss)}\u00a0s`; // espaces insécables
}

// Temps restant avant minuit, en mots : « 6 secondes », « 20 minutes et 56 secondes »…
function formatLeft(seconds) {
  const left = DAY - Math.floor(seconds + 1e-6);
  const hh = Math.floor(left / 3600);
  const mm = Math.floor((left % 3600) / 60);
  const ss = left % 60;
  const part = (n, word) => (n ? `${n} ${word}${n > 1 ? 's' : ''}` : null);
  const parts = [part(hh, 'heure'), part(mm, 'minute'), part(ss, 'seconde')].filter(Boolean);
  if (!parts.length) return '0 seconde';
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0];
}

let uid = 0;

export function mount(container, ctx) {
  const { data, index, openCard } = ctx;
  const id = `clk${(uid += 1)}`;
  const events = Array.isArray(data.events) ? data.events : [];
  const nodes = data.nodes
    .filter((n) => typeof n.appeared_mya === 'number' && Number.isFinite(n.appeared_mya))
    .map((n) => ({ node: n, sec: clockSeconds(n.appeared_mya) }))
    .sort((a, b) => a.sec - b.sec);
  if (!nodes.length) {
    container.replaceChildren(h('p', { class: 'data-status' }, 'Pas encore d\'êtres vivants à placer sur l\'horloge.'));
    return {};
  }
  const byId = new Map(nodes.map((item) => [item.node.id, item]));
  const human = byId.get('homo_sapiens')
    || [...nodes].reverse().find((item) => item.node.category === 'humain')
    || nodes[nodes.length - 1];
  const keyItems = pickKeys(nodes, byId, index, human);
  const extinctions = events.filter((e) => e.type === 'extinction' && typeof e.start_mya === 'number');

  const state = {
    win: 'day', showAll: false, selected: human, t: null, playing: false, raf: 0, lastFrame: 0, lit: new Set(),
  };
  const winEnd = () => DAY;
  const win = () => WINDOWS[state.win];
  const inWindow = (sec) => sec >= win().start && sec <= winEnd();
  const angleOf = (sec) => ((sec - win().start) / (winEnd() - win().start)) * 360;
  const dialItems = () => (state.showAll ? nodes : keyItems).filter((item) => inWindow(item.sec));

  // ---------- Squelette ----------
  const svg = svgEl('svg', {
    class: 'clk-svg', viewBox: '-268 -246 536 492', role: 'img', 'aria-labelledby': `${id}-svg-title`,
  });
  const readoutTime = h('p', { class: 'clk-readout-time' });
  const readoutWhat = h('p', { class: 'clk-readout-what' });
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });

  const zoomButtons = Object.entries(WINDOWS).map(([key, w]) => h('button', {
    type: 'button', class: 'clk-zoom', 'aria-pressed': String(key === state.win), dataset: { win: key },
    onclick: () => { stop(); setWindow(key); },
  }, h('span', { 'aria-hidden': 'true' }, w.emoji), ` ${w.label}`));

  const playButton = h('button', { type: 'button', class: 'btn clk-play', onclick: () => (state.playing ? pause() : play()) });
  const prevButton = h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'aria-label': 'Groupe précédent', onclick: () => step(-1) }, '◀');
  const nextButton = h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'aria-label': 'Groupe suivant', onclick: () => step(1) }, '▶');

  const info = h('div', { class: 'clk-info', 'aria-live': 'polite' });
  const list = h('ol', { class: 'clk-list', id: `${id}-list` });
  const allToggle = h('button', {
    type: 'button', class: 'btn btn-small btn-ghost clk-all', 'aria-pressed': 'false', 'aria-controls': `${id}-list`,
    onclick: () => {
      state.showAll = !state.showAll;
      allToggle.setAttribute('aria-pressed', String(state.showAll));
      allToggle.textContent = state.showAll ? '⭐ Seulement les plus importants' : `🔎 Voir les ${nodes.length} groupes`;
      renderList();
      renderDial();
    },
  }, `🔎 Voir les ${nodes.length} groupes`);

  container.replaceChildren(h('div', { class: 'clk-root' },
    h('p', { class: 'view-intro' },
      'Imagine que toute l\'histoire de la Terre, depuis sa naissance, dure une seule journée. À 0 h 00, la Terre se forme. À minuit, c\'est aujourd\'hui. Quand sont arrivés les êtres vivants ?'),
    h('div', { class: 'clk-layout' },
      h('div', { class: 'clk-dial-col' },
        h('div', { class: 'clk-zooms', role: 'group', 'aria-label': 'Choisir le cadran' }, ...zoomButtons),
        h('div', { class: 'clk-dial' }, svg),
        h('div', { class: 'clk-readout' }, readoutTime, readoutWhat),
        h('div', { class: 'clk-controls' }, prevButton, playButton, nextButton),
        live),
      h('div', { class: 'clk-side' },
        surpriseBox(),
        info,
        h('section', { class: 'clk-list-box', 'aria-labelledby': `${id}-list-title` },
          h('div', { class: 'clk-list-head' },
            h('h3', { id: `${id}-list-title` }, h('span', { 'aria-hidden': 'true' }, '⏰ '), 'À quelle heure ?'),
            allToggle),
          list)))));

  // ---------- La grande surprise ----------
  function surpriseBox() {
    const sec = human.sec;
    const facts = [];
    const animals = byId.get('animaux');
    const dinos = byId.get('dinosaures');
    const ktExtinction = extinctions.find((e) => Math.abs(e.start_mya - 66) < 2);
    if (animals) facts.push(['🪼', `Les premiers animaux n'arrivent qu'à ${formatClock(animals.sec)} : pendant plus de ${Math.floor(animals.sec / 3600)} heures, il n'y a que des microbes !`]);
    if (dinos) facts.push(['🦖', `Les dinosaures apparaissent à ${formatClock(dinos.sec)}${ktExtinction ? ` et l'astéroïde les fait disparaître à ${formatClock(clockSeconds(ktExtinction.start_mya))}` : ''}.`]);
    return h('div', { class: 'clk-surprise' },
      h('p', { class: 'clk-surprise-kicker' }, '😮 La grande surprise'),
      h('p', { class: 'clk-surprise-main' },
        h('span', { class: 'clk-surprise-emoji', 'aria-hidden': 'true' }, human.node.emoji || '🧑'),
        h('span', {},
          h('strong', {}, human.node.name_fr),
          ` arrive à ${formatClock(sec)} : il ne reste que `,
          h('strong', { class: 'clk-hot' }, formatLeft(sec)),
          ' avant ', h('span', { class: 'clk-nowrap' }, 'minuit !'))),
      facts.length ? h('ul', { class: 'clk-facts' }, ...facts.map(([emoji, text]) => h('li', {}, h('span', { 'aria-hidden': 'true' }, emoji), h('span', {}, text)))) : null);
  }

  // ---------- Cadran ----------
  function renderDial() {
    const w = win();
    const parts = [];
    parts.push(svgEl('title', { id: `${id}-svg-title` }, `${w.title}. ${dialItems().map((item) => `${item.node.name_fr} : ${formatClock(item.sec)}`).join(' ; ')}.`));

    // Fond du cadran.
    parts.push(svgEl('circle', { class: 'clk-face', r: R.ringOut + 30 }));
    parts.push(svgEl('circle', { class: 'clk-face-inner', r: R.ringIn }));

    // Anneaux colorés (éons/ères en 24 h ; ères/périodes en zoom).
    w.rings.forEach((type, ringIndex) => {
      const [r0, r1] = ringIndex === 0 ? [R.ringMid, R.ringOut] : [R.ringIn, R.ringMid];
      events.filter((e) => e.type === type && typeof e.start_mya === 'number').forEach((e, i) => {
        const s0 = Math.max(clockSeconds(e.start_mya), w.start);
        const s1 = Math.min(clockSeconds(e.end_mya ?? 0), DAY);
        if (s1 <= s0) return;
        const a0 = angleOf(s0);
        const a1 = angleOf(s1);
        const color = e.color || events.find((p) => p.id === e.parent_id)?.color || '#cccccc';
        parts.push(svgEl('path', { class: 'clk-ring', d: annulus(r0, r1, a0, a1), fill: color },
          svgEl('title', {}, `${e.name_fr} : de ${formatClock(s0)} à ${formatClock(s1)}`)));
        const pathId = `${id}-arc-${ringIndex}-${i}`;
        const mid = (r0 + r1) / 2;
        const length = ((a1 - a0) * Math.PI / 180) * mid;
        const label = fitArcLabel(e.name_fr, length);
        if (label) {
          const flip = (a0 + a1) / 2 > 90 && (a0 + a1) / 2 < 270;
          parts.push(svgEl('path', { id: pathId, d: arcPath(mid, a0, a1, flip), fill: 'none' }));
          parts.push(svgEl('text', { class: 'clk-ring-label', fill: inkFor(color), 'aria-hidden': 'true' },
            svgEl('textPath', { href: `#${pathId}`, startOffset: '50%', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, label)));
        }
      });
    });

    // Graduations et heures.
    for (const tick of ticksFor(state.win)) {
      const a = angleOf(tick.sec);
      const [x1, y1] = polar(R.ringOut + 1, a);
      const [x2, y2] = polar(R.tickOut + (tick.label ? 4 : 0), a);
      parts.push(svgEl('line', { class: `clk-tick ${tick.label ? 'is-major' : ''}`, x1, y1, x2, y2 }));
      if (tick.label && a > 0) {
        const [lx, ly] = polar(R.label + 4, a);
        parts.push(svgEl('text', { class: 'clk-hour', x: lx, y: ly, 'text-anchor': anchorFor(a), 'dominant-baseline': 'central' }, tick.label));
      }
    }
    // En haut : le début (à droite de midi) et minuit = aujourd'hui (à gauche).
    parts.push(svgEl('text', { class: 'clk-hour clk-top', x: 8, y: -R.label - 4, 'text-anchor': 'start' }, ticksFor(state.win)[0].label));
    parts.push(svgEl('text', { class: 'clk-hour clk-top is-now', x: -8, y: -R.label - 4, 'text-anchor': 'end' }, 'minuit'));

    // Extinctions de masse : trait rouge sur les anneaux et 💥.
    for (const e of extinctions) {
      const sec = clockSeconds(e.start_mya);
      if (!inWindow(sec)) continue;
      const a = angleOf(sec);
      const [x1, y1] = polar(R.ringIn - 2, a);
      const [x2, y2] = polar(R.ringOut + 2, a);
      const [bx, by] = polar(R.ringMid, a);
      parts.push(svgEl('g', { class: 'clk-ext' },
        svgEl('title', {}, `💥 ${e.name_fr} : ${formatClock(sec)}`),
        svgEl('line', { x1, y1, x2, y2 }),
        svgEl('circle', { cx: bx, cy: by, r: 9 }),
        svgEl('text', { x: bx, y: by + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '💥')));
    }

    // Secteur du temps écoulé + aiguille.
    const handSec = state.t ?? state.selected?.sec ?? null;
    const showHand = handSec != null && inWindow(handSec);
    const handAngle = showHand ? angleOf(handSec) : 0;
    const sweep = svgEl('path', { class: 'clk-sweep', d: showHand ? sector(R.lead, 0, handAngle) : '' });
    const hand = svgEl('g', { class: 'clk-hand', transform: `rotate(${handAngle})`, style: showHand ? '' : 'display:none' },
      svgEl('line', { x1: 0, y1: 18, x2: 0, y2: -(R.lead - 6) }),
      svgEl('circle', { cx: 0, cy: -(R.lead - 6), r: 6 }));
    parts.push(sweep, hand);

    // Zone du zoom suivant (la dernière heure, la dernière minute) : un arc en surbrillance.
    const next = w.zoom ? WINDOWS[w.zoom] : null;
    if (next) {
      parts.push(svgEl('path', { class: 'clk-zoom-arc', d: annulus(R.ringIn - 6, R.ringIn - 1, angleOf(next.start), 360) }));
    }

    // Repères des groupes. Ceux du zoom suivant sont regroupés en un seul repère « 🔍 +N ».
    const all = dialItems();
    const grouped = next ? all.filter((item) => item.sec >= next.start) : [];
    const items = grouped.length > 1 ? all.filter((item) => !grouped.includes(item)) : all;
    const placed = placeMarkers(items, angleOf);
    for (const { item, angle, radius } of placed) {
      const [lx1, ly1] = polar(R.lead, angle);
      const [lx2, ly2] = polar(radius + MARK_R, angle);
      const [mx, my] = polar(radius, angle);
      const color = CATEGORY_INFO[item.node.category]?.color || '#999999';
      const lit = !state.playing || state.lit.has(item.node.id);
      const g = svgEl('g', {
        class: `clk-marker ${lit ? 'is-lit' : ''} ${state.selected === item ? 'is-selected' : ''}`,
        'data-id': item.node.id, style: `--cat: ${color}`,
      },
      svgEl('title', {}, `${item.node.name_fr} : ${formatClock(item.sec)}`),
      svgEl('line', { class: 'clk-lead', x1: lx1, y1: ly1, x2: lx2, y2: ly2 }),
      svgEl('circle', { class: 'clk-dot', cx: mx, cy: my, r: MARK_R }),
      svgEl('text', { class: 'clk-emoji', x: mx, y: my + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, item.node.emoji || '•'));
      g.addEventListener('click', () => { stop(); select(item); });
      parts.push(g);
    }

    if (grouped.length > 1) {
      const angle = angleOf((next.start + DAY) / 2);
      const radius = LEVELS[0];
      const [lx1, ly1] = polar(R.ringIn - 6, angle);
      const [lx2, ly2] = polar(radius + 20, angle);
      const [mx, my] = polar(radius, angle);
      const lit = !state.playing || grouped.some((item) => state.lit.has(item.node.id));
      const g = svgEl('g', { class: `clk-cluster ${lit ? 'is-lit' : ''}`, 'data-cluster': w.zoom },
        svgEl('title', {}, `${grouped.length} groupes de plus dans ${next.label.toLowerCase()} : clique pour zoomer !`),
        svgEl('line', { class: 'clk-lead', x1: lx1, y1: ly1, x2: lx2, y2: ly2 }),
        svgEl('circle', { class: 'clk-dot', cx: mx, cy: my, r: 21 }),
        svgEl('text', { class: 'clk-cluster-text', x: mx, y: my + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, `+${grouped.length}`),
        svgEl('text', { class: 'clk-cluster-icon', x: mx + 16, y: my - 16, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, next.emoji));
      g.addEventListener('click', () => { stop(); setWindow(w.zoom); });
      parts.push(g);
    }

    // Moyeu : la Terre.
    parts.push(svgEl('circle', { class: 'clk-hub', r: R.hub }));
    parts.push(svgEl('text', { class: 'clk-hub-emoji', x: 0, y: 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '🌍'));

    svg.replaceChildren(...parts);
    svg.dataset.win = state.win;
    renderReadout(handSec);
  }

  function renderReadout(sec) {
    if (sec == null) { readoutTime.textContent = ''; readoutWhat.textContent = ''; return; }
    readoutTime.textContent = formatClock(sec);
    const current = state.playing
      ? [...nodes].reverse().find((item) => item.sec <= sec && inWindow(item.sec) && state.lit.has(item.node.id))
      : state.selected;
    readoutWhat.replaceChildren(current
      ? h('span', {}, h('span', { 'aria-hidden': 'true' }, `${current.node.emoji} `), current.node.name_fr)
      : h('span', {}, '…'));
  }

  // ---------- Sélection d'un groupe ----------
  function select(item, { focusList = false } = {}) {
    state.selected = item;
    state.t = null;
    if (!inWindow(item.sec)) {
      // On passe au plus petit cadran qui contient ce groupe.
      setWindow(['minute', 'hour', 'day'].find((key) => item.sec >= WINDOWS[key].start), false);
    }
    renderDial();
    renderInfo();
    list.querySelectorAll('.clk-item').forEach((button) => {
      const on = button.dataset.id === item.node.id;
      button.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && focusList) button.focus();
      if (on) revealInList(button);
    });
  }

  // Fait défiler la liste seulement (jamais la page) pour montrer la ligne choisie.
  function revealInList(button) {
    const top = button.closest('li').offsetTop; // la liste est le parent positionné
    const bottom = top + button.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 4;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
  }

  function step(direction) {
    stop();
    const pool = state.showAll ? nodes : keyItems;
    const position = pool.indexOf(state.selected);
    const next = pool[(position + direction + pool.length) % pool.length];
    select(next);
  }

  function renderInfo() {
    const item = state.selected;
    if (!item) { info.replaceChildren(); return; }
    const { node } = item;
    const color = CATEGORY_INFO[node.category]?.color || 'var(--border)';
    info.style.setProperty('--cat', color);
    info.replaceChildren(
      h('span', { class: 'clk-info-emoji', 'aria-hidden': 'true' }, node.emoji),
      h('div', { class: 'clk-info-text' },
        h('p', { class: 'clk-info-name' }, node.name_fr),
        h('p', { class: 'clk-info-time' }, h('span', { 'aria-hidden': 'true' }, '⏰ '), formatClock(item.sec)),
        h('p', { class: 'clk-info-ago' }, `Dans la vraie vie : ${formatAgo(node.appeared_mya)}. Il restait ${formatLeft(item.sec)} avant minuit.`),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => openCard(node.id) }, '📖 Lire sa fiche')),
    );
  }

  // ---------- Liste « À quelle heure ? » ----------
  function renderList() {
    const pool = state.showAll ? nodes : keyItems;
    list.replaceChildren(...pool.map((item) => h('li', {},
      h('button', {
        type: 'button', class: `clk-item ${state.playing && !state.lit.has(item.node.id) ? 'is-waiting' : ''}`,
        dataset: { id: item.node.id },
        style: `--cat: ${CATEGORY_INFO[item.node.category]?.color || '#999999'}`,
        'aria-current': state.selected === item ? 'true' : 'false',
        onclick: () => { stop(); select(item); },
      },
      h('span', { class: 'clk-item-emoji', 'aria-hidden': 'true' }, item.node.emoji),
      h('span', { class: 'clk-item-name' }, item.node.name_fr),
      h('span', { class: 'clk-item-time' }, formatClock(item.sec))))));
  }

  // ---------- Cadrans ----------
  function setWindow(key, redraw = true) {
    state.win = key;
    zoomButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.win === key)));
    if (redraw) renderDial();
  }

  // ---------- Animation ----------
  function updatePlayButton() {
    playButton.replaceChildren(state.playing ? '⏸ Pause' : (state.t != null && state.t < DAY ? '▶ Continuer' : '▶ Lancer l\'horloge'));
  }

  function play() {
    const w = win();
    if (prefersReducedMotion()) {
      // Pas d'animation : on montre directement le résultat.
      state.t = null;
      state.playing = false;
      select(human);
      live.textContent = `Minuit ! ${human.node.name_fr} est arrivé à ${formatClock(human.sec)}, il ne restait que ${formatLeft(human.sec)}.`;
      return;
    }
    if (state.t == null || state.t >= DAY || state.t < w.start) {
      state.t = w.start;
      state.lit = new Set();
    }
    state.playing = true;
    state.lastFrame = 0;
    svg.classList.add('is-playing');
    live.textContent = `L'horloge tourne : ${w.title.toLowerCase()}.`;
    updatePlayButton();
    renderList();
    renderDial();
    state.raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!state.playing) return;
    if (!container.isConnected || container.closest('[hidden]')) { pause(); return; }
    const w = win();
    const dt = state.lastFrame ? Math.min(now - state.lastFrame, 100) : 16;
    state.lastFrame = now;
    state.t = Math.min(DAY, state.t + (dt / w.duration) * (DAY - w.start));
    let changed = false;
    for (const item of dialItems()) {
      if (item.sec <= state.t && !state.lit.has(item.node.id)) { state.lit.add(item.node.id); changed = true; }
    }
    if (changed) {
      svg.querySelectorAll('.clk-marker').forEach((g) => g.classList.toggle('is-lit', state.lit.has(g.dataset.id)));
      const next = WINDOWS[w.zoom];
      if (next && state.t >= next.start) svg.querySelector('.clk-cluster')?.classList.add('is-lit');
      list.querySelectorAll('.clk-item').forEach((b) => b.classList.toggle('is-waiting', !state.lit.has(b.dataset.id) && inWindow(byId.get(b.dataset.id).sec)));
    }
    moveHand(state.t);
    if (state.t >= DAY) { finish(); return; }
    state.raf = requestAnimationFrame(frame);
  }

  function moveHand(sec) {
    const a = angleOf(sec);
    const hand = svg.querySelector('.clk-hand');
    hand.setAttribute('transform', `rotate(${a})`);
    hand.style.display = '';
    svg.querySelector('.clk-sweep').setAttribute('d', sector(R.lead, 0, a));
    renderReadout(sec);
  }

  function finish() {
    state.playing = false;
    svg.classList.remove('is-playing');
    state.t = null;
    live.textContent = `Minuit ! ${human.node.name_fr} est arrivé à ${formatClock(human.sec)} : il ne restait que ${formatLeft(human.sec)}.`;
    select(human);
    renderList();
    updatePlayButton();
    container.querySelector('.clk-surprise')?.classList.remove('is-flash');
    void container.offsetWidth;
    container.querySelector('.clk-surprise')?.classList.add('is-flash');
  }

  function pause() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    updatePlayButton();
  }

  function stop() {
    if (!state.playing && state.t == null) return;
    state.playing = false;
    cancelAnimationFrame(state.raf);
    svg.classList.remove('is-playing');
    state.t = null;
    state.lit = new Set();
    renderList();
    updatePlayButton();
  }

  // ---------- Démarrage ----------
  setWindow('day', false);
  renderList();
  select(human);
  updatePlayButton();

  return {
    onShow() { if (!state.playing) renderDial(); },
  };
}

// ---------- Choix des groupes marquants ----------

function pickKeys(nodes, byId, index, human) {
  const chosen = new Set(KEY_IDS.filter((key) => byId.has(key)));
  if (chosen.size < 8) {
    // Données différentes : la racine, le plus ancien de chaque famille, et le plus récent.
    if (index?.root && byId.has(index.root.id)) chosen.add(index.root.id);
    const seen = new Set();
    for (const item of nodes) {
      if (!seen.has(item.node.category)) { seen.add(item.node.category); chosen.add(item.node.id); }
    }
  }
  if (index?.root && byId.has(index.root.id)) chosen.add(index.root.id);
  chosen.add(human.node.id);
  return nodes.filter((item) => chosen.has(item.node.id));
}

// ---------- Placement des repères sans chevauchement ----------

function placeMarkers(items, angleOf) {
  const placed = [];
  const minGap = MARK_R * 2 + 3;
  for (const item of items) {
    const angle = angleOf(item.sec);
    let best = null;
    for (const radius of LEVELS) {
      const clash = placed.some((p) => p.radius === radius && arcDistance(p.angle, angle, radius) < minGap);
      if (!clash) { best = radius; break; }
    }
    if (best == null) {
      // Tous les niveaux sont pris : on prend celui où le voisin est le plus loin.
      best = LEVELS.map((radius) => ({
        radius,
        gap: Math.min(...placed.filter((p) => p.radius === radius).map((p) => arcDistance(p.angle, angle, radius))),
      })).sort((a, b) => b.gap - a.gap)[0].radius;
    }
    placed.push({ item, angle, radius: best });
  }
  return placed;
}

function arcDistance(a, b, radius) {
  const d = Math.abs(a - b) % 360;
  return (Math.min(d, 360 - d) * Math.PI / 180) * radius;
}

// ---------- Graduations ----------

function ticksFor(key) {
  const out = [];
  if (key === 'day') {
    for (let hh = 0; hh < 24; hh += 1) out.push({ sec: hh * 3600, label: hh % 3 === 0 ? `${hh} h` : '' });
  } else if (key === 'hour') {
    for (let m = 0; m < 60; m += 5) out.push({ sec: DAY - 3600 + m * 60, label: m % 15 === 0 ? `23 h ${pad(m)}` : '' });
  } else {
    for (let s = 0; s < 60; s += 5) out.push({ sec: DAY - 60 + s, label: s % 15 === 0 ? (s ? `${s} s` : '23 h 59') : '' });
  }
  return out;
}

// ---------- Géométrie SVG ----------

function polar(radius, angle) {
  const rad = (angle - 90) * Math.PI / 180;
  return [round(radius * Math.cos(rad)), round(radius * Math.sin(rad))];
}

const round = (v) => Math.round(v * 100) / 100;

function anchorFor(angle) {
  if (angle > 8 && angle < 172) return 'start';
  if (angle > 188 && angle < 352) return 'end';
  return 'middle';
}

function annulus(r0, r1, a0, a1) {
  const span = Math.min(a1 - a0, 359.99);
  const end = a0 + span;
  const large = span > 180 ? 1 : 0;
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, end);
  const [x2, y2] = polar(r0, end);
  const [x3, y3] = polar(r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

function sector(radius, a0, a1) {
  const span = Math.min(a1 - a0, 359.99);
  if (span <= 0.01) return '';
  const [x0, y0] = polar(radius, a0);
  const [x1, y1] = polar(radius, a0 + span);
  return `M0 0 L${x0} ${y0} A${radius} ${radius} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

// Arc pour un texte ; à l'envers en bas du cadran pour rester lisible.
function arcPath(radius, a0, a1, flip) {
  const span = Math.min(a1 - a0, 359.99);
  const large = span > 180 ? 1 : 0;
  const [x0, y0] = polar(radius, a0);
  const [x1, y1] = polar(radius, a0 + span);
  return flip
    ? `M${x1} ${y1} A${radius} ${radius} 0 ${large} 0 ${x0} ${y0}`
    : `M${x0} ${y0} A${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

function fitArcLabel(name, length) {
  const perChar = 7.2;
  if (name.length * perChar + 10 <= length) return name;
  const room = Math.floor((length - 10) / perChar);
  return room >= 5 ? `${name.slice(0, room - 1)}.` : '';
}

function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#1d1d1f';
  const n = parseInt(m[1], 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.062 >= 1.05 / (L + 0.05) ? '#1d1d1f' : '#ffffff';
}

function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}
