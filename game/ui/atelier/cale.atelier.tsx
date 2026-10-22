// Page d'atelier de la Cale et du deck d'aventure (tâche 1.18). « Démonstration » : la Cale avec des données inventées
// (deck de départ, cartes d'OP03, versions spéciales, cartes pas encore jouables), vide, ou pleine ; les boosters s'y
// ouvrent sur place avec le générateur, sans serveur, et rien n'est enregistré. « Mon compte » : les vrais écrans,
// reliés au compte connecté (à n'utiliser que sur un serveur d'essai).
import { useState } from 'react';
import { openBooster } from '../../boosters/open.ts';
import { BOOSTER_SETS } from '../../boosters/sets/index.ts';
import type { BoosterContent } from '../../boosters/types.ts';
import { DECKS } from '../../engine/decks.ts';
import type { HoldCard, WonBooster } from '../adventure/api.ts';
import { AdventureDeckScreen } from '../adventure/AdventureDeck.tsx';
import { BoosterOpening, ownedCounts } from '../adventure/BoosterOpening.tsx';
import { HoldScreen, HoldView } from '../adventure/Hold.tsx';

export const title = 'Cale et deck d’aventure';

// Démonstration : le deck de départ provisoire, quelques cartes d'OP03 et des versions spéciales
function starter(): HoldCard[] {
  const deck = DECKS['ST-21'] ?? Object.values(DECKS)[0];
  return [{ number: deck.leader, variant: 'base', count: 1 }, ...Object.entries(deck.cards).map(([number, count]) => ({ number, variant: 'base', count }))];
}
const EXTRA: HoldCard[] = [
  { number: 'OP03-001', variant: 'base', count: 1 }, { number: 'OP03-001', variant: 'parallele', count: 1 },
  { number: 'OP03-013', variant: 'base', count: 2 }, { number: 'OP03-122', variant: 'manga', count: 1 },
  { number: 'ST01-012', variant: 'sp', count: 1 }, { number: 'OP03-044', variant: 'base', count: 3 },
  { number: 'OP03-006', variant: 'base', count: 5 }, { number: 'OP03-123', variant: 'base', count: 1 },
];
const FULL: HoldCard[] = Object.values(BOOSTER_SETS.OP03.cards).flat().map((number, i) => ({ number, variant: 'base', count: 1 + (i % 5) }));

const booster = (i: number, source: string): WonBooster => ({ id: `demo-${i}`, set: 'OP03', source, createdAt: new Date().toISOString() });
const DEMO_BOOSTERS = [booster(1, 'chapitre eb-1-shells-town'), booster(2, 'chapitre eb-1-shells-town'), booster(3, 'chapitre eb-2-orange-town')];

function merge(cards: HoldCard[], contents: BoosterContent[]): HoldCard[] {
  const map = new Map(cards.map((c) => [`${c.number}|${c.variant}`, { ...c }]));
  for (const c of contents.flatMap((b) => b.cards)) {
    const key = `${c.number}|${c.variant}`;
    const line = map.get(key) ?? { number: c.number, variant: c.variant, count: 0 };
    line.count++;
    map.set(key, line);
  }
  return [...map.values()];
}

function Demo({ initial, boosters: initialBoosters }: { initial: HoldCard[]; boosters: WonBooster[] }) {
  const [cards, setCards] = useState(initial);
  const [boosters, setBoosters] = useState(initialBoosters);
  const [opened, setOpened] = useState<{ contents: BoosterContent[]; owned: Record<string, number> } | null>(null);
  if (opened) return <BoosterOpening content={opened.contents} owned={opened.owned} onDone={() => setOpened(null)} />;
  return (
    <HoldView cards={cards} boosters={boosters} onBack={() => {}} onOpen={(ids) => {
      const contents = ids.map(() => openBooster('OP03', Math.random));
      setOpened({ contents, owned: ownedCounts(cards) });
      setCards(merge(cards, contents));
      setBoosters((list) => list.filter((b) => !ids.includes(b.id)));
    }} />
  );
}

const VIEWS = {
  demo: 'Démonstration',
  empty: 'Cale vide',
  full: 'Toute OP03',
  hold: 'Ma Cale (mon compte)',
  deck: 'Mon deck (mon compte)',
} as const;

export function render() {
  const [view, setView] = useState<keyof typeof VIEWS>('demo');
  return (
    <div className="op-atelier-demo">
      <nav className="op-atelier-pages">
        {Object.entries(VIEWS).map(([k, label]) => (
          <button key={k} className={view === k ? 'deck-chip on' : 'deck-chip'} onClick={() => setView(k as keyof typeof VIEWS)}>{label}</button>
        ))}
      </nav>
      {view === 'demo' && <Demo key="demo" initial={[...starter(), ...EXTRA]} boosters={DEMO_BOOSTERS} />}
      {view === 'empty' && <Demo key="empty" initial={[]} boosters={[]} />}
      {view === 'full' && <Demo key="full" initial={[...starter(), ...FULL, ...EXTRA.filter((c) => c.variant !== 'base')]} boosters={[booster(9, 'chapitre eb-6-loguetown')]} />}
      {view === 'hold' && <HoldScreen onBack={() => setView('demo')} />}
      {view === 'deck' && <AdventureDeckScreen onBack={() => setView('demo')} />}
    </div>
  );
}
