// Effets visuels et sonores : à chaque changement de la partie, on compare l'avant et l'après pour montrer ce qui
// s'est passé (carte jouée, KO, Vie perdue, bonus de puissance, DON!! données, attaque, Événement, début de tour).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { def, findField, power } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { sfx } from './sound.ts';
import { cardImage } from './images.ts';

interface Ghost { id: number; num: string; rect: DOMRect; label: string }
interface Float { id: number; x: number; y: number; text: string; kind: 'good' | 'bad' | 'don' | 'info' }
interface Tick { id: number; who: string; mine: boolean; text: string }
interface Arrow { x1: number; y1: number; x2: number; y2: number; mine: boolean }

let nextId = 1;

function measure(): Map<number, DOMRect> {
  const m = new Map<number, DOMRect>();
  document.querySelectorAll<HTMLElement>('.table [data-uid]').forEach((el) => {
    const uid = Number(el.dataset.uid);
    if (!m.has(uid)) m.set(uid, el.getBoundingClientRect());
  });
  return m;
}

function fieldUids(s: GameState): Map<number, PlayerId> {
  const m = new Map<number, PlayerId>();
  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    for (const c of [P.leader, ...P.chars, ...(P.stage ? [P.stage] : [])]) m.set(c.uid, p);
  }
  return m;
}

function flash(selector: string, cls: string, ms: number) {
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.classList.remove(cls);
    void el.offsetWidth; // relance l'animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  });
}

const TICK = /^(joue |active |.+\) attaque |contre avec|bloque avec|l'attaque|perd 1 Vie|déclare|ajoute|place |retourne|regarde|défausse|renvoie)|est mis KO|ne peut pas|est placé|est renvoyé|est ajouté/;

export function FxLayer({ game, human, epoch }: { game: GameState; human: PlayerId; epoch: number }) {
  const prevRef = useRef<{ game: GameState; epoch: number } | null>(null);
  const rects = useRef(new Map<number, DOMRect>());
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [arrow, setArrow] = useState<Arrow | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; sub: string; mine: boolean } | null>(null);
  const [spot, setSpot] = useState<{ id: number; num: string; caption: string } | null>(null);
  const [band, setBand] = useState<DOMRect | null>(null);

  const later = (fn: () => void, ms: number) => setTimeout(fn, ms);

  useLayoutEffect(() => {
    const now = measure();
    const prev = prevRef.current;
    const old = rects.current;
    if (prev && prev.epoch === epoch && prev.game !== game) {
      const a = prev.game;
      const b = game;
      const before = fieldUids(a);
      const after = fieldUids(b);
      const newGhosts: Ghost[] = [];
      const newFloats: Float[] = [];
      const addFloat = (uid: number, text: string, kind: Float['kind'], dy = 0) => {
        const r = now.get(uid) ?? old.get(uid);
        if (r) newFloats.push({ id: nextId++, x: r.left + r.width / 2, y: r.top + r.height / 2 + dy, text, kind });
      };
      let sound: Parameters<typeof sfx>[0] | null = null;
      // cartes qui ont quitté le terrain
      for (const [uid, owner] of before) {
        if (after.has(uid)) continue;
        const r = old.get(uid);
        const P = b.players[owner];
        const num = [...a.players[owner].chars, ...(a.players[owner].stage ? [a.players[owner].stage!] : [])].find((c) => c.uid === uid)?.num;
        if (!r || !num) continue;
        const label = P.trash.some((c) => c.uid === uid) ? 'KO' : P.hand.some((c) => c.uid === uid) ? 'Renvoyé en main' : P.life.some((c) => c.uid === uid) ? 'Dans la Vie' : P.deck.some((c) => c.uid === uid) ? 'Sous le deck' : 'Retiré';
        newGhosts.push({ id: nextId++, num, rect: r, label });
        sound = 'ko';
      }
      // cartes arrivées sur le terrain ou dans ta main
      const entered = [...after.keys()].filter((uid) => !before.has(uid));
      if (entered.length) sound ??= 'play';
      for (const uid of entered) flash(`.table [data-uid="${uid}"]`, 'fx-enter', 800);
      const handBefore = new Set(a.players[human].hand.map((c) => c.uid));
      const drawn = b.players[human].hand.filter((c) => !handBefore.has(c.uid));
      for (const c of drawn) flash(`.table [data-uid="${c.uid}"]`, 'fx-draw', 700);
      if (drawn.length && !sound) sound = 'draw';
      // DON!! données et puissance
      const turnChanged = a.turn !== b.turn || a.active !== b.active;
      const battleEnded = Boolean(a.battle) && !b.battle;
      for (const [uid] of after) {
        if (!before.has(uid)) continue;
        const fa = findField(a, uid)!;
        const fb = findField(b, uid)!;
        const dDon = fb.card.don - fa.card.don;
        if (dDon > 0) {
          addFloat(uid, `+${dDon} DON!!`, 'don', -30);
          sound ??= 'don';
        }
        if (fb.stage || turnChanged || dDon !== 0 || (battleEnded && power(b, uid) < power(a, uid))) continue;
        const dp = power(b, uid) - power(a, uid);
        if (Math.abs(dp) >= 1000) addFloat(uid, `${dp > 0 ? '+' : '−'}${Math.abs(dp)}`, dp > 0 ? 'good' : 'bad', 10);
      }
      // Vies (sauf la mise en place, après les mains de départ)
      for (const p of a.flow.stage === 'mulligan' ? [] : [0, 1] as PlayerId[]) {
        const dl = b.players[p].life.length - a.players[p].life.length;
        if (dl < 0) {
          addFloat(b.players[p].leader.uid, `−${-dl} Vie`, 'bad', -10);
          flash(`[data-zone="${p}"]`, 'fx-shake', 500);
          flash(`.table [data-uid="${b.players[p].leader.uid}"]`, 'fx-hit', 600);
          sound = 'hit';
        } else if (dl > 0) {
          addFloat(b.players[p].leader.uid, `+${dl} Vie`, 'good', -10);
        }
      }
      // nouvelles DON!! (phase DON!! ou effets)
      for (const p of [0, 1] as PlayerId[]) {
        const count = (s: GameState) => s.players[p].donActive + s.players[p].donRested + [s.players[p].leader, ...s.players[p].chars].reduce((n, c) => n + c.don, 0);
        const gained = count(b) - count(a);
        const pool = document.querySelector(`[data-zone="${p}"] .don-pool`)?.getBoundingClientRect();
        if (gained > 0 && pool) newFloats.push({ id: nextId++, x: pool.left + pool.width / 2, y: pool.top + 10, text: `+${gained} DON!!`, kind: 'don' });
      }
      if (!a.battle && b.battle) sound = 'attack';
      // journal : annonces, Événements, Contres
      const fresh = b.log.length >= a.log.length ? b.log.slice(a.log.length) : [];
      const newTicks: Tick[] = [];
      for (const l of fresh) {
        if (l.only !== undefined && l.only !== human) continue;
        if (l.player === null) continue;
        if (l.text.startsWith('contre avec')) sound = 'shield';
        const ev = l.text.match(/^active (.+) \[(Principale|Contre)\]$/) ?? l.text.match(/révèle (.+) et active son \[Déclenchement\]$/);
        if (ev) {
          const cardName = ev[1];
          const owner = b.players[l.player];
          const card = [...owner.trash, ...owner.chars, ...owner.hand].reverse().find((c) => def(c.num).name === cardName);
          if (card) {
            const id = nextId++;
            setSpot({ id, num: card.num, caption: `${l.player === human ? 'Tu actives' : `${owner.name} active`} ${ev[2] ? `[${ev[2]}]` : '[Déclenchement]'}` });
            later(() => setSpot((x) => (x?.id === id ? null : x)), 1700);
            sound = 'event';
          }
        }
        if (TICK.test(l.text)) newTicks.push({ id: nextId++, who: b.players[l.player].name, mine: l.player === human, text: l.text });
      }
      if (newTicks.length) {
        const kept = newTicks.slice(-3);
        setTicks((t) => [...t, ...kept].slice(-4));
        for (const t of kept) later(() => setTicks((x) => x.filter((y) => y.id !== t.id)), 3200);
      }
      // nouveau tour
      if (a.turn !== b.turn && b.turn > 0 && b.flow.stage !== 'mulligan') {
        const id = nextId++;
        const mine = b.active === human;
        setBanner({ id, text: mine ? 'À toi de jouer !' : 'Tour de l’IA', sub: `Tour ${b.turn}`, mine });
        later(() => setBanner((x) => (x?.id === id ? null : x)), 1400);
        if (mine) sound = 'turn';
      }
      if (newGhosts.length) {
        setGhosts((g) => [...g, ...newGhosts]);
        for (const g of newGhosts) later(() => setGhosts((x) => x.filter((y) => y.id !== g.id)), 1000);
      }
      if (newFloats.length) {
        setFloats((f) => [...f, ...newFloats]);
        for (const f of newFloats) later(() => setFloats((x) => x.filter((y) => y.id !== f.id)), 1400);
      }
      if (sound) sfx(sound);
    }
    prevRef.current = { game, epoch };
    rects.current = now;
    // bande centrale entre les deux plateaux : les annonces s'y affichent
    const center = document.querySelector('.table .op-center')?.getBoundingClientRect() ?? null;
    setBand((b) => (b && center && b.top === center.top && b.height === center.height && b.right === center.right ? b : center));
    // flèche d'attaque
    const bt = game.battle;
    const ra = bt ? now.get(bt.attacker) : undefined;
    const rt = bt ? now.get(bt.target) : undefined;
    setArrow(bt && ra && rt ? {
      x1: ra.left + ra.width / 2, y1: ra.top + ra.height / 2, x2: rt.left + rt.width / 2, y2: rt.top + rt.height / 2, mine: findField(game, bt.attacker)?.player === human,
    } : null);
  }, [game, epoch, human]);

  // la flèche suit la fenêtre si elle change de taille
  useEffect(() => {
    const onResize = () => { rects.current = measure(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="fx-layer">
      {arrow && (
        <svg className={`fx-arrow ${arrow.mine ? 'arrow-mine' : 'arrow-opp'}`} width="100%" height="100%">
          <defs>
            <marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} markerEnd="url(#arrowhead)" />
        </svg>
      )}
      {ghosts.map((g) => (
        <div key={g.id} className={`fx-ghost ${g.label === 'KO' ? 'ghost-ko' : 'ghost-leave'}`} style={{ left: g.rect.left, top: g.rect.top, width: g.rect.width, height: g.rect.height }}>
          <img src={cardImage(def(g.num).imageId)} alt="" />
          <span className="ghost-label">{g.label}</span>
        </div>
      ))}
      {floats.map((f) => <div key={f.id} className={`fx-float float-${f.kind}`} style={{ left: f.x, top: f.y }}>{f.text}</div>)}
      {ticks.length > 0 && band && (
        // bande étroite (téléphone) : les annonces prennent toute la largeur, en haut de la bande, au-dessus du combat
        <div className={band.width < 600 ? 'fx-ticker ticker-narrow' : 'fx-ticker'} style={band.width < 600
          ? { left: band.left + 6, right: window.innerWidth - band.right + 6, top: band.top + 2, maxHeight: Math.max(48, band.height * 0.42) }
          : { right: window.innerWidth - band.right + 8, top: band.top + 4, maxHeight: band.height - 8, width: Math.min(360, band.width * 0.3) }}>
          {ticks.map((t) => <div key={t.id} className={`tick ${t.mine ? 'tick-me' : 'tick-opp'}`}><b className="tick-who">{t.who}</b> {t.text}</div>)}
        </div>
      )}
      {banner && (
        <div key={banner.id} className={`fx-banner ${banner.mine ? 'banner-mine' : 'banner-opp'}`}>
          <span>{banner.text}</span>
          <small>{banner.sub}</small>
        </div>
      )}
      {spot && (
        <div key={spot.id} className="fx-spot">
          <img src={cardImage(def(spot.num).imageId)} alt="" />
          <span>{spot.caption}</span>
        </div>
      )}
    </div>
  );
}

// Présentation de la partie : les deux Leaders face à face
// Appelle onDone après un délai, une seule fois (même si le composant est redessiné entre-temps)
function useTimeout(onDone: () => void, ms: number) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms);
    return () => clearTimeout(t);
  }, [ms]);
}

export function Intro({ s, onDone }: { s: GameState; onDone: () => void }) {
  useEffect(() => { sfx('turn'); }, []);
  useTimeout(onDone, 1900);
  const [a, b] = s.players;
  return (
    <div className="intro" onClick={onDone}>
      <div className="intro-side intro-left"><img src={cardImage(def(a.leader.num).imageId)} alt="" /><span>{a.name}</span></div>
      <div className="intro-vs">VS</div>
      <div className="intro-side intro-right"><img src={cardImage(def(b.leader.num).imageId)} alt="" /><span>{b.name}</span></div>
    </div>
  );
}

// Écran de victoire ou de défaite, avant le récap du coach
// sub : la phrase sous le résultat (par défaut, celle de la partie contre l'IA, avec le récap du coach)
export function Celebration({ won, onDone, sub }: { won: boolean; onDone: () => void; sub?: string }) {
  useEffect(() => { sfx(won ? 'win' : 'lose'); }, [won]);
  useTimeout(onDone, 2600);
  return (
    <div className={`celebration ${won ? 'cel-win' : 'cel-lose'}`} onClick={onDone}>
      {won && <div className="confetti">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
      <div className="cel-title">{won ? 'Victoire !' : 'Défaite'}</div>
      <div className="cel-sub">{sub ?? (won ? 'Bien joué, capitaine.' : 'Le coach a préparé ton récap.')}</div>
    </div>
  );
}
