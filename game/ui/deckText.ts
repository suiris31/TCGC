// Listes de deck en texte (import et export de l'éditeur de decks), sans dépendance au navigateur
import type { DeckList } from '../engine/decks.ts';

// Texte d'un deck au format courant des sites de decks : une ligne par carte, « 4xOP13-008 » (Leader en premier)
export function deckText(d: Pick<DeckList, 'leader' | 'cards'>): string {
  return [`1x${d.leader}`, ...Object.entries(d.cards).map(([num, n]) => `${n}x${num}`)].join('\n');
}

// Lecture d'un texte de deck (« 4xOP13-008 », « 4 OP13-008 », « OP13-008 x4 »...) : le Leader est la carte d'un
// exemplaire marquée comme Leader dans le catalogue (isLeader)
export function parseDeckText(text: string, isLeader: (num: string) => boolean): { leader: string | null; cards: Record<string, number>; unknown: string[] } {
  let leader: string | null = null;
  const cards: Record<string, number> = {};
  const unknown: string[] = [];
  for (const raw of text.split(/\r?\n|,|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2})\s*[x×]?\s*([A-Za-z]{1,5}\d{0,2}-\d{3})\b/) ?? line.match(/^([A-Za-z]{1,5}\d{0,2}-\d{3})\s*[x×]?\s*(\d{1,2})?$/);
    if (!m) {
      unknown.push(line);
      continue;
    }
    const [num, n] = /^\d/.test(m[1]) ? [m[2].toUpperCase(), Number(m[1])] : [m[1].toUpperCase(), Number(m[2] ?? 1)];
    if (!leader && isLeader(num)) leader = num;
    else cards[num] = (cards[num] ?? 0) + n;
  }
  return { leader, cards, unknown };
}
