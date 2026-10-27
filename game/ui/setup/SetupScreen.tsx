// Écran de départ de « Jouer » : accès à l'Aventure et au jeu en ligne, puis la partie rapide contre l'IA (decks,
// niveau, qui commence) et le bilan par confrontation
import { useEffect, useState } from 'react';
import { rlDeckModels, rlModelAvailable } from '../../ai/client.ts';
import { LEVELS, type Level } from '../../ai/search.ts';
import { DECKS } from '../../engine/decks.ts';
import { recordText } from '../Coach.tsx';
import { HelpModal } from '../Modals.tsx';
import { deckInfo, deckLabel, playable } from '../myDecks.ts';
import { RANDOM_DECK, recordKey, type Config, type Records } from './config.ts';
import { DeckPicker } from './DeckPicker.tsx';

// Accès aux parties en ligne depuis l'écran de départ : ouvrir le salon, reprendre une partie ou une salle en cours
export interface OnlineEntry {
  onOpen: () => void;
  resume?: { label: string; onResume: () => void };
}

// Accès au mode Aventure depuis l'écran de départ
export interface AdventureEntry { onOpen: () => void }

export function SetupScreen({ notice, online, adventure, config, records, onChange, onStart, onHelp, help, closeHelp, onSettings, onGuide, onHistory, onBuilder }: {
  notice?: string;
  online?: OnlineEntry;
  adventure?: AdventureEntry;
  config: Config;
  records: Records;
  onChange: (c: Config) => void;
  onStart: () => void;
  onHelp: () => void;
  help: boolean;
  closeHelp: () => void;
  onSettings: () => void;
  onGuide: (id: string) => void;
  onHistory: () => void;
  onBuilder: () => void;
}) {
  // decks choisis : du registre, ou mes decks jouables (un deck supprimé ou rendu incomplet dans l'éditeur ne l'est plus)
  const usable = (id: string) => Boolean(DECKS[id]) || Boolean(deckInfo(id) && playable(deckInfo(id)!));
  const random = config.aiDeck === RANDOM_DECK;
  const ready = usable(config.myDeck) && (random || usable(config.aiDeck));
  // niveau « IA entraînée » : seulement si un modèle compatible est installé (web/public/rl-model/, voir rl/README.md) ;
  // sinon un réglage resté sur ce niveau (partie reprise, modèle retiré ou d'un ancien encodage) redevient « Débutant »,
  // pour ne pas compter sous ce nom des parties jouées par l'IA simple
  const [rlReady, setRlReady] = useState<boolean | null>(null);
  const [deckAi, setDeckAi] = useState<Set<string>>(new Set());
  useEffect(() => { rlModelAvailable().then(setRlReady); rlDeckModels().then(setDeckAi); }, []);
  useEffect(() => {
    if (rlReady === false && config.level === 4) onChange({ ...config, level: 1 });
  }, [rlReady, config, onChange]);
  const played = Object.entries(records)
    .map(([key, line]) => {
      const [myDeck, aiDeck, level] = key.split('|');
      return { key, line, myDeck, aiDeck, level: Number(level) as Level };
    })
    .filter((r) => deckInfo(r.myDeck) && deckInfo(r.aiDeck) && LEVELS[r.level])
    .sort((a, b) => (b.line.wins + b.line.losses) - (a.line.wins + a.line.losses));
  const rec = (aiDeck: string) => {
    const r = records[recordKey({ ...config, aiDeck })];
    return r && r.wins + r.losses ? `${r.wins}V ${r.losses}D` : undefined;
  };
  return (
    <div className="setup" data-ui="home">
      <header className="setup-head">
        <h1>☠ OP Coach</h1>
        <p className="op-muted">Entraîne-toi contre l’IA, et laisse le coach t’aider à progresser.</p>
        <div className="setup-links">
          <button className="op-link" data-ui="home.history" onClick={onHistory}>📈 Mes parties</button>
          <button className="op-link" data-ui="home.decks" onClick={onBuilder}>🃏 Mes decks</button>
          <button className="op-link" data-ui="home.help" onClick={onHelp}>Comment jouer ?</button>
          <a className="op-link" href="#legal" title="Projet de fan non officiel : mentions légales et confidentialité">À propos</a>
          <button className="op-link" data-ui="home.settings" onClick={onSettings}>⚙ Réglages</button>
        </div>
        {notice && <p className="setup-notice">{notice}</p>}
      </header>
      {adventure && (
        <section className="online-entry op-adv-entry">
          <div>
            <h2>🗺️ Aventure</h2>
            <p className="op-muted">Prends la mer à East Blue avec un deck de départ, affronte les adversaires de l’histoire et gagne des boosters pour améliorer ton deck.</p>
          </div>
          <button className="op-btn op-btn-primary" data-ui="home.adventure" onClick={adventure.onOpen}>Partir à l’aventure</button>
        </section>
      )}
      {online && (
        <section className="online-entry">
          <div>
            <h2>🌐 Jouer avec un ami</h2>
            {online.resume
              ? <p className="op-muted">{online.resume.label}</p>
              : <p className="op-muted">Une partie en ligne contre un ami : crée une salle et envoie-lui son code, ou rejoins la sienne.</p>}
          </div>
          {online.resume
            ? <button className="op-btn op-btn-primary" data-ui="home.online-resume" onClick={online.resume.onResume}>Reprendre</button>
            : <button className="op-btn op-btn-primary" data-ui="home.online" onClick={online.onOpen}>Jouer en ligne</button>}
        </section>
      )}
      <section className="setup-section">
        <h2>Ton deck</h2>
        <DeckPicker selected={config.myDeck} onPick={(id) => onChange({ ...config, myDeck: id })} onGuide={onGuide} onBuilder={onBuilder} />
      </section>
      <section className="setup-section">
        <h2>Ton adversaire</h2>
        <DeckPicker selected={config.aiDeck} note={rec} onPick={(id) => onChange({ ...config, aiDeck: id })} onGuide={onGuide}
          onRandom={() => onChange({ ...config, aiDeck: RANDOM_DECK })} />
      </section>
      <section className="setup-row">
        <div>
          <h2>Niveau de l’IA</h2>
          <div className="op-segmented">
            {([1, 2, 3, ...(rlReady ? [4] : [])] as Level[]).map((level) => (
              <button key={level} className={config.level === level ? 'seg on' : 'seg'} data-ui={`home.level-${level}`} onClick={() => onChange({ ...config, level })}>{LEVELS[level].name}</button>
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
        </div>
        <div>
          <h2>Qui commence ?</h2>
          <div className="op-segmented">
            {([['random', 'Au hasard'], ['me', 'Moi'], ['ai', 'L’IA']] as const).map(([value, label]) => (
              <button key={value} className={config.first === value ? 'seg on' : 'seg'} data-ui={`home.first-${value}`} onClick={() => onChange({ ...config, first: value })}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <div className="setup-go">
        {ready
          ? <span className="op-muted op-small">{random ? 'Ton adversaire sera tiré au sort au lancement de la partie.' : <>Ton bilan dans cette confrontation : {recordText(records[recordKey(config)])}</>}</span>
          : <span className="danger op-small">Choisis deux decks jouables (un deck perso incomplet se termine dans l’éditeur).</span>}
        <button className="op-btn op-btn-primary btn-big" data-ui="home.start" onClick={onStart} disabled={!ready}>Lancer la partie</button>
      </div>
      {played.length > 0 && (
        <section className="setup-section">
          <h2>Ton bilan</h2>
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
        </section>
      )}
      {help && <HelpModal onClose={closeHelp} />}
    </div>
  );
}
