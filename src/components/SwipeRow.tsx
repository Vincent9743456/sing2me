/**
 * LIGNE BALAYABLE (b254, demande de Vincent : « par un glisser vers la
 * gauche qui montre une corbeille ou un appui long avec le même effet »).
 *
 * Une action destructive n'a pas sa place en permanence sur une ligne : elle
 * se touche par erreur, et elle ajoute du bruit à un écran qui sert d'abord à
 * naviguer. Elle se RÉVÈLE donc, par deux gestes qui veulent dire la même
 * chose — glisser vers la gauche, ou appuyer longuement.
 *
 * Trois règles tirées de l'usage réel sur un téléphone :
 *  1. **un balayage n'est pas un défilement** : tant que le doigt part plutôt
 *     vers le bas, on ne prend pas la main — sinon la liste se bloque dès
 *     qu'on veut la faire défiler en effleurant une ligne ;
 *  2. **un seul volet ouvert à la fois** : ouvrir celui-ci ferme les autres,
 *     et toucher ailleurs referme tout. Deux corbeilles ouvertes, c'est une
 *     erreur qui attend ;
 *  3. **l'appui long ne déclenche RIEN tout seul** : il ouvre le volet. La
 *     suppression demande un second geste, délibéré, sur la corbeille.
 *
 * Le clavier n'est pas oublié : la corbeille est un vrai bouton, atteignable
 * à la tabulation, et le clic droit (ou l'appui long du navigateur) ouvre le
 * volet lui aussi.
 */
import React, { useEffect, useRef, useState } from 'react';

import { t } from '../i18n';

/** Ouvre-t-on ce volet ? Un seul à la fois, sur tout l'écran. */
const OUVERT = 'mojosong:volet';

/** Largeur du volet révélé — une cible tactile confortable (48 px + marges). */
const LARGEUR = 88;
/** Au-delà de cette distance, le volet reste ouvert quand on lâche. */
const SEUIL = 40;
/** Durée d'un appui long (ms). */
const APPUI_LONG = 550;

export function SwipeRow({
  children,
  onDelete,
  label,
  className = 'row',
  onClick,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  /** Ce que la corbeille supprimera — annoncé aux lecteurs d'écran. */
  label: string;
  className?: string;
  /**
   * Ce que fait la ligne quand on la touche (b280). Il vit ICI et pas dans
   * un div enfant : une ligne emboîtée dans une autre double son
   * rembourrage et sa bordure. Ignoré quand le volet est ouvert — sinon on
   * ouvrirait l'élément en voulant simplement refermer la corbeille.
   */
  onClick?: () => void;
}) {
  const [decalage, setDecalage] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const id = useRef(Math.random().toString(36).slice(2));
  const depart = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef<boolean | null>(null);
  const minuteur = useRef<number | null>(null);

  // Un seul volet ouvert sur l'écran : les autres se referment.
  useEffect(() => {
    const fermer = (e: Event) => {
      const qui = (e as CustomEvent<string>).detail;
      if (qui !== id.current) {
        setOuvert(false);
        setDecalage(0);
      }
    };
    window.addEventListener(OUVERT, fermer as EventListener);
    return () => window.removeEventListener(OUVERT, fermer as EventListener);
  }, []);

  const annulerAppuiLong = () => {
    if (minuteur.current !== null) {
      window.clearTimeout(minuteur.current);
      minuteur.current = null;
    }
  };

  const ouvrir = () => {
    annulerAppuiLong();
    setOuvert(true);
    setDecalage(LARGEUR);
    try {
      window.dispatchEvent(new CustomEvent(OUVERT, { detail: id.current }));
    } catch {
      // navigateur sans CustomEvent : le volet s'ouvre quand même
    }
  };

  const fermer = () => {
    annulerAppuiLong();
    setOuvert(false);
    setDecalage(0);
  };

  /**
   * Le rouge n'est peint que lorsqu'on le révèle (b283). Pendant le geste
   * `ouvert` est encore faux alors que le corps a déjà commencé à glisser :
   * c'est le DÉCALAGE qui fait foi, sinon on découvrirait un fond vide sous
   * le doigt.
   */
  const revele = ouvert || decalage > 0;

  return (
    <div className={`swiperow${revele ? ' revele' : ''}`}>
      <button
        type="button"
        className="swiperow-trash"
        tabIndex={ouvert ? 0 : -1}
        aria-hidden={!ouvert}
        aria-label={t('Supprimer {nom}', { nom: label })}
        title={t('Supprimer {nom}', { nom: label })}
        onClick={() => {
          fermer();
          onDelete();
        }}
      >
        🗑
      </button>
      <div
        className={`swiperow-body ${className}`}
        style={{
          transform: `translateX(-${decalage}px)`,
          transition: depart.current ? 'none' : 'transform 160ms ease',
        }}
        onClick={() => {
          if (ouvert) {
            fermer();
            return;
          }
          onClick?.();
        }}
        onContextMenu={(e) => {
          // Clic droit / appui long du navigateur : même effet, sans menu.
          e.preventDefault();
          ouvrir();
        }}
        onTouchStart={(e) => {
          const p = e.touches[0];
          depart.current = { x: p.clientX, y: p.clientY };
          horizontal.current = null;
          annulerAppuiLong();
          minuteur.current = window.setTimeout(ouvrir, APPUI_LONG);
        }}
        onTouchMove={(e) => {
          const d = depart.current;
          if (!d) return;
          const p = e.touches[0];
          const dx = p.clientX - d.x;
          const dy = p.clientY - d.y;
          // Le doigt part-il sur le côté, ou vers le bas ? On tranche une
          // fois, au premier mouvement franc — puis on ne revient plus
          // dessus, sinon le geste devient imprévisible en cours de route.
          if (horizontal.current === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            horizontal.current = Math.abs(dx) > Math.abs(dy);
            if (!horizontal.current) {
              // C'est un défilement : on rend la main à la liste.
              annulerAppuiLong();
              depart.current = null;
              return;
            }
          }
          annulerAppuiLong();
          const base = ouvert ? LARGEUR : 0;
          setDecalage(Math.max(0, Math.min(LARGEUR, base - dx)));
        }}
        onTouchEnd={() => {
          annulerAppuiLong();
          if (depart.current && horizontal.current) {
            if (decalage > SEUIL) ouvrir();
            else fermer();
          }
          depart.current = null;
          horizontal.current = null;
        }}
        onTouchCancel={() => {
          annulerAppuiLong();
          depart.current = null;
          horizontal.current = null;
          if (!ouvert) setDecalage(0);
        }}
        // Un volet ouvert se referme au premier contact ailleurs sur la ligne.
        onClickCapture={(e) => {
          if (ouvert) {
            e.stopPropagation();
            e.preventDefault();
            fermer();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
