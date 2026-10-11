// Même logique que scripts/validate.py, côté navigateur.
// validateTree(data) renvoie { errors: [texte], byNode: Map(id → [texte]) }.
// Un nœud présent dans byNode est affiché avec un badge rouge.

export const CATEGORIES = [
  'origine', 'microbe', 'invertébré', 'poisson', 'amphibien', 'reptile',
  'dinosaure', 'oiseau', 'mammifère', 'primate', 'humain',
];

const DETAIL_KEYS = ['alimentation', 'habitat', 'taille', 'super_pouvoir', 'aujourdhui'];
const ID_RE = /^[a-z0-9_]+$/;

// [champ, types acceptés, obligatoire]
const NODE_FIELDS = [
  ['id', ['string'], true],
  ['name_fr', ['string'], true],
  ['name_sci', ['string'], true],
  ['appeared_mya', ['number'], true],
  ['extinct_mya', ['number', 'null'], false],
  ['parent_id', ['string', 'null'], true],
  ['category', ['string'], true],
  ['description', ['string'], true],
  ['description_enfant', ['string'], true],
  ['fun_fact', ['string'], true],
  ['emoji', ['string'], true],
  ['image', ['string'], true],
  ['image_alt', ['string'], true],
  ['image_credit', ['string'], true],
  ['image_license', ['string'], true],
  ['image_source_url', ['string'], true],
  ['image_commons', ['array'], false],
  ['era', ['string'], true],
  ['source', ['string'], true],
  ['source_url', ['string'], false],
  ['details', ['object'], false],
  ['heritage', ['string'], false],
];

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'invalid';
  return typeof value;
}

const fmt = (mya) => `${mya} Ma`;

export function validateTree(data) {
  const errors = [];
  const byNode = new Map();
  const nodes = new Map();

  const add = (id, message) => {
    errors.push(message);
    if (id) {
      if (!byNode.has(id)) byNode.set(id, []);
      byNode.get(id).push(message);
    }
  };

  const path = (id) => {
    const parts = [];
    const seen = new Set();
    let current = id;
    while (current != null && !seen.has(current)) {
      seen.add(current);
      parts.push(current);
      current = nodes.get(current)?.parent_id ?? null;
    }
    return parts.reverse().join(' › ');
  };

  const list = Array.isArray(data?.nodes) ? data.nodes : [];
  if (!list.length) add(null, '« nodes » doit être une liste non vide');

  const valid = [];
  list.forEach((node, index) => {
    if (kindOf(node) !== 'object') {
      add(null, `Nœud n° ${index + 1} : doit être un objet`);
      return;
    }
    const id = typeof node.id === 'string' ? node.id : null;
    const label = id ? `Nœud « ${id} »` : `Nœud n° ${index + 1}`;
    for (const [name, types, required] of NODE_FIELDS) {
      if (!(name in node)) {
        if (required) add(id, `${label} : champ obligatoire « ${name} » manquant`);
        continue;
      }
      const value = node[name];
      if (!types.includes(kindOf(value))) {
        add(id, `${label} : « ${name} » a un type invalide`);
      } else if (required && typeof value === 'string' && !value.trim()) {
        add(id, `${label} : « ${name} » est vide`);
      }
    }
    if (!id) return;
    if (!ID_RE.test(id)) add(id, `${label} : id invalide`);
    if (nodes.has(id)) {
      add(id, `${label} : id en double`);
      return;
    }
    nodes.set(id, node);
    valid.push(node);
  });

  const roots = valid.filter((n) => n.parent_id == null).map((n) => n.id);
  if (roots.length !== 1) {
    add(null, `L'arbre doit avoir exactement une racine (trouvé : ${roots.join(', ') || 'aucune'})`);
  }

  for (const node of valid) {
    const where = path(node.id);
    if (node.parent_id != null && !nodes.has(node.parent_id)) {
      add(node.id, `[${where}] parent_id « ${node.parent_id} » n'existe pas`);
    }
    if (typeof node.category === 'string' && !CATEGORIES.includes(node.category)) {
      add(node.id, `[${where}] catégorie « ${node.category} » non permise`);
    }
    const appeared = node.appeared_mya;
    const extinct = node.extinct_mya;
    if (typeof appeared === 'number' && appeared < 0) {
      add(node.id, `[${where}] appeared_mya négatif`);
    }
    if (typeof extinct === 'number' && typeof appeared === 'number' && extinct > appeared) {
      add(node.id, `[${where}] disparaît (${fmt(extinct)}) avant d'apparaître (${fmt(appeared)})`);
    }
    if (typeof node.image === 'string' && /^(https?:)?\/\//.test(node.image)) {
      add(node.id, `[${where}] l'image doit être un fichier local, pas un lien`);
    }
    if (kindOf(node.details) === 'object') {
      for (const [key, value] of Object.entries(node.details)) {
        if (DETAIL_KEYS.includes(key) && (typeof value !== 'string' || !value.trim())) {
          add(node.id, `[${where}] details.${key} doit être un texte non vide`);
        }
        if (key === 'question' && !(value?.question?.trim?.() && value?.reponse?.trim?.())) {
          add(node.id, `[${where}] details.question doit contenir « question » et « reponse »`);
        }
      }
    }
  }

  // Cycles
  const reported = new Set();
  for (const node of valid) {
    const seen = [];
    let current = node.id;
    while (current != null && nodes.has(current)) {
      const at = seen.indexOf(current);
      if (at !== -1) {
        const cycle = seen.slice(at);
        const key = [...cycle].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          const message = `Cycle dans l'arbre : ${[...cycle, current].join(' → ')}`;
          errors.push(message);
          cycle.forEach((id) => {
            if (!byNode.has(id)) byNode.set(id, []);
            byNode.get(id).push(message);
          });
        }
        break;
      }
      seen.push(current);
      current = nodes.get(current).parent_id;
    }
  }

  // Un descendant n'apparaît jamais avant son ancêtre.
  for (const node of valid) {
    const parent = nodes.get(node.parent_id);
    if (!parent) continue;
    if (typeof node.appeared_mya === 'number' && typeof parent.appeared_mya === 'number'
        && node.appeared_mya > parent.appeared_mya) {
      add(node.id, `[${path(node.id)}] apparaît avant son ancêtre : « ${node.id} » = ${fmt(node.appeared_mya)} > « ${parent.id} » = ${fmt(parent.appeared_mya)}`);
    }
  }

  return { errors, byNode };
}
