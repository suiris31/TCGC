// Gestes du plateau (glisser-déposer), en fonctions pures, sans React ni DOM (testées par game/tests/gestures.test.ts) :
// ce qu'on peut saisir, où on peut le lâcher, et l'option du moteur que le geste choisit. Trois gestes, pendant la
// phase principale seulement :
// - une carte de la main lâchée sur ton terrain : « Jouer » (Personnage, Lieu, Événement [Principal]) ;
// - un attaquant lâché sur une cible : « Attaquer » ;
// - une DON!! de ta réserve lâchée sur une de tes cartes : « Donner 1 DON!! ».
// Un geste n'agit que s'il correspond à une seule option du moteur ; sinon il n'a aucun effet. Le menu de la carte
// reste le chemin par défaut (décision de l'utilisateur : pas de double-clic, pas de clic qui joue tout seul).
import type { Decision, Option } from '../../engine/types.ts';

// Ce qu'on saisit : une carte de la main, une carte du terrain (un attaquant), une DON!! de la réserve
export type GestureSource =
  | { from: 'hand'; uid: number }
  | { from: 'field'; uid: number }
  | { from: 'don' };

// Où on lâche : sur une carte (terrain), sur ton terrain (hors carte), ou ailleurs
export type GestureDrop =
  | { on: 'card'; uid: number; mine: boolean }
  | { on: 'zone'; mine: boolean }
  | { on: 'none' };

export type GestureKind = 'play' | 'attack' | 'don';

const uidOf = (o: Option) => Number(o.id.split(':')[1]);
const isPlay = (o: Option) => o.id.startsWith('play:') || o.id.startsWith('event:');

// Les options que le geste peut choisir (avant de savoir où il sera lâché)
function candidates(d: Decision | null, source: GestureSource): Option[] {
  if (!d || d.kind !== 'main') return [];
  switch (source.from) {
    case 'hand': return d.options.filter((o) => isPlay(o) && uidOf(o) === source.uid);
    case 'field': return d.options.filter((o) => o.id.startsWith('attack:') && o.uid === source.uid);
    case 'don': return d.options.filter((o) => o.id.startsWith('don:'));
  }
}

// Ce que fait le geste qui part de cette source (null : rien à saisir)
export function gestureKind(d: Decision | null, source: GestureSource): GestureKind | null {
  if (!candidates(d, source).length) return null;
  return source.from === 'hand' ? 'play' : source.from === 'field' ? 'attack' : 'don';
}

// Les cartes qu'on peut saisir (main et terrain) ; la réserve de DON!! se saisit si gestureKind(d, { from: 'don' })
export function grabbableCards(d: Decision | null): Set<number> {
  const out = new Set<number>();
  if (!d || d.kind !== 'main') return out;
  for (const o of d.options) {
    if (isPlay(o)) out.add(uidOf(o));
    else if (o.id.startsWith('attack:') && o.uid !== undefined) out.add(o.uid);
  }
  return out;
}

// Les cartes sur lesquelles on peut lâcher (cibles d'attaque, cartes qui reçoivent une DON!!). Jouer se lâche sur ton
// terrain, pas sur une carte.
export function dropCards(d: Decision | null, source: GestureSource): Set<number> {
  const out = new Set<number>();
  for (const o of candidates(d, source)) {
    if (o.id.startsWith('attack:') && o.target !== undefined) out.add(o.target);
    else if (o.id.startsWith('don:')) out.add(uidOf(o));
  }
  return out;
}

// L'option choisie par le geste : une seule option correspond, sinon null (aucun effet)
export function gestureOption(d: Decision | null, source: GestureSource, drop: GestureDrop): Option | null {
  if (drop.on === 'none') return null;
  const found = candidates(d, source).filter((o) => {
    if (isPlay(o)) return drop.mine;  // sur ton terrain, sur une de tes cartes ou à côté
    if (o.id.startsWith('attack:')) return drop.on === 'card' && !drop.mine && o.target === drop.uid;
    return drop.on === 'card' && drop.mine && uidOf(o) === drop.uid;  // DON!!
  });
  return found.length === 1 ? found[0] : null;
}

// Au doigt, le geste se décide après un petit déplacement : depuis la main, vers le haut on joue, à l'horizontale on
// fait défiler la main (et vers le bas, rien) ; depuis le terrain ou la réserve, tout déplacement glisse. À la souris,
// la main ne défile pas : tout déplacement glisse.
export const GESTURE_THRESHOLD = { mouse: 6, touch: 10 };

export function gestureIntent(dx: number, dy: number, from: GestureSource['from'], touch: boolean): 'wait' | 'drag' | 'scroll' {
  const threshold = touch ? GESTURE_THRESHOLD.touch : GESTURE_THRESHOLD.mouse;
  if (Math.hypot(dx, dy) < threshold) return 'wait';
  if (!touch || from !== 'hand') return 'drag';
  return -dy > Math.abs(dx) ? 'drag' : 'scroll';
}

// La prévision d'un combat en une phrase courte, à côté du doigt (« 6000 contre 5000 : ça passe, il perd 1 Vie (il en
// a 4). ») : la première phrase du texte d'attackPreview
export function shortPreview(text: string): string {
  const end = text.indexOf('. ');
  return end < 0 ? text : text.slice(0, end + 1);
}
