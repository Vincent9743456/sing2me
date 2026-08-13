/**
 * MOJOLOADER — la mascotte Mojo pour les VRAIES attentes (b304).
 *
 * Uniquement les rares moments longs (première synchro d'un gros répertoire,
 * import en masse…), jamais le démarrage courant ni une opération rapide :
 * l'overlay ne s'affiche qu'au bout d'un délai (~500 ms), pour ne pas
 * clignoter. Surcouche centrée, portalisée dans <body> (comme les feuilles,
 * b300) pour se poser au-dessus de tout.
 *
 * Règle de marque : le bleu #5BD0E8 est RÉSERVÉ aux accords — on n'utilise
 * donc que la pose « bonjour » (sans accessoire bleu), jamais « idée » ni
 * « content » (qui portent des étincelles bleues).
 *
 * Deux thèmes : la piste de la barre suit `--surface-sunken` (sombre en
 * sombre, clair en clair), le remplissage est l'ambre. `prefers-reduced-
 * motion` : Mojo figé, la barre reste active. Animations en transform/opacity
 * uniquement.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../i18n';

const DELAI_MS = 500;
const CLOTURE_MS = 550;

export function MojoLoader({
  active,
  label,
  value,
  max,
  inline = false,
}: {
  active: boolean;
  label?: string;
  /** Détermine la barre : progression connue → barre à pourcentage. */
  value?: number;
  max?: number;
  /** Dans le flux, sans surcouche : pour un chargement DE SECTION (ex. la
   *  liste des lives) — pas une opération qui bloque tout l'écran. */
  inline?: boolean;
}) {
  // 'off' = rien · 'on' = affiché · 'done' = petit salut de fin avant fondu.
  const [phase, setPhase] = useState<'off' | 'on' | 'done'>('off');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (active) {
      // On n'apparaît qu'après le délai : une opération rapide ne montre rien.
      setPhase((p) => {
        if (p === 'off') {
          timer.current = window.setTimeout(() => setPhase('on'), DELAI_MS);
        }
        return p;
      });
    } else {
      // Fin : si on était visible, un bref « terminé ! » puis fondu ; sinon
      // (opération rapide, ou déjà refermé) on efface tout de suite.
      setPhase((p) => {
        if (p === 'on') {
          timer.current = window.setTimeout(() => setPhase('off'), CLOTURE_MS);
          return 'done';
        }
        return 'off';
      });
    }
    return () => window.clearTimeout(timer.current);
    // Ne dépend QUE de `active` : le minuteur ne se réarme pas quand le
    // libellé ou la progression changent pendant l'attente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (phase === 'off') return null;

  const determinee =
    typeof value === 'number' && typeof max === 'number' && max > 0;
  const pct = determinee
    ? Math.max(0, Math.min(100, Math.round((value! / max!) * 100)))
    : 0;
  const fini = phase === 'done';

  const bloc = (
    <div
      className={`mojoload${inline ? ' mojoload-inline' : ''}`}
      {...(inline ? { role: 'status', 'aria-label': t('Chargement…') } : {})}
    >
      <img
        className={`mojoload-mascotte${fini ? ' fini' : ''}`}
        src="/mojo-bonjour.svg"
        alt=""
        aria-hidden="true"
        width={inline ? 76 : 120}
        height={inline ? 76 : 120}
      />
      {label != null && label !== '' && (
        <div className="mojoload-label">{fini ? t('C’est prêt !') : label}</div>
      )}
      <div
        className={`mojoload-bar${determinee ? '' : ' indet'}${fini ? ' plein' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(determinee ? { 'aria-valuenow': fini ? 100 : pct } : {})}
      >
        <div
          className="mojoload-fill"
          style={determinee ? { width: `${fini ? 100 : pct}%` } : undefined}
        />
      </div>
      {determinee && !fini && (
        <div className="mojoload-count">
          {value} / {max}
        </div>
      )}
    </div>
  );

  // Inline : dans le flux de la page (chargement d'une section). Sinon :
  // surcouche centrée portalisée dans <body>.
  if (inline) return bloc;

  return createPortal(
    <div
      className={`mojoload-backdrop${fini ? ' fini' : ''}`}
      role="status"
      aria-label={t('Chargement…')}
    >
      {bloc}
    </div>,
    document.body,
  );
}
