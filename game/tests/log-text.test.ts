// Le journal à la deuxième personne (tâche R3.10) : les phrases du moteur ne changent pas (le coach les lit, les
// parties enregistrées les gardent), l'affichage les tourne vers toi (game/coach/logText.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heuristicChooser } from '../ai/heuristic.ts';
import { playerNames, sayLog, sayLogLine, sayReason, sayText } from '../coach/logText.ts';
import { CARDS } from '../engine/cards/index.ts';
import { DECKS } from '../engine/decks.ts';
import { newGame } from '../engine/engine.ts';
import type { PlayerId } from '../engine/types.ts';

const NAMES: [string, string] = ['Toi', 'IA'];
const me = (text: string) => sayLogLine({ player: 0, text }, 0, NAMES);
const opp = (text: string) => sayLogLine({ player: 1, text }, 0, NAMES);
const sys = (text: string) => sayLogLine({ player: null, text }, 0, NAMES);

test('journal : les exemples de la tâche', () => {
  assert.equal(sys('Toi joue en premier'), 'Tu joues en premier');
  assert.equal(sys('IA joue en premier'), 'IA joue en premier');
  assert.deepEqual(sayLog({ player: 0, text: 'termine son tour' }, 0, NAMES), { who: 'Tu', text: 'termines ton tour' });
  assert.equal(sys('IA touche le Leader de Toi, qui n\'a plus de Vie'), 'IA touche ton Leader, qui n\'a plus de Vie');
  assert.equal(sys('Toi touche le Leader de IA, qui n\'a plus de Vie'), 'Tu touches le Leader de IA, qui n\'a plus de Vie');
});

test('journal : tes actions, du « il » au « tu »', () => {
  assert.equal(me('garde sa main de départ'), 'Tu gardes ta main de départ');
  assert.equal(me('pioche 1 carte'), 'Tu pioches 1 carte');
  assert.equal(me('perd 1 Vie (il lui en reste 3)'), 'Tu perds 1 Vie (il t’en reste 3)');
  assert.equal(me('ajoute 1 carte de sa Vie à sa main (il lui reste 2 Vie)'), 'Tu ajoutes 1 carte de ta Vie à ta main (il te reste 2 Vie)');
  assert.equal(me('ne peut plus jouer de carte Personnage ce tour-ci (Kuzan)'), 'Tu ne peux plus jouer de carte Personnage ce tour-ci (Kuzan)');
  assert.equal(me('jouera un tour supplémentaire après celui-ci (Monkey D. Luffy)'), 'Tu joueras un tour supplémentaire après celui-ci (Monkey D. Luffy)');
  // plusieurs verbes dans la même phrase
  assert.equal(me('pioche 1 carte et place la carte du dessus de sa Vie dans sa Défausse (Nami)'),
    'Tu pioches 1 carte et places la carte du dessus de ta Vie dans ta Défausse (Nami)');
  assert.equal(me('regarde 3 cartes du dessus de son deck et en place 1 au-dessus de sa Vie (4 Vie)'),
    'Tu regardes 3 cartes du dessus de ton deck et en places 1 au-dessus de ta Vie (4 Vie)');
  assert.equal(me('regarde 5 cartes du dessus de son deck et ajoute Nami à sa main, et place Usopp dans sa Défausse'),
    'Tu regardes 5 cartes du dessus de ton deck et ajoutes Nami à ta main, et places Usopp dans ta Défausse');
  // ce qui est à la carte reste à la carte
  assert.equal(me('perd 1 Vie, révèle Nami et active son [Déclenchement]'), 'Tu perds 1 Vie, révèles Nami et actives son [Déclenchement]');
  assert.equal(me('active Gum-Gum [Principale] sans payer son coût'), 'Tu actives Gum-Gum [Principale] sans payer son coût');
  assert.equal(me('Nami est placé dans la Défausse de son propriétaire (Kaido)'), 'Nami est placé dans la Défausse de son propriétaire (Kaido)');
  assert.equal(me('Kaido a ses effets annulés pour le tour (Kaido)'), 'Kaido a ses effets annulés pour le tour (Kaido)');
  // ce qui n'est pas une action : une phrase complète, à toi
  assert.deepEqual(sayLog({ player: 0, text: 'son Leader gagne +1000 de puissance pour le combat (Nami)' }, 0, NAMES),
    { who: null, text: 'Ton Leader gagne +1000 de puissance pour le combat (Nami)' });
  assert.equal(me('effet [Jouée] de Nami'), 'Effet [Jouée] de Nami');
  assert.equal(me('l’adversaire ne peut pas activer [Bloqueur] quand son Leader attaque ce tour-ci'),
    'Ton adversaire ne peut pas activer [Bloqueur] quand ton Leader attaque ce tour-ci');
  assert.equal(me('l\'adversaire ne peut pas activer le [Bloqueur] de ses Personnages de coût 5 ou moins pendant ce combat (Kidd)'),
    'Ton adversaire ne peut pas activer le [Bloqueur] de ses Personnages de coût 5 ou moins pendant ce combat (Kidd)');
});

test('journal : l’attaque', () => {
  assert.deepEqual(sayLog({ player: 0, text: 'Monkey D. Luffy (6000) attaque Kaido (Leader, 5000)' }, 0, NAMES),
    { who: 'Tu', text: 'attaques Kaido (Leader, 5000) avec Monkey D. Luffy (6000)' });
  assert.equal(opp('Kaido (7000) attaque Nami (2000, coût 1)'), 'IA attaque Nami (2000, coût 1) avec Kaido (7000)');
});

test('journal : ce que fait l’adversaire, ce qui est « adverse » est à toi', () => {
  assert.equal(opp('termine son tour'), 'IA termine son tour');
  assert.equal(opp('perd 1 Vie (il lui en reste 3)'), 'IA perd 1 Vie (il lui en reste 3)');
  assert.equal(opp('l\'attaque touche le Leader adverse (7000 contre 5000)'), 'IA : l\'attaque touche ton Leader (7000 contre 5000)');
  assert.equal(opp('tous les Personnages adverses reçoivent −2000 de puissance pour le tour (Krieg)'),
    'IA : tous tes Personnages reçoivent −2000 de puissance pour le tour (Krieg)');
  assert.equal(opp('son Leader gagne +2000 de puissance jusqu’à la fin du prochain tour adverse (Law et Bepo)'),
    'IA : son Leader gagne +2000 de puissance jusqu’à la fin de ton prochain tour (Law et Bepo)');
  assert.equal(opp('1 DON!! épuisée adverse ne sera pas redressée lors de la prochaine phase de Recharge adverse (Nami)'),
    'IA : 1 de tes DON!! épuisées ne sera pas redressée lors de ta prochaine phase de Recharge (Nami)');
});

test('journal : Hawkins, où « sa Vie » est celle de l’adversaire', () => {
  const text = 'place dans la Défausse adverse la carte du dessus de sa Vie (Nami) : il lui reste 2 Vie';
  assert.equal(me(text), 'Tu places dans la Défausse adverse la carte du dessus de sa Vie (Nami) : il lui reste 2 Vie');
  assert.equal(opp(text), 'IA place dans ta Défausse la carte du dessus de ta Vie (Nami) : il te reste 2 Vie');
});

test('journal : nouveau tour, information secrète', () => {
  assert.deepEqual(sayLog({ player: 0, text: '— Tour 3 : Toi —' }, 0, NAMES), { who: null, text: '— Tour 3 : à toi —' });
  assert.deepEqual(sayLog({ player: 1, text: '— Tour 4 : IA —' }, 0, NAMES), { who: null, text: '— Tour 4 : IA —' });
  assert.equal(me('carte regardée (sa Vie) : Nami'), 'Carte regardée (ta Vie) : Nami');
  assert.equal(me('carte placée au-dessus de ta Vie : Nami'), 'Carte placée au-dessus de ta Vie : Nami');
});

test('journal : en ligne, les pseudos (ton siège peut être le 1)', () => {
  const names = ['Zoro31', 'Monkey'];
  assert.equal(sayLogLine({ player: null, text: 'Monkey joue en premier' }, 1, names), 'Tu joues en premier');
  assert.equal(sayLogLine({ player: null, text: 'Monkey joue en premier' }, 0, names), 'Monkey joue en premier');
  assert.equal(sayLogLine({ player: 1, text: 'termine son tour' }, 1, names), 'Tu termines ton tour');
  assert.equal(sayLogLine({ player: 0, text: 'termine son tour' }, 1, names), 'Zoro31 termine son tour');
  // une carte dont le nom commence comme ton pseudo n'est pas prise pour toi
  assert.equal(sayLogLine({ player: 0, text: 'Monkey D. Luffy gagne +2000 de puissance pour le tour' }, 1, names),
    'Zoro31 : Monkey D. Luffy gagne +2000 de puissance pour le tour');
  assert.equal(sayText('Zoro31 n\'a plus de cartes dans son deck et gagne (effet de son Leader)', 0, names),
    'Tu n\'as plus de cartes dans ton deck et gagnes (effet de ton Leader)');
  assert.equal(sayText('Zoro31 n\'a plus de cartes dans son deck à la fin du tour', 1, names),
    'Zoro31 n\'a plus de cartes dans son deck à la fin du tour');
});

test('journal : aucun nom de carte n’est déformé', () => {
  const bad: string[] = [];
  for (const { name } of Object.values(CARDS)) {
    for (const text of [`joue ${name}`, `place ${name} dans sa Défausse`, `défausse ${name} et pioche 1 carte`]) {
      for (const player of [0, 1] as PlayerId[]) {
        if (!sayLog({ player, text }, 0, NAMES).text.includes(name)) bad.push(`${player} ${text}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// Une partie enregistrée garde le journal du moteur tel qu'il était : il s'affiche à la deuxième personne sans
// rien changer à ce qui est gardé (les parties anciennes comme les nouvelles)
test('journal : une partie entière, du point de vue de chaque joueur', () => {
  const ids = Object.keys(DECKS).slice(0, 6);
  for (const [k, a] of ids.entries()) {
    const s = newGame({ decks: [a, ids[(k + 1) % ids.length]], names: NAMES, seed: 41 + k, first: (k % 2) as PlayerId }, heuristicChooser);
    const kept = JSON.stringify(s.log);
    for (const human of [0, 1] as PlayerId[]) {
      const names = playerNames(s);
      const myName = names[human];
      for (const l of s.log) {
        if (l.only !== undefined && l.only !== human) continue;
        const line = sayLogLine(l, human, names);
        assert.ok(!line.startsWith(`${myName} `) && !line.includes(`le Leader de ${myName}`), `${a} : ${line}`);
        if (l.player === human && /^(joue|pioche|termine|donne|garde|repioche|perd) /.test(l.text)) assert.ok(line.startsWith('Tu '), line);
      }
      const reason = sayReason(s, human);
      assert.ok(reason.length > 0 && !reason.includes(`de ${myName},`) && !reason.startsWith(`${myName} `), reason);
    }
    assert.equal(JSON.stringify(s.log), kept, 'le journal de la partie n’est pas modifié');
  }
});
