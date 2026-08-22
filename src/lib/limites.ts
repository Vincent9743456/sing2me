/**
 * LIMITES PAR PLAN — la configuration centrale, à UN seul endroit.
 * `null` = illimité. Extensible : une nouvelle limite s'ajoute ici et
 * nulle part ailleurs.
 *
 * TROIS OFFRES (b387, arbitrage Vincent) :
 *  • GRATUIT  : 50 morceaux · 15 spectateurs simultanés en live ;
 *  • MUSICIEN : morceaux illimités · 15 spectateurs simultanés ;
 *  • SCÈNE    : tout illimité.
 * ('pro' reste accepté — héritage b381, traité comme Scène ; 'admin' =
 * fondateurs, tout illimité.)
 *
 * Règles (b386, inchangées) :
 *  • l'import — à l'unité comme en masse — S'ARRÊTE au plafond de
 *    morceaux, avec bilan, jamais en silence ; pas d'actif/réserve ;
 *  • un morceau venu d'un GROUPE compte dès qu'il est ACCEPTÉ — une
 *    proposition en attente (`idea === true`) ne compte pas ;
 *  • les GROUPES et les setlists sont illimités à tous les étages ;
 *  • le cap de SALLE est APPLIQUÉ depuis b387 (sièges par appareil,
 *    grâce de reconnexion, le 16ᵉ voit « salle pleine » — jamais
 *    d'éviction en cours de concert) : api/live.js porte la même
 *    valeur (CAP_SALLE) ;
 *  • les TARIFS sont arrêtés (0 € / 39 €/an ou 3,99 €/mois / 89 €/an ou
 *    8,99 €/mois) mais le PAIEMENT n'existe pas encore : l'app n'affiche
 *    aucun prix tant qu'on ne peut pas acheter.
 *
 * Le PLAN vit côté serveur (`user_plans`, jamais modifiable par le
 * client) ; ces chiffres ne sont que l'ANNONCE côté app — l'autorité est
 * dans `supabase/plans.sql` (LIMIT_SONGS) et `api/live.js` (cap de
 * salle). « Un compte gratuit ne croît pas » : au-delà du plafond
 * (bêta), on garde tout, on modifie, on supprime — on n'ajoute plus.
 */

export type Plan = 'free' | 'musicien' | 'scene' | 'pro' | 'admin';

export interface Limites {
  /** Morceaux de la bibliothèque (hors propositions en attente). */
  maxSongs: number | null;
  /** Groupes créés. null = illimité (plus limité depuis b385). */
  maxOwnedGroups: number | null;
  /** Spectateurs SIMULTANÉS d'un live (appliqué par api/live.js, b387). */
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
  musicien: {
    maxSongs: null,
    maxOwnedGroups: null,
    maxSpectateurs: 15,
    bulkImport: true,
    maxSetlists: null,
    liveSessions: null,
  },
  scene: ILLIMITE,
  pro: ILLIMITE, // héritage b381 — équivaut à Scène
  admin: ILLIMITE,
};

/** Un plan inconnu (valeur future, cache abîmé) est traité comme 'free' :
 *  le côté SÛR est de ne rien débloquer qu'on ne connaît pas. */
export function limitesDuPlan(plan: string): Limites {
  return LIMITES[plan as Plan] ?? LIMITES.free;
}

export function estUnPlan(x: string): x is Plan {
  return (
    x === 'free' ||
    x === 'musicien' ||
    x === 'scene' ||
    x === 'pro' ||
    x === 'admin'
  );
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
