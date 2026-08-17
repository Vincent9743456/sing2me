/**
 * GARDE DE SORTIE D'UN BROUILLON (b354, demande de Vincent : « les
 * modifications en cours sont perdues si on sort du mode modification » de
 * la fiche artiste).
 *
 * Un écran en cours d'édition peut poser une garde : toute navigation de
 * l'app (navigate) demande alors son accord avant de partir. La garde
 * décide — typiquement en posant la question « Enregistrer tes
 * modifications ? » — puis rappelle `continuer` pour laisser la navigation
 * se faire, ou ne le rappelle pas pour rester sur place.
 *
 * UNE seule garde à la fois : c'est l'écran au premier plan qui la porte,
 * et il la LÈVE en quittant le mode édition ou au démontage. On ne bloque
 * que les navigations de l'app — le bouton système du navigateur, lui,
 * n'est pas interceptable proprement ; la garde réduit la perte au seul
 * geste qu'on ne contrôle pas.
 */

interface Garde {
  /** Faut-il retenir la sortie MAINTENANT ? (des modifications existent) */
  actif: () => boolean;
  /** Pose la question, puis rappelle `continuer` si la sortie est voulue. */
  demander: (continuer: () => void) => void;
}

let garde: Garde | null = null;

export function poserGarde(g: Garde): void {
  garde = g;
}

export function leverGarde(): void {
  garde = null;
}

/**
 * À appeler avant de naviguer : renvoie true si la voie est libre. Sinon la
 * garde a pris la main — elle rappellera `continuer` si l'utilisateur
 * confirme la sortie.
 */
export function sortieAutorisee(continuer: () => void): boolean {
  if (garde === null || !garde.actif()) return true;
  garde.demander(continuer);
  return false;
}
