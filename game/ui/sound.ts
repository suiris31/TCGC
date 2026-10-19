// Petits sons de jeu, fabriqués à la volée (aucun fichier) : cartes jouées, attaques, dégâts, KO, victoire...
type Sfx = 'click' | 'play' | 'attack' | 'hit' | 'ko' | 'don' | 'shield' | 'turn' | 'event' | 'win' | 'lose' | 'draw';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Une note : fréquence de départ et d'arrivée, durée, forme d'onde, volume
function tone(a: AudioContext, from: number, to: number, start: number, duration: number, type: OscillatorType, volume: number) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, a.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), a.currentTime + start + duration);
  gain.gain.setValueAtTime(0.0001, a.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, a.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + duration + 0.02);
}

// Bruit bref (chocs, souffle d'une carte)
function noise(a: AudioContext, start: number, duration: number, volume: number, lowpass: number) {
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = a.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(a.currentTime + start);
}

export function sfx(kind: Sfx) {
  const a = audio();
  if (!a) return;
  switch (kind) {
    case 'click': tone(a, 660, 520, 0, 0.06, 'triangle', 0.05); break;
    case 'draw': noise(a, 0, 0.12, 0.08, 3000); break;
    case 'play': noise(a, 0, 0.18, 0.12, 2200); tone(a, 300, 420, 0.02, 0.12, 'triangle', 0.05); break;
    case 'attack': noise(a, 0, 0.25, 0.16, 1500); tone(a, 220, 90, 0, 0.25, 'sawtooth', 0.04); break;
    case 'hit': tone(a, 160, 50, 0, 0.35, 'sine', 0.22); noise(a, 0, 0.15, 0.1, 800); break;
    case 'ko': noise(a, 0, 0.4, 0.2, 1200); tone(a, 300, 60, 0, 0.4, 'square', 0.05); break;
    case 'don': tone(a, 880, 1320, 0, 0.12, 'sine', 0.07); tone(a, 1320, 1760, 0.06, 0.12, 'sine', 0.05); break;
    case 'shield': tone(a, 520, 780, 0, 0.18, 'triangle', 0.08); tone(a, 780, 1040, 0.08, 0.2, 'triangle', 0.06); break;
    case 'turn': tone(a, 392, 392, 0, 0.18, 'triangle', 0.07); tone(a, 523, 523, 0.14, 0.26, 'triangle', 0.07); break;
    case 'event': tone(a, 440, 880, 0, 0.3, 'sine', 0.08); noise(a, 0, 0.2, 0.06, 4000); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(a, f, f, i * 0.12, 0.35, 'triangle', 0.09)); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(a, f, f * 0.97, i * 0.18, 0.4, 'sine', 0.09)); break;
  }
}

// Ouverture des boosters (tâche 1.6) : papier déchiré, carte retournée, et un son par genre de carte (lueur d'une R,
// éclat d'une SR ou d'un Leader, fanfare d'une SEC, scintillement d'une version spéciale), précédé d'une montée qui fait
// attendre les plus belles
export type BoosterSfx = 'tear' | 'flip' | 'shine' | 'suspense' | 'super' | 'secret' | 'special';

// Bruit filtré dont la hauteur glisse (souffle, déchirure, montée)
function sweep(a: AudioContext, start: number, duration: number, volume: number, from: number, to: number) {
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, a.currentTime + start);
  filter.frequency.exponentialRampToValueAtTime(to, a.currentTime + start + duration);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, a.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, a.currentTime + start + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(a.currentTime + start);
}

export function boosterSfx(kind: BoosterSfx) {
  const a = audio();
  if (!a) return;
  switch (kind) {
    case 'tear':
      for (let i = 0; i < 8; i++) noise(a, i * 0.032 + Math.random() * 0.012, 0.045, 0.11, 4500 + Math.random() * 2500);
      sweep(a, 0.22, 0.35, 0.14, 700, 3200);
      break;
    case 'flip': noise(a, 0, 0.09, 0.07, 3200); tone(a, 480, 640, 0.01, 0.07, 'triangle', 0.03); break;
    case 'shine': tone(a, 1318, 1318, 0, 0.35, 'sine', 0.05); tone(a, 1760, 1760, 0.09, 0.45, 'sine', 0.04); break;
    case 'suspense': sweep(a, 0, 0.75, 0.12, 250, 2600); tone(a, 196, 392, 0, 0.75, 'triangle', 0.045); break;
    case 'super':
      [784, 988, 1175, 1568].forEach((f, i) => tone(a, f, f, i * 0.07, 0.45, 'triangle', 0.07));
      sweep(a, 0, 0.7, 0.07, 3500, 9000);
      break;
    case 'secret':
      tone(a, 120, 50, 0, 0.7, 'sine', 0.25);
      [523, 659, 784].forEach((f) => tone(a, f, f, 0.04, 1, 'triangle', 0.06));
      [1046, 1318, 1568, 2093].forEach((f, i) => tone(a, f, f, 0.32 + i * 0.08, 0.7, 'sine', 0.05));
      sweep(a, 0.04, 1.3, 0.08, 2500, 10000);
      break;
    case 'special':
      [659, 880, 1046, 1318, 1760, 2093].forEach((f, i) => tone(a, f, f * 1.01, i * 0.05, 0.5, 'sine', 0.05));
      sweep(a, 0, 0.9, 0.07, 5000, 12000);
      break;
  }
}
