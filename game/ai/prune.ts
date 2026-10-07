// Choix qui ne peuvent rien apporter : l'IA et le coach ne perdent pas de temps (ni de précision) à les simuler, et
// l'interface les signale. Ils restent permis par les règles.
import { attachedDon, attackAbility, def, fieldCost, findField, power } from '../engine/rules.ts';
import type { Decision, FieldCard, GameState, Option } from '../engine/types.ts';

// Cartes pour qui des DON!! données servent même sans attaquer : nombre de DON!! dont leur effet a besoin, et quand
// (Sabo Leader : +1000 à tous avec un Personnage de coût 8 ; Luffy et Zoro Leaders : leur effet [Activation :
// Principale] ; Sanji : [Initiative] le tour où il est joué)
const DON_NEEDS: Record<string, { n: number; when: (s: GameState, card: FieldCard) => boolean }> = {
  'OP13-004': { n: 1, when: (s, card) => s.players[findField(s, card.uid)!.player].chars.some((c) => fieldCost(s, c.uid) >= 8) },
  'ST21-001': { n: 1, when: (s, card) => !card.usedOpt.includes('main') && s.players[findField(s, card.uid)!.player].chars.length > 0 },
  'OP12-020': { n: 3, when: (s, card) => !card.usedOpt.includes('main') && card.battledCharTurn === s.turn },
  'ST31-001': { n: 2, when: (s, card) => card.playedTurn === s.turn && !card.rested },
};
// Cartes qui comptent toutes les DON!! données de leur joueur (3 ou plus) : Brook (Bloqueur +3000), Luffy (Initiative)
const COUNTS_ALL_DON = ['ST31-003', 'ST31-004'];

export function uselessReason(s: GameState, d: Decision, o: Option): string | null {
  const p = d.player;
  const P = s.players[p];
  const [kind, a, b] = o.id.split(':');
  if (d.kind === 'main' && kind === 'attack') {
    // une attaque trop faible échoue d'office ; elle ne sert que si l'attaquant a un effet [En attaquant]
    const f = findField(s, Number(a));
    const atk = power(s, Number(a));
    const target = power(s, Number(b));
    if (f && atk < target) {
      const d2 = def(f.card.num);
      if (!d2.whenAttacking) return `puissance insuffisante (${atk} contre ${target})`;
      if (d2.attackUseful && !d2.attackUseful(s, p, f.card, Number(b))) return `puissance insuffisante (${atk} contre ${target}) et son effet [En attaquant] ne sert à rien ici`;
    }
  }
  if (d.kind === 'main' && kind === 'don') {
    // une DON!! donnée ne compte que pendant son propre tour : inutile sur une carte qui ne peut plus attaquer
    const f = findField(s, Number(a));
    if (!f || attackAbility(s, p, f.card).can) return null;
    const need = DON_NEEDS[f.card.num];
    if (need && f.card.don < need.n && need.when(s, f.card)) return null;
    if (attachedDon(s, p) < 3 && [...P.chars, ...P.hand].some((c) => COUNTS_ALL_DON.includes(c.num))) return null;
    return 'cette carte ne peut pas attaquer ce tour (une DON!! ne compte que pour attaquer)';
  }
  if (d.kind === 'main' && kind === 'event') {
    const card = P.hand.find((c) => c.uid === Number(a));
    const useful = card && def(card.num).mainUseful;
    if (useful && !useful(s, p)) return 'son effet ne peut rien faire maintenant';
  }
  // contrer ou bloquer une attaque qui échoue déjà ne sert à rien
  if ((d.kind === 'counter' && (kind === 'counter' || kind === 'cevent')) || (d.kind === 'blocker' && kind === 'block')) {
    const b = s.battle;
    if (b && power(s, b.attacker) < power(s, b.target)) return 'l’attaque est déjà repoussée';
  }
  if (d.kind === 'counter' && kind === 'cevent' && s.battle) {
    const card = P.hand.find((c) => c.uid === Number(a));
    const useful = card && def(card.num).counterUseful;
    if (useful && !useful(s, p, s.battle.target)) return 'son effet ne protège pas la carte attaquée';
  }
  return null;
}
