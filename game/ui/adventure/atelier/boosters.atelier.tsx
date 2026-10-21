// Page d'atelier de l'ouverture des boosters (tâche 1.6) : un booster, un booster avec une SEC, un booster avec une
// parallèle, deux boosters (récompense d'un chapitre) et un display, avec des données de démonstration. La Cale peut
// être vide, à moitié remplie ou inconnue (pas de « Nouveau ! »), et les animations normales ou réduites.
import { useMemo, useState } from 'react';
import type { BoosterContent, PulledCard } from '../../../boosters/types.ts';
import { BoosterOpening, ownedKey } from '../BoosterOpening.tsx';

export const title = 'Ouverture des boosters';

// Numéros d'OP03 par rareté (version de base)
const nums = (list: string) => list.split(' ').map((n) => `OP03-${n}`);
const L = nums('001 021 022 040 058 076 077 099');
const C = nums('004 006 007 009 010 019 020 023 027 031 032 035 036 037 042 043 046 052 053 054 055 061 064 065 068 069 073 075 '
  + '082 083 084 085 087 091 095 098 100 101 103 106 107 109 111 120 121');
const UC = nums('002 005 008 011 014 015 017 026 029 033 034 039 045 048 049 050 056 059 060 063 067 074 079 088 093 094 096 104 '
  + '105 116 117 118');
const R = nums('003 012 016 018 024 028 030 038 044 047 051 057 062 070 071 072 081 086 089 090 097 102 110 112 115 119');
const SR = nums('013 025 041 066 078 080 092 108 113 114');
const SEC = nums('122 123');

const card = (number: string, rarity: string, variant = 'base', imageUrl?: string): PulledCard => (
  imageUrl ? { number, rarity, variant, imageUrl } : { number, rarity, variant }
);
const base = (rarity: string) => (number: string) => card(number, rarity);
// Versions spéciales, avec leur visuel relayé par l'appli (liste officielle anglaise)
const parallel = (number: string, rarity: string) => card(number, rarity, 'parallele', `img-en-hd/${number}_p1.webp`);
const SP = card('ST01-012', 'SP CARD', 'sp', 'img-en-hd/ST01-012_p1.webp');
const MANGA = card('OP03-122', 'SEC', 'manga', 'img-en-hd/OP03-122_p2.webp');

// Ordre d'un vrai booster : les plus rares à la fin, les versions spéciales en dernier
const ORDER = ['C', 'UC', 'L', 'R', 'SR', 'SEC', 'SP CARD'];
const sorted = (cards: PulledCard[]): BoosterContent => ({
  set: 'OP03',
  cards: [...cards].sort((a, b) => (a.variant !== 'base' ? 10 : 0) - (b.variant !== 'base' ? 10 : 0) || ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity)),
});

const ONE = sorted([
  ...['006', '007', '010', '023', '031', '035', '046', '052'].map((n) => card(`OP03-${n}`, 'C')),
  ...['002', '008', '048'].map((n) => card(`OP03-${n}`, 'UC')),
  card('OP03-044', 'R'),
]);
const SECRET = sorted([
  ...['061', '065', '082', '084', '085', '087', '101'].map((n) => card(`OP03-${n}`, 'C')),
  ...['011', '045', '088'].map((n) => card(`OP03-${n}`, 'UC')),
  card('OP03-099', 'L'),
  card('OP03-123', 'SEC'),
]);
const SURPRISE = sorted([
  ...['103', '106', '107', '111', '004', '009', '019'].map((n) => card(`OP03-${n}`, 'C')),
  ...['014', '056', '104'].map((n) => card(`OP03-${n}`, 'UC')),
  card('OP03-041', 'SR'),
  parallel('OP03-078', 'SR'),
]);

// Tirage de démonstration, toujours le même (graine fixe) ; les vrais taux sont ceux du générateur (game/boosters)
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoBooster(rand: () => number, hit?: PulledCard, secret = false): BoosterContent {
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  const sample = (list: string[], k: number) => {
    const a = [...list];
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rand() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k);
  };
  const free = hit ?? (rand() < 0.3 ? card(pick(L), 'L') : null);
  const x = rand();
  const rare = secret ? card(pick(SEC), 'SEC') : x < 0.28 ? card(pick(SR), 'SR') : card(pick(R), 'R');
  return sorted([...sample(C, free ? 7 : 8).map(base('C')), ...sample(UC, 3).map(base('UC')), ...(free ? [free] : []), rare]);
}

// Un display : quelques surprises et une SEC, à des places fixes
const HITS: Record<number, PulledCard> = { 4: parallel('OP03-018', 'R'), 10: SP, 16: parallel('OP03-092', 'SR'), 21: MANGA };

function display(): BoosterContent[] {
  const rand = seeded(2026);
  return Array.from({ length: 24 }, (_, i) => demoBooster(rand, HITS[i], i === 13));
}

const DEMOS: { id: string; label: string; content: () => BoosterContent | BoosterContent[] }[] = [
  { id: 'un', label: 'Un booster', content: () => ONE },
  { id: 'sec', label: 'Un booster avec une SEC', content: () => SECRET },
  { id: 'parallele', label: 'Un booster avec une parallèle', content: () => SURPRISE },
  { id: 'deux', label: 'Deux boosters (récompense d’un chapitre)', content: () => { const rand = seeded(7); return [demoBooster(rand), demoBooster(rand)]; } },
  { id: 'display', label: 'Un display (24 boosters)', content: display },
];

// Cale à moitié remplie : une commune sur deux, une peu commune sur deux, quelques rares et un Leader
const HALF: Record<string, number> = Object.fromEntries(
  [...C.filter((_, i) => i % 2 === 0), ...UC.filter((_, i) => i % 2 === 1), ...R.slice(0, 8), L[0]]
    .map((number, i) => [ownedKey({ number, variant: 'base' }), 1 + (i % 3)]),
);

type Cale = 'vide' | 'moitie' | 'inconnue';
const CALES: [Cale, string][] = [['vide', 'Cale vide'], ['moitie', 'Cale à moitié remplie'], ['inconnue', 'Cale inconnue']];

export function render() {
  return <Demo />;
}

function Demo() {
  const [cale, setCale] = useState<Cale>('moitie');
  const [calm, setCalm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const demo = DEMOS.find((d) => d.id === open);
  const content = useMemo(() => demo?.content(), [demo]);
  const owned = cale === 'vide' ? {} : cale === 'moitie' ? HALF : undefined;

  return (
    <div className="op-atelier-demo">
      <p className="op-muted op-small">
        L’écran reçoit des boosters déjà tirés (données de démonstration) : rien n’est enregistré. Les visuels des cartes
        viennent du relais de l’appli. Les sons suivent le réglage du jeu (bouton 🔊 en haut de l’écran d’ouverture).
      </p>
      <div className="deck-filter">
        {DEMOS.map((d) => (
          <button key={d.id} type="button" className="op-btn op-btn-primary" onClick={() => { setDone(null); setOpen(d.id); }}>{d.label}</button>
        ))}
      </div>
      <div className="deck-filter">
        {CALES.map(([id, text]) => (
          <button key={id} type="button" className={cale === id ? 'deck-chip on' : 'deck-chip'} onClick={() => setCale(id)}>{text}</button>
        ))}
      </div>
      <div className="deck-filter">
        <button type="button" className={calm ? 'deck-chip' : 'deck-chip on'} onClick={() => setCalm(false)}>Animations normales</button>
        <button type="button" className={calm ? 'deck-chip on' : 'deck-chip'} onClick={() => setCalm(true)}>Animations réduites</button>
      </div>
      {done && <p className="good">« {done} » : ouverture terminée (onDone appelé).</p>}
      {demo && content && (
        <BoosterOpening content={content} owned={owned} animations={!calm} onDone={() => { setDone(demo.label); setOpen(null); }} />
      )}
    </div>
  );
}
