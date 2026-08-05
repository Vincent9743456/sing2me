/**
 * Appel à la fonction serveur /api/setlist-ai : propose une setlist
 * ordonnée à partir de la bibliothèque et du type de soirée. Best-effort —
 * nécessite la version en ligne (Vercel) + ANTHROPIC_API_KEY côté serveur.
 */
import { Song, songSeconds } from '../types';

export interface AiSetlistResult {
  name: string;
  comment: string;
  /** Indices dans la bibliothèque envoyée, dans l'ordre de jeu. */
  order: number[];
}

const OFFLINE_MSG =
  "La génération IA nécessite la version en ligne de l'application " +
  '(déployée sur Vercel).';

/** Bibliothèque « jouable » à proposer à l'IA (hors idées et propositions). */
export function playableForAI(songs: Song[]): Song[] {
  return songs.filter(
    (s) => s.idea !== true && (s.pendingBandId ?? '') === '',
  );
}

export async function generateSetlistAI(
  songs: Song[],
  partyType: string,
  minutes: number,
): Promise<{ result: AiSetlistResult; songs: Song[] }> {
  const lib = playableForAI(songs);
  const payload = lib.map((s) => ({
    title: s.title,
    artist: s.artist,
    tags: s.tags,
    seconds: songSeconds(s),
    key: s.key,
  }));
  let res: Response;
  try {
    res = await fetch('/api/setlist-ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ library: payload, partyType, minutes }),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(OFFLINE_MSG);
  }
  const body = (await res.json()) as Partial<AiSetlistResult> & {
    error?: string;
  };
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  const order = Array.isArray(body.order) ? body.order : [];
  return {
    result: {
      name: typeof body.name === 'string' ? body.name : '',
      comment: typeof body.comment === 'string' ? body.comment : '',
      order,
    },
    songs: lib,
  };
}
