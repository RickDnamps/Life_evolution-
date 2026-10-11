// « Remonter le temps » : rendre les durées immenses concrètes.
// L'enfant choisit une destination ; on calcule le voyage à 1 an par seconde,
// la pile de feuilles, les pas et la règle de 1 mètre.

import { EARTH_AGE_MYA, formatAgo, h, prefersReducedMotion } from './utils.js';

// Destinations proposées (seulement celles qui existent dans les données).
// `label` : le groupe dans une phrase ; `short` : le nom sur la carte.
const DESTINATIONS = [
  { id: 'homo_sapiens', short: 'Homo sapiens', label: 'les premiers Homo sapiens' },
  { id: 'australopitheques', short: 'Australo\u00ADpithèques', label: 'les premiers australopithèques (la famille de Lucy)' },
  { id: 't_rex', short: 'T. rex', label: 'les T. rex' },
  { id: 'archaeopteryx', short: 'Archaeopteryx', label: 'Archaeopteryx, le premier oiseau' },
  { id: 'mammiferes', short: 'Premiers mammifères', label: 'les premiers mammifères' },
  { id: 'dinosaures', short: 'Dinosaures', label: 'les premiers dinosaures' },
  { id: 'tiktaalik', short: 'Tiktaalik', label: 'Tiktaalik, le poisson à pattes' },
  { id: 'trilobites', short: 'Trilobites', label: 'les premiers trilobites' },
  { id: 'animaux', short: 'Premiers animaux', label: 'les premiers animaux' },
  { id: 'vie', short: 'Premières traces de vie', label: 'les premières traces de vie' },
];
const DEFAULT_ID = 'dinosaures';

// ---------- Constantes des comparaisons (toutes vérifiables de tête) ----------

export const SECONDS_PER_YEAR = 365.25 * 24 * 3600; // ≈ 31,6 millions de secondes
const PAPER_MM = 0.1;          // une feuille de papier : 0,1 mm
const STEP_M = 0.6;            // un pas d'enfant : environ 60 cm
const EIFFEL_M = 330;          // tour Eiffel
const EVEREST_M = 8849;        // mont Everest
const ISS_KM = 400;            // Station spatiale internationale
const BUS_M = 12;              // un autobus
const CHILD_M = 1.3;           // un enfant de 8 ans
const FIELD_M = 100;           // un terrain de foot
const HAIR_MM = 0.07;          // épaisseur d'un cheveu
const WALK_KMH = 5;            // marche tranquille

const nf = (digits = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits });
const fmt = (value, digits = 0) => nf(digits).format(value);

// Arrondi « gentil » : 2 chiffres significatifs au-delà de 10, 1 décimale en dessous.
function nice(value) {
  if (value >= 100) return fmt(Math.round(value / 10 ** (Math.floor(Math.log10(value)) - 1)) * 10 ** (Math.floor(Math.log10(value)) - 1));
  if (value >= 10) return fmt(Math.round(value));
  return fmt(value, 1);
}

const finish = (text) => (/[!?.]$/.test(text) ? text : `${text}.`);
const plural = (n, one, many) => `${fmt(n)} ${n >= 2 ? many : one}`;

// Durée de voyage, en mots simples.
export function travelText(seconds) {
  const hour = 3600;
  const day = 24 * hour;
  if (seconds < hour) return plural(Math.max(1, Math.round(seconds / 60)), 'minute', 'minutes');
  if (seconds < 2 * day) return plural(Math.round(seconds / hour), 'heure', 'heures');
  if (seconds < 14 * day) {
    const days = Math.floor(seconds / day);
    const hours = Math.round((seconds - days * day) / hour);
    return hours ? `${plural(days, 'jour', 'jours')} et ${plural(hours, 'heure', 'heures')}` : plural(days, 'jour', 'jours');
  }
  if (seconds < 0.25 * SECONDS_PER_YEAR) return `${plural(Math.round(seconds / day), 'jour', 'jours')} (environ ${plural(Math.round(seconds / (7 * day)), 'semaine', 'semaines')})`;
  const years = seconds / SECONDS_PER_YEAR;
  if (years < 20) {
    let whole = Math.floor(years);
    let months = Math.round((years - whole) * 12);
    if (months === 12) { whole += 1; months = 0; }
    if (!whole) return `${fmt(months)} mois`;
    return months ? `${plural(whole, 'an', 'ans')} et ${fmt(months)} mois` : plural(whole, 'an', 'ans');
  }
  return plural(Math.round(years), 'an', 'ans');
}

// Tous les calculs pour une destination située il y a `mya` millions d'années.
export function computeScale(mya) {
  const years = mya * 1e6;
  const seconds = years; // 1 an par seconde
  const travelYears = seconds / SECONDS_PER_YEAR;

  // Pile de feuilles : 1 feuille (0,1 mm) par année.
  const paperM = (years * PAPER_MM) / 1000;
  let paperCompare;
  if (paperM < 100) paperCompare = `à peu près un immeuble de ${plural(Math.max(1, Math.round(paperM / 3)), 'étage', 'étages')}`;
  else if (paperM < EIFFEL_M) paperCompare = `un gratte-ciel d'environ ${fmt(Math.round(paperM / 3))} étages${paperM >= 0.75 * EIFFEL_M ? `, presque la tour Eiffel (${fmt(EIFFEL_M)} m)` : ''}`;
  else if (paperM < EVEREST_M) {
    paperCompare = `environ ${nice(paperM / EIFFEL_M)} fois la tour Eiffel (${fmt(EIFFEL_M)} m)`;
    if (paperM >= 0.75 * EVEREST_M) paperCompare += ', presque la hauteur de l\'Everest';
  } else if (paperM < 100000) paperCompare = `environ ${nice(paperM / EVEREST_M)} fois la hauteur de l'Everest (${fmt(EVEREST_M / 1000, 1)} km)`;
  else paperCompare = paperM / 1000 < ISS_KM
    ? `presque jusqu'à la Station spatiale internationale, qui vole à environ ${fmt(ISS_KM)} km`
    : `plus haut que la Station spatiale internationale (environ ${fmt(ISS_KM)} km) !`;
  const paperText = paperM >= 1000 ? `${paperM < 100000 ? fmt(paperM / 1000, 1) : nice(paperM / 1000)} km` : `${nice(paperM)} m`;

  // Un pas (60 cm) par million d'années.
  const steps = mya;
  const stepsM = steps * STEP_M;
  let stepsText;
  let stepsCompare;
  if (steps < 1) {
    stepsText = `${fmt(Math.round(stepsM * 100))} cm`;
    stepsCompare = 'même pas un pas entier, un vrai pas de fourmi !';
  } else if (stepsM < BUS_M) {
    stepsText = stepsM < 1 ? `${fmt(Math.round(stepsM * 100))} cm` : `${fmt(stepsM, 1)} m`;
    const ratio = stepsM / CHILD_M;
    if (ratio < 0.8) stepsCompare = `moins que ta taille (si tu mesures ${fmt(CHILD_M, 2)} m)`;
    else stepsCompare = ratio < 1.25
      ? `à peu près ta taille (si tu mesures ${fmt(CHILD_M, 2)} m)`
      : `environ ${nice(ratio)} fois ta taille (si tu mesures ${fmt(CHILD_M, 2)} m)`;
  } else if (stepsM < FIELD_M) {
    stepsText = `${nice(stepsM)} m`;
    stepsCompare = `environ ${nice(stepsM / BUS_M)} autobus mis bout à bout (${fmt(BUS_M)} m chacun)`;
  } else if (stepsM < 1000) {
    stepsText = `${nice(stepsM)} m`;
    const fields = stepsM / FIELD_M;
    stepsCompare = `environ ${nice(fields)} ${fields >= 2 ? 'terrains' : 'terrain'} de foot (${fmt(FIELD_M)} m chacun)`;
  } else {
    const km = stepsM / 1000;
    const minutes = Math.round(((km / WALK_KMH) * 60) / 5) * 5;
    stepsText = `${fmt(km, 1)} km`;
    stepsCompare = `environ ${fmt(minutes)} minutes de marche`;
  }

  // Toute l'histoire de la Terre sur une règle de 1 mètre.
  const rulerMm = (mya / EARTH_AGE_MYA) * 1000;
  let rulerText;
  let rulerCompare;
  if (rulerMm >= 10) {
    rulerText = `${fmt(rulerMm / 10, 1)} cm`;
    rulerCompare = rulerMm >= 600 ? 'presque toute la règle !' : 'tout le reste de la règle, c\'est encore avant !';
  } else if (rulerMm >= 1) {
    rulerText = `${fmt(rulerMm, 1)} mm`;
    rulerCompare = 'seulement quelques millimètres !';
  } else if (rulerMm >= HAIR_MM * 1.5) {
    rulerText = `${fmt(rulerMm, 2)} mm`;
    rulerCompare = 'moins d\'un millimètre, comme un trait de crayon !';
  } else {
    rulerText = `${fmt(rulerMm, 2)} mm`;
    rulerCompare = 'à peu près l\'épaisseur d\'un cheveu !';
  }

  return {
    mya, years, seconds, travelYears,
    travel: travelText(seconds),
    paperM, paperText, paperCompare,
    steps, stepsM, stepsText, stepsCompare,
    rulerMm, rulerText, rulerCompare,
    share: mya / EARTH_AGE_MYA,
  };
}

export function mount(container, ctx) {
  const { index, openCard } = ctx;

  let destinations = DESTINATIONS
    .map((d) => ({ ...d, node: index.byId.get(d.id) }))
    .filter((d) => d.node && Number.isFinite(d.node.appeared_mya));
  if (destinations.length < 3) {
    // Données différentes de prévu : on prend quelques groupes répartis dans le temps.
    const all = [...index.byId.values()].filter((n) => Number.isFinite(n.appeared_mya) && n.appeared_mya > 0)
      .sort((a, b) => a.appeared_mya - b.appeared_mya);
    const step = Math.max(1, Math.floor(all.length / 8));
    destinations = all.filter((_, i) => i % step === 0).slice(0, 9)
      .map((n) => ({ id: n.id, short: n.name_fr, label: n.name_fr, node: n }));
  }
  destinations.sort((a, b) => a.node.appeared_mya - b.node.appeared_mya);
  if (!destinations.length) {
    container.replaceChildren(h('p', { class: 'view-intro' }, 'La machine à remonter le temps est en réparation… reviens bientôt ! 🔧'));
    return {};
  }

  let current = destinations.find((d) => d.id === DEFAULT_ID) || destinations[Math.floor(destinations.length / 2)];
  let counterFrame = 0;

  // ---------- Structure ----------

  const picker = h('fieldset', { class: 'sc-picker' },
    h('legend', {}, h('span', { 'aria-hidden': 'true' }, '🎯 '), 'Choisis ta destination'),
    h('div', { class: 'sc-options' }, ...destinations.map((d) => h('label', { class: 'sc-option' },
      h('input', {
        type: 'radio', name: 'sc-destination', value: d.id, checked: d === current,
        onchange: () => { current = d; render(true); },
      }),
      h('span', { class: 'sc-option-body' },
        h('span', { class: 'sc-option-emoji', 'aria-hidden': 'true' }, d.node.emoji),
        h('span', { class: 'sc-option-name' }, d.short),
        h('span', { class: 'sc-option-date' }, formatAgo(d.node.appeared_mya)))))));

  const rocket = h('span', { class: 'sc-rocket', 'aria-hidden': 'true' }, '🚀');
  const fill = h('span', { class: 'sc-fill' });
  const flag = h('span', { class: 'sc-flag', 'aria-hidden': 'true' });
  const track = h('div', { class: 'sc-track' }, fill, rocket, flag);
  const trackCaption = h('p', { class: 'sc-track-caption' });

  const counter = h('span', { class: 'sc-counter', 'aria-hidden': 'true' });
  const summary = h('p', { class: 'sc-summary', role: 'status', 'aria-live': 'polite' });
  const bigTravel = h('p', { class: 'sc-travel' });
  const comparisons = h('ul', { class: 'sc-compare', role: 'list' });
  const howTo = h('details', { class: 'more sc-how' });
  const sheet = h('div', { class: 'sc-sheet' });

  container.replaceChildren(
    h('p', { class: 'view-intro' }, 'Monte dans la machine à remonter le temps ! Choisis une époque et découvre à quel point c\'est loin…'),
    picker,
    h('section', { class: 'sc-machine', 'aria-label': 'Le voyage' },
      h('div', { class: 'sc-sky', 'aria-hidden': 'true' }, h('span', {}, '✦'), h('span', {}, '✧'), h('span', {}, '✦'), h('span', {}, '✧')),
      h('p', { class: 'sc-years' }, h('span', { class: 'sc-years-label' }, 'Années à remonter :'), counter),
      h('div', { class: 'sc-journey' },
        h('div', { class: 'sc-ends', 'aria-hidden': 'true' },
          h('span', {}, '🏠 Aujourd\'hui'), h('span', {}, 'Naissance de la Terre 🌋')),
        track,
        trackCaption),
      summary,
      bigTravel,
      sheet),
    h('h3', { class: 'sc-compare-title' }, h('span', { 'aria-hidden': 'true' }, '📏 '), 'Pour mieux imaginer'),
    comparisons,
    howTo,
  );

  // ---------- Rendu ----------

  function animateCounter(target) {
    cancelAnimationFrame(counterFrame);
    if (prefersReducedMotion()) { counter.textContent = fmt(target); return; }
    const start = performance.now();
    const duration = 1200;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      counter.textContent = fmt(Math.round(target * eased));
      if (t < 1) counterFrame = requestAnimationFrame(tick);
    };
    counterFrame = requestAnimationFrame(tick);
  }

  function render(animate) {
    const node = current.node;
    const s = computeScale(node.appeared_mya);
    const percent = Math.min(100, s.share * 100);
    const shown = Math.max(percent, 1.2); // visible même pour les tout petits trajets

    track.style.setProperty('--progress', `${shown}%`);
    flag.textContent = node.emoji;
    track.classList.remove('is-flying');
    if (animate && !prefersReducedMotion()) {
      void track.offsetWidth; // relance l'animation de la fusée
      track.classList.add('is-flying');
    }
    trackCaption.textContent = percent < 1
      ? `${node.emoji} ${current.short} : tout près de nous, à moins de 1 % du chemin vers la naissance de la Terre !`
      : `${node.emoji} ${current.short} : à ${fmt(percent, percent < 10 ? 1 : 0)} % du chemin vers la naissance de la Terre.`;

    animateCounter(s.years);
    counter.setAttribute('title', `${fmt(s.years)} ans`);

    summary.replaceChildren(
      'Si tu remontais le temps d\'',
      h('strong', {}, 'un an par seconde'),
      `, il te faudrait ${s.travel} pour rejoindre ${current.label}.`);

    bigTravel.replaceChildren(
      h('span', { class: 'sc-travel-emoji', 'aria-hidden': 'true' }, '⏱️'),
      h('span', { class: 'sc-travel-value' }, s.travel),
      h('span', { class: 'sc-travel-note' }, s.travelYears >= 80
        ? 'de voyage… plus longtemps qu\'une vie humaine entière !'
        : 'de voyage, sans jamais dormir !'));

    sheet.replaceChildren(h('button', {
      type: 'button', class: 'btn btn-small btn-ghost',
      'aria-label': `Voir la fiche : ${node.name_fr}`, onclick: () => openCard(node.id),
    }, `📖 Voir la fiche : ${node.emoji} ${node.name_fr}`));

    comparisons.replaceChildren(
      compareItem('📄', 'Une pile de feuilles',
        `Si chaque année était une feuille de papier (${fmt(PAPER_MM, 1)} mm), la pile mesurerait`, s.paperText, finish(s.paperCompare)),
      compareItem('👣', 'Un pas par million d\'années',
        `Si chaque million d'années était un pas (${fmt(STEP_M * 100)} cm), tu ferais ${s.steps >= 1 ? `${fmt(s.steps, 1)} pas` : 'moins d\'un pas'}, soit`, s.stepsText, finish(s.stepsCompare)),
      compareItem('📐', 'La règle magique',
        `Si toute l'histoire de la Terre (${fmt(EARTH_AGE_MYA / 1000, 2)} milliards d'années) tenait sur une règle d'un mètre, ta destination serait à`, s.rulerText, `du bout « aujourd'hui » : ${s.rulerCompare}`, true),
    );

    howTo.replaceChildren(
      h('summary', {}, h('span', { 'aria-hidden': 'true' }, '🧮'), ' Comment on a calculé ?'),
      h('div', { class: 'more-content' },
        h('p', {}, `${current.short} : ${formatAgo(node.appeared_mya)}, soit ${fmt(s.years)} ans.`),
        h('p', {}, `À un an par seconde, ça fait ${fmt(s.seconds)} secondes.`),
        h('p', {}, `Une année dure 365 jours et quart × 24 heures × 60 minutes × 60 secondes ≈ ${fmt(SECONDS_PER_YEAR / 1e6, 1)} millions de secondes.`),
        h('p', {}, `Donc ${fmt(s.seconds)} ÷ ${fmt(Math.round(SECONDS_PER_YEAR))} ≈ ${fmt(s.travelYears, s.travelYears < 1 ? 3 : 1)} année${s.travelYears >= 2 ? 's' : ''} de voyage.`)),
    );
  }

  function compareItem(emoji, title, before, value, after, noColon = false) {
    return h('li', { class: 'sc-card' },
      h('span', { class: 'sc-card-emoji', 'aria-hidden': 'true' }, emoji),
      h('div', {},
        h('p', { class: 'sc-card-title' }, title),
        h('p', { class: 'sc-card-text' }, `${before} `, h('strong', { class: 'sc-card-value' }, value), noColon ? ` ${after}` : ` : ${after}`)));
  }

  render(false);
  return { onShow: () => render(true) };
}
