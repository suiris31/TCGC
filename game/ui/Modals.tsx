// Fenêtres : main de départ, cartes à choisir, carte de Vie révélée, coût à déclarer, fin de tour, Défausse, aide, et
// la bulle de la première partie. Toutes passent par le Dialog du kit ; celles d'une décision n'ont pas de ✕ (le choix
// est attendu) mais se réduisent avec « Voir le plateau » et se rouvrent sans perdre le choix.
import { def } from '../engine/rules.ts';
import type { Card, Decision, GameState, Option, PlayerId } from '../engine/types.ts';
import { CardView, STATE_LEGEND, type Preview } from './CardView.tsx';
import type { PickItem } from './decision.ts';
import { isTouch } from './device.ts';
import { Button, Dialog, Icon, IconButton } from './kit/index.ts';
import { quoteCardNames } from './texts.ts';

export function MulliganModal({ s, p, onChoose, onHover }: { s: GameState; p: PlayerId; onChoose: (id: string) => void; onHover: (x: Preview | null) => void }) {
  const cheap = s.players[p].hand.filter((c) => def(c.num).category === 'CHARACTER' && (def(c.num).cost ?? 0) <= 4).length;
  return (
    <Dialog title="Ta main de départ" size="wide" reducible reducedText="Ta main de départ : garder ou repiocher ?" className="op-decision modal-mulligan" data-ui="decision.mulligan"
      actions={(
        <>
          <button className="op-btn op-btn-primary btn-big" data-ui="mulligan.keep" onClick={() => onChoose('keep')}>Garder cette main</button>
          <button className="op-btn op-btn-ghost btn-big" data-ui="mulligan.redraw" onClick={() => onChoose('mulligan')}>Repiocher 5 cartes</button>
        </>
      )}>
      <p className="op-muted">{s.first === p ? 'Tu joues en premier : pas de pioche ni d’attaque à ton premier tour.' : s.players[s.first].name === 'IA' ? 'L’IA joue en premier.' : `${s.players[s.first].name} joue en premier.`} Tu peux repiocher 5 nouvelles cartes une seule fois.</p>
      <div className="pick-row">
        {s.players[p].hand.map((c) => <CardView key={c.uid} s={s} card={c} owner={p} size="pick" onHover={onHover} />)}
      </div>
      <p className="op-small op-muted">Repère : {cheap} Personnage{cheap > 1 ? 's' : ''} de coût 4 ou moins (de quoi jouer dès les premiers tours).</p>
    </Dialog>
  );
}

export function PickerModal({ s, d, picks, buttons, recommended, onChoose, onHover }: {
  s: GameState;
  d: Decision;
  picks: PickItem[];
  buttons: Option[];
  recommended: string | null;
  onChoose: (id: string) => void;
  onHover: (x: Preview | null) => void;
}) {
  return (
    <Dialog title={quoteCardNames(d.prompt)} size="wide" reducible reducedText={`Choix en attente : ${quoteCardNames(d.prompt)}`} className="op-decision modal-picker" data-ui="decision.picker"
      actions={buttons.length > 0 && buttons.map((o) => (
        <button key={o.id} data-ui={`picker.option-${o.id}`} className={`op-btn op-btn-ghost ${recommended === o.id ? 'btn-reco' : ''}`} onClick={() => onChoose(o.id)}>{o.label}</button>
      ))}>
      <div className="pick-row">
        {picks.map((it) => {
          const card: Card = { uid: it.option.uid ?? -1, num: it.num };
          return (
            <div key={it.option.id} className={`pick ${recommended === it.option.id ? 'pick-reco' : ''}`}>
              <CardView s={s} card={card} size="pick" look={{ choose: true, recommended: recommended === it.option.id }} onClick={isTouch() ? undefined : () => onChoose(it.option.id)} onHover={onHover} />
              <button className="op-btn btn-choice" data-ui="picker.choose" onClick={() => onChoose(it.option.id)}>Choisir</button>
              <span className="op-small op-muted">{it.zone}</span>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

export function TriggerModal({ s, d, onChoose, recommended }: { s: GameState; d: Decision; onChoose: (id: string) => void; recommended: string | null }) {
  const num = d.options.find((o) => o.id === 'trigger')?.num;
  if (!num) return null;
  const card = def(num);
  return (
    <Dialog title="Ton Leader est touché : carte de Vie révélée" reducible reducedText={`[Déclenchement] de ${card.name} : l’activer ?`} className="op-decision modal-trigger" data-ui="decision.trigger"
      actions={(
        <>
          <button className={`op-btn op-btn-primary ${recommended === 'trigger' ? 'btn-reco' : ''}`} data-ui="trigger.activate" onClick={() => onChoose('trigger')}>Activer le [Déclenchement]{recommended === 'trigger' && ' ★'}</button>
          <button className={`op-btn op-btn-ghost ${recommended === 'hand' ? 'btn-reco' : ''}`} data-ui="trigger.hand" onClick={() => onChoose('hand')}>Prendre la carte en main{recommended === 'hand' && ' ★'}</button>
        </>
      )}>
      <div className="trigger-body">
        <CardView s={s} card={{ uid: -2, num }} size="big" />
        <div className="trigger-text">
          <strong>{card.name}</strong>
          <p><span className="kw">[Déclenchement]</span> {card.trigger}</p>
          <p className="op-small op-muted">Activer l’effet envoie la carte dans la Défausse (sauf si l’effet la joue ou la reprend en main). Sinon, elle va dans ta main comme une carte de Vie normale.</p>
        </div>
      </div>
    </Dialog>
  );
}

export function CostModal({ d, onChoose, recommended }: { d: Decision; onChoose: (id: string) => void; recommended: string | null }) {
  return (
    <Dialog title="Déclare un coût" reducible reducedText="Coût à déclarer" className="op-decision modal-cost" data-ui="decision.cost">
      <p className="op-muted">{d.prompt.replace(/^Déclare un coût\s*/, '').replace(/^\(/, '').replace(/\)\s*:?$/, '') || 'La carte du dessus du deck adverse va être révélée : si son coût est celui que tu déclares, l’effet réussit.'}</p>
      <div className="cost-grid">
        {d.options.map((o) => (
          <button key={o.id} data-ui="cost.option" className={`cost-btn ${recommended === o.id ? 'btn-reco' : ''}`} onClick={() => onChoose(o.id)}>{o.id.split(':')[1]}</button>
        ))}
      </div>
    </Dialog>
  );
}

export function ConfirmEndModal({ remaining, onConfirm, onCancel, onNeverAsk }: { remaining: string[]; onConfirm: () => void; onCancel: () => void; onNeverAsk: () => void }) {
  return (
    <Dialog title="Terminer ton tour ?" onClose={onCancel} size="small" alert className="modal-confirm" data-ui="decision.confirm-end"
      actions={(
        <>
          <button className="op-btn op-btn-primary" data-ui="confirm-end.ok" onClick={onConfirm}>Terminer quand même</button>
          <button className="op-btn op-btn-ghost" data-ui="confirm-end.cancel" onClick={onCancel}>Continuer mon tour</button>
        </>
      )}>
      <p>Tu peux encore :</p>
      <ul>{remaining.map((r) => <li key={r}>{r}</li>)}</ul>
      <button className="op-link op-small" data-ui="confirm-end.never" onClick={onNeverAsk}>Ne plus me demander</button>
    </Dialog>
  );
}

export function TrashModal({ s, p, onClose, onHover }: { s: GameState; p: PlayerId; onClose: () => void; onHover: (x: Preview | null) => void }) {
  return (
    <Dialog title={`Défausse de ${s.players[p].name} (${s.players[p].trash.length})`} onClose={onClose} size="wide" data-ui="trash"
      actions={<button className="op-btn op-btn-ghost" data-ui="trash.close" onClick={onClose}>Fermer</button>}>
      <div className="trash-grid">
        {[...s.players[p].trash].reverse().map((c) => <CardView key={c.uid} s={s} card={c} size="small" onHover={onHover} />)}
      </div>
    </Dialog>
  );
}

// Première partie : une bulle courte en haut du plateau, sous les fenêtres de décision (elle ne cache pas la main de
// départ), refermable, avec un lien vers l'aide complète
export function FirstGameTip({ onHelp, onClose }: { onHelp: () => void; onClose: () => void }) {
  const tap = isTouch() ? 'touche' : 'clique sur';
  return (
    <aside className="op-first-tip" data-ui="tip" aria-label="Première partie">
      <p>
        <b>Première partie ?</b> La barre du bas te dit toujours qui doit jouer et quoi faire. Les cartes entourées d’or
        peuvent agir : {tap} l’une d’elles pour voir ses actions.
      </p>
      <Button variant="secondary" icon="help" onClick={onHelp} data-ui="tip.help">Comment jouer ?</Button>
      <IconButton icon="close" label="Fermer l’astuce" variant="quiet" onClick={onClose} data-ui="tip.close" />
    </aside>
  );
}

const KEYWORDS: [string, string][] = [
  ['DON!!', 'La ressource du jeu. Tu en reçois 2 par tour (1 au premier tour du premier joueur), jusqu’à 10. On les épuise pour payer le coût des cartes, ou on les donne à son Leader et ses Personnages : +1000 de puissance chacune pendant ton tour.'],
  ['Vie', 'Quand ton Leader est touché, la carte du dessus de ta Vie va dans ta main. Si ton Leader est touché alors que tu n’as plus de Vie, tu perds.'],
  ['Attaque', 'Le Leader et les Personnages redressés peuvent attaquer le Leader adverse ou un Personnage adverse épuisé. Si la puissance de l’attaquant est au moins égale à celle de la cible, l’attaque réussit.'],
  ['Épuisé / redressé', 'Une carte qui attaque ou qui paie un coût est épuisée (tournée). Tout se redresse au début de ton tour.'],
  ['[Bloqueur]', 'Quand l’adversaire attaque, tu peux épuiser ce Personnage pour qu’il devienne la cible à la place.'],
  ['[Contre]', 'Pendant une attaque adverse, défausse une carte de ta main pour ajouter sa valeur de Contre à la carte attaquée, ou joue un Événement [Contre] en payant son coût.'],
  ['[Déclenchement]', 'Quand cette carte sort de ta Vie parce que ton Leader est touché, tu peux activer son effet au lieu de la prendre en main.'],
  ['[Initiative]', 'Ce Personnage peut attaquer dès le tour où il est joué ([Initiative : Personnage] : seulement les Personnages).'],
  ['[Double attaque]', 'Quand cette carte touche le Leader adverse, elle lui inflige 2 dégâts au lieu de 1.'],
  ['[Exil]', 'Quand cette carte touche le Leader adverse, les cartes de Vie perdues vont dans la Défausse au lieu de la main, sans [Déclenchement].'],
  ['[Imblocable]', 'L’adversaire ne peut pas utiliser de [Bloqueur] contre cette carte.'],
  ['[Jouée]', 'Effet qui s’applique quand la carte est jouée.'],
  ['[En attaquant]', 'Effet qui s’applique quand la carte attaque.'],
  ['[Activation : Principale]', 'Effet que tu choisis d’utiliser pendant ta phase principale.'],
  ['[Une fois par tour]', 'L’effet ne peut servir qu’une fois par tour.'],
  ['[DON!! x1]', 'L’effet ne marche que si la carte a au moins ce nombre de DON!! données.'],
  ['DON!! −X', 'Coût : renvoyer X DON!! de ton terrain dans ton deck DON!!.'],
];

// L'aide complète : ✕ en haut, « C'est parti » en bas
export function HelpModal({ onClose }: { onClose: () => void }) {
  const touch = isTouch();
  return (
    <Dialog title="Comment jouer" onClose={onClose} size="wide" className="modal-help" data-ui="help"
      actions={<button className="op-btn op-btn-primary" data-ui="help.close" onClick={onClose}>C’est parti</button>}>
      <div className="help-grid">
        <section>
          <h3>Pendant ton tour</h3>
          {touch ? (
            <ul>
              <li><b>Les cartes entourées d’or</b> peuvent faire quelque chose : touche-les pour voir leur fiche et leurs actions. Rien ne se passe tant que tu n’as pas choisi une action.</li>
              <li><b>Lire une carte</b> : touche-la, sa fiche s’ouvre en grand (même les cartes de l’adversaire).</li>
              <li><b>Jouer une carte</b> : touche une carte de ta main, puis « Jouer ». Son coût est en haut à gauche.</li>
              <li><b>Donner des DON!!</b> : touche la carte, puis « Donner 1 DON!! » (autant de fois que tu veux).</li>
              <li><b>Attaquer</b> : touche ton Leader ou un Personnage, « Attaquer… », puis la cible (entourée de rouge) : le résultat prévu s’affiche en bas, et tu confirmes avec « Attaquer ».</li>
              <li><b>Fin du tour</b> : le bouton en bas. Le journal et le coach s’ouvrent avec le bouton 📜 en haut.</li>
            </ul>
          ) : (
            <ul>
              <li><b>Les cartes entourées d’or</b> peuvent faire quelque chose : clique dessus pour voir leurs actions. Rien ne se passe tant que tu n’as pas choisi une action.</li>
              <li><b>Jouer une carte</b> : clique sur une carte de ta main, puis « Jouer ». Son coût est en haut à gauche.</li>
              <li><b>Donner des DON!!</b> : glisse une DON!! sur une carte, ou clique sur la carte puis « Donner 1 DON!! ».</li>
              <li><b>Attaquer</b> : clique sur ton Leader ou un Personnage, « Attaquer… », puis sur la cible (entourée de rouge). Au survol, tu vois le résultat prévu.</li>
              <li><b>Fin du tour</b> : le bouton en bas à droite (ou Entrée).</li>
            </ul>
          )}
          <h3>Pendant le tour de l’IA</h3>
          <ul>
            <li>Quand l’IA attaque, tu peux <b>bloquer</b> avec un [Bloqueur] et <b>contrer</b> avec les cartes de ta main : la barre en bas te dit ce qu’il te manque pour repousser l’attaque.</li>
          </ul>
          <h3>Fenêtres de choix</h3>
          <ul>
            <li>Main de départ, carte à choisir, [Déclenchement], coût : « Voir le plateau » réduit la fenêtre en bas de l’écran, « Rouvrir » la fait revenir. Ton choix t’attend.</li>
          </ul>
          <h3>Repères visuels</h3>
          <ul>
            <li>
              {STATE_LEGEND.map((x) => (
                <span key={x.icon} className="op-state-legend"><span className={`op-card-state is-${x.tone}`}><Icon name={x.icon} size="78%" /></span>{x.text} · </span>
              ))}
              ◆ DON!! données. Le détail d’une carte explique chacun de ses états.
            </li>
            <li>La puissance est en bas à droite : verte avec ↑ si elle est augmentée, rouge avec ↓ si elle est baissée.</li>
            <li>★ et la lueur qui pulse : la carte ou l’action conseillée par le coach.</li>
          </ul>
          {!touch && (
            <>
              <h3>Raccourcis</h3>
              <ul>
                <li>Échap : fermer un menu ou annuler une attaque · Entrée : fin du tour · Ctrl+Z : revenir en arrière · P : mettre l’IA en pause ou la reprendre · ? : cette aide</li>
              </ul>
            </>
          )}
        </section>
        <section>
          <h3>Mots-clés</h3>
          <dl className="glossary">
            {KEYWORDS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
