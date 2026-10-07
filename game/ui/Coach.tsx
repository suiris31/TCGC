// Interface du coach : conseil pendant la partie et récap de fin de partie
import type { Analysis } from '../ai/search.ts';
import type { MoveReview, Recap, SideStats } from '../coach/review.ts';
import type { Decision } from '../engine/types.ts';
import { isTouch } from './device.ts';

export const pct = (rate: number) => `${Math.round(rate * 100)} %`;

const KIND: Record<string, string> = {
  main: 'Phase principale',
  counter: 'Contre',
  blocker: 'Blocage',
  effect: 'Effet',
  mulligan: 'Main de départ',
};

// « Que ferait le coach ? » : chances de gagner estimées pour chaque choix
export function CoachHint({ decision, analysis, loading, onAsk, onChoose }: {
  decision: Decision;
  analysis: Analysis | null;
  loading: boolean;
  onAsk: () => void;
  onChoose: (id: string) => void;
}) {
  if (!analysis) {
    return (
      <button className="op-btn op-btn-ghost coach-ask" onClick={onAsk} disabled={loading}>
        {loading ? 'Le coach réfléchit…' : '💡 Que ferait le coach ?'}
      </button>
    );
  }
  const label = (id: string) => decision.options.find((o) => o.id === id)?.label ?? id;
  const best = analysis.stats[0];
  if (!best) return null;
  // les meilleures options ont été réestimées avec des simulations indépendantes : ce sont elles qu'on compare
  const refined = analysis.stats.filter((x) => x.refined);
  const top = refined.length ? refined : analysis.stats.slice(0, 3);
  const others = analysis.stats.filter((x) => !top.includes(x)).slice(0, 3);
  const row = (x: (typeof analysis.stats)[number], main: boolean) => (
    <button key={x.id} className={`hint-row ${x.id === best.id ? 'hint-best' : ''} ${main ? '' : 'hint-minor'}`} onClick={() => onChoose(x.id)}>
      <span className="hint-bar" style={{ width: `${Math.round(x.rate * 100)}%` }} />
      <span className="hint-label">{x.id === best.id ? '★ ' : ''}{label(x.id)}</span>
      <span className="hint-rate">{pct(x.rate)}</span>
    </button>
  );
  return (
    <div className="coach-hint">
      <div className="op-small op-muted">
        Tes chances de gagner avec les meilleurs choix ({analysis.refinedSamples ?? analysis.samples} simulations chacun). {isTouch() ? 'Touche' : 'Clique'} pour jouer :
      </div>
      {top.map((x) => row(x, true))}
      {top.length > 1 && best.rate - top[1].rate < 0.05 && (
        <div className="op-small op-muted">Ces choix se valent à quelques points près : pas de mauvaise réponse ici.</div>
      )}
      {others.length > 0 && <div className="op-small op-muted">Moins bons (estimation rapide) :</div>}
      {others.map((x) => row(x, false))}
      {analysis.pruned.length > 0 && (
        <div className="op-small op-muted">
          {analysis.pruned.length} choix sans intérêt écarté{analysis.pruned.length > 1 ? 's' : ''} (attaque trop faible, DON!! sur une carte qui
          ne peut plus attaquer, effet impossible).
        </div>
      )}
    </div>
  );
}

// Courbe de tes chances de gagner après chacun de tes choix ; les erreurs en rouge
export function Curve({ recap }: { recap: Recap }) {
  const W = 640;
  const H = 130;
  const pts = recap.curve;
  if (pts.length < 2) return null;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (r: number) => 6 + (1 - r) * (H - 12);
  const mistakes = new Set(recap.mistakes.map((m) => m.id));
  const turns = pts.map((p, i) => ({ i, turn: p.turn })).filter((p, k, all) => k === 0 || all[k - 1].turn !== p.turn);
  return (
    <svg className="curve" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Tes chances de gagner au fil de la partie">
      <line x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} className="curve-mid" />
      {turns.map((t) => <line key={t.i} x1={x(t.i)} x2={x(t.i)} y1={0} y2={H} className="curve-turn" />)}
      {turns.filter((_, k) => k % 2 === 0).map((t) => <text key={t.i} x={x(t.i) + 2} y={H + 13} className="curve-text">T{t.turn}</text>)}
      <polyline points={pts.map((p, i) => `${x(i)},${y(p.rate)}`).join(' ')} className="curve-line" />
      {pts.map((p, i) => (mistakes.has(p.id) ? <circle key={p.id} cx={x(i)} cy={y(p.rate)} r={4.5} className="curve-bad" /> : null))}
      <text x={4} y={y(0.5) - 4} className="curve-text">50 %</text>
    </svg>
  );
}

export function ReviewItem({ r, kind, onReplay }: { r: MoveReview; kind: 'bad' | 'good'; onReplay?: (id: number) => void }) {
  const generic = r.kind === 'main';
  return (
    <div className={`review review-${kind}`}>
      <div className="review-head">
        <b>Tour {r.turn} · {KIND[r.kind] ?? r.kind}</b>
        {kind === 'bad' ? <span className="op-chip chip-bad">−{Math.round(r.delta * 100)} points</span> : <span className="op-chip chip-good">bon choix</span>}
      </div>
      {!generic && <div className="op-small op-muted">{r.prompt}</div>}
      <div>Tu as choisi : <b>{r.choiceLabel}</b> <span className="op-muted">({pct(r.chosenRate)} de chances de gagner)</span></div>
      {r.useless && <div className="op-small op-muted">Ce choix ne pouvait rien apporter : {r.useless}.</div>}
      {kind === 'bad' ? (
        <div>Le coach aurait choisi : <b>{r.bestLabel}</b> <span className="op-muted">({pct(r.bestRate)})</span></div>
      ) : (
        <div className="op-small op-muted">La plupart des autres choix étaient nettement moins bons (le choix médian : {pct(r.bestRate - r.spread)}).</div>
      )}
      {onReplay && <button className="op-link op-small" onClick={() => onReplay(r.id)}>↺ Revoir ce moment et le rejouer</button>}
    </div>
  );
}

export function StatsTable({ me, opp }: { me: SideStats; opp: SideStats }) {
  const rows: [string, (s: SideStats) => string][] = [
    ['Attaques', (s) => `${s.attacks} (${s.hits} réussies, ${s.repelled} repoussées)`],
    ['Vies perdues sur une attaque', (s) => String(s.lifeLost)],
    ['Cartes utilisées en Contre', (s) => String(s.counters)],
    ['Blocages', (s) => String(s.blocks)],
    ['[Déclenchement] activés', (s) => String(s.triggers)],
    ['Personnages et Lieux joués', (s) => String(s.played)],
  ];
  return (
    <table className="op-stats">
      <thead><tr><th /><th>Toi</th><th>IA</th></tr></thead>
      <tbody>{rows.map(([label, f]) => <tr key={label}><td>{label}</td><td>{f(me)}</td><td>{f(opp)}</td></tr>)}</tbody>
    </table>
  );
}

export interface RecordLine {
  wins: number;
  losses: number;
}

export function recordText(r: RecordLine | undefined) {
  if (!r || r.wins + r.losses === 0) return 'aucune partie';
  const n = r.wins + r.losses;
  return `${r.wins} victoire${r.wins > 1 ? 's' : ''}, ${r.losses} défaite${r.losses > 1 ? 's' : ''} (${Math.round((r.wins / n) * 100)} %)`;
}

// Récap du coach : courbe, erreurs, meilleurs choix, tournants, statistiques, conseils (fin de partie et parties archivées)
export function RecapBody({ recap, onReplay }: { recap: Recap; onReplay?: (id: number) => void }) {
  return (
    <>
      <section>
        <h3>Tes chances de gagner au fil de la partie</h3>
        <Curve recap={recap} />
        <p className="op-small op-muted">Estimées après chacun de tes {recap.reviewed} choix analysés. Les points rouges sont tes erreurs.</p>
      </section>

      <section>
        <h3>Tes erreurs</h3>
        {recap.mistakes.length ? recap.mistakes.map((r) => <ReviewItem key={r.id} r={r} kind="bad" onReplay={onReplay} />)
          : <p className="op-muted">Aucune erreur importante repérée. 👏</p>}
      </section>

      {recap.good.length > 0 && (
        <section>
          <h3>Tes meilleurs choix</h3>
          {recap.good.map((r) => <ReviewItem key={r.id} r={r} kind="good" onReplay={onReplay} />)}
        </section>
      )}

      {recap.turning.length > 0 && (
        <section>
          <h3>Les tournants de la partie</h3>
          {recap.turning.map((t, i) => (
            <div key={i} className="review">
              <div className="review-head"><b>Tour {t.turn}</b><span className="op-small op-muted">tes chances passent de {pct(t.from)} à {pct(t.to)}</span></div>
              <ul className="events">{t.events.map((e, k) => <li key={k}>{e}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Statistiques</h3>
        <StatsTable me={recap.stats.me} opp={recap.stats.opp} />
        {recap.stats.unusedDon.length > 0 && (
          <p className="op-small op-muted">
            DON!! encore disponibles à la fin de tes tours (utiles seulement pour payer un Événement [Contre] pendant le tour
            adverse) : {recap.stats.unusedDon.map((u) => `${u.don} au tour ${u.turn}`).join(', ')}.
          </p>
        )}
      </section>

      <section>
        <h3>Conseils</h3>
        {recap.tips.length ? <ul className="tips">{recap.tips.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="op-muted">Rien à signaler.</p>}
      </section>
    </>
  );
}

// Fenêtre de fin de partie : résultat, bilan de la confrontation, puis le récap du coach
export function EndScreen({ won, reason, turns, matchup, record, practice, progress, recap, onReplay, onRestart, onBoard, onMenu, onHistory }: {
  won: boolean;
  reason: string;
  turns: number;
  matchup: string;
  record: RecordLine | undefined;
  practice: boolean;
  progress: { done: number; total: number };
  recap: Recap | null;
  onReplay: (id: number) => void;
  onRestart: () => void;
  onBoard: () => void;
  onMenu: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="modal-box recap">
      <div className="recap-top">
        <h2 className={won ? 'win' : 'loss'}>{won ? 'Victoire !' : 'Défaite'}</h2>
        <p>{reason} · {turns} tours</p>
        <p className="op-small op-muted">
          {practice ? 'Partie reprise depuis un moment revu : elle ne compte pas dans ton bilan. ' : ''}
          Bilan {matchup} : {recordText(record)}
        </p>
      </div>

      {!recap && (
        <div className="progress">
          <div className="op-small">Le coach analyse tes décisions… {progress.done}/{progress.total}</div>
          <div className="progress-bar"><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
        </div>
      )}

      {recap && <RecapBody recap={recap} onReplay={onReplay} />}

      <div className="end-actions">
        <button className="op-btn" onClick={onRestart}>Rejouer</button>
        <button className="op-btn op-btn-ghost" onClick={onBoard}>Voir le plateau</button>
        <button className="op-btn op-btn-ghost" onClick={onHistory}>📈 Mes parties</button>
        <button className="op-btn op-btn-ghost" onClick={onMenu}>Menu</button>
      </div>
    </div>
  );
}
