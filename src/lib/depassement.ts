/**
 * DÉPASSEMENT DU PLAN GRATUIT (b422, arbitrage Vincent + Marco).
 *
 * Le cas : un compte prend l'abonnement un mois, charge 200 morceaux, puis
 * repasse en gratuit. « Un compte gratuit ne croît pas » (plans.sql) bloque
 * déjà toute nouvelle entrée — mais les 200 restaient jouables pour
 * toujours. Décision des fondateurs :
 *  · on n'efface RIEN tout de suite : 30 jours pour choisir (se réabonner,
 *    ou revenir à 50), bandeau dans Morceaux + e-mails de prévenance
 *    (serveur : server/depassement.js — à l'ouverture du délai, chaque
 *    semaine, puis chaque jour les 3 derniers jours) ;
 *  · à l'échéance, l'app fait le TRI : elle garde les 50 les plus utilisés
 *    — ceux des setlists d'abord, puis les plus joués — et pas de
 *    « réserve » au réabonnement : ce qui sort devra être réimporté.
 *
 * L'HORLOGE EST AU SERVEUR (table `depassement_avis`, une seule vérité,
 * lisible par son propriétaire) : deux appareils ne peuvent pas compter
 * deux délais différents, et vider son localStorage ne remet pas le
 * compteur à zéro.
 *
 * Le TRI respecte les portes existantes (deletesong, b239/b418) :
 *  · un morceau PROGRAMMÉ dans une setlist de groupe ne se supprime pas
 *    (le programme engage les autres) — il est PROTÉGÉ, même au-delà du
 *    plafond ;
 *  · un morceau du répertoire d'un groupe RETOURNE EN PROPOSITION (rien
 *    n'est perdu pour le groupe, et une proposition ne compte pas) ;
 *  · un morceau personnel est SUPPRIMÉ, tombe par ID seul — un futur
 *    réimport du même titre reste possible, c'est voulu.
 * Garde-fou intangible (b387) : « rien n'est pris en otage » — pendant
 * les 30 jours tout reste consultable ET exportable (Réglages), et les
 * e-mails le rappellent.
 */
import { estBrouillon, Band, Setlist, Song } from '../types';
import { sortDuMorceau } from './deletesong';

export const JOURS_DE_GRACE = 30;

export function echeance(depuis: string): Date {
  return new Date(new Date(depuis).getTime() + JOURS_DE_GRACE * 86400000);
}

export function estEchu(depuis: string, maintenant = new Date()): boolean {
  return maintenant.getTime() >= echeance(depuis).getTime();
}

/**
 * L'ordre dans lequel on GARDE : les morceaux d'une setlist d'abord (c'est
 * le répertoire qu'on travaille), puis les plus joués en concert (les cœurs
 * reçus en sont la trace), puis les plus récemment touchés. Tri STABLE et
 * déterministe (titre en dernier départage) : deux appareils qui trient le
 * même état gardent les mêmes morceaux.
 */
export function ordreDeConservation(
  songs: Song[],
  setlists: Setlist[],
): Song[] {
  const enSetlist = new Set(
    setlists.flatMap((sl) => (sl.items ?? []).map((it) => it.songId)),
  );
  return [...songs].sort(
    (a, b) =>
      (enSetlist.has(b.id) ? 1 : 0) - (enSetlist.has(a.id) ? 1 : 0) ||
      (b.hearts ?? 0) - (a.hearts ?? 0) ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.title.localeCompare(b.title, 'fr'),
  );
}

export interface PlanDeTri {
  /** Ceux qui restent (dans la limite du plafond). */
  gardes: Song[];
  /** Répertoire d'un groupe : retour en proposition (ne compte plus). */
  enProposition: { song: Song; bandId: string }[];
  /** Personnels : supprimés (tombe par ID seul). */
  aSupprimer: Song[];
  /** Programmés dans une setlist de groupe : intouchables (b239), gardés
   *  même au-delà du plafond. */
  proteges: Song[];
}

/** Ce que le tri fera VRAIMENT — calcul pur, annonçable avant d'agir. */
export function planDeTri(
  songs: Song[],
  setlists: Setlist[],
  bands: Band[],
  max: number,
): PlanDeTri {
  const comptes = songs.filter((s) => !estBrouillon(s) && s.idea !== true);
  const ordre = ordreDeConservation(comptes, setlists);
  const gardes = ordre.slice(0, Math.max(0, max));
  const enProposition: { song: Song; bandId: string }[] = [];
  const aSupprimer: Song[] = [];
  const proteges: Song[] = [];
  for (const s of ordre.slice(Math.max(0, max))) {
    const sort = sortDuMorceau(s, setlists, bands);
    if (sort.mode === 'refus') proteges.push(s);
    else if (sort.mode === 'idee')
      enProposition.push({ song: s, bandId: sort.bandId });
    else if (sort.mode === 'supprime') aSupprimer.push(s);
    // 'proposition' est impossible ici : les idea === true ne comptent pas.
  }
  return { gardes, enProposition, aSupprimer, proteges };
}
