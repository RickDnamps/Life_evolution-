// Outils partagés par tous les modules du site.

export const CATEGORY_INFO = {
  'origine':    { label: 'Origine',     emoji: '✨', color: '#8e7cc3' },
  'microbe':    { label: 'Microbe',     emoji: '🦠', color: '#3fb6a8' },
  'invertébré': { label: 'Invertébré',  emoji: '🐚', color: '#f4a259' },
  'poisson':    { label: 'Poisson',     emoji: '🐟', color: '#3a86ff' },
  'amphibien':  { label: 'Amphibien',   emoji: '🐸', color: '#57cc99' },
  'reptile':    { label: 'Reptile',     emoji: '🦎', color: '#8ac926' },
  'dinosaure':  { label: 'Dinosaure',   emoji: '🦖', color: '#ff7b00' },
  'oiseau':     { label: 'Oiseau',      emoji: '🐦', color: '#00b4d8' },
  'mammifère':  { label: 'Mammifère',   emoji: '🐘', color: '#c77dff' },
  'primate':    { label: 'Primate',     emoji: '🐒', color: '#e76f51' },
  'humain':     { label: 'Humain',      emoji: '🧑', color: '#ef476f' },
};

// Âge de la Terre, en millions d'années (Ma).
export const EARTH_AGE_MYA = 4540;

const nf = (digits) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits });

// « 3,7 milliards d'années », « 520 millions d'années », « 300 000 ans »
export function formatAge(mya) {
  if (mya >= 1000) {
    const billions = mya / 1000;
    return `${nf(2).format(billions)} milliard${billions >= 2 ? 's' : ''} d'années`;
  }
  if (mya >= 1) {
    return `${nf(2).format(mya)} million${mya >= 2 ? 's' : ''} d'années`;
  }
  const years = Math.round(mya * 1e6);
  return `${nf(0).format(years)} ans`;
}

// « il y a 3,7 milliards d'années »
export const formatAgo = (mya) => (mya === 0 ? "aujourd'hui" : `il y a ${formatAge(mya)}`);

// Étiquette courte pour les axes : « 3,7 Md », « 520 M », « 300 000 ans »
export function formatShort(mya) {
  if (mya >= 1000) return `${nf(1).format(mya / 1000)} Md`;
  if (mya >= 1) return `${nf(1).format(mya)} M`;
  if (mya === 0) return 'Auj.';
  return `${nf(0).format(Math.round(mya * 1e6))} ans`;
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Index de l'arbre : nœuds par id, enfants triés du plus ancien au plus récent.
export function buildIndex(data) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const children = new Map(data.nodes.map((n) => [n.id, []]));
  let root = null;
  for (const node of data.nodes) {
    if (node.parent_id == null) root = node;
    else children.get(node.parent_id)?.push(node);
  }
  for (const list of children.values()) list.sort((a, b) => b.appeared_mya - a.appeared_mya);
  return { byId, children, root };
}

// Lignée de la racine jusqu'au nœud (inclus).
export function ancestors(index, id) {
  const line = [];
  const seen = new Set();
  let current = index.byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    line.unshift(current);
    current = index.byId.get(current.parent_id);
  }
  return line;
}

// Intervalle géologique le plus précis qui contient `mya` (période, sinon ère, sinon éon).
export function intervalAt(events, mya) {
  const rank = { period: 0, era: 1, eon: 2 };
  return events
    .filter((e) => e.type in rank && e.start_mya >= mya && (e.end_mya < mya || (mya === 0 && e.end_mya === 0)))
    .sort((a, b) => rank[a.type] - rank[b.type])[0] || null;
}

export function eraColor(events, mya) {
  const interval = intervalAt(events, mya);
  if (!interval) return '#cccccc';
  if (interval.color) return interval.color;
  return events.find((e) => e.id === interval.parent_id)?.color || '#cccccc';
}

// Crée un élément : h('button', { class: 'x', onclick }, 'texte', enfant…)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Image d'un nœud ; si le fichier manque, on affiche l'emoji à la place.
export function nodeImage(node, className = '') {
  const wrapper = h('div', { class: `node-img ${className}`.trim() });
  const img = h('img', { src: node.image, alt: node.image_alt || node.name_fr, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => {
    wrapper.replaceChildren(h('span', { class: 'node-img-emoji', role: 'img', 'aria-label': node.name_fr }, node.emoji));
  });
  wrapper.append(img);
  return wrapper;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
