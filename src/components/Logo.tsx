/**
 * L'ICÔNE DODOSONGS — le dodo à la guitare (charte d'août 2026).
 *
 * C'est un BLOC COMPLET : le dodo et sa guitare sont posés sur le fond nuit,
 * dans un carré aux angles arrondis. On ne l'ouvre pas, on ne la recolore
 * pas, on ne l'incline pas, on ne lui ajoute pas d'ombre portée, et on ne la
 * met jamais dans un cercle — la composition est calée sur un carré.
 *
 * D'où une IMAGE et non un SVG dessiné à la main : ce fichier ne peut pas
 * diverger de l'icône de la charte, puisqu'il en est un redimensionnement
 * (`scripts/build-icons.mjs`, à partir de `public/dodosongs.png`).
 *
 * Deux fichiers, choisis par la taille demandée : la 128 px pour les emplois
 * courants (barres, pieds de page — la page du spectateur la charge aussi et
 * a un budget de poids), la 256 px au-delà de 64 px, sans quoi l'icône se
 * voit pixelisée sur un écran à haute densité. La 512 vit dans le manifeste
 * et le favicon.
 */
import React from 'react';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src={size > 64 ? '/dodosongs-256.png' : '/dodosongs-128.png'}
      width={size}
      height={size}
      alt="DodoSongs"
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}

/** Marque complète : icône + nom (« Songs » en accent). */
export function Brand({ size = 26 }: { size?: number }) {
  return (
    <span className="brandline">
      <LogoMark size={size} />
      <span className="brandname">
        Dodo<b>Songs</b>
      </span>
    </span>
  );
}
