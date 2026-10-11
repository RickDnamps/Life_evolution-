// Fenêtre flottante au survol (ou au focus clavier) d'un groupe ou d'un événement.
// Tout élément portant data-tip-node="<id>" ou data-tip-event="<id>" en profite.

import { CATEGORY_INFO, eraColor, formatAgo, getLevel, h, nodeSummary } from './utils.js';

const SHOW_DELAY = 140;
const MAX_CHARS = 190;

function shorten(text) {
  if (!text || text.length <= MAX_CHARS) return text;
  const cut = text.slice(0, MAX_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export function setupTooltips(ctx) {
  const tip = h('div', { class: 'tip', role: 'tooltip', id: 'floating-tip', hidden: true });
  document.body.append(tip);
  const events = new Map((ctx.data.events || []).map((e) => [e.id, e]));
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  let timer = null;
  let target = null;

  function contentFor(el) {
    const level = getLevel();
    if (el.dataset.tipNode) {
      const node = ctx.index.byId.get(el.dataset.tipNode);
      if (!node) return null;
      const category = CATEGORY_INFO[node.category];
      return {
        color: eraColor(ctx.data.events, node.appeared_mya),
        body: [
          h('div', { class: 'tip-head' },
            h('span', { class: 'tip-emoji', 'aria-hidden': 'true' }, node.emoji),
            h('div', {},
              h('strong', { class: 'tip-title' }, node.name_fr),
              level === 'adultes' ? h('em', { class: 'tip-sci' }, node.name_sci) : null)),
          h('p', { class: 'tip-meta' },
            `🕰️ Apparu ${formatAgo(node.appeared_mya)}`,
            node.extinct_mya != null ? ` · 🪦 disparu ${formatAgo(node.extinct_mya)}` : ''),
          h('p', { class: 'tip-text' }, shorten(nodeSummary(node, level))),
          h('p', { class: 'tip-foot' },
            category ? h('span', { class: 'tip-chip', style: { '--chip': category.color } }, `${category.emoji} ${category.label}`) : null,
            h('span', { class: 'tip-hint' }, 'Clique pour ouvrir la fiche')),
        ],
      };
    }
    const event = events.get(el.dataset.tipEvent);
    if (!event) return null;
    const isExtinction = event.type === 'extinction';
    const when = event.start_mya === event.end_mya
      ? formatAgo(event.start_mya)
      : `de ${formatAgo(event.start_mya).replace('il y a ', '')} à ${formatAgo(event.end_mya).replace('il y a ', '')}`;
    return {
      color: isExtinction ? '#e63946' : (event.color || '#ffd166'),
      body: [
        h('div', { class: 'tip-head' },
          h('span', { class: 'tip-emoji', 'aria-hidden': 'true' }, event.emoji || (isExtinction ? '💥' : '⭐')),
          h('strong', { class: 'tip-title' }, event.name_fr)),
        h('p', { class: 'tip-meta' }, `🕰️ ${when}`),
        h('p', { class: 'tip-text' }, shorten(event.description_enfant)),
        level === 'adultes' && event.source ? h('p', { class: 'tip-hint' }, `📚 ${event.source}`) : null,
      ],
    };
  }

  function place(el) {
    const rect = el.getBoundingClientRect();
    const margin = 10;
    tip.style.left = '0px';
    tip.style.top = '0px';
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = rect.top - height - margin;
    let below = false;
    if (top < margin) { top = rect.bottom + margin; below = true; }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.dataset.side = below ? 'below' : 'above';
    tip.style.setProperty('--arrow', `${Math.round(rect.left + rect.width / 2 - left)}px`);
  }

  function show(el) {
    const content = contentFor(el);
    if (!content) return;
    target = el;
    tip.replaceChildren(...content.body);
    tip.style.setProperty('--tip-color', content.color);
    tip.hidden = false;
    place(el);
    tip.classList.add('is-visible');
    el.setAttribute('aria-describedby', 'floating-tip');
  }

  function hide() {
    clearTimeout(timer);
    if (target) target.removeAttribute('aria-describedby');
    target = null;
    tip.classList.remove('is-visible');
    tip.hidden = true;
  }

  const findTarget = (node) => node?.closest?.('[data-tip-node], [data-tip-event]');

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse' || !canHover.matches) return;
    const el = findTarget(event.target);
    if (!el || el === target) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(el), SHOW_DELAY);
  });
  document.addEventListener('pointerout', (event) => {
    const el = findTarget(event.target);
    if (el && !el.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', (event) => {
    const el = findTarget(event.target);
    if (el && el.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, { passive: true, capture: true });
  document.addEventListener('pointerdown', hide);

  return { hide };
}
