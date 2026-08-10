/**
 * SUPPRIMER UN MORCEAU — ET CE QUE ÇA VEUT DIRE QUAND IL VIENT D'UN GROUPE
 * (b239, demande de Vincent).
 *
 * « J'ai testé de supprimer une chanson que Marco avait mise dans le
 * répertoire du Groupe. Elle n'apparaît plus nulle part, ce qui est a priori
 * normal. Mais il faudrait qu'elle reste en proposition de Marco (dans les
 * idées), pour pouvoir restaurer si c'était nécessaire. […] Si la chanson
 * était incluse dans une setlist du Groupe, je ne pourrai pas la supprimer. »
 *
 * Un morceau à moi seul se supprime : c'est le mien, je le jette. Un morceau
 * du RÉPERTOIRE D'UN GROUPE n'est pas seulement à moi — quelqu'un d'autre l'y
 * a mis, et le groupe continue de l'avoir. Le supprimer chez moi ne doit donc
 * pas l'effacer, mais le REMETTRE à l'état où il est arrivé : une proposition
 * dans mes Idées (b174). Il quitte les morceaux que je joue, il reste
 * récupérable d'un geste, et rien n'est perdu.
 *
 * Et s'il est PROGRAMMÉ dans une setlist du groupe, on refuse : la setlist du
 * groupe engage les autres musiciens, pas seulement moi. Le retirer de la
 * setlist est un acte de niveau groupe, qui a son propre chemin.
 *
 * Trois issues, une seule fonction : le store applique la décision, les
 * écrans l'ANNONCENT avant. Ils ne peuvent pas diverger.
 */
import { Setlist, Song } from '../types';

export type SortDuMorceau =
  /** Morceau personnel : suppression franche, avec pierre tombale. */
  | { mode: 'supprime' }
  /** Morceau du répertoire d'un groupe : il retourne dans les Idées. */
  | { mode: 'idee'; bandId: string }
  /** Proposition d'un groupe : elle est ÉCARTÉE, pas effacée. */
  | { mode: 'ecarte'; bandId: string }
  /** Programmé dans une setlist du groupe : on ne le supprime pas. */
  | { mode: 'refus'; bandId: string; setlist: string };

/** Les groupes dont ce morceau fait partie du répertoire. */
export function groupesDuMorceau(song: Song): string[] {
  const ids = (song.versions ?? [])
    .map((v) => v.bandId ?? '')
    .filter((id) => id !== '');
  // `pendingBandId` dit d'où vient une proposition pas encore acceptée : elle
  // appartient au répertoire du groupe même si aucune version ne le porte.
  const enAttente = song.pendingBandId ?? '';
  if (enAttente !== '' && !ids.includes(enAttente)) ids.push(enAttente);
  return [...new Set(ids)];
}

/**
 * Ce qui arrivera VRAIMENT si on supprime ce morceau.
 *
 * `setlists` : toutes les miennes — on ne regarde que celles qui portent un
 * `bandId` du morceau, parce que c'est le programme du GROUPE qui protège,
 * pas mon brouillon personnel.
 */
export function sortDuMorceau(song: Song, setlists: Setlist[]): SortDuMorceau {
  const groupes = groupesDuMorceau(song);
  if (groupes.length === 0) return { mode: 'supprime' };
  const programmee = setlists.find(
    (sl) =>
      groupes.includes(sl.bandId ?? '') &&
      (sl.items ?? []).some((it) => it.songId === song.id),
  );
  if (programmee) {
    return {
      mode: 'refus',
      bandId: programmee.bandId ?? '',
      setlist: programmee.name,
    };
  }
  // DÉJÀ une proposition : la décliner ne l'EFFACE pas (b240). Une vraie
  // suppression poserait une pierre tombale, et le groupe — dont les
  // données n'ont pas bougé d'un pouce — n'aurait alors aucun moyen de la
  // reproposer : la porte se refermerait des deux côtés à la fois. Elle est
  // donc ÉCARTÉE : hors des Idées, hors de tout, sauf du répertoire du
  // groupe, où elle attend un « ↩ Reprendre ».
  if (song.idea === true) return { mode: 'ecarte', bandId: groupes[0] };
  return { mode: 'idee', bandId: groupes[0] };
}

/**
 * Le morceau tel qu'il redevient une proposition.
 *
 * On ne touche à RIEN d'autre : les versions du groupe, les paroles, les
 * notes restent. C'est ce qui permet de le restaurer tel qu'il était — sinon
 * « rester en proposition » ne servirait à rien.
 */
export function remisEnIdee(song: Song, bandId: string): Song {
  return {
    ...song,
    idea: true,
    declined: undefined,
    pendingBandId: bandId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * La proposition écartée. Elle garde tout — c'est ce qui permet de la
 * reprendre telle quelle, hors ligne et sans rien demander au groupe.
 */
export function ecartee(song: Song, bandId: string): Song {
  return {
    ...song,
    idea: true,
    declined: true,
    pendingBandId: bandId,
    updatedAt: new Date().toISOString(),
  };
}

/** L'inverse : elle redevient une proposition ordinaire, à valider. */
export function reprise(song: Song): Song {
  return {
    ...song,
    declined: undefined,
    updatedAt: new Date().toISOString(),
  };
}
