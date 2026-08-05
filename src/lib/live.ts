/**
 * Client du mode ON AIR : lecture publique de l'état du direct,
 * mise à jour réservée à l'artiste (clé On Air).
 */
import { normalizeTitle } from './importer';
import { ArtistProfile } from '../types';

export type LiveStatus = 'off' | 'on' | 'pause';

/** Type de session : concert (public + musiciens) ou répétition (musiciens). */
export type LiveMode = 'concert' | 'repet';

export interface LiveSong {
  title: string;
  artist: string;
  /** Paroles sans accords (public) */
  lyrics: string;
  /** Paroles avec accords [Am] — vue musicien via le QR unique */
  chords?: string;
  /** Tonalité dans laquelle les accords ci-dessus sont écrits */
  chordKey?: string;
  /** Tonalité réellement jouée (le lecteur transpose chordKey → playedKey) */
  playedKey?: string;
}

/** Morceau en cours côté groupe (titre + tonalité, rien de plus). */
export interface BandSong {
  title: string;
  artist: string;
  key: string;
}

export interface LiveState {
  status: LiveStatus;
  mode: LiveMode;
  song: LiveSong | null;
  artist: ArtistProfile | null;
  hearts: number;
  bandSong: BandSong | null;
  updatedAt: string | null;
}

export interface LiveStat {
  song_title: string;
  song_artist: string;
  hearts: number;
  concert_id: string;
  concert_title: string;
  played_at: string;
}

export interface LiveConcertRef {
  id: string;
  title: string;
  date: string;
}

export interface LiveMessage {
  author: string;
  body: string;
  song_title: string;
  performer: string;
  concert_id: string;
  concert_title: string;
  created_at: string;
}

const OFFLINE_MSG =
  "Le mode ON AIR nécessite la version en ligne de l'application (Vercel).";

async function readJson(res: Response): Promise<any> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error(OFFLINE_MSG);
  return res.json();
}

export async function fetchLive(): Promise<LiveState> {
  let res: Response;
  try {
    res = await fetch('/api/live');
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  return {
    status: body.status === 'on' || body.status === 'pause' ? body.status : 'off',
    mode: body.mode === 'repet' ? 'repet' : 'concert',
    song: body.song ?? null,
    artist: body.artist ?? null,
    hearts: typeof body.hearts === 'number' ? body.hearts : 0,
    bandSong: body.bandSong ?? null,
    updatedAt: body.updatedAt ?? null,
  };
}

/** Diffuse le morceau en cours aux musiciens (suivi de groupe). */
export async function pushBandSong(
  key: string,
  song: BandSong | null,
): Promise<void> {
  if (key.trim() === '') return;
  try {
    await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-live-key': key },
      body: JSON.stringify({ bandSong: song }),
    });
  } catch {
    // best-effort : jamais bloquant pour celui qui joue
  }
}

/** Envoie n cœurs (public, pendant le direct). Silencieux en cas d'échec. */
export async function sendHearts(n: number): Promise<number | null> {
  try {
    const res = await fetch('/api/heart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n }),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    const body = await res.json();
    return typeof body.hearts === 'number' ? body.hearts : null;
  } catch {
    return null;
  }
}

/** Envoie un message du public (livre d'or). */
export async function sendMessage(name: string, text: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, text }),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
}

/** Messages du public (réservé à l'artiste, clé On Air requise). */
export async function fetchMessages(key: string): Promise<LiveMessage[]> {
  let res: Response;
  try {
    res = await fetch('/api/message', { headers: { 'x-live-key': key } });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  return Array.isArray(body.messages) ? body.messages : [];
}

/** Messages du public regroupés par morceau. */
export function messagesBySong(msgs: LiveMessage[]): {
  get: (title: string) => LiveMessage[];
} {
  const map = new Map<string, LiveMessage[]>();
  for (const m of msgs) {
    const k = normalizeTitle(m.song_title);
    if (k === '') continue;
    const list = map.get(k) ?? [];
    list.push(m);
    map.set(k, list);
  }
  return { get: (title: string) => map.get(normalizeTitle(title)) ?? [] };
}

/** Totaux de ❤ par chanson (agrégés sur tout l'historique des directs). */
export function heartTotals(stats: LiveStat[]): {
  get: (title: string) => number | undefined;
} {
  const map = new Map<string, number>();
  for (const st of stats) {
    const k = normalizeTitle(st.song_title);
    if (k === '') continue;
    map.set(k, (map.get(k) ?? 0) + (st.hearts ?? 0));
  }
  return { get: (title: string) => map.get(normalizeTitle(title)) };
}

/** Statistiques des directs (réservé à l'artiste, clé On Air requise). */
export async function fetchLiveStats(key: string): Promise<LiveStat[]> {
  let res: Response;
  try {
    res = await fetch('/api/live-stats', { headers: { 'x-live-key': key } });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  return Array.isArray(body.stats) ? body.stats : [];
}

export async function pushLive(
  key: string,
  update: {
    status: LiveStatus;
    mode?: LiveMode;
    song?: LiveSong | null;
    artist?: ArtistProfile | null;
    concert?: LiveConcertRef | null;
    bandSong?: BandSong | null;
  },
): Promise<void> {
  if (key.trim() === '') {
    throw new Error(
      "Renseigne d'abord ta clé On Air dans l'onglet Artiste (la même que la variable LIVE_KEY sur Vercel).",
    );
  }
  let res: Response;
  try {
    res = await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-live-key': key },
      body: JSON.stringify(update),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
}

/** URL publique du direct, à partager / mettre en QR. */
export function liveUrl(): string {
  return `${location.origin}${location.pathname}#/live`;
}
