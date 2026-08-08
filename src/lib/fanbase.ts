/**
 * Fanbase V1 (chantier 6) — client.
 *  • suivre un artiste (email + consentement) → l'artiste voit le nombre ;
 *  • setlist souvenir : les morceaux du dernier concert (titres/artistes) ;
 *  • compteur de suiveurs pour l'artiste (clé On Air).
 * Best-effort : silencieux et non bloquant si le serveur n'est pas configuré.
 */
import { liveHeaders } from './liveAuth';

/** Enregistre un suivi (le public a coché le consentement). */
export async function followArtist(
  artist: string,
  email: string,
  shareEmail: boolean,
): Promise<void> {
  const res = await fetch('/api/fan?fn=follow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ artist, email, shareEmail }),
  });
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('application/json') ? await res.json() : {};
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
}

export interface FollowerStats {
  count: number;
  sharedEmails: string[];
}

/** Compteur de suiveurs d'un artiste (réservé à l'artiste, clé On Air). */
export async function fetchFollowerStats(
  key: string,
  artist: string,
): Promise<FollowerStats> {
  if (key.trim() === '' || artist.trim() === '') {
    return { count: 0, sharedEmails: [] };
  }
  try {
    const res = await fetch(
      `/api/fan?fn=follow&artist=${encodeURIComponent(artist)}`,
      { headers: liveHeaders(key) },
    );
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return { count: 0, sharedEmails: [] };
    const body = await res.json();
    return {
      count: typeof body.count === 'number' ? body.count : 0,
      sharedEmails: Array.isArray(body.sharedEmails) ? body.sharedEmails : [],
    };
  } catch {
    return { count: 0, sharedEmails: [] };
  }
}

export interface SouvenirSong {
  title: string;
  artist: string;
  hearts: number;
}
export interface Souvenir {
  session: { artist: string; started_at: string | null; ended_at: string | null } | null;
  songs: SouvenirSong[];
}

/** Setlist souvenir du dernier concert terminé (titres/artistes, sans paroles). */
export async function fetchSouvenir(): Promise<Souvenir> {
  try {
    const res = await fetch('/api/fan?fn=souvenir');
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return { session: null, songs: [] };
    const body = await res.json();
    return {
      session: body.session ?? null,
      songs: Array.isArray(body.songs) ? body.songs : [],
    };
  } catch {
    return { session: null, songs: [] };
  }
}
