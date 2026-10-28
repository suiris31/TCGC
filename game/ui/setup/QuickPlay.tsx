// Écran « Partie rapide » contre l'IA (tâche R3.2, #play/rapide), à la place de l'ancien écran de départ :
// - en haut, le résumé de la partie : ton deck contre l'adversaire (leurs Leaders), le niveau de l'IA, qui commence ;
// - toucher un deck ouvre le choix des decks (DeckPicker, en écran, lié au Retour) puis revient ici ;
// - niveau de l'IA et premier joueur, puis le bilan par confrontation, replié ;
// - « Lancer la partie » toujours visible, dans la barre du bas (au-dessus de la barre d'onglets de TCGC).
// Les choix sont gardés d'une visite à l'autre (saveQuickChoice, config.ts) : de l'accueil, « Partie rapide » puis
// « Lancer la partie » suffisent.
import { useEffect, useState } from 'react';
import { rlDeckModels, rlModelAvailable } from '../../ai/client.ts';
import { LEVELS, type Level } from '../../ai/search.ts';
import { CARDS } from '../../engine/cards/index.ts';
import { DECKS } from '../../engine/decks.ts';
import { def } from '../../engine/rules.ts';
import { recordText } from '../Coach.tsx';
import { GUIDES } from '../deckGuides.ts';
import { cardImage } from '../images.ts';
import { Button, Screen } from '../kit/index.ts';
import { deckInfo, deckLabel, playable } from '../myDecks.ts';
import { useLayer } from '../routes.ts';
import { RANDOM_DECK, recordKey, type Config, type First, type Records } from './config.ts';
import { DeckPicker } from './DeckPicker.tsx';
import { COLOR } from './DeckTile.tsx';

const FIRST: [First, string, string][] = [['random', 'Au hasard', 'Premier joueur tiré au sort'], ['me', 'Moi', 'Tu commences'], ['ai', 'L’IA', 'L’IA commence']];

// deck du registre, ou un de mes decks jouable (un deck supprimé ou rendu incomplet dans l'éditeur ne l'est plus)
const usable = (id: string) => Boolean(DECKS[id]) || Boolean(deckInfo(id) && playable(deckInfo(id)!));

export function QuickPlay({ config, records, onChange, onStart, onBack, onHelp, onSettings, onGuide, onHistory, onBuilder }: {
  config: Config;
  records: Records;
  onChange: (c: Config) => void;
  onStart: () => void;
  onBack: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onGuide: (id: string) => void;
  onHistory: () => void;
  onBuilder: () => void;
}) {
  // choix d'un deck en cours : le mien ou celui de l'IA (le Retour du navigateur revient à l'écran)
  const [picking, setPicking] = useState<'me' | 'ai' | null>(null);
  useLayer(picking !== null, () => setPicking(null));
  // Échap aussi, sauf quand une fenêtre est ouverte dessus (guide d'un deck, aide, réglages) : Échap la ferme, elle
  // seule. Lu avant les autres écouteurs (capture), tant que la fenêtre est encore affichée
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.opc .modal, .opc [role="dialog"], .opc [role="alertdialog"]')) return;
      setPicking(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picking]);

  const random = config.aiDeck === RANDOM_DECK;
  const myOk = usable(config.myDeck);
  const aiOk = random || usable(config.aiDeck);
  const ready = myOk && aiOk;
  // niveau « IA entraînée » : seulement si un modèle compatible est installé (web/public/rl-model/, voir rl/README.md) ;
  // sinon un réglage resté sur ce niveau (choix gardé, modèle retiré ou d'un ancien encodage) redevient « Débutant »,
  // pour ne pas compter sous ce nom des parties jouées par l'IA simple
  const [rlReady, setRlReady] = useState<boolean | null>(null);
  const [deckAi, setDeckAi] = useState<Set<string>>(new Set());
  useEffect(() => { rlModelAvailable().then(setRlReady); rlDeckModels().then(setDeckAi); }, []);
  useEffect(() => {
    if (rlReady === false && config.level === 4) onChange({ ...config, level: 1 });
  }, [rlReady, config, onChange]);

  const rec = (aiDeck: string) => {
    const r = records[recordKey({ ...config, aiDeck })];
    return r && r.wins + r.losses ? `${r.wins}V ${r.losses}D` : undefined;
  };

  if (picking) {
    const mine = picking === 'me';
    const pick = (id: string) => {
      onChange(mine ? { ...config, myDeck: id } : { ...config, aiDeck: id });
      setPicking(null);
    };
    return (
      <Screen className="op-quick" data-ui="quick.picker" title={mine ? 'Ton deck' : 'Ton adversaire'}
        subtitle={mine ? 'Touche le deck avec lequel tu joues' : 'Touche le deck que joue l’IA'}
        back={{ label: 'Partie rapide', onBack: () => setPicking(null), 'data-ui': 'quick.picker-back' }}>
        <div className="op-quick-picker">
          {mine
            ? <DeckPicker selected={config.myDeck} onPick={pick} onGuide={onGuide} label="Choisir" />
            : <DeckPicker selected={config.aiDeck} note={rec} onPick={pick} onGuide={onGuide} label="Choisir"
              onRandom={() => { onChange({ ...config, aiDeck: RANDOM_DECK }); setPicking(null); }} />}
        </div>
      </Screen>
    );
  }

  const played = Object.entries(records)
    .map(([key, line]) => {
      const [myDeck, aiDeck, level] = key.split('|');
      return { key, line, myDeck, aiDeck, level: Number(level) as Level };
    })
    .filter((r) => deckInfo(r.myDeck) && deckInfo(r.aiDeck) && LEVELS[r.level])
    .sort((a, b) => (b.line.wins + b.line.losses) - (a.line.wins + a.line.losses));
  const firstText = FIRST.find(([f]) => f === config.first)?.[2] ?? '';

  return (
    <Screen
      className="op-quick"
      data-ui="quick"
      title="Partie rapide"
      subtitle="Contre l’IA, le coach à tes côtés"
      back={{ label: 'Accueil', onBack, 'data-ui': 'quick.back' }}
      actions={[
        { id: 'help', label: 'Comment jouer ?', icon: 'help', onClick: onHelp, 'data-ui': 'quick.help' },
        { id: 'settings', label: 'Réglages', icon: 'settings', onClick: onSettings, 'data-ui': 'quick.settings' },
        { id: 'decks', label: 'Mes decks', icon: 'deck', onClick: onBuilder, 'data-ui': 'quick.decks' },
        { id: 'history', label: 'Mes parties', icon: 'history', onClick: onHistory, 'data-ui': 'quick.history' },
      ]}
      footer={(
        <>
          <span className={`op-quick-note${ready ? '' : ' is-error'}`} data-ui="quick.note">
            {!ready ? 'Choisis deux decks jouables (un deck perso incomplet se termine dans « Mes decks »).'
              : random ? 'Ton adversaire sera tiré au sort au lancement.'
                : <>Ton bilan ici : {recordText(records[recordKey(config)])}</>}
          </span>
          <Button variant="primary" size="big" data-ui="home.start" onClick={onStart} disabled={!ready}>Lancer la partie</Button>
        </>
      )}
    >
      <div className="op-quick-body">
        <section className="op-quick-match" aria-label="Ta partie">
          <div className="op-quick-sides">
            <DeckSide who="Ton deck" id={config.myDeck} ok={myOk} onChange={() => setPicking('me')} onGuide={onGuide} data-ui="quick.my-deck" />
            <span className="op-quick-vs" aria-hidden="true">contre</span>
            <DeckSide who="Ton adversaire" id={config.aiDeck} ok={aiOk} onChange={() => setPicking('ai')} onGuide={onGuide} data-ui="quick.ai-deck" />
          </div>
          <p className="op-quick-summary" data-ui="quick.summary">
            <span>IA {LEVELS[config.level].name}</span><span aria-hidden="true"> · </span><span>{firstText}</span>
          </p>
        </section>

        <section className="op-quick-choice">
          <h2 id="op-quick-level">Niveau de l’IA</h2>
          <div className={`op-segmented${rlReady ? ' is-4' : ''}`} role="group" aria-labelledby="op-quick-level">
            {([1, 2, 3, ...(rlReady ? [4] : [])] as Level[]).map((level) => (
              <button key={level} type="button" className={config.level === level ? 'seg on' : 'seg'} aria-pressed={config.level === level}
                data-ui={`home.level-${level}`} onClick={() => onChange({ ...config, level })}>{LEVELS[level].name}</button>
            ))}
          </div>
          <p className="op-muted op-small">
            {config.level === 1 ? 'Joue le plan de son deck, sans calculer à l’avance.'
              : config.level === 2 ? 'Simule la suite de la partie avant chaque choix.'
                : config.level === 3 ? 'Simule beaucoup plus de parties avant chaque choix (jusqu’à 2 secondes).'
                  : `Modèle entraîné par apprentissage par renforcement : ses choix viennent de l’expérience de ses parties, sans règle écrite à la main.${
                    deckAi.has(config.aiDeck) ? ' Avec ce deck, c’est une IA spécialisée : entraînée en ne jouant que lui.'
                      : random && deckAi.size ? ' IA spécialisée quand le deck tiré au sort en a une.' : ''}`}
          </p>
        </section>

        <section className="op-quick-choice">
          <h2 id="op-quick-first">Qui commence ?</h2>
          <div className="op-segmented" role="group" aria-labelledby="op-quick-first">
            {FIRST.map(([value, label]) => (
              <button key={value} type="button" className={config.first === value ? 'seg on' : 'seg'} aria-pressed={config.first === value}
                data-ui={`home.first-${value}`} onClick={() => onChange({ ...config, first: value })}>{label}</button>
            ))}
          </div>
        </section>

        {played.length > 0 && (
          <details className="op-quick-record" data-ui="quick.record">
            <summary>
              <span>Ton bilan</span>
              <span className="op-muted op-small">
                {played.length} confrontation{played.length > 1 ? 's' : ''} · parties rapides seulement
              </span>
            </summary>
            <table className="op-stats">
              <thead><tr><th>Toi</th><th>IA</th><th>Niveau</th><th>Victoires</th></tr></thead>
              <tbody>
                {played.map((r) => (
                  <tr key={r.key}>
                    <td>{deckLabel(r.myDeck)}</td>
                    <td>{deckLabel(r.aiDeck)}</td>
                    <td>{LEVELS[r.level].name}</td>
                    <td>{r.line.wins}/{r.line.wins + r.line.losses} ({Math.round((r.line.wins / Math.max(1, r.line.wins + r.line.losses)) * 100)} %)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </Screen>
  );
}

// Un côté du résumé : le Leader du deck en grand, son nom, et « Changer » ; à part, le guide du deck
function DeckSide({ who, id, ok, onChange, onGuide, 'data-ui': dataUi }: {
  who: string;
  id: string;
  ok: boolean;
  onChange: () => void;
  onGuide: (id: string) => void;
  'data-ui': string;
}) {
  const deck = id === RANDOM_DECK ? undefined : deckInfo(id);
  const known = deck && deck.leader in CARDS;
  const leader = known ? def(deck.leader) : undefined;
  const colors = leader ? leader.colors.map((c) => COLOR[c] ?? '#666') : [];
  const style = colors.length ? { ['--c1' as string]: colors[0], ['--c2' as string]: colors[1] ?? colors[0] } : undefined;
  const detail = id === RANDOM_DECK ? 'Un deck du méta ou pour débutant, tiré au sort'
    : !ok ? (known ? 'Deck à terminer dans « Mes decks »' : 'Ce deck n’existe plus')
      : DECKS[id] ? GUIDES[id]?.styles.slice(0, 2).join(' · ') ?? id : `Deck perso · ${leader?.name ?? ''}`;
  return (
    <div className={`op-quick-side${ok ? '' : ' is-missing'}${id === RANDOM_DECK ? ' is-random' : ''}`} style={style}>
      <button type="button" className="op-quick-side-main" data-ui={dataUi} onClick={onChange}
        aria-label={`${who} : ${id === RANDOM_DECK ? 'aléatoire' : deck?.name ?? 'à choisir'}. Changer`}>
        <span className="op-quick-side-art" aria-hidden="true">
          {id === RANDOM_DECK ? <span className="op-quick-dice">🎲</span>
            : leader ? <img src={cardImage(leader)} alt="" /> : <span className="op-quick-dice">?</span>}
        </span>
        <span className="op-quick-side-who">{who}</span>
        <span className="op-quick-side-name">{id === RANDOM_DECK ? 'Aléatoire' : ok && deck ? deck.name : 'À choisir'}</span>
        {detail && <span className="op-quick-side-detail">{detail}</span>}
        <span className="op-quick-side-change">Changer</span>
      </button>
      {ok && deck && (
        <button type="button" className="op-link op-quick-side-guide" data-ui={`${dataUi}-guide`} onClick={() => onGuide(id)}
          aria-label={`Guide du deck ${deck.name}`}>📖 Guide</button>
      )}
    </div>
  );
}
