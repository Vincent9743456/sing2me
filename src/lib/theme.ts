/**
 * SOMBRE PAR DÉFAUT, CLAIR SUR DEMANDE (b233, demande de Vincent).
 *
 * L'app est sombre — c'est son identité de scène, et ça ne change pas. Le
 * mode clair est une SORTIE : plein jour, répétition dans une pièce éclairée,
 * yeux qui fatiguent sur du blanc-sur-noir. Le réglage vit sur la PARTITION
 * (c'est là qu'on lit vraiment) et s'applique à TOUTE l'app.
 *
 * Deux endroits, et c'est voulu :
 *  · `prefs.theme` fait FOI — il suit le compte, comme la langue ;
 *  · une copie en localStorage sert à poser le thème AVANT le premier rendu.
 *    Sans elle, l'app s'ouvrirait en sombre puis basculerait en clair sous
 *    les yeux, à chaque lancement. Un écran qui clignote au démarrage, c'est
 *    exactement ce qu'on ne veut pas sur scène.
 *
 * Ce module ne parle aucune langue et ne dépend de rien : il est appelé
 * depuis `main.tsx` avant React.
 */
export type Theme = 'sombre' | 'clair';

const CLE = 'sing2me/theme';

/** Le thème mémorisé localement — sombre tant qu'on n'a rien choisi. */
export function themeMemorise(): Theme {
  try {
    return localStorage.getItem(CLE) === 'clair' ? 'clair' : 'sombre';
  } catch {
    return 'sombre';
  }
}

/**
 * Pose le thème sur le document (et mémorise le choix).
 *
 * Le sombre n'écrit AUCUN attribut : c'est le `:root` nu, donc le thème par
 * défaut reste celui du CSS, sans dépendre de ce module. Si ce fichier ne
 * s'exécutait jamais, l'app serait sombre — le bon comportement.
 */
export function appliquerTheme(theme: Theme): void {
  try {
    const racine = document.documentElement;
    if (theme === 'clair') racine.setAttribute('data-theme', 'clair');
    else racine.removeAttribute('data-theme');
    // La barre d'état de l'app installée suit le fond : sans ça, un liseré
    // noir reste collé en haut d'une app devenue claire.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'clair' ? '#f4f2ee' : '#0a0a0e');
    localStorage.setItem(CLE, theme);
  } catch {
    /* stockage ou DOM indisponibles : on reste sur le thème du CSS */
  }
}
