/**
 * L'EMBLÈME MOJOSONG — le carnet ouvert (charte mojosong).
 *
 * La note à gauche dit la musique, les ondes à droite disent le direct
 * partagé : un seul signe pour les trois piliers du produit. On ne le
 * déforme pas, on ne sépare pas les ondes du carnet, on ne le recolore pas
 * hors charte, et on n'y introduit JAMAIS le bleu des accords.
 *
 * C'est l'emblème SEUL (ambre, fond transparent), donc INDÉPENDANT du thème :
 * l'ambre se lit aussi bien sur le nuit que sur le clair. Un SVG — il ne se
 * pixelise à aucune taille, et un seul fichier suffit à tous les emplois
 * (barres, pieds de page, portail de connexion, page du spectateur).
 */
import React from 'react';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/mojosong-emblem.svg"
      width={size}
      height={size}
      alt="mojosong"
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}

/**
 * Marque complète : emblème + nom. Le mot se lit « mojo » (la voix, couleur
 * de texte du thème) + « song » (l'ambre) — la règle de couleur de la charte,
 * portée par `.brandname` / `.brandname b`.
 */
export function Brand({ size = 26 }: { size?: number }) {
  return (
    <span className="brandline">
      <LogoMark size={size} />
      <span className="brandname">
        mojo<b>song</b>
      </span>
    </span>
  );
}
