// Ce que dit la barre d'action : qui doit faire quoi, en mots simples (fonctions pures, sans React ni DOM, testées par
// game/tests/decisions.test.ts). Utilisé par ActionBar (Interaction.tsx).
import type { Decision, GameState, Option, PlayerId } from '../../engine/types.ts';
import { attackRepelled } from '../decision.ts';
import { quoteCardNames } from '../texts.ts';

export interface BarInput {
  state: GameState;
  decision: Decision | null;   // la décision en cours (la tienne ou celle de l'adversaire)
  human: PlayerId;
  opponent: string;            // l'adversaire en début de phrase (« L’IA », « Zoro »)
  thinking: boolean;           // il réfléchit (sinon : il joue)
  hasCardActions: boolean;     // une de tes cartes a une action utile (entourée d'or ou de bleu)
  touch: boolean;
}

export interface BarText {
  title: string;               // qui doit faire quoi
  help: string;                // comment faire
  mine: boolean;               // c'est à toi
}

// la consigne du moteur, sans les deux-points de la fin, les noms de cartes à virgule entre guillemets
const tidy = (text: string) => quoteCardNames(text).replace(/\s*:\s*$/, '');

export function barText({ state: s, decision: d, human, opponent, thinking, hasCardActions, touch }: BarInput): BarText {
  const tap = touch ? 'Touche' : 'Clique sur';
  if (!d || d.player !== human) {
    const what = d?.kind === 'mulligan' ? `${opponent} choisit sa main de départ…`
      : d?.kind === 'blocker' ? `${opponent} choisit de bloquer ou non…`
      : d?.kind === 'counter' ? `${opponent} choisit de contrer ou non…`
      : thinking ? `${opponent} réfléchit…` : `${opponent} joue…`;
    return { title: what, help: '', mine: false };
  }
  switch (d.kind) {
    case 'main':
      return {
        title: 'À toi de jouer',
        help: hasCardActions
          ? (touch ? 'Touche une carte entourée d’or pour voir ce qu’elle peut faire.' : 'Clique sur une carte entourée d’or pour voir ce qu’elle peut faire. Tu peux aussi glisser une DON!! sur une carte.')
          : 'Plus rien d’utile à faire : termine ton tour.',
        mine: true,
      };
    case 'mulligan':
      return { title: 'À toi : garde ta main ou repioche', help: 'Choisis dans la fenêtre (« Voir le plateau » la réduit).', mine: true };
    case 'blocker':
      return { title: 'À toi de défendre : bloquer ?', help: `${tap} un de tes [Bloqueur] entourés d’or pour qu’il prenne l’attaque à la place, ou laisse passer.`, mine: true };
    case 'counter': {
      if (attackRepelled(s)) {
        return {
          title: 'Attaque repoussée : tu peux arrêter de contrer',
          help: hasCardActions ? 'Un Événement [Contre] entouré d’or peut encore servir ; sinon, « Ne plus contrer ».' : 'Contrer davantage ne servirait à rien : « Ne plus contrer ».',
          mine: true,
        };
      }
      // ce qu'il manque est écrit dans le panneau de combat, au-dessus
      return { title: 'À toi de défendre : contrer ?', help: `${tap} une carte de ta main entourée d’or pour contrer, ou laisse passer.`, mine: true };
    }
  }
  if (d.tag === 'trigger') return { title: 'À toi : carte de Vie révélée', help: 'Active son [Déclenchement] ou prends-la en main, dans la fenêtre.', mine: true };
  if (d.tag === 'declareCost') return { title: 'À toi : déclare un coût', help: 'Choisis-le dans la fenêtre.', mine: true };
  return { title: 'À toi de choisir', help: `${tidy(d.prompt)}${hasCardActions ? ` ${tap} une carte entourée de bleu.` : ''}`, mine: true };
}

// Le libellé et le genre d'un bouton de la barre : pendant les Contres, « Laisser passer l’attaque » tant qu'elle
// passe, puis « Ne plus contrer » (bouton principal) une fois repoussée
export function barButton(s: GameState, d: Decision, o: Option): { label: string; primary: boolean } {
  if (d.kind === 'counter' && o.id === 'pass') {
    return attackRepelled(s) ? { label: 'Ne plus contrer', primary: true } : { label: 'Laisser passer l’attaque', primary: false };
  }
  return { label: o.label, primary: false };
}
