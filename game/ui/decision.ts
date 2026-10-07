// Lecture de la décision en cours pour l'interface : quelles actions proposer sur quelle carte, quelles cibles
// allumer, quels boutons afficher, et des textes simples (aperçu d'un combat, phase du tour...).
import { uselessReason } from '../ai/prune.ts';
import { attackAbility, def, findField, handCost, hasBlocker, other, power } from '../engine/rules.ts';
import type { Decision, GameState, Option, PlayerId } from '../engine/types.ts';

export type ActionKind = 'play' | 'event' | 'act' | 'don' | 'attack' | 'block' | 'counter' | 'cevent' | 'choose';

export interface CardAction {
  option: Option;
  kind: ActionKind;
  icon: string;
  label: string;
  detail?: string;    // précision (coût, puissance après...)
  useless?: string;   // pourquoi l'action ne sert à rien
}

export interface PickItem {
  option: Option;
  num: string;
  zone: string;       // d'où vient la carte (main, Défausse, deck...)
}

export interface DecisionView {
  byCard: Map<number, CardAction[]>;      // actions par carte (terrain ou main)
  attacks: Map<number, Option[]>;         // attaques possibles par attaquant
  buttons: Option[];                       // choix sans carte (fin du tour, ne pas bloquer, oui, non...)
  picks: PickItem[];                       // cartes à choisir dans une fenêtre (main, cartes regardées, Défausse)
  special: 'mulligan' | 'trigger' | 'declareCost' | null;
}

const uidOf = (o: Option) => Number(o.id.split(':')[1]);

// Où se trouve une carte (hors terrain)
function zoneOf(s: GameState, uid: number): { player: PlayerId; zone: string; num: string } | null {
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    for (const [zone, cards] of [['main', P.hand], ['Défausse', P.trash], ['Vie', P.life], ['deck', P.deck]] as const) {
      const c = cards.find((x) => x.uid === uid);
      if (c) return { player: p, zone, num: c.num };
    }
  }
  return null;
}

// aids : marquer les choix sans intérêt (jugement de l'IA). Désactivé dans les parties en ligne.
export function readDecision(s: GameState, d: Decision, aids = true): DecisionView {
  const view: DecisionView = { byCard: new Map(), attacks: new Map(), buttons: [], picks: [], special: null };
  const add = (uid: number, a: CardAction) => view.byCard.set(uid, [...(view.byCard.get(uid) ?? []), a]);
  const P = s.players[d.player];
  if (d.kind === 'mulligan') {
    view.special = 'mulligan';
    view.buttons = d.options;
    return view;
  }
  if (d.tag === 'trigger') view.special = 'trigger';
  if (d.tag === 'declareCost') view.special = 'declareCost';
  for (const o of d.options) {
    const [kind] = o.id.split(':');
    const useless = aids ? uselessReason(s, d, o) ?? undefined : undefined;
    if (d.kind === 'main') {
      const uid = uidOf(o);
      if (kind === 'play' || kind === 'event') {
        const card = P.hand.find((c) => c.uid === uid)!;
        const cost = handCost(s, d.player, card);
        const isStage = def(card.num).category === 'STAGE';
        add(uid, { option: o, kind: kind === 'play' ? 'play' : 'event', icon: kind === 'play' ? '▶' : '✦', label: kind === 'play' ? (isStage ? 'Jouer ce Lieu' : 'Jouer ce Personnage') : 'Activer cet Événement', detail: `coût ${cost}`, useless });
      } else if (kind === 'act') {
        add(uid, { option: o, kind: 'act', icon: '✧', label: 'Utiliser son effet', detail: o.label.replace(/^[^:]+ : /, ''), useless });
      } else if (kind === 'don') {
        const f = findField(s, uid)!;
        add(uid, { option: o, kind: 'don', icon: '◆', label: 'Donner 1 DON!!', detail: f.stage ? undefined : `puissance ${power(s, uid)} → ${power(s, uid) + 1000}`, useless });
      } else if (kind === 'attack') {
        view.attacks.set(o.uid!, [...(view.attacks.get(o.uid!) ?? []), o]);
      } else {
        view.buttons.push(o);
      }
    } else if (d.kind === 'blocker') {
      if (kind === 'block') add(uidOf(o), { option: o, kind: 'block', icon: '🛡', label: 'Bloquer l’attaque avec cette carte', detail: blockDetail(s, uidOf(o)) });
      else view.buttons.push(o);
    } else if (d.kind === 'counter') {
      const uid = uidOf(o);
      const card = P.hand.find((c) => c.uid === uid);
      if (kind === 'counter' && card) add(uid, { option: o, kind: 'counter', icon: '🛡', label: `Contrer : +${def(card.num).counter}`, detail: 'la carte est défaussée' });
      else if (kind === 'cevent' && card) add(uid, { option: o, kind: 'cevent', icon: '✦', label: 'Activer son [Contre]', detail: `coût ${def(card.num).cost ?? 0}`, useless });
      else view.buttons.push(o);
    } else {
      // décision au milieu d'un effet : cartes du terrain à cibler, autres cartes dans une fenêtre, le reste en boutons
      const uid = o.uid;
      if (view.special) {
        view.buttons.push(o);
      } else if (uid !== undefined && findField(s, uid)) {
        add(uid, { option: o, kind: 'choose', icon: '◎', label: chooseLabel(d), detail: o.id.startsWith('replace:') ? o.label : undefined });
      } else if (uid !== undefined || o.num) {
        const where = uid !== undefined ? zoneOf(s, uid) : null;
        const num = o.num ?? where?.num;
        if (num) view.picks.push({ option: o, num, zone: where ? (where.player === d.player ? `ta ${where.zone}` : `${where.zone} adverse`) : 'cartes regardées' });
        else view.buttons.push(o);
      } else {
        view.buttons.push(o);
      }
    }
  }
  for (const [attacker, options] of view.attacks) {
    const useful = options.filter((o) => !uselessReason(s, d, o));
    add(attacker, {
      option: options[0],
      kind: 'attack',
      icon: '⚔',
      label: 'Attaquer…',
      detail: `${options.length} cible${options.length > 1 ? 's' : ''} possible${options.length > 1 ? 's' : ''}`,
      useless: useful.length ? undefined : 'puissance insuffisante contre toutes les cibles',
    });
  }
  return view;
}

function chooseLabel(d: Decision): string {
  switch (d.tag) {
    case 'oppKo': return 'Mettre KO cette carte';
    case 'oppRest': return 'Épuiser cette carte';
    case 'oppPower': return 'Lui donner le malus de puissance';
    case 'ownPower': return 'Lui donner le bonus de puissance';
    case 'donTarget': return 'Lui donner la DON!!';
    case 'oppRemove': return 'Retirer cette carte du terrain';
    case 'bounce': return 'Renvoyer cette carte en main';
    case 'oppLock': return 'L’empêcher d’agir';
    case 'oppBase0': return 'Passer sa puissance de base à 0';
    case 'oppToLife': return 'L’envoyer dans la Vie adverse';
    case 'oppCost': return 'Lui donner −2 de coût';
    case 'fullZone': return 'Défausser ce Personnage pour faire de la place';
    case 'replace': return 'Utiliser cet effet de remplacement';
    case 'ownReady': return 'Redresser ce Personnage';
    default: return 'Choisir cette carte';
  }
}

function blockDetail(s: GameState, uid: number) {
  const b = s.battle;
  if (!b) return undefined;
  const atk = power(s, b.attacker);
  const p = power(s, uid);
  return p > atk ? `${p} contre ${atk} : il tient le coup` : `${p} contre ${atk} : il sera mis KO (sauf Contre)`;
}

// Ce qu'une attaque donnerait, en mots simples
export function attackPreview(s: GameState, attacker: number, target: number): { ok: boolean; text: string } {
  const atk = power(s, attacker);
  const defp = power(s, target);
  const tf = findField(s, target);
  const opp = tf ? s.players[tf.player] : null;
  if (atk < defp) return { ok: false, text: `${atk} contre ${defp} : l'attaque échouera.` };
  const need = atk - defp + 1000;
  const blockers = opp ? opp.chars.filter((c) => !c.rested && c.uid !== target && hasBlocker(s, tf!.player, c)).length : 0;
  const result = tf?.leader ? `il perd 1 Vie (il en a ${opp!.life.length})` : 'le Personnage est mis KO';
  return {
    ok: true,
    text: `${atk} contre ${defp} : ça passe, ${result}. Pour repousser, l'adversaire doit contrer d'au moins +${need} (${opp?.hand.length ?? 0} cartes en main)${blockers ? ` ou bloquer (${blockers} Bloqueur${blockers > 1 ? 's' : ''} redressé${blockers > 1 ? 's' : ''})` : ''}.`,
  };
}

// Ce qu'il reste à faire avant de finir son tour. Sans les aides (partie en ligne) : tout ce qui est encore permis,
// sans juger de son intérêt.
export function remainingActions(s: GameState, d: Decision, aids = true): string[] {
  if (d.kind !== 'main') return [];
  const out: string[] = [];
  const useful = (o: Option) => !aids || !uselessReason(s, d, o);
  const attackers = new Set(d.options.filter((o) => o.id.startsWith('attack:') && useful(o)).map((o) => o.uid));
  if (attackers.size) out.push(`attaquer avec ${attackers.size} carte${attackers.size > 1 ? 's' : ''}`);
  const plays = d.options.filter((o) => (o.id.startsWith('play:') || o.id.startsWith('event:')) && useful(o)).length;
  if (plays) out.push(`jouer ${plays} carte${plays > 1 ? 's' : ''} de ta main`);
  const P = s.players[d.player];
  if (P.donActive > 0 && d.options.some((o) => o.id.startsWith('don:') && useful(o))) out.push(`utiliser ${P.donActive} DON!!`);
  return out;
}

// Phase du tour, en mots
export function phaseLabel(s: GameState, human: PlayerId): string {
  if (s.winner !== null) return 'Partie terminée';
  if (s.flow.stage === 'mulligan') return 'Main de départ';
  const who = s.active === human ? 'Ton tour' : 'Tour de l’IA';
  const d = s.decision;
  if (d?.kind === 'blocker' || d?.kind === 'counter' || s.battle) return `${who} · Combat`;
  if (s.flow.stage === 'end') return `${who} · Fin du tour`;
  return `${who} · Phase principale`;
}

// Le Personnage peut-il encore attaquer ce tour ? (pour l'icône « vient d'arriver »)
export function justPlayed(s: GameState, p: PlayerId, uid: number): boolean {
  const f = findField(s, uid);
  if (!f || f.leader || f.stage || f.card.playedTurn !== s.turn || s.active !== p) return false;
  return !attackAbility(s, p, f.card).can && !f.card.rested;
}

export const opponentOf = other;

// Pourquoi une de tes cartes ne peut rien faire en ce moment (affiché quand on clique dessus)
export function whyNot(s: GameState, d: Decision, uid: number): string | null {
  const p = d.player;
  const P = s.players[p];
  const inHand = P.hand.find((c) => c.uid === uid);
  if (inHand) {
    const card = def(inHand.num);
    if (d.kind === 'counter') return card.counter ? null : card.onCounter ? `Il te faut ${card.cost ?? 0} DON!! redressée${(card.cost ?? 0) > 1 ? 's' : ''} pour l'activer.` : 'Cette carte n’a pas de valeur de Contre.';
    if (d.kind !== 'main') return 'Ce n’est pas le moment de jouer une carte.';
    if (card.category === 'EVENT' && !card.onMain) return 'Cet Événement ne se joue que pendant une attaque adverse ([Contre]).';
    const cost = handCost(s, p, inHand);
    if (cost > P.donActive) return `Coût ${cost} : il te manque ${cost - P.donActive} DON!! (tu en as ${P.donActive} utilisable${P.donActive > 1 ? 's' : ''}).`;
    return null;
  }
  const f = findField(s, uid);
  if (!f || f.player !== p || d.kind !== 'main') return null;
  if (f.stage) return 'Ce Lieu n’a rien à faire pour l’instant.';
  if (P.turns <= 1) return 'Personne ne peut attaquer pendant son premier tour.';
  if (f.card.rested) return 'Déjà épuisé : il a attaqué ou payé un coût. Il se redressera au début de ton prochain tour.';
  if (justPlayed(s, p, uid)) return 'Joué ce tour : il pourra attaquer au prochain tour.';
  return 'Aucune action possible pour cette carte en ce moment.';
}
