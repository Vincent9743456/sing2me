/**
 * Logo Sing2Me : la « bulle qui chante » — une bulle de parole (le partage,
 * le public) d'où sort une note (la musique). Identité commune app + site +
 * favicon.
 */
import React from 'react';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Sing2Me"
    >
      <path
        d="M8 6h32a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H22l-9 8v-8H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z"
        fill="none"
        stroke="#f6832a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="27" r="4" fill="#f5f5f7" />
      <rect x="21.6" y="13" width="2.6" height="14" rx="1.3" fill="#f5f5f7" />
      <path
        d="M24.2 13c4.5 0.5 7 2.5 8.5 5.5"
        stroke="#f5f5f7"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
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
