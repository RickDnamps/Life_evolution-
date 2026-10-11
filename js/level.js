// Choix du profil d'âge : au premier chargement, puis à tout moment depuis l'en-tête.

import { LEVELS, getLevel, h, hasChosenLevel, setLevel } from './utils.js';

const DESCRIPTIONS = {
  petits: 'Des phrases toutes courtes, de grandes images, et le site peut lire à voix haute.',
  enfants: 'Des explications simples et plein de faits étonnants.',
  grands: 'Plus de détails et les vrais mots des scientifiques.',
  adultes: 'Les explications complètes, les noms scientifiques, les débats et les sources.',
};

export function setupLevel() {
  const button = document.getElementById('level-button');
  const dialog = h('dialog', { class: 'level-dialog', 'aria-labelledby': 'level-title' });
  document.body.append(dialog);

  const refreshButton = () => {
    const level = LEVELS[getLevel()];
    button.replaceChildren(
      h('span', { 'aria-hidden': 'true' }, level.emoji),
      h('span', { class: 'level-button-text' }, level.label));
    button.setAttribute('aria-label', `Profil : ${level.name}, ${level.label}. Changer de profil`);
  };

  const open = (firstTime) => {
    const current = getLevel();
    dialog.replaceChildren(h('div', { class: 'level-body' },
      h('div', { class: 'level-planet', 'aria-hidden': 'true' }, '🌍'),
      h('h2', { id: 'level-title', class: 'level-title' },
        firstTime ? 'Bienvenue dans la grande aventure de la vie !' : 'Qui explore aujourd\'hui ?'),
      h('p', { class: 'level-lead' }, firstTime
        ? 'Qui explore aujourd\'hui ? Les explications s\'adapteront à ton âge.'
        : 'Les explications s\'adaptent au profil choisi.'),
      h('ul', { class: 'level-choices' }, Object.entries(LEVELS).map(([key, level]) => h('li', {},
        h('button', {
          type: 'button', class: `level-choice level-${key}`, 'aria-pressed': String(!firstTime && key === current),
          onclick: () => { setLevel(key); dialog.close(); },
        },
        h('span', { class: 'level-emoji', 'aria-hidden': 'true' }, level.emoji),
        h('span', { class: 'level-name' }, level.name),
        h('span', { class: 'level-age' }, level.label),
        h('span', { class: 'level-desc' }, DESCRIPTIONS[key]))))),
      h('p', { class: 'level-hint' }, 'Tu pourras changer à tout moment avec le bouton en haut de la page.')));
    dialog.showModal();
    dialog.querySelector(`.level-${firstTime ? 'enfants' : current}`)?.focus();
  };

  // Fermer sans choisir garde le profil par défaut (8-10 ans) mais le mémorise.
  dialog.addEventListener('close', () => { if (!hasChosenLevel()) setLevel('enfants'); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  button.addEventListener('click', () => open(false));
  document.addEventListener('level-change', refreshButton);

  document.documentElement.dataset.level = getLevel();
  refreshButton();
  if (!hasChosenLevel()) open(true);
}
