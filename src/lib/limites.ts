/**
 * LIMITES PAR PLAN — la configuration centrale, à UN seul endroit.
 * `null` = illimité. Extensible : une nouvelle limite s'ajoute ici et
 * nulle part ailleurs.
 *
 * SIMPLIFIÉ b386 (arbitrage Vincent : « Simplifie tout. Pas de
 * distinction actif / réserve. Pas de gratuité au début. 50 chansons
 * c'est tout. Pas possible d'importer plus ») :
 *  • gratuit = 50 MORCEAUX dans la bibliothèque, et c'est tout —
 *    l'import (à l'unité comme en masse) S'ARRÊTE au plafond, avec
 *    bilan, jamais en silence. La « réserve » de b385 est retirée
 *    (le champ `Song.reserve` reste inerte chez qui l'aurait posé) ;
 *  • un morceau venu d'un GROUPE compte dès qu'il est ACCEPTÉ — une
 *    proposition en attente (`idea === true`) ne compte pas ;
 *  • les GROUPES sont illimités à tous les étages ;
 *  • le cap de SALLE (15 spectateurs simultanés en gratuit) est dans
 *    l'offre mais PAS ENCORE APPLIQUÉ : modèle de sièges à trancher.
 *    `maxSpectateurs` n'est PAS annoncé à l'écran d'ici là ;
 *  • le passage payant à la session (« Soir de concert » 24 h) est
 *    RETIRÉ du modèle (arbitrage b386). AUCUN prix à l'écran, jamais.
 *
 * Le PLAN vit côté serveur (`user_plans`, jamais modifiable par le
 * client) ; ces chiffres ne sont que l'ANNONCE côté app — l'autorité est
 * dans `supabase/plans.sql` (LIMIT_SONGS), qui porte les mêmes valeurs.
 * « Un compte gratuit ne croît pas » : au-delà du plafond (bêta), on
 * garde tout, on modifie, on supprime, on synchronise — on n'ajoute plus.
 */

export type Plan = 'free' | 'pro' | 'admin';

export interface Limites {
  /** Morceaux de la bibliothèque (hors propositions en attente). */
  maxSongs: number | null;
  /** Groupes créés. null = illimité (plus limité depuis b385). */
  maxOwnedGroups: number | null;
  /** Spectateurs SIMULTANÉS d'un live. PAS ENCORE APPLIQUÉ — ne rien
   *  annoncer à l'écran tant que le serveur ne le tient pas. */
  maxSpectateurs: number | null;
  /** L'import en masse est-il ouvert ? (il s'arrête au plafond) */
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

/** Morceaux qui COMPTENT : la bibliothèque, hors propositions en attente
 *  (un morceau de groupe compte dès qu'il est accepté). Même définition
 *  que `compte_morceaux` côté SQL. */
export function compteMorceauxPerso(songs: { idea?: boolean }[]): number {
  return songs.filter((s) => s.idea !== true).length;
}

export function peutAjouterMorceau(plan: string, nActuel: number): boolean {
  const max = limitesDuPlan(plan).maxSongs;
  return max === null || nActuel < max;
}

/** Places restantes avant la limite (null = illimité, jamais négatif). */
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
