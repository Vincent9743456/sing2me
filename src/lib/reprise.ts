/**
 * REPRENDRE LA BIBLIOTHÈQUE DÉJÀ IMPORTÉE (b220, demande de Vincent :
 * « appliquer ce correctif à mon répertoire comme s'il venait d'être
 * importé »).
 *
 * Deux passes, volontairement séparées, parce qu'elles n'ont ni le même
 * coût ni le même risque :
 *
 *  1. LE RECALAGE — du calcul pur. Aucun réseau, aucun centime, aucun modèle
 *     qui pourrait toucher aux paroles. Il repose les accords sur l'attaque
 *     du mot, exactement comme le fait l'import depuis b219. C'est la moitié
 *     du problème, et c'est la moitié gratuite : elle passe en premier.
 *
 *  2. LA MISE EN FORME IA — ce que le calcul ne sait pas faire : retrouver
 *     les sections d'une partition qui n'en portait aucune marque. Un appel
 *     par morceau, avec les mêmes garde-fous qu'à l'import (gros doute →
 *     « à vérifier » + partition d'avant conservée pour revenir en arrière).
 *
 * Les deux passes ne touchent QUE les paroles, la structure, la tonalité et
 * le capo. Titre, artiste, notes de répétition, cœurs, setlists, statut
 * (idée ou bibliothèque) : rien n'y touche.
 */
import { accordsARecaler, recalerAccordsEnLigne } from './importer';
import { Song, SongVersion } from '../types';

/** Combien d'accords ce morceau (toutes versions) a-t-il à recaler ? */
export function accordsARecalerDuMorceau(song: Song): number {
  let n = accordsARecaler(song.lyrics);
  for (const v of song.versions ?? []) {
    // La version en tête porte les mêmes paroles que le morceau : ne pas
    // compter deux fois ce qui ne sera corrigé qu'une.
    if (v.lyrics !== song.lyrics) n += accordsARecaler(v.lyrics ?? '');
  }
  return n;
}

/** Bilan d'un recalage, à annoncer avant de le lancer. */
export interface BilanRecalage {
  morceaux: number;
  accords: number;
}

export function bilanRecalage(songs: Song[]): BilanRecalage {
  let morceaux = 0;
  let accords = 0;
  for (const s of songs) {
    const n = accordsARecalerDuMorceau(s);
    if (n > 0) {
      morceaux++;
      accords += n;
    }
  }
  return { morceaux, accords };
}

/**
 * Recale un morceau et toutes ses versions. Renvoie le morceau inchangé —
 * la MÊME référence — s'il n'y avait rien à faire, pour ne pas réenregistrer
 * inutilement toute une bibliothèque.
 */
export function recalerMorceau(song: Song): Song {
  const lyrics = recalerAccordsEnLigne(song.lyrics);
  const versions: SongVersion[] = (song.versions ?? []).map((v) => {
    const l = recalerAccordsEnLigne(v.lyrics ?? '');
    return l === (v.lyrics ?? '') ? v : { ...v, lyrics: l };
  });
  const versionsChangees = versions.some(
    (v, i) => v !== (song.versions ?? [])[i],
  );
  if (lyrics === song.lyrics && !versionsChangees) return song;
  return {
    ...song,
    lyrics,
    versions,
    updatedAt: new Date().toISOString(),
  };
}
