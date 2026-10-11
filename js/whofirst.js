// « Qui est apparu en premier ? »
// Deux groupes tirés au hasard : l'enfant devine lequel est arrivé le premier sur Terre.
// Clavier : 1 ou 2 pour choisir, ← → pour passer d'une carte à l'autre, Entrée pour valider.

import { ancestors, formatAge, formatAgo, h, nodeImage, prefersReducedMotion } from './utils.js';

// Groupes « parlants » en plus des feuilles de l'arbre (les nœuds trop abstraits sont ignorés).
const FAVORITES = new Set([
  'eucaryotes', 'animaux', 'vertebres', 'arthropodes', 'tetrapodes', 'dinosaures', 'mammiferes',
  'oiseaux', 'primates', 'cetaces', 'equides', 'hominoides', 'australopitheques', 'homo',
  'insectes', 'requins', 'tortues', 'pterosaures', 'squamates', 'crocodiliens',
]);

// Écart minimal entre les deux dates (6 % de la plus ancienne) : pas d'égalité, pas de piège.
const MIN_RATIO = 0.06;

const CHEERS = ['Bravo !', 'Génial !', 'Super !', 'Exactement !', 'Bien vu !', 'Champion !'];
const ALMOST = [
  'Pas grave : c\'est en se trompant qu\'on apprend !',
  'Ce n\'était pas facile ! Tu feras mieux au prochain coup.',
  'Bien essayé ! Regarde les dates, c\'est surprenant.',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function mount(container, ctx) {
  const { data, index, openCard } = ctx;

  const usable = data.nodes.filter((n) => n.parent_id != null && Number.isFinite(n.appeared_mya));
  const isLeaf = (id) => !(index.children.get(id) || []).length;
  let pool = usable.filter((n) => isLeaf(n.id) || FAVORITES.has(n.id));
  if (pool.length < 6) pool = usable;

  const state = { pair: null, phase: 'ask', streak: 0, best: 0, right: 0, played: 0, recent: [] };

  // ---------- Structure ----------

  const streakChip = h('span', { class: 'wf-chip wf-chip-streak' });
  const scoreChip = h('span', { class: 'wf-chip' });
  const arena = h('div', { class: 'wf-arena' });
  const result = h('div', { class: 'wf-result', role: 'status', 'aria-live': 'polite' });

  container.replaceChildren(
    h('p', { class: 'view-intro' }, 'Deux groupes d\'êtres vivants, une seule question. Fais confiance à ton instinct !'),
    h('div', { class: 'wf-game' },
      h('div', { class: 'wf-top' },
        h('p', { class: 'wf-question' }, h('span', { 'aria-hidden': 'true' }, '⏳ '), 'Lequel est arrivé le premier sur Terre ?'),
        h('div', { class: 'wf-stats' }, streakChip, scoreChip),
      ),
      h('p', { class: 'wf-hint' }, 'Touche une carte… ou appuie sur ', h('span', { class: 'kbd' }, '1'), ' ou ', h('span', { class: 'kbd' }, '2'), '.'),
      arena,
      result,
    ),
  );

  if (usable.length < 2) {
    arena.replaceChildren(h('p', { class: 'wf-empty' }, 'Les animaux arrivent bientôt ! 🐣'));
    return {};
  }

  // ---------- Tirage d'une paire ----------

  function farEnough(a, b) {
    const hi = Math.max(a.appeared_mya, b.appeared_mya);
    const lo = Math.min(a.appeared_mya, b.appeared_mya);
    return hi !== lo && hi - lo >= MIN_RATIO * hi;
  }

  function drawPair() {
    const previous = state.pair ? state.pair.map((n) => n.id).sort().join('|') : '';
    for (const list of [pool, usable]) {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const a = pick(list);
        const b = pick(list);
        if (a === b || !farEnough(a, b)) continue;
        const relaxed = attempt > 200;
        if (!relaxed && (state.recent.includes(a.id) || state.recent.includes(b.id))) continue;
        if ([a.id, b.id].sort().join('|') === previous) continue;
        return [a, b];
      }
    }
    // Dernier recours : les deux groupes aux dates les plus éloignées.
    const sorted = [...usable].sort((x, y) => x.appeared_mya - y.appeared_mya);
    return [sorted[0], sorted[sorted.length - 1]];
  }

  // ---------- Affichage ----------

  function updateStats() {
    streakChip.textContent = state.streak >= 2
      ? `🔥 ${state.streak} bonnes réponses de suite`
      : state.streak === 1 ? '🔥 1 bonne réponse' : '🔥 Série : 0';
    streakChip.classList.toggle('is-hot', state.streak >= 3);
    scoreChip.textContent = `⭐ ${state.right} / ${state.played}`;
    scoreChip.setAttribute('aria-label', `${state.right} bonnes réponses sur ${state.played}${state.best >= 2 ? `, record : ${state.best} de suite` : ''}`);
  }

  function renderCard(node, slot) {
    const choice = h('button', {
      type: 'button', class: 'wf-choice', 'data-slot': String(slot),
      'aria-label': `Choix ${slot + 1} : ${node.name_fr}`,
      onclick: () => answer(slot),
    },
    h('span', { class: 'wf-num', 'aria-hidden': 'true' }, String(slot + 1)),
    h('span', { class: 'wf-pic' }, nodeImage(node, 'wf-img'), h('span', { class: 'wf-emoji', 'aria-hidden': 'true' }, node.emoji)),
    h('span', { class: 'wf-name' }, node.name_fr));

    const reveal = h('div', { class: 'wf-reveal', hidden: true });
    return h('article', { class: 'wf-card', 'data-slot': String(slot) }, choice, reveal);
  }

  function newRound() {
    state.pair = drawPair();
    state.phase = 'ask';
    state.recent = [...state.recent, ...state.pair.map((n) => n.id)].slice(-6);
    arena.replaceChildren(
      renderCard(state.pair[0], 0),
      h('div', { class: 'wf-vs', 'aria-hidden': 'true' }, 'ou'),
      renderCard(state.pair[1], 1),
    );
    result.replaceChildren();
    result.className = 'wf-result';
    updateStats();
  }

  // ---------- Réponse ----------

  function relation(older, younger) {
    const lineOld = ancestors(index, older.id);
    const lineYoung = ancestors(index, younger.id);
    if (lineYoung.some((n) => n.id === older.id)) {
      return h('p', { class: 'wf-family' },
        h('span', { 'aria-hidden': 'true' }, '🧬 '),
        `${capitalize(group(older).subject)} ${group(older).plural ? 'sont les ancêtres' : 'est l\'ancêtre'} ${group(younger).of} !`);
    }
    let common = null;
    for (let i = 0; i < Math.min(lineOld.length, lineYoung.length); i += 1) {
      if (lineOld[i].id !== lineYoung[i].id) break;
      common = lineOld[i];
    }
    if (!common) return null;
    return h('p', { class: 'wf-family' },
      h('span', { 'aria-hidden': 'true' }, '🌳 '),
      'Leur ancêtre commun : ',
      h('button', {
        type: 'button', class: 'wf-link', onclick: () => openCard(common.id),
        'aria-label': `${common.name_fr} : voir la fiche`,
      }, `${common.emoji} ${common.name_fr}`),
      ` (${formatAgo(common.appeared_mya)}).`);
  }

  function answer(slot) {
    if (state.phase !== 'ask') return;
    state.phase = 'done';
    const [a, b] = state.pair;
    const firstSlot = a.appeared_mya > b.appeared_mya ? 0 : 1;
    const older = state.pair[firstSlot];
    const younger = state.pair[1 - firstSlot];
    const good = slot === firstSlot;

    state.played += 1;
    if (good) {
      state.right += 1;
      state.streak += 1;
      state.best = Math.max(state.best, state.streak);
    } else {
      state.streak = 0;
    }
    updateStats();

    arena.querySelectorAll('.wf-card').forEach((card) => {
      const cardSlot = Number(card.dataset.slot);
      const node = state.pair[cardSlot];
      const isFirst = cardSlot === firstSlot;
      card.classList.add('is-done', isFirst ? 'is-first' : 'is-second');
      if (cardSlot === slot) card.classList.add('is-picked');
      const button = card.querySelector('.wf-choice');
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('aria-label', `${node.name_fr} : ${formatAgo(node.appeared_mya)}${isFirst ? ', le premier !' : ''}${cardSlot === slot ? ' (ton choix)' : ''}`);
      const reveal = card.querySelector('.wf-reveal');
      reveal.replaceChildren(
        h('span', { class: 'wf-medal' }, isFirst ? '🥇 Le premier !' : '🥈 Arrivé après'),
        h('span', { class: 'wf-date' }, formatAgo(node.appeared_mya)),
        h('button', {
          type: 'button', class: 'btn btn-small btn-ghost wf-sheet',
          'aria-label': `Voir la fiche : ${node.name_fr}`, onclick: () => openCard(node.id),
        }, '📖 Voir la fiche'),
      );
      reveal.hidden = false;
    });

    const diff = older.appeared_mya - younger.appeared_mya;
    const next = h('button', { type: 'button', class: 'btn wf-next', onclick: newRound }, '🎲 Encore !');

    result.className = `wf-result ${good ? 'is-good' : 'is-almost'}`;
    result.replaceChildren(...[
      good && !prefersReducedMotion() ? burst() : null,
      h('p', { class: 'wf-verdict' },
        h('span', { class: 'wf-verdict-emoji', 'aria-hidden': 'true' }, good ? '🎉' : '🤏'),
        good ? pick(CHEERS) : 'Presque !'),
      good ? (state.streak >= 3 ? h('p', { class: 'wf-sub' }, `🔥 ${state.streak} bonnes réponses de suite, tu es en feu !`) : null)
        : h('p', { class: 'wf-sub' }, pick(ALMOST)),
      h('p', { class: 'wf-gap' },
        h('span', { 'aria-hidden': 'true' }, '⏳ '),
        `${older.emoji} ${older.name_fr} : `,
        h('strong', {}, `${formatAge(diff)} plus tôt`), ' !'),
      relation(older, younger),
      h('div', { class: 'wf-actions' }, next),
    ].filter(Boolean));
    next.focus({ preventScroll: true });
    result.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function burst() {
    const pieces = ['🎉', '⭐', '✨', '🌟', '🎊', '💫'];
    return h('div', { class: 'wf-burst', 'aria-hidden': 'true' },
      ...pieces.map((emoji, i) => h('span', { style: `--i: ${i}` }, emoji)));
  }

  // ---------- Clavier ----------

  const isVisible = () => !container.closest('[hidden]') && !document.querySelector('dialog[open]');

  document.addEventListener('keydown', (event) => {
    if (!isVisible() || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target.closest?.('input, textarea, select, [contenteditable="true"]')) return;

    if (state.phase === 'ask' && (event.key === '1' || event.key === '2')) {
      event.preventDefault();
      answer(Number(event.key) - 1);
      return;
    }
    const current = target.closest?.('.wf-choice');
    if (current && arena.contains(current) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const other = arena.querySelector(`.wf-choice[data-slot="${current.dataset.slot === '0' ? 1 : 0}"]`);
      other?.focus();
    }
  });

  newRound();
  return {};
}

// ---------- Petite grammaire pour les noms de groupes ----------

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// « les dinosaures », « les Tyrannosaurus rex », sinon « le groupe « Faune d'Édiacara » ».
function group(node) {
  const name = node.name_fr;
  const first = name.split(/[\s(]/)[0];
  const latin = /^[A-Z][a-z]+( [a-z]+)?$/.test(name);
  const frenchPlural = /[sx]$/i.test(first) && !/(us|yx|ops)$/i.test(first);
  if (frenchPlural) {
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    return { subject: `les ${lower}`, of: `des ${lower}`, plural: true };
  }
  if (latin) return { subject: `les ${name}`, of: `des ${name}`, plural: true };
  return { subject: `le groupe « ${name} »`, of: `du groupe « ${name} »`, plural: false };
}
