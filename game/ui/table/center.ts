// La bande centrale du plateau (ordinateur), en fonctions pures : le dernier coup de l'adversaire et le verdict de
// la prévision d'attaque
import { other } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';

// lignes du journal sans intérêt pour la bande : la pioche, la fin du tour, la main de départ
const DULL = /^(termine son tour|pioche|garde sa main|repioche)/;

// Le dernier coup de l'adversaire (ce qu'il a joué, attaqué...), vu par seat, pendant son tour et le tour suivant
export function lastMove(s: GameState, seat: PlayerId): string | null {
  let turns = 0;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const l = s.log[i];
    if (l.text.startsWith('—') && ++turns > 1) return null;
    if (l.only !== undefined && l.only !== seat) continue;
    if (l.player === other(seat) && !DULL.test(l.text)) return l.text;
  }
  return null;
}

// La prévision d'attaque en une phrase (« 6000 contre 5000 : ça passe, il perd 1 Vie (il en a 5) ») : le détail
// (Contres, Bloqueurs) est dans la barre d'action
export function verdict(text: string): string {
  return text.split(/\. (?=[A-Z])/)[0].replace(/\.$/, '');
}
