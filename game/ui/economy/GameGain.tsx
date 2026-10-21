// Gain d'une partie en fin de partie (tâche 2.5) : contre l'IA (parties libres et chapitres de l'aventure) et en ligne.
// Une fois la partie finie et enregistrée sur le serveur, on demande son gain (claimGameReward) ; le serveur la rejoue
// et calcule tout. L'écran de fin montre « +45 ฿ · bonus du jour +60 ฿ · coffre : 2 boosters ! » avec une petite
// animation, ou la raison quand la partie ne rapporte rien (« partie trop courte », « plafond du jour atteint »...).
// Réclamer deux fois la même partie ne rapporte rien de plus : le serveur renvoie le même détail.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ECONOMY } from '../../economy/config.ts';
import type { GameReward } from '../../economy/types.ts';
import { AdventureApiError } from '../adventure/api.ts';
import { flushQueue, whenSaved } from '../archiveClient.ts';
import { boosterSfx } from '../sound.ts';
import { claimGameReward } from './api.ts';
import { berry, chestText, useWallet, WalletBadge } from './Wallet.tsx';

export type GainState = { state: 'claiming' } | { state: 'done'; reward: GameReward } | { state: 'error'; message: string } | null;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Le gain d'une partie dont l'identifiant arrive (enregistrement final envoyé, ou partie en ligne retrouvée dans « Mes
// parties ») ; une partie restée dans le navigateur (réseau coupé) est renvoyée d'abord
export async function claimWhenSaved(recordId: () => Promise<string>): Promise<GameReward> {
  const id = await recordId();
  flushQueue();
  await whenSaved();
  try {
    return await claimGameReward(id);
  } catch (e) {
    // enregistrement pas encore arrivé : il reste dans le navigateur, un nouvel essai le renvoie
    if (e instanceof AdventureApiError && e.code === 'unknown_record') throw new Error('Ta partie n’est pas encore arrivée sur le serveur');
    throw e;
  }
}

// Demande du gain, avec un nouvel essai possible après une erreur. claim(recordId) : recordId est rappelé à chaque essai.
export function useGameGain() {
  const [gain, setGain] = useState<GainState>(null);
  const source = useRef<(() => Promise<string>) | null>(null);
  const turn = useRef(0);
  const run = useCallback(() => {
    const get = source.current;
    if (!get) return;
    const n = ++turn.current;
    setGain({ state: 'claiming' });
    claimWhenSaved(get).then(
      (reward) => { if (n === turn.current) setGain({ state: 'done', reward }); },
      (e: unknown) => {
        if (n !== turn.current) return;
        setGain({ state: 'error', message: e instanceof AdventureApiError ? e.message : `${message(e)}. Vérifie ta connexion, puis réessaie.` });
      },
    );
  }, []);
  const claim = useCallback((recordId: () => Promise<string>) => {
    source.current = recordId;
    run();
  }, [run]);
  const reset = useCallback(() => {
    source.current = null;
    turn.current++;
    setGain(null);
  }, []);
  return { gain, claim, retry: run, reset };
}

const ordinal = (n: number) => (n === 1 ? '1re' : `${n}e`);
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Les explications d'un gain réduit ou nul (le serveur dit déjà pourquoi une partie est refusée)
function notes(r: GameReward): string[] {
  const out: string[] = [];
  if (r.mode === 'en-ligne' && r.won && r.base === ECONOMY.online.loss) {
    out.push(`Ton adversaire a abandonné avant ${ECONOMY.rules.minTurns} tours : le gain d’une défaite, sans bonus du jour ni coffre.`);
  }
  if (r.coefficient < 1) {
    const against = r.mode === 'en-ligne' ? 'contre ce joueur' : 'contre ce deck à ce niveau';
    out.push(r.coefficient === 0
      ? `Plus de gain ${against} aujourd’hui (${ordinal(r.sameOpponent + 1)} partie) : change d’adversaire !`
      : `Gain réduit : ${ordinal(r.sameOpponent + 1)} partie ${against} aujourd’hui.`);
  }
  if (r.capped) {
    out.push(`Plafond du jour atteint (${berry(r.wallet.today.cap)} de parties) : les parties rapporteront de nouveau demain. Le bonus du jour et le coffre comptent toujours.`);
  }
  return out;
}

// Le bloc des gains de l'écran de fin. chestNote : où trouver les boosters du coffre (ils attendent dans la Cale).
export function GameGain({ gain, onRetry, chestNote = 'Ils t’attendent dans ta Cale (Aventure).' }: {
  gain: GainState;
  onRetry: () => void;
  chestNote?: string;
}) {
  const { wallet } = useWallet();
  const done = gain?.state === 'done' ? gain.reward : null;
  const chest = done?.chest.length ?? 0;
  const shone = useRef(false);
  useEffect(() => {
    if (chest && !shone.current && !done?.already) {
      shone.current = true;
      boosterSfx('shine');
    }
  }, [chest, done]);
  if (!gain) return null;
  const parts: { key: string; text: string; cls: string }[] = [];
  if (done && !done.refused) {
    if (done.amount > 0 || (!done.dailyBonus && !chest)) parts.push({ key: 'partie', text: berry(done.amount, true), cls: 'op-gain-amount' });
    if (done.dailyBonus) parts.push({ key: 'bonus', text: `bonus du jour ${berry(done.dailyBonus, true)}`, cls: 'op-gain-bonus' });
    if (chest) parts.push({ key: 'coffre', text: `coffre : ${plural(chest, 'booster')} !`, cls: 'op-gain-chest' });
  }
  return (
    <section className={`op-gain${done && !done.refused && done.total > 0 ? ' is-gain' : ''}`} aria-live="polite">
      <div className="op-gain-head">
        <span className="op-gain-title">Gains de la partie</span>
        <WalletBadge wallet={wallet} />
      </div>
      {gain.state === 'claiming' && <p className="op-small op-muted"><span className="op-spinner" /> Le serveur vérifie ta partie…</p>}
      {gain.state === 'error' && (
        <p className="op-gain-row">
          <span className="danger op-small">{gain.message}</span>
          <button className="op-btn op-btn-ghost btn-small" onClick={onRetry}>Réessayer</button>
        </p>
      )}
      {done?.refused && <p className="op-gain-refused">Pas de Berry : {done.refused.message}</p>}
      {parts.length > 0 && (
        <p className="op-gain-line">
          {parts.map((p, i) => (
            <span key={p.key} className={`op-gain-part ${p.cls}`} style={{ animationDelay: `${i * 0.35}s` }}>
              {i > 0 && <span className="op-gain-dot" aria-hidden="true">·</span>}{p.text}
            </span>
          ))}
        </p>
      )}
      {done && !done.refused && notes(done).map((n) => <p key={n} className="op-small op-gain-note">{n}</p>)}
      {chest > 0 && <p className="op-small">🎁 Coffre de la semaine : {plural(chest, 'booster')} {done!.chest[0].set}. {chestNote}</p>}
      {done && !done.refused && !chest && done.won && <p className="op-small op-muted">🎁 {chestText(done.wallet)}</p>}
      {done?.already && <p className="op-small op-muted">Gain déjà compté pour cette partie.</p>}
    </section>
  );
}
