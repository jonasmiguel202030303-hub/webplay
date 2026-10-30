import { useSyncExternalStore } from 'react';

const KEY = 'wp:sound';
const EVENT = 'wp:sound-change';
let ctx = null;

export const isSoundEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

export function setSoundEnabled(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* armazenamento indisponível: vale só nesta sessão */
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

/** Estado reativo da preferência de som (ligado por padrão). */
export const useSoundEnabled = () => useSyncExternalStore(subscribe, isSoundEnabled, () => true);

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Nota com ataque rápido e decaimento suave; `swell` cria o crescendo do segundo golpe. */
function note(c, { freq, at, dur, gain, type = 'sine', swell = 0 }) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  const t0 = c.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02 + swell);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Som de abertura estilo "ta-dum": dois golpes graves, o segundo com acorde que cresce e some. Respeita a preferência. */
export function playProfileSound() {
  if (!isSoundEnabled()) return;
  const c = audio();
  if (!c) return;
  note(c, { freq: 73.4, at: 0, dur: 0.5, gain: 0.5, type: 'triangle' });
  note(c, { freq: 146.8, at: 0, dur: 0.35, gain: 0.25 });
  note(c, { freq: 110, at: 0.24, dur: 1.5, gain: 0.5, type: 'triangle', swell: 0.12 });
  note(c, { freq: 220, at: 0.24, dur: 1.4, gain: 0.3, swell: 0.12 });
  note(c, { freq: 329.6, at: 0.24, dur: 1.2, gain: 0.14, swell: 0.15 });
  note(c, { freq: 55, at: 0.24, dur: 1.6, gain: 0.4, swell: 0.1 });
}

/** Toque curto de confirmação (ligar o som mostra como ele soa). */
export function playPreview() {
  const c = audio();
  if (!c) return;
  note(c, { freq: 440, at: 0, dur: 0.18, gain: 0.2 });
  note(c, { freq: 660, at: 0.08, dur: 0.25, gain: 0.18 });
}
