// Le deck d'aventure (construit avec les cartes de la Cale) : VERSION PROVISOIRE (tâche 0), pour que le parcours de
// l'aventure (tâche 1.17) puisse déjà l'ouvrir. La tâche 1.18 la remplace en gardant l'export et les props.
export function AdventureDeckScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="setup op-soon">
      <header className="setup-head">
        <h1>🃏 Mon deck d’aventure</h1>
        <p className="op-muted">Bientôt : améliore ton deck avec les cartes que tu as gagnées.</p>
      </header>
      <div className="op-soon-actions">
        <button className="op-btn op-btn-ghost" onClick={onBack}>← Retour</button>
      </div>
    </div>
  );
}
