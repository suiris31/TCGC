// « Mes parties » : toutes tes parties sauvegardées, ta progression, tes axes de progrès et le détail de chaque partie
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { replayRecord, type GameRecord, type GameSummary } from '../coach/archive.ts';
import { progress, type Axis, type Group, type Period, type Progress } from '../coach/progress.ts';
import { buildRecap, MISTAKE, type Recap } from '../coach/review.ts';
import { DECKS } from '../engine/decks.ts';
import { def } from '../engine/rules.ts';
import type { Preview } from './CardView.tsx';
import { pct, RecapBody, ReviewItem, StatsTable } from './Coach.tsx';
import { CardThumb } from './DeckGuide.tsx';
import { importFiles, loadRecord, loadSummaries } from './archiveClient.ts';
import { isTouch } from './device.ts';

type Hover = (p: (Preview & { rect?: DOMRect }) | null) => void;
type Tab = 'progress' | 'axes' | 'games';

const LEVEL = ['', 'Débutant', 'Confirmé', 'Expert'];
const STATUS: Record<GameSummary['status'], [string, string]> = {
  won: ['Victoire', 'res-win'],
  lost: ['Défaite', 'res-loss'],
  abandoned: ['Abandonnée', 'res-other'],
  playing: ['Interrompue', 'res-other'],
};

const deckName = (id: string) => DECKS[id]?.name ?? id;
const pctOr = (x: number | null) => (x === null ? '—' : pct(x));
const num = (x: number | null, digits = 1) => (x === null ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: digits }));
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function dateText(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function minutesText(m: number | null) {
  if (m === null) return '—';
  return m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;
}

export function HistoryScreen({ onClose, onResume, onHover }: { onClose: () => void; onResume: (rec: GameRecord, move: number) => void; onHover: Hover }) {
  const [list, setList] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('progress');
  const [open, setOpen] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const reload = () => loadSummaries().then(setList, (e: Error) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);
  const onImport = async (files: File[]) => {
    if (!files.length) return;
    setImported('Import en cours…');
    const { imported: n, failed } = await importFiles(files);
    setImported(`${n} partie${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}${failed.length ? ` ; refusé${failed.length > 1 ? 's' : ''} (ce ne sont pas des parties) : ${failed.join(', ')}` : ''}.`);
    void reload();
  };
  const prog = useMemo(() => (list ? progress(list) : null), [list]);
  const resume = (id: string, move: number) => {
    loadRecord(id).then((rec) => onResume(rec, move)).catch((e: Error) => setError(`impossible de rejouer ce moment : ${e.message}`));
  };
  const tabs: [Tab, string][] = [['progress', 'Progression'], ['axes', 'Axes de progrès'], ['games', 'Toutes les parties']];
  return (
    <div className="modal history-modal" onClick={onClose}>
      <div className="modal-box history" onClick={(e) => e.stopPropagation()}>
        <header className="history-head">
          <h2>📈 Mes parties</h2>
          <nav className="history-tabs">
            {tabs.map(([key, label]) => (
              <button key={key} className={tab === key && !open ? 'op-tab on' : 'op-tab'} onClick={() => { setTab(key); setOpen(null); }}>{label}</button>
            ))}
          </nav>
          <label className="icon-btn" title="Importer des parties de l’ancien OP Coach (fichiers .json de son dossier parties)">
            ⤒<input type="file" accept=".json,application/json" multiple hidden onChange={(e) => { void onImport([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <button className="icon-btn" onClick={onClose} title="Fermer (Échap)">✕</button>
        </header>
        <div className="history-body">
          {imported && <p className="op-muted">{imported}</p>}
          {error && <p className="danger">Impossible de lire les parties : {error}</p>}
          {!list && !error && <p className="op-muted">Chargement des parties…</p>}
          {prog && prog.rows.length === 0 && (
            <div className="history-empty">
              <p><b>Aucune partie enregistrée pour l’instant.</b></p>
              <p className="op-muted">Chaque partie que tu joues est sauvegardée sur ton compte avec tous ses détails. Reviens ici après quelques parties : ta progression et tes axes de progrès s’afficheront.</p>
              <p className="op-muted">Tu as des parties de l’ancien OP Coach ? Importe-les avec le bouton ⤒ (fichiers du dossier <code>parties</code>).</p>
            </div>
          )}
          {prog && prog.rows.length > 0 && (open
            ? <GameDetail id={open} onBack={() => setOpen(null)} onResume={(rec, move) => {
              try {
                onResume(rec, move);
              } catch (e) {
                setError(`impossible de rejouer ce moment : ${e instanceof Error ? e.message : String(e)}`);
              }
            }} />
            : tab === 'progress' ? <ProgressTab p={prog} />
              : tab === 'axes' ? <AxesTab p={prog} onResume={resume} onOpen={setOpen} onHover={onHover} />
                : <GamesTab p={prog} onOpen={setOpen} />)}
        </div>
      </div>
    </div>
  );
}

// ---------- Progression ----------

function Delta({ now, before, invert, percent = true }: { now: number | null; before: number | null; invert?: boolean; percent?: boolean }) {
  if (now === null || before === null) return null;
  const diff = now - before;
  const shown = percent ? Math.round(diff * 100) : Math.round(diff * 10) / 10;
  if (shown === 0) return <span className="delta">= stable</span>;
  const good = invert ? diff < 0 : diff > 0;
  return <span className={`delta ${good ? 'delta-good' : 'delta-bad'}`}>{diff > 0 ? '↑ +' : '↓ −'}{Math.abs(shown).toLocaleString('fr-FR')}{percent ? ' pts' : ''}</span>;
}

function Kpi({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <b className="kpi-value">{value}</b>
      {sub && <span className="op-small op-muted">{sub}</span>}
      {children}
    </div>
  );
}

// Petit graphique : points par partie, moyenne glissante, et éventuellement victoires / défaites en bas
function Chart({ points, line, min, max, ticks, fmt, marks, bars, wide }: {
  points: number[];
  line?: number[];
  min: number;
  max: number;
  ticks: number[];
  fmt: (v: number) => string;
  marks?: number[];
  bars?: boolean;
  wide?: boolean;  // graphique sur toute la largeur
}) {
  const W = wide ? 1100 : 600;
  const H = 140;
  const L = 40;
  const n = points.length;
  const x = (i: number) => (n === 1 ? (L + W) / 2 : L + 6 + (i * (W - L - 12)) / (n - 1));
  const y = (v: number) => 8 + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * (H - 16);
  const bw = Math.max(3, Math.min(18, ((W - L) / Math.max(1, n)) * 0.6));
  return (
    <svg className="hist-chart" viewBox={`0 0 ${W} ${H + (marks ? 14 : 4)}`} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={L - 6} y={y(t) + 4} className="chart-text" textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {bars
        ? points.map((v, i) => <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, y(min) - y(v))} className="chart-bar"><title>{`Partie ${i + 1} : ${fmt(v)}`}</title></rect>)
        : points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} className="op-chart-dot"><title>{`Partie ${i + 1} : ${fmt(v)}`}</title></circle>)}
      {line && n > 1 && <polyline points={line.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className="op-chart-line" />}
      {marks?.map((m, i) => <rect key={i} x={x(i) - 3} y={H + 4} width={6} height={8} rx={1.5} className={m ? 'mark-win' : 'mark-loss'} />)}
    </svg>
  );
}

function GroupTable({ title, rows, label }: { title: string; rows: Group[]; label: (key: string) => ReactNode }) {
  if (!rows.length) return null;
  return (
    <section className="hist-section">
      <h3>{title}</h3>
      <table className="op-stats hist-table">
        <thead><tr><th /><th>Parties</th><th>Victoires</th><th>Précision</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>{label(g.key)}</td>
              <td>{g.games}</td>
              <td>{g.wins}/{g.games} ({pct(g.wins / g.games)})</td>
              <td>{pctOr(g.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function trendText(recent: Period | null) {
  return recent ? `sur tes ${recent.games} dernières parties, par rapport aux précédentes` : '';
}

function ProgressTab({ p }: { p: Progress }) {
  const t = p.totals;
  const h = p.habits;
  const accMin = Math.min(0.5, ...p.series.accuracy.map((a) => Math.floor(a * 10) / 10));
  const maxMistakes = Math.max(3, ...p.series.mistakes);
  const habits: [string, string, string?][] = [
    ['Temps de réflexion par décision', h.thinkSec === null ? '—' : `${num(h.thinkSec)} s`,
      h.thinkMistakeSec !== null && h.thinkOtherSec !== null
        ? `${num(h.thinkMistakeSec)} s sur tes erreurs, ${num(h.thinkOtherSec)} s sur tes autres choix.${h.thinkMistakeSec < h.thinkOtherSec * 0.75 ? ' Tes erreurs sont décidées plus vite : sur les attaques et les Contres importants, prends quelques secondes de plus.' : ''}`
        : undefined],
    ['Main de départ repiochée', pctOr(h.mulliganRate),
      h.winAfterMulligan !== null || h.winAfterKeep !== null ? `Victoires après une repioche : ${pctOr(h.winAfterMulligan)} ; en gardant ta main : ${pctOr(h.winAfterKeep)}.` : undefined],
    ['DON!! laissées inutilisées par tour', num(h.unusedDonPerTurn),
      h.unusedDonPerTurn !== null && h.unusedDonPerTurn > 1 ? 'Au-delà de celles gardées pour payer un Événement [Contre], c’est du potentiel perdu.' : 'Elles ne servent qu’à payer des Événements [Contre] pendant le tour adverse.'],
    ['Attaques réussies', pctOr(h.hitRate), 'Attaques qui ont touché le Leader ou mis un Personnage KO.'],
    ['Vies prises / perdues par partie', `${num(h.lifeTakenPerGame)} / ${num(h.lifeLostPerGame)}`],
    ['Cartes utilisées en Contre par partie', num(h.countersPerGame)],
    ['Conseil du coach affiché', pctOr(h.hintShare),
      h.hintFollow !== null ? `Conseils suivis : ${pct(h.hintFollow)}.${h.hintShare !== null && h.hintShare > 0.5 ? ' Joue aussi des parties sans le conseil, pour vérifier que tu progresses seul.' : ''}` : undefined],
    ['Retours en arrière par partie', num(h.undosPerGame)],
    ['Durée d’une partie', `${num(h.turnsPerGame, 0)} tours · ${minutesText(h.minutesPerGame)}`],
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="Parties terminées" value={String(t.games)} sub={`${plural(t.wins, 'victoire')} · ${plural(t.losses, 'défaite')}${t.unfinished ? ` · ${t.unfinished} non terminée${t.unfinished > 1 ? 's' : ''}` : ''}`} />
        <Kpi label="Victoires" value={pctOr(t.winRate)}><Delta now={p.recent?.winRate ?? null} before={p.before?.winRate ?? null} /></Kpi>
        <Kpi label="Précision" value={pctOr(t.accuracy)} sub={`décisions sans erreur, sur ${t.decisions} analysées`}><Delta now={p.recent?.accuracy ?? null} before={p.before?.accuracy ?? null} /></Kpi>
        <Kpi label="Erreurs par partie" value={num(t.mistakesPerGame)}><Delta now={p.recent?.mistakesPerGame ?? null} before={p.before?.mistakesPerGame ?? null} invert percent={false} /></Kpi>
      </div>
      <p className="op-small op-muted">
        {p.recent ? `Flèches : ${trendText(p.recent)}. ` : 'Les tendances s’affichent à partir de 6 parties. '}
        Une erreur, c’est un choix qui fait perdre au moins {Math.round(MISTAKE * 100)} points de chances de gagner d’après les simulations du coach.
      </p>

      {p.finished.length > 0 && (
        <section className="hist-section">
          <h3>Victoires <span className="op-small op-muted">· moyenne sur 10 parties, et chaque partie en bas (vert : gagnée)</span></h3>
          <Chart points={p.series.winRolling} line={p.series.winRolling} min={0} max={1} ticks={[0, 0.5, 1]} fmt={(v) => pct(v)} marks={p.series.win} wide />
        </section>
      )}
      {p.analysed.length > 0 && (
        <div className="hist-two">
          <section className="hist-section">
            <h3>Précision par partie <span className="op-small op-muted">· la ligne : moyenne sur 5 parties</span></h3>
            <Chart points={p.series.accuracy} line={p.series.accuracyRolling} min={accMin} max={1} ticks={[accMin, (accMin + 1) / 2, 1]} fmt={(v) => pct(v)} />
          </section>
          <section className="hist-section">
            <h3>Erreurs par partie</h3>
            <Chart points={p.series.mistakes} min={0} max={maxMistakes} ticks={[0, Math.round(maxMistakes / 2), maxMistakes]} fmt={(v) => String(Math.round(v))} bars />
          </section>
        </div>
      )}

      <section className="hist-section">
        <h3>Tes habitudes</h3>
        <dl className="habits">
          {habits.map(([label, value, note]) => (
            <div key={label}><dt>{label}</dt><dd><b>{value}</b>{note && <span className="op-small op-muted"> {note}</span>}</dd></div>
          ))}
        </dl>
      </section>

      <div className="hist-two">
        <GroupTable title="Par confrontation" rows={p.matchups} label={(k) => { const [a, b] = k.split('|'); return <>{deckName(a)} <span className="op-muted">contre</span> {deckName(b)}</>; }} />
        <div>
          <GroupTable title="Par niveau de l’IA" rows={p.levels} label={(k) => k} />
          <GroupTable title="Qui commence" rows={p.first} label={(k) => k} />
        </div>
      </div>
    </>
  );
}

// ---------- Axes de progrès ----------

function AxisTrend({ a }: { a: Axis }) {
  if (a.recentPerGame === null || a.beforePerGame === null) return null;
  const { recentPerGame: now, beforePerGame: before } = a;
  if (before === 0 && now > 0) return <span className="op-chip chip-bad">Nouveau</span>;
  if (now <= before * 0.6) return <span className="op-chip chip-good">En progrès</span>;
  if (now >= before * 1.4 && now - before >= 0.2) return <span className="op-chip chip-bad">À surveiller</span>;
  return <span className="op-chip">Stable</span>;
}

function AxesTab({ p, onResume, onOpen, onHover }: { p: Progress; onResume: (id: string, move: number) => void; onOpen: (id: string) => void; onHover: Hover }) {
  if (!p.analysed.length) return <p className="op-muted">Pas encore de décisions analysées : termine une partie pour que le coach les étudie.</p>;
  if (!p.axes.length) return <p>Aucune erreur importante repérée sur tes {plural(p.analysed.length, 'partie')} analysée{p.analysed.length > 1 ? 's' : ''}. 👏</p>;
  return (
    <>
      <p className="op-muted">
        Tes erreurs regroupées par thème, des plus coûteuses aux moins coûteuses (le coût : les chances de gagner perdues, additionnées ; 1 = une victoire).
        {p.recent ? ' Les étiquettes comparent tes dernières parties aux précédentes.' : ''}
      </p>
      {p.axes.map((a, i) => (
        <section key={a.key} className="axis">
          <div className="axis-head">
            <span className="axis-rank">{i + 1}</span>
            <h3>{a.title}</h3>
            <AxisTrend a={a} />
            <span className="op-small op-muted axis-figures">
              {plural(a.count, 'erreur')} dans {a.games} partie{a.games > 1 ? 's' : ''} sur {p.analysed.length} · {num(a.perGame)} par partie · coût ≈ {num(a.loss)} victoire{a.loss >= 2 ? 's' : ''}
            </span>
          </div>
          <p className="axis-advice">{a.advice}</p>
          <div className="axis-examples">
            {a.examples.map((e) => (
              <div key={`${e.game}-${e.move}`} className="axis-ex">
                <div className="axis-ex-head">
                  <b>{dateText(e.date)} · {deckName(e.myDeck)} contre {deckName(e.aiDeck)} · tour {e.turn}</b>
                  <span className="op-chip chip-bad">−{Math.round(e.delta * 100)} points</span>
                </div>
                <div>Tu as choisi <b>{e.choice}</b> ; le coach conseillait <b>{e.best}</b>.</div>
                {e.context && <div className="op-small op-muted">{e.context}</div>}
                <div className="axis-ex-actions">
                  <button className="op-link op-small" onClick={() => onResume(e.game, e.move)}>↺ Rejouer ce moment</button>
                  <button className="op-link op-small" onClick={() => onOpen(e.game)}>Voir la partie</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {p.cards.length > 0 && (
        <section className="hist-section">
          <h3>Cartes à mieux maîtriser <span className="op-small op-muted">· celles qui reviennent le plus dans tes erreurs</span></h3>
          <div className="hist-cards">
            {p.cards.map((c) => (
              <div key={c.num} className="hist-card">
                <CardThumb num={c.num} size="mini" onHover={onHover} />
                <div><b>{def(c.num).name}</b><span className="op-small op-muted">{plural(c.count, 'erreur')} · coût ≈ {num(c.loss)}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------- Liste et détail des parties ----------

function GamesTab({ p, onOpen }: { p: Progress; onOpen: (id: string) => void }) {
  return (
    <>
      <p className="op-small op-muted">{plural(p.rows.length, 'partie')} sauvegardée{p.rows.length > 1 ? 's' : ''}. {isTouch() ? 'Touche' : 'Clique sur'} une partie pour la revoir.</p>
      <table className="op-stats hist-table hist-games">
        <thead><tr><th>Date</th><th>Ton deck</th><th>IA</th><th>Résultat</th><th>Tours</th><th>Durée</th><th>Précision</th><th>Erreurs</th></tr></thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r.id)} className="hist-row">
              <td>{dateText(r.date)}</td>
              <td>{deckName(r.myDeck)}</td>
              <td>{deckName(r.aiDeck)} <span className="op-small op-muted">{LEVEL[r.level]}</span></td>
              <td><span className={STATUS[r.status][1]}>{STATUS[r.status][0]}</span>{r.practice && <span className="op-chip">entraînement</span>}</td>
              <td>{r.turns}</td>
              <td>{minutesText(r.minutes)}</td>
              <td>{pctOr(r.accuracy)}</td>
              <td>{r.reviewed ? r.mistakes : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function GameDetail({ id, onBack, onResume }: { id: string; onBack: () => void; onResume: (rec: GameRecord, move: number) => void }) {
  const [rec, setRec] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadRecord(id).then(setRec, (e: Error) => setError(e.message));
  }, [id]);
  const view = useMemo((): { recap: Recap | null; problem: string | null } | null => {
    if (!rec) return null;
    try {
      const { final, moves } = replayRecord(rec);
      return { recap: buildRecap(final, moves, new Map(rec.reviews.map((r) => [r.id, r])), rec.human), problem: null };
    } catch (e) {
      return { recap: null, problem: e instanceof Error ? e.message : String(e) };
    }
  }, [rec]);
  if (error) return <><button className="op-link" onClick={onBack}>← Toutes les parties</button><p className="danger">{error}</p></>;
  if (!rec || !view) return <p className="op-muted">Chargement de la partie…</p>;
  const [label, cls] = STATUS[rec.status];
  const names = rec.initial.players.map((pl) => pl.name);
  const mistakes = rec.reviews.filter((r) => r.delta >= MISTAKE).sort((a, b) => b.delta - a.delta);
  const end = rec.endedAt ?? rec.updatedAt;
  return (
    <div className="game-detail">
      <button className="op-link" onClick={onBack}>← Toutes les parties</button>
      <div className="detail-head">
        <h3>{deckName(rec.config.myDeck)} <span className="op-muted">contre</span> {deckName(rec.config.aiDeck)} <span className="op-small op-muted">· IA {LEVEL[rec.config.level]}</span></h3>
        <p>
          <span className={cls}>{label}</span>{rec.winReason ? ` · ${rec.winReason}` : ''} · {plural(rec.turns, 'tour')} · {minutesText((Date.parse(end) - Date.parse(rec.startedAt)) / 60000)}
          {' · '}{rec.wentFirst ? 'tu commençais' : 'l’IA commençait'}
        </p>
        <p className="op-small op-muted">
          {dateText(rec.startedAt)} · {rec.reviews.length} décisions analysées par le coach{rec.undos.length ? ` · ${plural(rec.undos.length, 'retour')} en arrière` : ''}
          {rec.practice ? ' · partie d’entraînement reprise depuis un moment revu' : ''}
        </p>
      </div>
      {view.recap ? <RecapBody recap={view.recap} onReplay={(move) => onResume(rec, move)} /> : (
        <>
          <p className="notice">Cette partie a été jouée avec une ancienne version d’OP Coach ({rec.engine}) : {view.problem}. Le récap ci-dessous vient de ce qui a été enregistré.</p>
          <section>
            <h3>Tes erreurs</h3>
            {mistakes.length ? mistakes.slice(0, 8).map((r) => <ReviewItem key={r.id} r={r} kind="bad" />) : <p className="op-muted">Aucune erreur importante repérée.</p>}
          </section>
          <section>
            <h3>Statistiques</h3>
            <StatsTable me={rec.stats.me} opp={rec.stats.opp} />
          </section>
        </>
      )}
      <details className="detail-log">
        <summary>Journal complet de la partie ({rec.log.length} lignes)</summary>
        <ol className="log-lines">
          {rec.log.filter((l) => l.only === undefined || l.only === rec.human).map((l, i, all) => (
            <li key={i} className={l.player === rec.human ? 'log-me' : l.player === null ? 'log-sys' : 'log-opp'}>
              {(i === 0 || all[i - 1].turn !== l.turn) && <span className="log-turn">Tour {l.turn}</span>}
              {l.player !== null && <b>{names[l.player]} </b>}{l.text}
            </li>
          ))}
        </ol>
      </details>
      <p className="op-small op-muted">Fichier : parties/{rec.id}.json · version {rec.engine}</p>
    </div>
  );
}
