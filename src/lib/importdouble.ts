/**
 * LA BOÎTE « CE MORCEAU EXISTE DÉJÀ » TIENT SES PROMESSES (b500, lot 2 des
 * tests du 05/09/2026 — I-1/I-2).
 *
 * Le constat de Vincent (« les deux actions du milieu sont inversées »)
 * venait de deux promesses non tenues, pas d'un branchement croisé :
 *  · « La remplacer » AJOUTAIT une version (et l'activait) — l'ancienne
 *    partition restait dans la liste des versions : à l'écran, c'était le
 *    comportement de « Garder les deux » ;
 *  · « Garder les deux » créait bien un second morceau… au même titre et
 *    même artiste — que le dédoublonnage par contenu (b316) ENTERRAIT à la
 *    fusion suivante. La promesse la plus rassurante de l'écran détruisait
 *    du travail en silence.
 *
 * D'où les deux fonctions pures d'ici :
 *  · `remplacerReference` remplace VRAIMENT la partition de référence
 *    (versions[0]) en conservant l'identité du morceau — id, titre,
 *    artiste, durée, tags, notes, appartenances aux setlists et aux
 *    groupes. C'est la partition qui est remplacée, jamais le morceau.
 *  · `titreDisponible` rend un titre DISTINGUABLE (« Hallelujah (2) ») :
 *    deux entrées au même titre+artiste ne survivraient pas au
 *    dédoublonnage — et ne se distingueraient pas dans la liste.
 */
import { songKey } from './normalizeTitle';
import { makeId, Song } from '../types';

/**
 * Remplace la partition de la version de RÉFÉRENCE (versions[0]) par celle
 * de l'import. Les champs de la fiche (titre, artiste, durée, tags, notes)
 * ne bougent pas ; les autres versions non plus. Si la version de référence
 * est la version active, le miroir de haut niveau suit.
 */
export function remplacerReference(existing: Song, imported: Song): Song {
  const v0 = existing.versions[0];
  if (!v0) return existing;
  const now = new Date().toISOString();
  const nouvelle = {
    ...v0,
    key: imported.key,
    tempo: imported.tempo,
    capo: imported.capo,
    structure: (imported.structure ?? []).map((r) => ({ ...r, id: makeId() })),
    lyrics: imported.lyrics,
    updatedAt: now,
  };
  let song: Song = {
    ...existing,
    versions: [nouvelle, ...existing.versions.slice(1)],
    updatedAt: now,
  };
  // Le haut niveau MIROITE la version active (règle du projet) : si c'est la
  // référence qu'on vient de remplacer, le miroir suit — sinon on n'y touche
  // pas (on ne « répare » jamais un miroir au passage, cicatrice b290).
  if (song.activeVersionId === nouvelle.id) {
    song = {
      ...song,
      key: nouvelle.key,
      tempo: nouvelle.tempo,
      capo: nouvelle.capo,
      structure: nouvelle.structure,
      lyrics: nouvelle.lyrics,
    };
  }
  return song;
}

/**
 * Un titre libre pour « Garder les deux » : si `titre` est déjà pris (au
 * sens du dédoublonnage — titre + artiste normalisés), on suffixe « (2) »,
 * « (3) »… jusqu'au premier libre. Deux entrées distinguables à l'écran,
 * et des clés de contenu distinctes : le dédoublonnage b316 les laisse
 * vivre toutes les deux.
 */
export function titreDisponible(
  songs: Pick<Song, 'title' | 'artist'>[],
  titre: string,
  artiste: string,
): string {
  const pris = new Set(songs.map((s) => songKey(s.title, s.artist ?? '')));
  if (!pris.has(songKey(titre, artiste))) return titre;
  for (let n = 2; n < 100; n++) {
    const candidat = `${titre} (${n})`;
    if (!pris.has(songKey(candidat, artiste))) return candidat;
  }
  return `${titre} (${Date.now()})`;
}
