// Échange des doublons (tâche 2.6) : au-delà de ECONOMY.duplicates.keep exemplaires d'une carte (toutes versions
// comptées), les exemplaires en trop s'échangent contre des Berry. Aperçu d'abord (ce qui part, ce que ça rapporte, les
// decks d'aventure qui deviendraient incomplets), puis confirmation explicite, sur la même Cale : si elle a changé entre
// les deux, le serveur refuse et on montre le nouvel aperçu. Les versions normales partent d'abord ; les versions
// spéciales (parallèles, SP) restent dans la Cale sauf si on coche la case.
import { useCallback, useEffect, useState } from 'react';
import { ECONOMY, type Rarity } from '../../economy/config.ts';
import type { DuplicateLine, DuplicatesExchange, DuplicatesPreview } from '../../economy/types.ts';
import { cardData } from '../../engine/cards/index.ts';
import { AdventureApiError } from '../adventure/api.ts';
import { CardImage } from '../adventure/CardImage.tsx';
import { RARITIES, RARITY_LABELS, versionName } from '../adventure/hold.ts';
import * as api from './api.ts';
import { berry, showWallet } from './Wallet.tsx';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const nameOf = (number: string) => cardData()[number]?.name ?? number;

// Ce dont l'échange a besoin (le client du serveur ; l'atelier en donne un de démonstration)
export interface DuplicatesClient {
  previewDuplicates: (withVariants?: boolean) => Promise<DuplicatesPreview>;
  exchangeDuplicates: (stateKey: string, exchangeId: string, withVariants?: boolean) => Promise<DuplicatesExchange>;
}

export const DUPLICATES_SERVER: DuplicatesClient = { previewDuplicates: api.previewDuplicates, exchangeDuplicates: api.exchangeDuplicates };

// « Commune 1 ฿ · Peu commune 1 ฿ · ... »
const VALUE_LIST = RARITIES.filter((r): r is Rarity => r in ECONOMY.duplicates.value)
  .map((r) => `${RARITY_LABELS[r]} ${berry(ECONOMY.duplicates.value[r])}`).join(' · ');

// Exemplaires en trop d'une Cale (toutes versions comptées), pour le bouton de la Cale
export function duplicateCount(cards: { number: string; count: number }[]): number {
  const byNumber = new Map<string, number>();
  for (const c of cards) byNumber.set(c.number, (byNumber.get(c.number) ?? 0) + c.count);
  return [...byNumber.values()].reduce((s, n) => s + Math.max(0, n - ECONOMY.duplicates.keep), 0);
}

// onExchanged : l'échange est fait (la Cale a changé : à relire)
export function DuplicatesDialog({ onClose, onExchanged, client = DUPLICATES_SERVER }: {
  onClose: () => void;
  onExchanged: () => void;
  client?: DuplicatesClient;
}) {
  const [withVariants, setWithVariants] = useState(false);
  const [preview, setPreview] = useState<DuplicatesPreview | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // identifiant gardé après une coupure : le serveur ne refait pas un échange déjà fait
  const [pendingId, setPendingId] = useState<string>();
  const [done, setDone] = useState<DuplicatesExchange | null>(null);

  const load = useCallback((variants: boolean) => {
    setPreview(null);
    setLoadError(undefined);
    client.previewDuplicates(variants).then(setPreview, (e: unknown) => setLoadError(message(e)));
  }, [client]);
  useEffect(() => load(withVariants), [load, withVariants]);

  const toggle = (on: boolean) => {
    setWithVariants(on);
    setError(undefined);
    setNotice(undefined);
    setPendingId(undefined);
  };

  const confirm = async () => {
    if (!preview) return;
    const id = pendingId ?? api.newOperationId();
    setPendingId(id);
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await client.exchangeDuplicates(preview.stateKey, id, withVariants);
      showWallet(result.wallet);
      setDone(result);
      onExchanged();
    } catch (e) {
      if (e instanceof AdventureApiError && e.code === 'hold_changed') {
        setPendingId(undefined);
        setNotice('Ta Cale a changé depuis l’aperçu : voici le nouvel aperçu, vérifie-le avant d’échanger.');
        load(withVariants);
      } else {
        // refus du serveur : rien n'est échangé, un nouvel essai est un nouvel échange ; coupure : on ne sait pas
        if (e instanceof AdventureApiError && e.status >= 400 && e.status < 500) setPendingId(undefined);
        setError(message(e));
      }
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (done) {
    const cards = done.lines.reduce((s, l) => s + l.count, 0);
    body = (
      <>
        <span className="op-dup-icon is-fresh" aria-hidden="true">♻️</span>
        <h3 className="good">Échange fait : {berry(done.total, true)} !</h3>
        <p>{plural(cards, 'carte')} en trop {cards > 1 ? 'ont quitté' : 'a quitté'} ta Cale. Tu gardes {ECONOMY.duplicates.keep} exemplaires de chacune.</p>
        <div className="modal-actions"><button className="op-btn op-btn-primary" onClick={onClose}>Fermer</button></div>
      </>
    );
  } else {
    const lines = preview ? [...preview.lines].sort((a, b) => b.value * b.count - a.value * a.count || a.number.localeCompare(b.number, 'fr', { numeric: true })) : [];
    const cards = lines.reduce((s, l) => s + l.count, 0);
    body = (
      <>
        <header className="db-row"><h3>♻️ Échanger mes doublons</h3><span className="db-grow" /><button className="icon-btn" disabled={busy} onClick={onClose} aria-label="Fermer">✕</button></header>
        <p className="op-small">
          Tu gardes <strong>{ECONOMY.duplicates.keep} exemplaires</strong> de chaque carte (toutes versions comptées) ; ceux en
          trop s’échangent contre des Berry. Valeur d’un exemplaire : {VALUE_LIST}.
        </p>
        <label className="op-dup-variants">
          <input type="checkbox" checked={withVariants} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
          <span>Échanger aussi les versions spéciales (parallèles, SP) <span className="op-muted">— sans cette case, elles restent toutes dans ta Cale</span></span>
        </label>
        {notice && <p className="op-dup-notice op-small">{notice}</p>}
        {preview ? (
          lines.length ? (
            <>
              <ul className="op-dup-lines">
                {lines.map((l) => <DuplicateRow key={`${l.number}|${l.variant}`} line={l} />)}
              </ul>
              <p className="op-dup-total">
                <span>{plural(cards, 'carte')} en trop</span>
                <strong>{berry(preview.total, true)}</strong>
              </p>
              {preview.decks.length > 0 && (
                <p className="op-dup-warning">
                  ⚠️ Après l’échange, {preview.decks.length > 1 ? 'ces decks d’aventure seront incomplets' : 'ce deck d’aventure sera incomplet'} :{' '}
                  <strong>{preview.decks.map((d) => d.name || 'sans nom').join(', ')}</strong>. Il faudra {preview.decks.length > 1 ? 'les' : 'le'} compléter
                  avant de {preview.decks.length > 1 ? 'les' : 'le'} jouer.
                </p>
              )}
            </>
          ) : (
            <p className="op-muted">
              Aucun doublon à échanger : tu n’as aucune carte en plus de {ECONOMY.duplicates.keep} exemplaires
              {withVariants ? '.' : ' en version normale (les versions spéciales sont gardées).'}
            </p>
          )
        ) : loadError ? (
          <p className="danger op-small">{loadError} <button className="op-btn op-btn-ghost btn-small" onClick={() => load(withVariants)}>Réessayer</button></p>
        ) : <p className="op-muted"><span className="op-spinner" /> Je compte tes doublons…</p>}
        {error && <p className="danger op-small">{error}</p>}
        <div className="modal-actions">
          <button className="op-btn op-btn-ghost" disabled={busy} onClick={onClose}>{lines.length ? 'Annuler' : 'Fermer'}</button>
          {lines.length > 0 && (
            <button className="op-btn op-btn-primary" disabled={busy || !preview} onClick={() => void confirm()}>
              {busy ? <><span className="op-spinner" /> Échange…</> : pendingId && error ? 'Réessayer' : `Échanger pour ${berry(preview!.total, true)}`}
            </button>
          )}
        </div>
      </>
    );
  }
  return (
    <div className="modal" onClick={busy ? undefined : onClose}>
      <div className="modal-box op-dup" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
}

function DuplicateRow({ line }: { line: DuplicateLine }) {
  const name = nameOf(line.number);
  return (
    <li className={line.variant !== 'base' ? 'is-special' : undefined}>
      <span className="op-dup-thumb"><CardImage entry={{ number: line.number, variant: line.variant, name }} /></span>
      <span className="op-dup-text">
        <span className="op-dup-name">{name}{line.variant !== 'base' && <span className="op-hold-variant op-dup-variant">✦ {versionName(line.variant)}</span>}</span>
        <span className="op-small op-muted">{line.number} · {RARITY_LABELS[line.rarity] ?? line.rarity} · ×{line.count} à {berry(line.value)}</span>
      </span>
      <span className="op-dup-amount">{berry(line.count * line.value, true)}</span>
    </li>
  );
}
