// Environnement d'apprentissage par renforcement : une partie du moteur existant (game/engine/), sans interface.
//
//   reset(options)  nouvelle partie (graine, decks, premier joueur, contrôleur de chaque siège)
//   toAct           siège qui doit décider (piloté par le modèle), ou null si la partie est finie
//   legal()         options légales de la décision en cours (identifiants du moteur)
//   observe(siège)  observation de ce siège, construite à partir de sa seule vue (viewFor)
//   step(choix)     applique le choix du siège qui décide, puis avance jusqu'à la prochaine décision d'un siège
//                   piloté par le modèle (les décisions à une seule option et celles des adversaires intégrés sont
//                   jouées automatiquement)
//   result()        fin, gagnant, partie tronquée, erreur, tours, décisions
//
// Les règles sont entièrement celles du moteur (act) : rien n'est dupliqué ici. Une partie se rejoue exactement à partir
// de sa graine et de la liste des choix (trajectoire, voir record.ts).
//
// Récompense : +1 pour le gagnant, −1 pour le perdant, rien d'autre (calculée côté entraînement à partir de `winner`).
//
// Plafond de sécurité (maxDecisions) : une partie s'arrête toujours d'elle-même (deck vide au plus tard, voir
// game/docs/ia-rl.md § Plafond). Le plafond ne sert qu'à rattraper un bogue du moteur. Une partie qui l'atteint est
// « tronquée » : ni victoire, ni défaite, ni égalité. L'entraînement n'y met AUCUNE récompense : il complète avec sa
// propre estimation de la valeur de la dernière position où le joueur a décidé (troncature par limite de temps), si
// bien qu'atteindre le plafond ne rapporte rien de plus que de continuer à jouer ; l'agent n'a aucun intérêt à faire
// traîner la partie. Ces parties sont comptées et enregistrées pour analyse.
import { DECKS } from '../engine/decks.ts';
import { actInPlace, newGame } from '../engine/engine.ts';
import type { GameState, Option, PlayerId } from '../engine/types.ts';
import { viewFor } from '../engine/view.ts';
import { encodeObservation, type Observation } from './encode.ts';
import { builtinPolicy, type Builtin, type SeatSpec } from './opponents.ts';

export const DEFAULT_MAX_DECISIONS = 3000;

export interface ResetOptions {
  seed: number;
  decks: [string, string];
  first?: PlayerId | 'random';
  seats: [SeatSpec, SeatSpec];
  maxDecisions?: number;
  keepLog?: boolean;      // garder le journal et l'historique du moteur (débogage ; plus lent)
}

// Une décision appliquée : joueur, choix, et pour un siège piloté par le modèle ce que le modèle en pensait
export interface Step {
  p: PlayerId;
  c: string;
  by: 'agent' | 'builtin' | 'forced';
  probs?: number[];       // probabilité de chaque option (dans l'ordre des options), si fournie
  value?: number;         // estimation de la valeur (entre −1 et 1) par le modèle, si fournie
}

export interface Result {
  done: boolean;
  winner: PlayerId | null;
  truncated: boolean;
  error: string | null;
  reason: string | null;
  turns: number;
  decisions: number;
}

export class RlEnv {
  state!: GameState;
  options!: ResetOptions;
  steps: Step[] = [];
  truncated = false;
  error: string | null = null;
  private builtins: [Builtin | null, Builtin | null] = [null, null];

  reset(options: ResetOptions): this {
    for (const d of options.decks) if (!DECKS[d]) throw new Error(`deck inconnu : ${d}`);
    this.options = options;
    this.steps = [];
    this.truncated = false;
    this.error = null;
    this.builtins = options.seats.map((seat, p) => (seat.kind === 'agent' ? null : builtinPolicy(seat, options.seed + 7919 * (p + 1)))) as [Builtin | null, Builtin | null];
    try {
      this.state = newGame({ decks: options.decks, names: ['Joueur 1', 'Joueur 2'], seed: options.seed, first: options.first ?? 'random' });
      this.trim();
      this.autoplay();
    } catch (err) {
      this.fail(err);
    }
    return this;
  }

  get done(): boolean {
    return this.error !== null || this.truncated || this.state?.winner !== null;
  }

  // Siège qui doit décider (piloté par le modèle), null si la partie est finie
  get toAct(): PlayerId | null {
    return this.done ? null : this.state.decision?.player ?? null;
  }

  legal(): Option[] {
    return this.done ? [] : this.state.decision?.options ?? [];
  }

  observe(seat: PlayerId): Observation {
    return encodeObservation(viewFor(this.state, seat), seat);
  }

  // Choix du siège qui décide : identifiant d'option ou rang dans legal()
  step(choice: string | number, meta: { probs?: number[]; value?: number } = {}): this {
    if (this.done) throw new Error('partie terminée');
    const d = this.state.decision!;
    const id = typeof choice === 'number' ? d.options[choice]?.id : choice;
    if (!id || !d.options.some((o) => o.id === id)) throw new Error(`choix invalide : ${String(choice)}`);
    if (this.options.seats[d.player].kind !== 'agent') throw new Error(`le siège ${d.player} n'est pas piloté par le modèle`);
    try {
      this.apply({ p: d.player, c: id, by: 'agent', ...meta });
      this.autoplay();
    } catch (err) {
      this.fail(err);
    }
    return this;
  }

  result(): Result {
    const s = this.state;
    return {
      done: this.done,
      winner: s?.winner ?? null,
      truncated: this.truncated,
      error: this.error,
      reason: this.error ?? (this.truncated ? `plafond de ${this.maxDecisions} décisions atteint` : s?.winReason ?? null),
      turns: s?.turn ?? 0,
      decisions: this.steps.length,
    };
  }

  private get maxDecisions() {
    return this.options.maxDecisions ?? DEFAULT_MAX_DECISIONS;
  }

  // Joue les décisions qui ne demandent pas le modèle : une seule option possible, ou siège d'un adversaire intégré
  private autoplay() {
    for (;;) {
      const s = this.state;
      if (s.winner !== null || !s.decision) return;
      if (this.steps.length >= this.maxDecisions) {
        this.truncated = true;
        return;
      }
      const d = s.decision;
      if (d.options.length === 1) {
        this.apply({ p: d.player, c: d.options[0].id, by: 'forced' });
        continue;
      }
      const builtin = this.builtins[d.player];
      if (!builtin) return;
      this.apply({ p: d.player, c: builtin(s, d), by: 'builtin' });
    }
  }

  // Le moteur avance d'une décision. L'environnement est seul propriétaire de son état : pas de copie (actInPlace).
  private apply(step: Step) {
    this.steps.push(step);
    this.state = actInPlace(this.state, step.c);
    this.trim();
  }

  // Journal et historique du moteur : inutiles aux règles, ils grossissent à chaque décision (la partie se rejoue
  // à l'identique depuis la trajectoire si on veut les lire)
  private trim() {
    if (this.options.keepLog) return;
    this.state.log = [];
    this.state.history = [];
  }

  private fail(err: unknown) {
    this.error = err instanceof Error ? err.message : String(err);
  }
}
