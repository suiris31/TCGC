// Atelier : essais des écrans du jeu avec des données de démonstration, sans serveur ni partie. Ouvert par l'adresse
// #play/atelier (aucun lien visible) ; #play/atelier/<page> ouvre directement une page (elle reste ouverte après un
// rechargement). Les pages « plateau-<état> » montrent le plateau sur des états fixés (plateau/etats.ts).
// Chaque tâche d'interface ajoute son fichier game/ui/atelier/<page>.atelier.tsx, chargé automatiquement, qui exporte
// `title` (le nom de la page) et `render` (une fonction qui renvoie l'écran, et peut utiliser des hooks).
import { Component, type JSX, type ReactNode } from 'react';

export interface AtelierPage {
  title: string;
  render: () => JSX.Element;
}

const modules = import.meta.glob<Partial<AtelierPage> & { default?: AtelierPage }>('./*.atelier.tsx', { eager: true });

// Nom d'une page : celui de son fichier, sans « .atelier.tsx » (« carte » pour carte.atelier.tsx)
const PAGES = Object.entries(modules)
  .map(([path, mod]) => {
    const page = mod.default ?? mod;
    const name = path.replace(/^.*\//, '').replace(/\.atelier\.tsx$/, '');
    return { name, title: page.title ?? name, render: page.render ?? (() => <p className="danger">Ce fichier n’exporte pas « render ».</p>) };
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

type Page = (typeof PAGES)[number];

// Un composant par page : ses hooks lui appartiennent, et changer de page repart de zéro
function Render({ page }: { page: Page }) {
  return page.render();
}

// Une page qui plante affiche son erreur sans fermer l'atelier
class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  render() {
    return this.state.error ? <p className="danger">Cette page a planté : {this.state.error}</p> : this.props.children;
  }
}

export function Atelier({ page, onPage, onBack }: { page?: string; onPage: (page?: string) => void; onBack: () => void }) {
  const current = PAGES.find((p) => p.name === page);
  return (
    <div className="setup op-atelier">
      <header className="op-atelier-head">
        <button className="op-btn op-btn-ghost" onClick={onBack}>← Retour au jeu</button>
        <h1>🛠 Atelier</h1>
      </header>
      <nav className="op-atelier-pages" aria-label="Pages de l’atelier">
        {PAGES.map((p) => (
          <button key={p.name} className={p === current ? 'deck-chip on' : 'deck-chip'} onClick={() => onPage(p === current ? undefined : p.name)}>
            {p.title}
          </button>
        ))}
      </nav>
      {current ? (
        <section className="op-atelier-stage">
          <Guard key={current.name}><Render page={current} /></Guard>
        </section>
      ) : (
        <p className="op-muted op-atelier-intro">
          Essais des écrans du jeu avec des données de démonstration : rien n’est enregistré et aucune partie ne
          se lance. Choisis une page ci-dessus{PAGES.length ? '' : ' (aucune pour l’instant)'}.
        </p>
      )}
    </div>
  );
}
