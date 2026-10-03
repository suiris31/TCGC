import { useCallback, useEffect, useRef, useState } from 'react';
import { api, cardImage, cardName, formatEur, type Card, type Lang, type ScanResult } from '../api';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { t } from '../i18n';
import { useApp } from '../store';

const CARD_RATIO = 63 / 88; // largeur / hauteur d'une carte
// Si le meilleur résultat devance à peine une carte au visuel différent, on prévient
const LOW_MARGIN = 0.015;
const MAX_QTY = 99;

type Phase = 'aim' | 'analyzing' | 'result';

interface Added { card: Card; quantity: number; lang: Lang }

const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

type Candidate = ScanResult['candidates'][number];

// Parmi plusieurs versions possibles, la plus probable est la plus courante : version standard,
// puis la moins chère. C'est aussi le choix prudent pour l'estimation.
function mostCommon(entries: { c: Candidate; i: number }[]) {
  const sorted = [...entries].sort((a, b) =>
    Number(a.c.card.variant !== null) - Number(b.c.card.variant !== null)
    || (a.c.card.price.eur ?? Infinity) - (b.c.card.price.eur ?? Infinity));
  return sorted[0]?.i ?? 0;
}

// Après un scan : on ne départage que les versions au visuel identique au meilleur résultat
function defaultChoice(result: ScanResult) {
  const twins = result.candidates.map((c, i) => ({ c, i })).filter(({ c }) => c.sameArt);
  return twins.length < 2 ? 0 : mostCommon(twins);
}

// Après une saisie manuelle : parmi les versions du premier code trouvé
function defaultManualChoice(candidates: Candidate[]) {
  const number = candidates[0]?.card.number;
  return mostCommon(candidates.map((c, i) => ({ c, i })).filter(({ c }) => c.card.number === number));
}

export function Scanner({ active }: { active: boolean }) {
  // Langue des cartes scannées : français par défaut, la dernière choisie est retenue (voir store)
  const { cardChanged, toast, openCard, status, lang, setLang } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('aim');
  const [cameraError, setCameraError] = useState<string | null>(cameraSupported() ? null : 'insecure');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Added[]>([]);
  // Nombre d'exemplaires à ajouter pour la carte scannée (doublons...), remis à 1 à chaque scan
  const [quantity, setQuantity] = useState(1);
  // Texte en cours de saisie au clavier (peut être vide le temps de taper un nombre)
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  // Saisie manuelle du code (carte non reconnue, ou ajout sans scanner)
  const [manualQuery, setManualQuery] = useState('');
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // La caméra ne tourne que lorsque l'onglet est actif et qu'on vise
  useEffect(() => {
    if (!active || phase !== 'aim' || !cameraSupported()) {
      if (!active) stopCamera();
      return;
    }
    if (streamRef.current) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setCameraError(null);
    }).catch((err: Error) => {
      setCameraError(err.name === 'NotAllowedError' ? 'denied' : err.name === 'NotFoundError' ? 'none' : err.message);
    });
    return () => { cancelled = true; };
  }, [active, phase, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  // Quand on revient sur la visée, la vidéo doit retrouver le flux
  useEffect(() => {
    if (phase === 'aim' && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { /* lampe indisponible */ }
  };

  const analyze = async (blob: Blob, mode: 'guide' | 'photo') => {
    setPhase('analyzing');
    setError(null);
    setSelected(0);
    setShowAll(false);
    setQuantity(1);
    clearManual();
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    try {
      const res = await api.scan(blob, mode);
      setResult(res);
      setSelected(defaultChoice(res));
      setPhase('result');
    } catch (err) {
      setError((err as Error).message);
      setPhase('result');
      setResult(null);
    }
  };

  // Découpe l'image vidéo selon le cadre de visée affiché à l'écran
  const capture = () => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (!video || !guide || !video.videoWidth) return;
    const vb = video.getBoundingClientRect();
    const gb = guide.getBoundingClientRect();
    const scale = Math.max(vb.width / video.videoWidth, vb.height / video.videoHeight); // object-fit: cover
    const offX = (vb.width - video.videoWidth * scale) / 2;
    const offY = (vb.height - video.videoHeight * scale) / 2;
    const sx = (gb.left - vb.left - offX) / scale;
    const sy = (gb.top - vb.top - offY) / scale;
    const sw = gb.width / scale;
    const sh = gb.height / scale;
    const canvas = document.createElement('canvas');
    canvas.height = Math.min(900, Math.round(sh));
    canvas.width = Math.round(canvas.height * (sw / sh));
    canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && analyze(blob, 'guide'), 'image/jpeg', 0.92);
  };

  // Photo prise avec l'appli appareil photo (ou choisie dans la galerie) : on la réduit avant l'envoi
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && analyze(blob, 'photo'), 'image/jpeg', 0.92);
    } catch {
      analyze(file, 'photo');
    }
  };

  const reset = () => {
    setPhase('aim');
    setResult(null);
    setError(null);
    clearManual();
  };

  function clearManual() {
    setManualQuery('');
    setManualFor(null);
    setManualError(null);
  }

  // Ajout sans scanner : on ouvre directement le panneau de saisie du code
  const openManual = () => {
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setResult(null);
    setError(null);
    clearManual();
    setQuantity(1);
    setPhase('result');
  };

  const searchManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = manualQuery.trim();
    if (!q) return;
    setSearching(true);
    setManualError(null);
    try {
      const { cards } = await api.cards({ q, limit: 40 });
      if (!cards.length) {
        setManualError(t('scan.noMatch', { q }));
        return;
      }
      const candidates = cards.map((card) => ({ card, score: 0, sameArt: false }));
      setResult({ ms: 0, margin: 1, candidates });
      setError(null);
      setSelected(defaultManualChoice(candidates));
      setShowAll(true);
      setManualFor(q);
      (document.activeElement as HTMLElement | null)?.blur(); // referme le clavier
    } catch (err) {
      setManualError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const addCard = async (card: Card) => {
    const res = await api.add(card.id, quantity, lang);
    cardChanged(res.card, res.totals);
    setAdded((list) => [{ card: res.card, quantity, lang }, ...list]);
    const what = t('scan.added', { n: quantity, name: cardName(card, lang), lang: lang.toUpperCase() });
    const owned = res.card.ownedByLang[lang];
    toast(owned > quantity ? t('scan.addedTotal', { what, n: owned }) : what);
    reset();
  };

  const undo = async (entry: Added) => {
    const res = await api.add(entry.card.id, -entry.quantity, entry.lang);
    cardChanged(res.card, res.totals);
    setAdded((list) => list.filter((a) => a !== entry));
    toast(t('scan.undone'));
  };

  const candidates = result?.candidates ?? [];
  const best = candidates[selected];
  // Plusieurs versions partagent exactement ce visuel : seul l'utilisateur peut trancher
  const twins = candidates.filter((c) => c.sameArt);
  const unsure = (result?.margin ?? 1) < LOW_MARGIN;
  const sessionCards = added.reduce((sum, a) => sum + a.quantity, 0);
  const sessionValue = added.reduce((sum, a) => sum + (a.card.price.eur ?? 0) * a.quantity, 0);
  const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.round(n) || 1));
  const indexReady = (status?.scan.indexed ?? 0) > 0;
  const useCamera = !cameraError;

  return (
    <div className="scanner">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

      <div className="scanner-view">
        {useCamera ? (
          <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
        ) : (
          <div className="scanner-fallback">
            <Icon name="camera" size={40} />
            {cameraError === 'insecure' ? (
              <>
                <p>{t('scan.insecure')}</p>
                <p className="muted small">{t('scan.insecureHelp')}</p>
              </>
            ) : cameraError === 'denied' ? (
              <p>{t('scan.denied')}</p>
            ) : cameraError === 'none' ? (
              <p>{t('scan.noCamera')}</p>
            ) : (
              <p>{t('scan.cameraError', { error: cameraError })}</p>
            )}
            <p className="muted small">{t('scan.tip')}</p>
          </div>
        )}

        {useCamera && phase === 'aim' && (
          <div className="scanner-overlay">
            <div ref={guideRef} className="scanner-guide" style={{ aspectRatio: String(CARD_RATIO) }}>
              <span /><span /><span /><span />
            </div>
            <p className="scanner-hint">{t('scan.hint')}</p>
          </div>
        )}

        {phase === 'aim' && (
          <div className="scanner-lang">
            <LangSwitch value={lang} onChange={setLang} compact label={t('scan.langAria')} />
          </div>
        )}

        {phase !== 'aim' && preview && <img className="scanner-preview" src={preview} alt={t('scan.previewAlt')} />}
        {phase === 'analyzing' && <div className="scanner-busy"><div className="spinner" /><span>{t('scan.analyzing')}</span></div>}
      </div>

      {added.length > 0 && phase === 'aim' && (
        <div className="scan-session">
          <div>
            <strong>{sessionCards}</strong> {t('scan.sessionCards', { n: sessionCards })} · <strong>{formatEur(sessionValue)}</strong>
          </div>
          <button className="link" onClick={() => undo(added[0])}>
            {t('scan.undo', { what: `${added[0].quantity > 1 ? `${added[0].quantity} × ` : ''}${cardName(added[0].card, added[0].lang)}` })}
          </button>
        </div>
      )}

      {phase === 'aim' && (
        <div className="scanner-controls">
          {useCamera ? (
            <>
              <button className="round-btn" onClick={() => fileRef.current?.click()} aria-label={t('scan.takePhoto')}>
                <Icon name="image" />
              </button>
              <button className="shutter" onClick={capture} disabled={!indexReady} aria-label={t('scan.shutter')} />
              <button className={torch ? 'round-btn round-btn-on' : 'round-btn'} onClick={toggleTorch}
                disabled={torch === null} aria-label={t('scan.torch')}>
                <Icon name="flash" />
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()} disabled={!indexReady}>
              <Icon name="camera" /> {t('scan.takePhoto')}
            </button>
          )}
          <button className="link scanner-manual" onClick={openManual}>{t('scan.manualLink')}</button>
          {!indexReady && (
            <p className="scanner-note">
              {t('scan.preparing', { indexed: status?.scan.indexed ?? 0, total: status?.scan.total ?? '…' })}
            </p>
          )}
        </div>
      )}

      {phase === 'result' && (
        <div className="scan-result">
          {!best ? (
            <div className="scan-error">
              {error ? <p>{error}</p> : <p>{t('scan.manualIntro')}</p>}
              <button className="btn btn-ghost" onClick={reset}>{t('scan.backToScan')}</button>
            </div>
          ) : (
            <>
              <div className="scan-best">
                <img src={cardImage(best.card, lang)} alt={best.card.fullName} onClick={() => openCard(best.card.id, lang)} />
                <div className="scan-best-info">
                  <div className="scan-best-name">{cardName(best.card, lang)}</div>
                  <div className="detail-sub">
                    <span className="chip chip-code">{best.card.number}</span>
                    {best.card.variant && <span className="chip chip-variant">{best.card.variant}</span>}
                  </div>
                  <div className="muted small">{best.card.setName}</div>
                  <div className="scan-best-price">{formatEur(best.card.price.eur)}</div>
                  {best.card.owned > 0 && (
                    <div className="muted small">
                      {t('scan.alreadyOwned', {
                        list: (['fr', 'en'] as const).filter((l) => best.card.ownedByLang[l] > 0)
                          .map((l) => `×${best.card.ownedByLang[l]} ${l.toUpperCase()}`).join(', '),
                      })}
                    </div>
                  )}
                  {candidates[selected]?.sameArt && unsure && (
                    <div className="warn small">{t('scan.unsure')}</div>
                  )}
                </div>
              </div>

              <div className="qty-row">
                <span>{t('lang.label')}</span>
                <LangSwitch value={lang} onChange={setLang} label={t('scan.cardLang')} />
              </div>

              <div className="qty-row">
                <span>{t('scan.copies')}</span>
                <div className="stepper">
                  <button onClick={() => setQuantity(clampQty(quantity - 1))} disabled={quantity <= 1} aria-label={t('scan.lessAria')}>
                    <Icon name="minus" size={18} />
                  </button>
                  <input className="stepper-input" type="number" inputMode="numeric" min={1} max={MAX_QTY}
                    value={quantityDraft ?? quantity} aria-label={t('scan.qtyAria')}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      setQuantityDraft(e.target.value);
                      if (e.target.value !== '') setQuantity(clampQty(Number(e.target.value)));
                    }}
                    onBlur={() => setQuantityDraft(null)} />
                  <button onClick={() => setQuantity(clampQty(quantity + 1))} disabled={quantity >= MAX_QTY} aria-label={t('scan.moreAria')}>
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              </div>

              <div className="scan-actions">
                <button className="btn btn-ghost" onClick={reset}>{t('scan.rescan')}</button>
                <button className="btn btn-primary" onClick={() => addCard(best.card)}>
                  <Icon name="plus" size={18} /> {quantity > 1 ? t('scan.addN', { n: quantity }) : t('scan.add')}
                </button>
              </div>

              {twins.length > 1 && (
                <div className="scan-twins">
                  <div className="warn small">
                    {t('scan.twins', { n: twins.length })}
                  </div>
                  <div className="scan-twins-list">
                    {twins.map((c) => {
                      const i = candidates.indexOf(c);
                      return (
                        <button key={c.card.id} className={i === selected ? 'twin twin-on' : 'twin'} onClick={() => setSelected(i)}>
                          <span>{c.card.variant ?? t('common.standard')}</span>
                          <span className="muted">{c.card.setCode}</span>
                          <strong>{formatEur(c.card.price.eur)}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="scan-alts-title">
                <span>
                  {manualFor
                    ? t('scan.results', { n: candidates.length, q: manualFor })
                    : showAll ? t('scan.allSuggestions') : t('scan.notRight')}
                </span>
                {candidates.length > 6 && (
                  <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? t('scan.less') : t('scan.seeAll')}</button>
                )}
              </div>
              <div className={showAll ? 'scan-alts scan-alts-all' : 'scan-alts'}>
                {candidates.slice(0, showAll ? undefined : 6).map((c, i) => (
                  <button key={c.card.id} className={i === selected ? 'scan-alt scan-alt-on' : 'scan-alt'} onClick={() => setSelected(i)}>
                    <img src={cardImage(c.card, lang)} alt={c.card.fullName} loading="lazy" />
                    <span className="scan-alt-label">{c.card.variant ?? c.card.number}</span>
                    <span className="scan-alt-set">{c.card.setCode} · {formatEur(c.card.price.eur)}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <form className="manual" onSubmit={searchManual}>
            <label htmlFor="manual-code" className="small muted">
              {best ? t('scan.stillNot') : ''}{t('scan.manualLabel')}
            </label>
            <div className="manual-row">
              <input id="manual-code" className="manual-input" value={manualQuery} placeholder="OP14-018"
                onChange={(e) => setManualQuery(e.target.value)} autoFocus={!best && !error}
                autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
              <button className="btn btn-ghost" type="submit" disabled={searching || !manualQuery.trim()}>
                {searching ? '…' : t('scan.search')}
              </button>
            </div>
            {manualError && <p className="warn small">{manualError}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
