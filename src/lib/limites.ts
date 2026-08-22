/**
 * LIMITES PAR PLAN (b381, spec validée par Vincent) — la configuration
 * centrale, à UN seul endroit. `null` = illimité. Extensible : une
 * nouvelle limite s'ajoute ici et nulle part ailleurs.
 *
 * Le PLAN vit côté serveur (`user_plans`, jamais modifiable par le
 * client) ; ces chiffres ne sont que l'ANNONCE côté app — l'autorité est
 * dans les verrous SQL de `supabase/plans.sql` (LIMIT_SONGS /
 * LIMIT_GROUPS), qui portent les mêmes valeurs.
 *
 * Règles validées :
 *  • morceaux comptés = bibliothèque perso HORS propositions en attente
 *    (`idea === true` ne compte pas) — un répertoire reçu sur invitation
 *    ne consomme rien ; accepter une proposition, si ;
 *  • groupes comptés = groupes CRÉÉS (`owned`) — rejoindre un groupe
 *    n'est JAMAIS bloqué ;
 *  • « un compte gratuit ne croît pas » : au-delà de la limite (bêta),
 *    on garde tout, on modifie, on supprime — on n'ajoute plus ;
 *  • l'import en masse reste ouvert en gratuit, il s'arrête au plafond.
 */

export type Plan = 'free' | 'pro' | 'admin';

export interface Limites {
  /** Morceaux perso (hors propositions). null = illimité. */
  maxSongs: number | null;
  /** Groupes créés (owned). null = illimité. */
  maxOwnedGroups: number | null;
  /** L'import en masse est-il ouvert ? */
  bulkImport: boolean;
  /** Setlists. null = illimité (aucun plan ne les limite aujourd'hui). */
  maxSetlists: number | null;
  /** Sessions live. null = illimité (idem). */
  liveSessions: number | null;
}

const ILLIMITE: Limites = {
  maxSongs: null,
  maxOwnedGroups: null,
  bulkImport: true,
  maxSetlists: null,
  liveSessions: null,
};

export const LIMITES: Record<Plan, Limites> = {
  free: {
    maxSongs: 30,
    maxOwnedGroups: 2,
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

/** Morceaux qui COMPTENT : la bibliothèque perso, hors propositions en
 *  attente. Même définition que `compte_morceaux` côté SQL. */
export function compteMorceauxPerso(songs: { idea?: boolean }[]): number {
  return songs.filter((s) => s.idea !== true).length;
}

/** Groupes qui COMPTENT : ceux que J'AI créés. */
export function compteGroupesCrees(bands: { owned?: boolean }[]): number {
  return bands.filter((b) => b.owned === true).length;
}

export function peutAjouterMorceau(plan: string, nActuel: number): boolean {
  const max = limitesDuPlan(plan).maxSongs;
  return max === null || nActuel < max;
}

export function peutCreerGroupe(plan: string, nActuel: number): boolean {
  const max = limitesDuPlan(plan).maxOwnedGroups;
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
