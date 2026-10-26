// Comparaison de deux dossiers de `ui:tour` (avant / après) : pixels changés par capture, avec une image des
// différences, et écarts des rapports (cibles < 44 px, textes < 11 px, erreurs, défilement horizontal).
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const SHOT = /^(\d\d-.+)-(desktop|portrait|paysage)\.png$/;
// écart de couleur au-delà duquel un pixel compte comme changé (l'anticrénelage bouge de quelques unités)
const TOLERANCE = 24;

function readReports(dir) {
  const out = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = f.match(/^rapport-(\w+)\.json$/);
    if (m) out[m[1]] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return out;
}

// Le rapport sans ce qui change à chaque lancement (date, durées, commit)
export function stable(report) {
  const { lanceLe, durees, commit, ...rest } = report;
  return rest;
}

function diffImages(a, b, file) {
  if (a.width !== b.width || a.height !== b.height) return { changed: null, note: `taille ${a.width}×${a.height} → ${b.width}×${b.height}` };
  const out = Buffer.alloc(b.data.length);
  let changed = 0;
  for (let i = 0; i < b.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > TOLERANCE) {
      changed++;
      out[i] = 255; out[i + 1] = 0; out[i + 2] = 40; out[i + 3] = 255;
    } else {
      const g = Math.round((b.data[i] * 0.3 + b.data[i + 1] * 0.59 + b.data[i + 2] * 0.11) * 0.35);
      out[i] = out[i + 1] = out[i + 2] = g; out[i + 3] = 255;
    }
  }
  if (changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng({ width: b.width, height: b.height, data: out }));
  }
  return { changed: changed / (b.width * b.height) };
}

const pct = (x) => (x === null ? '—' : x === 0 ? '0' : x < 0.0001 ? '< 0,01 %' : `${(x * 100).toFixed(2).replace('.', ',')} %`);
const delta = (a, b) => (a === b ? String(b) : `${a ?? '—'} → **${b ?? '—'}**`);

export function compare(before, after, out) {
  fs.mkdirSync(out, { recursive: true });
  const lines = [`# Comparaison ui:tour`, '', `- avant : \`${before}\``, `- après : \`${after}\``, ''];

  // ---------- Rapports ----------
  const ra = readReports(before);
  const rb = readReports(after);
  const formats = [...new Set([...Object.keys(ra), ...Object.keys(rb)])];
  lines.push('## Rapports', '');
  for (const f of formats) {
    const a = ra[f];
    const b = rb[f];
    if (!a || !b) {
      lines.push(`- **${f}** : rapport présent seulement ${a ? 'avant' : 'après'}`);
      continue;
    }
    const same = JSON.stringify(stable(a)) === JSON.stringify(stable(b));
    lines.push(`### ${f} ${same ? '(identiques, hors date et durées)' : ''}`, '');
    lines.push(`Totaux : cibles < 44 px ${delta(a.totaux.ciblesPetites, b.totaux.ciblesPetites)} · textes < 11 px ${delta(a.totaux.textesPetits, b.totaux.textesPetits)} · erreurs ${delta(a.totaux.erreurs, b.totaux.erreurs)} · défilement horizontal ${delta(a.totaux.defilementHorizontal.join(', ') || 'aucun', b.totaux.defilementHorizontal.join(', ') || 'aucun')}`);
    lines.push(`Ouverture de l’onglet : ${a.durees.ouvertureOngletMs ?? '?'} ms → ${b.durees.ouvertureOngletMs ?? '?'} ms`, '');
    if (b.echecs.length) lines.push(`**Échecs après** : ${b.echecs.join(' ; ')}`, '');
    if (same) continue;
    lines.push('| Écran | cibles < 44 px | textes < 11 px | texte min (px) | erreurs | ↔ |', '|---|---|---|---|---|---|');
    const ids = [...new Set([...a.ecrans.map((s) => s.id), ...b.ecrans.map((s) => s.id)])].sort();
    for (const id of ids) {
      const x = a.ecrans.find((s) => s.id === id);
      const y = b.ecrans.find((s) => s.id === id);
      if (!x || !y) {
        lines.push(`| ${id} | ${x ? 'disparu après' : 'nouveau'} | | | | |`);
        continue;
      }
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      lines.push(`| ${id} | ${delta(x.cibles.petites, y.cibles.petites)} | ${delta(x.textes.petits, y.textes.petits)} | ${delta(x.textes.min, y.textes.min)} | ${delta(x.erreurs.length, y.erreurs.length)} | ${delta(x.defilementHorizontal ? 'oui' : 'non', y.defilementHorizontal ? 'oui' : 'non')} |`);
    }
    lines.push('');
    const newErrors = b.ecrans.flatMap((s) => s.erreurs.filter((e) => !a.ecrans.find((t) => t.id === s.id)?.erreurs.includes(e)).map((e) => `${s.id} : ${e}`));
    if (newErrors.length) lines.push('Nouvelles erreurs :', '', ...newErrors.map((e) => `- ${e}`), '');
    if (JSON.stringify(a.etapes) !== JSON.stringify(b.etapes)) lines.push(`Étapes de la partie différentes : avant « ${a.etapes.join(' / ')} », après « ${b.etapes.join(' / ')} »`, '');
  }

  // ---------- Captures ----------
  lines.push('## Captures', '', `Pixels changés (écart de couleur > ${TOLERANCE}) ; l’image des différences est dans \`diff/\` (en rouge).`, '');
  lines.push('| Capture | pixels changés |', '|---|---|');
  const shotsA = new Set(fs.readdirSync(before).filter((f) => SHOT.test(f)));
  const shotsB = new Set(fs.readdirSync(after).filter((f) => SHOT.test(f)));
  let identical = 0;
  // un dossier sans captures (la référence versionnée) : on ne compare que les rapports
  const both = shotsA.size && shotsB.size ? [...new Set([...shotsA, ...shotsB])].sort() : [];
  if (!both.length) lines.push('| (pas de captures des deux côtés) | |');
  for (const f of both) {
    if (!shotsA.has(f) || !shotsB.has(f)) {
      lines.push(`| ${f} | ${shotsA.has(f) ? 'disparue après' : 'nouvelle'} |`);
      continue;
    }
    const r = diffImages(decodePng(fs.readFileSync(path.join(before, f))), decodePng(fs.readFileSync(path.join(after, f))), path.join(out, 'diff', f));
    if (r.changed === 0) identical++;
    else lines.push(`| ${f} | ${r.note ?? pct(r.changed)} |`);
  }
  lines.push('', `${identical} capture${identical > 1 ? 's' : ''} sans différence.`, '');
  const text = lines.join('\n');
  fs.writeFileSync(path.join(out, 'comparaison.md'), `${text}\n`);
  return { text };
}
