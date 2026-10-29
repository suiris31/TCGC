// Le contenu du panneau à côté du plateau : la décision en cours et tous ses choix, le journal de la partie
import { useEffect, useRef } from 'react';
import { playerNames, sayLog } from '../coach/logText.ts';
import type { Decision, GameState, Option, PlayerId } from '../engine/types.ts';

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

// Le journal, dit à la deuxième personne (« Tu joues en premier », « IA touche ton Leader » : coach/logText.ts)
export function GameLog({ s, human }: { s: GameState; human: PlayerId }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [s.log.length]);
  const names = playerNames(s);
  return (
    <div className="log">
      {s.log.map((l, i) => {
        if (l.only !== undefined && l.only !== human) return null;
        const said = sayLog(l, human, names);
        return (
          <div key={i} className={`log-line ${l.player === null ? 'log-sys' : l.player === human ? 'log-me' : 'log-opp'} ${l.text.startsWith('—') ? 'log-turn' : ''}`}>
            {said.who && <b>{said.who} </b>}{l.only !== undefined && <span className="op-chip">secret</span>} {said.text}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
