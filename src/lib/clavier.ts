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

  /**
   * PAS DE CLAVIER SANS CHAMP DE SAISIE (b367, constat de Vincent : « les
   * boutons en bas de l'app ont disparu »). Au lancement d'une PWA iOS — et
   * plus encore juste après un rechargement silencieux (b365) — la fenêtre
   * visuelle peut être annoncée RÉDUITE le temps de l'animation : la mesure
   * initiale concluait « clavier ouvert », masquait la barre d'onglets… et
   * si aucun redimensionnement ne suivait, RIEN ne la détrompait jamais.
   * Or un clavier n'existe que si un élément éditable a le focus : sans
   * focus, la mesure ne peut pas dire « clavier », quoi qu'annonce iOS.
   */
  const saisieEnCours = (): boolean => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return false;
    const tag = a.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      a.isContentEditable === true
    );
  };

  const poser = () => {
    racine.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    racine.style.setProperty('--vv-t', `${Math.round(vv.offsetTop)}px`);
    const px = saisieEnCours()
      ? hauteurDuClavier(window.innerHeight, vv.height, vv.offsetTop)
      : 0;
    // Le défilement de la fenêtre visuelle déclenche cet écouteur en rafale :
    // on n'écrit que si la valeur a VRAIMENT changé, sinon chaque geste
    // provoquerait un recalcul de mise en page complet.
    if (px === dernier) return;
    dernier = px;
    racine.style.setProperty('--clavier', `${px}px`);
    racine.classList.toggle('clavier-ouvert', px > 0);
  };

  /**
   * RÉALIGNEMENT APRÈS LA SAISIE (b447, capture de Vincent : barre
   * d'onglets peinte AU MILIEU de l'écran, liste décalée sous l'horloge —
   * la récidive du « pire » décrit en b264). iOS referme parfois le
   * clavier en laissant la fenêtre VISUELLE décalée par rapport à la
   * fenêtre de mise en page : les éléments `position: fixed` (barre
   * d'onglets, barre de titre) se peignent alors à un « bas » qui n'est
   * plus le bas visible, jusqu'au prochain geste de défilement. Quand la
   * saisie se termine et que le décalage persiste, un micro-défilement
   * aller-retour force Safari à réaligner les deux fenêtres. Déclenché
   * UNIQUEMENT à la fin d'une saisie — jamais pendant un zoom au doigt,
   * où un décalage est légitime — et sans décalage, aucun effet.
   */
  const realigner = () => {
    if (saisieEnCours()) return;
    if (vv.offsetTop <= 0.5) return;
    window.scrollBy(0, 1);
    window.scrollBy(0, -1);
  };

  poser();
  vv.addEventListener('resize', poser);
  vv.addEventListener('scroll', poser);
  window.addEventListener('orientationchange', poser);
  // Le focus est désormais une ENTRÉE de la mesure : on rejoue au moment où
  // il change. Au blur, iOS anime la fermeture (~250 ms) sans toujours
  // émettre de resize — une relecture différée récupère l'état final.
  window.addEventListener('focusin', poser);
  window.addEventListener('focusout', () => {
    poser();
    window.setTimeout(() => {
      poser();
      realigner();
    }, 300);
  });
  // Retour au premier plan : les mesures du lancement peuvent être fausses,
  // celles-ci sont les vraies — et un décalage resté collé pendant
  // l'absence se réaligne au passage (b447), même filet qu'en fin de
  // saisie.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      poser();
      window.setTimeout(realigner, 300);
    }
  });
}
