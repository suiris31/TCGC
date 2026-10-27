// Le glisser-déposer du plateau, aux événements pointeur (souris et doigt) : une carte saisie suit le pointeur (une
// copie, la carte d'origine pâlit), une flèche part de l'attaquant, la prévision du combat s'affiche à côté du doigt,
// et ton terrain s'éclaire quand on y joue une carte. Lâché sur une cible qui correspond à une option du moteur
// (gestures.ts), le geste choisit cette option ; ailleurs, la copie revient à sa place et rien ne se passe.
// Le suivi du pointeur se fait hors de React (rien n'est redessiné à chaque mouvement) ; le contrôleur n'est prévenu
// qu'au début, quand la carte visée change, et à la fin.
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Decision, Option, PlayerId } from '../../engine/types.ts';
import { gestureIntent, gestureKind, gestureOption, shortPreview, type GestureDrop, type GestureKind, type GestureSource } from './gestures.ts';

export interface GestureHost {
  decision: Decision | null;   // la décision en cours, seulement quand c'est à toi de choisir
  seat: PlayerId;
  touch: boolean;              // écran tactile (seuil plus grand, la main défile à l'horizontale)
  onStart: (kind: GestureKind, source: GestureSource) => void;
  onOver: (uid: number | null) => void;               // carte où le geste serait accepté, sous le pointeur
  onEnd: (option: Option | null, kind: GestureKind) => void;  // null : lâché hors cible, aucun effet
  preview: (attacker: number, target: number) => string | null; // prévision du combat
}

interface Drag {
  id: number;
  source: GestureSource;
  kind: GestureKind;
  el: HTMLElement;
  rect: DOMRect;
  x0: number;
  y0: number;
  started: boolean;
  over: number | null;
  layer?: HTMLElement;     // ce qui est dessiné pendant le geste (copie, flèche, bulle, terrain éclairé)
  ghost?: HTMLElement;
  arrow?: SVGLineElement;
  bubble?: HTMLElement;
  zone?: HTMLElement;
}

const SVG = 'http://www.w3.org/2000/svg';

// Où le pointeur lâcherait le geste : la carte (et à qui elle est), ton terrain, ou nulle part. Les mains n'en font
// pas partie : sur ordinateur, elles sont dans la rangée du fond de chaque camp (une carte relâchée sur la main n'est
// pas jouée).
function dropAt(x: number, y: number, seat: PlayerId): GestureDrop {
  const el = document.elementFromPoint(x, y);
  const zone = el?.closest<HTMLElement>('.table [data-zone]');
  if (!zone || el?.closest('.hand, .opp-hand, .op-zone-hand')) return { on: 'none' };
  const mine = zone.dataset.zone === String(seat);
  const card = el?.closest<HTMLElement>('[data-uid]');
  return card && zone.contains(card) ? { on: 'card', uid: Number(card.dataset.uid), mine } : { on: 'zone', mine };
}

// Le prochain clic (celui qui suit le lâcher de la souris) n'ouvre pas le menu de la carte
function swallowClick() {
  const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 120);
}

function draw(drag: Drag, seat: PlayerId) {
  const root = drag.el.closest('.opc') ?? document.body;
  const layer = document.createElement('div');
  layer.className = `op-gesture op-gesture-${drag.kind}`;
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.ui = 'table.gesture';
  if (drag.kind === 'play') {
    const field = drag.el.closest('.table')?.querySelector<HTMLElement>(`[data-zone="${seat}"]`);
    if (field) {
      const r = field.getBoundingClientRect();
      const zone = document.createElement('div');
      zone.className = 'op-gesture-zone';
      Object.assign(zone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      zone.textContent = 'Lâcher ici pour jouer';
      layer.append(zone);
      drag.zone = zone;
    }
  }
  if (drag.kind === 'attack') {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'op-gesture-arrow');
    svg.innerHTML = '<defs><marker id="op-gesture-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>';
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('marker-end', 'url(#op-gesture-head)');
    const cx = drag.rect.left + drag.rect.width / 2;
    const cy = drag.rect.top + drag.rect.height / 2;
    line.setAttribute('x1', String(cx));
    line.setAttribute('y1', String(cy));
    svg.append(line);
    layer.append(svg);
    drag.arrow = line;
    const bubble = document.createElement('div');
    bubble.className = 'op-gesture-bubble';
    bubble.hidden = true;
    layer.append(bubble);
    drag.bubble = bubble;
  } else {
    // la carte (ou la DON!!) suit le pointeur ; l'attaquant, lui, reste à sa place et tire une flèche
    const ghost = drag.el.cloneNode(true) as HTMLElement;
    ghost.className = `${[...drag.el.classList].filter((c) => !c.startsWith('is-') && c !== 'don-drag').join(' ')} op-gesture-ghost`;
    ghost.removeAttribute('data-uid');
    ghost.removeAttribute('data-ui');
    Object.assign(ghost.style, { left: `${drag.rect.left}px`, top: `${drag.rect.top}px`, width: `${drag.rect.width}px`, height: `${drag.rect.height}px` });
    layer.append(ghost);
    drag.ghost = ghost;
  }
  root.append(layer);
  drag.layer = layer;
  drag.el.style.opacity = drag.kind === 'attack' ? '' : '0.35';
}

export function useGestures(host: GestureHost) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const dragRef = useRef<Drag | null>(null);
  const detach = useRef<(() => void) | null>(null);

  // Fin du geste : on retire les écouteurs et ce qui était dessiné ; la copie revient à sa place si rien n'est joué
  const finish = useCallback((option: Option | null) => {
    const drag = dragRef.current;
    dragRef.current = null;
    detach.current?.();
    detach.current = null;
    if (!drag?.started) return;
    try { drag.el.releasePointerCapture(drag.id); } catch { /* déjà relâché */ }
    const { layer, ghost } = drag;
    const clear = () => { layer?.remove(); drag.el.style.opacity = ''; };
    if (!option && ghost && drag.el.isConnected) {
      layer?.classList.add('is-back');
      ghost.style.transform = '';
      ghost.addEventListener('transitionend', clear, { once: true });
      setTimeout(clear, 400);
    } else {
      clear();
    }
    hostRef.current.onEnd(option, drag.kind);
  }, []);

  const move = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.id) return;
    const h = hostRef.current;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.started) {
      const intent = gestureIntent(dx, dy, drag.source.from, e.pointerType !== 'mouse' || h.touch);
      if (intent === 'wait') return;
      if (intent === 'scroll') { finish(null); return; }
      drag.started = true;
      try { drag.el.setPointerCapture(drag.id); } catch { /* pointeur déjà relâché */ }
      document.getSelection()?.removeAllRanges();
      draw(drag, h.seat);
      h.onStart(drag.kind, drag.source);
    }
    e.preventDefault();
    const drop = dropAt(e.clientX, e.clientY, h.seat);
    const option = gestureOption(h.decision, drag.source, drop);
    const over = option && drop.on === 'card' && drag.kind !== 'play' ? drop.uid : null;
    // au doigt, la copie passe au-dessus du doigt pour rester visible
    const lift = e.pointerType === 'mouse' ? 0 : drag.rect.height * 0.6;
    if (drag.ghost) drag.ghost.style.transform = `translate(${dx}px, ${dy - lift}px) rotate(-4deg) scale(1.06)`;
    drag.layer?.classList.toggle('is-valid', Boolean(option));
    drag.zone?.classList.toggle('is-hot', Boolean(option));
    if (drag.arrow) {
      drag.arrow.setAttribute('x2', String(e.clientX));
      drag.arrow.setAttribute('y2', String(e.clientY));
    }
    if (over !== drag.over) {
      drag.over = over;
      h.onOver(over);
      if (drag.bubble && drag.source.from === 'field') {
        const text = over !== null ? h.preview(drag.source.uid, over) : null;
        drag.bubble.hidden = !text;
        drag.bubble.textContent = text ? shortPreview(text) : '';
      }
    }
    if (drag.bubble && !drag.bubble.hidden) {
      drag.bubble.style.left = `${e.clientX}px`;
      drag.bubble.style.top = `${e.clientY - lift}px`;
    }
  }, [finish]);

  const up = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.started) { finish(null); return; }
    swallowClick();
    const h = hostRef.current;
    finish(gestureOption(h.decision, drag.source, dropAt(e.clientX, e.clientY, h.seat)));
  }, [finish]);

  // Une carte (ou la réserve de DON!!) est pressée : le geste commence s'il y a quelque chose à faire avec elle, et ne
  // devient un glisser qu'après un petit déplacement (sinon c'est un clic, qui ouvre le menu comme avant)
  const grab = useCallback((source: GestureSource, e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current || (e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;
    const kind = gestureKind(hostRef.current.decision, source);
    if (!kind) return;
    const el = e.currentTarget;
    dragRef.current = { id: e.pointerId, source, kind, el, rect: el.getBoundingClientRect(), x0: e.clientX, y0: e.clientY, started: false, over: null };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === dragRef.current?.id) finish(null); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && dragRef.current?.started) { ev.stopPropagation(); finish(null); } };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, { capture: true });
    detach.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, { capture: true });
    };
  }, [move, up, finish]);

  // La décision change pendant le geste (l'adversaire a joué, la partie est finie) : le geste est annulé. On compare
  // les options, pas l'objet (en ligne, une vue renvoyée à l'identique ne doit pas l'arrêter).
  const options = host.decision ? `${host.decision.player}|${host.decision.options.map((o) => o.id).join(' ')}` : '';
  useEffect(() => {
    if (dragRef.current) finish(null);
  }, [options, finish]);
  useEffect(() => () => { if (dragRef.current) finish(null); }, [finish]);

  return { grab };
}
