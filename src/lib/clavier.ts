/**
 * LE CLAVIER EST UN FAIT DE L'APP, PAS UNE AFFAIRE D'ÉCRAN (b264, constat de
 * Vincent : « l'apparition instantanée du clavier empêche de scroller »).
 *
 * Sur iOS, ouvrir le clavier ne rétrécit PAS la fenêtre de mise en page : il
 * la recouvre. Trois conséquences, qu'on a jusqu'ici corrigées écran par
 * écran :
 *
 *  · une PAGE ordinaire (Profil artiste, Réglages, éditeur…) garde exactement
 *    la même hauteur à faire défiler. Arrivé en bas, il ne reste plus rien à
 *    dérouler et le champ actif reste sous le clavier : la page paraît figée.
 *    C'est le défaut signalé, et il n'était traité NULLE PART ;
 *  · une feuille ancrée en bas naît DERRIÈRE le clavier (b152, rattrapé par
 *    une translation posée sur l'élément) ;
 *  · un panneau `position: fixed; inset: 0` garde sa hauteur pleine, donc sa
 *    zone défilante n'a plus rien à faire défiler (b210, rattrapé par deux
 *    variables CSS).
 *
 * Trois rustines pour une seule cause : la quatrième surface oubliée était
 * garantie. La mesure vit donc ICI, à un seul endroit, démarrée avant React
 * comme le thème, et elle publie trois variables que le CSS consomme :
 *
 *    --vv-h     hauteur RÉELLEMENT visible
 *    --vv-t     décalage du haut visible (iOS pousse la page vers le haut)
 *    --clavier  ce que le clavier mange en bas — 0 s'il est fermé
 *
 * Plus la classe `clavier-ouvert` sur la racine, pour ce qui doit disparaître
 * pendant la saisie (la barre d'onglets).
 *
 * Sans `visualViewport`, on ne pose rien : les valeurs de repli du CSS
 * rendent le comportement d'avant. Une mesure qu'on n'a pas ne s'invente pas.
 */

/**
 * Ce que le clavier recouvre, en pixels. Fonction PURE : c'est la seule
 * décision de ce module, donc la seule chose à vérifier.
 *
 * En dessous du seuil, ce n'est pas un clavier — c'est la barre d'adresse de
 * Safari qui se replie au défilement. La confondre avec un clavier ferait
 * sauter la page à chaque geste.
 */
export const SEUIL_CLAVIER = 90;

export function hauteurDuClavier(
  fenetre: number,
  visible: number,
  decalage: number,
): number {
  const cache = Math.round(fenetre - visible - decalage);
  return cache > SEUIL_CLAVIER ? cache : 0;
}

let demarre = false;

/** Idempotent : appelable depuis chaque entrée sans doubler les écouteurs. */
export function suivreLeClavier(): void {
  if (demarre) return;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  demarre = true;

  const racine = document.documentElement;
  let dernier = -1;

  const poser = () => {
    racine.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    racine.style.setProperty('--vv-t', `${Math.round(vv.offsetTop)}px`);
    const px = hauteurDuClavier(window.innerHeight, vv.height, vv.offsetTop);
    // Le défilement de la fenêtre visuelle déclenche cet écouteur en rafale :
    // on n'écrit que si la valeur a VRAIMENT changé, sinon chaque geste
    // provoquerait un recalcul de mise en page complet.
    if (px === dernier) return;
    dernier = px;
    racine.style.setProperty('--clavier', `${px}px`);
    racine.classList.toggle('clavier-ouvert', px > 0);
  };

  poser();
  vv.addEventListener('resize', poser);
  vv.addEventListener('scroll', poser);
  window.addEventListener('orientationchange', poser);
}
