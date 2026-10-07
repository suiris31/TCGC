// Interactions : menu d'actions d'une carte, barre d'action (la question en cours et ses boutons), panneau de combat
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { def, findField, name, power } from '../engine/rules.ts';
import type { Decision, GameState, Option, PlayerId } from '../engine/types.ts';
import type { CardAction } from './decision.ts';

// Menu des actions d'une carte, affiché à côté d'elle. Rien ne se passe tant qu'on n'a pas cliqué une action.
export function ActionMenu({ s, uid, anchor, actions, info, recommended, onAction, onClose }: {
  s: GameState;
  uid: number;
  anchor: DOMRect;
  actions: CardAction[];
  info?: string | null;
  recommended: string | null;
  onAction: (a: CardAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.right + 10, top: anchor.top });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor.right + 10;
    if (left + w > window.innerWidth - 8) left = anchor.left - w - 10;
    if (left < 8) left = Math.max(8, Math.min(window.innerWidth - w - 8, anchor.left + anchor.width / 2 - w / 2));
    let top = anchor.top + anchor.height / 2 - h / 2;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    setPos({ left, top });
  }, [anchor]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close); };
  }, [onClose]);
  const f = findField(s, uid);
  const num = f?.card.num ?? s.players.flatMap((P) => [...P.hand, ...P.trash]).find((c) => c.uid === uid)?.num;
  return (
    <div ref={ref} className="action-menu" style={{ left: pos.left, top: pos.top }} onClick={(e) => e.stopPropagation()}>
      <div className="action-menu-head">
        <strong>{num ? def(num).name : name(s, uid)}</strong>
        {f && !f.stage && <span className="op-muted"> · {power(s, uid)} de puissance</span>}
      </div>
      {info && <p className="action-info">{info}</p>}
      {actions.map((a) => (
        <button key={a.option.id + a.kind} className={`action ${a.useless ? 'action-useless' : ''} ${recommended === a.option.id || (a.kind === 'attack' && recommended?.startsWith(`attack:${uid}:`)) ? 'action-reco' : ''}`}
          onClick={() => onAction(a)}>
          <span className="action-icon">{a.icon}</span>
          <span className="action-text">
            <span>{a.label}{(recommended === a.option.id || (a.kind === 'attack' && recommended?.startsWith(`attack:${uid}:`))) && <em className="reco"> ★ conseillé</em>}</span>
            {a.detail && <small>{a.detail}</small>}
            {a.useless && <small className="op-warn">⚠ Sans intérêt : {a.useless}</small>}
          </span>
        </button>
      ))}
      <button className="action action-cancel" onClick={onClose}><span className="action-icon">✕</span><span className="action-text">Fermer</span></button>
    </div>
  );
}

// Panneau de combat au centre : qui attaque qui, puissances, ce qu'il manque pour repousser
export function BattlePanel({ s, human }: { s: GameState; human: PlayerId }) {
  const b = s.battle;
  if (!b) return null;
  const atk = power(s, b.attacker);
  const dp = power(s, b.target);
  const attackerSide = findField(s, b.attacker)?.player;
  const defending = attackerSide !== human;
  const holds = dp > atk;
  return (
    <div className={`battle-panel ${defending ? 'battle-defend' : 'battle-attack'}`}>
      <div className="battle-side">
        <span className="battle-name">{name(s, b.attacker)}</span>
        <span className="battle-power">{atk}</span>
      </div>
      <span className="battle-vs">⚔</span>
      <div className="battle-side">
        <span className="battle-name">{name(s, b.target)}{b.blocked ? ' (bloque)' : ''}</span>
        <span className={`battle-power ${holds ? 'ok' : ''}`}>{dp}</span>
      </div>
      <div className="battle-note">
        {holds ? 'L’attaque est repoussée pour l’instant.' : defending ? `Il te manque ${atk - dp + 1000} pour repousser l’attaque.` : `L’adversaire doit trouver +${atk - dp + 1000} pour la repousser.`}
      </div>
    </div>
  );
}

const BUTTON_STYLE: Record<string, string> = { end: 'op-btn-primary', pass: 'op-btn-ghost', noblock: 'op-btn-ghost', none: 'op-btn-ghost', no: 'op-btn-ghost' };

// Barre d'action en bas : la question en cours, en mots simples, et ses boutons
export function ActionBar({ s, d, human, thinking, aiName, targeting, preview, hasCardActions, buttons, recommended, onButton, onCancelTargeting, onEndTurn, onHint, hintState }: {
  s: GameState;
  d: Decision | null;
  human: PlayerId;
  thinking: boolean;
  aiName: string;
  targeting: { attacker: number } | null;
  preview: { ok: boolean; text: string } | null;
  hasCardActions: boolean;
  buttons: Option[];
  recommended: string | null;
  onButton: (id: string) => void;
  onCancelTargeting: () => void;
  onEndTurn: () => void;
  onHint?: () => void;
  hintState?: 'idle' | 'loading' | 'ready';
}) {
  if (s.winner !== null) return <div className="action-bar"><div className="bar-text"><strong>{s.winner === human ? 'Victoire !' : 'Défaite.'}</strong> <span className="op-muted">{s.winReason}</span></div></div>;
  if (!d || d.player !== human) {
    return (
      <div className="action-bar bar-wait">
        <div className="bar-text"><span className="op-spinner" /> <strong>{thinking ? `${aiName} réfléchit…` : `${aiName} joue…`}</strong></div>
      </div>
    );
  }
  if (targeting) {
    return (
      <div className="action-bar bar-target">
        <div className="bar-text">
          <strong>⚔ Choisis la cible de {name(s, targeting.attacker)} ({power(s, targeting.attacker)})</strong>
          <span className={preview ? (preview.ok ? 'good' : 'op-warn') : 'op-muted'}>{preview?.text ?? 'Les cibles possibles brillent en rouge : le Leader adverse ou un Personnage adverse épuisé. Survole-les pour voir le résultat.'}</span>
        </div>
        <div className="bar-buttons"><button className="op-btn op-btn-ghost" onClick={onCancelTargeting}>Annuler (Échap)</button></div>
      </div>
    );
  }
  let title = d.prompt;
  let help = '';
  if (d.kind === 'main') {
    title = 'À toi de jouer';
    help = hasCardActions ? 'Clique sur une carte qui brille pour voir ce qu’elle peut faire. Tu peux aussi glisser une DON!! sur une carte.' : 'Plus rien d’utile à faire : termine ton tour.';
  } else if (d.kind === 'blocker') {
    help = 'Clique sur un de tes [Bloqueur] qui brille pour qu’il prenne l’attaque à la place, ou laisse passer.';
  } else if (d.kind === 'counter') {
    help = 'Clique sur une carte de ta main qui brille pour contrer (sa valeur de Contre s’ajoute à la carte attaquée), ou arrête là.';
  } else if (hasCardActions) {
    help = 'Clique sur une carte qui brille.';
  }
  const others = buttons.filter((o) => o.id !== 'end');
  const end = buttons.find((o) => o.id === 'end');
  return (
    <div className={`action-bar bar-${d.kind}`}>
      <div className="bar-text">
        <strong>{title}</strong>
        {help && <span className="op-muted">{help}</span>}
      </div>
      <div className="bar-buttons">
        {onHint && d.options.length > 1 && (
          <button className="op-btn op-btn-ghost btn-hint" onClick={onHint} disabled={hintState === 'loading'} title="Le coach simule la suite de la partie pour chaque choix">
            {hintState === 'loading' ? 'Le coach réfléchit…' : hintState === 'ready' ? '★ Conseil affiché' : '💡 Conseil'}
          </button>
        )}
        {others.map((o) => (
          <button key={o.id} className={`op-btn ${BUTTON_STYLE[o.id] ?? 'btn-choice'} ${recommended === o.id ? 'btn-reco' : ''}`} onClick={() => onButton(o.id)}>
            {o.label}{recommended === o.id && ' ★'}
          </button>
        ))}
        {end && (
          <button className={`op-btn op-btn-primary btn-end ${recommended === 'end' ? 'btn-reco' : ''}`} onClick={onEndTurn} title="Entrée">
            Fin du tour{recommended === 'end' && ' ★'}
          </button>
        )}
      </div>
    </div>
  );
}
