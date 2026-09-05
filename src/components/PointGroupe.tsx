/**
 * Couleur et point de couleur d'un GROUPE — l'unique source (b496, passe
 * de cohérence des listes). Quatre écrans déclaraient chacun leur
 * `BAND_COLORS` (Morceaux, Setlists, fiche morceau, sélecteur) : même
 * liste, quatre copies — la cinquième aurait fini par diverger (cicatrice
 * b202, version couleurs). La couleur se calcule par POSITION dans la
 * liste COMPLÈTE des groupes, jamais dans une liste filtrée : tous les
 * écrans donnent la même teinte au même groupe.
 */
import React from 'react';

import { Band } from '../types';

/** Couleurs des pastilles de groupe (tokens --band-*, stables par ordre). */
export const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

export function couleurDuGroupe(bands: Band[], bandId: string): string {
  return BAND_COLORS[
    Math.max(0, bands.findIndex((b) => b.id === bandId)) % BAND_COLORS.length
  ];
}

/**
 * Le point discret des pastilles de filtre — même rendu sur tous les
 * écrans (une bordure colorée signalerait la sélection, b427/F-2 : le
 * point relie la pastille à sa vue, l'encadrement dit l'état actif).
 */
export function PointGroupe({
  bands,
  bandId,
}: {
  bands: Band[];
  bandId: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: couleurDuGroupe(bands, bandId),
        marginRight: 2,
        flexShrink: 0,
      }}
    />
  );
}
