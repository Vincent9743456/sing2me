/**
 * Client du mode ON AIR : lecture publique de l'état du direct,
 * mise à jour réservée à l'artiste (clé On Air).
 */
import { liveHeaders } from './liveAuth';
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
  /** Spectateurs uniques de la session (b345) — renvoyé uniquement au
   *  LANCEUR (lecture par identifiant) ; absent des lectures publiques. */
  viewers?: number;
}

export interface LiveStat {
  song_title: string;
  song_artist: string;
  hearts: number;
  concert_id: string;
  concert_title: string;
  played_at: string;
  /** Qui jouait : soi, ou l'un de ses groupes (b180). */
  performer?: string;
  /** Setlist tournée pendant ce live, si le SQL est à jour (b180). */
  setlist_name?: string;
  /**
   * Séance ON AIR d'où vient ce morceau (b186) : c'est le rattachement
   * EXACT à son live. Sans lui on recoupait à l'heure — et le morceau d'un
   * autre musicien, joué au même moment, atterrissait dans le mauvais live.
   */
  session_id?: string | null;
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
  /** Direct pendant lequel ce mot a été laissé (b186) : rattachement exact. */
  live_id?: string | null;
  concert_id: string;
  concert_title: string;
  created_at: string;
}

const OFFLINE_MSG =
  "Le mode Live nécessite la version en ligne de l'application (Vercel).";

/**
 * Délai maximum d'un appel au direct (b216). Sans lui, `fetch` peut rester
 * en attente INDÉFINIMENT sur un réseau qui traîne : le bouton « Arrêter »
 * restait alors sur « ⏳ Arrêt… » pour toujours, et l'artiste ne pouvait
 * plus fermer son direct (signalement de Vincent, en plein essai). Une
 * action doit toujours pouvoir se terminer — quitte à échouer.
 */
const DELAI_MAX_MS = 12000;

export const TIMEOUT_MSG =
  'Le serveur ne répond pas. Vérifie ta connexion et réessaie.';

async function fetchAvecDelai(
  url: string,
  init: RequestInit,
  ms = DELAI_MAX_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const minuteur = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new Error(
      e instanceof DOMException && e.name === 'AbortError'
        ? TIMEOUT_MSG
        : OFFLINE_MSG,
    );
  } finally {
    window.clearTimeout(minuteur);
  }
}

async function readJson(res: Response): Promise<any> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error(OFFLINE_MSG);
  return res.json();
}

/**
 * État d'un direct. `artist` (b170) désigne le direct par l'IDENTITÉ de
 * l'artiste et non par une session : c'est ce qui permet au spectateur de
 * rester sur la même adresse quand le concert s'arrête et repart. `code`
 * n'est plus produit nulle part — il n'est lu que pour honorer un vieux lien.
 */
export async function fetchLive(
  code = '',
  artist = '',
  page = '',
): Promise<LiveState> {
  let res: Response;
  try {
    res = await fetch(
      // L'ADRESSE d'abord (b227) : elle est unique, le nom affiché ne l'est
      // pas. Le nom reste en repli pour les entrées qui n'ont pas d'adresse
      // (lien /live d'un vieux QR, bœuf sans page publique).
      page !== ''
        ? `/api/live?page=${encodeURIComponent(page)}`
        : artist !== ''
          ? `/api/live?artist=${encodeURIComponent(artist)}`
          : code !== ''
            ? `/api/live?code=${encodeURIComponent(code)}`
            : '/api/live',
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
/**
 * MON direct, par son identifiant (b217). Le lanceur sondait le sien par le
 * code de salon — or la clôture efface ce code : une référence restée en
 * mémoire après un arrêt qui n'a pas abouti ne retrouvait plus rien, et
 * l'application croyait le direct éteint. L'identifiant, lui, ne change
 * jamais.
 */
export async function fetchLiveById(id: string): Promise<LiveState> {
  if (id.trim() === '') return fetchLive('');
  const res = await fetch(`/api/live?id=${encodeURIComponent(id.trim())}`);
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
    viewers: typeof body.viewers === 'number' ? body.viewers : undefined,
  };
}

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
    return await litLive(res);
  } catch {
    return null;
  }
}

/**
 * LE DIRECT DE L'ADRESSE `/lenom` (b227).
 *
 * On demande au serveur « le direct du COMPTE derrière cette adresse », et
 * plus « le direct dont le nom affiché est untel ». Un nom d'affichage n'est
 * pas unique : cinq Vincent avaient cinq adresses distinctes mais tombaient
 * tous sur le même concert. L'adresse, elle, est unique par construction.
 */
export async function fetchLiveForPage(
  page: string,
): Promise<LiveState | null> {
  if (page.trim() === '') return null;
  try {
    const res = await fetch(`/api/live?page=${encodeURIComponent(page.trim())}`);
    return await litLive(res);
  } catch {
    return null;
  }
}

/** Lecture commune d'une réponse /api/live. Best-effort → null. */
async function litLive(res: Response): Promise<LiveState | null> {
  try {
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
export async function fetchLiveSetlist(
  code = '',
  artist = '',
  page = '',
): Promise<LivePublicSong[]> {
  try {
    const res = await fetch(
      page !== ''
        ? `/api/live?setlist=1&page=${encodeURIComponent(page)}`
        : artist !== ''
        ? `/api/live?setlist=1&artist=${encodeURIComponent(artist)}`
        : code !== ''
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
      headers: liveHeaders(key, { 'content-type': 'application/json' }),
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
      headers: liveHeaders(key, { 'content-type': 'application/json' }),
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
      // `device` : l'identifiant anonyme du navigateur (b225). Le serveur
      // s'en sert pour ne compter QU'UN cœur par spectateur et par morceau —
      // le geste, lui, reste libre.
      body: JSON.stringify({ n, liveId, device: deviceId() }),
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

/** Un direct tel que le serveur l'a enregistré (b182) : une ligne par
 *  appui sur GO LIVE, conservée après l'arrêt comme trace du concert. */
export interface PastLiveRow {
  id: string;
  artist: { name?: string } | null;
  band_id: string;
  /** Qui a appuyé sur GO LIVE (le live d'un groupe porte le nom du groupe). */
  started_by?: string;
  setlist_name: string;
  /**
   * Concert planifié auquel ce direct est rattaché (b207). Posé au
   * lancement, sur CONFIRMATION de l'artiste — jamais deviné.
   */
  concert?: { id?: string; title?: string; date?: string } | null;
  started_at: string | null;
  updated_at: string | null;
  status: string;
  session_id: string | null;
}

// Les directs enregistrés se lisent via fetchHistoriqueLive (b339) : le même
// appel serveur rapporte lives, morceaux et séances — plus d'appel dédié.

/** État d'une table côté serveur (diagnostic ON AIR, b178). */
export interface DiagTable {
  table: string;
  ok: boolean;
  rows: number | null;
  last: string | null;
  detail: string;
}

/**
 * Diagnostic ON AIR : ce que la base contient VRAIMENT, table par table.
 * Réservé à l'artiste. Ne renvoie aucun contenu, seulement des compteurs —
 * de quoi savoir si un écran vide vient d'une table absente, de droits, ou
 * simplement d'une absence de données.
 */
export async function fetchDiag(
  key: string,
): Promise<{ configured: boolean; tables: DiagTable[]; note?: string } | null> {
  if (key.trim() === '') return null;
  try {
    const res = await fetch('/api/live-x?fn=diag', {
      headers: liveHeaders(key),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
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
  /** cloudId de mes groupes : un mot laissé pendant un concert du groupe
   *  appartient à tous ses membres (b191, même règle que les morceaux). */
  bandCloudIds: string[] = [],
): Promise<LiveMessage[]> {
  const who = (Array.isArray(names) ? names : [names])
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const cids = bandCloudIds.map((c) => c.trim()).filter((c) => c !== '');
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(
      `/api/live-x?fn=message` +
        (who.length > 0 ? `&performer=${encodeURIComponent(who.join(','))}` : '') +
        (cids.length > 0 ? `&bands=${encodeURIComponent(cids.join(','))}` : ''),
      { headers: liveHeaders(key) },
    );
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  durees.mots = {
    clientMs: Math.round(performance.now() - t0),
    serveur: chronoServeur(body),
  };
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  // Compteurs du diagnostic : combien de lignes le serveur a LU, combien il
  // en a gardé pour moi. Sans eux, « 0 mot » se confond avec « aucun mot ».
  dernierTriMots = {
    read: typeof body.read === 'number' ? body.read : null,
    kept: typeof body.kept === 'number' ? body.kept : null,
    detail: typeof body.detail === 'string' ? body.detail : '',
  };
  return Array.isArray(body.messages) ? body.messages : [];
}

/** Ce que la dernière lecture du livre d'or a vu (diagnostic uniquement). */
export interface TriMots {
  /** Lignes lues en base (null = la lecture a échoué). */
  read: number | null;
  /** Lignes retenues pour ce compte. */
  kept: number | null;
  /** Raison technique de l'échec, s'il y en a une. */
  detail: string;
}
let dernierTriMots: TriMots = { read: null, kept: null, detail: '' };
export function triMots(): TriMots {
  return dernierTriMots;
}

/**
 * DURÉES DU DERNIER CHARGEMENT (b341) : ce que l'app a mesuré (aller-retour
 * complet) et ce que le serveur a chronométré étape par étape (champ `t` de
 * sa réponse — auth, lectures, total, et sa région d'exécution). Affiché
 * uniquement sur l'écran ?diag=1 : c'est la fin des corrections de lenteur
 * à l'aveugle.
 */
export interface DureeAppel {
  clientMs: number;
  serveur: Record<string, number | string> | null;
}
const durees: { historique?: DureeAppel; mots?: DureeAppel } = {};
export function dureesLive(): { historique?: DureeAppel; mots?: DureeAppel } {
  return durees;
}
function chronoServeur(body: unknown): Record<string, number | string> | null {
  const t = (body as { t?: unknown })?.t;
  return t !== null && typeof t === 'object'
    ? (t as Record<string, number | string>)
    : null;
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

/**
 * L'HISTORIQUE DES DIRECTS EN UN SEUL APPEL (b339, lenteur constatée par
 * Vincent). Le serveur a toujours renvoyé lives + morceaux + séances dans la
 * MÊME réponse — mais le client l'appelait TROIS fois en parallèle
 * (fetchPastLives, fetchLiveStats, fetchAudienceSessions), soit trois
 * exécutions serverless identiques, chacune refaisant toutes les requêtes en
 * base. Un seul appel, une seule réponse, trois lectures.
 *
 * Au passage, les séances d'audience sont maintenant TRIÉES avec mes noms et
 * mes groupes : l'ancien appel dédié partait sans aucun filtre, et les
 * séances des lives de groupe lancés par un autre membre (ou des archives à
 * mon nom d'avant b192) n'en revenaient jamais.
 */
export interface HistoriqueLive {
  rows: PastLiveRow[];
  stats: LiveStat[];
  sessions: LiveSession[];
}

export async function fetchHistoriqueLive(
  key: string,
  performer: string[] = [],
  bandCloudIds: string[] = [],
): Promise<HistoriqueLive> {
  const names = performer.map((n) => n.trim()).filter((n) => n !== '');
  const cids = bandCloudIds.map((c) => c.trim()).filter((c) => c !== '');
  const q =
    (names.length > 0 ? `&performer=${encodeURIComponent(names.join(','))}` : '') +
    (cids.length > 0 ? `&bands=${encodeURIComponent(cids.join(','))}` : '');
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`/api/live-x?fn=live-stats${q}`, {
      headers: liveHeaders(key),
    });
  } catch {
    throw new Error(OFFLINE_MSG);
  }
  const body = await readJson(res);
  durees.historique = {
    clientMs: Math.round(performance.now() - t0),
    serveur: chronoServeur(body),
  };
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  return {
    rows: Array.isArray(body.lives) ? body.lives : [],
    stats: Array.isArray(body.stats) ? body.stats : [],
    sessions: Array.isArray(body.sessions) ? body.sessions : [],
  };
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
  /**
   * cloudId de MES groupes (b188). C'est ce qui permet au serveur de savoir
   * quels lives sont les miens : un live de groupe appartient à TOUS ses
   * membres, un live solo à celui qui l'a lancé. Sans ça, le tri se faisait
   * sur le nom affiché — et deux musiciens de la même installation se
   * mélangeaient dès qu'un profil n'était pas rempli.
   */
  bandCloudIds: string[] = [],
): Promise<LiveStat[]> {
  let res: Response;
  const names = (Array.isArray(performer) ? performer : [performer])
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const cids = bandCloudIds.map((c) => c.trim()).filter((c) => c !== '');
  const q =
    (names.length > 0 ? `&performer=${encodeURIComponent(names.join(','))}` : '') +
    (cids.length > 0 ? `&bands=${encodeURIComponent(cids.join(','))}` : '');
  try {
    res = await fetch(`/api/live-x?fn=live-stats${q}`, {
      headers: liveHeaders(key),
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
/*  (le join_code reste un identifiant INTERNE : plus jamais affiché). */
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
  const res = await fetchAvecDelai('/api/live', {
    method: 'POST',
    headers: liveHeaders(key, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
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

/**
 * Clôture EN ATTENTE (b216) : quand « Arrêter » n'atteint pas le serveur,
 * l'artiste ne doit pas rester prisonnier de son propre direct. Il arrête
 * sur son téléphone, et l'application rappelle le serveur toute seule dès
 * qu'elle y arrive. Le jeton d'écriture est conservé pour ça — sans lui,
 * plus personne ne pourrait clore ce direct.
 */
const CLOTURE_KEY = 'sing2me/clotureEnAttente';
/** Au-delà, la clôture en attente n'a plus de sens : on l'oublie (b217). */
const CLOTURE_PEREMPTION_MS = 6 * 60 * 60 * 1000;

export function noterClotureEnAttente(): void {
  try {
    localStorage.setItem(CLOTURE_KEY, String(Date.now()));
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Une clôture en attente est DATÉE (b217) : un drapeau éternel finissait
 * par hanter les directs suivants. Passé le délai, on l'oublie — le
 * serveur ferme de toute façon un direct oublié au bout d'une heure sans
 * partition.
 */
export function clotureEnAttente(): boolean {
  try {
    const brut = localStorage.getItem(CLOTURE_KEY);
    if (brut === null) return false;
    // '1' : forme d'avant la date (b216) — on la traite comme récente.
    const pose = brut === '1' ? Date.now() : Number(brut);
    if (!Number.isFinite(pose) || Date.now() - pose > CLOTURE_PEREMPTION_MS) {
      oublierCloture();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Abandonne la clôture en attente. Appelé quand elle aboutit — et SURTOUT
 * quand l'artiste relance un direct : il vient de dire le contraire, et
 * fermer derrière lui serait absurde. C'est ce qui manquait à b216, où le
 * rattrapage coupait le direct une seconde après son lancement.
 */
export function oublierCloture(): void {
  try {
    localStorage.removeItem(CLOTURE_KEY);
  } catch {
    /* stockage indisponible */
  }
}

/** Rejoue la clôture ; `true` si le serveur l'a enfin acceptée. */
export async function rejouerCloture(key: string): Promise<boolean> {
  if (!clotureEnAttente()) return false;
  try {
    await pushLive(key, { status: 'off' });
  } catch {
    return false; // on réessaiera au prochain tour
  }
  oublierCloture();
  return true;
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
