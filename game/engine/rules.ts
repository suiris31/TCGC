// Calculs et actions de jeu selon les règles complètes (version 1.2.1), utilisés par le moteur et par les cartes :
// puissance, coût, DON!!, épuiser, mise KO et autres façons de quitter le terrain, Vie, pioche, recherche dans le deck.
import { CARDS } from './cards/index.ts';
import { genericTrigger } from './keywords.ts';
import { shuffle } from './rng.ts';
import type {
  Card, CardDef, DelayedEffect, EffectCtx, FieldCard, GameEvent, GameState, HiddenZone, Keyword, Modifier, Option, PendingEffect,
  PlayerId,
} from './types.ts';

export const RA = 'Revolutionary Army';  // {Armée révolutionnaire}

export function def(num: string): CardDef {
  const d = CARDS[num];
  if (!d) throw new Error(`Carte inconnue : ${num}`);
  return d;
}

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function log(s: GameState, player: PlayerId | null, text: string) {
  s.log.push({ turn: s.turn, player, text });
}

// Ligne du journal visible seulement par un joueur (carte regardée en secret)
export function privateLog(s: GameState, player: PlayerId, text: string) {
  s.log.push({ turn: s.turn, player, text, only: player });
}

// Leader et Personnages (cartes qui ont une puissance)
export function fieldCards(s: GameState, p: PlayerId): FieldCard[] {
  return [s.players[p].leader, ...s.players[p].chars];
}

// Tout le terrain : Leader, Personnages et Lieu
export function allField(s: GameState, p: PlayerId): FieldCard[] {
  const P = s.players[p];
  return P.stage ? [P.leader, ...P.chars, P.stage] : [P.leader, ...P.chars];
}

export function findField(s: GameState, uid: number): { player: PlayerId; card: FieldCard; leader: boolean; stage: boolean } | null {
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    if (P.leader.uid === uid) return { player: p, card: P.leader, leader: true, stage: false };
    const c = P.chars.find((x) => x.uid === uid);
    if (c) return { player: p, card: c, leader: false, stage: false };
    if (P.stage?.uid === uid) return { player: p, card: P.stage, leader: false, stage: true };
  }
  return null;
}

export const onField = (s: GameState, uid: number) => findField(s, uid) !== null;

// Types, attributs et noms : libellés de la VO (identiques quelle que soit la langue de la carte, voir types.ts)
export function hasType(num: string, type: string) {
  return def(num).types.includes(type);
}

export function leaderHasType(s: GameState, p: PlayerId, type: string) {
  return hasType(s.players[p].leader.num, type);
}

export function leaderHasAttribute(s: GameState, p: PlayerId, attribute: string) {
  return def(s.players[p].leader.num).attributes.includes(attribute);
}

export function name(s: GameState, uid: number): string {
  const f = findField(s, uid);
  if (f) return def(f.card.num).name;
  for (const P of s.players) {
    const c = [...P.hand, ...P.trash, ...P.deck, ...P.life].find((x) => x.uid === uid);
    if (c) return def(c.num).name;
  }
  return '?';
}

// ---------- Ce que chaque joueur sait des cartes cachées (11-2, 11-3) ----------

// Zone cachée où se trouve une carte (main, deck, Vie), et à qui elle appartient
export function hiddenZoneOf(s: GameState, uid: number): { player: PlayerId; zone: HiddenZone } | null {
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    for (const zone of ['hand', 'deck', 'life'] as const) if (P[zone].some((c) => c.uid === uid)) return { player: p, zone };
  }
  return null;
}

// Cartes révélées à un joueur (ou aux deux) : il les connaît tant qu'elles restent dans leur zone cachée actuelle. Le
// propriétaire d'une main la connaît toujours : seuls comptent l'adversaire, et les decks et Vies.
export function reveal(s: GameState, uids: number[], to: PlayerId | 'both') {
  for (const uid of uids) {
    const where = hiddenZoneOf(s, uid);
    if (!where) continue;
    for (const p of to === 'both' ? [0, 1] as PlayerId[] : [to]) {
      if ((where.zone === 'hand' && p === where.player) || knows(s, p, uid)) continue;
      (s.known ??= []).push({ uid, to: p, zone: where.zone });
    }
  }
}

export function knows(s: GameState, p: PlayerId, uid: number): boolean {
  return s.known?.some((k) => k.uid === uid && k.to === p && hiddenZoneOf(s, uid)?.zone === k.zone) ?? false;
}

// Oublie ce qui n'est plus vrai : une carte qui a changé de zone n'est plus connue (le moteur appelle ceci à chaque pas)
export function pruneKnown(s: GameState) {
  if (s.known?.length) s.known = s.known.filter((k) => hiddenZoneOf(s, k.uid)?.zone === k.zone);
}

// Exemplaires d'une main proposés dans un choix : pour chaque numéro, celui que l'adversaire connaît (carte révélée)
// passe en premier. Deux exemplaires d'une même carte ne se distinguent pas à une vraie table : si l'adversaire sait
// que la main contient la carte X et que son propriétaire joue « un X », c'est l'exemplaire connu qui part ; sinon
// l'adversaire verrait l'exemplaire connu rester en main et saurait qu'il y en avait un deuxième.
export function knownFirst<T extends Card>(s: GameState, owner: PlayerId, cards: T[]): T[] {
  const opp = other(owner);
  if (!s.known?.some((k) => k.to === opp)) return cards;
  return [...cards].sort((a, b) => Number(knows(s, opp, b.uid)) - Number(knows(s, opp, a.uid)));
}

// Mélange un deck : plus personne ne sait où sont ses cartes
export function shuffleDeck(s: GameState, p: PlayerId) {
  shuffle(s, s.players[p].deck);
  if (s.known?.length) {
    const inDeck = new Set(s.players[p].deck.map((c) => c.uid));
    s.known = s.known.filter((k) => !(k.zone === 'deck' && inDeck.has(k.uid)));
  }
}

// ---------- Modifications temporaires ----------

export function addMod(s: GameState, mod: Modifier) {
  s.mods.push({ ...mod, until: mod.until === 'turn' ? s.turn : mod.until });
}

export function hasMod(s: GameState, uid: number, stat: Modifier['stat']) {
  return s.mods.some((m) => m.uid === uid && m.stat === stat);
}

// « jusqu'à la fin de la prochaine phase de Fin de votre adversaire »
export function untilOpponentsNextEnd(s: GameState, p: PlayerId) {
  return s.active === p ? s.turn + 1 : s.turn;
}

// Annonce un événement de la partie. Les effets qui s'y déclenchent sont mis en attente (8-6) : ceux du joueur actif
// d'abord, chacun résolu après l'effet ou l'action en cours. `also` : effets de mots-clés déclenchés par le même
// événement ([Jouée], [En cas de KO], [En attaquant]...). Quand plusieurs effets différents d'un même joueur se
// déclenchent ensemble, il choisit leur ordre (8-6-1-1) : une étape « ordre » les précède dans la file.
export function emit(s: GameState, e: GameEvent, also: PendingEffect[] = []) {
  const batch = s.events = (s.events ?? 0) + 1;
  for (const p of [s.active, other(s.active)]) {
    const triggered = also.filter((x) => x.controller === p).map((x) => ({ ...x, batch }));
    for (const self of allField(s, p)) {
      def(self.num).when?.forEach((w, index) => {
        if (w.on !== e.type || (w.once && self.usedOpt.includes(w.once)) || !w.if(s, p, self, e)) return;
        if (w.once) self.usedOpt.push(w.once);
        triggered.push({ kind: 'when', source: self.uid, num: self.num, controller: p, answers: [], event: e, index, batch });
      });
    }
    if (new Set(triggered.map((x) => x.num)).size > 1) {
      s.pending.push({ kind: 'system', action: 'order', source: triggered[0].source, num: triggered[0].num, controller: p, answers: [], data: { batch } });
    }
    s.pending.push(...triggered);
  }
}

const zoneOf = (f: { leader: boolean; stage: boolean }) => (f.leader ? 'leader' : f.stage ? 'stage' : 'character');

// Effet différé, appliqué pendant la phase de Fin du tour indiqué
export function addDelayed(s: GameState, d: DelayedEffect) {
  s.delayed.push(d);
}

// ---------- Puissance et coût ----------

// Coût d'une carte sur le terrain (peut être négatif pendant un calcul, voir 1-3-6-2)
export function fieldCost(s: GameState, uid: number): number {
  const f = findField(s, uid);
  if (!f || f.leader) return 0;
  const d = def(f.card.num);
  let c = (d.cost ?? 0) + (d.selfCost?.(s, f.player, f.card) ?? 0);
  for (const m of s.mods) if (m.uid === uid && m.stat === 'cost') c += m.amount;
  return c;
}

export const baseCost = (num: string) => def(num).cost ?? 0;

// Coût à payer pour jouer une carte de sa main
export function handCost(s: GameState, p: PlayerId, card: Card): number {
  const d = def(card.num);
  return Math.max(0, (d.cost ?? 0) + (d.handCost?.(s, p) ?? 0));
}

// Puissance actuelle : base (éventuellement fixée par un effet, 4-9-2-1), DON!! données (+1000 chacune pendant le tour
// de leur propriétaire), effets permanents, modifications temporaires
export function power(s: GameState, uid: number): number {
  const f = findField(s, uid);
  if (!f || f.stage) return 0;
  const d = def(f.card.num);
  const bases = s.mods.filter((m) => m.uid === uid && m.stat === 'basePower').map((m) => m.amount);
  let p = bases.length ? Math.max(...bases) : d.power ?? 0;
  if (s.active === f.player) p += f.card.don * 1000;
  p += d.selfPower?.(s, f.player, f.card) ?? 0;
  for (const src of allField(s, f.player)) {
    const aura = def(src.num).aura;
    if (aura) p += aura(s, f.player, src, f.card);
  }
  for (const src of allField(s, other(f.player))) {
    const aura = def(src.num).oppAura;
    if (aura) p += aura(s, other(f.player), src, f.card);
  }
  for (const m of s.mods) if (m.uid === uid && m.stat === 'power') p += m.amount;
  return p;
}

// Mot-clé d'une carte du terrain : toujours actif (en tête de son texte), donné sous condition par son propre effet,
// ou accordé par un effet (modification temporaire)
export function hasKeyword(s: GameState, p: PlayerId, card: FieldCard, k: Keyword): boolean {
  const d = def(card.num);
  if (d.keywords?.includes(k)) return true;
  const own = k === 'Blocker' ? d.blocker : k === 'Rush' ? d.rush : k === 'Rush: Character' ? d.rushChar : undefined;
  if (own?.(s, p, card)) return true;
  return s.mods.some((m) => m.uid === card.uid && (m.stat === 'keyword' ? m.keyword === k : k === 'Blocker' && m.stat === 'blocker'));
}

export const hasBlocker = (s: GameState, p: PlayerId, card: FieldCard) => hasKeyword(s, p, card, 'Blocker');

export const canBeRested = (s: GameState, uid: number) => !hasMod(s, uid, 'cantRest');

// Peut attaquer ce tour-ci ? charsOnly : [Initiative : Personnage] le tour où il est joué
export function attackAbility(s: GameState, p: PlayerId, card: FieldCard): { can: boolean; charsOnly: boolean } {
  const P = s.players[p];
  const no = { can: false, charsOnly: false };
  if (card.rested || P.turns <= 1 || hasMod(s, card.uid, 'cantAttack') || !canBeRested(s, card.uid)) return no;
  if (card.uid === P.leader.uid || card.playedTurn < s.turn) return { can: true, charsOnly: false };
  if (hasKeyword(s, p, card, 'Rush')) return { can: true, charsOnly: false };
  if (hasKeyword(s, p, card, 'Rush: Character')) return { can: true, charsOnly: true };
  return no;
}

// Cibles possibles : le Leader adverse ou un Personnage adverse épuisé (7-1)
export function attackTargets(s: GameState, p: PlayerId, card: FieldCard): number[] {
  const ability = attackAbility(s, p, card);
  if (!ability.can) return [];
  const O = s.players[other(p)];
  const lowCostBan = hasMod(s, card.uid, 'noAttackLowCost');
  const chars = O.chars.filter((c) => c.rested && !(lowCostBan && baseCost(c.num) <= 7)).map((c) => c.uid);
  return ability.charsOnly ? chars : [O.leader.uid, ...chars];
}

// ---------- Pioche, deck, défausse ----------

export function draw(s: GameState, p: PlayerId, n = 1) {
  const P = s.players[p];
  for (let i = 0; i < n && P.deck.length; i++) {
    const card = P.deck.shift()!;
    P.hand.push(card);
    carryKnown(s, card.uid, 'hand');
  }
}

// Une carte connue passe d'une zone cachée à une autre sous les yeux de tous (pioche de la carte du dessus, Vie ajoutée
// depuis le deck, carte de Vie prise en main) : ceux qui la connaissaient la connaissent toujours
export function carryKnown(s: GameState, uid: number, zone: HiddenZone) {
  for (const k of s.known ?? []) if (k.uid === uid) k.zone = zone;
}

export function trashTopDeck(s: GameState, p: PlayerId, n: number) {
  const P = s.players[p];
  for (let i = 0; i < n && P.deck.length; i++) P.trash.push(P.deck.shift()!);
}

// Une seule option par carte différente (plusieurs exemplaires identiques)
export function uniqueByNum<T extends { num: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.num) ? false : (seen.add(c.num), true)));
}

// Défausser n cartes de la main de p (au choix de p) à cause d'un effet. Kuzan (Leader) pioche autant de cartes
// quand l'effet vient d'une carte {Marine} de son propriétaire.
export function discardFromHand(ctx: EffectCtx, p: PlayerId, n: number, prompt: string, filter: (c: Card) => boolean = () => true): number {
  const { s } = ctx;
  const P = s.players[p];
  let count = 0;
  for (let i = 0; i < n; i++) {
    const candidates = uniqueByNum(knownFirst(s, p, P.hand.filter(filter)));
    if (!candidates.length) break;
    const answer = ctx.ask({
      player: p,
      prompt: n > 1 ? `${prompt} (${i + 1}/${n})` : prompt,
      options: candidates.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid })),
      tag: 'discard',
    });
    const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    P.trash.push(card);
    log(s, p, `défausse ${def(card.num).name}`);
    count++;
  }
  if (count) {
    P.discardedTurn = s.turn;
    emit(s, { type: 'discard', player: p, count, by: ctx.me, sourceNum: ctx.num });
  }
  return count;
}

export function drawAndDiscard(ctx: EffectCtx, drawCount: number, discardCount: number) {
  draw(ctx.s, ctx.me, drawCount);
  log(ctx.s, ctx.me, `pioche ${drawCount} carte${drawCount > 1 ? 's' : ''}`);
  discardFromHand(ctx, ctx.me, discardCount, 'Défausse 1 carte de ta main');
}

// « Regardez X cartes du dessus de votre deck, révélez jusqu'à N cartes ... et ajoutez-les à votre main. Puis, placez
// les cartes restantes au-dessous de votre deck » (l'ordre de celles du dessous est gardé)
export function lookTopPick(ctx: EffectCtx, count: number, max: number, filter: (num: string) => boolean, what: string): Card[] {
  const { s } = ctx;
  const P = s.players[ctx.me];
  const looked = P.deck.splice(0, count);
  const picked: Card[] = [];
  for (let i = 0; i < max; i++) {
    const candidates = uniqueByNum(looked.filter((c) => filter(c.num)));
    if (!candidates.length) break;
    const answer = ctx.ask({
      prompt: `Tu regardes : ${looked.map((c) => def(c.num).name).join(', ')}. Ajouter à ta main ${what} ?`,
      options: [...candidates.map((c) => ({ id: `card:${c.uid}`, label: def(c.num).name, uid: c.uid, num: c.num })), { id: 'none', label: 'Aucune' }],
      tag: 'pick',
      // toutes les cartes regardées : celles déjà prises et les autres, même celles qu'on ne peut pas choisir
      cards: [...picked, ...looked].map((c) => ({ uid: c.uid, num: c.num, owner: ctx.me })),
    });
    if (answer === 'none') break;
    const [card] = looked.splice(looked.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
    picked.push(card);
  }
  P.hand.push(...picked);
  P.deck.push(...looked);
  reveal(s, picked.map((c) => c.uid), ctx.opp);
  reveal(s, looked.map((c) => c.uid), ctx.me);
  log(s, ctx.me, `regarde ${count} cartes du dessus de son deck${picked.length ? ` et ajoute ${picked.map((c) => def(c.num).name).join(', ')} à sa main` : ''}`);
  return picked;
}

// « Regardez 1 carte du dessus du deck adverse »
export function peekTop(s: GameState, p: PlayerId) {
  const top = s.players[other(p)].deck[0];
  if (!top) return;
  s.peek[p] = top.uid;
  reveal(s, [top.uid], p);  // il la connaît, y compris quand elle sera piochée ou placée dans la Vie
  log(s, p, 'regarde la carte du dessus du deck adverse');
  privateLog(s, p, `carte du dessus du deck adverse : ${def(top.num).name} (coût ${def(top.num).cost ?? '—'})`);
}

// « Déclarez un coût et révélez 1 carte du dessus du deck adverse » : vrai si le coût correspond
export function declareAndReveal(ctx: EffectCtx): boolean {
  const { s } = ctx;
  const O = s.players[ctx.opp];
  const known = s.peek[ctx.me] !== null && O.deck[0]?.uid === s.peek[ctx.me] ? O.deck[0] : null;
  const answer = ctx.ask({
    prompt: `Déclare un coût${known ? ` (tu sais que la carte du dessus est ${def(known.num).name}, coût ${def(known.num).cost ?? '—'})` : ''} :`,
    options: Array.from({ length: 11 }, (_, n) => ({ id: `cost:${n}`, label: `Coût ${n}` })),
    tag: 'declareCost',
  });
  const declared = Number(answer.split(':')[1]);
  const top = O.deck[0];
  if (!top) return false;
  s.peek[ctx.me] = top.uid;
  reveal(s, [top.uid], 'both');  // carte révélée : les deux joueurs la voient (son propriétaire aussi)
  const cost = def(top.num).cost;
  const match = cost === declared;
  log(s, ctx.me, `déclare le coût ${declared} et révèle ${def(top.num).name} (coût ${cost ?? '—'}) : ${match ? 'réussi' : 'raté'}`);
  return match;
}

// ---------- DON!! ----------

// Nombre de cartes DON!! d'un joueur : 10, ou ce que dit son Leader (Enel OP15-058 : 6)
export const donTotal = (leader: string) => def(leader).rules?.donDeck ?? 10;

export function payDon(s: GameState, p: PlayerId, n: number) {
  const P = s.players[p];
  if (P.donActive < n) throw new Error('DON!! insuffisantes');
  P.donActive -= n;
  P.donRested += n;
}

export const attachedDon = (s: GameState, p: PlayerId) => fieldCards(s, p).reduce((sum, c) => sum + c.don, 0);
export const donOnField = (s: GameState, p: PlayerId) => s.players[p].donActive + s.players[p].donRested + attachedDon(s, p);

// Donne 1 DON!! épuisée de la zone de Coût à une carte du terrain
export function giveRestedDon(s: GameState, p: PlayerId, targetUid: number, n = 1) {
  const P = s.players[p];
  const f = findField(s, targetUid);
  const amount = Math.min(n, P.donRested);
  if (!f || f.player !== p || f.stage || amount <= 0) return 0;
  P.donRested -= amount;
  f.card.don += amount;
  log(s, p, `donne ${amount} DON!! épuisée${amount > 1 ? 's' : ''} à ${def(f.card.num).name}`);
  return amount;
}

// DON!! −X (8-3-1-6) : X DON!! du terrain renvoyées au deck DON!! (d'abord les épuisées, puis les redressées, puis
// celles données aux Personnages et au Leader)
export function returnDon(s: GameState, p: PlayerId, n: number): boolean {
  const P = s.players[p];
  if (donOnField(s, p) < n) return false;
  let left = n;
  const take = (available: number) => {
    const k = Math.min(available, left);
    left -= k;
    return k;
  };
  P.donRested -= take(P.donRested);
  P.donActive -= take(P.donActive);
  for (const c of [...P.chars, P.leader]) c.don -= take(c.don);
  P.donDeck += n;
  log(s, p, `renvoie ${n} DON!! dans son deck DON!!`);
  emit(s, { type: 'donReturned', player: p, count: n });
  return true;
}

export function addDonFromDeck(s: GameState, p: PlayerId, n: number, active: boolean) {
  const P = s.players[p];
  const k = Math.min(n, P.donDeck);
  if (k <= 0) return 0;
  P.donDeck -= k;
  if (active) P.donActive += k;
  else P.donRested += k;
  log(s, p, `ajoute ${k} DON!! ${active ? 'redressée' : 'épuisée'}${k > 1 ? 's' : ''} depuis son deck DON!!`);
  return k;
}

export function untapDon(s: GameState, p: PlayerId, n: number) {
  const P = s.players[p];
  const k = Math.min(n, P.donRested);
  P.donRested -= k;
  P.donActive += k;
  if (k) log(s, p, `redresse ${k} DON!!`);
  return k;
}

// ---------- Épuiser ----------

// Épuise une carte du terrain à cause d'un effet du joueur ctx.me (Perona, Mihawk réagissent)
export function restByEffect(ctx: EffectCtx, uid: number): boolean {
  const { s } = ctx;
  const f = findField(s, uid);
  if (!f || f.card.rested || !canBeRested(s, uid)) return false;
  f.card.rested = true;
  log(s, ctx.me, `épuise ${def(f.card.num).name}`);
  emit(s, { type: 'rest', player: f.player, uid, num: f.card.num, zone: zoneOf(f), by: ctx.me, cause: 'effect', sourceNum: ctx.num });
  return true;
}

// Une carte qui attaque est épuisée
export function restForAttack(s: GameState, uid: number) {
  const f = findField(s, uid);
  if (!f) return;
  f.card.rested = true;
  emit(s, { type: 'rest', player: f.player, uid, num: f.card.num, zone: zoneOf(f), by: f.player, cause: 'attack' });
}

export function setActive(s: GameState, p: PlayerId, uid: number) {
  const f = findField(s, uid);
  if (!f || !f.card.rested) return false;
  f.card.rested = false;
  log(s, p, `redresse ${def(f.card.num).name}`);
  return true;
}

// ---------- Quitter le terrain ----------

type Destination = 'trash' | 'hand' | 'deckBottom' | 'lifeTop' | 'lifeBottom';

// La carte quitte le terrain : ses DON!! retournent épuisées dans la zone de Coût et ses modifications disparaissent
export function removeFromField(s: GameState, uid: number, to: Destination) {
  const f = findField(s, uid);
  if (!f || f.leader) return null;
  const P = s.players[f.player];
  if (f.stage) P.stage = null;
  else P.chars = P.chars.filter((c) => c.uid !== uid);
  P.donRested += f.card.don;
  s.mods = s.mods.filter((m) => m.uid !== uid);
  const card: Card = { uid: f.card.uid, num: f.card.num };
  if (to === 'trash') P.trash.push(card);
  else if (to === 'hand') P.hand.push(card);
  else if (to === 'deckBottom') P.deck.push(card);
  else if (to === 'lifeTop') P.life.unshift({ ...card, faceUp: true });
  else P.life.push({ ...card, faceUp: true });
  if (to === 'hand' || to === 'deckBottom') reveal(s, [card.uid], 'both');
  return f;
}

// « Ne peut pas être mis KO » : par son propre effet (sous condition) ou accordé par un effet
export function canBeKO(s: GameState, uid: number, cause: 'battle' | 'effect', by: PlayerId): boolean {
  const f = findField(s, uid);
  if (!f) return false;
  if (def(f.card.num).cantBeKO?.(s, f.player, f.card, cause, by)) return false;
  return !s.mods.some((m) => m.uid === uid && m.stat === 'cantBeKO'
    && (!m.scope || m.scope === cause || (m.scope === 'oppEffect' && cause === 'effect' && by !== f.player)));
}

// « Ne peut pas quitter le terrain à cause d'un effet adverse » (les effets de son propriétaire le peuvent)
export function canLeaveByEffect(s: GameState, uid: number, by: PlayerId): boolean {
  const f = findField(s, uid);
  if (!f) return false;
  if (by === f.player) return true;
  return !def(f.card.num).cantLeave?.(s, f.player, f.card) && !hasMod(s, uid, 'cantLeave');
}

// Mise KO (combat ou effet du joueur `by`) : la carte va dans la Défausse, son effet [En cas de KO] est mis en attente.
// Faux si la carte ne peut pas être mise KO.
export function koCharacter(s: GameState, uid: number, cause: 'battle' | 'effect', by: PlayerId, sourceNum?: string): boolean {
  const f0 = findField(s, uid);
  if (!f0 || f0.leader || f0.stage) return false;
  const d = def(f0.card.num);
  if (!canBeKO(s, uid, cause, by)) {
    log(s, f0.player, `${d.name} ne peut pas être mis KO`);
    return false;
  }
  const triggers = d.onKO && (d.onKOCondition?.(s, f0.player) ?? true);
  const f = removeFromField(s, uid, 'trash');
  if (!f) return false;
  log(s, f.player, `${d.name} est mis KO${cause === 'effect' ? ' par un effet' : ''}`);
  const onKO: PendingEffect[] = triggers ? [{ kind: 'onKO', source: uid, num: f.card.num, controller: f.player, answers: [] }] : [];
  emit(s, { type: 'ko', player: f.player, uid, num: f.card.num, zone: 'character', cause, by, sourceNum }, onKO);
  return true;
}

const DESTINATION_TEXT: Record<Exclude<Destination, 'trash'>, string> = {
  hand: 'renvoyé dans la main de son propriétaire',
  deckBottom: 'placé au-dessous du deck de son propriétaire',
  lifeTop: 'ajouté face visible au-dessus de la Vie de son propriétaire',
  lifeBottom: 'ajouté face visible au-dessous de la Vie de son propriétaire',
};

// Un effet fait quitter le terrain à un Personnage (KO, main, deck, Vie). Le propriétaire de la victime peut
// appliquer un effet de remplacement (Ivankov, Dragon, Koshiro...) si l'effet vient de son adversaire.
export function removeByEffect(ctx: EffectCtx, uid: number, to: 'ko' | Exclude<Destination, 'trash'>): boolean {
  const { s } = ctx;
  const f = findField(s, uid);
  if (!f || f.leader || f.stage) return false;
  const owner = f.player;
  if (to === 'ko' && !canBeKO(s, uid, 'effect', ctx.me)) {
    log(s, owner, `${def(f.card.num).name} ne peut pas être mis KO`);
    return false;
  }
  if (!canLeaveByEffect(s, uid, ctx.me)) {
    log(s, owner, `${def(f.card.num).name} ne peut pas quitter le terrain à cause d'un effet adverse`);
    return false;
  }
  if (owner !== ctx.me) {
    const options: Option[] = fieldCards(s, owner).flatMap((self) => {
      const r = def(self.num).replaceRemoval;
      if (!r || (r.onlyKo && to !== 'ko') || (r.oncePerTurn && self.usedOpt.includes('replace')) || !r.condition(s, owner, self, f.card)) return [];
      return [{ id: `replace:${self.uid}`, label: r.label(s, self, f.card), uid: self.uid }];
    });
    if (options.length) {
      const answer = ctx.ask({
        player: owner,
        prompt: `${def(f.card.num).name} va ${to === 'ko' ? 'être mis KO' : 'quitter le terrain'} à cause d'un effet adverse. Utiliser un effet de remplacement ?`,
        options: [...options, { id: 'none', label: 'Non' }],
        tag: 'replace',
      });
      if (answer !== 'none') {
        const self = findField(s, Number(answer.split(':')[1]))!.card;
        const r = def(self.num).replaceRemoval!;
        if (r.oncePerTurn) self.usedOpt.push('replace');
        r.apply(s, owner, self, f.card);
        return false;
      }
    }
  }
  if (to === 'ko') return koCharacter(s, uid, 'effect', ctx.me, ctx.num);
  else {
    removeFromField(s, uid, to);
    log(s, owner, `${def(f.card.num).name} est ${DESTINATION_TEXT[to]}`);
  }
  return true;
}

export const koByEffect = (ctx: EffectCtx, uid: number) => removeByEffect(ctx, uid, 'ko');

// ---------- Jouer un Personnage ou un Lieu ----------

// Place un Personnage sur le terrain (zone pleine : le joueur en défausse un, 3-7-6-1) et met son effet [Jouée]
// en attente
export function playCharacter(ctx: EffectCtx, p: PlayerId, card: Card, opts: { rested?: boolean } = {}) {
  const { s } = ctx;
  const P = s.players[p];
  if (def(card.num).category === 'STAGE') {
    playStage(ctx, p, card);
    return;
  }
  if (P.chars.length >= 5) {
    const answer = ctx.ask({
      player: p,
      prompt: `Zone de Personnage pleine : quel Personnage défausser pour jouer ${def(card.num).name} ?`,
      options: P.chars.map((c) => ({ id: `trash:${c.uid}`, label: `${def(c.num).name} (coût ${fieldCost(s, c.uid)}, ${power(s, c.uid)})`, uid: c.uid })),
      tag: 'fullZone',
      cards: [{ uid: card.uid, num: card.num, owner: p }],  // la carte jouée, qui n'est encore dans aucune zone
    });
    const victim = removeFromField(s, Number(answer.split(':')[1]), 'trash');
    if (victim) log(s, p, `défausse ${def(victim.card.num).name} (zone pleine)`);
  }
  P.chars.push({ uid: card.uid, num: card.num, rested: Boolean(opts.rested), don: 0, playedTurn: s.turn, usedOpt: [] });
  log(s, p, `joue ${def(card.num).name}${opts.rested ? ' (épuisé)' : ''}`);
  announcePlay(ctx, p, card, 'character');
}

// Carte jouée : effet [Jouée] et effets « quand ... est joué » (jouée de la main en payant son coût, ou par un effet)
function announcePlay(ctx: EffectCtx, p: PlayerId, card: Card, zone: 'character' | 'stage') {
  const onPlay: PendingEffect[] = def(card.num).onPlay ? [{ kind: 'onPlay', source: card.uid, num: card.num, controller: p, answers: [] }] : [];
  const byEffect = !(ctx.pending.kind === 'system' && ctx.pending.action === 'playFromHand');
  emit(ctx.s, {
    type: 'play', player: p, uid: card.uid, num: card.num, zone, by: ctx.me,
    ...(byEffect ? { cause: 'effect' as const, sourceNum: ctx.num } : {}),
  }, onPlay);
}

// Un Lieu au maximum : l'ancien est défaussé (3-8-5-1)
export function playStage(ctx: EffectCtx, p: PlayerId, card: Card) {
  const { s } = ctx;
  const P = s.players[p];
  if (P.stage) {
    const old = removeFromField(s, P.stage.uid, 'trash');
    if (old) log(s, p, `défausse le Lieu ${def(old.card.num).name}`);
  }
  P.stage = { uid: card.uid, num: card.num, rested: false, don: 0, playedTurn: s.turn, usedOpt: [] };
  log(s, p, `joue le Lieu ${def(card.num).name}`);
  announcePlay(ctx, p, card, 'stage');
}

// « Jouez jusqu'à 1 carte ... de votre main » (sans payer son coût)
export function playFromHandFree(ctx: EffectCtx, filter: (c: Card) => boolean, prompt: string, opts: { rested?: boolean } = {}): Card | null {
  const P = ctx.s.players[ctx.me];
  const candidates = uniqueByNum(knownFirst(ctx.s, ctx.me, P.hand.filter(filter)));
  if (!candidates.length) return null;
  const answer = ctx.ask({
    prompt,
    options: [...candidates.map((c) => ({ id: `card:${c.uid}`, label: `${def(c.num).name} (coût ${def(c.num).cost})`, uid: c.uid })), { id: 'none', label: 'Aucune' }],
    tag: 'playFree',
  });
  if (answer === 'none') return null;
  const [card] = P.hand.splice(P.hand.findIndex((c) => c.uid === Number(answer.split(':')[1])), 1);
  playCharacter(ctx, ctx.me, card, opts);
  return card;
}

// Effet [Déclenchement] d'une carte : codé avec la carte, ou générique (« jouez cette carte », « activez l'effet
// [Principale] de cette carte » quand celui-ci est codé)
export function triggerEffect(num: string): ((ctx: EffectCtx) => void) | undefined {
  const d = def(num);
  if (d.onTrigger) return d.onTrigger;
  const generic = genericTrigger(d);
  if (generic === 'play' && (d.category === 'CHARACTER' || d.category === 'STAGE')) return playTriggered;
  if (generic === 'main') return d.onMain;
  return undefined;
}

function playTriggered(ctx: EffectCtx) {
  if (!ctx.trigger) return;
  ctx.trigger.moved = true;
  playCharacter(ctx, ctx.me, ctx.trigger.card);
}

// ---------- Vie ----------

// Ajoute la carte du dessus du deck au-dessus de la Vie (face cachée)
export function addTopDeckToLife(s: GameState, p: PlayerId) {
  const P = s.players[p];
  if (!P.deck.length) return false;
  const card = P.deck.shift()!;
  P.life.unshift(card);
  carryKnown(s, card.uid, 'life');
  log(s, p, `ajoute la carte du dessus de son deck au-dessus de sa Vie (${P.life.length} Vie)`);
  return true;
}

// Ajoute à la main la carte du dessus ou du dessous de la Vie
export function lifeToHand(s: GameState, p: PlayerId, from: 'top' | 'bottom') {
  const P = s.players[p];
  const card = from === 'top' ? P.life.shift() : P.life.pop();
  if (!card) return null;
  P.hand.push({ uid: card.uid, num: card.num });
  carryKnown(s, card.uid, 'hand');
  if (card.faceUp) reveal(s, [card.uid], 'both');  // carte de Vie face visible : tout le monde sait qu'elle est en main
  log(s, p, `ajoute à sa main 1 carte ${from === 'top' ? 'du dessus' : 'du dessous'} de sa Vie (${P.life.length} Vie)`);
  return card;
}

// ---------- Choix fréquents dans les effets ----------

export function describe(s: GameState, uid: number): string {
  const f = findField(s, uid);
  if (!f) return name(s, uid);
  const d = def(f.card.num);
  if (f.stage) return `${d.name} (Lieu)`;
  return f.leader ? `${d.name} (Leader, ${power(s, uid)})` : `${d.name} (${power(s, uid)}, coût ${Math.max(0, fieldCost(s, uid))})`;
}

// « Jusqu'à 1 » : le joueur choisit une carte parmi les candidates ou aucune
export function chooseUpTo1(ctx: EffectCtx, candidates: number[], prompt: string, tag: string, player = ctx.me): number | null {
  if (!candidates.length) return null;
  const answer = ctx.ask({
    player,
    prompt,
    options: [...candidates.map((uid) => ({ id: `card:${uid}`, label: describe(ctx.s, uid), uid })), { id: 'none', label: 'Aucune' }],
    tag,
  });
  return answer === 'none' ? null : Number(answer.split(':')[1]);
}

// « Jusqu'à N » : choix successifs, sans doublon
export function chooseUpToN(ctx: EffectCtx, candidates: number[], n: number, prompt: string, tag: string, player = ctx.me): number[] {
  const chosen: number[] = [];
  for (let i = 0; i < n; i++) {
    const left = candidates.filter((uid) => !chosen.includes(uid));
    const uid = chooseUpTo1(ctx, left, n > 1 ? `${prompt} (${i + 1}/${n})` : prompt, tag, player);
    if (uid === null) break;
    chosen.push(uid);
  }
  return chosen;
}

// « Vous pouvez ... : » (coût facultatif)
export function may(ctx: EffectCtx, prompt: string, tag = 'may'): boolean {
  return ctx.ask({ prompt, options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }], tag }) === 'yes';
}

// Personnages adverses répondant à une condition
export function oppChars(ctx: EffectCtx, pred: (c: FieldCard) => boolean = () => true): number[] {
  return ctx.s.players[ctx.opp].chars.filter(pred).map((c) => c.uid);
}

export function myChars(ctx: EffectCtx, pred: (c: FieldCard) => boolean = () => true): number[] {
  return ctx.s.players[ctx.me].chars.filter(pred).map((c) => c.uid);
}
