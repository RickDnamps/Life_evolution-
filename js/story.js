// « Le grand début » : l'histoire de la Terre, de sa naissance aux premiers êtres vivants,
// racontée chapitre par chapitre avec un décor animé (données : `story`).

import { EARTH_AGE_MYA, formatAgo, h } from './utils.js';

// Position sur l'horloge de 24 heures (0 h 00 = naissance de la Terre).
function clockLabel(mya) {
  if (mya > EARTH_AGE_MYA) return 'Avant même le début de l\'horloge de 24 heures !';
  const seconds = Math.floor((1 - mya / EARTH_AGE_MYA) * 86400);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `Sur l'horloge de 24 heures : ${hours} h ${String(minutes).padStart(2, '0')}`;
}

// Petits éléments décoratifs répétés (étoiles, bulles, gouttes…).
const repeat = (count, make) => Array.from({ length: count }, (_, i) => make(i));
const at = (i, n, spread = 100) => `${((i * 37) % n) * (spread / n) + 2}%`;

const SCENES = {
  nebuleuse: () => [
    h('div', { class: 'st-disc' }),
    h('div', { class: 'st-sun' }),
    ...repeat(18, (i) => h('span', { class: 'st-star', style: { left: at(i, 18), top: at(i * 7, 18), '--d': `${(i % 6) * 0.4}s` } })),
    h('div', { class: 'st-ring' }, ...repeat(6, (i) => h('span', { class: 'st-rock', style: { '--a': `${i * 60}deg` } }))),
  ],
  lave: () => [
    h('div', { class: 'st-planet st-planet-lava' }, h('span', { class: 'st-crack c1' }), h('span', { class: 'st-crack c2' }), h('span', { class: 'st-crack c3' })),
    ...repeat(5, (i) => h('span', { class: 'st-meteor', style: { left: `${10 + i * 18}%`, '--d': `${i * 0.7}s` } })),
  ],
  lune: () => [
    h('div', { class: 'st-planet st-planet-young' }),
    h('div', { class: 'st-theia' }),
    h('div', { class: 'st-flash' }),
    h('div', { class: 'st-moon-orbit' }, h('div', { class: 'st-moon' })),
  ],
  ocean: () => [
    h('div', { class: 'st-cloud k1' }), h('div', { class: 'st-cloud k2' }),
    h('div', { class: 'st-rain' }),
    h('div', { class: 'st-volcano' }, h('span', { class: 'st-steam' })),
    h('div', { class: 'st-sea' }),
  ],
  recette: () => [
    h('div', { class: 'st-water' }),
    ...repeat(12, (i) => h('span', { class: 'st-bubble', style: { left: at(i, 12), '--d': `${(i % 5) * 0.8}s`, '--s': `${10 + (i % 4) * 6}px` } })),
    ...repeat(4, (i) => h('span', { class: 'st-molecule', style: { left: `${12 + i * 22}%`, top: `${25 + (i % 2) * 30}%`, '--d': `${i * 0.6}s` } },
      h('i'), h('i'), h('i'))),
  ],
  luca: () => [
    h('div', { class: 'st-water st-deep' }),
    h('div', { class: 'st-vent' }, h('span', { class: 'st-smoke' }), h('span', { class: 'st-smoke s2' })),
    h('div', { class: 'st-cell' }, h('span', { class: 'st-cell-core' })),
    ...repeat(8, (i) => h('span', { class: 'st-bubble', style: { left: at(i, 8), '--d': `${(i % 4) * 0.9}s`, '--s': '10px' } })),
  ],
  microbes: () => [
    h('div', { class: 'st-sky' }),
    h('div', { class: 'st-sun st-sun-small' }),
    h('div', { class: 'st-shallow' }),
    ...repeat(5, (i) => h('span', { class: 'st-stromatolite', style: { left: `${6 + i * 19}%`, '--w': `${70 + (i % 3) * 25}px` } })),
    ...repeat(14, (i) => h('span', { class: 'st-microbe', style: { left: at(i, 14), top: `${55 + (i % 4) * 8}%`, '--d': `${(i % 5) * 0.5}s` } })),
  ],
};

export function mount(container, ctx) {
  const chapters = ctx.data.story || [];
  if (!chapters.length) {
    container.replaceChildren(h('p', {}, 'Cette histoire n\'est pas encore écrite.'));
    return {};
  }
  let step = 0;

  const map = h('ol', { class: 'jr-map st-map', 'aria-label': 'Chapitres de l\'histoire' },
    chapters.map((chapter, i) => h('li', {},
      h('button', {
        type: 'button', class: 'jr-dot', title: chapter.title, 'aria-label': `Chapitre ${i + 1} : ${chapter.title}`,
        style: { '--era-color': '#ffb703' }, onclick: () => go(i),
      }, chapter.emoji))));
  const prev = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go(step - 1) }, '◀ Avant');
  const next = h('button', { type: 'button', class: 'btn', onclick: () => go(step + 1) }, 'Et ensuite ? ▶');
  const counter = h('span', { class: 'jr-counter' });
  const stage = h('div', { class: 'st-stage', 'aria-live': 'polite' });

  container.replaceChildren(
    h('p', { class: 'view-intro' }, 'Avant les dinosaures, avant les poissons, avant même le premier microbe… comment tout a commencé ? Remonte au tout début de l\'histoire de la Terre !'),
    map,
    h('div', { class: 'jr-controls' }, prev, counter, next),
    stage,
  );

  container.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { go(step + 1); event.preventDefault(); }
    if (event.key === 'ArrowLeft') { go(step - 1); event.preventDefault(); }
  });

  function go(i) {
    step = Math.max(0, Math.min(chapters.length - 1, i));
    render();
  }

  function render() {
    const chapter = chapters[step];
    const last = step === chapters.length - 1;
    prev.disabled = step === 0;
    next.disabled = last;
    counter.textContent = `Chapitre ${step + 1} sur ${chapters.length}`;
    [...map.querySelectorAll('.jr-dot')].forEach((dot, i) => {
      dot.classList.toggle('is-done', i < step);
      if (i === step) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });

    let question = null;
    if (chapter.question) {
      const answer = h('p', { class: 'curious-answer', hidden: true }, chapter.question.reponse);
      const reveal = h('button', {
        type: 'button', class: 'btn btn-small btn-secondary',
        onclick: () => { answer.hidden = false; reveal.remove(); },
      }, '💡 Voir la réponse');
      question = h('div', { class: 'curious-question' }, h('p', {}, `🤔 ${chapter.question.question}`), reveal, answer);
    }

    const node = chapter.node_id ? ctx.index.byId.get(chapter.node_id) : null;
    const actions = last
      ? h('div', { class: 'st-next' },
        h('p', { class: 'st-next-title' }, '🎉 La suite de l\'histoire t\'attend !'),
        h('div', { class: 'chips' },
          h('a', { class: 'btn', href: '#arbre' }, '🌳 L\'arbre de la vie'),
          h('a', { class: 'btn btn-secondary', href: '#voyage' }, '🧬 Le voyage de tes ancêtres'),
          h('a', { class: 'btn btn-ghost', href: '#frise' }, '🕰️ La ligne du temps')))
      : null;

    stage.replaceChildren(h('article', { class: 'st-card' },
      h('div', { class: `st-scene st-scene-${chapter.scene}`, 'aria-hidden': 'true' }, (SCENES[chapter.scene] || (() => []))()),
      h('div', { class: 'st-body' },
        h('div', { class: 'chips' },
          h('span', { class: 'chip' }, `🕰️ ${chapter.date_label || formatAgo(chapter.mya)}`),
          h('span', { class: 'chip' }, `⏰ ${clockLabel(chapter.mya)}`)),
        h('h3', { class: 'st-title' }, h('span', { 'aria-hidden': 'true' }, chapter.emoji), ` ${chapter.title}`),
        h('p', { class: 'st-text' }, chapter.text_enfant),
        h('div', { class: 'fun-fact' },
          h('span', { class: 'fun-fact-icon', 'aria-hidden': 'true' }, '🤩'),
          h('div', {}, h('strong', {}, 'Le savais-tu ?'), chapter.fun_fact)),
        question,
        node ? h('div', { class: 'chips' },
          h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => ctx.openCard(node.id) }, `📖 Voir la fiche : ${node.name_fr}`)) : null,
        actions,
        h('p', { class: 'card-credit' }, '📚 Source : ',
          chapter.source_url ? h('a', { href: chapter.source_url, target: '_blank', rel: 'noopener' }, chapter.source) : chapter.source))));
  }

  render();
  return {};
}
