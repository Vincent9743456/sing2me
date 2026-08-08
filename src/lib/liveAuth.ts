/**
 * Comment l'app prouve au serveur qu'elle est BIEN CELLE DE CET ARTISTE
 * (b192).
 *
 * Avant : une clé unique, `LIVE_KEY`, commune à toute l'installation et
 * saisie à la main dans les Réglages. Le serveur ne savait donc pas qui
 * l'appelait — d'où le tri des statistiques et des mots du public sur le NOM
 * affiché, et tous les mélanges entre musiciens qui en ont découlé.
 *
 * Maintenant : le JETON DU COMPTE, que l'app a déjà en mémoire. Rien à
 * saisir, rien à partager, et un identifiant qui ne change jamais.
 *
 * On envoie les DEUX pendant la transition : si le jeton a expiré entre deux
 * rafraîchissements, la clé sauve l'appel — un direct ne se coupe pas pour un
 * jeton périmé de trois secondes.
 *
 * Module volontairement sans dépendance : `src/lib/live.ts` sert aussi
 * l'entrée publique légère, qui ne doit pas tirer tout le module d'auth.
 */

/** Jeton du compte connecté, lu directement du stockage local. */
function jeton(): string {
  try {
    const raw = localStorage.getItem('sing2me/session');
    if (!raw) return '';
    const s = JSON.parse(raw) as { accessToken?: string };
    return typeof s?.accessToken === 'string' ? s.accessToken : '';
  } catch {
    return '';
  }
}

/** En-têtes d'un appel réservé à l'artiste. */
export function liveHeaders(
  key = '',
  extra: Record<string, string> = {},
): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  const t = jeton();
  if (t !== '') h.authorization = `Bearer ${t}`;
  if (key.trim() !== '') h['x-live-key'] = key.trim();
  return h;
}

/**
 * Le mode ON AIR est-il utilisable ? Être connecté suffit désormais ; la
 * clé reste acceptée pour les installations qui l'avaient renseignée.
 */
export function liveReady(key = ''): boolean {
  return jeton() !== '' || key.trim() !== '';
}
