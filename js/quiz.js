// « Le grand quiz » : 10 questions tirées au hasard dans data.quiz.
// Clavier : Tab + Entrée, ou 1 à 4 (A à D) pour répondre.

import { getLevel, h, prefersReducedMotion, shuffle } from './utils.js';

const QUESTIONS_PER_GAME = 10;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const GOOD = ['Bravo !', 'Exactement !', 'Super !', 'Bien joué !', 'Génial !'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function mount(container, ctx) {
  const { data, index, openCard } = ctx;

  const bank = (data.quiz || []).filter((q) => q && typeof q.question === 'string'
    && Array.isArray(q.choices) && q.choices.length >= 2
    && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length);

  const game = { questions: [], position: 0, score: 0, mistakes: [], phase: 'ask' };
  const root = h('div', { class: 'qz' });
  container.replaceChildren(
    h('p', { class: 'view-intro' }, `${Math.min(QUESTIONS_PER_GAME, bank.length) || 10} questions pour devenir expert de l'évolution. Prêt ? C'est parti !`),
    root,
  );

  if (!bank.length) {
    root.append(h('p', { class: 'qz-empty' }, 'Les questions arrivent bientôt ! 🐣'));
    return {};
  }

  // ---------- Partie ----------

  // Questions adaptées au profil d'âge choisi (champ `levels`), avec l'ensemble en secours.
  function poolForLevel() {
    const level = getLevel();
    const pool = bank.filter((q) => !Array.isArray(q.levels) || q.levels.includes(level));
    return pool.length >= 5 ? pool : bank;
  }

  function start() {
    game.questions = shuffle(poolForLevel()).slice(0, QUESTIONS_PER_GAME).map((q) => {
      const choices = shuffle(q.choices.map((text, i) => ({ text, correct: i === q.answer })));
      return { ...q, shuffled: choices };
    });
    game.position = 0;
    game.score = 0;
    game.mistakes = [];
    showQuestion();
  }

  const total = () => game.questions.length;

  function sheetButton(nodeId, small = true) {
    const node = nodeId ? index.byId.get(nodeId) : null;
    if (!node) return null;
    return h('button', {
      type: 'button', class: `btn btn-ghost ${small ? 'btn-small' : ''}`.trim(),
      'aria-label': `Voir la fiche : ${node.name_fr}`, onclick: () => openCard(node.id),
    }, `📖 Voir la fiche : ${node.emoji} ${node.name_fr}`);
  }

  function progress() {
    const done = game.position;
    const bar = h('div', {
      class: 'qz-bar', role: 'progressbar', 'aria-label': 'Progression du quiz',
      'aria-valuemin': '0', 'aria-valuemax': String(total()), 'aria-valuenow': String(done),
      'aria-valuetext': `Question ${game.position + 1} sur ${total()}`,
    }, h('span', { class: 'qz-bar-fill', style: { width: `${(done / total()) * 100}%` } }));
    return h('div', { class: 'qz-progress' },
      h('div', { class: 'qz-head' },
        h('span', { class: 'qz-count' }, `Question ${game.position + 1} / ${total()}`),
        h('span', { class: 'qz-score', 'aria-label': `${game.score} bonne${game.score > 1 ? 's' : ''} réponse${game.score > 1 ? 's' : ''}` }, `⭐ ${game.score}`)),
      bar);
  }

  function showQuestion() {
    const q = game.questions[game.position];
    game.phase = 'ask';

    const feedback = h('div', { class: 'qz-feedback', role: 'status', 'aria-live': 'polite' });
    const title = h('h3', { class: 'qz-question', id: 'qz-q', tabindex: '-1' }, q.question);
    const list = h('ul', { class: 'qz-choices', role: 'list' },
      ...q.shuffled.map((choice, i) => h('li', {},
        h('button', {
          type: 'button', class: 'qz-choice', 'data-index': String(i),
          onclick: () => choose(i, list, feedback),
        },
        h('span', { class: 'qz-letter', 'aria-hidden': 'true' }, LETTERS[i]),
        h('span', { class: 'qz-text' }, choice.text),
        h('span', { class: 'qz-mark' })))));

    root.replaceChildren(progress(), h('section', { class: 'qz-card', 'aria-labelledby': 'qz-q' }, title, list, feedback));
    if (game.position > 0) title.focus({ preventScroll: true });
  }

  function choose(i, list, feedback) {
    if (game.phase !== 'ask') return;
    game.phase = 'answered';
    const q = game.questions[game.position];
    const chosen = q.shuffled[i];
    const good = chosen.correct;
    const right = q.shuffled.find((c) => c.correct);
    if (good) game.score += 1;
    else game.mistakes.push({ question: q.question, given: chosen.text, right: right.text, node_id: q.node_id, explanation: q.explanation });

    list.querySelectorAll('.qz-choice').forEach((button) => {
      const choice = q.shuffled[Number(button.dataset.index)];
      button.setAttribute('aria-disabled', 'true');
      button.classList.add('is-locked');
      const mark = button.querySelector('.qz-mark');
      if (choice.correct) {
        button.classList.add('is-right');
        mark.textContent = '✓ Bonne réponse';
      } else if (choice === chosen) {
        button.classList.add('is-wrong');
        mark.textContent = '✗ Ta réponse';
      }
    });
    root.querySelector('.qz-score').textContent = `⭐ ${game.score}`;
    const fill = root.querySelector('.qz-bar-fill');
    fill.style.width = `${((game.position + 1) / total()) * 100}%`;
    root.querySelector('.qz-bar').setAttribute('aria-valuenow', String(game.position + 1));

    const last = game.position + 1 >= total();
    const next = h('button', {
      type: 'button', class: 'btn qz-next',
      onclick: () => { game.position += 1; if (last) showEnd(); else showQuestion(); },
    }, last ? '🏁 Voir mon score' : 'Question suivante ➜');

    feedback.className = `qz-feedback ${good ? 'is-good' : 'is-bad'}`;
    feedback.replaceChildren(...[
      h('p', { class: 'qz-verdict' },
        h('span', { 'aria-hidden': 'true' }, good ? '✅ ' : '💡 '),
        good ? pick(GOOD) : 'Pas tout à fait…'),
      good ? null : h('p', { class: 'qz-right' }, 'La bonne réponse : ', h('strong', {}, right.text)),
      q.explanation ? h('p', { class: 'qz-explain' }, q.explanation) : null,
      h('div', { class: 'qz-actions' }, sheetButton(q.node_id), next),
    ].filter(Boolean));
    next.focus({ preventScroll: true });
    feedback.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // ---------- Fin de partie ----------

  function message(score, count) {
    const ratio = score / count;
    if (ratio === 1) return { emoji: '🏆', title: 'Tu es un vrai paléontologue !', text: 'Un sans-faute ! Les dinosaures seraient fiers de toi.' };
    if (ratio >= 0.7) return { emoji: '🌟', title: 'Bravo, quel expert !', text: 'Tu connais super bien l\'histoire de la vie. Encore un petit effort pour le sans-faute !' };
    if (ratio >= 0.4) return { emoji: '💪', title: 'Joli travail !', text: 'Tu as déjà appris plein de choses. Rejoue pour devenir incollable !' };
    return { emoji: '🌱', title: 'Bravo d\'avoir joué jusqu\'au bout !', text: 'Chaque réponse t\'a appris un secret de la vie sur Terre. Rejoue, tu vas voir tes progrès !' };
  }

  function showEnd() {
    game.phase = 'end';
    const count = total();
    const { emoji, title, text } = message(game.score, count);
    const heading = h('h3', { class: 'qz-end-score', tabindex: '-1' },
      h('span', { class: 'visually-hidden' }, 'Ton score : '),
      `${game.score} / ${count}`);
    const stars = h('p', { class: 'qz-stars', 'aria-hidden': 'true' },
      ...Array.from({ length: count }, (_, i) => h('span', { class: i < game.score ? 'on' : 'off' }, i < game.score ? '★' : '☆')));

    const replay = h('button', { type: 'button', class: 'btn qz-replay', onclick: start }, '🔄 Rejouer');

    const recap = game.mistakes.length
      ? h('section', { class: 'qz-recap', 'aria-labelledby': 'qz-recap-title' },
        h('h4', { id: 'qz-recap-title' }, h('span', { 'aria-hidden': 'true' }, '🔍 '), 'On révise ensemble ?'),
        h('ol', { class: 'qz-recap-list' }, ...game.mistakes.map((m) => h('li', {},
          h('p', { class: 'qz-recap-q' }, m.question),
          h('p', { class: 'qz-recap-given' }, h('span', { 'aria-hidden': 'true' }, '✗ '), 'Ta réponse : ', h('s', {}, m.given)),
          h('p', { class: 'qz-recap-right' }, h('span', { 'aria-hidden': 'true' }, '✓ '), 'Bonne réponse : ', h('strong', {}, m.right)),
          sheetButton(m.node_id)))))
      : h('p', { class: 'qz-perfect' }, '🎯 Aucune erreur, chapeau !');

    root.replaceChildren(h('div', { class: 'qz-end' },
      h('div', { class: 'qz-trophy', 'aria-hidden': 'true' }, emoji),
      heading,
      stars,
      h('p', { class: 'qz-end-title' }, title),
      h('p', { class: 'qz-end-text' }, text),
      h('div', { class: 'qz-actions qz-actions-center' }, replay),
      recap,
    ));
    heading.focus({ preventScroll: true });
    root.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    celebrate(game.score / count);
  }

  function celebrate(ratio) {
    if (prefersReducedMotion()) return;
    document.querySelector('.qz-confetti')?.remove();
    const colors = ['#ff6b35', '#ffd166', '#06d6a0', '#3a86ff', '#c77dff', '#ef476f'];
    const emojis = ['🎉', '⭐', '🦖', '🐟', '🌟', '🎊'];
    const amount = Math.round(24 + ratio * 36);
    const layer = h('div', { class: 'qz-confetti', 'aria-hidden': 'true' },
      ...Array.from({ length: amount }, (_, i) => {
        const isEmoji = i % 5 === 0;
        const style = [
          `left: ${(Math.random() * 100).toFixed(1)}%`,
          `background: ${isEmoji ? 'none' : colors[i % colors.length]}`,
          `animation-delay: ${(Math.random() * 0.8).toFixed(2)}s`,
          `animation-duration: ${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
          `--spin: ${Math.round(Math.random() * 720 - 360)}deg`,
          `--drift: ${Math.round(Math.random() * 120 - 60)}px`,
        ].join('; ');
        return h('span', {
          class: isEmoji ? 'qz-piece qz-piece-emoji' : 'qz-piece', style,
        }, isEmoji ? emojis[i % emojis.length] : '');
      }));
    document.body.append(layer);
    setTimeout(() => layer.remove(), 4500);
  }

  // Les confettis ne suivent pas l'enfant dans une autre activité.
  window.addEventListener('hashchange', () => document.querySelector('.qz-confetti')?.remove());

  // ---------- Clavier : 1-4 ou A-D ----------

  document.addEventListener('keydown', (event) => {
    if (game.phase !== 'ask' || container.closest('[hidden]') || document.querySelector('dialog[open]')) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toUpperCase();
    let i = Number.parseInt(key, 10) - 1;
    if (Number.isNaN(i)) i = LETTERS.indexOf(key);
    const button = root.querySelector(`.qz-choice[data-index="${i}"]`);
    if (i >= 0 && button) {
      event.preventDefault();
      button.click();
    }
  });

  start();
  document.addEventListener('level-change', start);
  return {};
}
