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
