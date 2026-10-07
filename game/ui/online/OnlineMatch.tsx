// Partie en ligne : salle d'attente (code à transmettre), puis plateau. Le plateau reprend celui de la partie contre
// l'IA, avec la vue envoyée par le serveur : pas de coach, pas de retour en arrière, pas de marques « sans intérêt »
// (aides désactivées), et chaque choix part au serveur, qui arbitre.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DECKS } from '../../engine/decks.ts';
import { def } from '../../engine/rules.ts';
import type { GameState, PlayerId } from '../../engine/types.ts';
import { Hand, OpponentHand, PlayerZone, type BoardUi } from '../Board.tsx';
import type { CardLook, Preview } from '../CardView.tsx';
import { DeckGuideModal } from '../DeckGuide.tsx';
import { attackPreview, readDecision, remainingActions, whyNot, type CardAction } from '../decision.ts';
import { useDevice, useWakeLock } from '../device.ts';
import { Celebration, FxLayer, Intro } from '../Fx.tsx';
import { ActionBar, ActionMenu, BattlePanel } from '../Interaction.tsx';
import { ConfirmEndModal, CostModal, HelpModal, MulliganModal, PickerModal, TrashModal, TriggerModal } from '../Modals.tsx';
import { CardPreview, DecisionBox, GameLog } from '../Panel.tsx';
import { UI_SCALES, ZOOM_DELAYS, useSettings } from '../settings.ts';
import { setSoundEnabled, sfx } from '../sound.ts';
import { CardZoom, useCardZoom } from '../Zoom.tsx';
import { cancelRoom, resignMatch, sendChoice, useMatch, type LiveView } from './api.ts';

export function OnlineMatch({ id, onLeave }: { id: string; onLeave: () => void }) {
  const { view, connected, error, refresh } = useMatch(id);
  if (!view) {
    return (
      <div className="setup lobby">
        {error ? <p className="danger">Impossible d’ouvrir la partie : {error}</p> : <p className="op-muted"><span className="op-spinner" /> Connexion à la partie…</p>}
        <button className="op-btn op-btn-ghost" onClick={onLeave}>Retour</button>
      </div>
    );
  }
  if (view.status === 'waiting') return <WaitingRoom view={view} onLeave={onLeave} />;
  if (view.status === 'cancelled' || view.status === 'expired' || !view.state) {
    return (
      <div className="setup lobby">
        <h2>{view.status === 'expired' ? 'La salle a expiré' : 'La salle est fermée'}</h2>
        <p className="op-muted">Personne ne l’a rejointe à temps. Crée une nouvelle salle et envoie son code à ton ami.</p>
        <button className="op-btn op-btn-primary" onClick={onLeave}>Retour</button>
      </div>
    );
  }
  return <OnlineBoard view={view} game={view.state} connected={connected} refresh={refresh} onLeave={onLeave} />;
}

// ---------- Salle d'attente ----------

function WaitingRoom({ view, onLeave }: { view: LiveView; onLeave: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const code = view.code ?? '';
  const link = `${window.location.origin}${window.location.pathname}#play/salle/${code}`;
  const share = async () => {
    const text = `Rejoins-moi pour une partie de ONE PIECE CARD GAME sur Ma Collection One Piece : code ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Partie en ligne', text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setCopied('Lien et code copiés : colle-les dans un message à ton ami.');
      }
    } catch {
      // partage annulé
    }
  };
  const close = async () => {
    await cancelRoom(view.id).catch(() => {});
    onLeave();
  };
  const minutes = view.expiresAt ? Math.max(0, Math.round((new Date(view.expiresAt).getTime() - Date.now()) / 60_000)) : null;
  return (
    <div className="setup lobby">
      <header className="setup-head">
        <h1>🌐 Ta salle est ouverte</h1>
        <p className="op-muted">Donne ce code à ton ami. Il l’entre dans <b>Jouer → Jouer avec un ami → Rejoindre</b>, ou ouvre le lien que tu lui envoies.</p>
      </header>
      <div className="room-code" aria-label="Code de la salle">{code}</div>
      <div className="lobby-actions">
        <button className="op-btn op-btn-primary btn-big" onClick={share}>Envoyer le code</button>
        <button className="op-btn op-btn-ghost" onClick={close}>Fermer la salle</button>
      </div>
      {copied && <p className="good">{copied}</p>}
      <p className="op-muted"><span className="op-spinner" /> En attente de ton ami… La partie commence dès qu’il rejoint la salle{minutes !== null ? ` (encore ${minutes} min)` : ''}.</p>
      <p className="op-small op-muted">Ton deck : {DECKS[view.you.deck]?.name ?? view.you.deck}</p>
    </div>
  );
}

// ---------- Plateau ----------

function OnlineBoard({ view, game, connected, refresh, onLeave }: { view: LiveView; game: GameState; connected: boolean; refresh: () => void; onLeave: () => void }) {
  const seat = view.seat;
  const opp: PlayerId = seat === 0 ? 1 : 0;
  const oppName = view.opponent?.name ?? 'Adversaire';
  const [settings, updateSettings] = useSettings();
  const { compact, touch } = useDevice();
  const cardZoom = useCardZoom(settings.zoomDelay);
  const [menu, setMenu] = useState<{ uid: number; rect: DOMRect } | null>(null);
  const [targeting, setTargeting] = useState<{ attacker: number } | null>(null);
  const [aimed, setAimed] = useState<number | null>(null);
  const [hoverUid, setHoverUid] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [trashOf, setTrashOf] = useState<PlayerId | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [help, setHelp] = useState(false);
  const [guide, setGuide] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<'journal' | 'choix'>('journal');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sentSeq, setSentSeq] = useState<number | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [intro, setIntro] = useState(game.history.length === 0);
  const [celebrate, setCelebrate] = useState(false);
  const [showEnd, setShowEnd] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const keepMenu = useRef<number | null>(null);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  useEffect(() => { document.documentElement.style.setProperty('--ui', String(settings.uiScale)); }, [settings.uiScale]);
  useEffect(() => setAimed(null), [targeting]);
  useWakeLock(game.winner === null);

  const over = game.winner !== null;
  const d = game.decision;
  // à moi de choisir, et mon dernier choix a déjà été pris en compte par le serveur
  const myTurn = Boolean(d && d.player === seat && !over && sentSeq !== view.seq);
  const dv = useMemo(() => (myTurn && d ? readDecision(game, d, false) : null), [game, d, myTurn]);

  // fin de partie : écran de victoire ou de défaite, une fois
  const celebrated = useRef(over);
  useEffect(() => {
    if (over && !celebrated.current) {
      celebrated.current = true;
      setCelebrate(true);
    }
  }, [over]);

  // après avoir donné une DON!!, le menu de la carte reste ouvert pour en donner d'autres
  useEffect(() => {
    const uid = keepMenu.current;
    keepMenu.current = null;
    if (uid === null || !dv?.byCard.has(uid)) return;
    const el = document.querySelector<HTMLElement>(`.table [data-uid="${uid}"]`);
    if (el) setMenu({ uid, rect: el.getBoundingClientRect() });
  }, [dv]);

  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(t);
  }, [alert]);

  const resetUi = () => {
    setMenu(null);
    setTargeting(null);
    setHoverUid(null);
    setConfirmEnd(false);
    setPanel(false);
  };

  const choose = useCallback((choice: string) => {
    if (!myTurn) return;
    setSentSeq(view.seq);
    resetUi();
    sendChoice(view.id, view.seq, choice).catch((e: Error & { code?: string }) => {
      setSentSeq(null);
      if (e.code === 'stale' || e.code === 'not_your_turn') refresh();
      else setAlert(`Choix refusé : ${e.message}`);
    });
  }, [myTurn, view.id, view.seq, refresh]);

  const requestEnd = useCallback(() => {
    if (!myTurn || !d || d.kind !== 'main') return;
    if (settings.confirmEnd && remainingActions(game, d, false).length) setConfirmEnd(true);
    else choose('end');
  }, [myTurn, d, settings.confirmEnd, game, choose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        setMenu(null);
        setTargeting(null);
        setConfirmEnd(false);
        setHelp(false);
        setSettingsOpen(false);
        setGuide(null);
        setPanel(false);
        cardZoom.close();
      } else if (e.key === 'Enter' && myTurn && d?.kind === 'main' && !menu && !targeting && !confirmEnd) {
        requestEnd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, d, menu, targeting, confirmEnd, requestEnd, cardZoom]);

  // ---------- Apparence des cartes ----------
  const looks = new Map<number, CardLook>();
  if (dv) {
    if (targeting) {
      looks.set(targeting.attacker, { selected: true });
      for (const o of dv.attacks.get(targeting.attacker) ?? []) looks.set(o.target!, { target: true, selected: aimed === o.target });
    } else {
      for (const [uid, actions] of dv.byCard) {
        const choosing = actions.every((a) => a.kind === 'choose');
        const counter = actions.find((a) => a.kind === 'counter' || a.kind === 'cevent');
        const num = game.players[seat].hand.find((c) => c.uid === uid)?.num;
        looks.set(uid, {
          actionable: !choosing,
          choose: choosing,
          selected: menu?.uid === uid,
          drop: dragging && actions.some((a) => a.kind === 'don'),
          badge: counter && num ? (counter.kind === 'counter' ? `+${def(num).counter}` : 'Contre') : undefined,
        });
      }
      if (d?.kind === 'main') for (const c of game.players[seat].hand) if (!dv.byCard.has(c.uid)) looks.set(c.uid, { dim: true });
    }
  }

  const onCard = (uid: number, el: HTMLElement, num: string) => {
    if (dv && targeting) {
      const option = (dv.attacks.get(targeting.attacker) ?? []).find((o) => o.target === uid);
      if (option && touch && aimed !== uid) {
        sfx('click');
        setAimed(uid);
      } else if (option) {
        sfx('click');
        choose(option.id);
      } else if (uid === targeting.attacker) {
        setTargeting(null);
      }
      return;
    }
    if (dv && d && (dv.byCard.has(uid) || whyNot(game, d, uid))) {
      sfx('click');
      cardZoom.close();
      setMenu({ uid, rect: el.getBoundingClientRect() });
      return;
    }
    if (touch) cardZoom.onHover({ num, uid, rect: el.getBoundingClientRect(), pinned: true });
  };

  const onAction = (uid: number, a: CardAction) => {
    if (a.kind === 'attack') {
      setMenu(null);
      setTargeting({ attacker: uid });
      return;
    }
    if (a.kind === 'don') keepMenu.current = uid;
    choose(a.option.id);
  };

  const onHover = (p: Preview | null) => {
    setPreview(p);
    setHoverUid(p?.uid ?? null);
    cardZoom.onHover(p);
  };

  const ui: BoardUi = {
    looks,
    onCard,
    onHover,
    onTrash: setTrashOf,
    onDropDon: (uid) => {
      setDragging(false);
      if (d?.options.some((o) => o.id === `don:${uid}`)) choose(`don:${uid}`);
    },
    donDraggable: Boolean(myTurn && d?.kind === 'main' && d.options.some((o) => o.id.startsWith('don:'))),
    onDonDrag: setDragging,
  };

  const aimUid = touch ? aimed : hoverUid;
  const targetPreview = targeting && aimUid !== null && (dv?.attacks.get(targeting.attacker) ?? []).some((o) => o.target === aimUid)
    ? attackPreview(game, targeting.attacker, aimUid)
    : null;
  const aimedOption = targeting && aimed !== null ? (dv?.attacks.get(targeting.attacker) ?? []).find((o) => o.target === aimed) : undefined;
  const special = dv?.special;
  const pickerOpen = Boolean(dv && dv.picks.length && !special);
  const menuActions = menu && dv ? dv.byCard.get(menu.uid) ?? [] : [];
  const won = game.winner === seat;
  const who = over ? 'fin' : game.active === seat ? 'à toi' : oppName;

  const resign = async () => {
    setLeaving(false);
    await resignMatch(view.id).catch((e: Error) => setAlert(e.message));
  };

  return (
    <div className="game" onClick={() => setSettingsOpen(false)}>
      <main className="table">
        <header className="op-topbar">
          <div className="op-brand">🌐 En ligne</div>
          <div className="match op-small op-muted">{DECKS[view.you.deck]?.name} <span className="vs">contre</span> {oppName} · {DECKS[view.opponent?.deck ?? '']?.name}</div>
          <div className={`phase-pill ${game.active === seat ? 'pill-me' : 'pill-opp'}`}>Tour {game.turn || 1} · {who}{game.battle ? ' ⚔' : ''}</div>
          <span className={view.opponentOnline ? 'presence presence-on' : 'presence'} title={view.opponentOnline ? `${oppName} est connecté` : `${oppName} n’est pas connecté en ce moment`}>●</span>
          <div className="top-actions">
            <button className="icon-btn hide-compact" onClick={() => updateSettings({ sound: !settings.sound })} title={settings.sound ? 'Couper le son' : 'Activer le son'}>{settings.sound ? '🔊' : '🔇'}</button>
            <button className="icon-btn only-compact" onClick={(e) => { e.stopPropagation(); setPanel((o) => !o); }} title="Journal et tous les choix">📜</button>
            <div className="settings-wrap" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" onClick={() => setSettingsOpen((o) => !o)} title="Réglages">⚙</button>
              {settingsOpen && (
                <div className="settings-menu">
                  <label>Taille de l’interface
                    <select value={settings.uiScale} onChange={(e) => updateSettings({ uiScale: Number(e.target.value) })}>
                      {UI_SCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  {!touch && (
                    <label>Détail d’une carte survolée
                      <select value={settings.zoomDelay} onChange={(e) => updateSettings({ zoomDelay: Number(e.target.value) })}>
                        {ZOOM_DELAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="op-toggle"><input type="checkbox" checked={settings.confirmEnd} onChange={(e) => updateSettings({ confirmEnd: e.target.checked })} /> Confirmer la fin du tour s’il reste des actions</label>
                  <label className="op-toggle"><input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Sons</label>
                  <button className="op-link only-compact" onClick={() => { setSettingsOpen(false); setHelp(true); }}>Comment jouer ? (aide et mots-clés)</button>
                </div>
              )}
            </div>
            <button className="icon-btn" onClick={() => setGuide(view.you.deck)} title="Guide de ton deck (et de celui de ton adversaire)">📖</button>
            <button className="icon-btn hide-compact" onClick={() => setHelp(true)} title="Aide et mots-clés">?</button>
            <button className="op-btn op-btn-ghost btn-small" onClick={() => (over ? onLeave() : setLeaving(true))}>Menu</button>
          </div>
        </header>

        {(alert || !connected) && <div className="online-alert">{alert ?? 'Connexion perdue : reconnexion…'}</div>}
        <OpponentHand s={game} p={opp} />
        <PlayerZone s={game} p={opp} me={false} ui={ui} />
        <div className="op-center">
          {!view.opponentOnline && !over && <div className="practice">{oppName} n’est pas connecté : la partie reprendra à son retour.</div>}
          <BattlePanel s={game} human={seat} />
        </div>
        <PlayerZone s={game} p={seat} me ui={ui} />
        <Hand s={game} p={seat} ui={ui} />
        <ActionBar
          s={game}
          d={over ? null : d}
          human={seat}
          thinking={!over}
          aiName={oppName}
          targeting={targeting}
          preview={targetPreview}
          hasCardActions={Boolean(dv && dv.byCard.size)}
          buttons={dv && !special && !pickerOpen ? dv.buttons : []}
          recommended={null}
          onButton={(choice) => { sfx('click'); choose(choice); }}
          onCancelTargeting={() => setTargeting(null)}
          onEndTurn={requestEnd}
          touch={touch}
          onConfirmAttack={aimedOption ? () => { sfx('click'); choose(aimedOption.id); } : undefined}
        />
        <FxLayer game={game} human={seat} epoch={epoch} />
      </main>

      <aside className={panel ? 'side side-open' : 'side'}>
        <div className="side-head only-compact">
          <strong>Journal</strong>
          <button className="icon-btn" onClick={() => setPanel(false)} title="Fermer">✕</button>
        </div>
        <CardPreview s={game} preview={preview} />
        <div className="tabs">
          <button className={tab === 'journal' ? 'op-tab on' : 'op-tab'} onClick={() => setTab('journal')}>Journal</button>
          <button className={tab === 'choix' ? 'op-tab on' : 'op-tab'} onClick={() => setTab('choix')}>Tous les choix</button>
        </div>
        {tab === 'journal' && <GameLog s={game} human={seat} />}
        {tab === 'choix' && (
          <div className="tab-body">
            {myTurn && d ? <DecisionBox decision={d} focus={null} notes={{}} onChoose={choose} onClearFocus={() => undefined} /> : <p className="op-muted op-small">Pas de décision à prendre pour l’instant.</p>}
          </div>
        )}
        <p className="op-small op-muted online-note">Partie en ligne : le coach et les conseils sont désactivés, et tu ne vois que tes propres cartes.</p>
      </aside>

      {menu && dv && d && (menuActions.length > 0 || whyNot(game, d, menu.uid)) && (
        <ActionMenu s={game} uid={menu.uid} anchor={menu.rect} actions={menuActions} info={menuActions.length ? null : whyNot(game, d, menu.uid)} recommended={null}
          onAction={(a) => onAction(menu.uid, a)} onClose={() => setMenu(null)} sheet={compact} details={touch || compact} />
      )}
      {myTurn && special === 'mulligan' && <MulliganModal s={game} p={seat} onChoose={choose} onHover={onHover} />}
      {myTurn && special === 'trigger' && d && <TriggerModal s={game} d={d} onChoose={choose} recommended={null} />}
      {myTurn && special === 'declareCost' && d && <CostModal d={d} onChoose={choose} recommended={null} />}
      {myTurn && pickerOpen && d && dv && <PickerModal s={game} d={d} picks={dv.picks} buttons={dv.buttons} recommended={null} onChoose={choose} onHover={onHover} />}
      {confirmEnd && d && (
        <ConfirmEndModal remaining={remainingActions(game, d, false)} onConfirm={() => { setConfirmEnd(false); choose('end'); }} onCancel={() => setConfirmEnd(false)}
          onNeverAsk={() => { updateSettings({ confirmEnd: false }); setConfirmEnd(false); choose('end'); }} />
      )}
      {trashOf !== null && <TrashModal s={game} p={trashOf} onClose={() => setTrashOf(null)} onHover={onHover} />}
      {help && !intro && <HelpModal onClose={() => setHelp(false)} />}
      {guide && (
        <DeckGuideModal deckId={guide} onClose={() => { setGuide(null); cardZoom.close(); }} onHover={cardZoom.onHover}
          alt={guide === view.you.deck ? view.opponent?.deck : view.you.deck} altLabel={guide === view.you.deck ? 'Voir le deck de ton adversaire' : 'Voir ton deck'} onSwitch={setGuide} />
      )}
      {cardZoom.zoom && <CardZoom s={game} preview={cardZoom.zoom} onClose={cardZoom.close} />}
      {leaving && (
        <div className="modal" onClick={() => setLeaving(false)}>
          <div className="modal-box modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Quitter la partie ?</h3>
            <p>Tu peux revenir plus tard : la partie t’attend (Jouer → reprendre la partie en cours). Ou tu peux l’abandonner : {oppName} gagne.</p>
            <div className="modal-actions">
              <button className="op-btn op-btn-ghost" onClick={onLeave}>Revenir plus tard</button>
              <button className="op-btn op-btn-ghost danger" onClick={resign}>Abandonner</button>
              <button className="op-btn op-btn-primary" onClick={() => setLeaving(false)}>Continuer</button>
            </div>
          </div>
        </div>
      )}
      {intro && <Intro s={game} onDone={() => { setIntro(false); setEpoch((e) => e + 1); }} />}
      {over && celebrate && <Celebration won={won} onDone={() => setCelebrate(false)} sub={won ? 'Bien joué, capitaine.' : `${oppName} remporte la partie.`} />}
      {over && !celebrate && showEnd && (
        <div className="modal" onClick={() => setShowEnd(false)}>
          <div className="modal-box online-end" onClick={(e) => e.stopPropagation()}>
            <h2 className={won ? 'good' : 'danger'}>{won ? 'Victoire !' : 'Défaite'}</h2>
            <p>{game.winReason} · {game.turn} tours</p>
            <p className="op-small op-muted">La partie est rangée dans « Mes parties ». Le coach était désactivé pendant la partie ; depuis « Mes parties », tu peux la revoir et rejouer un moment contre l’IA.</p>
            <div className="modal-actions">
              <button className="op-btn op-btn-primary" onClick={onLeave}>Retour au menu</button>
              <button className="op-btn op-btn-ghost" onClick={() => setShowEnd(false)}>Voir le plateau</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
