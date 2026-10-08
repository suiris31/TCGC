// Adversaires intégrés de l'environnement (joués directement dans Node, sans passer par le modèle) :
// - random : un choix au hasard parmi les options légales (hasard propre au joueur, tiré de la graine de la partie :
//   il ne touche pas au hasard du jeu) ;
// - heuristic : l'IA simple actuelle (game/ai/heuristic.ts, niveau « Débutant ») ;
// - mc : l'IA Monte-Carlo actuelle (game/ai/search.ts) avec un nombre FIXE de tirages, donc reproductible (le niveau
//   « Confirmé » de l'interface utilise 16 tirages, « Expert » 48, mais limités en temps).
import { heuristicChooser } from '../ai/heuristic.ts';
import { LEVELS, mcChoose } from '../ai/search.ts';
import { random } from '../engine/rng.ts';
import type { Decision, GameState } from '../engine/types.ts';

export type BuiltinKind = 'random' | 'heuristic' | 'mc';
export type SeatKind = 'agent' | BuiltinKind;

export interface SeatSpec {
  kind: SeatKind;
  samples?: number;     // mc : tirages par option (16 par défaut, comme le niveau Confirmé)
}

export type Builtin = (s: GameState, d: Decision) => string;

export function builtinPolicy(spec: SeatSpec, seed: number): Builtin {
  switch (spec.kind) {
    case 'random': {
      const r = { rng: (seed ^ 0x2545f491) | 0 };
      return (_s, d) => d.options[Math.floor(random(r) * d.options.length)].id;
    }
    case 'heuristic':
      return heuristicChooser;
    case 'mc': {
      const cfg = { samples: spec.samples ?? LEVELS[2].samples, margin: LEVELS[2].margin };
      return (s, d) => mcChoose(s, d, cfg);
    }
    default:
      throw new Error(`pas un adversaire intégré : ${spec.kind}`);
  }
}
