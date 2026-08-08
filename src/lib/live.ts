/**
 * Client du mode ON AIR : lecture publique de l'état du direct,
 * mise à jour réservée à l'artiste (clé On Air).
 */
import { normalizeTitle } from './normalizeTitle';
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
  /** Identifiant du direct (multi-live b121) — '' hors direct, 'legacy'
   *  pour un direct lancé par un ancien bundle. */
  id: string;
  /** Code de salon à 6 chiffres ('' hors direct). */
  joinCode: string;
  status: LiveStatus;
  mode: LiveMode;
  song: LiveSong | null;
  artist: ArtistProfile | null;
  hearts: number;
  bandSong: BandSong | null;
  /** Nombre de morceaux dans la setlist diffusée (0 = aucune). */
  setlistCount: number;
  updatedAt: string | null;
  /** cloudId du groupe qui joue ('' = solo / non rattaché à un groupe
   *  partagé). Permet aux membres de ne voir QUE le live de LEUR groupe. */
  bandId: string;
  /** Nom de la personne qui a lancé le direct (affiché aux membres). */
  startedBy: string;
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
  /** Setlist jouée pendant le concert où ce mot a été laissé (b139). */
  setlist_name?: string;
  author: string;
  body: string;
  song_title: string;
  performer: string;
  /** Groupe qui jouait ('' en solo ou hors direct) — b168. */
  band_id?: string;
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

export async function fetchLive(code = ''): Promise<LiveState> {
  let res: Response;
  try {
    res = await fetch(
      code !== '' ? `/api/live?code=${encodeURIComponent(code)}` : '/api/live',
    );
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  return {
    id: typeof body.id === 'string' ? body.id : '',
    joinCode: typeof body.joinCode === 'string' ? body.joinCode : '',
    status: body.status === 'on' || body.status === 'pause' ? body.status : 'off',
    mode: body.mode === 'repet' ? 'repet' : 'concert',
    song: body.song ?? null,
    artist: body.artist ?? null,
    hearts: typeof body.hearts === 'number' ? body.hearts : 0,
    bandSong: body.bandSong ?? null,
    setlistCount: typeof body.setlistCount === 'number' ? body.setlistCount : 0,
    updatedAt: body.updatedAt ?? null,
    bandId: typeof body.bandId === 'string' ? body.bandId : '',
    startedBy: typeof body.startedBy === 'string' ? body.startedBy : '',
  };
}

/** Live actif d'un de MES groupes (bannière des membres) — best-effort. */
export async function fetchLiveForBands(
  cloudIds: string[],
): Promise<LiveState | null> {
  if (cloudIds.length === 0) return null;
  try {
    const res = await fetch(
      `/api/live?band=${encodeURIComponent(cloudIds.join(','))}`,
    );
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    const body = await res.json();
    if (typeof body.status !== 'string' || body.status === 'off') return null;
    return {
      id: typeof body.id === 'string' ? body.id : '',
      joinCode: typeof body.joinCode === 'string' ? body.joinCode : '',
      status: body.status === 'pause' ? 'pause' : 'on',
      mode: body.mode === 'repet' ? 'repet' : 'concert',
      song: body.song ?? null,
      artist: body.artist ?? null,
      hearts: typeof body.hearts === 'number' ? body.hearts : 0,
      bandSong: body.bandSong ?? null,
      setlistCount: typeof body.setlistCount === 'number' ? body.setlistCount : 0,
      updatedAt: body.updatedAt ?? null,
      bandId: typeof body.bandId === 'string' ? body.bandId : '',
      startedBy: typeof body.startedBy === 'string' ? body.startedBy : '',
    };
  } catch {
    return null;
  }
}

/** Le live actif de CET artiste (page publique /nom). Best-effort → null. */
export async function fetchLiveForArtist(
  name: string,
): Promise<LiveState | null> {
  if (name.trim() === '') return null;
  try {
    const res = await fetch(
      `/api/live?artist=${encodeURIComponent(name.trim())}`,
    );
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    const body = await res.json();
    if (typeof body.status !== 'string' || body.status === 'off') return null;
    return {
      id: typeof body.id === 'string' ? body.id : '',
      joinCode: typeof body.joinCode === 'string' ? body.joinCode : '',
      status: body.status === 'pause' ? 'pause' : 'on',
      mode: body.mode === 'repet' ? 'repet' : 'concert',
      song: body.song ?? null,
      artist: body.artist ?? null,
      hearts: typeof body.hearts === 'number' ? body.hearts : 0,
      bandSong: body.bandSong ?? null,
      setlistCount: typeof body.setlistCount === 'number' ? body.setlistCount : 0,
      updatedAt: body.updatedAt ?? null,
      bandId: typeof body.bandId === 'string' ? body.bandId : '',
      startedBy: typeof body.startedBy === 'string' ? body.startedBy : '',
    };
  } catch {
    return null;
  }
}

/** Récupère la setlist diffusée (parcours public). Best-effort → []. */
export async function fetchLiveSetlist(code = ''): Promise<LivePublicSong[]> {
  try {
    const res = await fetch(
      code !== ''
        ? `/api/live?setlist=1&code=${encodeURIComponent(code)}`
        : '/api/live?setlist=1',
    );
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
  /** Nom de la setlist jouée : les mots du public s'y rattachent (b139). */
  setlistName = '',
): Promise<void> {
  if (key.trim() === '') return;
  try {
    await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-live-key': key },
      body: JSON.stringify({
        setlist: setlist ?? [],
        setlistName,
        multi: 1,
        ...(currentLiveRef() ?? {}),
      }),
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
      body: JSON.stringify({
        bandSong: song,
        multi: 1,
        ...(currentLiveRef() ?? {}),
      }),
    });
  } catch {
    // best-effort : jamais bloquant pour celui qui joue
  }
}

/** Envoie n cœurs (public, pendant le direct). Silencieux en cas d'échec. */
export async function sendHearts(
  n: number,
  liveId = '',
): Promise<number | null> {
  try {
    const res = await fetch('/api/live-x?fn=heart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n, liveId }),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    const body = await res.json();
    return typeof body.hearts === 'number' ? body.hearts : null;
  } catch {
    return null;
  }
}

/**
 * Envoie un message du public (livre d'or). Le titre du morceau écouté
 * accompagne le mot : le message se range sous SA chanson chez l'artiste,
 * comme les cœurs (b137).
 *
 * Renvoie 'sent' si c'est parti, 'unavailable' si le livre d'or n'existe
 * pas sur cette installation — l'appelant masque alors la boîte au lieu
 * d'exposer une erreur technique au public. Lève encore en cas de vraie
 * panne passagère (hors ligne, 5xx) : là, réessayer a du sens.
 */
export async function sendMessage(
  name: string,
  text: string,
  liveId = '',
  songTitle = '',
  /** Artiste dont le spectateur regarde la page : c'est LUI le propriétaire
   *  du mot quand aucun direct ne tourne (b168). */
  artist = '',
): Promise<'sent' | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch('/api/live-x?fn=message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, text, liveId, songTitle, artist }),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (body.code === 'unavailable') return 'unavailable';
  if (!res.ok || body.error) {
    const err = new Error(body.error ?? `Erreur ${res.status}`);
    // Raison technique réelle, jamais affichée d'office : elle n'apparaît que
    // sur une page ouverte avec ?diag=1 (voir MessageBox).
    (err as Error & { detail?: string }).detail =
      typeof body.detail === 'string' ? body.detail : '';
    throw err;
  }
  return 'sent';
}

/**
 * Messages du public (réservé à l'artiste, clé On Air requise).
 *
 * `names` = l'artiste ET ses groupes (b168) : la clé ON AIR est commune à
 * l'installation, sans ce filtre chacun lisait les mots de tout le monde.
 * Liste vide = tout (compatibilité, et écrans qui filtrent eux-mêmes).
 */
export async function fetchMessages(
  key: string,
  names: string | string[] = [],
): Promise<LiveMessage[]> {
  const who = (Array.isArray(names) ? names : [names])
    .map((n) => n.trim())
    .filter((n) => n !== '');
  let res: Response;
  try {
    res = await fetch(
      who.length > 0
        ? `/api/live-x?fn=message&performer=${encodeURIComponent(who.join(','))}`
        : '/api/live-x?fn=message',
      { headers: { 'x-live-key': key } },
    );
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

/** Mots du public regroupés par SETLIST jouée (b139). */
export function messagesBySetlist(msgs: LiveMessage[]): {
  get: (name: string) => LiveMessage[];
} {
  const map = new Map<string, LiveMessage[]>();
  for (const m of msgs) {
    const k = normalizeTitle(m.setlist_name ?? '');
    if (k === '') continue;
    const list = map.get(k) ?? [];
    list.push(m);
    map.set(k, list);
  }
  return { get: (name: string) => map.get(normalizeTitle(name)) ?? [] };
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
    const res = await fetch('/api/live-x?fn=live-stats', {
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
export async function fetchLiveStats(
  key: string,
  /**
   * Noms à interroger : l'artiste ET ses groupes (b139). Tous les membres
   * d'un groupe gardent ainsi l'historique des ❤ du groupe, pas seulement
   * celui qui a lancé le direct. Un seul appel pour tous les noms — un
   * appel par nom compterait plusieurs fois l'historique antérieur.
   */
  performer: string | string[] = '',
): Promise<LiveStat[]> {
  let res: Response;
  const names = (Array.isArray(performer) ? performer : [performer])
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const q =
    names.length > 0
      ? `&performer=${encodeURIComponent(names.join(','))}`
      : '';
  try {
    res = await fetch(`/api/live-x?fn=live-stats${q}`, {
      headers: { 'x-live-key': key },
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  return Array.isArray(body.stats) ? body.stats : [];
}

/* ------------------------------------------------------------------ */
/* Multi-live (b121) : référence du direct que CE musicien a lancé.    */
/*  liveId + writeToken (seul le lanceur pilote son live) + joinCode   */
/*  (code de salon à 6 chiffres, affiché en grand pour communication). */
/* ------------------------------------------------------------------ */

export interface LiveRef {
  liveId: string;
  writeToken: string;
  joinCode: string;
}

const LIVE_REF_KEY = 'sing2me/liveRef';

export function currentLiveRef(): LiveRef | null {
  try {
    const raw = localStorage.getItem(LIVE_REF_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as LiveRef;
    return r.liveId && r.writeToken ? r : null;
  } catch {
    return null;
  }
}

function saveLiveRef(r: LiveRef | null): void {
  try {
    if (r) localStorage.setItem(LIVE_REF_KEY, JSON.stringify(r));
    else localStorage.removeItem(LIVE_REF_KEY);
  } catch {
    /* stockage indisponible */
  }
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
    /** cloudId du groupe qui joue ('' = solo). */
    bandId?: string;
    /** Nom de la personne qui lance le direct. */
    startedBy?: string;
  },
): Promise<void> {
  if (key.trim() === '') {
    throw new Error(
      'Le direct est momentanément indisponible — réessaie dans un instant.',
    );
  }
  const ref = currentLiveRef();
  const payload: Record<string, unknown> = { ...update, multi: 1 };
  if (ref) {
    payload.liveId = ref.liveId;
    payload.writeToken = ref.writeToken;
  }
  let res: Response;
  try {
    res = await fetch('/api/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-live-key': key },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  // Référence périmée (live déjà clos/expiré côté serveur) : on repart
  // proprement — une clôture est considérée réussie, un lancement recrée.
  if (res.status === 403 && ref) {
    saveLiveRef(null);
    if (update.status === 'off') return;
    return pushLive(key, update);
  }
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  if (!ref && typeof body.liveId === 'string' && body.liveId !== '') {
    saveLiveRef({
      liveId: body.liveId,
      writeToken: String(body.writeToken ?? ''),
      joinCode: String(body.joinCode ?? ''),
    });
  }
  if (update.status === 'off') saveLiveRef(null);
}

/** URL publique du direct, à partager / mettre en QR.
 *  Pointe vers l'ENTRÉE PUBLIQUE LÉGÈRE (/live → public.html) : le
 *  spectateur ne télécharge jamais le bundle de l'app musicien. Les anciens
 *  QR (/#/live) restent servis par l'app, en compatibilité. */
export function liveUrl(code = ''): string {
  return `${location.origin}/live${code !== '' ? `?c=${code}` : ''}`;
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
export async function pingAttendance(liveId = ''): Promise<void> {
  try {
    await fetch('/api/live-x?fn=attend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deviceId(), liveId }),
    });
  } catch {
    // mesure best-effort : ne bloque jamais le spectateur
  }
}
