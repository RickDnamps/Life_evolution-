// L'arbre de l'évolution illustré : un chronogramme phylogénétique en SVG.
//
// Le temps va de gauche (il y a 4 milliards d'années) à droite (aujourd'hui), avec
// la même échelle « en accordéon » que la ligne du temps : le Précambrien est
// très serré, puis l'axe s'étire, et une loupe agrandit les 10 derniers millions
// d'années. Chaque groupe est un médaillon placé à la date de son apparition. Les
// branches partent du point de séparation (l'ancêtre commun) et rejoignent chaque
// descendant ; une branche s'arrête avec une croix † si le groupe a disparu, ou
// file jusqu'à aujourd'hui s'il vit encore.
//
// Mise en page « tidy » : chaque feuille (ou groupe replié) occupe une rangée, un
// groupe interne est centré entre ses enfants. Les étiquettes sont placées pour ne
// jamais se chevaucher (à droite le long de la branche, sinon à gauche, au-dessus…).
//
// API : mountTreeViz(container, ctx) → { reveal, expandAll, collapseAll, highlightLineage, onShow }

import { CATEGORY_INFO, ancestors, formatAgo, formatShort, getLevel, h, prefersReducedMotion } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';

// Morceaux de l'accordéon (mêmes coupures que la ligne du temps), en unités de dessin.
const SEGMENTS = [
  { from: 4000, to: 1000, width: 320 },
  { from: 1000, to: 538.8, width: 250 },
  { from: 538.8, to: 251.902, width: 1010 },
  { from: 251.902, to: 66, width: 880 },
  { from: 66, to: 10, width: 640 },
  { from: 10, to: 0, width: 660, loupe: true },
];

// Géométrie de l'arbre (unités de dessin ; 1 unité = 1 px au zoom 100 %).
const G = {
  row: 54,        // hauteur d'une rangée
  r: 18,          // rayon d'un médaillon
  padTop: 30,
  padBottom: 46,
  padLeft: 26,
  padRight: 190,
  corner: 22,     // rayon des coudes des branches
  name: 15,       // taille du nom
  sub: 11.5,      // taille de l'âge
  gap: 7,         // espace entre médaillon et texte
};

// Bandeau du temps (pixels écran, il ne grossit pas avec le zoom).
const HEAD = { era: [6, 24], period: [34, 17], axis: 54, height: 84 };

const ZOOM_MIN = 0.22;
const ZOOM_MAX = 2.5;
const DURATION = 520;
const HUMAN_ID = 'homo_sapiens';

let uid = 0;

export function mountTreeViz(container, ctx) {
  const { data, index, validation, openCard } = ctx;
  const root = index.root;
  if (!container || !root) return { reveal() {}, expandAll() {}, collapseAll() {}, highlightLineage() {}, onShow() {} };

  const id = `tv${(uid += 1)}`;
  const events = Array.isArray(data.events) ? data.events : [];
  const scale = buildScale();
  const X = scale.x;

  // ---------- Informations par nœud ----------
  const info = new Map();
  const humanLine = new Set(ancestors(index, HUMAN_ID).map((n) => n.id));

  const collect = (node, depth, parentId) => {
    const kids = index.children.get(node.id) || [];
    const it = {
      id: node.id, node, depth, parentId, kids: [],
      color: catColor(node),
      leaves: 0, desc: 0, living: node.extinct_mya == null, cladeEnd: node.extinct_mya ?? 0,
      shown: false, cur: null, from: null, to: null, lab: null, labFrom: null, labTo: null,
    };
    info.set(node.id, it);
    for (const kid of kids) {
      const k = collect(kid, depth + 1, node.id);
      it.leaves += k.leaves;
      it.desc += 1 + k.desc;
      if (k.living) it.living = true;
    }
    if (!kids.length) it.leaves = 1;
    // Fin du clade : aujourd'hui si un descendant vit encore, sinon la disparition la plus récente.
    it.cladeEnd = it.living ? 0 : Math.min(node.extinct_mya ?? 0, ...kids.map((k) => info.get(k.id).cladeEnd));
    // Ordre des enfants : les petites familles en haut, les grandes en bas (arbre « en escalier »),
    // et la lignée humaine toujours en dernier, pour que l'histoire descende jusqu'à toi.
    it.kids = kids.map((k) => k.id).sort((a, b) => {
      const A = info.get(a); const B = info.get(b);
      return (humanLine.has(a) - humanLine.has(b)) || (A.leaves - B.leaves) || (B.node.appeared_mya - A.node.appeared_mya);
    });
    return it;
  };
  collect(root, 0, null);

  // État initial : tout est déplié, sauf quelques familles à découvrir (badge « +N »).
  const INITIAL_CLOSED = [
    'arthropodes', 'mollusques', 'actinopterygiens', 'requins', 'squamates', 'pterosaures',
    'sauropodomorphes', 'ornithischiens', 'theropodes', 'marsupiaux', 'elephants', 'rongeurs',
    'carnivores', 'artiodactyles', 'perissodactyles',
  ];
  const open = new Set([...info.values()].filter((it) => it.kids.length).map((it) => it.id));
  INITIAL_CLOSED.forEach((closed) => open.delete(closed));

  let level = getLevel();
  let zoom = 1;
  let userZoomed = false;
  let pinned = null;     // id dont la lignée est mise en évidence
  let tracing = null;    // id survolé
  let current = root.id; // nœud qui porte le tabindex=0
  let H = 0;
  let canvasW = scale.W; // largeur du dessin (unités), un peu plus si une étiquette déborde à droite
  let firstShow = true;  // la première vue (zoom, défilement) attend que le cadre soit visible
  let animFrame = 0;

  // ---------- Squelette HTML ----------
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const helpId = `${id}-help`;
  const summary = h('div', { class: 'visually-hidden', id: `${id}-summary` });
  const help = h('p', { class: 'visually-hidden', id: helpId },
    'Entrée : lire la fiche. Plus ou moins : déplier ou replier. Flèches : se déplacer dans l\'arbre.');

  const btnLineage = h('button', { type: 'button', class: 'btn tv-btn-lineage', 'aria-pressed': 'false', onclick: () => toggleHumanLineage() },
    h('span', { 'aria-hidden': 'true' }, '🧑'), ' Montre ma lignée');
  const btnExpand = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => api.expandAll() },
    h('span', { 'aria-hidden': 'true' }, '🌿'), ' ', h('span', { class: 'tv-long' }, 'Tout déplier'), h('span', { class: 'tv-short' }, 'Déplier'));
  const btnCollapse = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => api.collapseAll() },
    h('span', { 'aria-hidden': 'true' }, '🍂'), ' ', h('span', { class: 'tv-long' }, 'Tout replier'), h('span', { class: 'tv-short' }, 'Replier'));
  const btnFull = document.fullscreenEnabled ? h('button', {
    type: 'button', class: 'btn btn-ghost btn-small tv-btn-full', 'aria-pressed': 'false', 'aria-label': 'Plein écran', onclick: () => toggleFullscreen(),
  }, h('span', { 'aria-hidden': 'true' }, '⛶'), h('span', { class: 'tv-btn-text' }, ' Plein écran')) : null;

  const zoomIn = h('button', { type: 'button', class: 'tv-zoom-btn', 'aria-label': 'Zoomer', title: 'Zoomer (Ctrl + molette)', onclick: () => zoomBy(1.25) }, '+');
  const zoomOut = h('button', { type: 'button', class: 'tv-zoom-btn', 'aria-label': 'Dézoomer', title: 'Dézoomer', onclick: () => zoomBy(1 / 1.25) }, '−');
  const zoomFit = h('button', { type: 'button', class: 'tv-zoom-btn', 'aria-label': 'Ajuster : voir tout l\'arbre', title: 'Voir tout l\'arbre', onclick: () => fitAll() },
    svgIcon('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'));
  const zoomReset = h('button', { type: 'button', class: 'tv-zoom-btn tv-zoom-level', 'aria-label': 'Revenir au zoom normal', title: 'Zoom normal', onclick: () => animateZoom(defaultZoom()) }, '100\u00a0%');

  const banner = h('div', { class: 'tv-banner', role: 'status', hidden: true });
  const swipeHint = h('div', { class: 'tv-swipe', 'aria-hidden': 'true' },
    h('span', {}, 'Glisse pour voyager dans le temps'), h('span', { class: 'tv-swipe-arrow' }, '→'));

  const header = svgEl('svg', { class: 'tv-head', height: HEAD.height, role: 'group', 'aria-label': 'Échelle du temps' });
  const svg = svgEl('svg', {
    class: 'tv-svg', role: 'group',
    'aria-label': 'Arbre de l\'évolution : le passé est à gauche, aujourd\'hui à droite.',
    'aria-describedby': `${id}-summary ${helpId}`,
  });
  const canvas = h('div', { class: 'tv-canvas' }, header, svg);
  const scroller = h('div', { class: 'tv-scroller' }, canvas);
  // Taille du cadre, mémorisée : la relire pendant un dessin forcerait un recalcul de toute la page.
  const view = { w: 0, h: 0 };
  const measureView = () => { view.w = scroller.clientWidth; view.h = scroller.clientHeight; };
  const viewW = () => view.w || scroller.clientWidth;
  const viewH = () => view.h || scroller.clientHeight;
  const frame = h('div', { class: 'tv-frame' },
    scroller,
    h('div', { class: 'tv-zoom', role: 'group', 'aria-label': 'Zoom' }, zoomIn, zoomReset, zoomOut, zoomFit),
    banner, swipeHint);

  const legend = h('div', { class: 'tv-legend' },
    h('div', { class: 'tv-legend-cats', 'aria-label': 'Couleur des branches : la famille', role: 'list' },
      ...Object.entries(CATEGORY_INFO).filter(([cat]) => data.nodes.some((n) => n.category === cat)).map(([, cat]) => h('span', {
        class: 'tv-chip', role: 'listitem', style: { '--cat': cat.color },
      }, h('span', { class: 'tv-chip-dot', 'aria-hidden': 'true' }), cat.label))),
    h('div', { class: 'tv-legend-keys' },
      h('span', {}, h('span', { class: 'tv-key-live', 'aria-hidden': 'true' }), 'vit encore aujourd\'hui'),
      h('span', {}, h('span', { class: 'tv-key-dead', 'aria-hidden': 'true' }, '†'), 'groupe disparu'),
      h('span', {}, h('span', { class: 'tv-key-ext', 'aria-hidden': 'true' }, '💥'), 'extinction de masse'),
      h('span', {}, h('span', { class: 'tv-key-more', 'aria-hidden': 'true' }, '+3'), 'groupes cachés : touche pour déplier'),
      h('span', {}, h('strong', {}, 'M'), ' = millions d\'années, ', h('strong', {}, 'Md'), ' = milliards')));

  const rootEl = h('div', { class: 'tv-root' },
    h('div', { class: 'tv-toolbar' },
      btnLineage,
      h('div', { class: 'tv-toolbar-group' }, btnExpand, btnCollapse, btnFull)),
    h('p', { class: 'tv-hint' },
      h('span', { 'aria-hidden': 'true' }, '👆 '),
      'Touche un médaillon pour lire sa fiche, le bouton ', h('span', { class: 'tv-key-more' }, '+'),
      ' pour voir ses descendants. Fais glisser l\'arbre pour te promener dans le temps.'),
    frame,
    legend,
    h('p', { class: 'tv-note' },
      h('span', { 'aria-hidden': 'true' }, '🪗 '),
      'Comme sur la ligne du temps, l\'axe est en accordéon : le Précambrien, très long, est tout serré, et la loupe agrandit les 10 derniers millions d\'années.'),
    summary, help, live);
  container.replaceChildren(rootEl);

  // ---------- Dessin fixe de l'arbre ----------
  const defs = svgEl('defs');
  const clipId = `${id}-clip`;
  defs.append(svgEl('clipPath', { id: clipId }, svgEl('circle', { r: G.r })));

  const layerBands = svgEl('g', { class: 'tv-bands', 'aria-hidden': 'true' });
  const layerLinks = svgEl('g', { class: 'tv-links', 'aria-hidden': 'true' });
  const layerFlow = svgEl('g', { class: 'tv-flow-layer', 'aria-hidden': 'true' });
  const layerNodes = svgEl('g', { class: 'tv-nodes' });
  svg.append(defs, layerBands, layerLinks, layerFlow, layerNodes);

  const periods = periodItems();
  const bandRects = periods.map((p, i) => {
    const x1 = i === 0 ? 0 : X(p.start);
    const rect = svgEl('rect', { class: `tv-band ${i % 2 ? 'is-alt' : ''}`, x: x1, width: Math.max(X(p.end) - x1, 0), y: 0, fill: p.color });
    layerBands.append(rect);
    return rect;
  });
  const vLines = [];
  const vLine = (cls, mya) => {
    const line = svgEl('line', { class: cls, x1: X(mya), x2: X(mya), y1: 0 });
    layerBands.append(line);
    vLines.push(line);
    return line;
  };
  eraItems().slice(1).forEach((era) => vLine('tv-era-sep', era.start));
  SEGMENTS.slice(1).forEach((seg) => { if (!eraItems().some((e) => Math.abs(e.start - seg.from) < 0.5)) vLine('tv-fold-seam', seg.from); });
  const extinctions = events.filter((e) => e.type === 'extinction' && isNum(e.start_mya)).sort((a, b) => b.start_mya - a.start_mya);
  extinctions.forEach((e) => vLine('tv-ext-line', e.start_mya));
  vLine('tv-today', 0);

  const flowPath = svgEl('path', { class: 'tv-flow' });
  const flowGlow = svgEl('path', { class: 'tv-flow-glow' });
  layerFlow.append(flowGlow, flowPath);

  // Éléments de chaque nœud (créés une seule fois, dans l'ordre de l'arbre).
  const preorder = [];
  const walkAll = (nid) => { preorder.push(nid); info.get(nid).kids.forEach(walkAll); };
  walkAll(root.id);
  for (const nid of preorder) buildNode(info.get(nid));

  function buildNode(it) {
    const { node } = it;
    const parent = info.get(it.parentId);
    const gradId = `${id}-g-${node.id}`;
    const fadeId = `${id}-f-${node.id}`;
    const grad = parent ? svgEl('linearGradient', { id: gradId, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 1, y1: 0, y2: 0 },
      svgEl('stop', { offset: '0', 'stop-color': parent.color }),
      svgEl('stop', { offset: '0.35', 'stop-color': parent.color }),
      svgEl('stop', { offset: '1', 'stop-color': it.color })) : null;
    const fade = svgEl('linearGradient', { id: fadeId, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 1, y1: 0, y2: 0 },
      svgEl('stop', { offset: '0', 'stop-color': it.color, 'stop-opacity': '0.85' }),
      svgEl('stop', { offset: '1', 'stop-color': it.color, 'stop-opacity': '0.1' }));
    defs.append(...[grad, fade].filter(Boolean));

    const width = branchWidth(it.leaves);
    const link = parent ? svgEl('path', { class: 'tv-link', stroke: `url(#${gradId})`, 'stroke-width': width }) : null;
    const life = svgEl('path', { class: 'tv-life' });
    const wedge = svgEl('path', { class: 'tv-wedge', fill: it.color });
    const end = svgEl('g', { class: 'tv-end' });
    const group = svgEl('g', { class: 'tv-branch', 'data-for': node.id, style: 'display:none' }, wedge, life, link, end);
    group.style.setProperty('--cat', it.color);
    layerLinks.append(group);

    // Médaillon : image ronde (ou emoji si l'image manque), anneau de la couleur de la famille.
    const extinct = node.extinct_mya != null;
    const image = node.image ? svgEl('image', {
      href: node.image, x: -G.r * 1.7, y: -G.r * 1.7, width: G.r * 3.4, height: G.r * 3.4,
      preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})`, class: 'tv-img', decoding: 'async',
    }) : null;
    image?.addEventListener('error', () => image.remove());
    const medal = svgEl('g', { class: 'tv-medal' },
      svgEl('circle', { class: 'tv-pulse', r: G.r + 4 }),
      // Ombre douce sans filtre (deux disques décalés) : bien plus rapide à dessiner.
      svgEl('circle', { class: 'tv-shadow', r: G.r + 5, cy: 2.6 }),
      svgEl('circle', { class: 'tv-shadow', r: G.r + 3.8, cy: 1.6 }),
      svgEl('circle', { class: 'tv-disc', r: G.r + 3.5 }),
      svgText('tv-emoji', node.emoji || '•', { 'font-size': G.r * 1.05, y: 1 }),
      image,
      svgEl('circle', { class: 'tv-ring', r: G.r + 1.5 }));

    const name = svgText('tv-name', shortName(node.name_fr), { 'font-size': G.name });
    const sub = svgEl('text', { class: 'tv-sub', 'font-size': G.sub },
      svgEl('tspan', { class: 'tv-age' }, ageText(node)),
      svgEl('tspan', { class: 'tv-sci' }, ` · ${node.name_sci || ''}`));
    const label = svgEl('g', { class: 'tv-label' }, name, sub);

    let toggle = null;
    let toggleText = null;
    let toggleBg = null;
    if (it.kids.length) {
      toggleBg = svgEl('rect', { class: 'tv-toggle-bg', y: -8.5, height: 17, rx: 8.5 });
      toggleText = svgText('tv-toggle-text', '');
      toggle = svgEl('g', { class: 'tv-toggle', transform: `translate(0 ${G.r + 4})`, 'aria-hidden': 'true' },
        svgEl('rect', { class: 'tv-hit', x: -16, y: -6, width: 32, height: 24, rx: 8 }), toggleBg, toggleText);
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(node.id, !open.has(node.id));
      });
    }

    const g = svgEl('g', {
      class: `tv-node ${extinct ? 'is-extinct' : ''}`, role: 'button', tabindex: '-1', style: 'display:none',
      'data-id': node.id, 'data-tip-node': node.id,
    }, svgEl('circle', { class: 'tv-focus', r: G.r + 8 }), label, medal, toggle);
    g.style.setProperty('--cat', it.color);
    layerNodes.append(g);

    it.el = { g, label, name, sub, medal, toggle, toggleText, toggleBg, link, life, wedge, end, branch: group, gradId, fadeId, grad, fade };
    it.nameW = 0;
    it.subW = 0;
    refreshBadge(it);
  }

  // ---------- Évènements sur les nœuds ----------
  layerNodes.addEventListener('click', (event) => {
    const g = event.target.closest('.tv-node');
    if (!g) return;
    current = g.dataset.id;
    updateRoving();
    openCard(g.dataset.id);
  });
  layerNodes.addEventListener('pointerover', (event) => {
    const g = event.target.closest('.tv-node');
    if (g && g.dataset.id !== tracing) trace(g.dataset.id);
  });
  layerNodes.addEventListener('pointerout', (event) => {
    const g = event.target.closest('.tv-node');
    if (g && !g.contains(event.relatedTarget)) trace(null);
  });
  // (Écouteurs de focus sur le cadre HTML : sur un <g>, Chromium le rendrait focalisable.)
  scroller.addEventListener('focusin', (event) => {
    const g = event.target.closest?.('.tv-node');
    if (!g) return;
    current = g.dataset.id;
    updateRoving();
    trace(g.dataset.id);
    if (g.matches(':focus-visible')) ensureVisible(g.dataset.id);
  });
  scroller.addEventListener('focusout', (event) => { if (event.target.closest?.('.tv-node')) trace(null); });
  layerNodes.addEventListener('keydown', onKey);

  // ---------- Mise en page ----------
  function measureAll() {
    const title = cssVar('--font-title') || 'sans-serif';
    const body = getComputedStyle(document.body).fontFamily || 'sans-serif';
    for (const it of info.values()) {
      it.nameW = measure(shortName(it.node.name_fr), `600 ${G.name}px ${title}`);
      const sci = level === 'adultes' && it.node.name_sci ? ` · ${it.node.name_sci}` : '';
      it.subW = measure(ageText(it.node), `700 ${G.sub}px ${body}`) + (sci ? measure(sci, `italic 700 ${G.sub}px ${body}`) : 0);
    }
  }

  function layout() {
    const visible = [];
    let row = 0;
    const walk = (nid) => {
      const it = info.get(nid);
      visible.push(it);
      const kids = open.has(nid) ? it.kids : [];
      if (!kids.length) { it.row = row; row += 1; return; }
      kids.forEach(walk);
      it.row = (info.get(kids[0]).row + info.get(kids[kids.length - 1]).row) / 2;
    };
    walk(root.id);

    // Position : x = date d'apparition, y = rangée. On décale à peine un médaillon vers la
    // droite s'il toucherait celui de son parent (même date, rangées proches) ou son bouton +/−.
    const discs = (it, x, y) => (it.kids.length
      ? [[y, G.r + 4], [y + G.r + 4, 11]]
      : [[y, G.r + 4]]).map(([cy, r]) => ({ x, y: cy, r }));
    const placed = [];
    for (const it of visible) {
      const parent = info.get(it.parentId);
      const y = G.padTop + it.row * G.row + G.row / 2;
      let x = X(it.node.appeared_mya);
      if (parent) x = Math.max(x, parent.to.x);
      for (let pass = 0; pass < 6; pass += 1) {
        let moved = false;
        for (const other of placed) {
          if (Math.abs(y - other.to.y) > 3 * G.r) continue;
          for (const a of discs(it, x, y)) {
            for (const b of discs(other, other.to.x, other.to.y)) {
              const need = a.r + b.r + 1;
              const dy = Math.abs(a.y - b.y);
              if (dy >= need) continue;
              const dx = Math.sqrt(need * need - dy * dy);
              if (Math.abs(a.x - b.x) < dx) { x += b.x + dx - a.x; moved = true; }
            }
          }
        }
        if (!moved) break;
      }
      it.to = { x, y };
      it.mode = !it.kids.length ? 'leaf' : (open.has(it.id) ? 'open' : 'closed');
      placed.push(it);
    }
    H = G.padTop + row * G.row + G.padBottom;
    placeLabels(visible);
    return visible;
  }

  // Les segments (branches, lignes de vie) que les textes doivent éviter.
  function obstacles(visible) {
    const boxes = [];
    const lines = [];
    for (const it of visible) {
      const { x, y } = it.to;
      const r = G.r + 4;
      boxes.push({ id: it.id, x1: x - r, y1: y - r, x2: x + r, y2: y + r });
      if (it.kids.length) {
        const w = toggleWidth(it) / 2 + 2;
        boxes.push({ id: it.id, x1: x - w, y1: y + G.r - 6, x2: x + w, y2: y + G.r + 14 });
      }
      const parent = info.get(it.parentId);
      if (parent) {
        if (Math.abs(parent.to.y - y) > 0.5) lines.push({ id: it.id, own: 'v', x1: parent.to.x, x2: parent.to.x, y1: Math.min(parent.to.y, y), y2: Math.max(parent.to.y, y) });
        if (x - parent.to.x > 1) lines.push({ id: it.id, own: 'in', x1: parent.to.x, x2: x, y1: y, y2: y });
      }
      if (it.mode !== 'open') lines.push({ id: it.id, own: 'life', x1: x, x2: lifeEnd(it), y1: y, y2: y });
    }
    return { boxes, lines };
  }

  function placeLabels(visible) {
    const { boxes, lines } = obstacles(visible);
    const labels = [];
    // À droite, le dessin peut s'élargir pour qu'une longue étiquette tienne (après « aujourd'hui »).
    const W = scale.W + 400;
    // Les feuilles d'abord (leur place le long de la branche est presque toujours libre),
    // puis les groupes internes, des plus profonds aux plus anciens.
    const order = [...visible].sort((a, b) => (a.mode === 'open') - (b.mode === 'open') || b.depth - a.depth);
    for (const it of order) {
      const { x, y } = it.to;
      let best = null;
      for (const cand of candidates(it)) {
        // Une étiquette centrée qui sortirait du dessin glisse vers l'intérieur.
        let shift = 0;
        if (cand.slide) {
          if (x + cand.box[0] < 4) shift = 4 - (x + cand.box[0]);
          else if (x + cand.box[2] > W - 4) shift = W - 4 - (x + cand.box[2]);
        }
        const box = { x1: x + cand.box[0] + shift, y1: y + cand.box[1], x2: x + cand.box[2] + shift, y2: y + cand.box[3] };
        let cost = cand.pref + Math.abs(shift) * 0.2;
        if (box.x1 < 2 || box.x2 > W - 2 || box.y1 < 2) cost += 5000;
        for (const b of boxes) if (b.id !== it.id || cand.selfHit) cost += overlap(box, b) * 4;
        for (const l of labels) cost += overlap(box, l) * 6;
        for (const l of lines) {
          if (l.id === it.id && cand.ignore.includes(l.own)) continue;
          if (segmentHits(l, box)) cost += l.y1 === l.y2 ? 30 : 22;
        }
        if (!best || cost < best.cost) best = { ...cand, cost, shift, abs: box };
        if (cost === 0) break;
      }
      labels.push(best.abs);
      it.labTo = { nx: best.nx + best.shift, ny: best.ny, sx: best.sx + best.shift, sy: best.sy };
    }
    canvasW = Math.max(scale.W, ...labels.map((l) => l.x2 + 24));
  }

  // Emplacements possibles d'une étiquette (relatifs au centre du médaillon).
  function candidates(it) {
    const r = G.r;
    const nw = it.nameW;
    const sw = it.subW;
    const w = Math.max(nw, sw);
    const asc = G.name * 0.78;
    const out = [];
    const add = (pref, nx, ny, sx, sy, ignore = [], selfHit = false, slide = false) => {
      const x1 = Math.min(nx, sx) - 3;
      const x2 = Math.max(nx + nw, sx + sw) + 3;
      out.push({ pref, nx, ny, sx, sy, ignore, selfHit, slide, box: [x1, ny - asc - 2, x2, sy + 4] });
    };
    const gx = r + G.gap;
    // 1. À droite, à cheval sur la branche : le nom au-dessus, l'âge en dessous.
    add(0, gx, -6, gx, 16, ['life']);
    // 2. À gauche, le long de la branche qui arrive.
    add(14, -gx - nw, -6, -gx - sw, 16, ['in']);
    // 3. Au-dessus du médaillon : centré, ou aligné sur un de ses bords.
    const top = -r - 21;
    add(20, -nw / 2, top, -sw / 2, top + 13, [], true, true);
    add(22, -r + 2, top, -r + 2, top + 13, [], true);
    add(23, r - 2 - nw, top, r - 2 - sw, top + 13, [], true);
    // 4. En haut à droite, au-dessus de la branche.
    add(24, gx - 2, -r - 8, gx - 2, -8, ['life']);
    // 5. En bas à droite, sous la branche.
    add(26, gx - 2, 24, gx - 2, 38, ['life']);
    // 6. Au-dessous (après le bouton +/−) : centré, ou aligné sur un bord.
    const below = it.kids.length ? r + 32 : r + 18;
    add(30, -nw / 2, below, -sw / 2, below + 14, [], true, true);
    add(32, -r + 2, below, -r + 2, below + 14, [], true);
    add(33, r - 2 - nw, below, r - 2 - sw, below + 14, [], true);
    // 7. À gauche, au-dessus de la branche qui arrive.
    add(34, -gx - w, -r - 8, -gx - w, -8, ['in']);
    return out;
  }

  // ---------- Dessin (et animation) ----------
  function lifeEnd(it) {
    if (it.mode === 'leaf') return X(it.node.extinct_mya ?? 0);
    return X(it.cladeEnd);
  }

  function render(animate = true) {
    const visible = layout();
    const visibleIds = new Set(visible.map((it) => it.id));
    const duration = animate && !prefersReducedMotion() ? DURATION : 0;

    // Point de départ : la position actuelle ; les nouveaux venus sortent de leur ancêtre visible.
    for (const it of info.values()) {
      const willShow = visibleIds.has(it.id);
      if (willShow && !it.shown) {
        const anc = nearestShownAncestor(it);
        const start = anc?.cur || it.to;
        it.from = { x: start.x, y: start.y };
        it.labFrom = it.labTo;
        it.entering = true;
      } else if (it.shown) {
        it.from = { ...it.cur };
        it.labFrom = it.lab || it.labTo;
        it.entering = false;
      }
      if (!willShow && it.shown) {
        const anc = nearestVisibleAncestor(it, visibleIds);
        it.to = { x: anc.to.x, y: anc.to.y };
        it.labTo = it.lab;
        it.leaving = true;
      } else it.leaving = false;
    }

    setCanvasSize(Math.max(H, svgHeight()));
    for (const it of info.values()) {
      const willShow = visibleIds.has(it.id);
      const { g, branch } = it.el;
      if (willShow) {
        g.style.display = '';
        branch.style.display = '';
        if (!it.shown && duration) {
          g.classList.add('is-hidden');
          branch.classList.add('is-hidden');
          // Laisse le navigateur peindre l'état caché avant le fondu.
          requestAnimationFrame(() => requestAnimationFrame(() => { g.classList.remove('is-hidden'); branch.classList.remove('is-hidden'); }));
        } else if (!it.leaving) {
          g.classList.remove('is-hidden');
          branch.classList.remove('is-hidden');
        }
        it.shown = true;
        updateNodeState(it);
      } else if (it.shown) {
        g.classList.add('is-hidden');
        branch.classList.add('is-hidden');
      }
    }

    cancelAnimationFrame(animFrame);
    const t0 = performance.now();
    const step = (now) => {
      const t = duration ? Math.min(1, (now - t0) / duration) : 1;
      drawFrame(ease(t));
      if (t < 1) { animFrame = requestAnimationFrame(step); return; }
      for (const it of info.values()) {
        if (it.leaving) {
          it.shown = false;
          it.leaving = false;
          it.el.g.style.display = 'none';
          it.el.branch.style.display = 'none';
        }
      }
      setCanvasSize(H);
      updateFlow();
      if (Math.abs(headW - canvasW) > 0.5) renderHeader();
    };
    flowPath.classList.add('is-moving');
    flowGlow.classList.add('is-moving');
    if (duration) animFrame = requestAnimationFrame(step); else step(t0);
    updateRoving();
    updateSummary(visible);
  }

  function nearestShownAncestor(it) {
    let p = info.get(it.parentId);
    while (p && !p.shown) p = info.get(p.parentId);
    return p;
  }
  function nearestVisibleAncestor(it, visibleIds) {
    let p = info.get(it.parentId);
    while (p && !visibleIds.has(p.id)) p = info.get(p.parentId);
    return p || info.get(root.id);
  }

  function drawFrame(t) {
    for (const it of info.values()) {
      if (!it.shown) continue;
      const from = it.from || it.to;
      it.cur = { x: lerp(from.x, it.to.x, t), y: lerp(from.y, it.to.y, t) };
      const a = it.labFrom || it.labTo;
      const b = it.labTo;
      it.lab = { nx: lerp(a.nx, b.nx, t), ny: lerp(a.ny, b.ny, t), sx: lerp(a.sx, b.sx, t), sy: lerp(a.sy, b.sy, t) };
    }
    for (const it of info.values()) {
      if (!it.shown) continue;
      const { x, y } = it.cur;
      const { g, name, sub, link, grad } = it.el;
      g.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
      name.setAttribute('x', r1(it.lab.nx)); name.setAttribute('y', r1(it.lab.ny));
      sub.setAttribute('x', r1(it.lab.sx)); sub.setAttribute('y', r1(it.lab.sy));
      const parent = info.get(it.parentId);
      if (link && parent?.cur) {
        const p = parent.cur;
        link.setAttribute('d', elbow(p.x, p.y, x, y));
        grad.setAttribute('x1', r1(p.x));
        grad.setAttribute('x2', r1(Math.max(x, p.x + 1)));
      }
      drawLife(it);
    }
  }

  // Ligne de vie : jusqu'à aujourd'hui (trait fin) ou jusqu'à la disparition (trait qui s'estompe + †).
  // Un groupe replié montre un éventail léger : ses descendants cachés.
  function drawLife(it) {
    const { x, y } = it.cur;
    const { life, wedge, end, fade } = it.el;
    const mode = it.leaving ? (it.lastMode || it.mode) : it.mode;
    it.lastMode = mode;
    if (mode === 'open') {
      life.setAttribute('d', '');
      wedge.setAttribute('d', '');
      end.replaceChildren();
      return;
    }
    const x0 = x + G.r + 2;
    const xe = Math.max(lifeEnd(it), x0);
    // Fin de branche « disparue » : un groupe éteint, ou un groupe replié dont tous les descendants ont disparu.
    const extinctLeaf = mode === 'leaf' ? it.node.extinct_mya != null : !it.living;
    life.setAttribute('d', xe > x0 + 0.5 ? `M${r1(x0)} ${r1(y)}H${r1(xe)}` : '');
    life.setAttribute('stroke', extinctLeaf ? `url(#${it.el.fadeId})` : it.color);
    life.classList.toggle('is-dead', extinctLeaf);
    if (extinctLeaf) { fade.setAttribute('x1', r1(x0)); fade.setAttribute('x2', r1(Math.max(xe, x0 + 1))); }
    if (mode === 'closed') {
      const spread = Math.min(G.row * 0.3, 5 + 2.2 * Math.sqrt(it.leaves));
      const len = xe - x0;
      wedge.setAttribute('d', len > 4
        ? `M${r1(x0)} ${r1(y - 2)}L${r1(xe)} ${r1(y - spread)}Q${r1(xe + spread * 0.6)} ${r1(y)} ${r1(xe)} ${r1(y + spread)}L${r1(x0)} ${r1(y + 2)}Z`
        : '');
    } else wedge.setAttribute('d', '');
    // Bout de la branche : un petit point (vivant) ou une croix † (disparu).
    const key = extinctLeaf ? 'dead' : 'live';
    if (end.dataset.key !== key) {
      end.dataset.key = key;
      if (key === 'dead') end.replaceChildren(svgEl('circle', { class: 'tv-dagger-disc', r: 7.5 }), svgText('tv-dagger', '†', { y: 0.5 }));
      else if (key === 'live') end.replaceChildren(svgEl('circle', { class: 'tv-end-dot', r: 3, fill: it.color }));
      else end.replaceChildren();
    }
    // Si la ligne est trop courte (la croix tomberait sur le texte), la croix va sur le médaillon.
    const lab = it.labTo || it.lab;
    const textEnd = lab && lab.nx > 0 ? x + Math.max(lab.nx + it.nameW, lab.sx + it.subW) + 6 : x0;
    const short = key === 'dead' && (xe - x0 < 10 || (lab && lab.nx > 0 && lab.ny < 0 && lab.sy > 0 && xe + 12 < textEnd));
    const ex = short ? x - G.r * 0.8 : xe + (key === 'dead' ? 6 : 0);
    const ey = short ? y - G.r * 0.8 : y;
    end.setAttribute('transform', `translate(${r1(ex)} ${r1(ey)})`);
    end.classList.toggle('is-badge', short);
  }

  function updateNodeState(it) {
    const { g, toggle, toggleText, toggleBg } = it.el;
    const isOpen = open.has(it.id);
    if (toggle) {
      const label = isOpen ? '−' : `+${it.desc}`;
      toggleText.textContent = label;
      const w = toggleWidth(it);
      toggleBg.setAttribute('x', -w / 2);
      toggleBg.setAttribute('width', w);
      const hit = toggle.querySelector('.tv-hit');
      hit.setAttribute('x', -Math.max(w / 2 + 7, 16));
      hit.setAttribute('width', Math.max(w + 14, 32));
      toggle.classList.toggle('is-closed', !isOpen);
      g.classList.toggle('is-closed', !isOpen);
    }
    g.setAttribute('aria-label', nodeLabel(it));
  }

  function toggleWidth(it) {
    return open.has(it.id) ? 17 : 15 + String(it.desc).length * 7.5;
  }

  function nodeLabel(it) {
    const { node } = it;
    it.ariaBase ??= `${node.name_fr}, apparu ${formatAgo(node.appeared_mya)}${node.extinct_mya != null ? `, disparu ${formatAgo(node.extinct_mya)}` : ', vit encore aujourd\'hui'}`;
    let text = it.ariaBase;
    if (it.kids.length) {
      text += open.has(it.id)
        ? `. ${it.kids.length} branche${it.kids.length > 1 ? 's' : ''} affichée${it.kids.length > 1 ? 's' : ''}`
        : `. ${it.desc} groupe${it.desc > 1 ? 's' : ''} caché${it.desc > 1 ? 's' : ''}, touche plus pour déplier`;
    }
    if (validation?.byNode?.get(node.id)?.length) text += '. Attention : problème dans les données';
    return text;
  }

  function refreshBadge(it) {
    const problems = validation?.byNode?.get(it.id);
    const { medal } = it.el;
    medal.querySelector('.tv-invalid')?.remove();
    if (problems?.length) {
      const badge = svgEl('g', { class: 'tv-invalid', transform: `translate(${G.r * 0.78} ${-G.r * 0.78})` },
        svgEl('circle', { r: 7.5 }), svgText('tv-invalid-text', '!'),
        svgEl('title', {}, `Problème dans les données : ${problems.join(' ; ')}`));
      medal.append(badge);
    }
    it.el.g.setAttribute('aria-label', nodeLabel(it));
  }

  // ---------- Bandeau du temps (redessiné à chaque zoom) ----------
  function renderHeader() {
    const z = zoom;
    const W = canvasW * z;
    const px = (mya) => X(mya) * z;
    header.setAttribute('width', r1(W));
    header.setAttribute('viewBox', `0 0 ${r1(W)} ${HEAD.height}`);
    const parts = [svgEl('rect', { class: 'tv-head-bg', x: 0, y: 0, width: W, height: HEAD.height })];
    eraLabels = [];
    headW = canvasW;
    const body = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const title = cssVar('--font-title') || body;

    // Rangée 1 : les ères (le Précambrien regroupe les éons les plus anciens).
    const [ey, eh] = HEAD.era;
    const loupe = SEGMENTS.find((s) => s.loupe);
    for (const era of eraItems()) {
      const x1 = px(era.start);
      const x2 = px(era.end);
      parts.push(svgEl('rect', { class: 'tv-era', x: r1(x1 + 1), y: ey, width: Math.max(r1(x2 - x1 - 2), 0), height: eh, rx: eh / 2, fill: era.color }));
      // Le nom va dans le plus grand morceau d'accordéon de l'ère (pas sur la loupe).
      const pieces = SEGMENTS.filter((s) => s.from > era.end && s.to < era.start && !s.loupe)
        .map((s) => [px(Math.min(s.from, era.start)), px(Math.max(s.to, era.end))]);
      const [a, b] = pieces.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0] || [x1, x2];
      const label = fit(era.name, b - a - 16, `700 13px ${title}`);
      if (label) {
        const text = svgText('tv-era-name', label, { x: r1((a + b) / 2), y: ey + eh / 2 + 1 });
        // Le nom glisse dans la partie visible de sa bande, sans jamais entrer dans la loupe.
        const end = loupe && era.start > loupe.from && era.end < loupe.from ? px(loupe.from) : x2;
        eraLabels.push({ text, a: x1, b: end, w: measure(label, `700 13px ${title}`), home: (a + b) / 2 });
        parts.push(text);
      }
    }
    // La loupe des 10 derniers millions d'années.
    if (loupe) {
      const a = px(loupe.from) + 4;
      const b = px(loupe.to) - 2;
      const text = fit('🔍 Loupe : les 10 derniers millions d\'années', b - a - 14, `700 12px ${title}`)
        || fit('🔍 Loupe : 10 derniers M', b - a - 14, `700 12px ${title}`) || fit('🔍', b - a, `700 12px ${title}`);
      if (b - a > 20) {
        parts.push(svgEl('rect', { class: 'tv-loupe', x: r1(a), y: ey + 2, width: r1(b - a), height: eh - 4, rx: (eh - 4) / 2 }));
        if (text) {
          const label = svgText('tv-loupe-name', text, { x: r1((a + b) / 2), y: ey + eh / 2 + 1 });
          const short = '🔍 Loupe';
          eraLabels.push({
            text: label, a: a - 6, b: b + 6, w: measure(text, `700 12px ${title}`), home: (a + b) / 2,
            full: text, short, shortW: measure(short, `700 12px ${title}`),
          });
          parts.push(label);
        }
      }
    }

    // Rangée 2 : périodes (et éons pour le Précambrien).
    const [py, ph] = HEAD.period;
    for (const p of periods) {
      const x1 = px(p.start);
      const x2 = px(p.end);
      if (x2 - x1 < 2) continue;
      parts.push(svgEl('rect', { class: 'tv-period', x: r1(x1 + 0.5), y: py, width: r1(x2 - x1 - 1), height: ph, rx: 4, fill: p.color }));
      const label = fit(p.name, x2 - x1 - 8, `700 11px ${body}`);
      if (label) {
        const text = svgText('tv-period-name', label, { x: r1((x1 + x2) / 2), y: py + ph / 2 + 0.5 });
        eraLabels.push({ text, a: x1 - 4, b: x2 + 4, w: measure(label, `700 11px ${body}`), home: (x1 + x2) / 2 });
        parts.push(text);
      }
    }

    // Rangée 3 : graduations, plis de l'accordéon, extinctions et « aujourd'hui ».
    const axisY = HEAD.height - 3;
    parts.push(svgEl('line', { class: 'tv-axis', x1: px(SEGMENTS[0].from), x2: px(0), y1: axisY, y2: axisY }));
    const taken = [];
    const free = (a, b) => taken.every(([l, r]) => b + 6 <= l || a >= r + 6);
    const marks = [];
    // Les extinctions d'abord : elles réservent leur place.
    for (const e of extinctions) {
      const x = px(e.start_mya);
      taken.push([x - 12, x + 12]);
      const mark = svgEl('g', {
        class: 'tv-ext-mark', transform: `translate(${r1(x)} ${axisY - 14})`, tabindex: '0', role: 'img',
        'data-tip-event': e.id, 'aria-label': `Extinction de masse : ${e.name_fr}, ${formatAgo(e.start_mya)}`,
      }, svgEl('circle', { r: 11 }), svgText('tv-ext-emoji', '💥', { y: 1 }));
      marks.push(mark);
    }
    // « Aujourd'hui ».
    const todayX = px(0);
    const todayW = measure('Aujourd\'hui', `800 12px ${body}`);
    taken.push([todayX - todayW / 2, todayX + todayW / 2]);
    parts.push(svgEl('line', { class: 'tv-tick is-major', x1: r1(todayX), x2: r1(todayX), y1: axisY - 5, y2: axisY }));
    parts.push(svgText('tv-today-name', 'Aujourd\'hui', { x: r1(todayX), y: axisY - 13 }));
    // Graduations : les débuts de morceaux, puis des pas « ronds ».
    for (const tick of ticks(z)) {
      const x = px(tick.mya);
      const text = formatShort(tick.mya);
      const w = measure(text, `700 11px ${body}`);
      parts.push(svgEl('line', { class: `tv-tick ${tick.major ? 'is-major' : ''}`, x1: r1(x), x2: r1(x), y1: axisY - (tick.major ? 6 : 4), y2: axisY }));
      if (free(x - w / 2, x + w / 2)) {
        taken.push([x - w / 2, x + w / 2]);
        parts.push(svgText(`tv-tick-label ${tick.major ? 'is-major' : ''}`, text, { x: r1(x), y: axisY - 13 }));
      }
    }
    // Plis de l'accordéon entre deux morceaux.
    SEGMENTS.slice(1).forEach((seg) => {
      const x = px(seg.from);
      parts.push(svgEl('path', {
        class: 'tv-fold', d: `M${r1(x)} ${axisY - 10}l3 2.5l-6 5l3 2.5`,
      }, svgEl('title', {}, 'Pli de l\'accordéon : l\'échelle du temps change ici')));
    });
    // Seuls les repères d'extinction sont lus par les lecteurs d'écran (le reste est décoratif).
    header.replaceChildren(svgEl('g', { 'aria-hidden': 'true' }, ...parts), ...marks);
    placeEraLabels();
  }

  // Le nom d'une ère (ou d'une période) reste visible quand on fait défiler : il se centre dans la partie visible de sa bande.
  let eraLabels = [];
  let headW = 0;
  function placeEraLabels() {
    // Partie visible du bandeau, dans ses propres coordonnées (le dessin peut être centré quand il est petit).
    const offset = header.getBoundingClientRect().left - scroller.getBoundingClientRect().left - scroller.clientLeft;
    const lo = -offset + 10;
    const hi = -offset + viewW() - 10;
    for (const era of eraLabels) {
      const a = Math.max(era.a + 8, lo);
      const b = Math.min(era.b - 8, hi);
      // Si la place visible est trop petite, la loupe prend son nom court.
      const useShort = era.short && b - a < era.w + 4;
      const w = useShort ? era.shortW : era.w;
      if (era.short) era.text.textContent = useShort ? era.short : era.full;
      let x = era.home;
      if ((x - w / 2 < a || x + w / 2 > b) && b - a >= w + 4) x = clamp(x, a + w / 2, b - w / 2);
      era.text.setAttribute('x', r1(x));
    }
  }
  let eraTick = false;
  scroller.addEventListener('scroll', () => {
    if (scroller.scrollLeft > 40 || scroller.scrollTop > 40) swipeHint.classList.add('is-gone');
    if (eraTick) return;
    eraTick = true;
    requestAnimationFrame(() => { eraTick = false; placeEraLabels(); });
  }, { passive: true });

  // ---------- Taille, zoom et défilement ----------
  function svgHeight() { return Number(svg.dataset.h || 0); }

  function setCanvasSize(contentHeight) {
    svg.dataset.h = contentHeight;
    // Le fond (périodes) remplit toujours le cadre, même quand l'arbre est court.
    const height = Math.max(contentHeight, zoom ? (viewH() - HEAD.height) / zoom : 0);
    const W = canvasW;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    svg.setAttribute('width', r1(W * zoom));
    svg.setAttribute('height', r1(height * zoom));
    canvas.style.width = `${r1(W * zoom)}px`;
    for (const rect of bandRects) rect.setAttribute('height', height);
    for (const line of vLines) line.setAttribute('y2', height);
  }

  function setZoom(next, anchor) {
    const z = clamp(next, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(z - zoom) < 0.0005) return;
    const rect = scroller.getBoundingClientRect();
    const ax = anchor ? anchor.x - rect.left : viewW() / 2;
    const ay = anchor ? anchor.y - rect.top : viewH() / 2;
    const old = zoom || z;
    // Quand le dessin est plus étroit que le cadre, il est centré : on en tient compte.
    const margin = (k) => Math.max(0, (viewW() - canvasW * k) / 2);
    const cx = (scroller.scrollLeft + ax - margin(old)) / old;
    const cy = (scroller.scrollTop + Math.max(ay - HEAD.height, 0)) / old;
    zoom = z;
    setCanvasSize(svgHeight() || H);
    renderHeader();
    scroller.scrollLeft = cx * zoom - ax + margin(zoom);
    scroller.scrollTop = cy * zoom - Math.max(ay - HEAD.height, 0);
    zoomReset.textContent = `${Math.round(zoom * 100)}\u00a0%`;
    zoomIn.disabled = zoom >= ZOOM_MAX - 0.001;
    zoomOut.disabled = zoom <= ZOOM_MIN + 0.001;
  }

  let zoomAnim = 0;
  function animateZoom(target, anchor) {
    userZoomed = true;
    cancelAnimationFrame(zoomAnim);
    const start = zoom;
    const end = clamp(target, ZOOM_MIN, ZOOM_MAX);
    if (prefersReducedMotion()) { setZoom(end, anchor); return Promise.resolve(); }
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 280);
        setZoom(start * (end / start) ** ease(t), anchor);
        if (t < 1) zoomAnim = requestAnimationFrame(step); else resolve();
      };
      zoomAnim = requestAnimationFrame(step);
    });
  }

  const zoomBy = (factor) => animateZoom(zoom * factor);

  function fitZoom() {
    const w = viewW() - 8;
    const hgt = viewH() - HEAD.height - 8;
    return clamp(Math.min(w / canvasW, hgt / H), ZOOM_MIN, 1);
  }

  async function fitAll() {
    await animateZoom(fitZoom());
    scrollToBox(0, 0, canvasW, H, true);
  }

  function defaultZoom() {
    const w = viewW() || container.clientWidth || 1000;
    if (w < 480) return 0.86;
    if (w < 800) return 0.92;
    return 1;
  }

  // Fait défiler pour montrer une zone (unités de dessin).
  function scrollToBox(x1, y1, x2, y2, center = false) {
    const z = zoom;
    const vw = viewW();
    const vh = viewH() - HEAD.height;
    let left = scroller.scrollLeft;
    let top = scroller.scrollTop;
    const margin = 30;
    if (center) {
      left = ((x1 + x2) / 2) * z - vw / 2;
      top = ((y1 + y2) / 2) * z - vh / 2;
    } else {
      if (x1 * z < left + margin) left = x1 * z - margin;
      else if (x2 * z > left + vw - margin) left = Math.min(x1 * z - margin, x2 * z - vw + margin);
      if (y1 * z < top + margin) top = y1 * z - margin;
      else if (y2 * z > top + vh - margin) top = y2 * z - vh + margin;
    }
    scroller.scrollTo({ left: Math.max(left, 0), top: Math.max(top, 0), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function ensureVisible(nid, center = false) {
    const it = info.get(nid);
    if (!it?.to) return;
    const { x, y } = it.to;
    const lab = it.labTo || { nx: 0, sx: 0 };
    const right = Math.max(x + G.r, x + lab.nx + it.nameW, x + lab.sx + it.subW);
    const left = Math.min(x - G.r, x + lab.nx, x + lab.sx);
    scrollToBox(left - 10, y - G.r - 24, right + 10, y + G.r + 24, center);
  }

  // Ctrl + molette (ou pincer sur un pavé tactile) : zoom autour du pointeur.
  scroller.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    userZoomed = true;
    setZoom(zoom * Math.exp(-event.deltaY * 0.0022), { x: event.clientX, y: event.clientY });
  }, { passive: false });

  // Glisser à la souris pour se déplacer (au doigt, le défilement natif suffit).
  let drag = null;
  let dragged = false;
  scroller.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target.closest('.tv-ext-mark')) return;
    drag = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false, pointer: event.pointerId };
    dragged = false;
  });
  scroller.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      scroller.setPointerCapture(event.pointerId);
      scroller.classList.add('is-dragging');
      trace(null);
    }
    if (drag.moved) {
      scroller.scrollLeft = drag.left - dx;
      scroller.scrollTop = drag.top - dy;
    }
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      dragged = true;
      scroller.releasePointerCapture?.(drag.pointer);
      setTimeout(() => { dragged = false; }, 0);
    }
    drag = null;
    scroller.classList.remove('is-dragging');
  };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('lostpointercapture', endDrag);
  // Un glissé ne doit pas ouvrir de fiche.
  scroller.addEventListener('click', (event) => {
    if (dragged) { event.stopPropagation(); event.preventDefault(); dragged = false; }
  }, true);

  // Pincer à deux doigts sur écran tactile.
  let pinch = null;
  scroller.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
    }
  }, { passive: true });
  scroller.addEventListener('touchmove', (event) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    userZoomed = true;
    setZoom(pinch.zoom * (dist / pinch.dist), { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
  }, { passive: false });
  scroller.addEventListener('touchend', (event) => { if (event.touches.length < 2) pinch = null; }, { passive: true });

  // ---------- Repli / dépli ----------
  function setOpen(nid, value, { focus = false, silent = false } = {}) {
    const it = info.get(nid);
    if (!it?.kids.length || open.has(nid) === value) return;
    if (value) open.add(nid); else open.delete(nid);
    // Si le nœud actif disparaît, le focus revient sur le groupe replié.
    if (!value && isHiddenBy(current, nid)) current = nid;
    render();
    if (focus) focusNode(current);
    if (!silent) announce(value ? `${it.node.name_fr} : ${it.kids.length} branche${it.kids.length > 1 ? 's' : ''} dépliée${it.kids.length > 1 ? 's' : ''}.` : `${it.node.name_fr} replié.`);
    if (value) setTimeout(() => ensureVisibleClade(nid), prefersReducedMotion() ? 0 : DURATION * 0.6);
  }

  // Après un dépli, montre le groupe et ses enfants s'ils sont hors du cadre.
  function ensureVisibleClade(nid) {
    const it = info.get(nid);
    const kids = it.kids.map((k) => info.get(k));
    const xs = [it.to.x - G.r, ...kids.map((k) => k.to.x + G.r)];
    const ys = [it.to.y, ...kids.map((k) => k.to.y)];
    const box = [Math.min(...xs), Math.min(...ys) - G.r - 20, Math.max(...xs) + 60, Math.max(...ys) + G.r + 24];
    const vw = viewW() / zoom;
    if (box[2] - box[0] > vw) box[2] = box[0] + vw - 40;
    scrollToBox(...box);
  }

  function isHiddenBy(nid, collapsedId) {
    let p = info.get(nid)?.parentId;
    while (p) { if (p === collapsedId) return true; p = info.get(p).parentId; }
    return false;
  }

  function openPath(nid) {
    for (const n of ancestors(index, nid).slice(0, -1)) open.add(n.id);
  }

  // ---------- Lignée : survol et « Montre ma lignée » ----------
  function lineageIds(nid) {
    return new Set(ancestors(index, nid).map((n) => n.id));
  }

  function applyLineage(ids, cls) {
    svg.classList.toggle(cls, !!ids);
    for (const it of info.values()) {
      const on = !!ids?.has(it.id);
      it.el.g.classList.toggle(`${cls}-on`, on);
      it.el.branch.classList.toggle(`${cls}-on`, on);
    }
  }

  function trace(nid) {
    tracing = nid;
    applyLineage(nid ? lineageIds(nid) : null, 'is-tracing');
  }

  function updateFlow() {
    flowPath.classList.remove('is-moving');
    flowGlow.classList.remove('is-moving');
    if (!pinned || !info.get(pinned)?.shown) { flowPath.setAttribute('d', ''); flowGlow.setAttribute('d', ''); return; }
    const line = ancestors(index, pinned).map((n) => info.get(n.id));
    let d = `M${r1(line[0].to.x)} ${r1(line[0].to.y)}`;
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1].to;
      const c = line[i].to;
      d += elbow(p.x, p.y, c.x, c.y).replace(/^M[^A-Za-z]+/, '');
    }
    flowPath.setAttribute('d', d);
    flowGlow.setAttribute('d', d);
  }

  function setPinned(nid) {
    stopJourney();
    pinned = nid && info.has(nid) ? nid : null;
    applyLineage(pinned ? lineageIds(pinned) : null, 'is-pinned');
    btnLineage.setAttribute('aria-pressed', String(pinned === HUMAN_ID));
    btnLineage.classList.toggle('is-active', pinned === HUMAN_ID);
    updateFlow();
    if (!pinned) { banner.hidden = true; return; }
    const line = ancestors(index, pinned);
    const target = info.get(pinned).node;
    const isHuman = pinned === HUMAN_ID;
    banner.replaceChildren(
      h('span', { class: 'tv-banner-emoji', 'aria-hidden': 'true' }, isHuman ? '🧑' : (target.emoji || '🌳')),
      h('p', {},
        h('strong', {}, isHuman ? 'Ta lignée ! ' : `Lignée : ${shortName(target.name_fr)}. `),
        isHuman
          ? `${line.length - 1} étapes, de la première cellule jusqu'à toi.`
          : `${line.length - 1} étapes depuis la première cellule.`),
      h('div', { class: 'tv-banner-actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => startJourney() },
          h('span', { 'aria-hidden': 'true' }, '▶'), ' Le voyage'),
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'aria-label': 'Vue d\'ensemble de la lignée', onclick: () => showLineageOverview() },
          h('span', { 'aria-hidden': 'true' }, '🔭'), h('span', { class: 'tv-long' }, ' Vue d\'ensemble')),
        h('button', { type: 'button', class: 'tv-banner-close', 'aria-label': 'Arrêter de montrer la lignée', onclick: () => setPinned(null) }, '✕')));
    banner.hidden = false;
  }

  // ---------- Le voyage : la caméra suit la lignée, de la première cellule jusqu'au groupe choisi ----------
  let journey = null;

  function stopJourney() {
    if (!journey) return;
    cancelAnimationFrame(journey.frame);
    journey.caption.remove();
    journey = null;
    frame.classList.remove('is-touring');
    if (pinned) banner.hidden = false;
  }

  async function startJourney() {
    if (!pinned) return;
    stopJourney();
    const line = ancestors(index, pinned).map((n) => info.get(n.id));
    if (prefersReducedMotion()) { showLineageOverview(); return; }
    await animateZoom(Math.max(Math.min(zoom, 1), defaultZoom() * 0.85));
    // Étapes : chaque branche de la lignée (descente puis traversée), avec une petite pause à chaque ancêtre.
    const steps = [];
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1].to;
      const c = line[i].to;
      const length = Math.abs(c.y - p.y) + Math.abs(c.x - p.x);
      steps.push({ from: p, corner: { x: p.x, y: c.y }, to: c, node: line[i], duration: 420 + length * zoom * 1.6 });
    }
    const caption = h('div', { class: 'tv-journey', 'aria-live': 'polite' });
    frame.append(caption);
    frame.classList.add('is-touring');
    banner.hidden = true;
    journey = { frame: 0, caption, step: 0, t0: performance.now() };
    const vw = () => viewW();
    const vh = () => viewH() - HEAD.height;
    const show = (it, i) => {
      caption.replaceChildren(
        h('span', { class: 'tv-journey-step' }, `${i} / ${steps.length}`),
        h('span', { class: 'tv-journey-emoji', 'aria-hidden': 'true' }, it.node.emoji || '•'),
        h('span', {}, h('strong', {}, it.node.name_fr), h('small', {}, ` ${formatAgo(it.node.appeared_mya)}`)));
      it.el.g.classList.remove('is-pulsing');
      void it.el.g.getBBox?.();
      it.el.g.classList.add('is-pulsing');
      setTimeout(() => it.el.g.classList.remove('is-pulsing'), 1800);
    };
    show(line[0], 0);
    const tick = (now) => {
      if (!journey) return;
      const step = steps[journey.step];
      const t = Math.min(1, (now - journey.t0) / step.duration);
      const e = ease(t);
      // Le long du coude : d'abord la descente (ou montée), puis la traversée.
      const d1 = Math.abs(step.corner.y - step.from.y);
      const d2 = Math.abs(step.to.x - step.corner.x);
      const k = d1 + d2 ? (e * (d1 + d2)) : 0;
      const pt = k <= d1
        ? { x: step.from.x, y: lerp(step.from.y, step.corner.y, d1 ? k / d1 : 1) }
        : { x: lerp(step.corner.x, step.to.x, d2 ? (k - d1) / d2 : 1), y: step.to.y };
      scroller.scrollLeft = pt.x * zoom - vw() * 0.42;
      scroller.scrollTop = pt.y * zoom - vh() * 0.5;
      if (t >= 1) {
        show(step.node, journey.step + 1);
        journey.step += 1;
        journey.t0 = now + 260;
        if (journey.step >= steps.length) {
          const end = journey;
          setTimeout(() => { if (journey === end) stopJourney(); }, 3200);
          caption.classList.add('is-end');
          if (pinned === HUMAN_ID) caption.append(h('span', { class: 'tv-journey-you' }, 'C\'est toi !'));
          return;
        }
      }
      journey.frame = requestAnimationFrame(tick);
    };
    journey.frame = requestAnimationFrame(tick);
  }
  // Toucher l'arbre (ou la molette, ou une touche) arrête le voyage.
  ['pointerdown', 'wheel', 'keydown'].forEach((type) => scroller.addEventListener(type, stopJourney, { passive: true }));

  async function showLineageOverview() {
    if (!pinned) return;
    const line = ancestors(index, pinned).map((n) => info.get(n.id).to);
    const x1 = Math.min(...line.map((p) => p.x)) - 40;
    const x2 = Math.max(...line.map((p) => p.x)) + 160;
    const y1 = Math.min(...line.map((p) => p.y)) - 40;
    const y2 = Math.max(...line.map((p) => p.y)) + 40;
    const z = clamp(Math.min((viewW() - 16) / (x2 - x1), (viewH() - HEAD.height - 16) / (y2 - y1)), ZOOM_MIN, 1);
    await animateZoom(z);
    scrollToBox(x1, y1, x2, y2, true);
  }

  function toggleHumanLineage() {
    if (pinned === HUMAN_ID) { setPinned(null); announce('Lignée masquée.'); return; }
    api.highlightLineage(HUMAN_ID);
  }

  // ---------- Clavier ----------
  function onKey(event) {
    const g = event.target.closest('.tv-node');
    if (!g) return;
    const nid = g.dataset.id;
    const it = info.get(nid);
    const shown = [...info.values()].filter((n) => n.shown && !n.leaving);
    const byY = shown.slice().sort((a, b) => a.to.y - b.to.y || a.to.x - b.to.x);
    const pos = byY.indexOf(it);
    let target = null;
    switch (event.key) {
      case 'Enter':
      case ' ':
        openCard(nid);
        break;
      case 'ArrowDown': target = byY[Math.min(pos + 1, byY.length - 1)]; break;
      case 'ArrowUp': target = byY[Math.max(pos - 1, 0)]; break;
      case 'ArrowRight':
        if (it.kids.length && !open.has(nid)) setOpen(nid, true, { focus: true });
        else if (it.kids.length) target = info.get(it.kids[0]);
        break;
      case 'ArrowLeft':
        if (it.parentId) target = info.get(it.parentId);
        break;
      case '+': case '=': case 'Add':
        setOpen(nid, true, { focus: true });
        break;
      case '-': case '_': case 'Subtract':
        setOpen(nid, false, { focus: true });
        break;
      case 'Home': target = byY[0]; break;
      case 'End': target = byY[byY.length - 1]; break;
      case 'Escape':
        if (pinned) setPinned(null);
        else return;
        break;
      default: return;
    }
    event.preventDefault();
    if (target) focusNode(target.id);
  }

  function updateRoving() {
    if (!info.get(current)?.shown || info.get(current)?.leaving) current = root.id;
    for (const it of info.values()) it.el.g.setAttribute('tabindex', it.id === current ? '0' : '-1');
  }

  function focusNode(nid) {
    const it = info.get(nid);
    if (!it?.shown) return;
    current = nid;
    updateRoving();
    it.el.g.focus({ preventScroll: true });
    ensureVisible(nid);
  }

  // ---------- Textes pour les lecteurs d'écran ----------
  function announce(text) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 30);
  }

  function updateSummary(visible) {
    const total = info.size;
    const extinct = data.nodes.filter((n) => n.extinct_mya != null).length;
    summary.textContent = `Arbre de l'évolution en forme de frise : le temps va de gauche, il y a ${formatAgo(root.appeared_mya).replace('il y a ', '')}, à droite, aujourd'hui. `
      + `${total} groupes d'êtres vivants, dont ${visible.length} affichés. Chaque médaillon est placé à la date d'apparition du groupe ; `
      + `deux branches qui se séparent ont un ancêtre commun. ${extinct} groupes ont disparu : leur branche s'arrête avec une croix. `
      + `Les autres vivent encore : leur branche continue jusqu'à aujourd'hui. ${extinctions.length} extinctions de masse sont marquées d'une explosion. `
      + 'Entre dans l\'arbre avec la touche Tab, déplace-toi avec les flèches, Entrée ouvre la fiche, plus et moins déplient ou replient. '
      + 'L\'onglet Liste présente le même arbre sous forme de liste.';
  }

  // ---------- Plein écran ----------
  function toggleFullscreen() {
    if (document.fullscreenElement === rootEl) document.exitFullscreen?.();
    else rootEl.requestFullscreen?.().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === rootEl;
    rootEl.classList.toggle('is-fullscreen', on);
    btnFull?.setAttribute('aria-pressed', String(on));
  });

  // ---------- Évènements globaux ----------
  document.addEventListener('level-change', (event) => {
    const next = event.detail?.level || getLevel();
    if (next === level) return;
    level = next;
    rootEl.classList.toggle('show-sci', level === 'adultes');
    measureAll();
    render(false);
  });
  document.addEventListener('validation-change', (event) => {
    const it = info.get(event.detail?.id);
    if (it) refreshBadge(it);
  });

  let resizeTimer = 0;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!scroller.clientWidth) return;
      measureView();
      if (firstShow) { initView(); return; }
      if (!userZoomed) setZoom(defaultZoom());
      setCanvasSize(svgHeight() || H);
      placeEraLabels();
    }, 60);
  }) : null;
  resizeObserver?.observe(scroller);

  // Première vue : au début de l'histoire, en haut à gauche.
  function initView() {
    if (!scroller.clientWidth) return;
    measureView();
    firstShow = false;
    zoom = 0;
    setZoom(defaultZoom());
    scroller.scrollLeft = 0;
    scroller.scrollTop = 0;
  }

  // ---------- Premier dessin ----------
  rootEl.classList.toggle('show-sci', level === 'adultes');
  measureAll();
  render(false);
  renderHeader();
  // Quand les polices du site arrivent, on remesure les noms (et on replace les étiquettes si besoin).
  const refreshFonts = () => {
    if (!container.isConnected) return;
    const before = [...info.values()].map((it) => Math.round(it.nameW)).join();
    measureAll();
    if ([...info.values()].map((it) => Math.round(it.nameW)).join() === before) return;
    render(false);
    renderHeader();
  };
  document.fonts?.ready.then(refreshFonts);
  document.fonts?.addEventListener?.('loadingdone', refreshFonts);
  const titleFont = cssVar('--font-title');
  if (titleFont) document.fonts?.load?.(`600 ${G.name}px ${titleFont}`).then(refreshFonts, () => {});
  if (scroller.clientWidth) initView();

  // ---------- API ----------
  const api = {
    // Déplie les ancêtres d'un groupe, le montre et le fait briller.
    reveal(nid) {
      if (!info.has(nid)) return;
      openPath(nid);
      render();
      current = nid;
      updateRoving();
      const it = info.get(nid);
      setTimeout(() => {
        // D'abord le focus (qui fait un petit défilement), puis on centre le groupe.
        it.el.g.focus({ preventScroll: true });
        ensureVisible(nid, true);
        it.el.g.classList.remove('is-pulsing');
        void it.el.g.getBBox?.();
        it.el.g.classList.add('is-pulsing');
        setTimeout(() => it.el.g.classList.remove('is-pulsing'), 2600);
      }, prefersReducedMotion() ? 0 : DURATION * 0.7);
    },
    expandAll() {
      for (const it of info.values()) if (it.kids.length) open.add(it.id);
      render();
      announce('Tout l\'arbre est déplié.');
    },
    collapseAll() {
      for (const it of info.values()) if (it.id !== root.id) open.delete(it.id);
      open.add(root.id);
      if (current !== root.id && !open.has(info.get(current)?.parentId)) current = root.id;
      render();
      announce('L\'arbre est replié : appuie sur plus pour découvrir chaque famille.');
      scrollToBox(0, 0, viewW() / zoom, 10);
    },
    // Met en évidence la lignée d'un groupe jusqu'à la racine (null pour l'effacer).
    highlightLineage(nid) {
      if (!nid || !info.has(nid)) { setPinned(null); return; }
      openPath(nid);
      render();
      setPinned(nid);
      announce(`Lignée de ${info.get(nid).node.name_fr} mise en évidence.`);
      setTimeout(() => ensureVisible(nid, true), prefersReducedMotion() ? 0 : DURATION * 0.7);
    },
    onShow() {
      if (firstShow) initView();
      else renderHeader();
    },
  };
  return api;

  // ---------- Petits outils liés à l'échelle ----------
  function eraItems() {
    const pre = { name: 'Précambrien', start: SEGMENTS[0].from, end: 538.8, color: events.find((e) => e.id === 'proterozoique')?.color || '#8fd3ff' };
    const eras = events.filter((e) => e.type === 'era' && isNum(e.start_mya) && e.start_mya <= 540)
      .sort((a, b) => b.start_mya - a.start_mya)
      .map((e) => ({ name: e.name_fr, start: e.start_mya, end: e.end_mya, color: e.color || '#dddddd' }));
    return [pre, ...eras];
  }

  function periodItems() {
    const top = SEGMENTS[0].from;
    const list = events.filter((e) => e.type === 'period' && isNum(e.start_mya) && e.end_mya < top)
      .map((e) => ({ name: e.name_fr, start: Math.min(e.start_mya, top), end: e.end_mya, color: e.color || colorOf(e.parent_id) }));
    const firstPeriod = Math.max(...list.map((p) => p.start), 0);
    // Avant la première période : les éons (Archéen, Protérozoïque).
    for (const eon of events.filter((e) => e.type === 'eon' && e.end_mya < top && e.start_mya > firstPeriod)) {
      list.push({ name: eon.name_fr, start: Math.min(eon.start_mya, top), end: Math.max(eon.end_mya, firstPeriod), color: eon.color || '#dddddd' });
    }
    return list.sort((a, b) => b.start - a.start);
  }

  function colorOf(eventId) { return events.find((e) => e.id === eventId)?.color || '#dddddd'; }

  function ticks(z) {
    const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const out = [];
    scale.segs.forEach((seg, i) => {
      out.push({ mya: seg.from, major: true });
      const step = steps.find((s) => s * seg.pxPerMa * z >= 64) || 1000;
      for (let v = Math.floor(seg.from / step) * step; v > seg.to; v -= step) {
        const a = (seg.from - v) * seg.pxPerMa * z;
        const b = (v - seg.to) * seg.pxPerMa * z;
        if (a >= 36 && b >= 36) out.push({ mya: v, major: false });
      }
      if (i === scale.segs.length - 1) out.push({ mya: seg.to, major: true, today: true });
    });
    return out.filter((t) => !t.today);
  }
}

// ---------- Outils ----------

function buildScale() {
  let offset = G.padLeft;
  const segs = SEGMENTS.map((seg) => {
    const out = { ...seg, x0: offset, pxPerMa: seg.width / (seg.from - seg.to) };
    offset += seg.width;
    return out;
  });
  const x = (mya) => {
    const v = clamp(Number(mya) || 0, 0, segs[0].from);
    const seg = segs.find((s) => v <= s.from && v >= s.to) || segs[segs.length - 1];
    return seg.x0 + (seg.from - v) * seg.pxPerMa;
  };
  return { segs, x, W: offset + G.padRight };
}

// Branche « en coude arrondi » : on descend (ou monte) depuis l'ancêtre, puis on file vers le descendant.
function elbow(px, py, cx, cy) {
  const dx = cx - px;
  const dy = cy - py;
  if (Math.abs(dy) < 0.5) return `M${r1(px)} ${r1(py)}H${r1(cx)}`;
  if (dx <= 0.5) return `M${r1(px)} ${r1(py)}V${r1(cy)}`;
  const r = Math.min(G.corner, Math.abs(dy), dx);
  const sy = Math.sign(dy);
  return `M${r1(px)} ${r1(py)}V${r1(cy - sy * r)}Q${r1(px)} ${r1(cy)} ${r1(px + r)} ${r1(cy)}H${r1(cx)}`;
}

const branchWidth = (leaves) => r1(Math.min(2.2 + 1.05 * Math.sqrt(leaves), 8.5));

function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function svgText(cls, text, attrs = {}) {
  return svgEl('text', { class: cls, ...attrs }, text);
}

function svgIcon(d) {
  const icon = svgEl('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true', focusable: 'false' },
    svgEl('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return icon;
}

function ageText(node) {
  const a = formatShort(node.appeared_mya);
  if (node.extinct_mya == null) return a;
  return `${a} → ${formatShort(node.extinct_mya)}`;
}

// « Premiers vertébrés (poissons sans mâchoires) » → « Premiers vertébrés »
function shortName(name) {
  return String(name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
}

let measureCtx = null;
function measure(text, font) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return String(text).length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function fit(text, room, font) {
  if (room <= 0) return '';
  if (measure(text, font) <= room) return text;
  for (let n = text.length - 1; n >= 4; n -= 1) {
    const short = `${text.slice(0, n).trim()}.`;
    if (measure(short, font) <= room) return short;
  }
  return '';
}

function overlap(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const hgt = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && hgt > 0 ? w * hgt : 0;
}

function segmentHits(l, box) {
  if (l.y1 === l.y2) return l.y1 > box.y1 + 1 && l.y1 < box.y2 - 1 && Math.max(l.x1, l.x2) > box.x1 && Math.min(l.x1, l.x2) < box.x2;
  return l.x1 > box.x1 + 1 && l.x1 < box.x2 - 1 && l.y2 > box.y1 && l.y1 < box.y2;
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const catColor = (node) => CATEGORY_INFO[node.category]?.color || '#999999';
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = (value) => Math.round(value * 10) / 10;
// Douce accélération puis décélération.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
