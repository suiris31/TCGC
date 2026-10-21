// La bourse du joueur (tâche 2.3) : le solde en Berry, partagé par tous les écrans de l'aventure, la pastille qui
// l'affiche en permanence (avec une petite animation quand il change), et le détail : bonus du jour en réserve, coffre de
// la semaine, gains des parties du jour face au plafond. Les Berry sont ceux de la « bourse » (👛), à dépenser à la
// boutique : rien à voir avec la prime de l'avis de recherche (étape 3), qu'on ne dépense pas.
// Le serveur calcule tout ; ces écrans ne font qu'afficher le dernier porte-monnaie reçu.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ECONOMY } from '../../economy/config.ts';
import type { Wallet } from '../../economy/types.ts';
import { sfx } from '../sound.ts';
import { loadWallet, subscribeWallet } from './api.ts';

// ---------- Montants ----------

// « 2 340 ฿ » ; signed : « +45 ฿ », « −2 000 ฿ »
export function berry(amount: number, signed = false): string {
  const text = `${Math.abs(amount).toLocaleString('fr-FR')} ฿`;
  if (!signed) return amount < 0 ? `−${text}` : text;
  return amount > 0 ? `+${text}` : amount < 0 ? `−${text}` : text;
}

// ---------- Solde partagé entre les écrans ----------

// Le dernier porte-monnaie connu : lu une fois (refreshWallet), puis suivi par chaque réponse du serveur qui en contient
// un (achat, gain de fin de partie, échange de doublons : subscribeWallet de api.ts)
let current: Wallet | null = null;
let failure: string | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

export function showWallet(wallet: Wallet) {
  current = wallet;
  failure = null;
  notify();
}
subscribeWallet(showWallet);

let pending: Promise<void> | null = null;
export function refreshWallet(load: () => Promise<Wallet> = loadWallet): Promise<void> {
  pending ??= load().then(showWallet, (e: unknown) => {
    failure = e instanceof Error ? e.message : String(e);
    notify();
  }).finally(() => { pending = null; });
  return pending;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => current;

// Le porte-monnaie à afficher ; le premier écran qui en a besoin le lit sur le serveur (load : client de démonstration
// de l'atelier). error : la lecture a échoué (le dernier porte-monnaie reste affiché s'il y en a un)
export function useWallet(load?: () => Promise<Wallet>): { wallet: Wallet | null; error: string | null; reload: () => void } {
  const wallet = useSyncExternalStore(subscribe, snapshot);
  const error = useSyncExternalStore(subscribe, () => failure);
  useEffect(() => { void refreshWallet(load); }, [load]);
  return { wallet, error, reload: () => void refreshWallet(load) };
}

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(query);
    const update = () => setReduced(m.matches);
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);
  return reduced;
}

// ---------- Pastille du solde ----------

// Le solde qui défile jusqu'à sa nouvelle valeur, et l'écart qui s'envole (« +45 ฿ ») ; sobre si le système demande
// de réduire les animations. Un gain fait un petit son (s'il est activé dans le jeu).
function useAnimatedBalance(balance: number | undefined) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(balance);
  const [delta, setDelta] = useState<{ amount: number; n: number } | null>(null);
  const last = useRef(balance);
  useEffect(() => {
    const from = last.current;
    last.current = balance;
    if (balance === undefined || from === undefined || from === balance) {
      setShown(balance);
      return;
    }
    setDelta((d) => ({ amount: balance - from, n: (d?.n ?? 0) + 1 }));
    if (balance > from) sfx('don');
    if (reduced) {
      setShown(balance);
      return;
    }
    const start = performance.now();
    const duration = 800;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(from + (balance - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [balance, reduced]);
  // l'écart disparaît après son envol
  useEffect(() => {
    if (!delta) return;
    const timer = setTimeout(() => setDelta(null), 1800);
    return () => clearTimeout(timer);
  }, [delta]);
  return { shown, delta };
}

const TITLE = 'Ta bourse : les Berry gagnés en jouant, à dépenser à la boutique';

// Le solde, toujours visible dans l'aventure. onClick : ouvrir la boutique (absent : simple affichage)
export function WalletBadge({ wallet, onClick }: { wallet: Wallet | null; onClick?: () => void }) {
  const { shown, delta } = useAnimatedBalance(wallet?.balance);
  const body = (
    <>
      <span className="op-wallet-purse" aria-hidden="true">👛</span>
      <span className="op-wallet-amount">{shown === undefined ? '…' : berry(shown)}</span>
      {delta && (
        <span key={delta.n} className={`op-wallet-delta ${delta.amount > 0 ? 'is-gain' : 'is-spent'}`} aria-hidden="true">
          {berry(delta.amount, true)}
        </span>
      )}
    </>
  );
  const cls = `op-wallet-badge${delta ? (delta.amount > 0 ? ' is-up' : ' is-down') : ''}`;
  const label = wallet ? `Bourse : ${berry(wallet.balance)}` : 'Bourse';
  return onClick ? (
    <button type="button" key={delta?.n} className={`${cls} op-wallet-link`} onClick={onClick} title={`${TITLE}. Ouvrir la boutique`} aria-label={`${label}. Ouvrir la boutique`}>{body}</button>
  ) : (
    <span key={delta?.n} className={cls} title={TITLE} role="status" aria-label={label}>{body}</span>
  );
}

// ---------- Détail de la bourse ----------

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export function bonusText(w: Wallet): string {
  const { amount, reserve, keep } = w.dailyBonus;
  if (reserve <= 0) return `Bonus du jour déjà touché : le prochain arrive demain (ils se gardent ${keep} jours).`;
  return `+${berry(amount)} sur ta prochaine victoire${reserve > 1 ? ` (×${reserve} en réserve)` : ''}`;
}

export function chestText(w: Wallet): string {
  const c = w.chest;
  const prize = `${plural(c.boosters, 'booster')} ${c.set}`;
  if (c.given) return `Coffre reçu cette semaine : ${prize} dans ta Cale. Le prochain lundi !`;
  const left = Math.max(0, c.needed - c.wins);
  return `${Math.min(c.wins, c.needed)}/${c.needed} victoires cette semaine · encore ${plural(left, 'victoire')} pour ${prize}`;
}

// Bonus du jour, coffre de la semaine et plafond du jour
export function WalletDetails({ wallet }: { wallet: Wallet }) {
  const { chest, today, dailyBonus } = wallet;
  const capped = today.earned >= today.cap;
  return (
    <ul className="op-wallet-details">
      <li className={dailyBonus.reserve > 0 ? 'is-ready' : undefined}>
        <span className="op-wallet-icon" aria-hidden="true">☀️</span>
        <span><strong>Bonus du jour</strong><br />{bonusText(wallet)}</span>
      </li>
      <li className={chest.given ? 'is-done' : undefined}>
        <span className="op-wallet-icon" aria-hidden="true">🎁</span>
        <span>
          <strong>Coffre de la semaine</strong><br />{chestText(wallet)}
          {!chest.given && (
            <span className="op-wallet-pips" aria-hidden="true">
              {Array.from({ length: chest.needed }, (_, i) => <i key={i} className={i < chest.wins ? 'on' : undefined} />)}
            </span>
          )}
        </span>
      </li>
      <li className={capped ? 'is-capped' : undefined}>
        <span className="op-wallet-icon" aria-hidden="true">⚓</span>
        <span>
          <strong>Gains des parties aujourd’hui</strong><br />
          {capped
            ? <>Plafond du jour atteint ({berry(today.cap)}) : les parties rapporteront de nouveau demain. Le bonus du jour et le coffre comptent toujours.</>
            : <>{berry(today.earned)} sur {berry(today.cap)} au plus par jour</>}
          <span className="op-wallet-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * today.earned) / Math.max(1, today.cap))}%` }} /></span>
        </span>
      </li>
    </ul>
  );
}

// Comment gagner des Berry : tous les chiffres viennent du barème (game/economy/config.ts)
export function EarnHelp() {
  const e = ECONOMY;
  const levels: [1 | 2 | 3 | 4, string][] = [[1, 'Débutant'], [2, 'Confirmé'], [3, 'Expert'], [4, 'IA entraînée']];
  return (
    <details className="op-wallet-help">
      <summary>Comment gagner des Berry ?</summary>
      <ul>
        <li>
          <strong>Contre l’IA</strong> (parties libres et chapitres rejoués) : {levels.map(([l, name], i) => (
            <span key={l}>{i ? ', ' : ''}{name} {berry(e.ai.win[l])}</span>
          ))} par victoire ; une défaite rapporte un peu ({berry(e.ai.loss[1])} à {berry(e.ai.loss[4])}).
        </li>
        <li><strong>En ligne</strong> : {berry(e.online.win)} par victoire, {berry(e.online.loss)} par défaite.</li>
        <li>
          <strong>Aventure</strong> : la première victoire d’un chapitre rapporte {berry(e.adventure.firstWin)}
          ({berry(e.adventure.firstWinBonus)} pour un défi, {berry(e.adventure.firstWinFinal)} pour la fin d’un arc).
        </li>
        <li>
          <strong>Bonus du jour</strong> : +{berry(e.dailyBonus.amount)} sur la première victoire du jour. Pas joué hier ? Il
          t’attend : jusqu’à {e.dailyBonus.keepDays} bonus se gardent en réserve.
        </li>
        <li>
          <strong>Coffre de la semaine</strong> : {e.weeklyChest.wins} victoires dans la semaine (du lundi au dimanche) donnent
          {' '}{plural(e.weeklyChest.boosters, 'booster')} {e.weeklyChest.set}.
        </li>
        <li>
          Les parties rapportent au plus {berry(e.dailyCap)} par jour. Rejouer sans cesse contre le même adversaire rapporte
          de moins en moins dans la journée ; une partie doit durer au moins {e.rules.minTurns} tours.
        </li>
      </ul>
      <p className="op-small op-muted">Les Berry sont virtuels et gratuits : ils ne s’achètent pas et ne s’échangent pas.</p>
    </details>
  );
}
