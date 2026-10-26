// Page « kit » de l'atelier (tâche R1.2) : tous les composants de base et leurs états. #play/atelier/kit
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AsyncState, Button, Dialog, Icon, IconButton, ICON_LABELS, ICON_NAMES, Screen, type ButtonVariant, type DialogHistory, type ScreenAction } from '../kit/index.ts';

export const title = 'Kit (composants de base)';

export function render() {
  return <Kit />;
}

const VARIANTS: { variant: ButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Principal' },
  { variant: 'secondary', label: 'Secondaire' },
  { variant: 'quiet', label: 'Discret' },
  { variant: 'danger', label: 'Danger' },
];

function Section({ name, children, note }: { name: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="op-kit-demo-section">
      <h2>{name}</h2>
      {note && <p className="op-muted op-small">{note}</p>}
      {children}
    </section>
  );
}

function Kit() {
  const [log, setLog] = useState<string[]>([]);
  const say = (line: string) => setLog((before) => [line, ...before].slice(0, 6));
  return (
    <div className="op-atelier-demo op-kit-demo" data-ui="kit">
      <p className="op-muted op-small">
        Les composants de game/ui/kit, pour les écrans et les fenêtres de la refonte. Rien n’est enregistré : chaque
        bouton note seulement ce qu’il a fait dans le journal ci-dessous.
      </p>
      <div className="op-kit-demo-log" aria-live="polite" data-ui="kit.log">
        <strong>Journal :</strong> {log.length ? log.join(' · ') : 'rien pour l’instant'}
      </div>
      <Buttons say={say} />
      <IconButtons say={say} />
      <Icons />
      <Async />
      <ScreenDemo say={say} />
      <Dialogs say={say} />
    </div>
  );
}

function Buttons({ say }: { say: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 1500);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <Section name="Boutons" note="Quatre genres, toujours au moins 44 px. « Occupé » montre une roue et ne réagit plus.">
      <div className="op-kit-demo-row">
        {VARIANTS.map((v) => <Button key={v.variant} variant={v.variant} onClick={() => say(v.label)}>{v.label}</Button>)}
      </div>
      <div className="op-kit-demo-row">
        {VARIANTS.map((v) => <Button key={v.variant} variant={v.variant} disabled>{v.label} (désactivé)</Button>)}
      </div>
      <div className="op-kit-demo-row">
        <Button variant="primary" size="big" icon="attack" onClick={() => say('Combattre')}>Combattre</Button>
        <Button icon="deck" onClick={() => say('Changer de deck')}>Changer de deck</Button>
        <Button variant="primary" busy={busy} onClick={() => setBusy(true)}>{busy ? 'Envoi…' : 'Occupé 1,5 s'}</Button>
      </div>
      <div className="op-kit-demo-narrow">
        <Button variant="primary" wide icon="check" onClick={() => say('Pleine largeur')}>Pleine largeur</Button>
      </div>
    </Section>
  );
}

function IconButtons({ say }: { say: (s: string) => void }) {
  const [sound, setSound] = useState(true);
  return (
    <Section name="Boutons-icônes" note="Le libellé est obligatoire : il est lu par les lecteurs d’écran et apparaît au survol.">
      <div className="op-kit-demo-row">
        <IconButton icon="settings" label="Réglages" onClick={() => say('Réglages')} />
        <IconButton icon="help" label="Aide" onClick={() => say('Aide')} />
        <IconButton icon="log" label="Journal" variant="quiet" onClick={() => say('Journal')} />
        <IconButton icon={sound ? 'sound-on' : 'sound-off'} label="Son" pressed={sound} onClick={() => { setSound(!sound); say(sound ? 'Son coupé' : 'Son activé'); }} />
        <IconButton icon="history" label="Mes parties (3 nouvelles)" badge={3} onClick={() => say('Mes parties')} />
        <IconButton icon="undo" label="Annuler" variant="danger" onClick={() => say('Annuler')} />
        <IconButton icon="close" label="Fermer" variant="primary" onClick={() => say('Fermer')} />
        <IconButton icon="settings" label="Réglages (désactivé)" disabled />
      </div>
    </Section>
  );
}

function Icons() {
  return (
    <Section name={`Icônes (${ICON_NAMES.length})`} note="Dessinées pour le jeu, à la couleur du texte. Interface, puis états d’une carte.">
      <ul className="op-kit-demo-icons">
        {ICON_NAMES.map((name) => (
          <li key={name}>
            <Icon name={name} size="1.8rem" />
            <span className="op-small">{ICON_LABELS[name]}</span>
            <code className="op-kit-demo-code">{name}</code>
          </li>
        ))}
      </ul>
      <p className="op-small op-kit-demo-inline">
        Dans un texte : <Icon name="rested" /> épuisée, <Icon name="blocker" /> bloqueur, <Icon name="frozen" /> gelée,
        <span className="good"> <Icon name="power-up" /> +2000</span>, <span className="danger"><Icon name="power-down" /> −1000</span>.
      </p>
    </Section>
  );
}

type AsyncMode = 'loading' | 'error' | 'empty' | 'ready';

function Async() {
  const [mode, setMode] = useState<AsyncMode>('loading');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // « Réessayer » : un chargement d'une seconde, puis le contenu
  const retry = () => {
    setMode('loading');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMode('ready'), 1000);
  };
  const MODES: { mode: AsyncMode; label: string }[] = [
    { mode: 'loading', label: 'Chargement' }, { mode: 'error', label: 'Erreur' }, { mode: 'empty', label: 'Vide' }, { mode: 'ready', label: 'Contenu' },
  ];
  return (
    <Section name="Chargement, erreur, vide (AsyncState)">
      <div className="op-kit-demo-row" role="group" aria-label="État montré">
        {MODES.map((m) => (
          <Button key={m.mode} variant={mode === m.mode ? 'primary' : 'secondary'} aria-pressed={mode === m.mode} onClick={() => { clearTimeout(timer.current); setMode(m.mode); }} data-ui={`kit.async-${m.mode}`}>
            {m.label}
          </Button>
        ))}
      </div>
      <div className="op-kit-demo-frame op-kit-demo-async">
        <AsyncState
          loading={mode === 'loading'}
          error={mode === 'error' ? { status: 409, code: 'not_enough_berry', message: 'Il te manque 300 ฿ pour ce booster.' } : null}
          onRetry={retry}
          empty={mode === 'empty'}
          emptyTitle="Aucun deck pour l’instant"
          emptyText="Crée ton premier deck à partir d’un Leader."
          emptyAction={<Button variant="primary" icon="deck">Créer un deck</Button>}
        >
          <p>Le contenu de l’écran, une fois chargé.</p>
        </AsyncState>
      </div>
    </Section>
  );
}

function ScreenDemo({ say }: { say: (s: string) => void }) {
  const actions: ScreenAction[] = [
    { id: 'help', label: 'Aide', icon: 'help', onClick: () => say('Écran : Aide') },
    { id: 'settings', label: 'Réglages', icon: 'settings', onClick: () => say('Écran : Réglages') },
    { id: 'import', label: 'Importer un deck', icon: 'deck', onClick: () => say('Écran : Importer') },
    { id: 'off', label: 'Action indisponible', disabled: true, onClick: () => {} },
    { id: 'delete', label: 'Tout supprimer', icon: 'close', danger: true, onClick: () => say('Écran : Tout supprimer') },
  ];
  return (
    <Section name="Écran (Screen, ScreenHeader)" note="Retour en haut à gauche, 2 actions, les autres dans « ⋯ ». Le contenu défile ; la barre du bas reste visible.">
      <div className="op-kit-demo-frame op-kit-demo-screen">
        <Screen
          back={{ label: 'Accueil', onBack: () => say('Écran : ← Accueil') }}
          title="Mes decks"
          subtitle="12 decks · 3 d’aventure"
          actions={actions}
          footer={
            <>
              <span className="op-kit-demo-summary op-small op-muted">Sabo contre Zoro · Confirmé</span>
              <Button variant="primary" size="big" onClick={() => say('Écran : Lancer')}>Lancer</Button>
            </>
          }
          data-ui="kit.screen"
        >
          <ol className="op-kit-demo-lines">
            {Array.from({ length: 14 }, (_, i) => <li key={i}>Ligne de contenu n° {i + 1}</li>)}
          </ol>
        </Screen>
      </div>
    </Section>
  );
}

// Historique de démonstration : il note les entrées ajoutées et retirées, et « Simuler le Retour » retire la dernière
// comme le ferait le Retour du navigateur (le vrai branchement est celui de R1.3 sur la table de routes de R1.4)
function useDemoHistory(say: (s: string) => void) {
  const stack = useRef<(() => void)[]>([]);
  const [depth, setDepth] = useState(0);
  const history = useRef<DialogHistory>({
    push(onBack) {
      stack.current.push(onBack);
      setDepth(stack.current.length);
      say('historique : entrée ajoutée');
    },
    pop() {
      stack.current.pop();
      setDepth(stack.current.length);
      say('historique : entrée retirée');
    },
  });
  const back = () => {
    const onBack = stack.current.pop();
    setDepth(stack.current.length);
    if (onBack) {
      say('Retour du navigateur');
      onBack();
    }
  };
  return { history: history.current, back, depth };
}

type DialogKind = 'simple' | 'form' | 'reducible' | 'decision' | 'stack' | 'history' | 'confirm' | 'long';

function Dialogs({ say }: { say: (s: string) => void }) {
  const [open, setOpen] = useState<DialogKind | null>(null);
  const [inner, setInner] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const demo = useDemoHistory(say);
  const close = (how: string) => () => {
    setOpen(null);
    say(how);
  };
  const KINDS: { kind: DialogKind; label: string }[] = [
    { kind: 'simple', label: 'Fenêtre simple' },
    { kind: 'form', label: 'Avec un formulaire' },
    { kind: 'reducible', label: 'Réductible (Voir le plateau)' },
    { kind: 'decision', label: 'Décision attendue' },
    { kind: 'stack', label: 'Deux fenêtres empilées' },
    { kind: 'history', label: 'Liée à l’historique' },
    { kind: 'confirm', label: 'Confirmation' },
    { kind: 'long', label: 'Contenu long' },
  ];
  return (
    <Section name="Fenêtres (Dialog)" note="Tab reste dans la fenêtre, Échap la ferme, le focus revient au bouton qui l’a ouverte. Sur téléphone, c’est une fiche qui monte du bas.">
      <div className="op-kit-demo-row">
        {KINDS.map((k) => <Button key={k.kind} onClick={() => { setOpen(k.kind); say(`ouverte : ${k.label}`); }} data-ui={`kit.open-${k.kind}`}>{k.label}</Button>)}
      </div>

      {open === 'simple' && (
        <Dialog
          title="Fenêtre simple"
          onClose={close('fermée (✕, Échap ou fond)')}
          actions={<><Button onClick={close('Annuler')}>Annuler</Button><Button variant="primary" onClick={close('Valider')} data-ui="kit.dialog-ok">Valider</Button></>}
          data-ui="kit.dialog"
        >
          <p>Une fenêtre avec un titre, un texte et deux boutons. Échap, ✕ ou un clic sur le fond la ferment.</p>
        </Dialog>
      )}

      {open === 'form' && (
        <Dialog
          title="Renommer le deck"
          onClose={close('formulaire fermé')}
          actions={<><Button onClick={close('formulaire annulé')}>Annuler</Button><Button variant="primary" onClick={close('formulaire enregistré')}>Enregistrer</Button></>}
          data-ui="kit.dialog"
        >
          <form className="op-kit-demo-form" onSubmit={(e) => { e.preventDefault(); close('formulaire envoyé (Entrée)')(); }}>
            <label>Nom <input data-autofocus defaultValue="Sabo rouge" data-ui="kit.dialog-input" /></label>
            <label>Couleur
              <select defaultValue="rouge">
                <option value="rouge">Rouge</option>
                <option value="vert">Vert</option>
                <option value="bleu">Bleu</option>
              </select>
            </label>
            <label className="op-kit-demo-check"><input type="checkbox" /> Deck d’aventure</label>
          </form>
        </Dialog>
      )}

      {open === 'reducible' && (
        <Dialog
          title="Choisis un Personnage à mettre KO"
          reducible
          reducedText={choice ? `Choix : ${choice}` : 'Choisis un Personnage à mettre KO'}
          actions={<Button variant="primary" disabled={!choice} onClick={close(`choisi : ${choice}`)}>Valider</Button>}
          data-ui="kit.dialog"
        >
          <p className="op-muted op-small">« Voir le plateau » réduit la fenêtre en bandeau ; « Rouvrir » la ramène, le choix est gardé.</p>
          <div className="op-kit-demo-row" role="group" aria-label="Personnages">
            {['Nami', 'Usopp', 'Sanji'].map((n) => (
              <Button key={n} variant={choice === n ? 'primary' : 'secondary'} aria-pressed={choice === n} onClick={() => setChoice(n)}>{n}</Button>
            ))}
          </div>
        </Dialog>
      )}

      {open === 'decision' && (
        <Dialog title="Ta main de départ" actions={<Button variant="primary" onClick={close('main gardée')}>Garder cette main</Button>} data-ui="kit.dialog">
          <p>Sans <code>onClose</code>, la fenêtre attend une décision : ni ✕, ni Échap, ni clic sur le fond.</p>
        </Dialog>
      )}

      {open === 'stack' && (
        <Dialog
          title="Première fenêtre"
          onClose={close('première fermée')}
          actions={<Button variant="primary" onClick={() => setInner(true)} data-ui="kit.open-inner">Ouvrir la deuxième</Button>}
          data-ui="kit.dialog"
        >
          <p>Échap ne ferme que la fenêtre du dessus ; le focus revient ensuite ici.</p>
          {inner && (
            <Dialog title="Deuxième fenêtre" size="small" onClose={() => { setInner(false); say('deuxième fermée'); }} actions={<Button variant="primary" onClick={() => { setInner(false); say('deuxième fermée'); }}>OK</Button>} data-ui="kit.dialog-inner">
              <p>Celle-ci est au-dessus.</p>
            </Dialog>
          )}
        </Dialog>
      )}

      {open === 'history' && (
        <Dialog
          title="Fenêtre liée à l’historique"
          onClose={close('fermée')}
          history={demo.history}
          actions={<><Button icon="back" onClick={demo.back} data-ui="kit.history-back">Simuler le Retour</Button><Button variant="primary" onClick={close('fermée par le bouton')}>Fermer</Button></>}
          data-ui="kit.dialog"
        >
          <p>À l’ouverture, une entrée s’ajoute à l’historique ; le Retour du navigateur la retire et ferme la fenêtre. Fermée autrement, elle retire son entrée.</p>
          <p className="op-small op-muted">Entrées de démonstration : {demo.depth}</p>
        </Dialog>
      )}

      {open === 'confirm' && (
        <Dialog
          title="Quitter la partie ?"
          alert
          size="small"
          onClose={close('confirmation annulée')}
          actions={<><Button onClick={close('Rester')} data-autofocus>Rester</Button><Button variant="danger" onClick={close('Quitter')}>Quitter</Button></>}
          data-ui="kit.dialog"
        >
          <p>La partie est enregistrée : tu pourras la reprendre depuis l’accueil.</p>
        </Dialog>
      )}

      {open === 'long' && (
        <Dialog title="Contenu long" size="wide" onClose={close('contenu long fermé')} actions={<Button variant="primary" onClick={close('contenu long fermé')}>Fermer</Button>} data-ui="kit.dialog">
          {Array.from({ length: 30 }, (_, i) => <p key={i}>Paragraphe {i + 1} : le contenu défile, le titre et les boutons restent en place.</p>)}
        </Dialog>
      )}
    </Section>
  );
}
