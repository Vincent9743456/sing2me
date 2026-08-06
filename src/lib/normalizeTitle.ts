/**
 * Normalisation d'un titre de morceau pour comparaison (doublons, stats).
 * Module MINUSCULE et sans dépendance : il est partagé entre l'app musicien
 * et l'entrée publique légère — ne rien y ajouter qui tire d'autres modules
 * (le bundle spectateur doit rester < 100 Ko).
 */
export function normalizeTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Apostrophes SUPPRIMÉES (pas remplacées par un espace) :
      // « Ain't » et « Aint » doivent donner le même titre.
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}
