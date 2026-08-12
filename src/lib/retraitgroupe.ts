/**
 * RETIRER UN MORCEAU DU RÉPERTOIRE D'UN GROUPE (b278, demande de Vincent :
 * « il faut pouvoir retirer un morceau du répertoire d'un groupe ou d'une
 * setlist sans le retirer de la bibliothèque, facilement et de manière
 * intuitive »).
 *
 * Le geste EXISTAIT, mais à un seul endroit et bien caché : dans la feuille
 * « Ajouter à… », où il fallait comprendre qu'on décoche un groupe déjà
 * coché. Un écran qui s'appelle « Ajouter » n'est pas l'endroit où l'on
 * cherche à retirer.
 *
 * La décision vit donc ICI, à un seul endroit — comme pour la suppression
 * d'un morceau (`deletesong.ts`) ou d'un groupe (`deleteband.ts`) : les
 * écrans l'APPLIQUENT et l'ANNONCENT, ils ne la réécrivent pas.
 *
 * Ce que ça fait, et ce que ça ne fait pas :
 *  · la VERSION du groupe s'en va ; la partition, elle, reste dans la
 *    bibliothèque personnelle de chacun — c'est tout l'objet de la demande ;
 *  · si le morceau n'avait QUE cette version, on ne la supprime pas (un
 *    morceau sans version n'existe pas) : elle redevient personnelle ;
 *  · le retrait est un acte de NIVEAU GROUPE, propagé à tous les membres
 *    (décision produit antérieure) — d'où une confirmation qui le dit.
 */
import { removeVersion, versionForBand } from './model';
import { Band, Song } from '../types';
import { t } from '../i18n';

/** Le morceau est-il au répertoire de ce groupe ? */
export function auRepertoire(song: Song, bandId: string): boolean {
  return versionForBand(song, bandId) !== null;
}

/** Le morceau, une fois retiré du répertoire du groupe. */
export function retireDuRepertoire(song: Song, bandId: string): Song {
  const v = versionForBand(song, bandId);
  if (!v) return song;
  return song.versions.length > 1
    ? removeVersion(song, v.id)
    : {
        ...song,
        versions: song.versions.map((x) =>
          x.id === v.id ? { ...x, bandId: '' } : x,
        ),
      };
}

/** Ce qu'on annonce avant de le faire. Un seul texte, partout. */
export function texteRetrait(
  song: Song,
  band: Band,
): { titre: string; message: string; libelle: string } {
  return {
    titre: t('Retirer « {title} » du répertoire de {band} ?', {
      title: song.title || t('ce morceau'),
      band: band.name || t('ce groupe'),
    }),
    message: t(
      'Le morceau sort du répertoire du groupe pour TOUS les membres. Il RESTE dans ta bibliothèque personnelle, et dans celle de chacun.',
    ),
    libelle: t('Retirer du répertoire'),
  };
}
