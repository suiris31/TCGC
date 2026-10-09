// Serveur de parties pour l'entraînement en Python (rl/opcg_rl/envpool.py) : un processus Node qui fait tourner
// plusieurs environnements (env.ts) et échange avec Python par son entrée et sa sortie standard.
//
// Python -> Node : une commande JSON par ligne
//   {"op":"init","recordDir":"...","anomalyDir":"..."}         spécification de l'encodage + table des cartes
//   {"op":"reset","envs":[{"env":0,"seed":1,"decks":["ST-31","ST-35"],"first":"random",
//      "seats":[{"kind":"agent"},{"kind":"heuristic"}],"maxDecisions":3000,"record":false,"models":[...]}]}
//   {"op":"step","actions":[{"env":0,"index":3,"probs":[...],"value":0.1}],"resets":[...]}
//                                                              choix des sièges pilotés, puis nouvelles parties
//   {"op":"close"}
// Node -> Python : une réponse binaire par commande : [u32 taille][u32 taille de l'en-tête][en-tête JSON][tableaux]
// (petit-boutiste, chaque tableau aligné sur 4 octets). L'en-tête décrit les résultats, les observations et les
// tableaux : cardIdx (i32), group (i32), dyn (f32), glob (f32), opt (f32), ptr (i32).
//
// Rien d'autre que les réponses n'est écrit sur la sortie standard (messages sur la sortie d'erreur).
//   node --no-warnings game/rl/server.ts [--catalog fichier]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DECKS } from '../engine/decks.ts';
import type { PlayerId } from '../engine/types.ts';
import { cardTable, engineVersion, loadRlCatalog, staticMatrix } from './catalog.ts';
import {
  DYN_DIM, DYN_FEATURES, ENCODING_VERSION, GLOBAL_DIM, GLOBAL_FEATURES, OPTION_DIM, OPTION_FEATURES, PREVIOUS_SPECS,
  SPEC_HASH, type Observation,
} from './encode.ts';
import { RlEnv, type ResetOptions } from './env.ts';
import { N_GROUPS, STATIC_DIM, STATIC_FEATURES } from './features.ts';
import { makeTrajectory } from './record.ts';

interface EnvSlot {
  env: RlEnv;
  record: boolean;
  models?: [string | null, string | null];
}

type Buffer32 = Float32Array | Int32Array;

const args = process.argv.slice(2);
const catalogArg = args.indexOf('--catalog') >= 0 ? args[args.indexOf('--catalog') + 1] : undefined;

let table: string[] = [];
let tableIndex = new Map<string, number>();
let engine = 'inconnue';
let recordDir: string | null = null;
let anomalyDir: string | null = null;
const envs = new Map<number, EnvSlot>();

function frame(header: object, buffers: Buffer32[] = []): Buffer {
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const headPad = (4 - (head.length % 4)) % 4;
  const body = buffers.reduce((n, b) => n + b.byteLength, 0);
  const total = 4 + head.length + headPad + body;
  const out = Buffer.alloc(4 + total);
  out.writeUInt32LE(total, 0);
  out.writeUInt32LE(head.length, 4);
  head.copy(out, 8);
  let at = 8 + head.length + headPad;
  for (const b of buffers) {
    Buffer.from(b.buffer, b.byteOffset, b.byteLength).copy(out, at);
    at += b.byteLength;
  }
  return out;
}

// Observations d'une réponse, mises bout à bout
class Batch {
  obs: { env: number; seat: PlayerId; final: boolean; n: number; a: number }[] = [];
  private parts: Observation[] = [];

  add(env: number, o: Observation, final: boolean) {
    this.obs.push({ env, seat: o.seat, final, n: o.nums.length, a: o.options.length });
    this.parts.push(o);
    return this.obs.length - 1;
  }

  buffers(): { meta: [string, string, number][]; data: Buffer32[] } {
    const N = this.parts.reduce((s, o) => s + o.nums.length, 0);
    const A = this.parts.reduce((s, o) => s + o.options.length, 0);
    const cardIdx = new Int32Array(N);
    const group = new Int32Array(N);
    const dyn = new Float32Array(N * DYN_DIM);
    const glob = new Float32Array(this.parts.length * GLOBAL_DIM);
    const opt = new Float32Array(A * OPTION_DIM);
    const ptr = new Int32Array(A * 2);
    let n = 0;
    let a = 0;
    this.parts.forEach((o, k) => {
      o.nums.forEach((num, i) => { cardIdx[n + i] = tableIndex.get(num) ?? 0; });
      group.set(o.group, n);
      dyn.set(o.dyn, n * DYN_DIM);
      glob.set(o.global, k * GLOBAL_DIM);
      opt.set(o.opt, a * OPTION_DIM);
      ptr.set(o.ptr, a * 2);
      n += o.nums.length;
      a += o.options.length;
    });
    return {
      meta: [['cardIdx', 'i32', N], ['group', 'i32', N], ['dyn', 'f32', N * DYN_DIM], ['glob', 'f32', this.parts.length * GLOBAL_DIM], ['opt', 'f32', A * OPTION_DIM], ['ptr', 'i32', A * 2]],
      data: [cardIdx, group, dyn, glob, opt, ptr],
    };
  }
}

function init(cmd: { catalog?: string; recordDir?: string; anomalyDir?: string }) {
  const cat = loadRlCatalog(cmd.catalog ?? catalogArg);
  table = cardTable();
  tableIndex = new Map(table.map((num, i) => [num, i]));
  engine = engineVersion();
  recordDir = cmd.recordDir ?? null;
  anomalyDir = cmd.anomalyDir ?? null;
  const spec = {
    specHash: SPEC_HASH, encodingVersion: ENCODING_VERSION, previousSpecs: PREVIOUS_SPECS, engine, catalog: cat.file, synthetic: cat.synthetic,
    staticDim: STATIC_DIM, dynDim: DYN_DIM, globalDim: GLOBAL_DIM, optionDim: OPTION_DIM, groups: N_GROUPS,
    staticFeatures: STATIC_FEATURES, dynFeatures: DYN_FEATURES, globalFeatures: GLOBAL_FEATURES, optionFeatures: OPTION_FEATURES,
    cards: table,
    decks: Object.values(DECKS).map((d) => ({ id: d.id, name: d.name, leader: d.leader, cards: d.cards })),
  };
  return frame({ spec, buffers: [['static', 'f32', table.length * STATIC_DIM]] }, [staticMatrix(table)]);
}

function save(dir: string, slot: EnvSlot, tag: string): string {
  const e = slot.env;
  const t = makeTrajectory(e.options, e.state, e.steps, e.result(), engine, slot.models);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${tag}${t.createdAt.replace(/[:.]/g, '-')}_${t.decks.join('-')}_${t.seed}.json`);
  writeFileSync(file, JSON.stringify(t));
  return file;
}

// État d'un environnement après reset ou step : observation du siège qui doit décider (aucune observation en fin de
// partie, même tronquée : la valeur est complétée avec celle de la dernière décision du joueur, côté Python, plutôt
// qu'avec une observation prise à un moment quelconque, qui pourrait trahir une décision adverse en cours)
function report(id: number, batch: Batch) {
  const slot = envs.get(id)!;
  const e = slot.env;
  const r = e.result();
  const obs: number[] = [];
  let record: string | null = null;
  if (!r.done) {
    obs.push(batch.add(id, e.observe(e.toAct!), false));
  } else {
    if (slot.record && recordDir) record = save(recordDir, slot, '');
    if ((r.truncated || r.error) && anomalyDir) record = save(anomalyDir, slot, r.error ? 'erreur_' : 'tronquee_');
  }
  return { env: id, ...r, toAct: e.toAct, first: e.state?.first ?? null, obs, record };
}

type ResetCmd = ResetOptions & { env: number; record?: boolean; models?: [string | null, string | null] };
type ActionCmd = { env: number; index: number; probs?: number[]; value?: number };

// Une commande peut à la fois appliquer des choix (actions) et commencer de nouvelles parties (resets) : un seul
// aller-retour par tour de collecte
function run(cmd: { actions?: ActionCmd[]; resets?: ResetCmd[]; envs?: ResetCmd[] }) {
  const batch = new Batch();
  const results = [];
  for (const x of cmd.actions ?? []) {
    const slot = envs.get(x.env);
    if (!slot) throw new Error(`environnement inconnu : ${x.env}`);
    slot.env.step(x.index, { probs: x.probs, value: x.value });
    results.push(report(x.env, batch));
  }
  for (const x of [...(cmd.resets ?? []), ...(cmd.envs ?? [])]) {
    const slot: EnvSlot = { env: envs.get(x.env)?.env ?? new RlEnv(), record: Boolean(x.record), models: x.models };
    envs.set(x.env, slot);
    slot.env.reset({ seed: x.seed, decks: x.decks, first: x.first, seats: x.seats, maxDecisions: x.maxDecisions, keepLog: x.keepLog });
    results.push(report(x.env, batch));
  }
  const { meta, data } = batch.buffers();
  return frame({ results, observations: batch.obs, buffers: meta }, data);
}

const out = process.stdout;
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  let reply: Buffer;
  try {
    const cmd = JSON.parse(line);
    if (cmd.op === 'close') break;
    reply = cmd.op === 'init' ? init(cmd) : cmd.op === 'reset' || cmd.op === 'step' ? run(cmd) : frame({ error: `commande inconnue : ${cmd.op}` });
  } catch (err) {
    reply = frame({ error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
  if (!out.write(reply)) await new Promise((resolve) => out.once('drain', resolve));
}
process.exit(0);
