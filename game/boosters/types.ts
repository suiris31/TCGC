// Boosters : types partagés par le générateur (open.ts), le serveur (tirage, Cale) et l'écran d'ouverture. Contrat du
// plan « Aventure » (Plan-aventure/01-contrats.md, § 6) : on n'y ajoute que des champs facultatifs.

export type Rand = () => number;   // nombre dans [0, 1)

export interface PulledCard {
  number: string;       // « OP03-001 »
  rarity: string;       // rareté imprimée (C, UC, R, SR, SEC, L, SP CARD...)
  variant: string;      // 'base', ou identifiant de la version (parallèle, SP...) défini par la tâche 1.5
  imageUrl?: string;    // visuel de cette version s'il diffère du visuel de base (relais de l'appli)
}

export interface BoosterContent { set: string; cards: PulledCard[] }
