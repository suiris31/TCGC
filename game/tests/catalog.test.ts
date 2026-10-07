// Catalogue des cartes : lecture des listes officielles et réunion des impressions d'une carte (cartes inventées)
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog, cardNames, leadingKeywords, parsePrintings, parseSeriesList, type Printing } from '../data/catalog.ts';
import { CARDS, loadCardData } from '../engine/cards/index.ts';
import { def } from '../engine/rules.ts';

function card(id: string, o: { kind: string; name: string; cost?: string; costLabel?: string; color: string; type: string; attr?: string; text: string; trigger?: string; block?: string }) {
  return `<dl class="modalCol" id="${id}"><dt><div class="infoCol"><span>${id.replace(/_.*/, '')}</span> | <span>R</span> | <span>${o.kind}</span></div>
<div class="cardName">${o.name}</div></dt><dd><div class="backCol">
<div class="col2"><div class="cost"><h3>${o.costLabel ?? 'Cost'}</h3>${o.cost ?? '3'}</div><div class="attribute"><h3>Attribute</h3><img src="x.png"><i>${o.attr ?? 'Slash'}</i></div></div>
<div class="col2"><div class="power"><h3>Power</h3>5000</div><div class="counter"><h3>Counter</h3>1000</div></div>
<div class="col2"><div class="color"><h3>Color</h3>${o.color}</div><div class="block"><h3>Block<br class="spInline"> icon</h3>${o.block ?? '3'}</div></div>
<div class="feature"><h3>Type</h3>${o.type}</div>
<div class="text"><h3>Effect</h3>${o.text}</div>
${o.trigger ? `<div class="trigger"><h3>Trigger</h3>${o.trigger}</div>` : ''}
</div></dd></dl>`;
}

test('liste des extensions : code de chaque extension, promos et autres produits', () => {
  const html = `<option value="1">BOOSTER &lt;br class=&quot;spInline&quot;&gt;-TEST- [OP-17]</option>
    <option value="2">STARTER DECK -X- &lt;br&gt;[OP15-EB04]</option><option value="3">Promotion card</option><option value="4">Other Product Card</option>`;
  assert.deepEqual(parseSeriesList(html).map((s) => s.series), ['OP-17', 'OP15-EB04', 'P', 'AUTRE']);
});

test('lecture d’une impression : catégorie, Vie d’un Leader, listes, [Déclenchement] sans le mot-clé', () => {
  const html = card('ZZ01-001', { kind: 'LEADER', costLabel: 'Life', cost: '5', name: 'Alpha &amp; Beta', color: 'Red/Black', type: 'Test Crew/Other Group', attr: 'Slash/Strike', text: '[Rush] (reminder)<br>[On Play] Draw 1 card.' })
    + card('ZZ01-002', { kind: 'EVENT', name: 'Gamma', color: 'Red', type: 'Test Crew', attr: '', text: '[Main] Draw 1 card.', trigger: '[Trigger] Draw 2 cards.' });
  const [leader, event] = parsePrintings(html, 'en', 'OP-17');
  assert.equal(leader.category, 'LEADER');
  assert.equal(leader.life, 5);
  assert.equal(leader.cost, null);
  assert.equal(leader.name, 'Alpha & Beta');
  assert.deepEqual(leader.colors, ['Red', 'Black']);
  assert.deepEqual(leader.types, ['Test Crew', 'Other Group']);
  assert.deepEqual(leader.attributes, ['Slash', 'Strike']);
  assert.equal(leader.effect, '[Rush] (reminder)\n[On Play] Draw 1 card.');
  assert.equal(event.category, 'EVENT');
  assert.equal(event.trigger, 'Draw 2 cards.');
  assert.deepEqual(event.attributes, []);
});

test('mots-clés toujours actifs : seulement ceux qui ouvrent le texte', () => {
  assert.deepEqual(leadingKeywords('[Blocker] (After your opponent declares an attack...)\n[On Play] Draw 1 card.'), ['Blocker']);
  assert.deepEqual(leadingKeywords('[Rush] [Double Attack] (This card deals 2 damage.)'), ['Rush', 'Double Attack']);
  assert.deepEqual(leadingKeywords('[DON!! x1] This Character gains [Blocker].'), []);
  assert.deepEqual(leadingKeywords("If your Character would be K.O.'d, you may rest this Character instead. [Blocker] (reminder)"), ['Blocker'], 'en tête d’une phrase');
  assert.deepEqual(leadingKeywords('This Character gains [Blocker] and +1 cost.'), [], 'formulé autrement : codé avec la carte');
  assert.deepEqual(leadingKeywords('[On Play] Play up to 1 [Monkey.D.Luffy] from your hand.'), []);
  assert.deepEqual(leadingKeywords('[Rush: Character] [On Play] ...'), ['Rush: Character']);
  assert.deepEqual(leadingKeywords(''), []);
});

test('noms d’une carte : le sien et ceux qu’elle porte aussi selon les règles', () => {
  assert.deepEqual(cardNames('Alpha', '[Blocker]'), ['Alpha']);
  assert.deepEqual(cardNames('Alpha & Beta', "Under the rules of this game, also treat this card's name as [Alpha] and [Beta]. [Blocker]"), ['Alpha & Beta', 'Alpha', 'Beta']);
  assert.deepEqual(cardNames('Masked', "Also treat this card's name as [Hero] according to the rules."), ['Masked', 'Hero']);
});

const p = (o: Partial<Printing> & Pick<Printing, 'lang' | 'imageId' | 'series'>): Printing => ({
  number: o.imageId.replace(/_.*/, ''), rarity: 'R', category: 'CHARACTER', name: 'Alpha', cost: 3, life: null, power: 5000,
  counter: 1000, colors: ['Red'], types: ['Test Crew'], attributes: ['Slash'], effect: 'old text', trigger: null, block: '3', ...o,
});

test('réunion des impressions : VO pour les effets, VF affichée, version la plus récente, visuel normal', () => {
  const cards = buildCatalog([
    p({ lang: 'en', imageId: 'ZZ01-001', series: 'OP-09', effect: '[Blocker] old wording', block: '2' }),
    p({ lang: 'en', imageId: 'ZZ01-001_r1', series: 'ST-31', effect: '[Blocker] new wording', block: '5' }),
    p({ lang: 'en', imageId: 'ZZ01-001_p1', series: 'P', effect: '[Blocker] promo wording' }),
    p({ lang: 'fr', imageId: 'ZZ01-001', series: 'OP-09', name: 'Alpha VF', types: ['Équipage test'], effect: 'ancien texte' }),
    p({ lang: 'fr', imageId: 'ZZ01-001_r1', series: 'ST-31', name: 'Alpha VF', types: ['Équipage test'], effect: 'nouveau texte' }),
    p({ lang: 'fr', imageId: 'ZZ01-001_p2', series: 'OP-17', name: 'Alpha VF', types: ['Équipage test'], effect: 'nouveau texte' }),
    p({ lang: 'en', imageId: 'ZZ02-001', series: 'NEW-01', types: ['Test Crew', 'Lonely Group'], effect: 'english only' }),
  ]);
  const a = cards['ZZ01-001'];
  assert.equal(a.lang, 'fr');
  assert.equal(a.name, 'Alpha VF');
  assert.deepEqual(a.names, ['Alpha']);
  assert.equal(a.effect, 'nouveau texte', 'texte de la VF la plus récente');
  assert.equal(a.effectEn, '[Blocker] new wording', 'texte de la VO la plus récente (les promos passent après)');
  assert.equal(a.imageId, 'ZZ01-001_r1', 'version normale qui porte ce texte, pas l’illustration alternative');
  assert.deepEqual(a.deckArt, { 'ST-31': 'ZZ01-001_r1' });
  assert.deepEqual(a.keywords, ['Blocker']);
  assert.deepEqual(a.types, ['Test Crew']);
  assert.deepEqual(a.typeLabels, ['Équipage test']);
  assert.deepEqual(a.blocks, ['2', '3', '5']);

  // carte qui n'existe qu'en VO, d'une extension inconnue de la liste (la plus récente) : types traduits quand on le peut
  const b = cards['ZZ02-001'];
  assert.equal(b.lang, 'en');
  assert.equal(b.effect, 'english only');
  assert.deepEqual(b.typeLabels, ['Équipage test', 'Lonely Group']);
});

test('chargement : une carte d’un deck pour débutant garde l’illustration de ce deck', () => {
  const sabo = CARDS['OP13-004'];
  loadCardData({ 'OP13-004': { ...sabo, imageId: 'OP13-004', deckArt: { 'ST-35': 'OP13-004_p2' } } });
  assert.equal(def('OP13-004').imageId, 'OP13-004_p2');
  loadCardData({ 'OP13-004': { ...sabo, imageId: 'OP13-004', deckArt: undefined } });
  assert.equal(def('OP13-004').imageId, 'OP13-004');
  loadCardData({ 'OP13-004': sabo });
});
