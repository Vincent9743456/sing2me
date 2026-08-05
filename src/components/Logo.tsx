/**
 * Logo Sing2Me : deux croches liées dont les têtes sont des cœurs.
 * La musique, le duo (groupe ↔ public), l'émotion — en un signe.
 */
import React from 'react';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sing2Me"
    >
      <defs>
        <linearGradient id="s2m-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8bc4f" />
          <stop offset="1" stopColor="#e8890f" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#s2m-tile)" />
      <g fill="#1a1206">
        {/* barre de liaison */}
        <path d="M22 13.5 L46.5 8.5 L46.5 15.5 L22 20.5 Z" />
        {/* hampes */}
        <rect x="22" y="15" width="4.2" height="30" rx="2" />
        <rect x="42.3" y="10.5" width="4.2" height="29.5" rx="2" />
        {/* têtes en cœur */}
        <path d="M23.8 44.6 c -2.7 -3.1 -7.9 -1.7 -7.9 2.3 c 0 3.5 4.5 5.8 7.9 8.1 c 3.4 -2.3 7.9 -4.6 7.9 -8.1 c 0 -4 -5.2 -5.4 -7.9 -2.3 Z" />
        <path d="M44.1 39.9 c -2.7 -3.1 -7.9 -1.7 -7.9 2.3 c 0 3.5 4.5 5.8 7.9 8.1 c 3.4 -2.3 7.9 -4.6 7.9 -8.1 c 0 -4 -5.2 -5.4 -7.9 -2.3 Z" />
      </g>
    </svg>
  );
}

/** Marque complète : icône + nom (le « 2 » en accent). */
export function Brand({ size = 26 }: { size?: number }) {
  return (
    <span className="brandline">
      <LogoMark size={size} />
      <span className="brandname">
        Sing<b>2</b>Me
      </span>
    </span>
  );
}
