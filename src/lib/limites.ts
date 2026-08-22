/**
 * LIMITES PAR PLAN — la configuration centrale, à UN seul endroit.
 * `null` = illimité. Extensible : une nouvelle limite s'ajoute ici et
 * nulle part ailleurs.
 *
 * RÉALIGNÉ b385 sur l'OFFRE v2 (maquette de Vincent, « réadapte les
 * limites en fonction de cela ») :
 *  • gratuit = 50 morceaux ACTIFS ; la RÉSERVE est illimitée (« dépose
 *    tout dès le premier jour, tu choisis lesquels sont actifs ») et
 *    RIEN n'est jamais supprimé ni bloqué en écriture — un import qui
 *    dépasse le plafond entre en réserve, il n'est plus refusé ;
 *  • les GROUPES sont illimités À TOUS LES ÉTAGES (l'ancienne limite de
 *    2 groupes créés, b381, est retirée) ;
 *  • le cap de SALLE (15 spectateurs simultanés en gratuit) est dans
 *    l'offre mais PAS ENCORE APPLIQUÉ : son comportement exact (sièges,
 *    grâce de reconnexion) est un « reste à trancher » de la maquette.
 *    `maxSpectateurs` existe déjà ici pour que le jour venu, seul le
 *    serveur du live change ;
 *  • pendant le LANCEMENT les montants ne sont pas arrêtés : JAMAIS de
 *    prix à l'écran.
 *
 * Le PLAN vit côté serveur (`user_plans`, jamais modifiable par le
 * client) ; ces chiffres ne sont que l'ANNONCE côté app — l'autorité est
 * dans `supabase/plans.sql` (LIMIT_SONGS), qui porte les mêmes valeurs.
 *
 * Règles de comptage :
 *  • morceaux ACTIFS = bibliothèque perso HORS propositions en attente
 *    (`idea === true`) et HORS réserve (`reserve === true`) ;
 *  • « un compte gratuit ne croît pas » : au-delà du plafond (bêta), on
 *    garde tout actif, on modifie, on supprime — on n'ACTIVE plus.
 */

export type Plan = 'free' | 'pro' | 'admin';

export interface Limites {
  /** Morceaux ACTIFS (hors propositions et hors réserve). null = illimité. */
  maxSongs: number | null;
  /** Groupes créés. null = illimité (plus limité depuis b385, offre v2). */
  maxOwnedGroups: number | null;
  /** Spectateurs SIMULTANÉS d'un live. null = illimité. PAS ENCORE
   *  APPLIQUÉ côté serveur (voir en-tête) — ne rien annoncer à l'écran
   *  tant que le cap n'existe pas : une limite affichée et non tenue est
   *  aussi fausse qu'une limite tenue et cachée. */
  maxSpectateurs: number | null;
  /** L'import en masse est-il ouvert ? */
  bulkImport: boolean;
  /** Setlists. null = illimité (aucun plan ne les limite). */
  maxSetlists: number | null;
  /** Sessions live. null = illimité (idem). */
  liveSessions: number | null;
}

const ILLIMITE: Limites = {
  maxSongs: null,
  maxOwnedGroups: null,
  maxSpectateurs: null,
  bulkImport: true,
  maxSetlists: null,
  liveSessions: null,
};

export const LIMITES: Record<Plan, Limites> = {
  free: {
    maxSongs: 50,
    maxOwnedGroups: null,
    maxSpectateurs: 15,
    bulkImport: true,
    maxSetlists: null,
    liveSessions: null,
  },
  pro: ILLIMITE,
  admin: ILLIMITE,
};

/** Un plan inconnu (valeur future, cache abîmé) est traité comme 'free' :
 *  le côté SÛR est de ne rien débloquer qu'on ne connaît pas. */
export function limitesDuPlan(plan: string): Limites {
  return LIMITES[plan as Plan] ?? LIMITES.free;
}

export function estUnPlan(x: string): x is Plan {
  return x === 'free' || x === 'pro' || x === 'admin';
}

/** Morceaux qui COMPTENT : les ACTIFS de la bibliothèque perso — hors
 *  propositions en attente et hors réserve. Même définition que
 *  `compte_morceaux` côté SQL. */
export function compteMorceauxActifs(
  songs: { idea?: boolean; reserve?: boolean }[],
): number {
  return songs.filter((s) => s.idea !== true && s.reserve !== true).length;
}

/** Morceaux en réserve (pour l'affichage — jamais une limite). */
export function compteReserve(
  songs: { idea?: boolean; reserve?: boolean }[],
): number {
  return songs.filter((s) => s.idea !== true && s.reserve === true).length;
}

/** Peut-on ACTIVER un morceau de plus (création active ou sortie de
 *  réserve) ? Au-delà, le morceau existe quand même — en réserve. */
export function peutActiverMorceau(plan: string, nActifs: number): boolean {
  const max = limitesDuPlan(plan).maxSongs;
  return max === null || nActifs < max;
}

/** Places actives restantes (null = illimité, jamais négatif). */
export function placesRestantes(
  max: number | null,
  nActuel: number,
): number | null {
  return max === null ? null : Math.max(0, max - nActuel);
}

/** Le rappel discret ne s'affiche qu'à l'approche de la limite (≥ 80 %). */
export function presDeLaLimite(nActuel: number, max: number | null): boolean {
  return max !== null && max > 0 && nActuel >= Math.ceil(max * 0.8);
}
