// Fenêtres : main de départ, cartes à choisir, carte de Vie révélée, coût à déclarer, fin de tour, Défausse, aide
import type { ReactNode } from 'react';
import { def } from '../engine/rules.ts';
import type { Card, Decision, GameState, Option, PlayerId } from '../engine/types.ts';
import { CardView, type Preview } from './CardView.tsx';
import type { PickItem } from './decision.ts';

function Modal({ children, onClose, wide, className }: { children: ReactNode; onClose?: () => void; wide?: boolean; className?: string }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className={`modal-box ${wide ? 'modal-wide' : ''} ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function MulliganModal({ s, p, onChoose, onHover }: { s: GameState; p: PlayerId; onChoose: (id: string) => void; onHover: (x: Preview | null) => void }) {
  const cheap = s.players[p].hand.filter((c) => def(c.num).category === 'CHARACTER' && (def(c.num).cost ?? 0) <= 4).length;
  return (
    <Modal wide className="modal-mulligan">
      <h2>Ta main de départ</h2>
      <p className="op-muted">{s.first === p ? 'Tu joues en premier : pas de pioche ni d’attaque à ton premier tour.' : 'L’IA joue en premier.'} Tu peux repiocher 5 nouvelles cartes une seule fois.</p>
      <div className="pick-row">
        {s.players[p].hand.map((c) => <CardView key={c.uid} s={s} card={c} owner={p} size="pick" onHover={onHover} />)}
      </div>
      <p className="op-small op-muted">Repère : {cheap} Personnage{cheap > 1 ? 's' : ''} de coût 4 ou moins (de quoi jouer dès les premiers tours).</p>
      <div className="modal-actions">
        <button className="op-btn op-btn-primary btn-big" onClick={() => onChoose('keep')}>Garder cette main</button>
        <button className="op-btn op-btn-ghost btn-big" onClick={() => onChoose('mulligan')}>Repiocher 5 cartes</button>
      </div>
    </Modal>
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
    <Modal wide className="modal-picker">
      <h3>{d.prompt}</h3>
      <div className="pick-row">
        {picks.map((it) => {
          const card: Card = { uid: it.option.uid ?? -1, num: it.num };
          return (
            <div key={it.option.id} className={`pick ${recommended === it.option.id ? 'pick-reco' : ''}`}>
              <CardView s={s} card={card} size="pick" look={{ choose: true, recommended: recommended === it.option.id }} onClick={() => onChoose(it.option.id)} onHover={onHover} />
              <button className="op-btn btn-choice" onClick={() => onChoose(it.option.id)}>Choisir</button>
              <span className="op-small op-muted">{it.zone}</span>
            </div>
          );
        })}
      </div>
      {buttons.length > 0 && (
        <div className="modal-actions">
          {buttons.map((o) => <button key={o.id} className={`op-btn op-btn-ghost ${recommended === o.id ? 'btn-reco' : ''}`} onClick={() => onChoose(o.id)}>{o.label}</button>)}
        </div>
      )}
    </Modal>
  );
}

export function TriggerModal({ s, d, onChoose, recommended }: { s: GameState; d: Decision; onChoose: (id: string) => void; recommended: string | null }) {
  const num = d.options.find((o) => o.id === 'trigger')?.num;
  if (!num) return null;
  const card = def(num);
  return (
    <Modal className="modal-trigger">
      <h3>Ton Leader est touché : carte de Vie révélée</h3>
      <div className="trigger-body">
        <CardView s={s} card={{ uid: -2, num }} size="big" />
        <div className="trigger-text">
          <strong>{card.name}</strong>
          <p><span className="kw">[Déclenchement]</span> {card.trigger}</p>
          <p className="op-small op-muted">Activer l’effet envoie la carte dans la Défausse (sauf si l’effet la joue ou la reprend en main). Sinon, elle va dans ta main comme une carte de Vie normale.</p>
        </div>
      </div>
      <div className="modal-actions">
        <button className={`op-btn op-btn-primary ${recommended === 'trigger' ? 'btn-reco' : ''}`} onClick={() => onChoose('trigger')}>Activer le [Déclenchement]{recommended === 'trigger' && ' ★'}</button>
        <button className={`op-btn op-btn-ghost ${recommended === 'hand' ? 'btn-reco' : ''}`} onClick={() => onChoose('hand')}>Prendre la carte en main{recommended === 'hand' && ' ★'}</button>
      </div>
    </Modal>
  );
}

export function CostModal({ d, onChoose, recommended }: { d: Decision; onChoose: (id: string) => void; recommended: string | null }) {
  return (
    <Modal className="modal-cost">
      <h3>Déclare un coût</h3>
      <p className="op-muted">{d.prompt.replace(/^Déclare un coût\s*/, '').replace(/^\(/, '').replace(/\)\s*:?$/, '') || 'La carte du dessus du deck adverse va être révélée : si son coût est celui que tu déclares, l’effet réussit.'}</p>
      <div className="cost-grid">
        {d.options.map((o) => (
          <button key={o.id} className={`cost-btn ${recommended === o.id ? 'btn-reco' : ''}`} onClick={() => onChoose(o.id)}>{o.id.split(':')[1]}</button>
        ))}
      </div>
    </Modal>
  );
}

export function ConfirmEndModal({ remaining, onConfirm, onCancel, onNeverAsk }: { remaining: string[]; onConfirm: () => void; onCancel: () => void; onNeverAsk: () => void }) {
  return (
    <Modal onClose={onCancel} className="modal-confirm">
      <h3>Terminer ton tour ?</h3>
      <p>Tu peux encore :</p>
      <ul>{remaining.map((r) => <li key={r}>{r}</li>)}</ul>
      <div className="modal-actions">
        <button className="op-btn op-btn-primary" onClick={onConfirm}>Terminer quand même</button>
        <button className="op-btn op-btn-ghost" onClick={onCancel}>Continuer mon tour</button>
      </div>
      <button className="op-link op-small" onClick={onNeverAsk}>Ne plus me demander</button>
    </Modal>
  );
}

export function TrashModal({ s, p, onClose, onHover }: { s: GameState; p: PlayerId; onClose: () => void; onHover: (x: Preview | null) => void }) {
  return (
    <Modal onClose={onClose} wide>
      <h3>Défausse de {s.players[p].name} ({s.players[p].trash.length})</h3>
      <div className="trash-grid">
        {[...s.players[p].trash].reverse().map((c) => <CardView key={c.uid} s={s} card={c} size="small" onHover={onHover} />)}
      </div>
      <div className="modal-actions"><button className="op-btn op-btn-ghost" onClick={onClose}>Fermer</button></div>
    </Modal>
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
  ['[Jouée]', 'Effet qui s’applique quand la carte est jouée.'],
  ['[En attaquant]', 'Effet qui s’applique quand la carte attaque.'],
  ['[Activation : Principale]', 'Effet que tu choisis d’utiliser pendant ta phase principale.'],
  ['[Une fois par tour]', 'L’effet ne peut servir qu’une fois par tour.'],
  ['[DON!! x1]', 'L’effet ne marche que si la carte a au moins ce nombre de DON!! données.'],
  ['DON!! −X', 'Coût : renvoyer X DON!! de ton terrain dans ton deck DON!!.'],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide className="modal-help">
      <h2>Comment jouer</h2>
      <div className="help-grid">
        <section>
          <h3>Pendant ton tour</h3>
          <ul>
            <li><b>Les cartes qui brillent</b> peuvent faire quelque chose : clique dessus pour voir leurs actions. Rien ne se passe tant que tu n’as pas choisi une action.</li>
            <li><b>Jouer une carte</b> : clique sur une carte de ta main, puis « Jouer ». Son coût est en haut à gauche.</li>
            <li><b>Donner des DON!!</b> : glisse une DON!! sur une carte, ou clique sur la carte puis « Donner 1 DON!! ».</li>
            <li><b>Attaquer</b> : clique sur ton Leader ou un Personnage, « Attaquer… », puis sur la cible (elle brille en rouge). Au survol, tu vois le résultat prévu.</li>
            <li><b>Fin du tour</b> : le bouton en bas à droite (ou Entrée).</li>
          </ul>
          <h3>Pendant le tour de l’IA</h3>
          <ul>
            <li>Quand l’IA attaque, tu peux <b>bloquer</b> avec un [Bloqueur] et <b>contrer</b> avec les cartes de ta main : la barre en bas te dit ce qu’il te manque pour repousser l’attaque.</li>
          </ul>
          <h3>Repères visuels</h3>
          <ul>
            <li>💤 vient d’être joué (ne peut pas attaquer ce tour) · 🛡 [Bloqueur] · 🔒 ne peut pas attaquer · ◆ DON!! données</li>
            <li>La puissance est en bas à droite : verte si elle est augmentée, rouge si elle est baissée.</li>
            <li>★ : la carte ou l’action conseillée par le coach.</li>
          </ul>
          <h3>Raccourcis</h3>
          <ul>
            <li>Échap : fermer un menu ou annuler une attaque · Entrée : fin du tour · Ctrl+Z : revenir en arrière · ? : cette aide</li>
          </ul>
        </section>
        <section>
          <h3>Mots-clés</h3>
          <dl className="glossary">
            {KEYWORDS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      </div>
      <div className="modal-actions"><button className="op-btn op-btn-primary" onClick={onClose}>C’est parti</button></div>
    </Modal>
  );
}
