// Analyse des parties d'un joueur : progression, axes de progrès, cartes, habitudes. Rapport en Markdown, affiché et
// écrit dans le fichier indiqué.
//   npm run game:analyse -- <pseudo> [rapport.md]               parties enregistrées sur son compte (base TCGC_DB, sinon
//                                                              data/tcgc.db, ouverte en lecture seule)
//   npm run game:analyse -- --dossier <dossier> [rapport.md]    fichiers JSON de l'ancien OP Coach (dossier parties/)
import '../../game/data/load-local.ts';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GameSummary } from '../../game/coach/archive.ts';
import { progress, type Group, type Period } from '../../game/coach/progress.ts';
import { MISTAKE } from '../../game/coach/review.ts';
import { DECKS } from '../../game/engine/decks.ts';
import { def } from '../../game/engine/rules.ts';

const HEAVY = ['initial', 'steps', 'log'];

// Parties d'un dossier de fichiers JSON (les fichiers abîmés sont ignorés)
function fromFolder(dir: string): GameSummary[] {
  if (!existsSync(dir)) throw new Error(`dossier ${dir} introuvable`);
  return readdirSync(dir).filter((name) => name.endsWith('.json')).flatMap((name) => {
    try {
      const rec = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      for (const key of HEAVY) delete rec[key];
      return typeof rec.format === 'number' ? [rec as unknown as GameSummary] : [];
    } catch {
      return [];
    }
  });
}

// Parties enregistrées sur un compte
function fromAccount(pseudo: string): GameSummary[] {
  const file = process.env.TCGC_DB ?? join(import.meta.dirname, '..', '..', 'data', 'tcgc.db');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const user = db.prepare('SELECT id FROM users WHERE pseudo = ?').get(pseudo) as { id: number } | undefined;
    if (!user) throw new Error(`aucun compte « ${pseudo} » dans ${file}`);
    return (db.prepare('SELECT summary FROM game_records WHERE user_id = ? ORDER BY started_at').all(user.id) as { summary: string }[])
      .map((r) => JSON.parse(r.summary) as GameSummary);
  } finally {
    db.close();
  }
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage : npm run game:analyse -- <pseudo> [rapport.md]   ou   npm run game:analyse -- --dossier <dossier> [rapport.md]');
  process.exit(1);
}
const fromDir = args[0] === '--dossier';
const reportFile = fromDir ? args[2] : args[1];
let list: GameSummary[];
try {
  list = fromDir ? fromFolder(args[1] ?? '') : fromAccount(args[0]);
} catch (e) {
  console.log(`Impossible de lire les parties : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
if (!list.length) {
  console.log('Aucune partie enregistrée.');
  process.exit(0);
}
const p = progress(list);

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);
const num = (x: number | null, digits = 1) => (x === null ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: digits }));
const deck = (id: string) => DECKS[id]?.name ?? id;
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const LEVEL = ['', 'Débutant', 'Confirmé', 'Expert'];
const STATUS = { won: 'Victoire', lost: 'Défaite', abandoned: 'Abandonnée', playing: 'Interrompue' };

const out: string[] = [];
const line = (s = '') => out.push(s);
const table = (head: string[], rows: string[][]) => {
  line(`| ${head.join(' | ')} |`);
  line(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) line(`| ${r.join(' | ')} |`);
  line();
};
const period = (label: string, x: Period | null) =>
  x ? `- ${label} (${x.games} parties) : victoires ${pct(x.winRate)}, précision ${pct(x.accuracy)}, ${num(x.mistakesPerGame)} erreurs par partie` : '';
const groupRows = (rows: Group[], label: (k: string) => string) =>
  rows.map((g) => [label(g.key), String(g.games), `${g.wins}/${g.games} (${pct(g.wins / g.games)})`, pct(g.accuracy)]);

line(`# Analyse de mes parties`);
line();
line(`Rapport du ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}, sur ${list.length} parties sauvegardées.`);
line(`Une erreur : un choix qui fait perdre au moins ${Math.round(MISTAKE * 100)} points de chances de gagner d’après les simulations du coach. La précision : la part de tes décisions analysées sans erreur.`);
line();

const t = p.totals;
line(`## Vue d’ensemble`);
line();
line(`- Parties terminées : ${t.games} (${t.wins} victoires, ${t.losses} défaites, soit ${pct(t.winRate)}) ; non terminées : ${t.unfinished} ; entraînement : ${t.practice}`);
line(`- Précision : ${pct(t.accuracy)} sur ${t.decisions} décisions analysées ; ${num(t.mistakesPerGame)} erreurs par partie ; ${num(t.loss === null ? null : t.loss * 100)} points de chances perdus par décision en moyenne`);
if (p.recent) {
  line(period('Dernières parties', p.recent));
  line(period('Parties précédentes', p.before));
}
line();

line(`## Axes de progrès`);
line();
if (!p.axes.length) line('Aucune erreur importante repérée.');
for (const [i, a] of p.axes.entries()) {
  const trend = a.recentPerGame === null ? '' : ` ; récemment ${num(a.recentPerGame)} par partie contre ${num(a.beforePerGame)} avant`;
  line(`### ${i + 1}. ${a.title}`);
  line();
  line(`${a.count} erreurs dans ${a.games} parties sur ${p.analysed.length} (${num(a.perGame)} par partie${trend}) ; coût total ≈ ${num(a.loss)} victoire(s).`);
  line();
  line(`> ${a.advice}`);
  line();
  for (const e of a.examples) {
    line(`- ${date(e.date)}, ${deck(e.myDeck)} contre ${deck(e.aiDeck)}, tour ${e.turn} : « ${e.choice} » au lieu de « ${e.best} » (−${Math.round(e.delta * 100)} points). ${e.context}`);
  }
  line();
}

if (p.cards.length) {
  line(`## Cartes à mieux maîtriser`);
  line();
  table(['Carte', 'Erreurs', 'Coût'], p.cards.map((c) => [`${def(c.num).name} (${c.num})`, String(c.count), num(c.loss)]));
}

const h = p.habits;
line(`## Habitudes`);
line();
line(`- Temps de réflexion médian : ${num(h.thinkSec)} s (erreurs : ${num(h.thinkMistakeSec)} s, autres choix : ${num(h.thinkOtherSec)} s)`);
line(`- Main de départ repiochée : ${pct(h.mulliganRate)} (victoires après repioche : ${pct(h.winAfterMulligan)}, en gardant : ${pct(h.winAfterKeep)})`);
line(`- DON!! inutilisées en fin de tour : ${num(h.unusedDonPerTurn)} par tour`);
line(`- Attaques réussies : ${pct(h.hitRate)} ; Vies prises / perdues par partie : ${num(h.lifeTakenPerGame)} / ${num(h.lifeLostPerGame)} ; cartes en Contre par partie : ${num(h.countersPerGame)}`);
line(`- Conseil du coach affiché : ${pct(h.hintShare)} des décisions (suivi : ${pct(h.hintFollow)}) ; retours en arrière : ${num(h.undosPerGame)} par partie`);
line(`- Durée : ${num(h.turnsPerGame, 0)} tours, ${num(h.minutesPerGame, 0)} min par partie`);
line();

line(`## Par confrontation`);
line();
table(['Confrontation', 'Parties', 'Victoires', 'Précision'], groupRows(p.matchups, (k) => k.split('|').map(deck).join(' contre ')));
table(['Niveau de l’IA', 'Parties', 'Victoires', 'Précision'], groupRows(p.levels, (k) => k));
table(['Qui commence', 'Parties', 'Victoires', 'Précision'], groupRows(p.first, (k) => k));

line(`## Toutes les parties`);
line();
table(['Date', 'Ton deck', 'IA', 'Résultat', 'Tours', 'Précision', 'Erreurs', 'Partie'], p.rows.map((r) => [
  date(r.date), deck(r.myDeck), `${deck(r.aiDeck)} (${LEVEL[r.level]})`, `${STATUS[r.status]}${r.practice ? ' (entraînement)' : ''}`,
  String(r.turns), pct(r.accuracy), r.reviewed ? String(r.mistakes) : '—', r.id,
]));

console.log(out.join('\n'));
if (reportFile) {
  writeFileSync(reportFile, out.join('\n'));
  console.log(`\nRapport écrit dans ${reportFile}`);
}
