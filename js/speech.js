// Lecture à voix haute (synthèse vocale du navigateur, en français).
// Utile pour les plus petits qui apprennent à lire.

import { h } from './utils.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let current = null; // bouton du texte en cours de lecture

export const canSpeak = () => Boolean(synth && window.SpeechSynthesisUtterance);

function frenchVoice() {
  const voices = synth.getVoices();
  return voices.find((v) => v.lang === 'fr-FR' && /google|natural|premium|enhanced/i.test(v.name))
    || voices.find((v) => v.lang === 'fr-FR')
    || voices.find((v) => v.lang?.startsWith('fr'))
    || null;
}

function setIdle(button) {
  if (!button) return;
  button.classList.remove('is-speaking');
  button.setAttribute('aria-pressed', 'false');
  button.querySelector('.speak-label').textContent = 'Écouter';
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  synth.cancel();
  setIdle(current);
  current = null;
}

// Petit nettoyage pour une lecture naturelle (« Ma » = millions d'années, etc.).
function readable(text) {
  return String(text)
    .replace(/(\d)\s?Ma\b/g, '$1 millions d\'années')
    .replace(/[«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bouton « 🔊 Écouter » ; getText est appelé au moment du clic.
export function speakButton(getText) {
  if (!canSpeak()) return null;
  const button = h('button', {
    type: 'button', class: 'btn btn-small btn-ghost speak-button', 'aria-pressed': 'false',
    onclick: () => {
      if (current === button) { stopSpeaking(); return; }
      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(readable(getText()));
      utterance.lang = 'fr-FR';
      utterance.rate = document.documentElement.dataset.level === 'petits' ? 0.85 : 0.95;
      const voice = frenchVoice();
      if (voice) utterance.voice = voice;
      utterance.addEventListener('end', () => { if (current === button) { setIdle(button); current = null; } });
      utterance.addEventListener('error', () => { if (current === button) { setIdle(button); current = null; } });
      current = button;
      button.classList.add('is-speaking');
      button.setAttribute('aria-pressed', 'true');
      button.querySelector('.speak-label').textContent = 'Arrêter';
      synth.speak(utterance);
    },
  }, h('span', { 'aria-hidden': 'true' }, '🔊 '), h('span', { class: 'speak-label' }, 'Écouter'));
  return button;
}

// On coupe la lecture quand on change de page ou qu'on ferme une fiche.
if (canSpeak()) {
  window.addEventListener('hashchange', stopSpeaking);
  synth.getVoices();
}
