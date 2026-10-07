// Contrôles de cohérence d'une partie : aucune carte créée ni perdue, 10 DON!! par joueur, zones respectées...
// Utilisés par les tests et par le script de validation (scripts/game/validate.ts) entre deux décisions.
import { DECKS } from './decks.ts';
import { def, donTotal, findField, power } from './rules.ts';
import type { Card, GameState, PlayerId } from './types.ts';

export function invariantErrors(s: GameState): string[] {
  const errors: string[] = [];
  const seen = new Map<number, string>();
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    const zones: Record<string, Card[]> = {
      deck: P.deck, main: P.hand, défausse: P.trash, vie: P.life, personnages: P.chars, lieu: P.stage ? [P.stage] : [], leader: [P.leader],
    };
    const counts = new Map<string, number>();
    for (const [zone, cards] of Object.entries(zones)) {
      for (const c of cards) {
        const where = `${P.name}/${zone}`;
        if (seen.has(c.uid)) errors.push(`carte ${def(c.num).name} (${c.uid}) à la fois dans ${seen.get(c.uid)} et ${where}`);
        seen.set(c.uid, where);
        counts.set(c.num, (counts.get(c.num) ?? 0) + 1);
        if (c.faceUp && zone !== 'vie') errors.push(`${def(c.num).name} face visible hors de la Vie (${where})`);
      }
    }
    // la composition du deck (Leader compris) ne change jamais
    const deck = DECKS[P.deckId];
    const expected = new Map(Object.entries(deck.cards));
    expected.set(deck.leader, (expected.get(deck.leader) ?? 0) + 1);
    for (const num of new Set([...counts.keys(), ...expected.keys()])) {
      if ((counts.get(num) ?? 0) !== (expected.get(num) ?? 0)) {
        errors.push(`${P.name} : ${def(num).name} ×${counts.get(num) ?? 0} au lieu de ×${expected.get(num) ?? 0}`);
      }
    }
    // DON!! : 10 en tout (ou ce que dit le Leader), aucune quantité négative, jamais sur un Lieu
    const holders = [P.leader, ...P.chars];
    const attached = holders.reduce((sum, c) => sum + c.don, 0);
    const total = donTotal(P.leader.num);
    if (P.donDeck + P.donActive + P.donRested + attached !== total) {
      errors.push(`${P.name} : ${P.donDeck + P.donActive + P.donRested + attached} DON!! au lieu de ${total} (deck ${P.donDeck}, actives ${P.donActive}, épuisées ${P.donRested}, données ${attached})`);
    }
    if ([P.donDeck, P.donActive, P.donRested, ...holders.map((c) => c.don)].some((n) => n < 0 || !Number.isInteger(n))) errors.push(`${P.name} : nombre de DON!! invalide`);
    if (P.stage && P.stage.don) errors.push(`${P.name} : DON!! données à un Lieu`);
    // zones de terrain
    if (P.chars.length > 5) errors.push(`${P.name} : ${P.chars.length} Personnages (5 au maximum)`);
    for (const c of P.chars) if (def(c.num).category !== 'CHARACTER') errors.push(`${P.name} : ${def(c.num).name} dans la zone de Personnage`);
    if (P.stage && def(P.stage.num).category !== 'STAGE') errors.push(`${P.name} : ${def(P.stage.num).name} dans la zone de Lieu`);
    if (def(P.leader.num).category !== 'LEADER') errors.push(`${P.name} : Leader invalide`);
    for (const c of holders) if (!Number.isFinite(power(s, c.uid))) errors.push(`${P.name} : puissance invalide pour ${def(c.num).name}`);
  }
  for (const m of s.mods) if (!findField(s, m.uid)) errors.push(`modification « ${m.stat} » (${m.source}) sur une carte qui n'est plus sur le terrain`);
  if (s.battle && s.flow.stage !== 'battle') errors.push('combat en cours hors de la phase de combat');
  if (s.decision) {
    if (!s.decision.options.length) errors.push('décision sans aucun choix');
    if (new Set(s.decision.options.map((o) => o.id)).size !== s.decision.options.length) errors.push(`choix en double : ${s.decision.prompt}`);
  }
  return errors;
}
