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
  /** Tonalité des FORMES jouées par le leader (le lecteur transpose
   *  chordKey → playedKey). La tonalité réelle = playedKey + capo. */
  playedKey?: string;
  /** Capo posé par le leader (0 = aucun). La tonalité réelle (ce qui sonne)
   *  = playedKey transposé de `capo` demi-tons. */
  capo?: number;
}

/** Morceau en cours côté groupe (titre + tonalité, rien de plus). */
export interface BandSong {
  title: string;
  artist: string;
  key: string;
}

/** Morceau de la setlist diffusée au public (paroles seules). */
export interface LivePublicSong {
  title: string;
  artist: string;
  lyrics: string;
}

export interface LiveState {
  status: LiveStatus;
  mode: LiveMode;
  song: LiveSong | null;
  artist: ArtistProfile | null;
  hearts: number;
  bandSong: BandSong | null;
  /** Nombre de morceaux dans la setlist diffusée (0 = aucune). */
  setlistCount: number;
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
    setlistCount: typeof body.setlistCount === 'number' ? body.setlistCount : 0,
    updatedAt: body.updatedAt ?? null,
  };
}

/** Récupère la setlist diffusée (parcours public). Best-effort → []. */
export async function fetchLiveSetlist(): Promise<LivePublicSong[]> {
  try {
    const res = await fetch('/api/live?setlist=1');
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return [];
    const body = await res.json();
    return Array.isArray(body.setlist) ? body.setlist : [];
  } catch {
    return [];
  }
}

/** Diffuse (ou efface) la setlist au public. Silencieux en cas d'échec. */
export async function pushSetlist(
  key: string,
  setlist: LivePublicSong[] | null,
): Promise<void> {
  if (key.trim() === '') return;
  try {
    await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-live-key': key },
      body: JSON.stringify({ setlist: setlist ?? [] }),
    });
  } catch {
    // best-effort : jamais bloquant pour celui qui joue
  }
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

/** Session ON AIR mesurée (chantier 2) : uniques + horaires. */
export interface LiveSession {
  id: string;
  artist_name: string;
  started_at: string;
  ended_at: string | null;
  uniques: number;
}

/** Sessions ON AIR de l'artiste (audience mesurée). Best-effort → [].
 *  MESURE SEULEMENT : ces chiffres n'entraînent aucune limite ni blocage. */
export async function fetchAudienceSessions(
  key: string,
): Promise<LiveSession[]> {
  if (key.trim() === '') return [];
  try {
    const res = await fetch('/api/live-stats', {
      headers: { 'x-live-key': key },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return [];
    const body = await res.json();
    return Array.isArray(body.sessions) ? body.sessions : [];
  } catch {
    return [];
  }
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
    setlist?: LivePublicSong[] | null;
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

/* ------------------------------------------------------------------ */
/* Chantier 2 — mesure d'audience (SANS limite ni blocage).            */
/*  Un identifiant d'appareil ANONYME (aléatoire, local) permet au     */
/*  serveur de compter les spectateurs uniques d'une session ON AIR.   */
/*  Aucune donnée personnelle ; jamais utilisé pour restreindre.        */
/* ------------------------------------------------------------------ */

/** Identifiant anonyme et stable de CE navigateur (localStorage). */
export function deviceId(): string {
  const KEY = 'sing2me/deviceId';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        'd' +
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Stockage indisponible : id éphémère (comptera comme un nouvel unique).
    return 'd' + Math.random().toString(36).slice(2);
  }
}

/**
 * Signale la présence du spectateur à la session ON AIR en cours (comptage
 * des uniques, MESURE SEULEMENT). Best-effort, totalement silencieux et
 * isolé : n'influence jamais l'affichage du direct.
 */
export async function pingAttendance(): Promise<void> {
  try {
    await fetch('/api/attend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deviceId() }),
    });
  } catch {
    // mesure best-effort : ne bloque jamais le spectateur
  }
}
