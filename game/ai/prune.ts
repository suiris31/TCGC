// Choix qui ne peuvent rien apporter : l'IA et le coach ne perdent pas de temps (ni de précision) à les simuler, et
// l'interface les signale. Ils restent permis par les règles. L'entraînement de l'IA entraînée pénalise légèrement les
// plus sûrs (attaque vouée à l'échec, Contre ou Bloqueur sur une attaque déjà repoussée : rl/README.md § 16).
import { allField, attachedDon, attackAbility, def, donOnField, fieldCost, findField, isNegated, power } from '../engine/rules.ts';
import type { Decision, FieldCard, GameEvent, GameState, Option, PlayerId } from '../engine/types.ts';

// Cartes pour qui des DON!! données servent même sans attaquer : nombre de DON!! dont leur effet a besoin, et quand
// (Sabo Leader : +1000 à tous avec un Personnage de coût 8 ; Luffy et Zoro Leaders : leur effet [Activation :
// Principale] ; Sanji, Zoro (ST21-015), Fransuké, Burgess : [Initiative] le tour où ils sont joués)
const playedNow = (s: GameState, card: FieldCard) => card.playedTurn === s.turn && !card.rested;
const ownerOf = (s: GameState, card: FieldCard) => findField(s, card.uid)!.player;
const DON_NEEDS: Record<string, { n: number; when: (s: GameState, card: FieldCard) => boolean }> = {
  'OP13-004': { n: 1, when: (s, card) => s.players[ownerOf(s, card)].chars.some((c) => fieldCost(s, c.uid) >= 8) },
  'ST21-001': { n: 1, when: (s, card) => !card.usedOpt.includes('main') && s.players[ownerOf(s, card)].chars.length > 0 },
  'OP12-020': { n: 3, when: (s, card) => !card.usedOpt.includes('main') && card.battledCharTurn === s.turn },
  'ST31-001': { n: 2, when: playedNow },
  'ST21-015': { n: 2, when: playedNow },
  'OP05-070': { n: 1, when: (s, card) => playedNow(s, card) && donOnField(s, ownerOf(s, card)) >= 8 },
  'OP10-085': { n: 1, when: (s, card) => playedNow(s, card) && s.players[ownerOf(s, card)].trash.length >= 8 },
};
// Cartes dont les DON!! données servent aussi pendant le tour adverse (elles restent données jusqu'à la phase de
// Recharge suivante) : nombre de DON!! dont leur effet a besoin
const DON_DEFENSE: Record<string, number> = {
  'ST21-002': 2,   // Usopp : [Tour adverse] +2000
  'ST21-004': 2,   // Jewelry Bonney : [En cas de KO] piocher 1
  'ST21-011': 2,   // Franky : [Tour adverse] +1000 à ses Personnages de 4000 ou moins
  'EB02-003': 2,   // Tony-Tony Chopper : [Tour adverse] +2000
  'OP14-011': 2,   // Bartolomeo : [Bloqueur]
  'OP16-027': 1,   // Jinbe : +2000
  'P-044': 1,      // Sabo : +2000 avec 4 cartes ou moins en main
  'OP06-052': 1,   // Tokikake, Caribou, Garp : pas mis KO en combat (sous conditions)
  'OP10-104': 1,
  'P-054': 1,
};
// Cartes qui comptent toutes les DON!! données de leur joueur (3 ou plus) : Brook (Bloqueur +3000), Luffy (Initiative)
const COUNTS_ALL_DON = ['ST31-003', 'ST31-004'];

// Sortes de choix inutiles : attaque vouée à l'échec ; DON!! donnée à une carte qui n'en tirera rien ; effet qui ne
// peut rien faire maintenant ; Contre ou Bloqueur sur une attaque déjà repoussée ; Événement [Contre] qui ne protège pas
// la carte attaquée
export type UselessKind = 'weakAttack' | 'idleDon' | 'idleEffect' | 'repelled' | 'wrongTarget';

// L'attaque de cette carte déclencherait-elle un de ses effets « quand ... » ? L'attaquant s'épuise, puis attaque (mêmes
// événements que le moteur : Mihawk ST32-003 épuisé pioche ; Newgate OP17-040 donne +3000 au Leader qui attaque)
function attackTriggers(s: GameState, p: PlayerId, f: { card: FieldCard; leader: boolean }, target: number): boolean {
  const base = { player: p, uid: f.card.uid, num: f.card.num, zone: f.leader ? 'leader' : 'character', by: p, cause: 'attack' } as const;
  const events: GameEvent[] = [{ type: 'rest', ...base }, { type: 'attack', ...base, target }];
  return allField(s, p).some((self) => !isNegated(s, self.uid) && (def(self.num).when ?? []).some((w) =>
    !(w.once && self.usedOpt.includes(w.once)) && events.some((e) => w.on === e.type && w.if(s, p, self, e))));
}

export function useless(s: GameState, d: Decision, o: Option): { kind: UselessKind; reason: string } | null {
  const p = d.player;
  const P = s.players[p];
  const [kind, a, b] = o.id.split(':');
  if (d.kind === 'main' && kind === 'attack') {
    // une attaque trop faible échoue d'office ; elle ne sert que si l'attaquant a un effet [En attaquant] ou si elle
    // déclenche un effet « quand ... »
    const f = findField(s, Number(a));
    const atk = power(s, Number(a));
    const target = power(s, Number(b));
    if (f && atk < target && !attackTriggers(s, p, f, Number(b))) {
      const d2 = def(f.card.num);
      if (!d2.whenAttacking) return { kind: 'weakAttack', reason: `puissance insuffisante (${atk} contre ${target})` };
      if (d2.attackUseful && !d2.attackUseful(s, p, f.card, Number(b))) {
        return { kind: 'weakAttack', reason: `puissance insuffisante (${atk} contre ${target}) et son effet [En attaquant] ne sert à rien ici` };
      }
    }
  }
  if (d.kind === 'main' && kind === 'don') {
    // une DON!! donnée ne compte d'habitude que pour attaquer : inutile sur une carte qui ne peut plus attaquer
    const f = findField(s, Number(a));
    if (!f || attackAbility(s, p, f.card).can) return null;
    const need = DON_NEEDS[f.card.num];
    if (need && f.card.don < need.n && need.when(s, f.card)) return null;
    if (f.card.don < (DON_DEFENSE[f.card.num] ?? 0)) return null;
    if (attachedDon(s, p) < 3 && [...P.chars, ...P.hand].some((c) => COUNTS_ALL_DON.includes(c.num))) return null;
    return { kind: 'idleDon', reason: 'cette carte ne peut pas attaquer ce tour (une DON!! ne compte que pour attaquer)' };
  }
  if (d.kind === 'main' && kind === 'act') {
    const f = findField(s, Number(a));
    const useful = f && def(f.card.num).activateMain?.useful;
    if (useful && !useful(s, p, f.card)) return { kind: 'idleEffect', reason: 'son effet ne peut rien faire maintenant' };
  }
  if (d.kind === 'main' && kind === 'event') {
    const card = P.hand.find((c) => c.uid === Number(a));
    const useful = card && def(card.num).mainUseful;
    if (useful && !useful(s, p)) return { kind: 'idleEffect', reason: 'son effet ne peut rien faire maintenant' };
  }
  // contrer ou bloquer une attaque qui échoue déjà ne sert à rien (sauf un Événement [Contre] qui fait autre chose :
  // épuiser, piocher)
  const event = d.kind === 'counter' && kind === 'cevent' ? P.hand.find((c) => c.uid === Number(a)) : undefined;
  const extra = event ? def(event.num).counterExtra?.(s, p) ?? false : false;
  if ((d.kind === 'counter' && (kind === 'counter' || kind === 'cevent')) || (d.kind === 'blocker' && kind === 'block')) {
    const b = s.battle;
    if (b && power(s, b.attacker) < power(s, b.target) && !extra) return { kind: 'repelled', reason: 'l’attaque est déjà repoussée' };
  }
  if (event && s.battle && !extra) {
    const useful = def(event.num).counterUseful;
    if (useful && !useful(s, p, s.battle.target)) return { kind: 'wrongTarget', reason: 'son effet ne protège pas la carte attaquée' };
  }
  return null;
}

export function uselessReason(s: GameState, d: Decision, o: Option): string | null {
  return useless(s, d, o)?.reason ?? null;
}
