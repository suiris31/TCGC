import { useEffect, useRef } from 'react';
import { def, fieldCost, findField, power } from '../engine/rules.ts';
import type { Decision, GameState, Option } from '../engine/types.ts';
import type { Preview } from './CardView.tsx';
import { EffectText } from './Zoom.tsx';
import { cardImage } from './images.ts';

const GROUPS: Record<string, string> = {
  play: 'Jouer une carte',
  ability: 'Capacités',
  don: 'Donner des DON!!',
  attack: 'Attaquer',
  counter: 'Contres',
  end: '',
};

// Décision en cours : la question et les choix possibles (filtrés sur une carte si on vient de cliquer dessus)
export function DecisionBox({ decision, focus, notes, onChoose, onClearFocus }: {
  decision: Decision;
  focus: number | null;
  notes: Record<string, string>;  // choix sans intérêt, avec la raison
  onChoose: (id: string) => void;
  onClearFocus: () => void;
}) {
  const options = focus === null ? decision.options : decision.options.filter((o) => o.uid === focus || o.group === 'end');
  const groups = new Map<string, Option[]>();
  for (const o of options) {
    const g = o.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  return (
    <div className="decision">
      <p className="prompt">{decision.prompt}</p>
      {focus !== null && <button className="op-link" onClick={onClearFocus}>← tous les choix</button>}
      {[...groups].map(([group, list]) => (
        <div key={group} className={`option-group ${list.length > 6 && list.every((o) => o.label.length <= 8) ? 'option-grid' : ''}`}>
          {GROUPS[group] && <div className="group-title">{GROUPS[group]}</div>}
          {list.map((o) => (
            <button key={o.id} className={`option ${o.group === 'end' || o.id === 'pass' || o.id === 'noblock' || o.id === 'none' || o.id === 'no' ? 'option-end' : ''}`}
              onClick={() => onChoose(o.id)} title={notes[o.id] ? `Sans intérêt : ${notes[o.id]}` : undefined}>
              {o.label}
              {notes[o.id] && <span className="option-note"> · sans intérêt : {notes[o.id]}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// Aperçu d'une carte survolée : grand visuel, texte officiel, valeurs actuelles
export function CardPreview({ s, preview }: { s: GameState; preview: Preview | null }) {
  if (!preview) return <div className="preview preview-empty">Survole une carte pour lire son effet.</div>;
  const d = def(preview.num);
  const f = preview.uid !== undefined ? findField(s, preview.uid) : null;
  return (
    <div className="preview">
      <img src={cardImage(d)} alt={d.name} />
      <div className="preview-text">
        <strong>{d.name}</strong>
        <div className="op-muted op-small">
          {d.number} · {d.category === 'LEADER' ? `Leader · Vie ${d.life}` : `Coût ${d.cost}`}
          {d.power !== null && ` · ${d.power}`}{d.counter ? ` · Contre +${d.counter}` : ''}
        </div>
        <div className="op-muted op-small">{d.typeLabels.join(' / ')}</div>
        {f && (
          <div className="op-small">
            Actuellement : <b>{power(s, f.card.uid)}</b> de puissance{!f.leader && <>, coût <b>{Math.max(0, fieldCost(s, f.card.uid))}</b></>}
            {f.card.don > 0 && <>, {f.card.don} DON!! donnée{f.card.don > 1 ? 's' : ''}</>}
          </div>
        )}
        <p className="effect">{d.effect && d.effect !== '-' ? <EffectText text={d.effect} /> : 'Pas d’effet.'}</p>
        {d.trigger && <p className="effect"><span className="kw">[Déclenchement]</span> <EffectText text={d.trigger} /></p>}
        {d.lang === 'en' && <p className="op-small op-muted">Texte anglais : cette carte n’existe pas en VF.</p>}
        {f?.card.rested && <div className="op-small op-muted">Épuisée</div>}
      </div>
    </div>
  );
}

export function GameLog({ s, human }: { s: GameState; human: number }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [s.log.length]);
  return (
    <div className="log">
      {s.log.map((l, i) => (l.only !== undefined && l.only !== human ? null : (
        <div key={i} className={`log-line ${l.player === null ? 'log-sys' : l.player === human ? 'log-me' : 'log-opp'} ${l.text.startsWith('—') ? 'log-turn' : ''}`}>
          {l.player !== null && !l.text.startsWith('—') && <b>{s.players[l.player].name} </b>}{l.only !== undefined && <span className="op-chip">secret</span>} {l.text}
        </div>
      )))}
      <div ref={end} />
    </div>
  );
}
