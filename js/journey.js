// « Le grand voyage de tes ancêtres » : on suit la lignée de la racine jusqu'à un groupe
// (Homo sapiens par défaut), une étape à la fois. Pour la lignée humaine, chaque étape
// rappelle ce que tu as hérité de cet ancêtre (champ `heritage`).

import { ancestors, eraColor, formatAgo, h, nodeImage } from './utils.js';

const DEFAULT_TARGET = 'homo_sapiens';

export function mount(container, ctx) {
  const { data, index } = ctx;
  const leaves = data.nodes
    .filter((n) => !(index.children.get(n.id) || []).length)
    .sort((a, b) => a.name_fr.localeCompare(b.name_fr, 'fr'));
  let target = index.byId.has(DEFAULT_TARGET) ? DEFAULT_TARGET : leaves[0]?.id;
  let step = 0;
  let path = [];

  const select = h('select', { id: 'journey-target', class: 'jr-select' },
    leaves.map((n) => h('option', { value: n.id, selected: n.id === target }, `${n.emoji} ${n.name_fr}`)));
  select.addEventListener('change', () => { target = select.value; step = 0; render(); });

  const intro = h('div', { class: 'jr-intro' },
    h('p', { class: 'view-intro' }, 'Remonte ta famille jusqu\'aux toutes premières cellules ! À chaque étape, découvre ce que tu as hérité de tes très lointains ancêtres.'),
    h('label', { class: 'jr-label', for: 'journey-target' }, 'Le voyage de : '), select);

  const map = h('ol', { class: 'jr-map', 'aria-label': 'Toutes les étapes du voyage' });
  const stage = h('div', { class: 'jr-stage', 'aria-live': 'polite' });
  const prev = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go(step - 1) }, '◀ Avant');
  const next = h('button', { type: 'button', class: 'btn', onclick: () => go(step + 1) }, 'Étape suivante ▶');
  const counter = h('span', { class: 'jr-counter' });
  const bar = h('div', { class: 'jr-bar', role: 'progressbar', 'aria-valuemin': '1' }, h('span'));

  container.replaceChildren(intro, map, h('div', { class: 'jr-controls' }, prev, counter, next), bar, stage);

  container.addEventListener('keydown', (event) => {
    if (event.target === select) return;
    if (event.key === 'ArrowRight') { go(step + 1); event.preventDefault(); }
    if (event.key === 'ArrowLeft') { go(step - 1); event.preventDefault(); }
  });

  function go(i) {
    step = Math.max(0, Math.min(path.length - 1, i));
    render(false);
  }

  function render(rebuildMap = true) {
    path = ancestors(index, target);
    if (!path.length) return;
    if (rebuildMap) {
      map.replaceChildren(...path.map((node, i) => h('li', {},
        h('button', {
          type: 'button', class: 'jr-dot', title: node.name_fr, 'aria-label': `Étape ${i + 1} : ${node.name_fr}`,
          style: { '--era-color': eraColor(data.events, node.appeared_mya) },
          onclick: () => go(i),
        }, node.emoji))));
    }
    [...map.querySelectorAll('.jr-dot')].forEach((dot, i) => {
      dot.classList.toggle('is-done', i < step);
      if (i === step) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    map.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });

    const node = path[step];
    const last = step === path.length - 1;
    const isHuman = target === DEFAULT_TARGET;
    const destination = path[path.length - 1];
    const color = eraColor(data.events, node.appeared_mya);

    prev.disabled = step === 0;
    next.disabled = last;
    counter.textContent = `Étape ${step + 1} sur ${path.length}`;
    bar.setAttribute('aria-valuemax', String(path.length));
    bar.setAttribute('aria-valuenow', String(step + 1));
    bar.setAttribute('aria-label', counter.textContent);
    bar.firstChild.style.width = `${((step + 1) / path.length) * 100}%`;

    let heading;
    if (step === 0) heading = 'Tout commence ici…';
    else if (last) heading = isHuman ? 'Et te voilà !' : 'Arrivée !';
    else heading = isHuman ? 'Ton ancêtre était…' : `Un ancêtre ${destination.name_fr.startsWith('Les ') ? 'des' : 'de'} ${destination.name_fr}…`;

    const heritage = isHuman && node.heritage
      ? h('div', { class: 'jr-heritage' },
        h('span', { class: 'jr-heritage-icon', 'aria-hidden': 'true' }, '🎁'),
        h('div', {}, h('strong', {}, 'Ce que tu en as hérité : '), node.heritage))
      : null;

    const card = h('article', { class: 'jr-card', style: { '--era-color': color } },
      h('div', { class: 'jr-card-img' }, nodeImage(node)),
      h('div', { class: 'jr-card-body' },
        h('p', { class: 'jr-when' }, `🕰️ ${formatAgo(node.appeared_mya)} · ${node.era}`),
        h('h3', { class: 'jr-heading' }, heading),
        h('p', { class: 'jr-name' }, h('span', { 'aria-hidden': 'true' }, node.emoji), ` ${node.name_fr}`),
        h('p', {}, node.description_enfant),
        heritage,
        last ? h('p', { class: 'jr-finish' }, isHuman
          ? `Bravo ! Tu viens de parcourir ${formatAgo(path[0].appeared_mya).replace('il y a ', '')} d'histoire en ${path.length} étapes. Tous ces êtres vivants font partie de ta grande famille !`
          : `Bravo ! ${path.length} étapes depuis les premières traces de vie.`) : null,
        h('div', { class: 'chips' },
          h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => ctx.openCard(node.id) }, '📖 Voir la fiche'),
          last ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => go(0) }, '🔁 Recommencer') : null)));

    stage.replaceChildren(card);
  }

  render();
  return {};
}
