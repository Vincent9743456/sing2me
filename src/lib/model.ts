/**
 * Aides sur le modèle : extraction d'accords, migration des anciennes
 * données (modèle à sections → structure en tête + paroles continues).
 */
import {
  Spelling,
  spellingForKey,
  transposeChord,
  transposeContent,
  transposeKeyName,
} from './chords';
import { ligneDeSection, sectionDeLaLigne } from './sections';
import {
  decodeHtmlEntities,
  fixGlyphSpaces,
  hasBrokenEntities,
  hasGlyphSpaces,
  repairChordedLyrics,
  stripControlChars,
} from './textRepair';

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
import {
  ArtistProfile,
  Band,
  Concert,
  estBrouillon,
  makeId,
  Setlist,
  Song,
  SongNote,
  SongVersion,
  StructureRow,
} from '../types';

/**
 * TAGS À AFFICHER (b293, demande de Vincent) : on masque le tag qui répète le
 * nom de l'artiste — beaucoup de fichiers importés portent « Pink Floyd » en
 * tag, doublon inutile du champ artiste déjà affiché. On FILTRE à l'affichage,
 * sans jamais toucher au stockage : rien n'est réécrit (cicatrice b290), la
 * donnée reste, elle ne se voit simplement plus.
 */
export function tagsAffichables(song: Pick<Song, 'tags' | 'artist'>): string[] {
  const a = (song.artist ?? '').trim().toLowerCase();
  const tags = song.tags ?? [];
  if (a === '') return tags;
  return tags.filter((tag) => tag.trim().toLowerCase() !== a);
}

/** Suite des accords [X] d'un texte, doublons consécutifs supprimés. */
export function extractChordSequence(content: string): string {
  const found: string[] = [];
  const re = /\[([^\]\n]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const sym = m[1].trim();
    if (found[found.length - 1] !== sym) found.push(sym);
  }
  return found.join(' ');
}

/** Transpose une suite d'accords "C D E G". */
export function transposeChordSequence(
  seq: string,
  semitones: number,
  preferFlat: Spelling,
): string {
  if (semitones === 0 || seq.trim() === '') return seq;
  return seq
    .split(/(\s+)/)
    .map((tok) =>
      /^\s+$/.test(tok) || tok === '' ? tok : transposeChord(tok, semitones, preferFlat),
    )
    .join('');
}

interface LegacySection {
  id?: string;
  label?: string;
  content?: string;
}

/**
 * Le créateur d'un groupe en devient automatiquement le premier membre,
 * avec ses infos de profil (nom d'artiste, matériel).
 */
export function creatorMember(
  artist: ArtistProfile,
  userName: string,
  /** Mon compte (b249) : dès la création, ma ligne porte mon identifiant —
   *  aucun rapprochement par le nom n'aura jamais à être tenté sur elle. */
  userId?: string,
): import('../types').BandMember {
  return {
    id: makeId(),
    name: userName || artist.name || 'Moi',
    ...(userId ? { userId } : {}),
    instrument: '',
    photo: artist.photo || undefined,
    verified: true,
    gear: artist.gear ? artist.gear.map((g) => ({ ...g })) : [],
  };
}

/** Version d'un morceau correspondant à un groupe donné ('' = solo). */
export function versionForBand(song: Song, bandId: string): SongVersion | null {
  return song.versions.find((v) => (v.bandId ?? '') === bandId) ?? null;
}

/**
 * Invariant fondamental : la PREMIÈRE version (`versions[0]`) est toujours
 * la version ORIGINALE, personnelle (bandId ''), maîtresse — elle reste dans
 * la bibliothèque perso et pilote les autres (voir `propagateMainKeyCapo`).
 * Elle n'est jamais absorbée par un groupe ni supprimée.
 *
 * Cette fonction garantit l'invariant sur un morceau : si `versions[0]` a
 * été rattachée à un groupe (donnée abîmée), on restaure une originale —
 * en promouvant une version solo existante, sinon en insérant une copie
 * personnelle du contenu courant. Idempotente.
 */
export function ensureOriginalVersion(song: Song): Song {
  if (!Array.isArray(song.versions) || song.versions.length === 0) return song;
  if ((song.versions[0].bandId ?? '') === '') return song; // déjà conforme
  // Une version solo existe plus loin → on la remet en tête (maîtresse).
  const soloIdx = song.versions.findIndex((v) => (v.bandId ?? '') === '');
  if (soloIdx > 0) {
    const solo = song.versions[soloIdx];
    const rest = song.versions.filter((_, i) => i !== soloIdx);
    return { ...song, versions: [solo, ...rest] };
  }
  // Aucune version solo : on crée l'originale personnelle à partir du
  // contenu de la version actuellement en tête (copie indépendante).
  const first = song.versions[0];
  const original: SongVersion = {
    ...first,
    id: makeId(),
    name: 'Original',
    bandId: '',
    structure: first.structure.map((r) => ({ ...r, id: makeId() })),
  };
  return { ...song, versions: [original, ...song.versions] };
}

/**
 * Version à ouvrir par défaut selon le contexte d'ouverture d'un morceau :
 * - depuis un groupe → la version de ce groupe si elle existe ;
 * - depuis la bibliothèque / solo (bandId '') → la version originale.
 * Repli : version originale, sinon la première version.
 */
export function contextVersionId(song: Song, bandId: string): string {
  // Contexte groupe : la version du groupe, sinon l'originale.
  // Contexte solo ('') : l'originale, tout simplement (b211).
  const v =
    versionForBand(song, bandId) ?? versionForBand(song, '') ?? song.versions[0];
  return v?.id ?? song.activeVersionId;
}

/**
 * « Version Solo » : notion SUPPRIMÉE (arbitrage Vincent, b211 — annule
 * b115). Un morceau, c'est l'originale + au plus une version par groupe,
 * rien d'autre : la version Solo faisait doublon avec l'originale, qui EST
 * déjà ma façon de le jouer seul.
 *
 * Ce qui a été écrit ne se jette pas : les versions Solo déjà enregistrées
 * redeviennent des versions PERSONNELLES ordinaires (bandId ''), gardées
 * dans la liste des versions du morceau. Idempotente.
 */
const ANCIEN_CONTEXTE_SOLO = 'solo';

export function retireVersionSolo(song: Song): Song {
  if (!Array.isArray(song.versions)) return song;
  if (!song.versions.some((v) => (v.bandId ?? '') === ANCIEN_CONTEXTE_SOLO)) {
    return song;
  }
  return {
    ...song,
    versions: song.versions.map((v) =>
      (v.bandId ?? '') === ANCIEN_CONTEXTE_SOLO ? { ...v, bandId: '' } : v,
    ),
  };
}

/**
 * b219 — LES SECTIONS REVIENNENT DANS LES PAROLES.
 *
 * L'import reconnaissait « Refrain », s'en servait pour bâtir le résumé de
 * structure… puis effaçait le mot des paroles. Depuis que « Structure » est
 * devenu un bloc de notes libres, plus aucun écran ne l'affichait : toute la
 * bibliothèque déjà importée est un pavé continu.
 *
 * On le repose — mais SEULEMENT quand c'est certain. `structure` a été
 * construite à partir des mêmes blocs que `lyrics`, dans le même ordre, et
 * chaque ligne porte la suite d'accords de son bloc : si les comptes
 * coïncident ET que chaque suite d'accords recalculée retombe sur celle qui
 * est enregistrée, l'appariement n'est pas une hypothèse. Au moindre écart,
 * on ne touche à rien : mieux vaut un pavé qu'un « Refrain » posé sur un
 * couplet. Idempotente (un bloc déjà titré fait renoncer).
 */
function reposerLesSections(
  lyrics: string,
  structure: StructureRow[] | undefined,
): string {
  if (!Array.isArray(structure) || structure.length === 0) return lyrics;
  if (lyrics.trim() === '') return lyrics;
  const blocs = lyrics.split(/\n{2,}/);
  if (blocs.length !== structure.length) return lyrics;
  const labels: string[] = [];
  for (let i = 0; i < blocs.length; i++) {
    const label = (structure[i].label ?? '').trim();
    // Le libellé doit faire partie du vocabulaire des sections, sinon il
    // s'afficherait comme une parole (« Section : », « Partie B : »).
    if (label === '' || sectionDeLaLigne(ligneDeSection(label)) === null) {
      return lyrics;
    }
    // Déjà titré : ne rien empiler.
    if (sectionDeLaLigne(blocs[i].split('\n')[0] ?? '') !== null) return lyrics;
    if (extractChordSequence(blocs[i]) !== (structure[i].chords ?? '')) {
      return lyrics;
    }
    labels.push(label);
  }
  return blocs.map((b, i) => `${ligneDeSection(labels[i])}\n${b}`).join('\n\n');
}

export function restaureSectionsDansParoles(song: Song): Song {
  const lyrics = reposerLesSections(song.lyrics, song.structure);
  const versions = Array.isArray(song.versions)
    ? song.versions.map((v) => {
        const l = reposerLesSections(v.lyrics ?? '', v.structure);
        return l === (v.lyrics ?? '') ? v : { ...v, lyrics: l };
      })
    : song.versions;
  const versionsChangees =
    Array.isArray(song.versions) &&
    versions.some((v, i) => v !== song.versions[i]);
  if (lyrics === song.lyrics && !versionsChangees) return song;
  return { ...song, lyrics, versions };
}

/** Notes visibles dans un contexte de groupe : générales + celles du groupe. */
export function notesForBand(notes: SongNote[], bandId: string): SongNote[] {
  return notes.filter(
    (n) => (n.bandId ?? '') === '' || (n.bandId ?? '') === bandId,
  );
}

/**
 * Complète les enchaînements manquants dans la structure : une section sans
 * accords reprend ceux de la dernière section du même type (Couplet 2 ←
 * Couplet 1), sinon ceux de la dernière section qui en avait (Couplet ←
 * Intro — cas des partitions où les accords ne sont écrits qu'une fois).
 * `inheritedFrom` indique d'où viennent les accords repris ('' = les siens).
 */
export function fillStructureChords(
  rows: StructureRow[],
): (StructureRow & { inheritedFrom: string })[] {
  const byBase = new Map<string, { chords: string; label: string }>();
  let lastAny: { chords: string; label: string } | null = null;
  return rows.map((r) => {
    const base = r.label.trim().toLowerCase().replace(/\s*\d+\s*$/, '');
    if (r.chords.trim() !== '') {
      const src = { chords: r.chords, label: r.label.trim() };
      if (base !== '') byBase.set(base, src);
      lastAny = src;
      return { ...r, inheritedFrom: '' };
    }
    const src = (base !== '' ? byBase.get(base) : undefined) ?? lastAny;
    if (!src) return { ...r, inheritedFrom: '' };
    // On mémorise aussi la reprise : « Couplet 2 » saura hériter même si
    // « Couplet 1 » avait lui-même repris les accords de l'intro.
    if (base !== '' && !byBase.has(base)) byBase.set(base, src);
    return { ...r, chords: src.chords, inheritedFrom: src.label };
  });
}

/**
 * Règle d'héritage : la PREMIÈRE version d'un morceau est sa version
 * principale (l'originale). Quand sa tonalité ou son capo change, les
 * versions qui la SUIVAIENT (même valeur qu'avant le changement)
 * héritent de la nouvelle valeur ; celles qui avaient leur propre
 * réglage le gardent. `prevKey`/`prevCapo` = valeurs de la principale
 * AVANT le changement.
 */
export function propagateMainKeyCapo(
  song: Song,
  prevKey: string,
  prevCapo: number,
): Song {
  const main = song.versions[0];
  if (!main) return song;
  let changed = false;
  const versions = song.versions.map((v, i) => {
    if (i === 0) return v;
    const nk = v.key === prevKey ? main.key : v.key;
    const nc = v.capo === prevCapo ? main.capo : v.capo;
    if (nk === v.key && nc === v.capo) return v;
    changed = true;
    return { ...v, key: nk, capo: nc };
  });
  if (!changed) return song;
  let out: Song = { ...song, versions };
  // Les champs actifs suivent si la version affichée a hérité
  const act = versions.find((v) => v.id === out.activeVersionId);
  if (act && (act.key !== song.key || act.capo !== song.capo)) {
    out = { ...out, key: act.key, capo: act.capo };
  }
  return out;
}

/** La version active d'un morceau (garantie par la migration). */
export function activeVersion(song: Song): SongVersion {
  return (
    song.versions.find((v) => v.id === song.activeVersionId) ?? song.versions[0]
  );
}

/** Le contenu partageable d'une version a-t-il changé par rapport aux
 *  champs actifs d'un morceau ? (paroles, accords, structure, tonalité). */
function versionContentDiffers(
  v: SongVersion,
  song: Pick<
    Song,
    'key' | 'tempo' | 'capo' | 'structure' | 'lyrics' | 'publicLyrics'
  >,
): boolean {
  return (
    v.key !== song.key ||
    v.tempo !== song.tempo ||
    v.capo !== song.capo ||
    v.lyrics !== song.lyrics ||
    // Le texte du public compte comme un contenu de version (b224) : sans
    // lui, corriger CE SEUL texte ne tamponnait pas la version, donc rien
    // ne partait aux autres membres du groupe. C'est la cicatrice b202 —
    // une liste de champs écrite à la main finit toujours par en oublier un.
    JSON.stringify(v.publicLyrics ?? null) !==
      JSON.stringify(song.publicLyrics ?? null) ||
    JSON.stringify(v.structure) !== JSON.stringify(song.structure)
  );
}

/** Réécrit les champs actifs (tonalité, structure, paroles…) dans la version
 *  active. Si son contenu a changé, on tamponne son `updatedAt` propre : c'est
 *  ce timestamp (et non celui du morceau) qui propage l'édition d'une version
 *  de groupe aux autres membres. */
export function syncActiveVersion(song: Song): Song {
  return {
    ...song,
    versions: song.versions.map((v) =>
      v.id === song.activeVersionId
        ? {
            ...v,
            key: song.key,
            tempo: song.tempo,
            capo: song.capo,
            structure: song.structure,
            lyrics: song.lyrics,
            // Le texte du public suit sa version (b224) : sans cette ligne,
            // il resterait collé au morceau et ne partirait jamais au groupe.
            publicLyrics: song.publicLyrics,
            updatedAt: versionContentDiffers(v, song)
              ? new Date().toISOString()
              : v.updatedAt,
          }
        : v,
    ),
  };
}

/** Bascule le morceau sur une autre version (les champs actifs sont remplacés). */
export function switchVersion(song: Song, versionId: string): Song {
  const synced = syncActiveVersion(song);
  const target = synced.versions.find((v) => v.id === versionId);
  if (!target) return synced;
  return {
    ...synced,
    activeVersionId: target.id,
    key: target.key,
    tempo: target.tempo,
    capo: target.capo,
    structure: target.structure,
    lyrics: target.lyrics,
    publicLyrics: target.publicLyrics,
  };
}

/** Copie du morceau avec le contenu d'une version donnée ('' = active), sans changer l'état. */
export function resolveVersion(song: Song, versionId: string): Song {
  if (versionId === '' || versionId === song.activeVersionId) return song;
  const synced = syncActiveVersion(song);
  const target = synced.versions.find((v) => v.id === versionId);
  if (!target) return song;
  return {
    ...song,
    key: target.key,
    tempo: target.tempo,
    capo: target.capo,
    structure: target.structure,
    lyrics: target.lyrics,
    publicLyrics: target.publicLyrics,
  };
}

/**
 * Transpose VRAIMENT la version affichée (b169) : les accords écrits dans les
 * paroles sont réécrits, et la tonalité suit.
 *
 * Auparavant, transposer n'était qu'un réglage d'affichage mémorisé sur
 * l'appareil : le mode scène et le direct republiaient la tonalité stockée,
 * et le changement disparaissait au pire moment. Une transposition est
 * désormais une modification de la version, comme n'importe quelle autre —
 * et elle est sa propre annulation (transposer en sens inverse revient
 * exactement au point de départ).
 *
 * Le capo n'est pas touché ici : il ne change pas les accords écrits.
 */
export function transposeSong(song: Song, semitones: number): Song {
  const shift = ((semitones % 12) + 12) % 12;
  if (shift === 0) return song;
  const newKey = song.key !== '' ? transposeKeyName(song.key, shift) : '';
  // L'orthographe suit la tonalité d'arrivée : en Fa on écrit Sib, pas La#.
  const spelling = spellingForKey(newKey !== '' ? newKey : song.key);
  return syncActiveVersion({
    ...song,
    key: newKey,
    lyrics: transposeContent(song.lyrics, shift, spelling),
    // Le résumé de structure porte aussi des accords (« C D E G ») : il doit
    // suivre, sinon la grille en tête contredirait les paroles.
    structure: song.structure.map((r) => ({
      ...r,
      chords: transposeContent(r.chords, shift, spelling),
    })),
  });
}

/** Change le capo de la version affichée (b169) : c'est une propriété de la
 *  version, pas un réglage d'écran — la scène et le direct doivent la voir. */
export function setSongCapo(song: Song, capo: number): Song {
  const clamped = Math.max(0, Math.min(11, Math.round(capo)));
  if (clamped === song.capo) return song;
  return syncActiveVersion({ ...song, capo: clamped });
}

/**
 * Sépare une version en NOUVEAU morceau indépendant (quand le
 * rapprochement automatique a réuni deux chansons différentes).
 * Renvoie null si le morceau n'a qu'une version.
 */
export function splitVersion(
  song: Song,
  versionId: string,
  newTitle: string,
): { remaining: Song; created: Song } | null {
  if (song.versions.length < 2) return null;
  const synced = syncActiveVersion(song);
  const v = synced.versions.find((x) => x.id === versionId);
  if (!v) return null;
  const remaining = removeVersion(synced, versionId);
  const now = new Date().toISOString();
  const vid = makeId();
  const created: Song = {
    id: makeId(),
    title: newTitle,
    artist: song.artist,
    key: v.key,
    tempo: v.tempo,
    capo: v.capo,
    durationSec: song.durationSec,
    tags: [...song.tags],
    structure: v.structure,
    lyrics: v.lyrics,
    versions: [
      {
        id: vid,
        name: 'Original',
        bandId: '',
        key: v.key,
        tempo: v.tempo,
        capo: v.capo,
        structure: v.structure,
        lyrics: v.lyrics,
      },
    ],
    activeVersionId: vid,
    rehearsalNotes: [],
    hearts: 0,
    fanMessages: [],
    createdAt: now,
    updatedAt: now,
  };
  return { remaining, created };
}

/**
 * Répare l'invariant « une seule version par groupe » sur un morceau :
 * s'il existe plusieurs versions pour le MÊME groupe (doublons
 * historiques), on garde la plus récemment modifiée (updatedAt) et on
 * rebranche la version active si elle faisait partie des doublons.
 * Les versions personnelles (bandId '') ne sont jamais touchées.
 */
export function dedupeBandVersions(song: Song): Song {
  if (!Array.isArray(song.versions) || song.versions.length < 2) return song;
  const keeper = new Map<string, SongVersion>();
  for (const v of song.versions) {
    const bid = v.bandId ?? '';
    if (bid === '') continue;
    const cur = keeper.get(bid);
    if (!cur || (v.updatedAt ?? '') >= (cur.updatedAt ?? '')) {
      keeper.set(bid, v);
    }
  }
  const keepIds = new Set<string>();
  for (const v of song.versions) {
    const bid = v.bandId ?? '';
    if (bid === '' || keeper.get(bid)?.id === v.id) keepIds.add(v.id);
  }
  if (keepIds.size === song.versions.length) return song;
  const versions = song.versions.filter((v) => keepIds.has(v.id));
  if (versions.some((v) => v.id === song.activeVersionId)) {
    return { ...song, versions };
  }
  // L'active était un doublon supprimé → on bascule sur la version
  // conservée de son groupe (miroir des champs du morceau inclus).
  const wasActive = song.versions.find((v) => v.id === song.activeVersionId);
  const repl =
    (wasActive ? keeper.get(wasActive.bandId ?? '') : undefined) ?? versions[0];
  return {
    ...song,
    versions,
    activeVersionId: repl.id,
    key: repl.key,
    tempo: repl.tempo,
    capo: repl.capo,
    structure: repl.structure,
    lyrics: repl.lyrics,
  };
}

/** Duplique la version active sous un nouveau nom et bascule dessus.
 *
 *  Invariant « une seule version par groupe » (décision Vincent, b113) :
 *  un morceau a l'originale + AU PLUS une version par groupe. Si le groupe
 *  visé a déjà sa version, on bascule dessus au lieu d'en créer une
 *  deuxième — tous les chemins d'appel (fiche, setlists, bibliothèque,
 *  discussion) passent par ici, l'invariant est garanti en un seul point.
 *  Sans bandId explicite, la copie est PERSONNELLE (bandId '') : dupliquer
 *  en consultant une version de groupe ne doit jamais créer un doublon de
 *  cette version de groupe. */
export function duplicateVersion(
  song: Song,
  name: string,
  bandId?: string,
): Song {
  const synced = syncActiveVersion(song);
  const targetBand = bandId ?? '';
  if (targetBand !== '') {
    const existing = versionForBand(synced, targetBand);
    if (existing) return switchVersion(synced, existing.id);
  }
  const current = activeVersion(synced);
  const copy: SongVersion = {
    ...current,
    id: makeId(),
    name: name.trim() || `Version ${synced.versions.length + 1}`,
    bandId: targetBand,
    structure: current.structure.map((r) => ({ ...r, id: makeId() })),
  };
  return {
    ...synced,
    versions: [...synced.versions, copy],
    activeVersionId: copy.id,
    key: copy.key,
    tempo: copy.tempo,
    capo: copy.capo,
    structure: copy.structure,
    lyrics: copy.lyrics,
    publicLyrics: copy.publicLyrics,
  };
}

/**
 * Rattache un morceau importé comme NOUVELLE VERSION d'un morceau existant
 * (au lieu de créer un doublon) : son contenu (tonalité, capo, structure,
 * paroles) devient une version, activée pour que l'utilisateur voie ce qu'il
 * vient d'importer. Le morceau existant garde ses cœurs, ses notes, ses
 * autres versions et son morceau d'origine (versions[0]).
 */
export function addSongAsVersion(
  existing: Song,
  imported: Song,
  name: string,
  activate = true,
): Song {
  const version: SongVersion = {
    id: makeId(),
    name: name.trim() || `Version ${existing.versions.length + 1}`,
    bandId: '',
    key: imported.key,
    tempo: imported.tempo,
    capo: imported.capo,
    structure: imported.structure.map((r) => ({ ...r, id: makeId() })),
    lyrics: imported.lyrics,
  };
  const withVersion: Song = {
    ...existing,
    versions: [...existing.versions, version],
    updatedAt: new Date().toISOString(),
  };
  // `activate` : bascule sur la version importée (import à l'unité, pour la
  // voir tout de suite) ; en masse on n'active pas (on ne détourne pas la
  // version par défaut des morceaux).
  return activate ? switchVersion(withVersion, version.id) : withVersion;
}

/** Supprime une version (jamais la dernière). L'originale AUSSI est
 *  supprimable (décision Vincent, b135) : une autre version prend alors la
 *  place de référence — versions[0] reste structurellement une version
 *  personnelle. Bascule sur la référence restante si besoin. */
export function removeVersion(song: Song, versionId: string): Song {
  if (song.versions.length <= 1) return song;
  // Le doute de l'import (b209) portait sur le contenu ORIGINAL : le
  // supprimer, c'est s'en être occupé (b218).
  if (song.versions[0]?.id === versionId && song.needsCheck) {
    song = { ...song, needsCheck: undefined };
  }
  // Supprimer l'ORIGINALE (décision Vincent, b135 : possible quand elle
  // n'est pas bonne) : une autre version prend la place de référence.
  // L'invariant structurel demeure — versions[0] est TOUJOURS une version
  // personnelle (bandId '') : une secondaire personnelle monte en tête ;
  // s'il ne reste que des versions de groupe, la première
  // est CLONÉE en personnelle (le contexte garde la sienne).
  if (song.versions[0]?.id === versionId) {
    const rest = song.versions.slice(1);
    const pIdx = rest.findIndex((v) => (v.bandId ?? '') === '');
    const versions =
      pIdx !== -1
        ? [rest[pIdx], ...rest.filter((_, i) => i !== pIdx)]
        : [
            {
              ...rest[0],
              id: makeId(),
              name: 'Originale',
              bandId: '',
              updatedAt: new Date().toISOString(),
            },
            ...rest,
          ];
    const next = versions[0];
    return {
      ...song,
      versions,
      activeVersionId: next.id,
      key: next.key,
      tempo: next.tempo,
      capo: next.capo,
      structure: next.structure,
      lyrics: next.lyrics,
    };
  }
  const versions = song.versions.filter((v) => v.id !== versionId);
  let out: Song = { ...song, versions };
  if (song.activeVersionId === versionId) {
    const next = versions[0];
    out = {
      ...out,
      activeVersionId: next.id,
      key: next.key,
      tempo: next.tempo,
      capo: next.capo,
      structure: next.structure,
      lyrics: next.lyrics,
    };
  }
  return out;
}

/**
 * Fait d'une version LA référence du morceau (feedback Marco, b135) : son
 * contenu remplace celui de l'originale maîtresse — qui garde son identité
 * (id, bandId '', nom) pour respecter l'invariant « versions[0] jamais
 * supprimée ». Une version PERSONNELLE promue disparaît ensuite (c'était
 * une copie de travail devenue la référence) ; une version de groupe
 * reste, elle appartient à son groupe. Les versions qui suivaient
 * la tonalité/capo de l'ancienne originale suivent la nouvelle.
 */
/** Noms « par défaut » d'une version de référence : remplaçables sans
 *  scrupule quand elle change de contenu (un nom choisi, jamais). */
const DEFAULT_VERSION_NAMES = new Set([
  '',
  'originale',
  'original',
  'version originale',
  'version de référence',
  'version de reference',
  'version 1',
]);

export function promoteVersionToOriginal(
  song: Song,
  versionId: string,
): Song {
  const main = song.versions[0];
  const source = song.versions.find((v) => v.id === versionId);
  if (!main || !source || source.id === main.id) return song;
  // Le contenu douteux de l'import cède sa place : le doute tombe (b218).
  if (song.needsCheck) song = { ...song, needsCheck: undefined };
  const now = new Date().toISOString();
  const prevKey = main.key;
  const prevCapo = main.capo;
  const newMain: SongVersion = {
    ...main,
    // Le nom suit le contenu (retour Marco, b136) : la référence s'appelle
    // « Version de référence », sauf si l'artiste lui a donné un nom à lui
    // (on ne remplace que les libellés par défaut, jamais un choix perso).
    name: DEFAULT_VERSION_NAMES.has(main.name.trim().toLowerCase())
      ? 'Version de référence'
      : main.name,
    key: source.key,
    tempo: source.tempo,
    capo: source.capo,
    structure: source.structure.map((r) => ({ ...r })),
    lyrics: source.lyrics,
    updatedAt: now,
  };
  const isPersonal = (source.bandId ?? '') === '';
  const versions = song.versions
    .map((v) => (v.id === main.id ? newMain : v))
    .filter((v) => !(isPersonal && v.id === source.id));
  // Afficher la référence promue — champs actifs posés directement (surtout
  // pas switchVersion : syncActiveVersion réécrirait l'ANCIEN contenu actif
  // dans la nouvelle originale).
  let out: Song = {
    ...song,
    versions,
    activeVersionId: main.id,
    key: newMain.key,
    tempo: newMain.tempo,
    capo: newMain.capo,
    structure: newMain.structure,
    lyrics: newMain.lyrics,
    updatedAt: now,
  };
  out = propagateMainKeyCapo(out, prevKey, prevCapo);
  return out;
}

/** Renomme une version (le nom n'est qu'un repère, aucune autre incidence). */
export function renameVersion(
  song: Song,
  versionId: string,
  name: string,
): Song {
  const n = name.trim();
  if (n === '') return song;
  return {
    ...song,
    versions: song.versions.map((v) =>
      v.id === versionId ? { ...v, name: n } : v,
    ),
  };
}

/**
 * Deux noms de musicien désignent-ils la même personne ? (b141)
 * Le même musicien apparaît sous des formes différentes : prénom saisi à
 * l'invitation (« Marco ») et identifiant de son compte
 * (« marco.bosio »). On rapproche quand l'un contient l'autre, une fois
 * la ponctuation retirée.
 */
export function sameMusician(a: string, b: string): boolean {
  const norm = (x: string) =>
    x
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  const na = norm(a);
  const nb = norm(b);
  if (na === '' || nb === '') return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * MÊME PERSONNE ? — comparaison par MOTS (b247, constat de Vincent : « dans
 * le groupe je ne vois pas ma photo à côté de celle de Marco »).
 *
 * Sa ligne de musicien dit « Vincent », son profil dit « tessier vincent » :
 * une égalité de chaînes ne les reconnaissait pas, donc l'app ne savait plus
 * laquelle des deux lignes était la sienne — ni photo, ni accès à sa fiche.
 * Tout nom d'artiste qui change casse ce genre de rapprochement.
 *
 * `sameMusician` (rapprochement flou par sous-chaîne) serait trop large ici :
 * « Marc » y est inclus dans « Marco », et se prendre pour quelqu'un d'autre
 * coûte bien plus cher que de ne pas se reconnaître. On compare donc des
 * MOTS entiers : l'un des deux noms doit être fait de mots tous présents
 * dans l'autre, dont un d'au moins deux lettres (sinon une simple initiale
 * suffirait à confondre deux musiciens).
 */
export function memePersonne(a: string, b: string): boolean {
  const mots = (x: string) =>
    x
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((m) => m !== '');
  const ma = mots(a);
  const mb = mots(b);
  if (ma.length === 0 || mb.length === 0) return false;
  const [petit, grand] = ma.length <= mb.length ? [ma, mb] : [mb, ma];
  if (!petit.every((m) => grand.includes(m))) return false;
  return petit.some((m) => m.length >= 2);
}

/**
 * LES MUSICIENS D'UN GROUPE — LE MÊME COMPTE POUR TOUT LE MONDE (b255,
 * constat de Vincent : « affichage du nombre de musiciens différent chez
 * Damien et chez moi »).
 *
 * Le CRÉATEUR n'est jamais inscrit dans `cloud_band_members` — c'est le
 * serveur qui le désigne, à part. Un membre qui a rejoint ne voyait donc que
 * lui-même et les autres membres : « 1 musicien » chez Damien, pour un groupe
 * qui en compte trois. Son écran nommait pourtant le créateur juste au-dessus
 * (« créé par tessier vincent ») — il l'affichait sans le compter.
 *
 * On rassemble donc les trois sources, dans cet ordre de confiance : les
 * comptes du serveur, le créateur, puis les lignes locales qu'aucun compte ne
 * représente (musiciens notés à la main, invitations pas encore acceptées).
 * `memeMusicien` évite les doublons — identifiant de compte d'abord.
 */
export interface MusicienAffiche {
  name: string;
  photo?: string;
  userId?: string;
  instrument?: string;
  /** Invité, pas encore accepté : compté, mais annoncé comme tel. */
  pending?: boolean;
}

export function musiciensDuGroupe(
  band: Band,
  comptes: { user_id: string; name: string; photo?: string; instrument?: string }[],
  createur?: { userId?: string; name: string; photo?: string },
): MusicienAffiche[] {
  const out: MusicienAffiche[] = [];
  const ajouter = (m: MusicienAffiche) => {
    if ((m.name ?? '').trim() === '' && (m.userId ?? '') === '') return;
    const vu = out.find((x) => memeMusicien(x, m));
    if (!vu) {
      out.push(m);
      return;
    }
    // Une ligne CONFIRMÉE l'emporte sur une invitation en attente, et une
    // photo connue sur une pastille grise.
    if (m.pending !== true) vu.pending = undefined;
    if ((vu.photo ?? '') === '' && (m.photo ?? '') !== '') vu.photo = m.photo;
  };
  for (const c of comptes) {
    ajouter({
      name: c.name ?? '',
      photo: c.photo,
      userId: c.user_id,
      instrument: c.instrument,
    });
  }
  if (createur && (createur.name ?? '').trim() !== '') {
    ajouter({
      name: createur.name,
      photo: createur.photo,
      userId: createur.userId,
    });
  }
  for (const m of band.members ?? []) {
    ajouter({
      name: m.name ?? '',
      photo: m.photo,
      userId: m.userId,
      instrument: m.instrument,
      pending: m.pending === true ? true : undefined,
    });
  }
  return out;
}

/**
 * CEUX AVEC QUI JE JOUE DÉJÀ (b253, demande de Vincent : « quand il y aura
 * 126 Vincent, ce sera plus pratique pour Marco de créer un nouveau groupe
 * avec moi »).
 *
 * Une recherche d'annuaire qui rend cent homonymes ne sert à rien : dans
 * l'immense majorité des cas, on invite quelqu'un avec qui on joue DÉJÀ
 * ailleurs. On le sait sans rien demander au réseau — les identifiants de
 * compte sont posés sur les lignes de mes groupes depuis b249.
 *
 * Rend, par compte, les groupes que nous avons en commun : de quoi remonter
 * ces musiciens en tête ET dire POURQUOI ils y sont — un classement qu'on
 * n'explique pas passe pour du hasard.
 */
export function musiciensConnus(
  bands: Band[],
  moi: string,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const b of bands) {
    const nomGroupe = (b.name ?? '').trim();
    for (const m of b.members ?? []) {
      const id = (m.userId ?? '').trim();
      if (id === '' || id === moi) continue;
      // Une invitation EN ATTENTE n'est pas « déjà avec toi » (b403,
      // constat de Vincent et Marco) : sitôt invitée depuis l'annuaire, la
      // personne portait son identifiant (b250) et le calcul la disait
      // « déjà avec toi » dans un groupe qu'elle n'a pas encore rejoint.
      if (m.pending === true) continue;
      const liste = out.get(id) ?? [];
      if (nomGroupe !== '' && !liste.includes(nomGroupe)) liste.push(nomGroupe);
      out.set(id, liste);
    }
  }
  return out;
}

/** Les musiciens déjà connus d'abord — l'ordre du serveur départage le reste. */
export function connusEnTete<T extends { user_id: string }>(
  rows: T[],
  connus: Map<string, string[]>,
): T[] {
  return [...rows].sort(
    (a, b) => (connus.has(b.user_id) ? 1 : 0) - (connus.has(a.user_id) ? 1 : 0),
  );
}

/**
 * MÊME MUSICIEN ? — L'IDENTIFIANT DE COMPTE FAIT AUTORITÉ (b249, proposition
 * de Vincent : « un identifiant réseau unique par artiste qui s'inscrit, et
 * c'est cet identifiant qui est utilisé partout »).
 *
 * Quand les deux lignes portent un `userId`, la réponse est certaine dans les
 * DEUX sens : même identifiant → la même personne, quels que soient les noms
 * (« Marco » et « marco.bosio ») ; identifiants différents → jamais la même,
 * quand bien même les noms seraient identiques (deux Vincent existent).
 *
 * On ne retombe sur les noms que si l'un des deux n'a pas de compte — un
 * musicien inscrit à la main, invité qui ne s'est jamais inscrit. C'est le
 * seul cas irréductible : sans compte, il n'y a pas d'identifiant à comparer.
 */
export interface Identifiable {
  name: string;
  userId?: string;
}

export function memeMusicien(a: Identifiable, b: Identifiable): boolean {
  const ia = (a.userId ?? '').trim();
  const ib = (b.userId ?? '').trim();
  if (ia !== '' && ib !== '') return ia === ib;
  return memePersonne(a.name ?? '', b.name ?? '');
}

/**
 * ATTACHER LES IDENTIFIANTS AUX LIGNES DÉJÀ ÉCRITES (b249).
 *
 * Les groupes existants ne portent que des noms. On fait donc UNE DERNIÈRE
 * fois le rapprochement par le nom, pour poser l'identifiant — après quoi il
 * fait autorité et le nom peut changer autant qu'il veut.
 *
 * Deux prudences : une ligne qui porte DÉJÀ un identifiant n'est jamais
 * réécrite (le serveur ne se contredit pas, mais un homonyme, si), et un nom
 * qui correspond à DEUX comptes n'est attribué à aucun — mieux vaut une ligne
 * sans identifiant qu'une ligne avec celui du voisin. `updatedAt` n'est pas
 * retouché : c'est une réparation silencieuse, elle n'a pas à gagner la
 * fusion de synchro. Idempotente.
 */
export function stampMemberIds(
  band: Band,
  comptes: { user_id: string; name: string }[],
): Band {
  const src = band.members ?? [];
  if (src.length === 0 || comptes.length === 0) return band;
  let change = false;
  const out = src.map((m) => {
    if ((m.userId ?? '') !== '') return m;
    const nom = (m.name ?? '').trim();
    if (nom === '') return m;
    const candidats = comptes.filter(
      (c) => (c.user_id ?? '') !== '' && memePersonne(c.name ?? '', nom),
    );
    if (candidats.length !== 1) return m;
    change = true;
    return { ...m, userId: candidats[0].user_id };
  });
  return change ? { ...band, members: out } : band;
}

/**
 * UN MUSICIEN, UNE LIGNE (b248, constat de Vincent : « Marco apparaît 2 fois
 * dans le groupe… alors que le menu d'avant on n'est que 2 »).
 *
 * Sa fiche de groupe portait « Marco » ET « marco.bosio » — la même personne,
 * inscrite une fois à la main et une fois par son compte. Les écrans le
 * cachaient (b141 fusionne à l'affichage), mais la donnée, elle, restait
 * double : il a suffi d'un écran qui ne fusionnait pas — la page publique —
 * pour que le groupe annonce un musicien de plus qu'il n'en compte.
 * On répare donc à la SOURCE, au chargement.
 *
 * Le premier nom rencontré gagne (b141) et absorbe ce que les doublons ont
 * de plus : photo, instrument, matériel, ✓ compte vérifié. Comparaison par
 * MOTS — « Marc » ne devient jamais « Marco », fusionner deux musiciens en
 * effacerait un. Idempotente : sans doublon, l'objet d'origine est rendu tel
 * quel (et `updatedAt` n'est jamais retouché : une réparation silencieuse
 * n'a pas à gagner la fusion de synchro).
 */
export function dedupeBandMembers(band: Band): Band {
  const src = band.members ?? [];
  if (src.length < 2) return band;
  const out: import('../types').BandMember[] = [];
  for (const m of src) {
    const nom = (m.name ?? '').trim();
    // b249 : l'identifiant de compte tranche quand il est là, le nom sinon.
    const i =
      nom === '' && (m.userId ?? '') === ''
        ? -1
        : out.findIndex((k) => memeMusicien(k, m));
    if (i < 0) {
      out.push(m);
      continue;
    }
    const garde = out[i];
    out[i] = {
      ...garde,
      userId: garde.userId ?? m.userId,
      photo: (garde.photo ?? '') !== '' ? garde.photo : m.photo,
      instrument: garde.instrument !== '' ? garde.instrument : m.instrument,
      gear: (garde.gear ?? []).length > 0 ? garde.gear : m.gear,
      verified: garde.verified === true || m.verified === true ? true : undefined,
      // Un invité en attente ne le reste que si TOUTES ses lignes le sont.
      pending: garde.pending === true && m.pending === true ? true : undefined,
    };
  }
  return out.length === src.length ? band : { ...band, members: out };
}

/**
 * MA PHOTO SUIT DANS MES GROUPES (b247). La ligne de musicien porte une
 * COPIE de la photo, prise à la création du groupe ou à l'adhésion : elle ne
 * bougeait plus jamais ensuite, donc les autres membres continuaient de voir
 * une pastille grise longtemps après que j'aie mis une photo.
 *
 * On la recale à l'enregistrement du PROFIL — un acte, pas une consultation.
 * Seule la photo est recopiée : le nom sert à me reconnaître d'un appareil à
 * l'autre, on n'y touche pas. Idempotente (aucune écriture si rien ne change,
 * sinon chaque enregistrement retamponnerait tous les groupes).
 */
export function majMaPhotoDansGroupes(
  bands: Band[],
  artist: ArtistProfile,
  userName: string,
  /** Mon compte (b249) : quand ma ligne le porte, aucun nom n'est comparé. */
  userId?: string,
): Band[] {
  const photo = artist.photo ?? '';
  if (photo === '') return bands;
  const moi = (userId ?? '').trim();
  const mesNoms = [userName, artist.name].filter((n) => (n ?? '').trim() !== '');
  if (mesNoms.length === 0 && moi === '') return bands;
  let touche = false;
  const out = bands.map((b) => {
    let change = false;
    const members = (b.members ?? []).map((m) => {
      if ((m.photo ?? '') === photo) return m;
      const idLigne = (m.userId ?? '').trim();
      const cest_moi =
        idLigne !== '' && moi !== ''
          ? idLigne === moi
          : mesNoms.some((n) => memePersonne(n, m.name));
      if (!cest_moi) return m;
      change = true;
      return { ...m, photo };
    });
    if (!change) return b;
    touche = true;
    return { ...b, members, updatedAt: new Date().toISOString() };
  });
  return touche ? out : bands;
}

/**
 * Liste de musiciens sans doublon : le premier nom rencontré gagne
 * (b141) — évite « marco.bosio, Marco » pour une seule personne.
 */
export function dedupeMusicians<T extends Identifiable>(list: T[]): T[] {
  const out: T[] = [];
  for (const m of list) {
    // b249 : deux identifiants de compte DIFFÉRENTS, ce sont deux musiciens
    // — deux Vincent existent. Le rapprochement flou des noms ne s'applique
    // qu'à défaut d'identifiant.
    if (!out.some((k) => memeMusicienOuNomProche(k, m))) out.push(m);
  }
  return out;
}

/** Rapprochement d'affichage : l'identifiant tranche, sinon le nom (flou). */
function memeMusicienOuNomProche(a: Identifiable, b: Identifiable): boolean {
  const ia = (a.userId ?? '').trim();
  const ib = (b.userId ?? '').trim();
  if (ia !== '' && ib !== '') return ia === ib;
  return sameMusician(a.name, b.name);
}

/**
 * Une setlist n'est-elle qu'une COQUILLE abandonnée ? (b146)
 * Sans nom, sans morceau, sans commentaire, sans sono : elle vient du
 * défaut corrigé en b146 (la setlist était enregistrée avant toute
 * saisie). On ne purge que celles laissées depuis plus de 10 minutes,
 * pour ne jamais effacer celle qu'un membre est en train de remplir.
 */
export function isAbandonedSetlist(sl: Setlist, now = Date.now()): boolean {
  const setup = sl.setup;
  const hasSetup =
    setup !== undefined &&
    ((setup.positions?.length ?? 0) > 0 ||
      setup.gear.trim() !== '' ||
      setup.wiring.trim() !== '' ||
      setup.sound.trim() !== '');
  if (
    sl.name.trim() !== '' ||
    sl.items.length > 0 ||
    sl.comment.trim() !== '' ||
    hasSetup
  ) {
    return false;
  }
  const t = Date.parse(sl.updatedAt);
  return !Number.isFinite(t) || now - t > 10 * 60 * 1000;
}

/** Profil public d'un groupe (même forme qu'un profil artiste). */
export function bandToProfile(band: Band): ArtistProfile {
  return {
    name: band.name,
    bio: band.bio,
    photo: band.photo,
    links: band.links,
    tipUrl: band.tipUrl,
  };
}

/** Filtre les notes pour un partage : jamais les privées ; rien pour le public. */
export function notesForShare(
  notes: SongNote[],
  share: 'groupe' | 'public',
): SongNote[] {
  if (share === 'public') return [];
  return notes.filter((n) => n.visibility === 'groupe');
}

/**
 * Assainit une setlist stockée : chaque champ requis reçoit une valeur par
 * défaut, les items invalides sont écartés. Une donnée partielle (vieux
 * schéma, synchro incomplète) ne doit JAMAIS planter une page — leçon de
 * l'audit UI : sans cette garde, un champ manquant mettait l'écran en
 * erreur plein écran.
 */
export function migrateSetlist(raw: unknown): Setlist {
  const sl = (raw ?? {}) as Partial<Setlist> & Record<string, unknown>;
  const items = Array.isArray(sl.items) ? sl.items : [];
  return {
    ...sl,
    id: typeof sl.id === 'string' && sl.id !== '' ? sl.id : makeId(),
    name: typeof sl.name === 'string' ? sl.name : '',
    comment: typeof sl.comment === 'string' ? sl.comment : '',
    bandId: typeof sl.bandId === 'string' ? sl.bandId : '',
    items: items
      .filter(
        (it): it is NonNullable<typeof it> =>
          !!it && typeof it.songId === 'string' && it.songId !== '',
      )
      .map((it) => ({
        ...it,
        id: typeof it.id === 'string' && it.id !== '' ? it.id : makeId(),
        songId: it.songId,
        note: typeof it.note === 'string' ? it.note : '',
        keyOverride: typeof it.keyOverride === 'string' ? it.keyOverride : '',
        versionId: typeof it.versionId === 'string' ? it.versionId : '',
      })),
    createdAt: typeof sl.createdAt === 'string' ? sl.createdAt : '',
    updatedAt: typeof sl.updatedAt === 'string' ? sl.updatedAt : '',
  };
}

/** Assainit un concert stocké (même garde défensive que migrateSetlist). */
export function migrateConcert(raw: unknown): Concert {
  const c = (raw ?? {}) as Partial<Concert> & Record<string, unknown>;
  return {
    ...c,
    id: typeof c.id === 'string' && c.id !== '' ? c.id : makeId(),
    title: typeof c.title === 'string' ? c.title : '',
    date: typeof c.date === 'string' ? c.date : '',
    time: typeof c.time === 'string' ? c.time : '',
    venue: typeof c.venue === 'string' ? c.venue : '',
    venueUrl: typeof c.venueUrl === 'string' ? c.venueUrl : '',
    eventUrl: typeof c.eventUrl === 'string' ? c.eventUrl : '',
    description: typeof c.description === 'string' ? c.description : '',
    setlistId: typeof c.setlistId === 'string' ? c.setlistId : '',
    visibility: c.visibility === 'prive' ? 'prive' : 'public',
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : '',
  };
}

/**
 * Migre un morceau de l'ancien modèle (sections[]) vers le nouveau
 * (lyrics + structure). Sans effet si le morceau est déjà migré.
 */
export function migrateSong(raw: unknown): Song {
  const s = raw as Partial<Song> & {
    sections?: LegacySection[];
    notes?: string;
  };
  let base: Song;
  if (Array.isArray(s.sections)) {
    const sections = s.sections;
    const lyrics = sections
      .map((sec) => (sec.content ?? '').replace(/\n+$/g, ''))
      .filter((c) => c.trim() !== '')
      .join('\n\n');
    const structure: StructureRow[] = sections.map((sec) => ({
      id: sec.id ?? makeId(),
      label: sec.label ?? 'Section',
      chords: extractChordSequence(sec.content ?? ''),
      comment: '',
    }));
    const { sections: _dropped, ...rest } = s;
    base = { ...(rest as Song), lyrics, structure };
  } else {
    base = {
      ...(s as Song),
      lyrics: typeof s.lyrics === 'string' ? s.lyrics : '',
      structure: Array.isArray(s.structure) ? s.structure : [],
      tags: Array.isArray(s.tags) ? s.tags : [],
    };
  }

  // Versions : les anciens morceaux n'en avaient qu'une, implicite.
  if (!Array.isArray(base.versions) || base.versions.length === 0) {
    const versionId = makeId();
    base = {
      ...base,
      versions: [
        {
          id: versionId,
          name: 'Original',
          bandId: '',
          key: base.key ?? '',
          tempo: base.tempo ?? 0,
          capo: base.capo ?? 0,
          structure: base.structure,
          lyrics: base.lyrics,
        },
      ],
      activeVersionId: versionId,
    };
  } else if (
    !base.activeVersionId ||
    !base.versions.some((v) => v.id === base.activeVersionId)
  ) {
    base = { ...base, activeVersionId: base.versions[0].id };
  }

  // La version maîtresse (bibliothèque) s'appelle désormais « Original ».
  // On renomme l'ancien libellé par défaut « Version 1 » sans toucher aux
  // noms personnalisés.
  if (base.versions[0] && base.versions[0].name === 'Version 1') {
    base = {
      ...base,
      versions: base.versions.map((v, i) =>
        i === 0 ? { ...v, name: 'Original' } : v,
      ),
    };
  }

  // Notes de répétition : l'ancien champ texte devient une note générale.
  if (!Array.isArray(base.rehearsalNotes)) {
    const legacy = typeof s.notes === 'string' ? s.notes.trim() : '';
    base = {
      ...base,
      rehearsalNotes:
        legacy !== ''
          ? [
              {
                id: makeId(),
                target: '',
                bandId: '',
                text: legacy,
                author: '',
                visibility: 'groupe',
                createdAt: base.updatedAt ?? new Date().toISOString(),
              },
            ]
          : [],
    };
  }
  if (typeof base.hearts !== 'number') {
    base = { ...base, hearts: 0 };
  }
  if (!Array.isArray(base.fanMessages)) {
    base = { ...base, fanMessages: [] };
  }
  // b224 — le texte du public a déménagé du MORCEAU vers la VERSION (pour
  // suivre les versions et voyager jusqu'au groupe). Les morceaux enregistrés
  // par b223 le portent encore sur le morceau : on le sème sur la version
  // active, sinon changer de version l'effacerait. Idempotent.
  if (base.publicLyrics) {
    const active = base.versions.find((v) => v.id === base.activeVersionId);
    if (active && !active.publicLyrics) {
      base = {
        ...base,
        versions: base.versions.map((v) =>
          v.id === base.activeVersionId
            ? { ...v, publicLyrics: base.publicLyrics }
            : v,
        ),
      };
    }
  }
  // bandId sur versions et notes (ajouté après coup)
  if (base.versions.some((v) => typeof v.bandId !== 'string')) {
    base = {
      ...base,
      versions: base.versions.map((v) => ({
        ...v,
        bandId: typeof v.bandId === 'string' ? v.bandId : '',
      })),
    };
  }
  if (base.rehearsalNotes.some((n) => typeof n.bandId !== 'string')) {
    base = {
      ...base,
      rehearsalNotes: base.rehearsalNotes.map((n) => ({
        ...n,
        bandId: typeof n.bandId === 'string' ? n.bandId : '',
      })),
    };
  }
  // Réparation des imports PDF « cassés » (espace encodé en « ! ») :
  // détectée sur les paroles, appliquée à tout le morceau. Idempotent.
  if (hasGlyphSpaces(base.lyrics)) {
    const fixRows = (rows: StructureRow[]) =>
      rows.map((r) => ({ ...r, chords: fixGlyphSpaces(r.chords).trim() }));
    base = {
      ...base,
      lyrics: fixGlyphSpaces(base.lyrics),
      structure: fixRows(base.structure),
      versions: base.versions.map((v) =>
        hasGlyphSpaces(v.lyrics)
          ? { ...v, lyrics: fixGlyphSpaces(v.lyrics), structure: fixRows(v.structure) }
          : v,
      ),
    };
  }

  // Caractères de contrôle (NUL des PDF cassés…) : illégaux en base
  // (erreur 22P05 à la synchro) — purge sur tous les champs texte.
  if (
    CONTROL_RE.test(base.lyrics) ||
    CONTROL_RE.test(base.title) ||
    CONTROL_RE.test(base.artist)
  ) {
    base = {
      ...base,
      title: stripControlChars(base.title),
      artist: stripControlChars(base.artist),
      lyrics: stripControlChars(base.lyrics),
      structure: base.structure.map((r) => ({
        ...r,
        label: stripControlChars(r.label),
        chords: stripControlChars(r.chords),
        comment: stripControlChars(r.comment),
      })),
      versions: base.versions.map((v) =>
        CONTROL_RE.test(v.lyrics)
          ? {
              ...v,
              lyrics: stripControlChars(v.lyrics),
              structure: v.structure.map((r) => ({
                ...r,
                label: stripControlChars(r.label),
                chords: stripControlChars(r.chords),
                comment: stripControlChars(r.comment),
              })),
            }
          : v,
      ),
    };
  }

  // Entités HTML restées en clair (« attrap&eacute; ») : décodage —
  // y compris coupées en deux par un accord (« d&eac[F#m]ute; »).
  if (
    hasBrokenEntities(base.lyrics) ||
    hasBrokenEntities(base.title) ||
    hasBrokenEntities(base.artist)
  ) {
    base = {
      ...base,
      title: decodeHtmlEntities(base.title),
      artist: decodeHtmlEntities(base.artist),
      lyrics: repairChordedLyrics(base.lyrics),
      versions: base.versions.map((v) =>
        hasBrokenEntities(v.lyrics)
          ? { ...v, lyrics: repairChordedLyrics(v.lyrics) }
          : v,
      ),
    };
  }

  // « Structure » en notes libres : initialisée une fois depuis les
  // commentaires de répétition des anciennes sections (pas les accords).
  if (typeof base.structureNotes !== 'string') {
    const fromComments = base.structure
      .filter((r) => r.comment.trim() !== '')
      .map((r) =>
        r.label.trim() !== ''
          ? `${r.label.trim()} : ${r.comment.trim()}`
          : r.comment.trim(),
      )
      .join('\n');
    base = { ...base, structureNotes: fromComments };
  }

  // b219 : les en-têtes de sections reviennent dans les paroles quand
  // l'appariement avec la structure enregistrée est certain.
  base = restaureSectionsDansParoles(base);

  // b211 : plus de « version Solo » — celles qui existent redeviennent des
  // versions personnelles ordinaires (avant l'invariant ci-dessous, pour
  // qu'une version Solo puisse au besoin reprendre la tête).
  base = retireVersionSolo(base);

  // Invariant « originale maîtresse » : versions[0] doit être personnelle
  // (bandId ''). On répare les morceaux où l'originale a été absorbée par un
  // groupe — sauf les propositions encore en attente (pas encore adoptées
  // dans la bibliothèque perso).
  if ((base.pendingBandId ?? '') === '') {
    base = ensureOriginalVersion(base);
  }
  // Invariant « une seule version par groupe » : répare les doublons
  // historiques au chargement (on garde la plus récemment modifiée).
  base = dedupeBandVersions(base);

  // b174 : une proposition de groupe vit dans la boîte de réception. Les
  // propositions reçues AVANT ce lot n'ont pas le drapeau — on le pose au
  // chargement, sinon elles resteraient mêlées aux morceaux qu'on joue.
  if ((base.pendingBandId ?? '') !== '' && base.idea !== true) {
    base = { ...base, idea: true };
  }

  /**
   * FIN DES « IDÉES » PERSONNELLES (b274, arbitrage de Vincent). Un morceau
   * marqué en attente qui ne vient NI d'un groupe NI d'un bœuf était une
   * étagère personnelle : il rejoint la bibliothèque, où il aurait toujours
   * dû être. Rien n'est effacé — c'est le drapeau qui tombe, pas le morceau.
   *
   * Les copies rapportées d'un bœuf AVANT b274 n'ont pas encore `keptAtJam` :
   * elles sont donc libérées elles aussi. C'est le bon sens de l'erreur —
   * un morceau qu'on retrouve dans sa bibliothèque ne se perd pas, alors
   * qu'un morceau resté en attente d'une décision qui ne viendra jamais, si.
   */
  if (
    base.idea === true &&
    (base.pendingBandId ?? '') === '' &&
    base.keptAtJam !== true
  ) {
    base = { ...base, idea: false };
  }

  /**
   * UN BROUILLON PROPOSÉ À UN GROUPE N'EST PLUS UN BROUILLON (b338, constat
   * de Vincent : la fiche du groupe annonçait « 2 morceaux », le répertoire
   * n'en montrait qu'un). Le sélecteur de la discussion laissait passer les
   * brouillons de création (b319) : proposer posait une version de groupe
   * sur un brouillon — compté par la fiche, invisible partout ailleurs,
   * jamais synchronisé, et le TTL de 6 h l'aurait balayé AVEC sa version de
   * groupe. Le sélecteur est corrigé, et ce qui a déjà été écrit se répare
   * ici : proposer entérine l'inscription en bibliothèque (même logique que
   * la programmation en setlist, b174) — un « brouillon » qui porte une
   * version de groupe ou une proposition est un morceau. Idempotent.
   */
  if (
    estBrouillon(base) &&
    (base.versions.some((v) => (v.bandId ?? '') !== '') ||
      (base.pendingBandId ?? '') !== '')
  ) {
    const { status: _brouillonEntérine, ...reste } = base;
    base = reste as Song;
  }

  /**
   * RÉPARATION RETIRÉE (b291) — elle réécrivait des capos/accords légitimes.
   *
   * b290 recopiait le haut niveau (`capo`/`lyrics`/`key`) depuis la version
   * active au chargement, en supposant que la version active était toujours la
   * SOURCE et le haut niveau un simple miroir. FAUX pour au moins un chemin :
   * certaines écritures mettent à jour le haut niveau sans resynchroniser
   * l'objet version (constaté après signalement de Vincent : « ça a modifié les
   * capos placés »). La réparation partait alors dans le mauvais sens et
   * ÉCRASAIT le bon contenu par l'ancien de la version. Une réparation qui peut
   * détruire des données ne vaut pas le bug d'affichage qu'elle corrigeait.
   * Le vrai correctif est de rendre TOUS les chemins d'écriture synchrones
   * (source unique), pas de deviner la vérité au chargement — à traiter à part.
   */

  const { notes: _legacyNotes, ...clean } = base as Song & { notes?: string };
  return clean as Song;
}
