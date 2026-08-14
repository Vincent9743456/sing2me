/**
 * MODE DIAGNOSTIC SANS URL (b342, constat de Vincent : « je n'ai que la
 * version app, pas accès à l'URL »). L'écran de diagnostic (b198) ne
 * s'ouvrait qu'en ajoutant ?diag=1 à l'adresse — inaccessible depuis l'app
 * installée sur un téléphone, qui n'a pas de barre d'adresse. CINQ APPUIS
 * sur le numéro de version (bas de l'onglet Artiste) basculent le mode,
 * dans un sens comme dans l'autre.
 *
 * Le réglage vit en localStorage : c'est un état de l'APPAREIL (comme le
 * thème ou la langue du mode scène), jamais synchronisé, et il survit au
 * redémarrage — un diagnostic se lit souvent après avoir relancé l'app.
 */
const CLE = 'sing2me/diag';

export function diagActif(): boolean {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    return false;
  }
}

/** Bascule le mode et renvoie le nouvel état (actif = true). */
export function basculerDiag(): boolean {
  const on = !diagActif();
  try {
    if (on) localStorage.setItem(CLE, '1');
    else localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : le mode restera celui de l'URL */
  }
  return on;
}
