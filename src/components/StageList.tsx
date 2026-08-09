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
 * Cale un panneau plein écran sur la zone RÉELLEMENT visible (b210).
 *
 * `position: fixed; inset: 0` se règle sur la fenêtre de MISE EN PAGE, qui
 * ne rétrécit pas quand le clavier s'ouvre : le panneau garde sa hauteur
 * pleine, sa moitié basse passe sous le clavier, et la zone défilante — qui
 * contient alors tout son contenu sans déborder — n'a plus rien à faire
 * défiler. Le sélecteur de morceaux paraissait figé, clavier ouvert
 * (constat de Vincent). iOS pousse en plus la page pour montrer le champ
 * actif, ce qui décale le panneau sous l'heure et le réseau.
 *
 * On publie donc la hauteur et le décalage de la fenêtre VISUELLE en
 * variables CSS, et les panneaux s'y calent. Sans `visualViewport`
 * (navigateurs anciens), les valeurs de repli laissent le comportement
 * d'avant — rien ne casse.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const racine = document.documentElement.style;
    const poser = () => {
      racine.setProperty('--vv-h', `${Math.round(vv.height)}px`);
      racine.setProperty('--vv-t', `${Math.round(vv.offsetTop)}px`);
    };
    poser();
    vv.addEventListener('resize', poser);
    vv.addEventListener('scroll', poser);
    return () => {
      vv.removeEventListener('resize', poser);
      vv.removeEventListener('scroll', poser);
      racine.removeProperty('--vv-h');
      racine.removeProperty('--vv-t');
    };
  }, []);
}

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
  useVisualViewport();
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
