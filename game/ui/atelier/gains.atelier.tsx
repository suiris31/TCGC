// Atelier (tâche 2.5) : le bloc des gains de fin de partie dans tous ses cas, avec des réponses de démonstration du
// serveur (rien n'est réclamé ni enregistré). Ouvert par #play/atelier/gains.
import { useEffect, useState } from 'react';
import { ECONOMY } from '../../economy/config.ts';
import type { GameReward, Wallet } from '../../economy/types.ts';
import { GameGain, type GainState } from '../economy/GameGain.tsx';
import { showWallet } from '../economy/Wallet.tsx';

export const title = 'Gains de fin de partie';

const WALLET: Wallet = {
  balance: 1_245,
  dailyBonus: { amount: ECONOMY.dailyBonus.amount, reserve: 1, keep: ECONOMY.dailyBonus.keepDays },
  chest: { wins: 2, needed: ECONOMY.weeklyChest.wins, boosters: ECONOMY.weeklyChest.boosters, set: ECONOMY.weeklyChest.set, given: false, weekStart: '2026-10-19' },
  today: { earned: 120, cap: ECONOMY.dailyCap },
};

const base: GameReward = {
  recordId: 'demo', mode: 'ia', won: true, base: 45, coefficient: 1, sameOpponent: 0, amount: 45, capped: false,
  dailyBonus: 60, chest: [], total: 105, wallet: WALLET,
};
const chest = Array.from({ length: 2 }, (_, i) => ({ id: `demo-${i}`, set: 'OP03', source: 'coffre', createdAt: '2026-10-21T10:00:00Z' }));

const CASES: [string, GainState][] = [
  ['Victoire, bonus du jour', { state: 'done', reward: base }],
  ['Victoire, bonus et coffre', { state: 'done', reward: { ...base, chest, wallet: { ...WALLET, chest: { ...WALLET.chest, wins: 3, given: true } } } }],
  ['Défaite', { state: 'done', reward: { ...base, won: false, base: 12, amount: 12, dailyBonus: 0, total: 12 } }],
  ['Gain réduit (4e partie)', { state: 'done', reward: { ...base, dailyBonus: 0, coefficient: 0.5, sameOpponent: 3, amount: 23, total: 23 } }],
  ['Plafond atteint', { state: 'done', reward: { ...base, amount: 0, capped: true, total: 60 } }],
  ['En ligne, abandon rapide', { state: 'done', reward: { ...base, mode: 'en-ligne', base: ECONOMY.online.loss, amount: ECONOMY.online.loss, dailyBonus: 0, total: ECONOMY.online.loss } }],
  ['Refusée : trop courte', { state: 'done', reward: { ...base, base: 0, amount: 0, dailyBonus: 0, total: 0, refused: { code: 'too_short', message: 'Partie trop courte (moins de 6 tours) : elle ne rapporte rien' } } }],
  ['Déjà comptée', { state: 'done', reward: { ...base, already: true } }],
  ['Vérification en cours', { state: 'claiming' }],
  ['Erreur', { state: 'error', message: 'Ta partie n’est pas encore arrivée sur le serveur' }],
];

export function render() {
  const [n, setN] = useState(0);
  useEffect(() => showWallet(WALLET), []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '34rem' }}>
      <button className="op-btn op-btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setN((x) => x + 1)}>↻ Rejouer les animations</button>
      {CASES.map(([name, gain]) => (
        <div key={`${name}-${n}`}>
          <p className="op-small op-muted">{name}</p>
          <GameGain gain={gain} onRetry={() => undefined} />
        </div>
      ))}
    </div>
  );
}
