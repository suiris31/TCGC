// Téléchargement des informations officielles des cartes jouables (nom, catégorie, coût, puissance, contre, couleurs,
// types, attribut, texte des effets) depuis la liste officielle française (fr.onepiece-cardgame.com).
// Utilisé par le serveur au démarrage (server/game-cards.js) et par `npm run game:cards` (tests et scripts).
// Les visuels ne sont pas téléchargés ici : le serveur TCGC les relaie déjà (/img-fr-hd/<visuel>.webp).
import { neededCards } from '../engine/cards/index.ts';
import type { CardData, Category } from '../engine/types.ts';

const BASE = 'https://fr.onepiece-cardgame.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (TCGC, simulateur de jeu)' };

// Seules les vraies balises HTML sont retirées : les attributs sont écrits tels quels dans les textes (<Tranche>...)
const decode = (s: string) => s
  .replace(/<br\s*\/?>/g, '\n').replace(/<\/?(?:h3|span|div|img|a|i|b|p|strong|em|ruby|rt|rp|small|sup|sub)\b[^>]*>/gi, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').trim();

async function text(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const num = (v: string | null) => (v == null || v === '-' || v === '' ? null : Number(v));

const CATEGORIES: Record<string, Category> = { LEADER: 'LEADER', PERSONNAGE: 'CHARACTER', 'ÉVÉNEMENTS': 'EVENT', 'ÉVÉNEMENT': 'EVENT', LIEU: 'STAGE' };

export function parseCards(html: string): CardData[] {
  const cards: CardData[] = [];
  for (const m of html.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)) {
    const [, imageId, body] = m;
    const div = (cls: string) => {
      const d = body.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`));
      return d ? decode(d[1].replace(/<h3>[\s\S]*?<\/h3>/, '')) : null;
    };
    const infoCol = body.match(/<div class="infoCol">([\s\S]*?)<\/div>/);
    const name = body.match(/<div class="cardName">([\s\S]*?)<\/div>/);
    if (!infoCol || !name) continue;
    const info = [...infoCol[1].matchAll(/<span>(.*?)<\/span>/g)].map((x) => x[1]);
    const costLabel = body.match(/<div class="cost"><h3>(.*?)<\/h3>/)?.[1];
    const costValue = num(div('cost'));
    const trigger = div('trigger');
    cards.push({
      number: info[0],
      imageId,
      rarity: info[1],
      category: CATEGORIES[info[2]] ?? (info[2] as Category),
      name: decode(name[1]),
      cost: costLabel === 'Vie' ? null : costValue,
      life: costLabel === 'Vie' ? costValue : null,
      power: num(div('power')),
      counter: num(div('counter')),
      colors: (div('color') ?? '').split('/').filter(Boolean),
      types: (div('feature') ?? '').split('/').filter(Boolean),
      attribute: body.match(/<div class="attribute">[\s\S]*?<i>(.*?)<\/i>/)?.[1] ?? null,
      effect: div('text') ?? '',
      trigger: trigger ? trigger.replace(/^\[Déclenchement\]\s*/, '') : null,
    });
  }
  return cards;
}

// Les cartes des decks jouables, chacune prise dans la liste de l'extension de son deck
export async function fetchCardData(log: (msg: string) => void = () => {}): Promise<Record<string, CardData>> {
  const listPage = await text(`${BASE}/cardlist/`);
  const seriesIds = new Map([...listPage.matchAll(/<option value="(\d+)"[^>]*>([^<]*)<\/option>/g)]
    .map(([, id, label]) => [label.match(/\[([A-Z]+-\d+)\]/)?.[1], id] as const).filter(([code]) => code));
  const out: Record<string, CardData> = {};
  for (const [series, wanted] of neededCards()) {
    const id = seriesIds.get(series);
    if (!id) throw new Error(`Extension ${series} introuvable dans la liste officielle`);
    const want = new Set(wanted);
    for (const card of parseCards(await text(`${BASE}/cardlist/?series=${id}`))) {
      if (want.has(card.number) && !out[card.number]) out[card.number] = card;
    }
    const missing = wanted.filter((n) => !out[n]);
    if (missing.length) throw new Error(`${series} : cartes absentes de la liste officielle : ${missing.join(', ')}`);
    log(`${series} : ${wanted.length} cartes`);
  }
  return out;
}
