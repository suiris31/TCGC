// Panneau des réglages (tâche R1.3) : tous les réglages du jeu dans une seule fenêtre du kit, la même partout (plateau
// contre l'IA, partie en ligne, aventure ; l'accueil l'utilisera avec R3.1). Chaque changement s'applique tout de
// suite, à tous les écrans ouverts (magasin partagé de settings.ts) : pas de bouton « Enregistrer ».
import { useId } from 'react';
import { useDevice } from './device.ts';
import { Button, Dialog } from './kit/index.ts';
import { AI_SPEEDS, systemReducedMotion, UI_SCALES, useReducedMotion, useSettings, ZOOM_DELAYS } from './settings.ts';

export function SettingsPanel({ onClose, onHelp }: {
  onClose: () => void;
  /** « Comment jouer ? » : ouvre l'aide (le panneau se ferme d'abord) */
  onHelp?: () => void;
}) {
  const [settings, update] = useSettings();
  const { touch } = useDevice();
  const reduced = useReducedMotion();
  const system = systemReducedMotion();
  const actions = (
    <>
      {onHelp && <Button variant="quiet" icon="help" data-ui="settings.help" onClick={() => { onClose(); onHelp(); }}>Comment jouer ?</Button>}
      <Button variant="primary" data-ui="settings.done" onClick={onClose}>C’est réglé</Button>
    </>
  );
  return (
    <Dialog title="Réglages" onClose={onClose} actions={actions} data-ui="settings.panel">
      <div className="op-settings">
        <section className="op-settings-group" aria-label="Son et affichage">
          <h3 className="op-settings-title">Son et affichage</h3>
          <Toggle label="Sons" checked={settings.sound} onChange={(sound) => update({ sound })} ui="settings.sound" />
          <Choice label="Taille de l’interface" value={settings.uiScale} options={UI_SCALES} onChange={(uiScale) => update({ uiScale })} ui="settings.scale" />
          <Toggle label="Animations réduites" checked={reduced} onChange={(on) => update({ reducedMotion: on === system ? undefined : on })} ui="settings.motion"
            hint={settings.reducedMotion === undefined
              ? `Comme ton appareil (${system ? 'animations réduites' : 'animations normales'}).`
              : 'Ton choix, à la place de celui de ton appareil.'} />
        </section>
        <section className="op-settings-group" aria-label="Partie">
          <h3 className="op-settings-title">Partie</h3>
          <Choice label="Vitesse de l’IA" value={settings.speed} options={AI_SPEEDS} onChange={(speed) => update({ speed })} ui="settings.speed" />
          <Toggle label="Confirmer la fin du tour" hint="S’il te reste des actions possibles." checked={settings.confirmEnd} onChange={(confirmEnd) => update({ confirmEnd })} ui="settings.confirm-end" />
          <Toggle label="Conseil du coach automatique (★)" hint="Contre l’IA : le coach prépare son conseil à chacune de tes décisions." checked={settings.autoCoach} onChange={(autoCoach) => update({ autoCoach })} ui="settings.coach" />
          {!touch && <Choice label="Détail d’une carte survolée" value={settings.zoomDelay} options={ZOOM_DELAYS} onChange={(zoomDelay) => update({ zoomDelay })} ui="settings.zoom" />}
        </section>
      </div>
    </Dialog>
  );
}

// Interrupteur : tout le rang se touche
function Toggle({ label, hint, checked, onChange, ui }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; ui: string }) {
  const id = useId();
  return (
    <label className="op-settings-row op-settings-toggle" data-ui={ui}>
      <span className="op-settings-text">
        <span className="op-settings-label">{label}</span>
        {hint && <span className="op-settings-hint" id={`${id}-aide`}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="op-settings-check" checked={checked} aria-describedby={hint ? `${id}-aide` : undefined}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="op-settings-switch" aria-hidden="true" />
    </label>
  );
}

// Choix parmi quelques valeurs : des pastilles côte à côte (boutons radio), plus faciles au doigt qu'une liste
function Choice({ label, value, options, onChange, ui }: { label: string; value: number; options: [number, string][]; onChange: (v: number) => void; ui: string }) {
  const name = useId();
  return (
    <fieldset className="op-settings-row op-settings-choice" data-ui={ui}>
      <legend className="op-settings-label">{label}</legend>
      <div className="op-settings-seg">
        {options.map(([v, text]) => (
          <label key={v} className={v === value ? 'op-settings-opt is-on' : 'op-settings-opt'}>
            <input type="radio" name={name} value={v} checked={v === value} onChange={() => onChange(v)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
