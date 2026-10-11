// Fiche détaillée d'un groupe, affichée dans une fenêtre <dialog>.

import { CATEGORY_INFO, ancestors, eraColor, formatAgo, getLevel, h, nodeFunFact, nodeImage, nodeSummary } from './utils.js';
import { speakButton, stopSpeaking } from './speech.js';

const DETAILS = [
  ['alimentation', '🍽️', 'Au menu'],
  ['habitat', '🏞️', 'Sa maison'],
  ['taille', '📏', 'Sa taille'],
  ['super_pouvoir', '⚡', 'Son super-pouvoir'],
  ['aujourdhui', '🔭', "Et aujourd'hui ?"],
];

const SEEN_KEY = 'groupes-decouverts';

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); }
}

function saveSeen(seen) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch (e) { /* ignoré */ }
}

export function createCard(ctx) {
  const dialog = document.getElementById('card');
  const body = document.getElementById('card-body');
  const seen = loadSeen();

  let openId = null;

  // Un clic sur le fond sombre ferme la fiche.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    stopSpeaking();
    openId = null;
    // Le lien partageable (#fiche/…) disparaît quand on ferme la fiche.
    if (location.hash.startsWith('#fiche/')) history.replaceState(null, '', `#${ctx.currentView?.() || 'accueil'}`);
  });
  // Si le profil d'âge change pendant qu'une fiche est ouverte, on la réaffiche.
  document.addEventListener('level-change', () => { if (openId && dialog.open) body.replaceChildren(...render(ctx.index.byId.get(openId))); });

  function open(id) {
    const node = ctx.index.byId.get(id);
    if (!node) return;
    seen.add(id);
    saveSeen(seen);
    openId = id;
    body.replaceChildren(...render(node));
    body.scrollTop = 0;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.card-close')?.focus();
  }

  function relativeButtons(nodes) {
    return nodes.map((other) => h('li', {},
      h('button', { type: 'button', onclick: () => open(other.id) }, `${other.emoji} ${other.name_fr}`)));
  }

  function render(node) {
    const { data, index, validation } = ctx;
    const color = eraColor(data.events, node.appeared_mya);
    const category = CATEGORY_INFO[node.category];
    const extinct = node.extinct_mya != null;
    const line = ancestors(index, node.id);
    const parent = index.byId.get(node.parent_id);
    const kids = index.children.get(node.id) || [];
    const cousins = parent ? (index.children.get(parent.id) || []).filter((n) => n.id !== node.id) : [];
    const problems = validation.byNode.get(node.id) || [];
    const details = node.details || {};
    const level = getLevel();
    const expert = level === 'grands' || level === 'adultes';

    const hero = h('div', { class: 'card-hero', style: { '--era-color': color } },
      h('button', { type: 'button', class: 'card-close', 'aria-label': 'Fermer la fiche', onclick: () => dialog.close() }, '✕'),
      nodeImage(node));

    const chips = h('div', { class: 'chips' },
      h('span', { class: 'chip', style: { '--chip-bg': color, '--chip-ink': '#1d1d1f' } }, `🕰️ Apparu ${formatAgo(node.appeared_mya)}`),
      h('span', { class: 'chip' }, `🌍 ${node.era}`),
      category ? h('span', { class: 'chip', style: { '--chip-bg': category.color, '--chip-ink': '#1d1d1f' } }, `${category.emoji} ${category.label}`) : null,
      extinct
        ? h('span', { class: 'chip' }, `🪦 Disparu ${formatAgo(node.extinct_mya)}`)
        : h('span', { class: 'chip' }, '💚 Existe encore'));

    const shown = level === 'petits' ? DETAILS.filter(([key]) => ['alimentation', 'habitat', 'taille'].includes(key)) : DETAILS;
    const facts = shown.filter(([key]) => details[key]).map(([key, emoji, label]) => h('div', { class: 'fact' },
      h('dt', {}, h('span', { 'aria-hidden': 'true' }, emoji), label),
      h('dd', {}, details[key])));

    let question = null;
    if (details.question?.question) {
      const answer = h('p', { class: 'curious-answer', hidden: true }, details.question.reponse);
      const reveal = h('button', {
        type: 'button', class: 'btn btn-small btn-secondary', 'aria-expanded': 'false',
        onclick: () => {
          answer.hidden = false;
          reveal.setAttribute('aria-expanded', 'true');
          reveal.remove();
        },
      }, '💡 Voir la réponse');
      question = h('div', { class: 'curious-question' },
        h('p', {}, `🤔 ${details.question.question}`), reveal, answer);
    }

    const curious = (facts.length || question)
      ? h('details', { class: 'more', open: true },
        h('summary', {}, 'Pour les curieux'),
        h('div', { class: 'more-content' }, facts.length ? h('dl', { class: 'facts' }, facts) : null, question))
      : null;

    const family = h('div', {},
      h('h3', { class: 'card-section-title' }, '🌳 Sa famille'),
      h('p', { class: 'card-sci' }, 'Ses ancêtres, depuis les tout débuts de la vie :'),
      h('ol', { class: 'lineage' }, relativeButtons(line.slice(0, -1))),
      kids.length ? [h('p', { class: 'card-sci' }, 'Ses descendants :'), h('ul', { class: 'relatives' }, relativeButtons(kids))] : null,
      cousins.length ? [h('p', { class: 'card-sci' }, 'Ses groupes frères (ses plus proches cousins) :'), h('ul', { class: 'relatives' }, relativeButtons(cousins))] : null);

    const adult = h('details', { class: 'more', open: level === 'adultes' },
      h('summary', {}, expert ? 'Sources et nom scientifique' : 'En savoir plus'),
      h('div', { class: 'more-content' },
        expert
          ? h('p', {}, '🔬 Nom scientifique : ', h('em', {}, node.name_sci))
          : h('p', {}, node.description),
        h('p', { class: 'card-sci' }, '📚 Source de la date : ',
          node.source_url ? h('a', { href: node.source_url, target: '_blank', rel: 'noopener' }, node.source) : node.source)));

    const errors = problems.length
      ? h('div', { class: 'card-errors', role: 'note' },
        h('strong', {}, '⚠ Problème dans les données de ce groupe :'),
        h('ul', {}, problems.map((p) => h('li', {}, p))))
      : null;

    const credit = h('p', { class: 'card-credit' }, '🖼️ Image : ', node.image_credit, ' · ',
      node.image_source_url ? h('a', { href: node.image_source_url, target: '_blank', rel: 'noopener' }, node.image_license) : node.image_license);

    const total = data.nodes.length;
    const progress = h('p', { class: 'card-progress' }, `🏅 Tu as découvert ${seen.size} groupe${seen.size > 1 ? 's' : ''} sur ${total} !`);

    const content = h('div', { class: 'card-content' },
      h('h2', { class: 'card-title', id: 'card-title' }, h('span', { 'aria-hidden': 'true' }, node.emoji), node.name_fr),
      h('p', { class: 'card-sci' }, node.name_sci),
      chips,
      errors,
      h('p', { class: 'card-kid' }, nodeSummary(node, level)),
      h('div', { class: 'chips' },
        speakButton(() => `${node.name_fr}. ${nodeSummary(node, getLevel())} Le savais-tu ? ${nodeFunFact(node, getLevel())}`),
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: (event) => share(node, event.currentTarget) }, '🔗 Partager')),
      h('div', { class: 'fun-fact' },
        h('span', { class: 'fun-fact-icon', 'aria-hidden': 'true' }, '🤩'),
        h('div', {}, h('strong', {}, 'Le savais-tu ?'), nodeFunFact(node, level))),
      curious,
      family,
      adult,
      h('div', { class: 'chips card-actions' },
        h('button', {
          type: 'button', class: 'btn btn-small',
          onclick: () => { dialog.close(); ctx.revealInTree?.(node.id); },
        }, '🌳 Voir dans l\'arbre')),
      progress,
      credit);

    return [hero, content];
  }

  // Lien direct vers la fiche (#fiche/<id>), pratique pour les enseignants.
  async function share(node, button) {
    const url = `${location.origin}${location.pathname}#fiche/${node.id}`;
    const label = button.textContent;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: `${node.name_fr} · La grande aventure de la vie sur Terre`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      button.textContent = '✅ Lien copié !';
    } catch (e) {
      button.textContent = '🔗 ' + url;
    }
    setTimeout(() => { button.textContent = label; }, 2500);
  }

  return { open, isOpen: () => dialog.open };
}
