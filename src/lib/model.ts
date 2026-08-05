/**
 * Aides sur le modèle : extraction d'accords, migration des anciennes
 * données (modèle à sections → structure en tête + paroles continues).
 */
import { Spelling, transposeChord } from './chords';
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
  makeId,
  Song,
  SongNote,
  SongVersion,
  StructureRow,
} from '../types';

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
): import('../types').BandMember {
  return {
    id: makeId(),
    name: userName || artist.name || 'Moi',
    instrument: '',
    verified: true,
    gear: artist.gear ? artist.gear.map((g) => ({ ...g })) : [],
  };
}

/** Version d'un morceau correspondant à un groupe donné ('' = solo). */
export function versionForBand(song: Song, bandId: string): SongVersion | null {
  return song.versions.find((v) => (v.bandId ?? '') === bandId) ?? null;
}

/**
 * Version à ouvrir par défaut selon le contexte d'ouverture d'un morceau :
 * - depuis un groupe → la version de ce groupe si elle existe ;
 * - depuis la bibliothèque / solo (bandId '') → la version originale.
 * Repli : version originale, sinon la première version.
 */
export function contextVersionId(song: Song, bandId: string): string {
  const v =
    versionForBand(song, bandId) ?? versionForBand(song, '') ?? song.versions[0];
  return v?.id ?? song.activeVersionId;
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

/** Réécrit les champs actifs (tonalité, structure, paroles…) dans la version active. */
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
  };
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

/** Duplique la version active sous un nouveau nom et bascule dessus. */
export function duplicateVersion(
  song: Song,
  name: string,
  bandId?: string,
): Song {
  const synced = syncActiveVersion(song);
  const current = activeVersion(synced);
  const copy: SongVersion = {
    ...current,
    id: makeId(),
    name: name.trim() || `Version ${synced.versions.length + 1}`,
    bandId: bandId ?? current.bandId,
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

/** Supprime une version (jamais la dernière) ; bascule sur la première restante si besoin. */
export function removeVersion(song: Song, versionId: string): Song {
  if (song.versions.length <= 1) return song;
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

  const { notes: _legacyNotes, ...clean } = base as Song & { notes?: string };
  return clean as Song;
}
