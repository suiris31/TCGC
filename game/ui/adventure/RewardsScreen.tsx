// Fin d'une partie de l'aventure (tâche 1.17), deuxième et dernier écran après le récap du coach (écran de fin commun,
// end/EndScreen.tsx, tâche R3.3) : le dialogue de victoire ou de défaite, puis ce que la partie a rapporté
// une fois que le serveur l'a vérifiée (récompenses de la première victoire ; gain de la partie en Berry, tâche 2.5),
// avec les boosters gagnés (chapitre, coffre de la semaine) à ouvrir tout de suite ou plus tard (ils restent dans la
// Cale). Écran sans appel au serveur : AdventureApp envoie et ouvre.
import type { Chapter, Reward } from '../../adventure/types.ts';
import { DECKS } from '../../engine/decks.ts';
import { GameGain, type GainState } from '../economy/GameGain.tsx';
import type { ChapterResult } from './api.ts';
import { CardArt, Dialogue, cardName } from './ChapterScreen.tsx';

// Paquet de booster dessiné par nous : le code de l'extension, sans logo ni visuel officiel
export function PackIcon({ set, count }: { set: string; count?: number }) {
  return (
    <span className="op-adv-pack" aria-hidden="true">
      <b>{set}</b>
      {count !== undefined && count > 1 && <i>×{count}</i>}
    </span>
  );
}

function RewardItem({ reward }: { reward: Reward }) {
  switch (reward.kind) {
    case 'booster':
      return (
        <li className="op-adv-reward">
          <PackIcon set={reward.set} count={reward.count} />
          <span>{reward.count} booster{reward.count > 1 ? 's' : ''} {reward.set}</span>
        </li>
      );
    case 'card':
      return (
        <li className="op-adv-reward">
          <CardArt number={reward.number} className="op-adv-reward-card" />
          <span><strong>{cardName(reward.number)}</strong>{reward.count > 1 ? ` ×${reward.count}` : ''}<br /><span className="op-muted op-small">rejoint ta Cale</span></span>
        </li>
      );
    case 'deck': {
      const deck = DECKS[reward.deck];
      return (
        <li className="op-adv-reward">
          {deck && <CardArt number={deck.leader} className="op-adv-reward-card" />}
          <span>Les cartes du deck <strong>{deck?.name ?? reward.deck}</strong><br /><span className="op-muted op-small">rejoignent ta Cale</span></span>
        </li>
      );
    }
    case 'berry':
      return (
        <li className="op-adv-reward">
          <span className="op-adv-berry" aria-hidden="true">฿</span>
          <span><strong>{reward.amount.toLocaleString('fr-FR')} ฿</strong><br /><span className="op-muted op-small">dans ta bourse</span></span>
        </li>
      );
  }
}

export function RewardList({ rewards, dim }: { rewards: Reward[]; dim?: boolean }) {
  if (!rewards.length) return <p className="op-muted op-small">Pas de récompense pour ce chapitre.</p>;
  return <ul className={`op-adv-rewards ${dim ? 'op-adv-rewards-dim' : ''}`}>{rewards.map((r, i) => <RewardItem key={i} reward={r} />)}</ul>;
}

// Mention de l'étude du cadre légal (Plan-aventure/etudes/cadre-legal.md, § 2.5 et 4.2), sous les boosters
export const BOOSTER_NOTICE = 'Boosters virtuels gratuits, sans valeur réelle, ni échangeables ni revendables.';

// Résultat envoyé au serveur : null après une défaite (rien à vérifier)
export type SendState = { state: 'sending' } | { state: 'done'; value: ChapterResult } | { state: 'error'; message: string } | null;

export interface RewardsScreenProps {
  chapter: Chapter;
  won: boolean;
  result: SendState;
  gain?: GainState;                     // gain de la partie en Berry (victoire ou défaite)
  onRetryGain?: () => void;
  opening?: boolean;                    // boosters en cours d'ouverture (tirage sur le serveur)
  openError?: string;
  onOpen: (boosterIds: string[]) => void;
  onLater: () => void;                  // garder les boosters dans la Cale, retour à la carte
  onResend: () => void;                 // renvoyer la partie après une erreur
  onRecap?: () => void;                 // revenir au récap du coach (absent quand la partie n'est plus affichable)
  onRetry: () => void;                  // retenter : relance la partie du chapitre
  onMap: () => void;
}

export function RewardsScreen(p: RewardsScreenProps) {
  const { chapter, won, result } = p;
  const done = result?.state === 'done' ? result.value : null;
  const chest = p.gain?.state === 'done' ? p.gain.reward.chest : [];
  const boosters = [...(done?.firstWin ? done.boosters : []), ...chest];
  const sets = [...new Set(boosters.map((b) => b.set))];
  return (
    <div className={`setup op-adv op-adv-end ${won ? 'op-adv-end-won' : 'op-adv-end-lost'}`} data-ui="rewards">
      <header className="op-adv-head op-adv-end-head">
        <div className="op-adv-title">
          <span className="op-muted op-small">{chapter.place} · {chapter.title}</span>
          <h1 className={won ? 'good' : 'danger'}>{won ? 'Victoire !' : 'Défaite'}</h1>
        </div>
      </header>

      <Dialogue key={`${chapter.id}-${won}`} lines={won ? chapter.victory : chapter.defeat} />

      {won ? (
        <section className="op-adv-panel op-adv-loot">
          {result?.state === 'sending' && <p className="op-muted"><span className="op-spinner" /> Le serveur vérifie ta partie…</p>}
          {result?.state === 'error' && (
            <div className="op-adv-row">
              <span className="danger">{result.message}</span>
              <button className="op-btn op-btn-ghost btn-small" data-ui="rewards.resend" onClick={p.onResend}>Réessayer</button>
            </div>
          )}
          {done && !done.won && <p className="op-warn">Le serveur n’a pas pu confirmer cette victoire : elle ne compte pas pour l’aventure.</p>}
          {done?.won && !done.firstWin && <p className="op-muted">Chapitre déjà gagné : cette victoire compte dans ton bilan, sans nouvelle récompense.</p>}
          {done?.firstWin && (
            <>
              {/* les boosters ont leur propre bloc plus bas */}
              {done.rewards.some((r) => r.kind !== 'booster' || !done.boosters.length) && (
                <>
                  <h2>Tu gagnes</h2>
                  <RewardList rewards={done.rewards.filter((r) => r.kind !== 'booster' || !done.boosters.length)} />
                </>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="op-adv-panel">
          <p className="op-muted">Pas de récompense de chapitre cette fois. Revois le récap du coach, ajuste ton deck, et retente ta chance !</p>
          <div className="op-adv-row">
            <button className="op-btn op-btn-primary" data-ui="rewards.retry" onClick={p.onRetry}>⚔ Retenter le chapitre</button>
          </div>
        </section>
      )}

      {p.gain && <GameGain gain={p.gain} onRetry={p.onRetryGain ?? (() => undefined)} chestNote="À ouvrir ci-dessous, ou plus tard depuis ta Cale." />}

      {boosters.length > 0 && (
        <div className="op-adv-boosters">
          <div className="op-adv-boosters-packs">
            {sets.map((set) => <PackIcon key={set} set={set} count={boosters.filter((b) => b.set === set).length} />)}
          </div>
          <div className="op-adv-boosters-text">
            <strong>{boosters.length} booster{boosters.length > 1 ? 's' : ''} à ouvrir</strong>
            <span className="op-small op-muted">Ouvre-les maintenant, ou plus tard depuis ta Cale.</span>
          </div>
          <div className="op-adv-row">
            <button className="op-btn op-btn-primary" data-ui="rewards.open" disabled={p.opening} onClick={() => p.onOpen(boosters.map((b) => b.id))}>
              {p.opening ? <><span className="op-spinner" /> Ouverture…</> : '🎁 Ouvrir maintenant'}
            </button>
            <button className="op-btn op-btn-ghost" data-ui="rewards.later" disabled={p.opening} onClick={p.onLater}>Plus tard</button>
          </div>
          {p.openError && <p className="danger op-small">{p.openError}</p>}
          <p className="op-small op-muted op-adv-notice">{BOOSTER_NOTICE}</p>
        </div>
      )}

      <div className="op-adv-row op-adv-end-actions">
        {p.onRecap && <button className="op-btn op-btn-ghost" data-ui="rewards.recap" onClick={p.onRecap}>📊 Revoir le récap</button>}
        {!(boosters.length > 0) && <button className={won ? 'op-btn op-btn-primary' : 'op-btn op-btn-ghost'} data-ui="rewards.map" onClick={p.onMap}>🗺️ Retour à la carte</button>}
      </div>
    </div>
  );
}
