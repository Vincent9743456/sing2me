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
import { deleteCloudBand, leaveBand } from './bands';
import { noterDepartsEnAttente, retirerDepartEnAttente } from './departs';
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
 * Effet côté SERVEUR : hors ligne ou serveur muet, la suppression locale a
 * lieu quand même. Une DISSOLUTION ratée est rattrapée par la synchro
 * (`cleanupOrphanCloudBands` : un groupe cloud supprimé localement finit
 * dissous). Un DÉPART raté, lui, se NOTE et se rejoue (b408) : avant, il
 * était perdu en silence, et le membre restait fantôme pour toujours chez
 * les autres — impossible à réinviter (constat de Vincent, cas Marco).
 * Le départ passe par `leave_band` (et plus un DELETE brut) : le créateur
 * reçoit ainsi sa carte « Départs à traiter » (b142) et peut réinviter.
 */
export async function detacherDuCloud(band: Band): Promise<void> {
  const cid = band.cloudId ?? '';
  if (cid === '') return;
  if (sortDuGroupe(band) === 'dissoudre') {
    try {
      const s = await getValidSession();
      if (s) await deleteCloudBand(s, cid);
    } catch {
      // rattrapé par cleanupOrphanCloudBands à la prochaine synchro
    }
    return;
  }
  // Un départ se NOTE avant de se tenter — jamais l'inverse.
  noterDepartsEnAttente([cid]);
  try {
    const s = await getValidSession();
    if (s && (await leaveBand(s, cid))) retirerDepartEnAttente(cid);
  } catch {
    // la synchro rejouera le départ noté
  }
}
