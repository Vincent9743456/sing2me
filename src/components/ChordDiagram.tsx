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
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { MUET, Position } from '../lib/chordshapes';
import { t } from '../i18n';

const CORDES = 6;
const CASES = 5;

/**
 * Libellé d'une position — écrit ICI, jamais dans le module de calcul.
 *
 * L'ordre compte : sur un accord barre-oblique, ce que le musicien doit
 * savoir c'est QUELLE BASSE il joue (c'est tout l'objet de l'accord). Le
 * reste — barré, case — se lit sur le dessin.
 */
export function nomDePosition(p: Position): string {
  if (p.basse) return t('Basse en {note}', { note: p.basse });
  if (p.ouverte) return t('Position ouverte');
  if (p.barre) {
    return p.cordeRacine === 5
      ? t('Barré case {n} — fondamentale sur la 5ᵉ corde', { n: p.barre.case_ })
      : t('Barré case {n} — fondamentale sur la 6ᵉ corde', { n: p.barre.case_ });
  }
  // Ni ouverte ni barrée : on dit simplement où la main se pose. Dire
  // « barré case 0 » comme avant n'avait aucun sens.
  const doigtees = p.cases.filter((c) => c > 0);
  return doigtees.length === 0
    ? t('Position ouverte')
    : t('Case {n}', { n: Math.min(...doigtees) });
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
 * LA PASTILLE QUI S'OUVRE AU CLIC SUR UN ACCORD (b225, resserrée sur retour
 * de Vincent : « plus petit, pour ne pas empiéter sur toute la partition ;
 * toucher ailleurs doit faire disparaître la position »).
 *
 * Ce n'était pas la bonne forme : une boîte centrée sur fond noirci, c'est
 * une interruption — on quitte la partition pour lire un accord, alors qu'on
 * veut les DEUX sous les yeux (l'accord suivant est déjà à l'écran). D'où une
 * pastille ANCRÉE sous l'accord touché, sans voile, calée pour ne jamais
 * sortir de l'écran, et qui disparaît au moindre toucher — n'importe où, y
 * compris sur la partition.
 */
export function ChordSheet({
  symbole,
  positions,
  ancre,
  onClose,
}: {
  symbole: string;
  positions: Position[];
  /** Rectangle de l'accord touché, en coordonnées écran. */
  ancre: { x: number; bas: number; haut: number };
  onClose: () => void;
}) {
  const boite = useRef<HTMLDivElement | null>(null);
  const [pose, setPose] = useState<{ left: number; top: number } | null>(null);

  // Deux positions au plus : l'ouverte et le premier barré. Au-delà, la
  // pastille redevient une boîte, ce qu'on vient justement d'enlever.
  const montrees = positions.slice(0, 2);

  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const marge = 8;
    const left = Math.min(
      Math.max(marge, ancre.x - width / 2),
      window.innerWidth - width - marge,
    );
    // Sous l'accord ; au-dessus s'il n'y a plus la place en bas.
    const enBas = ancre.bas + 6;
    const top =
      enBas + height + marge <= window.innerHeight
        ? enBas
        : Math.max(marge, ancre.haut - height - 6);
    setPose({ left, top });
  }, [ancre.x, ancre.bas, ancre.haut, symbole]);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [onClose]);

  return (
    // Capteur transparent : PAS de voile — la partition reste lisible autour.
    // Il n'est là que pour recevoir le toucher qui referme.
    <div className="chordpop-catch" onClick={onClose} role="presentation">
      <div
        ref={boite}
        className="chordpop"
        role="dialog"
        aria-label={t('Position de {accord}', { accord: symbole })}
        style={{
          left: pose?.left ?? ancre.x,
          top: pose?.top ?? ancre.bas + 6,
          // Tant qu'on n'a pas mesuré, on ne montre rien : sinon la pastille
          // saute d'un coin de l'écran à sa place, à chaque accord touché.
          visibility: pose === null ? 'hidden' : 'visible',
        }}
      >
        <div className="chordpop-head">{symbole}</div>
        <div className="chordpop-body">
          {montrees.map((p, i) => (
            <figure key={i}>
              <ChordDiagram position={p} taille={0.62} />
              <figcaption>{nomDePosition(p)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
