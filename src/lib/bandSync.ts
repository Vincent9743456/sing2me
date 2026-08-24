/**
 * Étape 2b — Répertoire partagé d'un groupe.
 *
 * Chaque membre a ses propres identifiants locaux (morceaux, groupe) :
 * le cloud utilise donc des clés neutres — le titre normalisé pour les
 * morceaux, 'band'/'' pour le contexte des notes — et chaque application
 * traduit vers SES identifiants au moment d'appliquer.
 *
 * Fusion : le plus récent gagne (updatedAt), avec garde d'égalité de
 * contenu pour éviter les allers-retours ; les notes s'unissent par id.
 * Fonctions pures — testées dans le bac à sable.
 */
import { findSameSong } from './importer';
import { bandKeysMatch, songKey } from './normalizeTitle';
import { removeVersion, versionForBand } from './model';
import {
  ArtistLink,
  Band,
  makeId,
  Setlist,
  Song,
  SongNote,
  StageSetup,
  StructureRow,
} from '../types';

/** Version partagée d'un morceau (celle du groupe). */
export interface SharedVersion {
  name: string;
  key: string;
  tempo: number;
  capo: number;
  structure: StructureRow[];
  lyrics: string;
  /**
   * Le texte que lit le public pour cette version (b224). Il VOYAGE avec la
   * version, sinon chaque membre diffuserait un texte différent pour le même
   * morceau du répertoire — et celui qui a pris la peine de le corriger
   * serait le seul à en profiter.
   */
  publicLyrics?: { text: string; from: string; updatedAt: string };
  /**
   * Dernière modification du contenu de CETTE version. C'est ce timestamp
   * (et non `SharedSong.updatedAt`, qui reflète tout le morceau côté
   * expéditeur) qui décide si l'édition d'une version de groupe se propage
   * aux autres membres.
   */
  updatedAt: string;
  /**
   * QUI a proposé ce morceau au répertoire (b420) — posé par l'application
   * de celui qui a fait l'acte, recopié par les membres qui l'acceptent.
   * PROVENANCE, pas contenu : `versionEqual` l'ignore (un vieux blob sans
   * ce champ n'est pas une « édition »), et la fusion ne l'efface jamais —
   * l'export d'un client qui l'ignore ne doit pas faire oublier l'auteur.
   */
  par?: { id: string; nom: string };
}

export interface SharedSong {
  /**
   * Identifiant partagé : `songKey(titre, artiste)` depuis b132 — les
   * vieux blobs contiennent des clés « titre seul », re-canonisées à la
   * fusion (le titre et l'artiste voyagent dans l'entrée). Toute
   * comparaison avec une clé STOCKÉE (retraits, items de setlist) passe
   * par `bandKeysMatch`, jamais par `===`.
   */
  key: string;
  title: string;
  artist: string;
  durationSec: number;
  tags: string[];
  version: SharedVersion;
  /** Notes partagées — bandId neutre : 'band' (ce groupe) ou '' (générale) */
  notes: SongNote[];
  updatedAt: string;
}

export interface SharedSetlist {
  id: string;
  name: string;
  comment: string;
  /** Auteur de la setlist (b146) : lui seul peut la retirer du groupe. */
  createdBy?: string;
  createdByName?: string;
  /** Items par titre normalisé (les ids de morceaux sont locaux) */
  items: { key: string; note: string; keyOverride: string }[];
  setup?: StageSetup;
  updatedAt: string;
}

/** Retrait d'un morceau du répertoire du groupe (par titre normalisé). */
export interface RemovedEntry {
  key: string;
  at: string;
}

/**
 * L'IDENTITÉ DU GROUPE, TELLE QUE SON CRÉATEUR L'A ÉCRITE (b273, constat de
 * Vincent : « Gaëlle que j'ai invitée ne voit pas la photo du groupe »).
 *
 * Elle n'était PARTAGÉE NULLE PART : `cloud_bands` ne porte que le nom, et
 * un membre n'a même pas le droit d'y lire (la politique RLS ne connaît que
 * le propriétaire — c'est pour ça que `band_owner` est une fonction). La
 * photo restait donc sur le téléphone de celui qui l'avait choisie, et
 * chaque membre voyait un rond gris.
 *
 * Elle voyage avec le RÉPERTOIRE, le canal que les membres partagent déjà :
 * pas une ligne de SQL à exécuter, et le lot marche pour tout le monde dès la
 * mise à jour. Seul le CRÉATEUR l'écrit (son application est la seule à
 * l'exporter) ; les autres ne font que l'appliquer. Ce qui est PERSONNEL —
 * masquer le groupe au public, par exemple — n'en fait jamais partie.
 */
export interface SharedBand {
  name: string;
  photo: string;
  bio: string;
  links: ArtistLink[];
}

export interface BandData {
  /** Identité écrite par le créateur (b273) — absente des vieux blobs. */
  band?: SharedBand;
  songs: SharedSong[];
  setlists: SharedSetlist[];
  /** Notes de répétition supprimées (par id) — la suppression vaut
   *  pour tous les membres. */
  removedNotes?: RemovedEntry[];
  /** Morceaux retirés du répertoire — pour tous les membres. Chacun
   *  garde la partition dans SA bibliothèque, mais elle ne fait plus
   *  partie de la bibliothèque du groupe. */
  removed?: RemovedEntry[];
}

export function emptyBandData(): BandData {
  return { songs: [], setlists: [], removed: [], removedNotes: [] };
}

/* ------------------------------------------------------------------ */
/* Export : ce que CE membre apporte au répertoire commun              */
/* ------------------------------------------------------------------ */

function sharedNotes(notes: SongNote[], localBandId: string): SongNote[] {
  return notes
    .filter(
      (n) =>
        n.visibility === 'groupe' &&
        ((n.bandId ?? '') === '' || n.bandId === localBandId),
    )
    .map((n) => ({ ...n, bandId: n.bandId === localBandId ? 'band' : '' }));
}

export function exportBandData(
  songs: Song[],
  setlists: Setlist[],
  localBandId: string,
  /** Retraits décidés localement (à propager aux membres) */
  removals: RemovedEntry[] = [],
  /** Notes supprimées localement (id + date) */
  noteRemovals: RemovedEntry[] = [],
  /** Identité du groupe — fournie SEULEMENT par son créateur (b273). */
  identite?: SharedBand,
): BandData {
  const out: BandData = {
    ...(identite ? { band: identite } : {}),
    songs: [],
    setlists: [],
    removed: removals.slice(-300),
    removedNotes: noteRemovals.slice(-300),
  };
  for (const s of songs) {
    const v = versionForBand(s, localBandId);
    if (!v || s.idea === true) continue;
    const key = songKey(s.title, s.artist);
    if (key === '') continue;
    out.songs.push({
      key,
      title: s.title,
      artist: s.artist,
      durationSec: s.durationSec,
      tags: s.tags,
      version: {
        name: v.name,
        key: v.key,
        tempo: v.tempo,
        capo: v.capo,
        structure: v.structure,
        lyrics: v.lyrics,
        publicLyrics: v.publicLyrics,
        // Repli sur le timestamp du morceau pour les versions héritées
        // d'avant le suivi par version.
        updatedAt: v.updatedAt ?? s.updatedAt,
        par: v.par,
      },
      notes: sharedNotes(s.rehearsalNotes, localBandId),
      updatedAt: s.updatedAt,
    });
  }
  for (const sl of setlists) {
    if ((sl.bandId ?? '') !== localBandId) continue;
    const bySongId = new Map(songs.map((s) => [s.id, s]));
    out.setlists.push({
      id: sl.id,
      name: sl.name,
      comment: sl.comment,
      createdBy: sl.createdBy ?? '',
      createdByName: sl.createdByName ?? '',
      items: sl.items
        .map((it) => {
          const song = bySongId.get(it.songId);
          const key = song ? songKey(song.title, song.artist) : '';
          return key === ''
            ? null
            : { key, note: it.note, keyOverride: it.keyOverride };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      setup: sl.setup,
      updatedAt: sl.updatedAt,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fusion cloud ↔ export local (le plus récent gagne, notes unies)     */
/* ------------------------------------------------------------------ */

function versionEqual(a: SharedVersion, b: SharedVersion): boolean {
  return (
    a.key === b.key &&
    a.tempo === b.tempo &&
    a.capo === b.capo &&
    a.lyrics === b.lyrics &&
    // Même cicatrice b202 côté groupe : sans cette ligne, une version qui ne
    // diffère QUE par le texte du public passait pour identique, et la
    // correction d'un membre n'atteignait jamais les autres.
    JSON.stringify(a.publicLyrics ?? null) ===
      JSON.stringify(b.publicLyrics ?? null) &&
    JSON.stringify(a.structure.map((r) => [r.label, r.chords, r.comment])) ===
      JSON.stringify(b.structure.map((r) => [r.label, r.chords, r.comment]))
  );
}

function mergeNotes(a: SongNote[], b: SongNote[]): SongNote[] {
  const map = new Map<string, SongNote>();
  for (const n of a) map.set(n.id, n);
  for (const n of b) if (!map.has(n.id)) map.set(n.id, n);
  return [...map.values()];
}

/**
 * Migration douce (b132) : re-canonise la clé d'une entrée depuis son
 * titre + artiste (les vieux blobs ont des clés « titre seul »).
 * Idempotent — une entrée déjà canonique ressort identique.
 */
function canonSongs(entries: SharedSong[]): SharedSong[] {
  return entries.map((s) => {
    const key = songKey(s.title, s.artist) || s.key;
    return key === s.key ? s : { ...s, key };
  });
}

/** Un retrait vise-t-il cette clé ? (clés anciennes et nouvelles mêlées) */
function removalFor(
  removed: Map<string, RemovedEntry>,
  key: string,
): RemovedEntry | undefined {
  const exact = removed.get(key);
  if (exact) return exact;
  for (const r of removed.values()) {
    if (bandKeysMatch(r.key, key)) return r;
  }
  return undefined;
}

/** L'identité que publie le CRÉATEUR (les autres n'en exportent aucune). */
export function identiteDuGroupe(band: Band): SharedBand {
  return {
    name: band.name ?? '',
    photo: band.photo ?? '',
    bio: band.bio ?? '',
    links: (band.links ?? []).filter((l) => (l.url ?? '') !== ''),
  };
}

/**
 * Ce que l'identité reçue change dans MON groupe — `null` si rien.
 *
 * On ne recopie que ce que le créateur écrit : le masquage au public, lui,
 * est un choix PERSONNEL (b227) et ne doit jamais voyager. Et on ne remonte
 * jamais le temps : une identité plus vieille que la mienne est ignorée.
 */
export function appliquerIdentite(band: Band, part: SharedBand): Band | null {
  // Le créateur EST la source : son application n'applique jamais, elle
  // publie. Sans cette garde, sa propre photo lui reviendrait en boucle.
  if (band.owned === true) return null;
  // Un nom vide n'écrase rien : mieux vaut garder celui qu'on connaît que
  // d'afficher un groupe sans nom parce qu'un blob est arrivé incomplet.
  const nom = part.name !== '' ? part.name : (band.name ?? '');
  const change =
    (band.name ?? '') !== nom ||
    (band.photo ?? '') !== part.photo ||
    (band.bio ?? '') !== part.bio ||
    JSON.stringify(band.links ?? []) !== JSON.stringify(part.links);
  if (!change) return null;
  // `hiddenFromPublic` et le reste ne bougent pas : ce sont MES choix.
  return { ...band, name: nom, photo: part.photo, bio: part.bio, links: part.links };
}

export function mergeBandData(cloud: BandData, local: BandData): BandData {
  // Identité du groupe (b273). Pas d'arbitrage à faire : SEUL le créateur en
  // exporte une, donc `local.band` n'est renseignée que dans SON application
  // — et c'est elle qui fait autorité. Chez un membre, elle est absente et
  // celle du cloud passe telle quelle.
  const identite = local.band ?? cloud.band;
  // Retraits : union, le plus récent gagne par titre.
  const removed = new Map<string, RemovedEntry>();
  for (const r of [...(cloud.removed ?? []), ...(local.removed ?? [])]) {
    const cur = removed.get(r.key);
    if (!cur || r.at > cur.at) removed.set(r.key, r);
  }
  // Notes supprimées : une suppression par UN membre vaut pour tous.
  const removedNotes = new Map<string, RemovedEntry>();
  for (const r of [...(cloud.removedNotes ?? []), ...(local.removedNotes ?? [])]) {
    const cur = removedNotes.get(r.key);
    if (!cur || r.at > cur.at) removedNotes.set(r.key, r);
  }
  const songs = new Map<string, SharedSong>();
  for (const s of canonSongs(cloud.songs)) songs.set(s.key, s);
  for (const s of canonSongs(local.songs)) {
    const other = songs.get(s.key);
    if (!other) {
      songs.set(s.key, s);
      continue;
    }
    // Le CONTENU de la version de groupe est arbitré par le timestamp de la
    // VERSION (pas du morceau) : une édition de la version « Vince et
    // Marcus » gagne, même si l'autre membre a touché son morceau plus
    // récemment pour une autre raison (version perso, notes, tags…).
    const same = versionEqual(s.version, other.version);
    const sAt = s.version.updatedAt || s.updatedAt;
    const oAt = other.version.updatedAt || other.updatedAt;
    const newer = sAt > oAt ? s : other;
    const older = sAt > oAt ? other : s;
    const winner = same ? older : newer;
    // La provenance ne se perd jamais (b420) : si le camp qui gagne la
    // fusion ne la porte pas (client d'avant b420, copie d'un membre qui
    // a accepté sans elle), on garde celle de l'autre camp.
    const par = winner.version.par ?? other.version.par ?? s.version.par;
    songs.set(s.key, {
      ...winner,
      ...(par && !winner.version.par
        ? { version: { ...winner.version, par } }
        : {}),
      // Le morceau garde le timestamp le plus récent des deux côtés — la
      // détection « ré-apporté après un retrait » (plus bas) doit rester
      // basée sur l'activité globale du morceau.
      updatedAt: s.updatedAt > other.updatedAt ? s.updatedAt : other.updatedAt,
      notes: mergeNotes(other.notes, s.notes),
    });
  }
  // Setlists retirées du groupe (b146) : la clé « #setlist:<id> » voyage
  // dans les mêmes retraits que les morceaux.
  const goneSetlists = new Set(
    [...removed.values()]
      .filter((r) => r.key.startsWith('#setlist:'))
      .map((r) => r.key.slice('#setlist:'.length)),
  );
  const setlists = new Map<string, SharedSetlist>();
  for (const sl of cloud.setlists) setlists.set(sl.id, sl);
  for (const sl of local.setlists) {
    const other = setlists.get(sl.id);
    if (!other) {
      setlists.set(sl.id, sl);
      continue;
    }
    const same =
      JSON.stringify({ ...sl, updatedAt: '' }) ===
      JSON.stringify({ ...other, updatedAt: '' });
    const newer = sl.updatedAt > other.updatedAt ? sl : other;
    const older = sl.updatedAt > other.updatedAt ? other : sl;
    setlists.set(sl.id, same ? older : newer);
  }
  // Un retrait l'emporte sur le morceau… sauf si le morceau a été
  // (ré)apporté APRÈS le retrait — geste explicite d'un membre.
  // Correspondance SOUPLE : un retrait « titre seul » (ancien format)
  // vaut aussi pour la clé « titre @ artiste », et réciproquement.
  const keptSongs = [...songs.values()].filter((s) => {
    const r = removalFor(removed, s.key);
    return !r || s.updatedAt > r.at;
  });
  return {
    ...(identite ? { band: identite } : {}),
    songs: keptSongs.map((s) => ({
      ...s,
      notes: s.notes.filter((n) => !removedNotes.has(n.id)),
    })),
    setlists: [...setlists.values()].filter((sl) => !goneSetlists.has(sl.id)),
    removed: [...removed.values()]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-300),
    removedNotes: [...removedNotes.values()]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-300),
  };
}

export function bandDataEqual(a: BandData, b: BandData): boolean {
  const norm = (d: BandData) =>
    JSON.stringify({
      // Cicatrice b202 : tout champ de `BandData` doit être comparé ICI en
      // plus d'être fusionné, sinon il s'écrit puis n'est jamais renvoyé.
      band: d.band ?? null,
      songs: [...d.songs].sort((x, y) => x.key.localeCompare(y.key)),
      setlists: [...d.setlists].sort((x, y) => x.id.localeCompare(y.id)),
      removed: [...(d.removed ?? [])].sort((x, y) =>
        x.key.localeCompare(y.key),
      ),
      removedNotes: [...(d.removedNotes ?? [])].sort((x, y) =>
        x.key.localeCompare(y.key),
      ),
    });
  return norm(a) === norm(b);
}

/* ------------------------------------------------------------------ */
/* Application : le répertoire commun entre dans MA bibliothèque       */
/* ------------------------------------------------------------------ */

export function applyBandData(
  cloud: BandData,
  songs: Song[],
  setlists: Setlist[],
  localBandId: string,
  /** Titres supprimés localement : ne pas les ré-importer du groupe */
  skipKeys?: Set<string>,
  /** Setlists supprimées localement (ids) : ne pas les ré-créer du groupe */
  skipSetlistIds?: Set<string>,
): { songs: Song[]; setlists: Setlist[]; changed: boolean } {
  let changed = false;
  // Index par clé canonique (titre @ artiste). La résolution d'une clé
  // STOCKÉE (entrée du blob, retrait, item de setlist — potentiellement à
  // l'ancien format titre seul) passe par `resolve`, en correspondance
  // souple, jamais par un accès direct avec `===`.
  const byKey = new Map(songs.map((s) => [songKey(s.title, s.artist), s]));
  const resolve = (key: string): Song | undefined => {
    if (key === '') return undefined;
    const exact = byKey.get(key);
    if (exact) return exact;
    for (const [k, s] of byKey) {
      if (bandKeysMatch(k, key)) return s;
    }
    return undefined;
  };
  let nextSongs = [...songs];

  // Notes supprimées par un membre : purge locale (dans tous mes morceaux)
  const deadNotes = new Set((cloud.removedNotes ?? []).map((r) => r.key));
  if (deadNotes.size > 0) {
    nextSongs = nextSongs.map((s) => {
      if (!s.rehearsalNotes.some((n) => deadNotes.has(n.id))) return s;
      changed = true;
      const cleaned = {
        ...s,
        rehearsalNotes: s.rehearsalNotes.filter((n) => !deadNotes.has(n.id)),
      };
      byKey.set(songKey(s.title, s.artist), cleaned);
      return cleaned;
    });
  }

  // Retraits du répertoire : la version « groupe » disparaît de MA
  // bibliothèque (le morceau lui-même reste — en personnel).
  for (const r of cloud.removed ?? []) {
    const local = resolve(r.key);
    if (!local) continue;
    if (local.updatedAt > r.at) continue; // ré-apporté après le retrait
    // UNE PROPOSITION NON ACCEPTÉE SUIT LE RETRAIT (b418, arbitrage
    // Vincent) : si le groupe retire le morceau avant que ce membre l'ait
    // accepté, sa copie « proposition » disparaît — elle n'a jamais été à
    // lui, et une proposition ne se refuse plus (elle attend, ou meurt
    // ici). Une copie ACCEPTÉE, elle, reste : chacun garde sa copie
    // personnelle (b110), qui redevient personnelle juste en dessous.
    if (local.idea === true && (local.pendingBandId ?? '') === localBandId) {
      nextSongs = nextSongs.filter((s) => s.id !== local.id);
      byKey.delete(songKey(local.title, local.artist));
      changed = true;
      continue;
    }
    const v = versionForBand(local, localBandId);
    if (!v) continue;
    let next: Song;
    if (local.versions.length > 1) {
      next = removeVersion(local, v.id);
    } else {
      // Seule version : elle devient personnelle (la partition reste)
      next = {
        ...local,
        versions: local.versions.map((x) =>
          x.id === v.id ? { ...x, bandId: '' } : x,
        ),
      };
    }
    nextSongs = nextSongs.map((s) => (s.id === local.id ? next : s));
    byKey.set(songKey(next.title, next.artist), next);
    changed = true;
  }

  for (const e of cloud.songs) {
    const localNotes = e.notes.map((n) => ({
      ...n,
      bandId: n.bandId === 'band' ? localBandId : '',
    }));
    // Rapprochement : titre exact, sinon similitude forte titre + paroles
    // (« Imagine » chez Vincent = « Imagine John Lennon » chez Marco →
    // nouvelle version du même morceau, jamais de doublon).
    const local =
      resolve(e.key) ??
      findSameSong(nextSongs, e.title, e.version.lyrics, e.artist) ??
      undefined;
    // Supprimé chez moi (pierre tombale, anciens et nouveaux formats de
    // clé mêlés) : ne pas ré-importer.
    if (
      !local &&
      skipKeys &&
      [...skipKeys].some((k) => bandKeysMatch(k, e.key))
    )
      continue;
    if (!local) {
      // Nouveau morceau apporté par un autre membre : il arrive dans les
      // IDÉES de la bibliothèque (décision Vincent, b174). Il ne se mélange
      // donc pas aux morceaux qu'on joue vraiment, mais il a bien une place
      // chez soi — plus de limbes séparées. `pendingBandId` ne sert plus
      // qu'à dire d'où il vient. Le programmer dans une setlist l'inscrit
      // définitivement en bibliothèque (voir store.saveSetlist).
      const vid = makeId();
      const song: Song = {
        id: makeId(),
        title: e.title,
        artist: e.artist,
        key: e.version.key,
        tempo: e.version.tempo,
        capo: e.version.capo,
        durationSec: e.durationSec,
        tags: [...e.tags],
        structure: e.version.structure,
        lyrics: e.version.lyrics,
        publicLyrics: e.version.publicLyrics,
        pendingBandId: localBandId,
        idea: true,
        versions: [
          {
            id: vid,
            name: e.version.name || 'Version groupe',
            bandId: localBandId,
            par: e.version.par,
            key: e.version.key,
            tempo: e.version.tempo,
            capo: e.version.capo,
            structure: e.version.structure,
            lyrics: e.version.lyrics,
            publicLyrics: e.version.publicLyrics,
            updatedAt: e.version.updatedAt,
          },
        ],
        activeVersionId: vid,
        rehearsalNotes: localNotes,
        hearts: 0,
        fanMessages: [],
        createdAt: e.updatedAt,
        updatedAt: e.updatedAt,
      };
      nextSongs.push(song);
      byKey.set(e.key, song);
      byKey.set(songKey(song.title, song.artist), song);
      changed = true;
      continue;
    }
    let song = local;
    const bandV = versionForBand(song, localBandId);
    if (!bandV) {
      // Le morceau existe chez moi mais sans version pour ce groupe
      song = {
        ...song,
        versions: [
          ...song.versions,
          {
            id: makeId(),
            name: e.version.name || 'Version groupe',
            bandId: localBandId,
            par: e.version.par,
            key: e.version.key,
            tempo: e.version.tempo,
            capo: e.version.capo,
            structure: e.version.structure,
            lyrics: e.version.lyrics,
            publicLyrics: e.version.publicLyrics,
            updatedAt: e.version.updatedAt,
          },
        ],
      };
      changed = true;
    } else if (
      // Arbitrage par le timestamp de la VERSION de groupe : l'édition
      // d'un membre est appliquée dès qu'elle est plus récente que MA
      // copie de cette même version — que j'aie touché mon morceau pour
      // d'autres raisons ou non.
      (e.version.updatedAt || e.updatedAt) > (bandV.updatedAt ?? '') &&
      !versionEqual(
        {
          name: bandV.name,
          key: bandV.key,
          tempo: bandV.tempo,
          capo: bandV.capo,
          structure: bandV.structure,
          lyrics: bandV.lyrics,
          publicLyrics: bandV.publicLyrics,
          updatedAt: bandV.updatedAt ?? '',
        },
        e.version,
      )
    ) {
      // Version du groupe mise à jour par un autre membre
      song = {
        ...song,
        versions: song.versions.map((v) =>
          v.id === bandV.id
            ? {
                ...v,
                key: e.version.key,
                tempo: e.version.tempo,
                capo: e.version.capo,
                structure: e.version.structure,
                lyrics: e.version.lyrics,
                publicLyrics: e.version.publicLyrics,
                updatedAt: e.version.updatedAt,
              }
            : v,
        ),
        // Si c'est la version affichée, les champs actifs suivent
        ...(song.activeVersionId === bandV.id
          ? {
              key: e.version.key,
              tempo: e.version.tempo,
              capo: e.version.capo,
              structure: e.version.structure,
              lyrics: e.version.lyrics,
              publicLyrics: e.version.publicLyrics,
            }
          : {}),
        updatedAt: e.updatedAt > song.updatedAt ? e.updatedAt : song.updatedAt,
      };
      changed = true;
    }
    // Rattrapage de PROVENANCE (b420) : une version reçue avant b420 ne
    // porte pas son auteur — on le recopie dès qu'un blob l'apporte, sans
    // toucher aux timestamps (réparation silencieuse, cicatrice b248).
    const versionDuGroupe = versionForBand(song, localBandId);
    if (versionDuGroupe && !versionDuGroupe.par && e.version.par) {
      const par = e.version.par;
      song = {
        ...song,
        versions: song.versions.map((v) =>
          v.id === versionDuGroupe.id ? { ...v, par } : v,
        ),
      };
      changed = true;
    }
    // Notes partagées : union par id
    const known = new Set(song.rehearsalNotes.map((n) => n.id));
    const fresh = localNotes.filter((n) => !known.has(n.id));
    if (fresh.length > 0) {
      song = { ...song, rehearsalNotes: [...song.rehearsalNotes, ...fresh] };
      changed = true;
    }
    if (song !== local) {
      const idx = nextSongs.findIndex((s) => s.id === local.id);
      nextSongs[idx] = song;
      byKey.set(e.key, song);
      byKey.set(songKey(song.title, song.artist), song);
    }
  }

  // Setlists retirées du groupe par leur auteur (b146) : elles
  // disparaissent chez les AUTRES membres. Chez l'auteur, elles ont déjà
  // été détachées (bandId vide) — on ne touche donc jamais à une setlist
  // qui n'appartient plus au groupe.
  let nextSetlists = [...setlists];
  for (const r of cloud.removed ?? []) {
    if (!r.key.startsWith('#setlist:')) continue;
    const slId = r.key.slice('#setlist:'.length);
    nextSetlists = nextSetlists.filter((sl) => {
      const mine = (sl.bandId ?? '') === localBandId;
      if (sl.id !== slId || !mine) return true;
      changed = true;
      return false;
    });
  }

  for (const e of cloud.setlists) {
    // Setlist supprimée localement : ne pas la ressusciter depuis le groupe.
    if (skipSetlistIds?.has(e.id)) continue;
    // Retirée du groupe par son auteur : idem.
    if ((cloud.removed ?? []).some((r) => r.key === `#setlist:${e.id}`)) {
      continue;
    }
    const resolveItems = () =>
      e.items
        .map((it) => {
          const song = resolve(it.key);
          if (!song) return null;
          return {
            id: makeId(),
            songId: song.id,
            note: it.note,
            keyOverride: it.keyOverride,
            versionId: versionForBand(song, localBandId)?.id ?? '',
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    const idx = nextSetlists.findIndex((sl) => sl.id === e.id);
    if (idx === -1) {
      nextSetlists.push({
        id: e.id,
        name: e.name,
        comment: e.comment,
        // L'auteur voyage avec la setlist (b146) : lui seul pourra la
        // retirer du groupe, et les autres savent à qui elle est.
        createdBy: e.createdBy ?? '',
        createdByName: e.createdByName ?? '',
        bandId: localBandId,
        items: resolveItems(),
        setup: e.setup,
        createdAt: e.updatedAt,
        updatedAt: e.updatedAt,
      });
      changed = true;
    } else {
      const local = nextSetlists[idx];
      const aJour = e.updatedAt > local.updatedAt;
      /**
       * RETOUR DANS LE GROUPE (b185). Quitter un groupe DÉTACHE ses setlists
       * (`bandId` vidé) au lieu de les supprimer — on ne veut pas effacer le
       * travail de quelqu'un. Mais au retour, le blob du groupe ne porte
       * aucune date plus récente : rien ne se déclenchait, la setlist restait
       * hors du groupe, et le groupe semblait n'en avoir aucune. C'est ce que
       * Marco a vu (« la playlist du groupe est vide »).
       */
      const aRattacher = (local.bandId ?? '') !== localBandId;
      /** Ses morceaux avaient disparu : le groupe les propose, on regarnit. */
      const aRegarnir = local.items.length === 0 && e.items.length > 0;
      if (aJour || aRattacher || aRegarnir) {
        nextSetlists[idx] = {
          ...local,
          // Ce que le groupe dicte : l'appartenance, et l'auteur.
          bandId: localBandId,
          createdBy: e.createdBy ?? local.createdBy ?? '',
          createdByName: e.createdByName ?? local.createdByName ?? '',
          // Le contenu ne change QUE si le groupe est plus à jour que moi —
          // sinon on écraserait l'ordre et le nom que j'ai choisis.
          ...(aJour
            ? {
                name: e.name,
                comment: e.comment,
                setup: e.setup,
                updatedAt: e.updatedAt,
              }
            : {}),
          items: aJour || aRegarnir ? resolveItems() : local.items,
        };
        changed = true;
      }
    }
  }

  return { songs: nextSongs, setlists: nextSetlists, changed };
}
