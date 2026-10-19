// Mode Aventure : types partagés par les données des arcs (east-blue.ts...), le serveur (progression, récompenses) et
// les écrans. Contrat du plan « Aventure » (Plan-aventure/01-contrats.md, § 5) : on n'y ajoute que des champs
// facultatifs.
import type { Level } from '../ai/search.ts';   // 1 Débutant, 2 Confirmé, 3 Expert, 4 IA entraînée

export interface DialogueLine {
  who: string;          // qui parle (« Luffy »), '' pour la narration
  card?: string;        // numéro de carte dont l'illustration sert de portrait (facultatif)
  text: string;         // écrit par nous : jamais de citation du manga ou de l'anime
}

export type Reward =
  | { kind: 'booster'; set: string; count: number }
  | { kind: 'card'; number: string; count: number }
  | { kind: 'deck'; deck: string }          // les cartes d'un deck du registre, ajoutées à la Cale
  | { kind: 'berry'; amount: number };      // à partir de l'étape 2

export interface ChapterRules { myLife?: number; aiLife?: number; note?: string }

export interface Chapter {
  id: string;           // 'eb-2-orange-town' : stable, sert de clé en base
  order: number;
  title: string;        // titre du chapitre
  place: string;        // lieu (« Orange Town »)
  map: { x: number; y: number };   // position dans la zone de la région sur la carte, de 0 à 1
  opponent: { name: string; deck: string; level: Level };
  intro: DialogueLine[];
  victory: DialogueLine[];
  defeat: DialogueLine[];
  rewards: Reward[];    // donnés à la première victoire
  rules?: ChapterRules; // règles spéciales, seulement si le moteur sait les appliquer
  optional?: boolean;   // défi bonus, pas nécessaire pour avancer
  requires?: string[];  // chapitres à gagner avant (par défaut : le chapitre obligatoire précédent)
}

export interface Arc {
  id: string;           // 'east-blue'
  title: string;
  region: string;       // zone de la carte du monde (voir game/adventure/world.ts, tâche 1.3)
  boosterSet: string;   // 'OP03'
  starterDeck?: string; // deck du registre offert au début de l'arc
  chapters: Chapter[];
}

export type ChapterStatus = 'locked' | 'open' | 'won';
