// Le rythme de l'IA, en fonctions pures (sans React ni DOM, testées par game/tests/table-pace.test.ts) : la pause et le
// « pas à pas » (une décision à la fois), et chaque décision de l'IA dite en une phrase pour la bande centrale.
// La phrase vient du choix fait (son identifiant, pas son libellé, écrit à la première personne pour celui qui choisit)
// et de ce qui a changé sur le plateau (table/events.ts) : le journal n'est pas lu.
import { def, findField } from '../../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../../engine/types.ts';
import { tableEvents } from './events.ts';

// ---------- Pause et pas à pas ----------

// La décision de l'IA est calculée même en pause ; elle attend (held) qu'on la laisse jouer. « Pas à pas » en laisse
// passer exactement une : celle qui attend, ou, si l'IA réfléchit encore, la prochaine qu'elle prendra.
export interface Pace {
  paused: boolean;
  credit: number;      // décisions que « pas à pas » laisse passer (0 ou 1)
}

export const RUNNING: Pace = { paused: false, credit: 0 };

// La décision est prête : la jouer (et ce qu'il reste de la pause), ou la garder en attente
export function ready(p: Pace): { play: boolean; next: Pace } {
  if (!p.paused) return { play: true, next: p };
  if (p.credit > 0) return { play: true, next: { ...p, credit: p.credit - 1 } };
  return { play: false, next: p };
}

// « Pas à pas » : held, une décision attend (elle est jouée tout de suite) ; sinon la prochaine passera
export function step(p: Pace, held: boolean): { play: boolean; next: Pace } {
  if (!p.paused) return { play: false, next: p };
  if (held) return { play: true, next: { ...p, credit: 0 } };
  return { play: false, next: { ...p, credit: 1 } };
}

// ---------- Les décisions de l'IA en phrases ----------

// Une décision de l'IA, pour la bande centrale : le tour où elle l'a prise, et ce qu'elle a fait (après son nom)
export interface AiMove {
  turn: number;
  text: string;
}

const MAX_MOVES = 40;

// Ajoute une décision à la liste (les plus anciennes s'en vont)
export function remember(moves: AiMove[], move: AiMove | null): AiMove[] {
  return move ? [...moves, move].slice(-MAX_MOVES) : moves;
}

// Les décisions à revoir : celles du dernier tour où l'IA a joué, tant que ce tour est le tour en cours ou le précédent
// (comme l'ancienne ligne « dernier coup »)
export function shownMoves(moves: AiMove[], turn: number): AiMove[] {
  const last = moves.at(-1);
  if (!last || turn - last.turn > 1) return [];
  return moves.filter((m) => m.turn === last.turn);
}

function allCards(s: GameState): Card[] {
  return s.players.flatMap((P) => [P.leader, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.hand, ...P.trash, ...P.life, ...P.deck]);
}

// Le nom d'une carte (cherchée avant, puis après la décision)
function cardName(a: GameState, b: GameState, uid: number): string | null {
  const c = allCards(a).find((x) => x.uid === uid) ?? allCards(b).find((x) => x.uid === uid);
  return c ? def(c.num).name : null;
}

// Une carte du terrain vue par seat : « ton Leader », « ton Zoro », ou son nom (carte de l'IA)
function fieldName(s: GameState, uid: number, seat: PlayerId): string | null {
  const f = findField(s, uid);
  if (!f) return null;
  const name = def(f.card.num).name;
  if (f.player !== seat) return name;
  return f.leader ? `ton Leader ${name}` : `ton ${name}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Ce que dit le choix lui-même (a : l'état avant la décision)
function choiceText(a: GameState, b: GameState, choice: string, seat: PlayerId): string {
  const [what, x, y] = choice.split(':');
  const uid = Number(x);
  const name = () => cardName(a, b, uid) ?? 'une carte';
  switch (what) {
    case 'play': return `joue ${name()}`;
    case 'event': return `active ${name()}`;
    case 'act': return `utilise l’effet de ${name()}`;
    case 'don': return `donne 1 DON!! à ${name()}`;
    case 'attack': return `attaque ${fieldName(a, Number(y), seat) ?? 'une carte'} avec ${name()}`;
    case 'end': return 'termine son tour';
    case 'counter': return `contre avec ${name()}`;
    case 'cevent': return `active ${name()} [Contre]`;
    case 'pass': return 'ne contre pas';
    case 'block': return `bloque avec ${name()}`;
    case 'noblock': return 'ne bloque pas';
    case 'keep': return 'garde sa main de départ';
    case 'mulligan': return 'repioche sa main de départ';
    case 'trigger': {
      const num = a.decision?.options.find((o) => o.id === 'trigger')?.num;
      return `active le [Déclenchement] de ${num ? def(num).name : 'sa carte de Vie'}`;
    }
    case 'hand': return a.decision?.tag === 'trigger' ? 'prend sa carte de Vie en main' : 'fait un choix';
  }
  // une question au milieu d'un effet : la carte dont c'est l'effet, et la carte choisie si elle est sur le terrain
  // (les autres choix peuvent porter sur des cartes cachées : ils ne sont pas dits)
  const source = a.decision?.source;
  const from = source !== undefined ? cardName(a, b, source) : null;
  const target = a.decision?.options.find((o) => o.id === choice)?.uid;
  const aimed = target !== undefined ? fieldName(a, target, seat) : null;
  if (aimed) return from ? `choisit ${aimed} (effet de ${from})` : `choisit ${aimed}`;
  return from ? `fait un choix pour l’effet de ${from}` : 'fait un choix';
}

// Ce que la décision a changé sur le plateau, en plus du choix : cartes mises KO ou renvoyées, Vies, puissance
function consequences(a: GameState, b: GameState, seat: PlayerId, ai: PlayerId, choice: string): string[] {
  const out: string[] = [];
  const [what, x] = choice.split(':');
  const chosen = Number(x);
  for (const e of tableEvents(a, b, seat)) {
    switch (e.kind) {
      case 'left': {
        const name = def(e.num).name;
        const whose = e.owner === seat ? `ton ${name}` : name;
        const where = { trash: 'est mis KO', hand: e.owner === seat ? 'revient dans ta main' : 'revient dans sa main', life: 'part dans la Vie', deck: 'retourne dans le deck', gone: 'quitte le terrain' }[e.to];
        out.push(`${whose} ${where}`);
        break;
      }
      case 'entered':
        if (e.owner === ai && !(what === 'play' && e.uid === chosen)) out.push(`${cardName(a, b, e.uid) ?? 'une carte'} arrive sur son terrain`);
        break;
      case 'life':
        if (e.delta < 0) out.push(e.player === seat ? `tu perds ${plural(-e.delta, 'Vie')}` : `perd ${plural(-e.delta, 'Vie')}`);
        else out.push(e.player === seat ? `tu gagnes ${plural(e.delta, 'Vie')}` : `gagne ${plural(e.delta, 'Vie')}`);
        break;
      case 'power': {
        const name = fieldName(b, e.uid, seat) ?? cardName(a, b, e.uid);
        if (name) out.push(`${name} ${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}`);
        break;
      }
      case 'activate':
        // le [Déclenchement] activé par un effet (pas celui qu'on vient de choisir)
        if (e.timing === 'trigger' && what !== 'trigger') out.push(`${e.player === seat ? 'ton' : 'son'} [Déclenchement] ${def(e.num).name}`);
        break;
    }
  }
  return out;
}

// La décision de l'IA (ai) qui fait passer de a à b, vue par seat : « attaque ton Leader Luffy avec Zoro · tu perds
// 1 Vie ». null si ce n'était pas une décision de l'IA.
export function aiMove(a: GameState, b: GameState, ai: PlayerId, seat: PlayerId): AiMove | null {
  if (a.decision?.player !== ai) return null;
  const done = b.history.slice(a.history.length).find((h) => h.player === ai);
  if (!done) return null;
  const parts = [choiceText(a, b, done.choice, seat), ...consequences(a, b, seat, ai, done.choice).slice(0, 3)];
  return { turn: a.turn, text: parts.join(' · ') };
}
