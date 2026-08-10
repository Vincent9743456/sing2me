/**
 * SUPPRIMER UN GROUPE — LA DÉCISION, À UN SEUL ENDROIT (b254, demande de
 * Vincent : « prévois qu'il soit possible de supprimer un groupe depuis ce
 * menu »).
 *
 * « Supprimer » n'a pas le même sens selon le groupe :
 *  · je l'ai CRÉÉ → il est DISSOUS pour tout le monde (chacun garde ses
 *    copies personnelles des morceaux) ;
 *  · je l'ai REJOINT → je le QUITTE, les autres le gardent.
 *
 * La règle vivait dans l'écran du groupe ; elle est sortie ici pour que la
 * liste des groupes l'applique à l'identique. Une deuxième porte vers une
 * action ne doit jamais réimplémenter ce que fait la première — sinon les
 * deux finissent par ne plus dire la même chose (cicatrice b239, où la
 * feuille de suppression et le store devaient répondre pareil).
 */
import { getValidSession } from './auth';
import { deleteCloudBand, removeBandMember } from './bands';
import { t } from '../i18n';
import { Band } from '../types';

export type SortDuGroupe = 'dissoudre' | 'quitter';

/**
 * Le drapeau local `owned` est un REFLET du serveur (b213), recalé à
 * l'ouverture de la fiche. Un groupe qui n'a jamais été publié n'a pas de
 * `cloudId` : il est forcément à moi.
 */
export function sortDuGroupe(band: Band): SortDuGroupe {
  return band.owned === false && (band.cloudId ?? '') !== ''
    ? 'quitter'
    : 'dissoudre';
}

/** Ce qu'on annonce avant d'agir — jamais un mot qui dépasse l'effet. */
export function texteSuppression(band: Band): {
  titre: string;
  message: string;
  libelle: string;
} {
  const nom = band.name || t('ce groupe');
  return sortDuGroupe(band) === 'dissoudre'
    ? {
        titre: t('Supprimer le groupe « {nom} » ?', { nom }),
        message: t(
          'Le groupe sera dissous pour tous les membres (chacun garde ses copies personnelles des morceaux).',
        ),
        libelle: t('Supprimer le groupe'),
      }
    : {
        titre: t('Quitter le groupe « {nom} » ?', { nom }),
        message: t(
          'Tu quittes ce groupe. Tes copies personnelles des morceaux restent dans ta bibliothèque.',
        ),
        libelle: t('Quitter le groupe'),
      };
}

/**
 * Effet côté SERVEUR, best-effort : hors ligne ou serveur muet, la
 * suppression locale a lieu quand même. Un groupe qu'on croit avoir
 * supprimé et qui reste à l'écran serait pire que la trace laissée en base
 * — le sondage des notifications rattrape le reste.
 */
export async function detacherDuCloud(band: Band): Promise<void> {
  const cid = band.cloudId ?? '';
  if (cid === '') return;
  try {
    const s = await getValidSession();
    if (!s) return;
    if (sortDuGroupe(band) === 'dissoudre') await deleteCloudBand(s, cid);
    else await removeBandMember(s, cid, s.userId);
  } catch {
    // best-effort : la suppression locale a lieu de toute façon
  }
}
