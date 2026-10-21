// OP03 (Pillars of Strength), version anglaise : 24 boosters de 12 cartes par display. Numéros et raretés : liste
// officielle anglaise (123 cartes, 27 parallèles, 4 cartes SP). Taux : comptages publiés de 145 displays japonais
// (un display japonais = un « lot » de 12 boosters anglais). Sources, calculs et incertitudes : game/docs/boosters.md.
import type { BoosterSet, Version } from './index.ts';

const nums = (list: string) => list.split(' ').map((n) => `OP03-${n}`);

// Version de base, par rareté imprimée
const L = nums('001 021 022 040 058 076 077 099');
const C = nums('004 006 007 009 010 019 020 023 027 031 032 035 036 037 042 043 046 052 053 054 055 061 064 '
  + '065 068 069 073 075 082 083 084 085 087 091 095 098 100 101 103 106 107 109 111 120 121');
const UC = nums('002 005 008 011 014 015 017 026 029 033 034 039 045 048 049 050 056 059 060 063 067 074 '
  + '079 088 093 094 096 104 105 116 117 118');
const R = nums('003 012 016 018 024 028 030 038 044 047 051 057 062 070 071 072 081 086 089 090 097 102 110 '
  + '112 115 119');
const SR = nums('013 025 041 066 078 080 092 108 113 114');
const SEC = nums('122 123');

// Parallèles : toutes les SR, SEC et Leaders, et 6 des R ; visuel « _p1 » de la liste officielle
const parallels = (rarity: string, list: string[]): Version[] =>
  list.map((number) => ({ number, variant: 'parallele', rarity, imageId: `${number}_p1` }));
const PARALLEL_R = nums('018 024 047 081 086 112');

// Cartes SP : affiches « Wanted » de cartes d'autres extensions, glissées dans les boosters d'OP03
const SP: Version[] = [['OP01-051', 'OP01-051_p2'], ['ST01-012', 'ST01-012_p1'], ['ST03-009', 'ST03-009_p1'],
  ['ST04-003', 'ST04-003_p1']].map(([number, imageId]) => ({ number, variant: 'sp', rarity: 'SP CARD', imageId }));

// Sogeking à fond de planche de manga, la surprise la plus rare
const MANGA: Version = { number: 'OP03-122', variant: 'manga', rarity: 'SEC', imageId: 'OP03-122_p2' };

export const OP03: BoosterSet = {
  set: 'OP03',
  lang: 'en',
  commons: 7,
  uncommons: 3,
  cards: { L, C, UC, R, SR, SEC },
  lot: {
    boosters: 12,
    superRares: [3, 4],
    leaders: [3, 4],
    // sur 145 displays japonais comptés : 48 avec une SEC, 61 avec une surprise, 36 avec deux
    patterns: { sec: 48, oneHit: 61, twoHits: 36 },
  },
  // Poids : nombre de surprises de chaque genre dans les mêmes 145 displays (133 en tout), sauf la manga (2 comptées,
  // ramenée à environ une pour 120 displays japonais, voir boosters.md)
  hits: [
    { id: 'parallele-sr', label: 'SR parallèle', weight: 55, versions: parallels('SR', SR) },
    { id: 'parallele-r', label: 'R parallèle', weight: 30, versions: parallels('R', PARALLEL_R) },
    { id: 'parallele-l', label: 'Leader parallèle', weight: 23, versions: parallels('L', L) },
    { id: 'sp', label: 'Carte SP', weight: 12, versions: SP },
    { id: 'parallele-sec', label: 'SEC parallèle', weight: 11, versions: parallels('SEC', SEC) },
    { id: 'manga', label: 'SEC manga', weight: 1.2, versions: [MANGA] },
  ],
};
