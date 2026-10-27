// Envoi des parties au serveur, qui les range dans le compte du joueur connecté. Si le serveur ne répond pas (réseau
// coupé pendant la partie), la partie attend dans le navigateur et part au lancement suivant. La file d'attente est
// propre à chaque compte : sur un appareil partagé, une partie ne peut pas partir sur le compte d'un autre.
import type { GameRecord, GameSummary } from '../coach/archive.ts';
import { call } from './api.ts';

let userId: number | null = null;

// Compte connecté (appelé à l'ouverture du jeu)
export function setArchiveUser(id: number) {
  userId = id;
}

const queueKey = () => `tcgc.game.queue.${userId}`;

function queued(): Record<string, GameRecord> {
  if (userId === null) return {};
  try {
    return JSON.parse(localStorage.getItem(queueKey()) ?? '{}') as Record<string, GameRecord>;
  } catch {
    return {};
  }
}

function setQueued(all: Record<string, GameRecord>) {
  if (userId === null) return;
  try {
    if (Object.keys(all).length) localStorage.setItem(queueKey(), JSON.stringify(all));
    else localStorage.removeItem(queueKey());
  } catch {
    // stockage plein ou indisponible : tant pis pour la copie de secours
  }
}

// Copie de secours immédiate (fermeture de l'onglet : pas le temps d'attendre le serveur)
export function keepForLater(rec: GameRecord) {
  setQueued({ ...queued(), [rec.id]: rec });
}

// La partie est compressée avant l'envoi quand le navigateur le permet (environ 6 fois moins de données mobiles)
async function encode(rec: GameRecord): Promise<{ body: BodyInit; type: string }> {
  const text = JSON.stringify(rec);
  if (typeof CompressionStream === 'undefined') return { body: text, type: 'application/json' };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { body: await new Response(stream).blob(), type: 'application/gzip' };
}

async function put(rec: GameRecord): Promise<boolean> {
  try {
    const { body, type } = await encode(rec);
    await call('PUT', `records/${encodeURIComponent(rec.id)}`, body, { type });
    return true;
  } catch {
    return false;
  }
}

// Les envois partent un par un, et seule la dernière version de chaque partie en attente est envoyée
const waiting = new Map<string, GameRecord>();
let running: Promise<void> | null = null;

export function saveRecord(rec: GameRecord): Promise<void> {
  waiting.set(rec.id, rec);
  running ??= (async () => {
    while (waiting.size) {
      const [id, next] = waiting.entries().next().value!;
      waiting.delete(id);
      const ok = await put(next);
      const all = queued();
      if (ok && all[id] && all[id].updatedAt <= next.updatedAt) {
        delete all[id];
        setQueued(all);
      } else if (!ok) {
        setQueued({ ...all, [id]: next });
      }
    }
    running = null;
  })();
  return running;
}

// Attend la fin des envois en cours (avant de relire la liste des parties ou le bilan)
export function whenSaved(): Promise<void> {
  return running ?? Promise.resolve();
}

// Au lancement : envoie les parties restées en attente
export function flushQueue() {
  for (const rec of Object.values(queued())) void saveRecord(rec);
}

export const loadSummaries = () => call<GameSummary[]>('GET', 'records');

export const loadRecord = (id: string) => call<GameRecord>('GET', `records/${encodeURIComponent(id)}`);

// Import de parties enregistrées par l'ancien OP-Coach (fichiers JSON du dossier parties/) : envoyées telles quelles,
// le serveur vérifie que ce sont bien des parties
export async function importFiles(files: File[]): Promise<{ imported: number; failed: string[] }> {
  let imported = 0;
  const failed: string[] = [];
  for (const file of files) {
    try {
      const rec = JSON.parse(await file.text()) as GameRecord;
      if (!rec || typeof rec.id !== 'string' || !(await put(rec))) throw new Error('refusée');
      imported++;
    } catch {
      failed.push(file.name);
    }
  }
  return { imported, failed };
}
