// Visuels d'un deck dans l'éditeur (tâche R3.12) : la version de chaque carte (parallèle, manga, SP...) et la DON!! du
// deck. Deux galeries de vignettes ; toucher une vignette choisit ce visuel et referme la fenêtre (le choix part avec
// l'enregistrement automatique du deck). Purement cosmétique : rien ne change dans le jeu. Dans un deck d'aventure,
// seules les versions de la Cale se choisissent ; les autres sont grisées, « à trouver » ; les DON!! restent libres.
import { useEffect, useState } from 'react';
import { CARDS } from '../../engine/cards/index.ts';
import { def } from '../../engine/rules.ts';
import { Dialog } from '../kit/index.ts';
import { loadDons, type DonChoice } from '../myDecks.ts';
import { artVersions, canChoose } from './versions.ts';

const BASE = import.meta.env.BASE_URL;

// owned : exemplaires de chaque version dans la Cale (deck d'aventure) ; absent : deck libre
export function VersionPicker({ num, chosen, owned, adventure, onPick, onClose }: {
  num: string;
  chosen: string | undefined;
  owned?: Record<string, number>;
  adventure: boolean;
  onPick: (variant: string) => void;
  onClose: () => void;
}) {
  const d = def(num);
  const versions = artVersions(num, CARDS[num]);
  const current = chosen ?? 'base';
  return (
    <Dialog title={`Version de ${d.name}`} onClose={onClose} size="wide" className="op-looks" data-ui="looks.versions">
      <p className="op-small op-muted">{adventure
        ? 'Choisis le visuel de cette carte dans ton deck. Seules les versions de ta Cale se choisissent : les autres sont à trouver dans les boosters.'
        : 'Choisis le visuel de cette carte dans ton deck. Ça ne change rien au jeu : ton adversaire le voit aussi en ligne.'}</p>
      <div className="op-looks-grid">
        {versions.map((v) => {
          const ok = canChoose(v.variant, owned, adventure);
          const n = owned?.[v.variant] ?? 0;
          const on = v.variant === current;
          return (
            <button key={v.variant} className={`op-looks-item${on ? ' is-on' : ''}${ok ? '' : ' is-missing'}`} disabled={!ok}
              data-ui={`looks.version-${v.variant}`} aria-pressed={on} onClick={() => { onPick(v.variant); onClose(); }}>
              <img src={`${BASE}${v.path}`} alt="" loading="lazy" draggable={false} />
              <span className="op-looks-name">{on && '✔ '}{v.label}</span>
              {adventure && (
                <span className="op-looks-note">{n > 0 ? `${n} dans ta Cale` : v.variant === 'base' ? 'visuel par défaut' : 'à trouver'}</span>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

// Les DON!! proposées, lues une fois (la DON!! standard d'abord) ; drawn : visuels coupés par le serveur
export interface DonList { list: DonChoice[]; drawn: boolean }
let dons: DonList | null = null;
let loading: Promise<DonList> | null = null;

// null pendant la lecture, ou si elle a échoué (redemandée au prochain affichage)
export function useDonList(): DonList | null {
  return useDons().list;
}

function useDons() {
  const [list, setList] = useState(dons);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (dons) return;
    loading ??= loadDons().then((r) => (dons = { list: r.dons, drawn: r.drawn === true }));
    loading.then(setList, (e: Error) => { loading = null; setError(e.message); });
  }, []);
  return { list, error };
}

export function DonPicker({ chosen, onPick, onClose }: { chosen: string | undefined; onPick: (id: string | undefined) => void; onClose: () => void }) {
  const { list, error } = useDons();
  const current = chosen ?? list?.list[0]?.id;
  return (
    <Dialog title="DON!! du deck" onClose={onClose} size="wide" className="op-looks" data-ui="looks.don">
      <p className="op-small op-muted">Le visuel de tes DON!! en partie, pour ce deck. Ça ne change rien au jeu : ton adversaire le voit aussi en ligne.</p>
      {error && <p className="danger op-small">Impossible de charger les DON!! : {error}</p>}
      {!list && !error && <p className="op-muted"><span className="op-spinner" /> Chargement des DON!!…</p>}
      {list?.drawn && <p className="op-small op-muted">Les visuels des cartes ne sont pas disponibles en ce moment : seule la DON!! standard est proposée.</p>}
      {list && (
        <div className="op-looks-grid is-don">
          {list.list.map((x, i) => {
            const on = x.id === current;
            return (
              <button key={x.id} className={`op-looks-item${on ? ' is-on' : ''}`} data-ui={i === 0 ? 'looks.don-standard' : 'looks.don-item'}
                aria-pressed={on} onClick={() => { onPick(i === 0 ? undefined : x.id); onClose(); }}>
                <img src={`${BASE}${x.imageUrl}`} alt="" loading="lazy" draggable={false} />
                <span className="op-looks-name">{on && '✔ '}{x.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
