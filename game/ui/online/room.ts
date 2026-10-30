// Salon et salle d'attente (tâche R3.7) : fonctions pures, testées par game/tests/online-room.test.ts

export const CODE_LENGTH = 6;

// Code de salle tel qu'on le tape, qu'on le colle (le message envoyé, le lien) ou qu'il arrive dans l'adresse :
// majuscules, lettres et chiffres, 6 au plus
export function cleanCode(text: string): string {
  const found = /salle\/([a-z0-9]+)/i.exec(text) ?? /code\s*:?\s*([a-z0-9]{6})\b/i.exec(text);
  return (found ? found[1] : text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

// Minutes avant que la salle expire, arrondies au-dessus (« encore 1 min » jusqu'à la fin) ; null : pas d'échéance
export function minutesLeft(expiresAt: string | null | undefined, now: number): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
}

// Lien d'invitation : ouvre le salon de l'ami avec le code rempli (#play/salle/<CODE>, adresse à garder)
export function roomLink(code: string, location: Pick<Location, 'origin' | 'pathname'>): string {
  return `${location.origin}${location.pathname}#play/salle/${code}`;
}
