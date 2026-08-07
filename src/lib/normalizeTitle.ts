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

/**
 * Clé d'identification d'un morceau dans un répertoire de groupe :
 * titre normalisé + artiste normalisé (b132) — deux morceaux homonymes
 * d'artistes différents ne se percutent plus. Le séparateur « @ » ne peut
 * pas apparaître dans un texte normalisé (remplacé par une espace).
 * Les VIEILLES clés (titre seul) restent dans les blobs et les retraits :
 * comparer avec `bandKeysMatch`, jamais avec `===`.
 */
export function songKey(title: string, artist: string): string {
  const t = normalizeTitle(title);
  const a = normalizeTitle(artist);
  if (t === '') return '';
  return a === '' ? t : `${t} @ ${a}`;
}

/** Partie « titre » d'une clé (nouvelle ou ancienne). */
export function keyTitlePart(key: string): string {
  const i = key.indexOf(' @ ');
  return i === -1 ? key : key.slice(0, i);
}

/** Partie « artiste » d'une clé ('' pour les anciennes clés titre seul). */
export function keyArtistPart(key: string): string {
  const i = key.indexOf(' @ ');
  return i === -1 ? '' : key.slice(i + 3);
}

/**
 * Deux clés désignent-elles le même morceau ? Même titre, et artistes
 * compatibles : égaux, ou l'un des deux inconnu (ancienne clé, champ
 * artiste vide chez un membre). « hallelujah @ cohen » ≠
 * « hallelujah @ buckley », mais « hallelujah » ≃ « hallelujah @ cohen ».
 */
export function bandKeysMatch(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  if (keyTitlePart(a) !== keyTitlePart(b)) return false;
  const aa = keyArtistPart(a);
  const ba = keyArtistPart(b);
  return aa === '' || ba === '' || aa === ba;
}
