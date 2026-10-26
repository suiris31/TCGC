// Client unique des routes du jeu (/api/game/...) : tous les appels au serveur passent par call(), qui ne lance qu'une
// sorte d'erreur, ApiError. Le message du serveur ({ error, code }, en français) est gardé tel quel, pour être montré au
// joueur ; le code sert à réagir ('insufficient_funds', 'unknown_record'...). Les clients de chaque domaine
// (adventure/api.ts, economy/api.ts, online/api.ts, myDecks.ts, archiveClient.ts) sont de fines couches dessus.

// import.meta.env n'existe que dans la page (Vite) : les tests sous Node prennent la racine
const BASE = `${import.meta.env?.BASE_URL ?? '/'}api/game/`;

// Adresse d'une route du jeu (path sans « / » au début : 'decks', 'matches/<id>/events'...)
export const apiUrl = (path: string) => `${BASE}${path}`;

// status : code HTTP, 0 si le serveur n'a pas répondu ; code : celui du serveur, 'network' ou 'server' s'il n'en donne pas
export class ApiError extends Error {
  status: number;
  code: string;
  constructor({ status, code, message }: { status: number; code: string; message: string }) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface CallOptions {
  cache?: RequestCache;  // 'no-store' par défaut
  type?: string;         // corps envoyé tel quel avec ce type (partie compressée...) ; sinon le corps est mis en JSON
}

export async function call<T>(method: string, path: string, body?: unknown, { cache = 'no-store', type }: CallOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': type ?? 'application/json' },
      body: body === undefined ? undefined : type ? body as BodyInit : JSON.stringify(body),
      cache,
    });
  } catch {
    throw new ApiError({ status: 0, code: 'network', message: 'Le serveur ne répond pas : vérifie ta connexion' });
  }
  const data = await res.json().catch(() => null) as (T & { code?: unknown; error?: unknown }) | null;
  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      code: typeof data?.code === 'string' ? data.code : 'server',
      message: typeof data?.error === 'string' ? data.error : `Le serveur a répondu ${res.status}`,
    });
  }
  return data as T;
}
