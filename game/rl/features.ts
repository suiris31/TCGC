// Caractéristiques des cartes et des décisions pour l'apprentissage par renforcement.
//
// Une carte n'est pas décrite par son seul numéro (qui ne dirait rien d'une carte jamais vue) mais par ce qu'on lit
// sur elle : catégorie, coût, puissance, Contre, couleurs, attributs, mots-clés, moments de ses effets ([Jouée],
// [En attaquant]...), mots de son texte officiel en anglais (sac de mots haché), types (hachés). Ces caractéristiques
// « statiques » se calculent pour n'importe quelle carte du catalogue, y compris une carte que le modèle n'a jamais
// vue pendant l'entraînement. Le modèle peut y ajouter un plongement appris par numéro de carte, avec une case
// « carte inconnue » (voir rl/opcg_rl/model.py) : il n'en dépend pas seul.
//
// Les listes de noms de caractéristiques ci-dessous définissent l'ordre des colonnes : elles sont envoyées au code
// Python et enregistrées avec chaque modèle (empreinte SPEC_HASH), pour qu'un modèle ne soit jamais utilisé avec un
// encodage différent de celui de son entraînement.
import { cardStatus, HIDDEN } from '../engine/cards/index.ts';
import { genericTrigger, KEYWORDS, withoutReminders } from '../engine/keywords.ts';
import { def } from '../engine/rules.ts';
import type { CardDef, Color, DecisionKind, Flow } from '../engine/types.ts';

// ---------- Constantes partagées ----------

export const CATEGORIES = ['LEADER', 'CHARACTER', 'EVENT', 'STAGE'] as const;
export const COLORS: Color[] = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
export const ATTRIBUTES = ['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom'];
// Moments et conditions des effets, tels qu'ils s'écrivent entre crochets dans le texte officiel anglais. Lus dans le
// texte, ils valent pour n'importe quelle carte (codée ou non).
export const TEXT_TAGS = [
  'On Play', 'When Attacking', 'Activate: Main', 'Main', 'Counter', 'On K.O.', 'End of Your Turn', 'Your Turn',
  "Opponent's Turn", 'Once Per Turn', 'On Block', "On Your Opponent's Attack", 'Trigger', 'DON!! x1', 'DON!! x2',
  'DON!! x3+', 'End of Your Opponent\'s Turn', 'Start of Your Turn',
];
export const TEXT_HASH_DIM = 64;
export const TYPE_HASH_DIM = 16;
export const STATUSES = ['coded', 'auto', 'todo'] as const;

// Zones d'une carte, vues par le joueur qui observe (« my » : lui, « opp » : son adversaire)
export const ZONES = [
  'myLeader', 'myChar', 'myStage', 'myHand', 'myLifeUp', 'myDeckKnown', 'myTrash', 'myPool',
  'oppLeader', 'oppChar', 'oppStage', 'oppHandKnown', 'oppLifeUp', 'oppDeckTop', 'oppTrash', 'limbo',
] as const;
export type Zone = typeof ZONES[number];
// Zones regroupées (une entrée par numéro de carte, avec le nombre d'exemplaires) que le réseau résume au lieu de les
// passer dans l'attention : groupe 0 = carte individuelle (attention), 1 = sa Défausse, 2 = Défausse adverse,
// 3 = cartes de son propre deck pas encore vues (sa liste moins les cartes visibles : il connaît son deck)
export const POOLED_ZONES: Partial<Record<Zone, number>> = { myTrash: 1, oppTrash: 2, myPool: 3 };
export const N_GROUPS = 4;

export const FLOW_STAGES: Flow['stage'][] = ['setup', 'mulligan', 'refresh', 'draw', 'don', 'main', 'battle', 'end', 'over'];
export const DECISION_KINDS: DecisionKind[] = ['mulligan', 'main', 'blocker', 'counter', 'effect'];
export const BATTLE_STEPS = ['block', 'counter', 'damage', 'end'] as const;
export const DECK_OUT_RULES = ['lose', 'win', 'loseAtEndOfTurn'] as const;

// Familles d'étiquettes de décision (Decision.tag). Les étiquettes propres à une carte (« mayBetty ») sont ramenées à
// une famille générique : une carte nouvelle qui pose le même genre de question est comprise pareil. La carte source de
// l'effet est aussi marquée parmi les cartes (caractéristique « decisionSource »).
export const TAG_FAMILIES = [
  'none', 'may', 'oppRemove', 'oppWeaken', 'ownBuff', 'giveDon', 'discard', 'pick', 'playFree', 'trigger', 'replace',
  'order', 'declareCost', 'chooseOne', 'fullZone', 'life', 'trashToDeck', 'redirect', 'other',
] as const;
const TAG_FAMILY: Record<string, typeof TAG_FAMILIES[number]> = {
  may: 'may', mayDiscard: 'may', kinemonCost: 'may',
  oppKo: 'oppRemove', oppRemove: 'oppRemove', bounce: 'oppRemove', ko: 'oppRemove', oppToLife: 'oppRemove',
  oppPower: 'oppWeaken', oppCost: 'oppWeaken', oppBase0: 'oppWeaken', oppLock: 'oppWeaken', oppRest: 'oppWeaken', rest: 'oppWeaken',
  ownPower: 'ownBuff', ownCost: 'ownBuff', ownGrant: 'ownBuff', ownReady: 'ownBuff',
  donTarget: 'giveDon',
  discard: 'discard', pick: 'pick', playFree: 'playFree', trigger: 'trigger', replace: 'replace', order: 'order',
  declareCost: 'declareCost', chooseOne: 'chooseOne', fullZone: 'fullZone',
  lifeToHand: 'life', lifeSide: 'life', lifeSideOpp: 'life', toLife: 'life', begeLife: 'life',
  trashToDeck: 'trashToDeck', kiddRedirect: 'redirect', kiddTarget: 'redirect',
};
export function tagFamily(tag: string | undefined): typeof TAG_FAMILIES[number] {
  if (!tag) return 'none';
  return TAG_FAMILY[tag] ?? (tag.startsWith('may') ? 'may' : 'other');
}

// Types d'options : préfixe de l'identifiant (« play:12 » -> « play: », « yes » -> « yes »)
export const OPTION_KINDS = [
  'keep', 'mulligan', 'play:', 'event:', 'act:', 'don:', 'attack:', 'end', 'block:', 'noblock', 'counter:', 'cevent:',
  'pass', 'card:', 'none', 'yes', 'no', 'trigger', 'hand', 'hand:', 'trash:', 'cost:', 'first:', 'choice:', 'replace:',
  'top', 'bottom', 'lifeTop', 'lifeBottom', 'leader', 'don', 'other',
] as const;
export function optionKind(id: string): typeof OPTION_KINDS[number] {
  const i = id.indexOf(':');
  const k = i < 0 ? id : id.slice(0, i + 1);
  return (OPTION_KINDS as readonly string[]).includes(k) ? (k as typeof OPTION_KINDS[number]) : 'other';
}

// ---------- Hachage ----------

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Mots du texte officiel anglais : crochets gardés comme un mot, nombres ramenés à un ordre de grandeur
export function textTokens(text: string): string[] {
  const t = withoutReminders(text).toLowerCase().replace(/−/g, '-');
  const out: string[] = [];
  for (const m of t.matchAll(/\[[^\]]+\]|[+-]?\d+|[a-z!.']+/g)) {
    const w = m[0];
    if (/^[+-]?\d+$/.test(w)) {
      const n = Math.abs(Number(w));
      const sign = w.startsWith('+') ? '+' : w.startsWith('-') ? '-' : '';
      out.push(n >= 1000 ? `${sign}pow${Math.round(n / 1000)}k` : `${sign}n${n}`);
    } else {
      out.push(w.replace(/[.']+$/, ''));
    }
  }
  return out.filter(Boolean);
}

// Sac de mots et de paires de mots, haché dans TEXT_HASH_DIM colonnes signées, de norme 1
export function hashedText(text: string): Float32Array {
  const v = new Float32Array(TEXT_HASH_DIM);
  const words = textTokens(text);
  const grams = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  for (const g of grams) {
    const h = fnv(g);
    v[h % TEXT_HASH_DIM] += (h & 0x80000000) ? -1 : 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

// ---------- Caractéristiques statiques d'une carte ----------

export const STATIC_FEATURES: string[] = [
  ...CATEGORIES.map((c) => `category:${c}`),
  'cost', 'hasCost', 'power', 'hasPower', 'counter', 'hasCounter', 'life',
  ...COLORS.map((c) => `color:${c}`),
  ...ATTRIBUTES.map((a) => `attribute:${a}`), 'attribute:other',
  ...KEYWORDS.map((k) => `printedKeyword:${k}`),
  'hasTrigger', 'trigger:play', 'trigger:main',
  ...TEXT_TAGS.map((t) => `textTag:${t}`),
  'colorCount', 'typeCount',
  ...Array.from({ length: TEXT_HASH_DIM }, (_, i) => `text:${i}`),
  ...Array.from({ length: TYPE_HASH_DIM }, (_, i) => `type:${i}`),
  ...STATUSES.map((s) => `engineStatus:${s}`),
  'hidden',
];
export const STATIC_DIM = STATIC_FEATURES.length;

function textTagFlags(d: Pick<CardDef, 'effectEn' | 'triggerEn'>): number[] {
  const text = `${withoutReminders(d.effectEn ?? '')} ${d.triggerEn ? `[Trigger] ${withoutReminders(d.triggerEn)}` : ''}`;
  const tags = new Set([...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()));
  const don = [...tags].map((t) => t.match(/^DON!! x(\d+)$/)).filter(Boolean).map((m) => Number(m![1]));
  return TEXT_TAGS.map((t) => {
    if (t === 'DON!! x1') return don.includes(1) ? 1 : 0;
    if (t === 'DON!! x2') return don.includes(2) ? 1 : 0;
    if (t === 'DON!! x3+') return don.some((n) => n >= 3) ? 1 : 0;
    return tags.has(t) ? 1 : 0;
  });
}

const staticCache = new Map<string, Float32Array>();

// Caractéristiques statiques d'un numéro de carte (« ? » : carte cachée, toutes à 0 sauf « hidden »)
export function staticFeatures(num: string): Float32Array {
  const cached = staticCache.get(num);
  if (cached) return cached;
  const v = new Float32Array(STATIC_DIM);
  if (num === HIDDEN) {
    v[STATIC_DIM - 1] = 1;
    staticCache.set(num, v);
    return v;
  }
  const d = def(num);
  let i = 0;
  for (const c of CATEGORIES) v[i++] = d.category === c ? 1 : 0;
  v[i++] = (d.cost ?? 0) / 10;
  v[i++] = d.cost === null ? 0 : 1;
  v[i++] = (d.power ?? 0) / 10000;
  v[i++] = d.power === null ? 0 : 1;
  v[i++] = (d.counter ?? 0) / 2000;
  v[i++] = d.counter ? 1 : 0;
  v[i++] = (d.life ?? 0) / 5;
  for (const c of COLORS) v[i++] = d.colors.includes(c) ? 1 : 0;
  for (const a of ATTRIBUTES) v[i++] = d.attributes.includes(a) ? 1 : 0;
  v[i++] = d.attributes.some((a) => !ATTRIBUTES.includes(a)) ? 1 : 0;
  for (const k of KEYWORDS) v[i++] = d.keywords.includes(k) ? 1 : 0;
  const generic = genericTrigger(d);
  v[i++] = d.triggerEn ? 1 : 0;
  v[i++] = generic === 'play' ? 1 : 0;
  v[i++] = generic === 'main' ? 1 : 0;
  for (const f of textTagFlags(d)) v[i++] = f;
  v[i++] = d.colors.length / 2;
  v[i++] = d.types.length / 3;
  v.set(hashedText(`${d.effectEn ?? ''} ${d.triggerEn ? `[Trigger] ${d.triggerEn}` : ''}`), i);
  i += TEXT_HASH_DIM;
  for (const t of d.types) v[i + (fnv(t) % TYPE_HASH_DIM)] = 1;
  i += TYPE_HASH_DIM;
  const status = cardStatus(num);
  for (const s of STATUSES) v[i++] = status === s ? 1 : 0;
  v[i++] = 0;
  if (i !== STATIC_DIM) throw new Error(`caractéristiques statiques : ${i} colonnes au lieu de ${STATIC_DIM}`);
  staticCache.set(num, v);
  return v;
}

// À appeler quand le catalogue change (nouvelles cartes chargées)
export function clearStaticCache() {
  staticCache.clear();
}
