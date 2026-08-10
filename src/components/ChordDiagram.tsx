/**
 * DIAGRAMME DE MANCHE (b225).
 *
 * Un SVG, rien d'autre : pas d'image, pas de police spéciale, pas de
 * dépendance. Il suit la couleur du texte courant (`currentColor`), donc il
 * est lisible dans les deux thèmes sans qu'on écrive une seule couleur.
 *
 * Conventions universelles des recueils : ✕ = corde non jouée, ○ = corde à
 * vide, un point = un doigt, un trait épais = un barré, et le numéro de case
 * à gauche quand on n'est plus au sillet.
 */
import React from 'react';

import { MUET, Position } from '../lib/chordshapes';
import { t } from '../i18n';

const CORDES = 6;
const CASES = 5;

/** Libellé d'une position — écrit ICI, jamais dans le module de calcul. */
export function nomDePosition(p: Position): string {
  if (p.ouverte) return t('Position ouverte');
  const c = p.barre?.case_ ?? 0;
  return p.cordeRacine === 5
    ? t('Barré case {n} — fondamentale sur la 5ᵉ corde', { n: c })
    : t('Barré case {n} — fondamentale sur la 6ᵉ corde', { n: c });
}

export function ChordDiagram({
  position,
  taille = 1,
}: {
  position: Position;
  taille?: number;
}) {
  const jouees = position.cases.filter((c) => c > 0);
  const min = jouees.length > 0 ? Math.min(...jouees) : 1;
  const max = jouees.length > 0 ? Math.max(...jouees) : 1;
  // Fenêtre de 5 cases : au sillet tant que tout tient, sinon on descend.
  const depart = max <= CASES ? 1 : Math.max(1, min);
  const auSillet = depart === 1;

  const l = 22 * taille; // écart entre cordes
  const h = 26 * taille; // hauteur d'une case
  const mgX = 16 * taille;
  const mgY = 20 * taille;
  const largeur = mgX * 2 + l * (CORDES - 1);
  const hauteur = mgY + h * CASES + 10 * taille;
  const x = (corde: number) => mgX + corde * l;
  const y = (c: number) => mgY + (c - depart + 1) * h - h / 2;

  return (
    <svg
      className="chorddiag"
      width={largeur}
      height={hauteur}
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label={nomDePosition(position)}
    >
      {/* Sillet (trait épais) ou numéro de case */}
      {auSillet ? (
        <rect
          x={mgX - 1}
          y={mgY - 3 * taille}
          width={l * (CORDES - 1) + 2}
          height={4 * taille}
          fill="currentColor"
        />
      ) : (
        <text
          x={mgX - 7 * taille}
          y={mgY + h / 2 + 4 * taille}
          textAnchor="end"
          fontSize={11 * taille}
          fill="currentColor"
          opacity="0.75"
        >
          {depart}
        </text>
      )}

      {/* Cases */}
      {Array.from({ length: CASES + 1 }, (_, i) => (
        <line
          key={`f${i}`}
          x1={mgX}
          y1={mgY + i * h}
          x2={mgX + l * (CORDES - 1)}
          y2={mgY + i * h}
          stroke="currentColor"
          strokeWidth={1}
          opacity="0.4"
        />
      ))}

      {/* Cordes */}
      {Array.from({ length: CORDES }, (_, i) => (
        <line
          key={`c${i}`}
          x1={x(i)}
          y1={mgY}
          x2={x(i)}
          y2={mgY + CASES * h}
          stroke="currentColor"
          strokeWidth={1}
          opacity="0.55"
        />
      ))}

      {/* ✕ / ○ au-dessus du manche */}
      {position.cases.map((c, i) =>
        c === MUET ? (
          <text
            key={`m${i}`}
            x={x(i)}
            y={mgY - 7 * taille}
            textAnchor="middle"
            fontSize={11 * taille}
            fill="currentColor"
            opacity="0.7"
          >
            ✕
          </text>
        ) : c === 0 ? (
          <circle
            key={`o${i}`}
            cx={x(i)}
            cy={mgY - 10 * taille}
            r={4 * taille}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            opacity="0.7"
          />
        ) : null,
      )}

      {/* Barré */}
      {position.barre && position.barre.case_ >= depart && (
        <rect
          x={x(position.barre.de) - 6 * taille}
          y={y(position.barre.case_) - 6 * taille}
          width={(position.barre.a - position.barre.de) * l + 12 * taille}
          height={12 * taille}
          rx={6 * taille}
          fill="currentColor"
        />
      )}

      {/* Doigts */}
      {position.cases.map((c, i) =>
        c > 0 && c >= depart && c < depart + CASES ? (
          <circle
            key={`d${i}`}
            cx={x(i)}
            cy={y(c)}
            r={6.5 * taille}
            fill="currentColor"
          />
        ) : null,
      )}
    </svg>
  );
}

/**
 * La feuille qui s'ouvre au clic sur un accord : le symbole, une ou
 * plusieurs positions, et rien d'autre. On ne quitte pas la partition.
 */
export function ChordSheet({
  symbole,
  positions,
  onClose,
}: {
  symbole: string;
  positions: Position[];
  onClose: () => void;
}) {
  return (
    <div
      className="chordsheet-back"
      role="dialog"
      aria-modal="true"
      aria-label={t('Position de {accord}', { accord: symbole })}
      onClick={onClose}
    >
      <div className="chordsheet" onClick={(e) => e.stopPropagation()}>
        <div className="chordsheet-head">
          <strong>{symbole}</strong>
          <button
            className="btn ghost small"
            onClick={onClose}
            aria-label={t('Fermer')}
          >
            {t('Fermer')}
          </button>
        </div>
        <div className="chordsheet-body">
          {positions.map((p, i) => (
            <figure key={i}>
              <ChordDiagram position={p} />
              <figcaption>{nomDePosition(p)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
