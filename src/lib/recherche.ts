/**
 * Recherche « humaine » dans la bibliothèque (b337, constat de Vincent :
 * « la bas » ne trouvait pas « Là-Bas »). On ne compare jamais les textes
 * tels quels : on les REPLIE d'abord — minuscules, sans accents
 * (décomposition Unicode puis retrait des diacritiques), ligatures
 * dépliées (« bœuf » se cherche « boeuf »), et toute séparation RETIRÉE
 * (espaces, traits d'union, apostrophes) : « la bas », « labas » et
 * « Là-Bas » sont le même mot, « quest ce » trouve « Qu'est-ce ». Une
 * requête peut du coup chevaucher deux mots — dans une bibliothèque
 * personnelle, trouver trop vaut mieux que ne pas trouver. Le contenu
 * affiché, lui, ne change jamais : on ne replie que pour comparer.
 *
 * La décision vit ICI et nulle part ailleurs : tout champ de recherche qui
 * filtre des morceaux (bibliothèque, sélecteur, proposition au groupe)
 * passe par `replier` — deux recherches qui épluchent différemment
 * finiraient par trouver des choses différentes.
 */
export function replier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe') // la décomposition Unicode ne déplie pas les
    .replace(/æ/gi, 'ae') // ligatures : on s'en charge
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
