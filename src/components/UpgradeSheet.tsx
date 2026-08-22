/**
 * PLAN GRATUIT ATTEINT (b381) — la feuille qui l'annonce, et le canal
 * unique par lequel toute limite se signale.
 *
 * Un seul mécanisme pour les DEUX côtés :
 *  • les gardes CLIENT (activation d'un morceau, import au plafond)
 *    appellent `signalerLimite(kind)` ;
 *  • le REFUS SERVEUR (LIMIT_SONGS sur la poussée cloud, intercepté dans
 *    Account) appelle la même fonction.
 * `signalerLimite` note l'événement côté serveur (mesure produit) puis
 * émet un événement fenêtre ; `LimiteHost`, montée une fois dans App,
 * l'écoute et ouvre la feuille.
 *
 * SIMPLIFIÉ b386 (arbitrage Vincent) : 50 morceaux en gratuit, c'est
 * tout — l'import s'arrête là, plus de réserve. Les groupes ne sont pas
 * limités : le motif LIMIT_GROUPS ne subsiste qu'en transition (une base
 * où l'ancien verrou b381 n'a pas encore été retiré) et affiche la
 * feuille générique.
 *
 * Habillage b384 d'après les maquettes de Vincent — tout en JETONS du
 * thème (règle 12). Garde-fou du modèle : JAMAIS de prix — les montants
 * de l'offre ne sont pas arrêtés. Le CTA ambre est un emplacement, pas
 * une vente : il répond la vérité (« bientôt ») au lieu de faire
 * semblant.
 */
import React, { useEffect, useState } from 'react';

import { t } from '../i18n';
import { noterLimiteAtteinte } from '../lib/plan';
import { Sheet } from './Feedback';
import { Icon } from './Icon';
import { useLimits } from './useLimits';

export type MotifLimite = 'LIMIT_SONGS' | 'LIMIT_GROUPS';

const EVENEMENT = 'mojo:limite';

/** Signale une limite ATTEINTE : mesure serveur + ouverture de la feuille. */
export function signalerLimite(kind: MotifLimite): void {
  noterLimiteAtteinte(kind);
  try {
    window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: kind }));
  } catch {
    // sans CustomEvent, tant pis pour la feuille — rien d'autre ne casse
  }
}

/** La feuille elle-même — consultable aussi depuis les Réglages (là, sans
 *  motif : on découvre l'offre, on n'a heurté aucune limite). */
export function UpgradeSheet({
  motif,
  onClose,
}: {
  motif: MotifLimite | null;
  onClose: () => void;
}) {
  const { morceaux, maxMorceaux } = useLimits();
  // Le CTA dit la vérité quand on le touche : l'offre n'est pas ouverte.
  const [bientot, setBientot] = useState(false);
  const surMorceaux = motif === 'LIMIT_SONGS' && maxMorceaux !== null;
  return (
    <Sheet onClose={onClose}>
      <div className="upsheet">
        <div className="upstar" aria-hidden="true">
          <Icon name="star" size={26} />
        </div>
        <h3 className="uptitle">
          {surMorceaux
            ? t('Ton répertoire mérite plus grand')
            : t('Passer en illimité')}
        </h3>
        {surMorceaux ? (
          <>
            <p className="help uptext">
              {t(
                'Ton compte gratuit va jusqu’à {n} morceaux. Passe en illimité pour continuer à l’enrichir.',
                { n: maxMorceaux },
              )}
            </p>
            <span className="upchip">
              {t('{n} / {max} morceaux', { n: morceaux, max: maxMorceaux })}
            </span>
          </>
        ) : (
          <p className="help uptext">
            {t(
              'Morceaux sans plafond, pour un répertoire qui grandit avec toi.',
            )}
          </p>
        )}
        <ul className="uplist">
          <li>
            <span className="upcheck" aria-hidden="true">
              ✓
            </span>
            {t('Morceaux illimités')}
          </li>
          <li>
            <span className="upcheck" aria-hidden="true">
              ✓
            </span>
            {t('Tout le reste, sans limite')}
          </li>
        </ul>
        {/* CTA ambre : l'emplacement du paiement à venir (hors périmètre).
            Un seul bouton ambre par écran — celui qui fera avancer. */}
        <button className="btn block" onClick={() => setBientot(true)}>
          {t('Passer en illimité')}
        </button>
        {bientot && (
          <p className="help" aria-live="polite" style={{ marginBottom: 0 }}>
            {t(
              'L’offre illimitée arrive bientôt. Rien ne presse : tu seras prévenu ici même.',
            )}
          </p>
        )}
        <button className="btn ghost block uplater" onClick={onClose}>
          {t('Plus tard')}
        </button>
      </div>
    </Sheet>
  );
}

/** Montée UNE fois (App) : écoute les signaux et ouvre la feuille. */
export function LimiteHost() {
  const [motif, setMotif] = useState<MotifLimite | null>(null);
  useEffect(() => {
    const surSignal = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d === 'LIMIT_SONGS' || d === 'LIMIT_GROUPS') setMotif(d);
    };
    window.addEventListener(EVENEMENT, surSignal);
    return () => window.removeEventListener(EVENEMENT, surSignal);
  }, []);
  if (motif === null) return null;
  return <UpgradeSheet motif={motif} onClose={() => setMotif(null)} />;
}
