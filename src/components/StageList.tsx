/**
 * Panneau plein écran (détail d'un live, setlist du public, fiche artiste,
 * partage…) et son verrou de défilement — b184.
 *
 * Module VOLONTAIREMENT sans dépendances : il sert aussi à l'entrée publique
 * légère, qui ne doit pas tirer la barre d'onglets ni le bouton GO LIVE dans
 * son bundle.
 */
import React, { useEffect } from 'react';

/**
 * Fige la page pendant qu'un panneau plein écran est ouvert.
 *
 * Sans ce verrou, iOS donne le geste à la PAGE DU DESSOUS : le panneau
 * semblait figé (« le scroll ne fonctionne plus ») pendant que le contenu
 * derrière défilait. Fixer le body à sa position courante est la seule
 * méthode fiable sur iOS ; on la défait en rendant exactement la position
 * d'avant.
 *
 * Un compteur, parce que les panneaux se superposent (une feuille par-dessus
 * un panneau) : seul le premier pose le verrou, seul le dernier le retire —
 * sinon la fermeture du panneau du dessus rendrait une position fausse.
 */
let verrous = 0;
let repriseY = 0;
export function useScrollLock(): void {
  useEffect(() => {
    if (verrous === 0) {
      repriseY = window.scrollY;
      const b = document.body;
      b.style.position = 'fixed';
      b.style.top = `-${repriseY}px`;
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
    }
    verrous += 1;
    return () => {
      verrous -= 1;
      if (verrous > 0) return;
      const b = document.body;
      b.style.position = '';
      b.style.top = '';
      b.style.left = '';
      b.style.right = '';
      b.style.width = '';
      window.scrollTo(0, repriseY);
    };
  }, []);
}

/**
 * b210 vivait ici : `useVisualViewport` publiait `--vv-h` / `--vv-t` pour les
 * panneaux plein écran. La mesure est REMONTÉE dans `src/lib/clavier.ts`
 * (b264) — une seule maison, démarrée avant React, valable pour la page
 * comme pour les panneaux. Le CSS de `.pickerfull` et `.stagelist` lit
 * toujours les mêmes variables : rien n'a changé pour eux, sinon qu'elles
 * sont désormais posées même quand aucun panneau n'est ouvert.
 */

export function StageList({
  children,
  onClose,
  closeOnAnyClick = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Panneau d'attente : n'importe quel clic ferme. */
  closeOnAnyClick?: boolean;
}) {
  useScrollLock();
  return (
    <div
      className="stagelist"
      onClick={(e) => {
        if (closeOnAnyClick || e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
