// Effets visuels et sonores : à chaque changement de la partie, on compare l'avant et l'après pour montrer ce qui
// s'est passé (carte jouée, KO, Vie perdue, bonus de puissance, DON!! données, attaque, Événement, début de tour).
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { def, findField } from '../engine/rules.ts';
import type { GameState, PlayerId } from '../engine/types.ts';
import { tableEvents, type LeftTo } from './table/events.ts';
import { sfx } from './sound.ts';
import { cardImage } from './images.ts';
import { useReducedMotion } from './settings.ts';

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

function flashCards(selector: string, cls: string, ms: number) {
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.classList.remove(cls);
    void el.offsetWidth; // relance l'animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  });
}

// Ce que devient une carte qui quitte le terrain, et la capacité activée (carte montrée en grand)
const LEFT_LABEL: Record<LeftTo, string> = { trash: 'KO', hand: 'Renvoyé en main', life: 'Dans la Vie', deck: 'Sous le deck', gone: 'Retiré' };
const ACTIVATE_LABEL = { main: '[Principale]', counter: '[Contre]', trigger: '[Déclenchement]' } as const;

const TICK = /^(joue |active |.+\) attaque |contre avec|bloque avec|l'attaque|perd 1 Vie|déclare|ajoute|place |retourne|regarde|défausse|renvoie)|est mis KO|ne peut pas|est placé|est renvoyé|est ajouté/;

// memo : un survol ou une fenêtre ouverte ne redessine pas la couche des effets (elle ne dépend que de la partie)
export const FxLayer = memo(function FxLayer({ game, human, epoch }: { game: GameState; human: PlayerId; epoch: number }) {
  // Animations réduites : pas d'arrivée, de tremblement ni d'éclat sur les cartes ; les annonces (bandeau, fil, carte
  // activée, nombres) restent le temps prévu, mais immobiles (styles/a11y.css)
  const reduced = useReducedMotion();
  const still = useRef(reduced);
  still.current = reduced;
  const flash = (selector: string, cls: string, ms: number) => { if (!still.current) flashCards(selector, cls, ms); };
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
      const newGhosts: Ghost[] = [];
      const newFloats: Float[] = [];
      const addFloat = (uid: number, text: string, kind: Float['kind'], dy = 0) => {
        const r = now.get(uid) ?? old.get(uid);
        if (r) newFloats.push({ id: nextId++, x: r.left + r.width / 2, y: r.top + r.height / 2 + dy, text, kind });
      };
      let sound: Parameters<typeof sfx>[0] | null = null;
      // ce qui s'est passé, déduit en comparant les deux états (table/events.ts), dans l'ordre où on le montre
      for (const e of tableEvents(a, b, human)) {
        switch (e.kind) {
          case 'left': {
            const r = old.get(e.uid);
            if (!r) break;
            newGhosts.push({ id: nextId++, num: e.num, rect: r, label: LEFT_LABEL[e.to] });
            sound = 'ko';
            break;
          }
          case 'entered':
            sound ??= 'play';
            flash(`.table [data-uid="${e.uid}"]`, 'fx-enter', 800);
            break;
          case 'drawn':
            flash(`.table [data-uid="${e.uid}"]`, 'fx-draw', 700);
            sound ??= 'draw';
            break;
          case 'don':
            addFloat(e.uid, `+${e.count} DON!!`, 'don', -30);
            sound ??= 'don';
            break;
          case 'power':
            addFloat(e.uid, `${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}`, e.delta > 0 ? 'good' : 'bad', 10);
            break;
          case 'life':
            if (e.delta < 0) {
              addFloat(e.leader, `−${-e.delta} Vie`, 'bad', -10);
              flash(`[data-zone="${e.player}"]`, 'fx-shake', 500);
              flash(`.table [data-uid="${e.leader}"]`, 'fx-hit', 600);
              sound = 'hit';
            } else {
              addFloat(e.leader, `+${e.delta} Vie`, 'good', -10);
            }
            break;
          case 'donGained': {
            const pool = document.querySelector(`[data-zone="${e.player}"] .don-pool`)?.getBoundingClientRect();
            if (pool) newFloats.push({ id: nextId++, x: pool.left + pool.width / 2, y: pool.top + 10, text: `+${e.count} DON!!`, kind: 'don' });
            break;
          }
          case 'attack':
            sound = 'attack';
            break;
          case 'counter':
            sound = 'shield';
            break;
          case 'activate': {
            const id = nextId++;
            const who = e.player === human ? 'Tu actives' : `${b.players[e.player].name} active`;
            setSpot({ id, num: e.num, caption: `${who} ${ACTIVATE_LABEL[e.timing]}` });
            later(() => setSpot((x) => (x?.id === id ? null : x)), 1700);
            sound = 'event';
            break;
          }
          case 'turn': {
            const id = nextId++;
            const mine = e.player === human;
            setBanner({ id, text: mine ? 'À toi de jouer !' : 'Tour de l’IA', sub: `Tour ${e.turn}`, mine });
            later(() => setBanner((x) => (x?.id === id ? null : x)), 1400);
            if (mine) sound = 'turn';
            break;
          }
        }
      }
      // fil des annonces : les phrases du journal qui disent une action (le journal reste le texte du moteur ; les
      // effets ci-dessus ne le lisent pas)
      const fresh = b.log.length >= a.log.length ? b.log.slice(a.log.length) : [];
      const newTicks: Tick[] = [];
      for (const l of fresh) {
        if (l.only !== undefined && l.only !== human) continue;
        if (l.player === null) continue;
        if (TICK.test(l.text)) newTicks.push({ id: nextId++, who: b.players[l.player].name, mine: l.player === human, text: l.text });
      }
      if (newTicks.length) {
        const kept = newTicks.slice(-3);
        setTicks((t) => [...t, ...kept].slice(-4));
        for (const t of kept) later(() => setTicks((x) => x.filter((y) => y.id !== t.id)), 3200);
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
          <img src={cardImage(def(g.num))} alt="" />
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
          <img src={cardImage(def(spot.num))} alt="" />
          <span>{spot.caption}</span>
        </div>
      )}
    </div>
  );
});

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
    <div className="intro" data-ui="table.intro" onClick={onDone}>
      <div className="intro-side intro-left"><img src={cardImage(def(a.leader.num))} alt="" /><span>{a.name}</span></div>
      <div className="intro-vs">VS</div>
      <div className="intro-side intro-right"><img src={cardImage(def(b.leader.num))} alt="" /><span>{b.name}</span></div>
    </div>
  );
}

// Écran de victoire ou de défaite, avant le récap du coach
// sub : la phrase sous le résultat (par défaut, celle de la partie contre l'IA, avec le récap du coach)
export function Celebration({ won, onDone, sub }: { won: boolean; onDone: () => void; sub?: string }) {
  const reduced = useReducedMotion();
  useEffect(() => { sfx(won ? 'win' : 'lose'); }, [won]);
  useTimeout(onDone, 2600);
  return (
    <div className={`celebration ${won ? 'cel-win' : 'cel-lose'}`} data-ui="table.celebration" onClick={onDone}>
      {won && !reduced && <div className="confetti">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
      <div className="cel-title">{won ? 'Victoire !' : 'Défaite'}</div>
      <div className="cel-sub">{sub ?? (won ? 'Bien joué, capitaine.' : 'Le coach a préparé ton récap.')}</div>
    </div>
  );
}
