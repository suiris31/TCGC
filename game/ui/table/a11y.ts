// Accessibilité du plateau (tâche R2.8) : ce que lit un lecteur d'écran d'une carte et d'une zone, le parcours des
// cartes au clavier (les flèches dans une zone, Tab d'une zone à l'autre, Entrée ouvre le menu de la carte, Échap
// annule), et ce qu'annonce la région aria-live du plateau (la consigne de la barre d'action, les actions jouées).
// Les fonctions pures sont testées par game/tests/a11y.test.ts ; useBoardFocus et useAnnouncement les branchent sur
// le plateau (TableScreen).
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { playerNames, sayLogLine, sayReason } from '../../coach/logText.ts';
import { name, power } from '../../engine/rules.ts';
import type { Card, GameState, PlayerId } from '../../engine/types.ts';
import type { CardLook } from '../CardView.tsx';
import { quoteCardNames } from '../texts.ts';
import type { BoardInteraction } from './useBoardInteraction.ts';

// ---------- Ce qu'on lit d'une carte et d'une zone ----------

export interface CardLabelInput {
  name: string;
  hand: boolean;               // dans ta main (le coût est celui à payer)
  power: number | null;        // puissance actuelle (carte du terrain)
  basePower: number | null;    // puissance imprimée
  cost: number | null;         // coût à payer (main), ou coût actuel s'il est modifié (terrain)
  baseCost: number | null;     // coût imprimé
  rested: boolean;
  don: number;                 // DON!! données
  states: string[];            // les pastilles d'état (« [Bloqueur] : ... »)
  look: CardLook;
}

const change = (now: number, base: number | null) =>
  (now > (base ?? 0) ? ` (augmenté de ${now - (base ?? 0)})` : now < (base ?? 0) ? ` (diminué de ${(base ?? 0) - now})` : '');

// Ce que la carte montre en couleur (contour, grisé, pastille), en mots
function lookText(l: CardLook): string[] {
  const out: string[] = [];
  if (l.target) out.push('cible possible de l’attaque');
  if (l.choose) out.push('à choisir');
  if (l.actionable) out.push('actions possibles');
  if (l.dim) out.push('pas jouable maintenant');
  if (l.badge) out.push(l.badge.startsWith('+') ? `Contre ${l.badge}` : l.badge);
  if (l.recommended) out.push('conseillée par le coach');
  if (l.selected) out.push('sélectionnée');
  return out;
}

// Le nom, la puissance, le coût, l'état : « Nami, 1000 de puissance (augmenté de 1000), épuisée, [Bloqueur] : ...,
// actions possibles »
export function cardLabel(x: CardLabelInput): string {
  const parts = [x.name];
  if (x.power !== null) parts.push(`${x.power} de puissance${change(x.power, x.basePower)}`);
  if (x.cost !== null) parts.push(`${x.hand ? 'coût' : 'coût actuel'} ${x.cost}${change(x.cost, x.baseCost)}`);
  if (x.rested) parts.push('épuisée');
  if (x.don > 0) parts.push(`${x.don} DON!! donnée${x.don > 1 ? 's' : ''}`);
  return [...parts, ...x.states, ...lookText(x.look)].join(', ');
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Le titre d'un camp, avec ce qu'on ne lit pas sur les cartes : « Camp de l’IA : 4 Vies, 32 cartes dans le deck,
// 3 DON!! utilisables »
export function zoneLabel(s: GameState, p: PlayerId, me: boolean): string {
  const P = s.players[p];
  return `${me ? 'Ton camp' : `Camp de ${P.name}`} : ${plural(P.life.length, 'Vie')}, ${plural(P.deck.length, 'carte')} dans le deck, ` +
    `${plural(P.trash.length, 'carte')} dans la Défausse, ${P.donActive} DON!! utilisable${P.donActive > 1 ? 's' : ''}`;
}

// ---------- Le parcours au clavier ----------

export type ZoneMove = 'prev' | 'next' | 'first' | 'last';

// Les flèches parcourent une zone (gauche et haut : la carte d'avant), Début et Fin vont aux bouts
export function zoneMove(key: string): ZoneMove | null {
  switch (key) {
    case 'ArrowLeft': case 'ArrowUp': return 'prev';
    case 'ArrowRight': case 'ArrowDown': return 'next';
    case 'Home': return 'first';
    case 'End': return 'last';
    default: return null;
  }
}

// La carte où va le focus (on reboucle au bout de la zone)
export function moveIndex(index: number, count: number, move: ZoneMove): number {
  if (count <= 0) return -1;
  if (move === 'first') return 0;
  if (move === 'last') return count - 1;
  const step = move === 'next' ? 1 : -1;
  return ((index < 0 ? (step > 0 ? -1 : 0) : index) + step + count) % count;
}

// La carte d'une zone que Tab atteint : la dernière qui y a eu le focus si elle y est encore, sinon la première
export function tabStop(uids: number[], remembered: number | undefined): number | null {
  if (!uids.length) return null;
  return remembered !== undefined && uids.includes(remembered) ? remembered : uids[0];
}

// La carte d'un uid, où qu'elle soit (pour l'aperçu d'une carte qui reçoit le focus)
function cardOf(s: GameState, uid: number): Card | undefined {
  for (const P of s.players) {
    const c = [P.leader, ...P.chars, ...(P.stage ? [P.stage] : []), ...P.hand, ...P.life, ...P.trash].find((x) => x.uid === uid);
    if (c) return c;
  }
  return undefined;
}

const ZONE = '[data-a11y-zone]';
const CARD = '.card[role="button"]';
const MENU = '[data-ui="menu"]';
// Les cartes d'une zone, sans celles d'une zone qu'elle contient (sur ordinateur, ta main est dans ton camp)
const zoneCards = (zone: Element) => [...zone.querySelectorAll<HTMLElement>(CARD)].filter((c) => c.closest(ZONE) === zone);

// Une seule carte par zone est atteinte par Tab (tabindex 0), les autres le sont par les flèches (-1)
function applyStops(root: HTMLElement, stops: Map<string, number>) {
  root.querySelectorAll<HTMLElement>(ZONE).forEach((zone) => {
    const cards = zoneCards(zone);
    const stop = tabStop(cards.map((c) => Number(c.dataset.uid)), stops.get(zone.dataset.a11yZone ?? ''));
    for (const c of cards) {
      const want = Number(c.dataset.uid) === stop ? 0 : -1;
      if (c.tabIndex !== want) c.tabIndex = want;
    }
  });
}

// Le plateau au clavier, dans l'élément root (l'écran de la partie) :
// - les flèches parcourent les cartes d'une zone (ton camp, celui de l'adversaire, ta main) et les actions du menu ;
// - Entrée ou Espace sur une carte fait comme un clic (son menu s'ouvre, ou la cible visée est attaquée) ;
// - une carte qui reçoit le focus au clavier s'affiche comme au survol (détail, résultat prévu d'une attaque) ;
// - le menu ouvert au clavier prend le focus ; l'attaque choisie le donne à la première cible ; quand ce qui avait le
//   focus disparaît (menu fermé, carte jouée), il revient sur la carte, là où elle est maintenant.
// Rien ne bouge le focus pour qui joue à la souris ou au doigt. Échap reste à useGameKeys (il ferme tout).
export function useBoardFocus(root: RefObject<HTMLElement | null>, board: BoardInteraction) {
  const latest = useRef(board);
  latest.current = board;
  const keyboard = useRef(false);            // dernier geste : une touche (et non la souris ou le doigt)
  const stops = useRef(new Map<string, number>());
  const last = useRef<number | null>(null);  // la dernière carte qui a eu le focus
  const hovering = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onAnyKey = (e: KeyboardEvent) => { if (!e.ctrlKey && !e.metaKey) keyboard.current = true; };
    const onPointer = () => { keyboard.current = false; };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const move = zoneMove(e.key);
      const menu = t.closest?.(MENU);
      if (menu && move) {
        const items = [...menu.querySelectorAll<HTMLElement>('button')];
        items[moveIndex(items.indexOf(t), items.length, move)]?.focus();
        e.preventDefault();
        return;
      }
      if (!t.matches?.(CARD) || e.ctrlKey || e.metaKey || e.altKey) return;
      const zone = t.closest(ZONE);
      if (move && zone) {
        const cards = zoneCards(zone);
        cards[moveIndex(cards.indexOf(t), cards.length, move)]?.focus();
        e.preventDefault();
      } else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        t.click();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches?.(CARD)) return;
      // une carte cliquée ou touchée ne garde pas le focus : Entrée reste « Fin du tour » pour qui joue à la souris
      if (!keyboard.current) {
        t.blur();
        return;
      }
      const uid = Number(t.dataset.uid);
      last.current = uid;
      const zone = t.closest<HTMLElement>(ZONE)?.dataset.a11yZone;
      if (zone) {
        stops.current.set(zone, uid);
        applyStops(el, stops.current);
      }
      const b = latest.current;
      const card = b.state ? cardOf(b.state, uid) : undefined;
      if (card && t.matches(':focus-visible')) {
        hovering.current = true;
        b.ui.onHover({ num: card.num, uid, rect: t.getBoundingClientRect() });
      }
    };
    const onFocusOut = () => {
      if (!hovering.current) return;
      hovering.current = false;
      latest.current.ui.onHover(null);
    };
    document.addEventListener('keydown', onAnyKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    el.addEventListener('keydown', onKey);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('keydown', onAnyKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [root]);

  // Après chaque affichage : les cartes atteintes par Tab, puis le focus donné ou rendu (au clavier seulement)
  const menuUid = board.menu?.uid ?? null;
  const attacker = board.targeting?.attacker ?? null;
  const seen = useRef({ menuUid, attacker });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    applyStops(el, stops.current);
    const was = seen.current;
    seen.current = { menuUid, attacker };
    if (!keyboard.current) return;
    const focus = (x: HTMLElement | null | undefined) => {
      if (!x) return false;
      x.focus();
      return document.activeElement === x;
    };
    if (menuUid !== null && menuUid !== was.menuUid && focus(el.querySelector<HTMLElement>(`${MENU} button`))) return;
    if (attacker !== null && attacker !== was.attacker && focus(el.querySelector<HTMLElement>(`${CARD}.is-target`))) return;
    // Focus perdu : vérifié un instant plus tard, car entre le départ du focus d'un élément et son arrivée sur le
    // suivant (Tab), il est sur la page elle-même, et un affichage peut avoir lieu entre les deux
    const timer = setTimeout(() => {
      const active = document.activeElement;
      if (!keyboard.current || (active && active !== document.body && active.isConnected)) return;
      if (last.current !== null && focus(el.querySelector<HTMLElement>(`${CARD}[data-uid="${last.current}"]`))) return;
      focus(el.querySelector<HTMLElement>(`${CARD}[tabindex="0"]`));
    }, 0);
    return () => clearTimeout(timer);
  });
}

// ---------- Ce qu'annonce la région aria-live ----------

// Les lignes du journal arrivées depuis l'état précédent (celles que tu as le droit de voir), les dernières seulement.
// Pas d'état précédent, ou un journal plus court (nouvelle partie, retour en arrière) : rien.
export function newLogLines(prev: GameState | null, next: GameState, seat: PlayerId, max = 4): string[] {
  if (!prev || next.log.length <= prev.log.length) return [];
  return next.log.slice(prev.log.length)
    .filter((l) => l.only === undefined || l.only === seat)
    .map((l) => sayLogLine(l, seat, playerNames(next)))
    .slice(-max);
}

export interface PromptInput {
  state: GameState;
  seat: PlayerId;
  opponent: string;                          // « L’IA », le pseudo de l'adversaire en ligne
  targeting: { attacker: number } | null;    // attaque choisie, cible pas encore
  preview: { text: string } | null;          // résultat prévu de la cible visée
}

// Qui doit faire quoi, en une phrase (la barre d'action dit la même chose, avec ses boutons)
export function promptText({ state: s, seat, opponent, targeting, preview }: PromptInput): string {
  if (s.winner !== null) return `${s.winner === seat ? 'Victoire !' : 'Défaite.'}${s.winReason ? ` ${sayReason(s, seat)}` : ''}`;
  const d = s.decision;
  if (!d || d.player !== seat) return `${opponent} joue.`;
  if (targeting) {
    return `Choisis la cible de ${name(s, targeting.attacker)} (${power(s, targeting.attacker)}). ` +
      (preview?.text ?? 'Les flèches parcourent les cibles, Entrée attaque, Échap annule.');
  }
  if (d.kind === 'main') return 'À toi de jouer.';
  if (d.kind === 'mulligan') return 'Ta main de départ : garde-la ou repioche.';
  if (d.kind === 'counter' && s.battle) {
    return `${name(s, s.battle.attacker)} (${power(s, s.battle.attacker)}) attaque ${name(s, s.battle.target)} (${power(s, s.battle.target)}). ${d.prompt}`;
  }
  return quoteCardNames(d.prompt);
}

// Le texte de la région aria-live : les dernières actions jouées, puis la consigne. Les actions restent jusqu'aux
// suivantes (le texte ne change pas pour rien : un lecteur d'écran ne relit que ce qui change).
export function useAnnouncement(board: BoardInteraction, opponent: string, epoch: number): string {
  const s = board.state;
  const seen = useRef<{ s: GameState | null; epoch: number; lines: string[] }>({ s: null, epoch, lines: [] });
  const r = seen.current;
  if (s && s !== r.s) {
    const fresh = r.epoch === epoch ? newLogLines(r.s, s, board.seat) : [];
    if (fresh.length || r.epoch !== epoch) r.lines = fresh;
    r.s = s;
    r.epoch = epoch;
  }
  if (!s) return '';
  const prompt = promptText({ state: s, seat: board.seat, opponent, targeting: board.targeting, preview: board.targetPreview });
  return [...r.lines, prompt].map(sentence).join(' ');
}

const sentence = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`);
