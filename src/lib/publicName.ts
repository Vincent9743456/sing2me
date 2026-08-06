/**
 * Nom public dictable d'un artiste (chantier 4).
 * Contraintes : minuscules, sans espaces ni accents — facile à dicter
 * (« tape livemyband.fr/lenom »). Unicité garantie côté serveur ; certains
 * noms sont réservés (routes techniques de l'app).
 */

/** Noms réservés : routes de l'app + techniques. Jamais attribuables. */
export const RESERVED_NAMES = new Set([
  'admin',
  'api',
  'app',
  'artist',
  'assets',
  'auth',
  'band',
  'bands',
  'cgu',
  'concert',
  'concerts',
  'favicon',
  'follow',
  'import',
  'live',
  'login',
  'logout',
  'manifest',
  'me',
  'p',
  'public',
  'remote',
  'report',
  'robots',
  's',
  'setlist',
  'setlists',
  'signalement',
  'site',
  'song',
  'stage',
  'static',
  'www',
]);

/**
 * Normalise un nom public : minuscules, accents retirés, seuls a–z et 0–9
 * conservés (ni espaces, ni tirets — dictable). Renvoie '' si trop court.
 */
export function normalizePublicName(input: string): string {
  const cleaned = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
  return cleaned;
}

/** Un nom normalisé est-il valide et attribuable ? */
export function publicNameError(name: string): string | null {
  if (name.length < 3) return 'Au moins 3 caractères (lettres ou chiffres).';
  if (RESERVED_NAMES.has(name)) return 'Ce nom est réservé, choisis-en un autre.';
  return null;
}
