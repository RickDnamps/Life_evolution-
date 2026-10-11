// L'arbre de la vie dépliable.
// Chaque groupe a une flèche ▸ qui dévoile ses descendants ; son nom ouvre sa fiche.
// Clavier : ↑ ↓ pour se déplacer, → pour ouvrir, ← pour fermer ou remonter au parent.

import { CATEGORY_INFO, ancestors, eraColor, formatAgo, h, intervalAt } from './utils.js';

export function mountTree(container, ctx) {
  const { data, index, validation, openCard } = ctx;
  const rows = new Map(); // id → { li, toggle, children, name }

  renderLegend(document.getElementById('tree-legend'), data);

  const build = (node, depth) => {
    const kids = index.children.get(node.id) || [];
    const color = eraColor(data.events, node.appeared_mya);
    const category = CATEGORY_INFO[node.category];
    const childrenId = `tree-children-${node.id}`;

    const toggle = kids.length
      ? h('button', {
        type: 'button', class: 'tree-toggle', 'aria-expanded': 'false', 'aria-controls': childrenId,
        'aria-label': `Afficher les descendants : ${node.name_fr}`,
        onclick: () => setOpen(node.id, toggle.getAttribute('aria-expanded') !== 'true'),
      }, '▸')
      : h('span', { class: 'tree-toggle-spacer', 'aria-hidden': 'true' }, '•');

    const name = h('button', {
      type: 'button', class: 'tree-name', 'data-id': node.id,
      onclick: () => openCard(node.id),
      title: category ? category.label : '',
    },
    h('span', { class: 'tree-emoji', 'aria-hidden': 'true' }, node.emoji),
    h('span', { class: 'tree-label' },
      h('span', {}, node.name_fr),
      h('small', {}, formatAgo(node.appeared_mya))));

    const row = h('div', { class: 'tree-row', style: { '--era-color': color } },
      toggle, name,
      node.extinct_mya != null ? h('span', { class: 'badge-extinct', title: `Disparu ${formatAgo(node.extinct_mya)}` }, 'disparu') : null,
      kids.length ? h('span', { class: 'tree-count', title: 'Nombre de groupes descendants' }, `${countDescendants(node.id)} ⤵`) : null);

    const children = kids.length
      ? h('ul', { id: childrenId, class: 'tree-children', role: 'group', hidden: true }, ...kids.map((kid) => build(kid, depth + 1)))
      : null;

    const li = h('li', { 'data-id': node.id }, row, children);
    rows.set(node.id, { li, row, toggle: kids.length ? toggle : null, children, name });
    return li;
  };

  const countDescendants = (id) => (index.children.get(id) || [])
    .reduce((sum, kid) => sum + 1 + countDescendants(kid.id), 0);

  function setOpen(id, open) {
    const entry = rows.get(id);
    if (!entry?.toggle) return;
    entry.toggle.setAttribute('aria-expanded', String(open));
    entry.toggle.setAttribute('aria-label', `${open ? 'Cacher' : 'Afficher'} les descendants : ${index.byId.get(id).name_fr}`);
    entry.children.hidden = !open;
  }

  function setAll(open) {
    for (const id of rows.keys()) setOpen(id, open);
    if (!open && index.root) setOpen(index.root.id, true);
  }

  function addBadge(id) {
    const entry = rows.get(id);
    const problems = validation.byNode.get(id);
    if (!entry || !problems?.length) return;
    entry.row.querySelector('.badge-invalid')?.remove();
    entry.row.append(h('span', {
      class: 'badge-invalid', role: 'img',
      'aria-label': `Problème dans les données : ${problems.join(' ; ')}`,
      title: problems.join('\n'),
    }, '!'));
  }

  // Ouvre tous les ancêtres d'un nœud et le fait briller.
  function reveal(id) {
    for (const node of ancestors(index, id).slice(0, -1)) setOpen(node.id, true);
    const entry = rows.get(id);
    if (!entry) return;
    entry.row.classList.remove('is-highlight');
    void entry.row.offsetWidth; // relance l'animation
    entry.row.classList.add('is-highlight');
    entry.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    entry.name.focus({ preventScroll: true });
  }

  if (!index.root) return {};
  container.replaceChildren(h('ul', { role: 'list' }, build(index.root, 0)));
  setOpen(index.root.id, true);
  for (const id of validation.byNode.keys()) addBadge(id);
  document.addEventListener('validation-change', (event) => addBadge(event.detail.id));

  document.querySelectorAll('[data-tree]').forEach((button) => {
    button.addEventListener('click', () => setAll(button.dataset.tree === 'open'));
  });

  // Navigation au clavier entre les noms visibles.
  container.addEventListener('keydown', (event) => {
    const current = event.target.closest('.tree-row');
    if (!current) return;
    const id = current.parentElement.dataset.id;
    const visible = [...container.querySelectorAll('.tree-name')].filter((el) => el.offsetParent !== null);
    const position = visible.indexOf(current.querySelector('.tree-name'));
    const entry = rows.get(id);

    switch (event.key) {
      case 'ArrowDown':
        visible[Math.min(position + 1, visible.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        visible[Math.max(position - 1, 0)]?.focus();
        break;
      case 'ArrowRight':
        if (entry.toggle && entry.children.hidden) setOpen(id, true);
        else if (entry.toggle) rows.get(index.children.get(id)[0].id)?.name.focus();
        break;
      case 'ArrowLeft': {
        if (entry.toggle && !entry.children.hidden) setOpen(id, false);
        else {
          const parentId = index.byId.get(id).parent_id;
          if (parentId) rows.get(parentId).name.focus();
        }
        break;
      }
      case 'Home': visible[0]?.focus(); break;
      case 'End': visible[visible.length - 1]?.focus(); break;
      default: return;
    }
    event.preventDefault();
  });

  ctx.revealInTree = (id) => { ctx.navigate('arbre'); setTimeout(() => reveal(id), 80); };
  return { reveal };
}

// Légende : une pastille par ère représentée dans l'arbre, de la plus ancienne à la plus récente.
function renderLegend(target, data) {
  if (!target) return;
  const byId = new Map(data.events.map((e) => [e.id, e]));
  const eras = new Map();
  for (const node of data.nodes) {
    let interval = intervalAt(data.events, node.appeared_mya);
    while (interval && interval.type === 'period') interval = byId.get(interval.parent_id);
    if (interval) eras.set(interval.id, interval);
  }
  const chips = [...eras.values()]
    .sort((a, b) => b.start_mya - a.start_mya)
    .map((era) => h('span', { class: 'legend-item', style: { '--cat-color': era.color || '#ccc' } },
      h('span', { class: 'legend-dot', 'aria-hidden': 'true' }), era.name_fr));
  target.replaceChildren(h('span', { class: 'legend-hint' }, 'Couleur du cadre = ère d\'apparition :'), ...chips);
}
