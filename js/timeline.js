// La ligne du temps : une frise horizontale de la formation de la Terre
// (4 540 Ma) jusqu'à aujourd'hui.
//
// L'échelle est « en accordéon » : la frise est découpée en morceaux, et chaque
// morceau a sa propre échelle. Le Précambrien (très long, presque sans animaux)
// est très replié ; plus on s'approche d'aujourd'hui, plus la frise est dépliée,
// pour que 3 700 Ma et 0,3 Ma tiennent tous les deux sur la même frise.
//
// Contenu : bandes des éons, ères et périodes (couleurs de `events`), graduations,
// repères des grands événements et des extinctions de masse (💥, avec une bulle
// d'explication), et une pastille par nœud de l'arbre (qui ouvre sa fiche).
// La frise défile horizontalement DANS son cadre (doigt, souris, ◀ ▶, clavier).

import { CATEGORY_INFO, EARTH_AGE_MYA, formatAge, formatAgo, formatShort, h, prefersReducedMotion } from './utils.js';

// Morceaux de l'accordéon : de `from` Ma à `to` Ma, sur `width` pixels.
const SEGMENTS = [
  { from: EARTH_AGE_MYA, to: 1000, width: 780, hint: 'très, très serré' },
  { from: 1000, to: 538.8, width: 540, hint: 'serré' },
  { from: 538.8, to: 251.9, width: 1640, hint: 'étiré' },
  { from: 251.9, to: 66, width: 1500, hint: 'étiré' },
  { from: 66, to: 10, width: 980, hint: 'très étiré' },
  { from: 10, to: 0, width: 940, hint: 'super loupe !' },
];

const PAD_LEFT = 44;
const PAD_RIGHT = 230;
const GAP = 8;

// Hauteurs des rangées (px).
const ROW = { scale: 38, band: 34, axis: 34, event: 44, node: 50 };
const BAND_TYPES = ['eon', 'era', 'period'];
const BAND_NAMES = { eon: 'Éons', era: 'Ères', period: 'Périodes' };

// Petit emoji pour les grands événements (le champ facultatif `emoji` d'un événement est prioritaire).
const EVENT_EMOJI = [
  [/lune/i, '🌙'],
  [/formation|naissance de la terre/i, '🌍'],
  [/oxyg|oxyd/i, '🫧'],
  [/neige|glace|glaciation/i, '❄️'],
  [/cambri/i, '🎆'],
  [/plante|for[eê]t/i, '🌱'],
  [/oc[ée]an|eau/i, '🌊'],
  [/m[ée]t[ée]orite|ast[ée]ro/i, '☄️'],
  [/vie/i, '✨'],
];

const ERA_EMOJI = [[/pal[ée]o/i, '🐟'], [/m[ée]so/i, '🦖'], [/c[ée]no/i, '🐘']];

let uid = 0;

export function mount(container, ctx) {
  const { data, openCard } = ctx;
  const id = `tl${(uid += 1)}`;
  const reduced = () => prefersReducedMotion();

  // ---------- Échelle ----------
  let offset = PAD_LEFT;
  const segments = SEGMENTS.map((seg) => {
    const pxPerMa = seg.width / (seg.from - seg.to);
    const out = { ...seg, x0: offset, pxPerMa };
    offset += seg.width;
    return out;
  });
  const axisEnd = offset;
  const contentWidth = axisEnd + PAD_RIGHT;
  const baseZoom = segments[0].pxPerMa;
  segments.forEach((seg) => { seg.zoom = niceZoom(seg.pxPerMa / baseZoom); });

  const x = (mya) => {
    const value = Math.min(Math.max(Number(mya) || 0, 0), EARTH_AGE_MYA);
    const seg = segments.find((s) => value <= s.from && value >= s.to) || segments[segments.length - 1];
    return seg.x0 + (seg.from - value) * seg.pxPerMa;
  };

  // ---------- Données ----------
  const events = Array.isArray(data.events) ? data.events : [];
  const bands = BAND_TYPES
    .map((type) => ({ type, items: events.filter((e) => e.type === type && isNum(e.start_mya) && isNum(e.end_mya)) }))
    .filter((row) => row.items.length);
  const markers = events
    .filter((e) => (e.type === 'extinction' || e.type === 'event') && isNum(e.start_mya))
    .sort((a, b) => b.start_mya - a.start_mya);
  const nodes = [...data.nodes]
    .filter((n) => isNum(n.appeared_mya))
    .sort((a, b) => b.appeared_mya - a.appeared_mya);
  const categories = Object.keys(CATEGORY_INFO).filter((cat) => nodes.some((n) => n.category === cat));
  let filter = 'all';

  // ---------- Squelette ----------
  const count = h('p', { class: 'tl-count', 'aria-live': 'polite' });
  const prev = h('button', { type: 'button', class: 'btn btn-small btn-ghost tl-arrow', 'aria-label': 'Reculer dans le temps (vers le passé)', 'aria-controls': `${id}-scroller` }, h('span', { 'aria-hidden': 'true' }, '◀'), h('span', { class: 'tl-arrow-text' }, 'Passé'));
  const next = h('button', { type: 'button', class: 'btn btn-small btn-ghost tl-arrow', 'aria-label': 'Avancer dans le temps (vers aujourd\'hui)', 'aria-controls': `${id}-scroller` }, h('span', { class: 'tl-arrow-text' }, 'Futur'), h('span', { 'aria-hidden': 'true' }, '▶'));

  const content = h('div', { class: 'tl-content', style: st({ width: `${contentWidth}px` }) });
  const scroller = h('div', {
    class: 'tl-scroller', id: `${id}-scroller`, tabindex: '0', role: 'region',
    'aria-label': 'La frise du temps. Elle défile de gauche à droite, de la formation de la Terre jusqu\'à aujourd\'hui.',
  }, content);

  const bubble = h('div', { class: 'tl-bubble', id: `${id}-bubble`, role: 'note', hidden: true });

  const jumps = jumpTargets(events).map((target) => h('button', {
    type: 'button', class: 'tl-jump', onclick: () => scrollToMya(target.mya),
  }, h('span', { 'aria-hidden': 'true' }, target.emoji), ` ${target.label}`));

  const chips = categories.length > 1 ? h('div', { class: 'tl-filters', role: 'group', 'aria-label': 'Montrer seulement une famille' },
    h('span', { class: 'tl-filters-label' }, 'Montrer :'),
    filterChip('all', '🌈', 'Tout le monde', null),
    ...categories.map((cat) => filterChip(cat, CATEGORY_INFO[cat].emoji, CATEGORY_INFO[cat].label, CATEGORY_INFO[cat].color)),
  ) : null;

  container.replaceChildren(
    h('div', { class: 'tl-root' },
      h('p', { class: 'view-intro' },
        'Voici toute l\'histoire de la Terre, de sa naissance jusqu\'à aujourd\'hui ! Fais glisser la frise avec ton doigt, la souris ou les flèches, et touche un être vivant pour lire sa fiche.'),
      h('div', { class: 'tl-accordion-note' },
        h('span', { class: 'tl-note-icon', 'aria-hidden': 'true' }, '🪗'),
        h('p', {},
          h('strong', {}, 'Attention : la frise est en accordéon ! '),
          'Le début de l\'histoire, très, très long et presque sans animaux, est tout replié. Plus on s\'approche d\'aujourd\'hui, plus la frise est dépliée. Regarde la loupe ',
          h('span', { class: 'tl-mini-zoom' }, '🔍 ×1'),
          ' en haut de chaque morceau, et les plis ',
          h('span', { class: 'tl-mini-fold', 'aria-hidden': 'true' }),
          ' qui les séparent.')),
      chips,
      h('div', { class: 'tl-toolbar' },
        prev,
        h('div', { class: 'tl-jumps', role: 'group', 'aria-label': 'Aller directement à une époque' }, ...jumps),
        next),
      h('div', { class: 'tl-frame' }, scroller),
      h('div', { class: 'tl-legend' },
        h('span', {}, h('span', { class: 'tl-legend-ext', 'aria-hidden': 'true' }, '💥'), ' extinction de masse'),
        h('span', {}, h('span', { class: 'tl-legend-evt', 'aria-hidden': 'true' }, '⭐'), ' grand événement'),
        h('span', {}, h('strong', {}, 'M'), ' = millions d\'années'),
        h('span', {}, h('strong', {}, 'Md'), ' = milliards d\'années'),
        count),
    ),
  );

  // ---------- Dessin ----------
  let nodeTop = 0;

  function render() {
    closeBubble(false);
    const parts = [];
    let y = 0;

    // Rangée de l'accordéon : un fond par morceau, sa loupe, et un pli entre deux morceaux.
    const scaleTop = y;
    y += ROW.scale;
    segments.forEach((seg, i) => {
      parts.push(h('div', {
        class: `tl-seg ${i % 2 ? 'tl-seg-alt' : ''}`,
        style: st({ left: `${seg.x0}px`, width: `${seg.width}px` }),
        'aria-hidden': 'true',
      }));
      parts.push(h('span', { class: 'tl-snap', style: st({ left: `${Math.max(seg.x0 - 24, 0)}px` }), 'aria-hidden': 'true' }));
      parts.push(h('div', {
        class: 'tl-zoom', style: st({ left: `${seg.x0 + 12}px`, top: `${scaleTop + 6}px` }),
        title: `Ici, la frise est ${seg.hint}`,
      },
      h('span', { 'aria-hidden': 'true' }, '🔍'),
      h('span', { class: 'visually-hidden' }, `Loupe fois ${seg.zoom} : ici, la frise est ${seg.hint}.`),
      h('span', { 'aria-hidden': 'true' }, ` ×${seg.zoom}`),
      h('small', { 'aria-hidden': 'true' }, seg.hint)));
      if (i > 0) parts.push(h('div', { class: 'tl-fold', style: st({ left: `${seg.x0 - 7}px` }), 'aria-hidden': 'true', title: 'Pli de l\'accordéon : l\'échelle change ici' }));
    });

    // Bandes des éons, ères et périodes.
    const bandTop = y;
    for (const row of bands) {
      for (const item of row.items) {
        const left = x(item.start_mya);
        const right = x(item.end_mya);
        const width = Math.max(right - left, 2);
        const color = item.color || events.find((e) => e.id === item.parent_id)?.color || '#cccccc';
        const label = fitLabel(item.name_fr, width - 12);
        parts.push(h('button', {
          type: 'button', class: `tl-band tl-band-${row.type}`,
          style: st({ left: `${left}px`, top: `${y}px`, width: `${width}px`, height: `${ROW.band - 4}px`, '--band': color, '--band-ink': inkFor(color) }),
          title: `${item.name_fr} : de ${formatShort(item.start_mya)} à ${item.end_mya === 0 ? 'aujourd\'hui' : formatShort(item.end_mya)}`,
          'aria-label': `${BAND_NAMES[row.type].slice(0, -1)} : ${item.name_fr}, de ${formatAgo(item.start_mya)} à ${item.end_mya === 0 ? 'aujourd\'hui' : formatAgo(item.end_mya)}`,
          'aria-expanded': 'false', 'aria-controls': bubble.id,
          dataset: { event: item.id },
          onclick: (event) => openBubble(event.currentTarget, item, left, y + ROW.band),
        }, label ? h('span', { class: 'tl-band-label', 'aria-hidden': 'true' }, label) : null));
      }
      y += ROW.band;
    }
    const bandBottom = y;

    // Graduations.
    const axisTop = y;
    parts.push(h('div', { class: 'tl-axis', style: st({ left: `${PAD_LEFT}px`, width: `${axisEnd - PAD_LEFT}px`, top: `${axisTop}px` }), 'aria-hidden': 'true' }));
    for (const tick of ticks(segments)) {
      parts.push(h('div', {
        class: `tl-tick ${tick.major ? 'is-major' : ''}`, style: st({ left: `${x(tick.mya)}px`, top: `${axisTop}px` }), 'aria-hidden': 'true',
      }, h('span', {}, tick.mya === 0 ? 'Aujourd\'hui' : formatShort(tick.mya))));
    }
    y += ROW.axis;

    // Événements et extinctions (empilés pour ne pas se chevaucher).
    const eventTop = y;
    const eventItems = markers.map((event) => {
      const extinct = event.type === 'extinction';
      const name = event.name_fr || '';
      return { event, extinct, x: x(event.start_mya), width: pillWidth(shortName(name, 26), 'event') };
    });
    const eventRows = stack(eventItems, 17);
    y += Math.max(eventRows, 1) * ROW.event + 6;

    // Nœuds de l'arbre.
    nodeTop = y;
    const visible = nodes.filter((n) => filter === 'all' || n.category === filter);
    const nodeItems = visible.map((node) => ({ node, x: x(node.appeared_mya), width: pillWidth(shortName(node.name_fr, 22), 'node') }));
    const nodeRows = stack(nodeItems, 20);
    y += Math.max(nodeRows, 1) * ROW.node + 18;
    const height = y;

    // Lignes rouges des extinctions et pointillés des événements, sur toute la hauteur.
    for (const item of eventItems) {
      parts.push(h('div', {
        class: item.extinct ? 'tl-ext-line' : 'tl-evt-line',
        style: st({ left: `${item.x - (item.extinct ? 2 : 1)}px`, top: `${bandTop}px`, height: `${height - bandTop}px` }),
        'aria-hidden': 'true',
      }));
    }

    // Tiges des nœuds (du haut de la zone jusqu'à la pastille).
    for (const item of nodeItems) {
      parts.push(h('div', {
        class: 'tl-stem',
        style: st({ left: `${item.x - 1}px`, top: `${nodeTop - 8}px`, height: `${item.row * ROW.node + 14}px`, '--cat': catColor(item.node) }),
        'aria-hidden': 'true',
      }));
    }

    // Repère « aujourd'hui ».
    parts.push(h('div', { class: 'tl-now', style: st({ left: `${x(0) - 2}px`, top: `${bandTop}px`, height: `${height - bandTop}px` }), 'aria-hidden': 'true' },
      h('span', {}, '🧒 Toi !')));

    // Pastilles des événements.
    for (const item of eventItems) {
      const { event, extinct } = item;
      const emoji = extinct ? '💥' : (event.emoji || EVENT_EMOJI.find(([re]) => re.test(`${event.id} ${event.name_fr}`))?.[1] || '⭐');
      const top = eventTop + item.row * ROW.event;
      parts.push(h('button', {
        type: 'button', class: `tl-event ${extinct ? 'is-extinction' : ''} ${item.flip ? 'is-flip' : ''}`,
        style: st({ left: `${item.left}px`, top: `${top}px`, width: `${item.width}px` }),
        'aria-label': `${extinct ? 'Extinction de masse' : 'Événement'} : ${event.name_fr}, ${formatAgo(event.start_mya)}`,
        'aria-expanded': 'false', 'aria-controls': bubble.id,
        dataset: { event: event.id, tipEvent: event.id },
        onclick: (e) => openBubble(e.currentTarget, event, item.left, top + ROW.event - 2),
        onfocus: (e) => { if (e.currentTarget.matches(':focus-visible')) openBubble(e.currentTarget, event, item.left, top + ROW.event - 2); },
      },
      h('span', { class: 'tl-event-icon', 'aria-hidden': 'true' }, emoji),
      h('span', { class: 'tl-event-name', 'aria-hidden': 'true' }, shortName(event.name_fr, 26))));
    }

    // Pastilles des nœuds.
    for (const item of nodeItems) {
      const { node } = item;
      const extinct = node.extinct_mya != null;
      parts.push(h('button', {
        type: 'button', class: `tl-node ${extinct ? 'is-extinct' : ''} ${item.flip ? 'is-flip' : ''}`,
        style: st({ left: `${item.left}px`, top: `${nodeTop + item.row * ROW.node}px`, width: `${item.width}px`, '--cat': catColor(node) }),
        'aria-label': `${node.name_fr}, apparu ${formatAgo(node.appeared_mya)}${extinct ? ', disparu depuis' : ''}. Ouvrir la fiche.`,
        dataset: { id: node.id, tipNode: node.id },
        onclick: () => openCard(node.id),
      },
      h('span', { class: 'tl-node-emoji', 'aria-hidden': 'true' }, node.emoji || '•'),
      h('span', { class: 'tl-node-name', 'aria-hidden': 'true' }, shortName(node.name_fr, 22))));
    }

    content.style.height = `${height}px`;
    content.replaceChildren(...parts, bubble);
    count.textContent = filter === 'all'
      ? `${visible.length} groupes d'êtres vivants sur la frise.`
      : `${visible.length} groupe${visible.length > 1 ? 's' : ''} : ${CATEGORY_INFO[filter].label.toLowerCase()}${visible.length > 1 ? 's' : ''}.`;
    updateArrows();
  }

  // ---------- Bulle d'explication ----------
  let bubbleOwner = null;

  function openBubble(owner, event, left, top) {
    if (bubbleOwner === owner && !bubble.hidden) return;
    closeBubble(false);
    const extinct = event.type === 'extinction';
    const ponctual = event.end_mya == null || event.end_mya === event.start_mya;
    const when = ponctual
      ? formatAgo(event.start_mya)
      : `De ${formatAgo(event.start_mya)} à ${event.end_mya === 0 ? 'aujourd\'hui' : formatAgo(event.end_mya).replace('il y a ', '')}`;
    const emoji = extinct ? '💥' : (owner.querySelector('.tl-event-icon')?.textContent || '🕰️');
    bubble.className = `tl-bubble ${extinct ? 'is-extinction' : ''}`;
    bubble.replaceChildren(
      h('button', { type: 'button', class: 'tl-bubble-close', 'aria-label': 'Fermer la bulle', onclick: () => closeBubble(true) }, '✕'),
      h('p', { class: 'tl-bubble-kind' }, extinct ? 'Extinction de masse' : (BAND_TYPES.includes(event.type) ? { eon: 'Éon', era: 'Ère', period: 'Période' }[event.type] : 'Grand événement')),
      h('h3', { class: 'tl-bubble-title' }, h('span', { 'aria-hidden': 'true' }, `${emoji} `), event.name_fr),
      h('p', { class: 'tl-bubble-when' }, capitalize(when)),
      event.description_enfant ? h('p', {}, event.description_enfant) : null,
    );
    const width = Math.min(320, Math.max(220, scroller.clientWidth - 24));
    bubble.style.width = `${width}px`;
    bubble.style.left = `${clamp(left, 8, contentWidth - width - 8)}px`;
    bubble.style.top = `${top + 4}px`;
    bubble.hidden = false;
    // Si la frise est courte (filtre), on l'agrandit pour ne pas couper la bulle.
    content.style.minHeight = `${top + 4 + bubble.offsetHeight + 12}px`;
    bubbleOwner = owner;
    owner.setAttribute('aria-expanded', 'true');
    owner.setAttribute('aria-describedby', bubble.id);
    // Garde la bulle visible dans le cadre.
    const view = { left: scroller.scrollLeft, right: scroller.scrollLeft + scroller.clientWidth };
    const bLeft = parseFloat(bubble.style.left);
    if (bLeft + width > view.right - 8) scroller.scrollTo({ left: bLeft + width - scroller.clientWidth + 16, behavior: reduced() ? 'auto' : 'smooth' });
    else if (bLeft < view.left + 8) scroller.scrollTo({ left: bLeft - 16, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function closeBubble(returnFocus) {
    content.style.minHeight = '';
    if (!bubbleOwner) { bubble.hidden = true; return; }
    const owner = bubbleOwner;
    bubbleOwner = null;
    bubble.hidden = true;
    owner.setAttribute('aria-expanded', 'false');
    owner.removeAttribute('aria-describedby');
    if (returnFocus && owner.isConnected) owner.focus({ preventScroll: true });
  }

  scroller.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && bubbleOwner) { event.preventDefault(); closeBubble(true); }
  });
  scroller.addEventListener('focusout', (event) => {
    const to = event.relatedTarget;
    if (bubbleOwner && to && !bubble.contains(to) && to !== bubbleOwner) closeBubble(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!bubbleOwner) return;
    if (bubble.contains(event.target) || bubbleOwner.contains(event.target)) return;
    if (event.target.closest?.('.tl-event, .tl-band')) return; // une autre bulle va s'ouvrir
    closeBubble(false);
  });

  // ---------- Filtre par famille ----------
  function filterChip(value, emoji, label, color) {
    return h('button', {
      type: 'button', class: 'tl-chip', 'aria-pressed': String(value === filter),
      style: color ? st({ '--cat': color }) : null,
      dataset: { filter: value },
      onclick: () => setFilter(value),
    }, h('span', { 'aria-hidden': 'true' }, emoji), ` ${label}`);
  }

  function setFilter(value) {
    filter = filter === value ? 'all' : value;
    container.querySelectorAll('.tl-chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter)));
    render();
    if (filter !== 'all') {
      // On montre la première pastille de la famille (elle peut s'étendre vers la gauche).
      const first = content.querySelector('.tl-node');
      if (first) scroller.scrollTo({ left: parseFloat(first.style.left) - 24, behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  // ---------- Défilement ----------
  function scrollToMya(mya) {
    const left = mya <= 0 ? contentWidth : x(mya) - 30;
    scroller.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function updateArrows() {
    const max = scroller.scrollWidth - scroller.clientWidth;
    prev.disabled = scroller.scrollLeft <= 2;
    next.disabled = scroller.scrollLeft >= max - 2;
  }

  const page = (direction) => scroller.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: reduced() ? 'auto' : 'smooth' });
  prev.addEventListener('click', () => page(-1));
  next.addEventListener('click', () => page(1));
  let ticking = false;
  scroller.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; updateArrows(); });
  }, { passive: true });

  // Glisser à la souris (au doigt, le défilement natif suffit).
  let drag = null;
  scroller.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target.closest('button, .tl-bubble')) return;
    drag = { x: event.clientX, left: scroller.scrollLeft, moved: false, pointer: event.pointerId };
  });
  scroller.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      scroller.setPointerCapture(event.pointerId);
      scroller.classList.add('is-dragging');
    }
    if (drag.moved) scroller.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) scroller.releasePointerCapture?.(drag.pointer);
    drag = null;
    scroller.classList.remove('is-dragging');
  };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('lostpointercapture', endDrag);

  render();
  // Quand la police du site est chargée, on remesure les pastilles.
  document.fonts?.ready.then(() => { if (container.isConnected) render(); });
  return { onShow: updateArrows };
}

// ---------- Outils ----------

// Style en ligne (texte), pour que les variables CSS (--band, --cat) fonctionnent.
const st = (props) => Object.entries(props).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}`).join('; ');
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const catColor = (node) => CATEGORY_INFO[node.category]?.color || '#999999';

function niceZoom(value) {
  if (value < 10) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  return Math.round(value / 50) * 50;
}

// « Premiers êtres multicellulaires (algues) » → « Premiers êtres multicellulaires »
function shortName(name, max) {
  const text = String(name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

// Largeur d'une pastille : texte mesuré avec un canevas (même police que la page),
// pour que l'empilement soit exact sans toucher au DOM.
let measureCtx = null;
function pillWidth(text, kind) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const size = (kind === 'event' ? 0.78 : 0.82) * rem;
  const chrome = kind === 'event' ? 52 : 62; // icône + marges + bordures
  measureCtx ??= document.createElement('canvas').getContext('2d');
  let width = text.length * size * 0.62;
  if (measureCtx) {
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    measureCtx.font = `800 ${size}px ${family}`;
    width = measureCtx.measureText(text).width;
  }
  return Math.ceil(chrome + width + 4);
}

// Empile les éléments sur des rangées sans chevauchement. Chaque pastille peut
// s'étendre vers la droite (repère à gauche) ou vers la gauche (repère à droite) :
// on garde la rangée la plus basse possible. Ajoute item.row, item.left, item.flip
// et renvoie le nombre de rangées.
function stack(items, anchor) {
  const rows = [];
  const free = (row, a, b) => rows[row].every(([l, r]) => b + GAP <= l || a >= r + GAP);
  for (const item of items) {
    const right = [item.x - anchor, item.x - anchor + item.width];
    const left = [item.x + anchor - item.width, item.x + anchor];
    let placed = null;
    for (let row = 0; row <= rows.length && !placed; row += 1) {
      if (row === rows.length) rows.push([]);
      if (left[0] >= 4 && free(row, ...left)) placed = { row, span: left, flip: true };
      else if (free(row, ...right)) placed = { row, span: right, flip: false };
    }
    rows[placed.row].push(placed.span);
    Object.assign(item, { row: placed.row, left: placed.span[0], flip: placed.flip });
  }
  return rows.length;
}

// Le nom d'une bande, raccourci s'il ne tient pas.
function fitLabel(name, room) {
  const perChar = 7.6;
  if (name.length * perChar <= room) return name;
  const short = `${name.slice(0, Math.max(Math.floor(room / perChar) - 1, 0))}.`;
  return short.length >= 4 ? short : '';
}

// Encre lisible (sombre ou blanche) sur une couleur de fond.
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#1d1d1f';
  const n = parseInt(m[1], 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contraste avec le noir doux vs le blanc.
  return (L + 0.05) / (0.012 + 0.05) >= 1.05 / (L + 0.05) ? '#1d1d1f' : '#ffffff';
}

// Graduations : un pas « rond » par morceau, assez espacé pour être lisible.
function ticks(segments) {
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const out = [];
  const minGap = 46;
  segments.forEach((seg, i) => {
    out.push({ mya: seg.from, major: true });
    const step = steps.find((s) => s * seg.pxPerMa >= 92) || 1000;
    for (let v = Math.floor(seg.from / step) * step; v > seg.to; v -= step) {
      const fromStart = (seg.from - v) * seg.pxPerMa;
      const toEnd = (v - seg.to) * seg.pxPerMa;
      if (fromStart >= minGap && toEnd >= minGap) out.push({ mya: v, major: false });
    }
    if (i === segments.length - 1) out.push({ mya: seg.to, major: true });
  });
  return out;
}

// Raccourcis : formation de la Terre, les ères du Phanérozoïque, les derniers millions d'années, aujourd'hui.
function jumpTargets(events) {
  const targets = [{ emoji: '🌋', label: 'Début', mya: EARTH_AGE_MYA }];
  const eras = events
    .filter((e) => e.type === 'era' && isNum(e.start_mya) && e.start_mya <= 545)
    .sort((a, b) => b.start_mya - a.start_mya);
  for (const era of eras) {
    targets.push({ emoji: ERA_EMOJI.find(([re]) => re.test(era.name_fr))?.[1] || '⏩', label: era.name_fr, mya: era.start_mya });
  }
  if (!eras.length) targets.push({ emoji: '🐚', label: formatAge(538.8), mya: 538.8 });
  targets.push({ emoji: '🧑', label: 'Aujourd\'hui', mya: 0 });
  return targets;
}
