/**
 * Origine CANONIQUE des liens donnés au public (b471).
 *
 * Le domaine de production est https://mojosong.com (b307) — mais l'ancienne
 * adresse Vercel reste servie, et une app INSTALLÉE depuis cette adresse
 * garde son origine pour toujours : chez elle, `location.origin` fabrique
 * des liens, QR et adresses affichées en `sing2me-three.vercel.app`
 * (signalé par Vincent, b471). Un lien qu'on DONNE — partage, QR, adresse
 * publique — porte donc toujours le domaine officiel.
 *
 * Ce que cette fonction ne sert JAMAIS : le `redirect_to` de l'auth
 * (Supabase doit ramener l'utilisateur sur l'adresse où il se trouve
 * vraiment, src/lib/auth.ts) et les navigations internes de la page où l'on
 * est déjà — là, `location.origin` reste le bon choix.
 */
export function originePublique(): string {
  const h = location.hostname;
  // Développement et essais locaux : on garde l'adresse réelle, sinon un
  // lien testé en local pointerait vers la production.
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h)
  ) {
    return location.origin;
  }
  if (h === 'mojosong.com' || h.endsWith('.mojosong.com')) {
    return location.origin;
  }
  return 'https://mojosong.com';
}
