/**
 * Appel à la fonction serveur /api/setlist-ai : propose une setlist
 * ordonnée à partir de la bibliothèque et du type de soirée. Best-effort —
 * nécessite la version en ligne (Vercel) + ANTHROPIC_API_KEY côté serveur.
 */
import { versionForBand } from './model';
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

/**
 * Répertoire disponible pour un contexte donné :
 * - groupe (bandId non vide) : uniquement les morceaux affectés à CE groupe
 *   (ceux qui ont une version pour ce groupe) ;
 * - solo (bandId vide) : les morceaux jouables en solo (hors « déqualifiés »).
 * Dans les deux cas, hors idées et propositions non acceptées.
 */
export function repertoireForContext(songs: Song[], bandId: string): Song[] {
  const base = playableForAI(songs);
  if (bandId === '') return base.filter((s) => s.noSolo !== true);
  return base.filter((s) => versionForBand(s, bandId) !== null);
}

export async function generateSetlistAI(
  songs: Song[],
  partyType: string,
  minutes: number,
  bandId: string,
): Promise<{ result: AiSetlistResult; songs: Song[] }> {
  const lib = repertoireForContext(songs, bandId);
  const payload = lib.map((s) => ({
    title: s.title,
    artist: s.artist,
    tags: s.tags,
    seconds: songSeconds(s),
    key: s.key,
  }));
  let res: Response;
  try {
    res = await fetch('/api/ai?fn=setlist', {
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
