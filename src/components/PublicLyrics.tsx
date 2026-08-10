/**
 * LES PAROLES TELLES QUE LE PUBLIC LES LIT (b219).
 *
 * C'était un bloc de texte brut en `white-space: pre-wrap`, centré : les
 * espaces de fin de ligne laissés par l'alignement des accords décalaient
 * les vers, les lignes de grille laissaient des trous, et les en-têtes de
 * sections se lisaient comme des paroles.
 *
 * Une seule fonction pour les trois écrans où le public lit (le direct, la
 * setlist parcourue, l'aperçu de la fiche artiste) : ce qu'un spectateur voit
 * ne dépend plus de la page par laquelle il est arrivé.
 */
import React from 'react';

import { stripChords } from '../lib/chordpro';
import { sectionDeLaLigne } from '../lib/sections';

export function PublicLyrics({
  text,
  style,
}: {
  text: string;
  style?: React.CSSProperties;
}) {
  // Filet : le texte arrive déjà sans accords, mais un vieux bundle encore
  // en ligne peut en pousser — le public ne doit jamais en voir.
  const lignes = stripChords(text).split('\n');
  return (
    <div className="publyrics" style={style}>
      {lignes.map((l, i) => {
        const section = sectionDeLaLigne(l);
        if (section !== null) {
          return (
            <div className="pl-section" key={i}>
              {section}
            </div>
          );
        }
        if (l.trim() === '') return <div className="pl-gap" key={i} />;
        // Texte centré : la moindre espace de bord décale le vers.
        return (
          <div className="pl-line" key={i}>
            {l.trim()}
          </div>
        );
      })}
    </div>
  );
}
