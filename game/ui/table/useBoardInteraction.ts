// Contrôleur du plateau, commun à la partie contre l'IA, à la partie en ligne et à l'atelier : ce qu'on peut faire de
// chaque carte (looks), le menu d'une carte, le choix de la cible d'une attaque (ciblage, puis visée au toucher),
// la carte survolée (fenêtre de détail, prévision d'attaque), le glisser-déposer (useGestures : jouer, attaquer, donner une DON!!), la
// confirmation de fin de tour et la Défausse ouverte.
// Il ne sait pas d'où vient la partie : on lui donne l'état vu, sa place, et une fonction qui envoie un choix (au
// moteur contre l'IA, au serveur en ligne). Rien ne part sans un choix explicite du joueur.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Decision, GameState, Option, PlayerId } from '../../engine/types.ts';
import type { BoardUi } from '../Board.tsx';
import type { CardLook, Preview } from '../CardView.tsx';
import { attackPreview, readDecision, remainingActions, whyNot, type CardAction } from '../decision.ts';
import { useDevice } from '../device.ts';
import { useSettings } from '../settings.ts';
import { sfx } from '../sound.ts';
import { useCardZoom } from '../Zoom.tsx';
import { grabbableCards } from './gestures.ts';
import { boardLooks, hasUsefulAction, keepLooks } from './looks.ts';
import { useGestures } from './useGestures.ts';

// Ce que le branchement (contre l'IA, en ligne) donne au contrôleur
export interface BoardSource {
  state: GameState | null;     // l'état vu (null : pas de partie en cours)
  seat: PlayerId;              // ta place
  active: boolean;             // à toi de choisir (en ligne : et ton choix précédent est arrivé au serveur)
  choose: (id: string) => void;
  aids: boolean;               // marques « sans intérêt » (jugement de l'IA) ; pas en ligne
  recommended: string | null;  // choix conseillé par le coach (★)
}

// aim : attaque déjà choisie et cible visée au premier affichage (atelier : le résultat prévu s'affiche)
export function useBoardInteraction(source: BoardSource, init: { aim?: { attacker: number; target: number } } = {}) {
  const { state, seat, active, aids, recommended } = source;
  const [settings, updateSettings] = useSettings();
  const { compact, touch } = useDevice();
  const zoom = useCardZoom(settings.zoomDelay);
  const [menu, setMenu] = useState<{ uid: number; rect: DOMRect } | null>(null);
  const [targeting, setTargeting] = useState<{ attacker: number } | null>(init.aim ? { attacker: init.aim.attacker } : null);
  const [aimed, setAimed] = useState<number | null>(null);
  // carte survolée : un état React seulement pendant le choix d'une cible (la prévision d'attaque en dépend) ; sinon un
  // survol ne change rien au plateau et ne le redessine pas (la fenêtre de détail a son propre état, useCardZoom)
  const hovered = useRef<number | null>(init.aim?.target ?? null);
  const [hoverUid, setHoverUid] = useState<number | null>(init.aim?.target ?? null);
  const [dragging, setDragging] = useState(false);       // une DON!! est glissée
  const [dragOver, setDragOver] = useState<number | null>(null);  // cible sous le pointeur pendant un geste
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [trashOf, setTrashOf] = useState<PlayerId | null>(null);
  const keepMenu = useRef<number | null>(null);

  // Nouvelle attaque : aucune cible visée (sauf celle donnée au premier affichage)
  const firstAim = useRef(init.aim?.target ?? null);
  useEffect(() => {
    setAimed(firstAim.current);
    firstAim.current = null;
    setHoverUid(targeting ? hovered.current : null);
  }, [targeting]);
  const targetingNow = useRef(targeting);
  targetingNow.current = targeting;

  const d: Decision | null = active ? state?.decision ?? null : null;
  const view = useMemo(() => (state && d ? readDecision(state, d, aids) : null), [state, d, aids]);

  // Après avoir donné une DON!!, le menu de la carte reste ouvert pour en donner d'autres
  useEffect(() => {
    const uid = keepMenu.current;
    keepMenu.current = null;
    if (uid === null || !view?.byCard.has(uid)) return;
    const el = document.querySelector<HTMLElement>(`.table [data-uid="${uid}"]`);
    if (el) setMenu({ uid, rect: el.getBoundingClientRect() });
  }, [view]);

  // La fenêtre de détail se ferme si la carte survolée a disparu
  useEffect(() => {
    const z = zoom.zoom;
    if (z?.uid !== undefined && !document.querySelector(`[data-uid="${z.uid}"]`)) zoom.close();
  }, [state, zoom]);

  // Un choix envoyé ferme le menu et le ciblage
  const choose = source.choose;
  const pick = useCallback((id: string) => {
    if (!d) return;
    setMenu(null);
    setTargeting(null);
    setHoverUid(null);
    setConfirmEnd(false);
    choose(id);
  }, [d, choose]);

  // « Fin du tour » : confirmation s'il reste des actions (réglage), sinon le tour se termine
  const requestEnd = useCallback(() => {
    if (!state || !d || d.kind !== 'main') return;
    if (settings.confirmEnd && remainingActions(state, d, aids).length) setConfirmEnd(true);
    else pick('end');
  }, [state, d, aids, settings.confirmEnd, pick]);

  const cardClick = (uid: number, el: HTMLElement, num: string) => {
    if (view && targeting) {
      const option = (view.attacks.get(targeting.attacker) ?? []).find((o) => o.target === uid);
      if (option && touch && aimed !== uid) {
        // écran tactile : premier toucher sur une cible = résultat prévu, l'attaque part avec « Attaquer »
        sfx('click');
        setAimed(uid);
      } else if (option) {
        sfx('click');
        pick(option.id);
      } else if (uid === targeting.attacker) {
        setTargeting(null);
      }
      return;
    }
    if (view && state && d && (view.byCard.has(uid) || whyNot(state, d, uid))) {
      sfx('click');
      zoom.close();
      setMenu({ uid, rect: el.getBoundingClientRect() });
      return;
    }
    // écran tactile : toute autre carte (adversaire, carte sans action) s'ouvre en grand
    if (touch) zoom.onHover({ num, uid, rect: el.getBoundingClientRect(), pinned: true });
  };

  const onAction = (uid: number, a: CardAction) => {
    if (a.kind === 'attack') {
      setMenu(null);
      setTargeting({ attacker: uid });
      return;
    }
    if (a.kind === 'don') keepMenu.current = uid;
    pick(a.option.id);
  };

  // Fonctions données aux cartes : les mêmes d'un rendu à l'autre (les cartes en memo ne sont pas redessinées), elles
  // appellent la version du dernier rendu
  const clickRef = useRef(cardClick);
  clickRef.current = cardClick;
  const onCard = useCallback((uid: number, el: HTMLElement, num: string) => clickRef.current(uid, el, num), []);
  const zoomHover = zoom.onHover;
  const onHover = useCallback((p: Preview | null) => {
    hovered.current = p?.uid ?? null;
    if (targetingNow.current) setHoverUid(hovered.current);
    zoomHover(p);
  }, [zoomHover]);

  // Glisser-déposer : un geste reconnu choisit son option comme le menu (pick) ; lâché ailleurs, il n'a aucun effet
  const gestures = useGestures({
    decision: d,
    seat,
    touch,
    onStart: (kind, source) => {
      setMenu(null);
      setConfirmEnd(false);
      zoom.close();
      if (kind === 'attack' && source.from === 'field') setTargeting({ attacker: source.uid });
      else setTargeting(null);
      if (kind === 'don') setDragging(true);
    },
    onOver: setDragOver,
    onEnd: (option, kind) => {
      setDragging(false);
      setDragOver(null);
      if (option) {
        sfx('click');
        pick(option.id);
      } else if (kind === 'attack') {
        setTargeting(null);
      }
    },
    preview: (attacker, target) => (state ? attackPreview(state, attacker, target).text : null),
  });

  // Ce que montre chaque carte, recalculé seulement quand la décision ou ce qu'on en fait change ; un look inchangé
  // garde son objet (keepLooks)
  const lastLooks = useRef(new Map<number, CardLook>());
  const menuUid = menu?.uid ?? null;
  const aimedNow = dragOver ?? aimed;
  const looks = useMemo(() => {
    const next = state ? boardLooks({ state, seat, view, targeting, aimed: aimedNow, menu: menuUid, dragging, recommended }) : new Map<number, CardLook>();
    // les cartes qu'on peut saisir (pas pendant un ciblage choisi au menu)
    if (!targeting) for (const uid of grabbableCards(d)) next.set(uid, { ...next.get(uid), grab: true });
    lastLooks.current = keepLooks(lastLooks.current, next);
    return lastLooks.current;
  }, [state, seat, view, targeting, aimedNow, menuUid, dragging, recommended, d]);
  const donDraggable = Boolean(d?.kind === 'main' && d.options.some((o) => o.id.startsWith('don:')));
  const grab = gestures.grab;
  const ui: BoardUi = useMemo(
    () => ({ looks, onCard, onHover, onTrash: setTrashOf, onGrab: grab, donDraggable }),
    [looks, onCard, onHover, grab, donDraggable],
  );

  // Ciblage : le résultat prévu de la cible visée par un geste, survolée (souris) ou touchée (écran tactile)
  const attacks: Option[] = targeting ? view?.attacks.get(targeting.attacker) ?? [] : [];
  const aimUid = dragOver ?? (touch ? aimed : hoverUid);
  const targetPreview = state && targeting && aimUid !== null && attacks.some((o) => o.target === aimUid)
    ? attackPreview(state, targeting.attacker, aimUid)
    : null;
  const aimedOption = targeting && aimed !== null ? attacks.find((o) => o.target === aimed) : undefined;

  const special = view?.special ?? null;
  const pickerOpen = Boolean(view && view.picks.length && !special);

  return {
    state, seat, d, view, aids, recommended, compact, touch, zoom, ui, looks,
    menu, menuActions: menu && view ? view.byCard.get(menu.uid) ?? [] : [], closeMenu: () => setMenu(null), onAction,
    targeting, targetPreview, aimedOption, cancelTargeting: () => setTargeting(null),
    special, pickerOpen,
    buttons: view && !special && !pickerOpen ? view.buttons : [],
    hasCardActions: hasUsefulAction(view),
    canEndTurn: Boolean(d?.kind === 'main' && !menu && !targeting && !confirmEnd),
    pick, requestEnd,
    confirmEnd, remaining: state && d && confirmEnd ? remainingActions(state, d, aids) : [],
    cancelEnd: () => setConfirmEnd(false),
    neverAskEnd: () => { updateSettings({ confirmEnd: false }); pick('end'); },
    trashOf, closeTrash: () => setTrashOf(null),
    // Échap : le menu, le ciblage et la confirmation de fin de tour se ferment
    cancel: () => {
      setMenu(null);
      setTargeting(null);
      setConfirmEnd(false);
    },
    // Nouvelle partie, retour en arrière : plus de menu, de ciblage ni de survol
    reset: () => {
      setMenu(null);
      setTargeting(null);
      setHoverUid(null);
      setConfirmEnd(false);
    },
  };
}

export type BoardInteraction = ReturnType<typeof useBoardInteraction>;
