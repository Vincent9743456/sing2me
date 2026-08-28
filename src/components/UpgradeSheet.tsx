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
 * thème (règle 12). Depuis b458 (décision Vincent), la feuille AFFICHE
 * les tarifs (b454, `TARIFS` dans limites.ts) et détaille les deux
 * offres — le « jamais de prix » de b384/b387 est levé. Depuis b460, le
 * CTA ambre mène à la page « Changer de plan » (#/offres) : le
 * comparatif complet, et demain la caisse.
 */
import React, { useEffect, useState } from 'react';

import { t } from '../i18n';
import { TARIFS } from '../lib/limites';
import { noterLimiteAtteinte } from '../lib/plan';
import { navigate } from '../router';
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
        {/* Les DEUX offres, avec leurs tarifs (b458). */}
        <div className="card" style={{ textAlign: 'left', width: '100%' }}>
          <div className="usagerow">
            <strong>{t('Musicien')}</strong>
            <span className="planbadge">
              {t('{an}/an ou {mois}/mois', {
                an: TARIFS.musicien.an,
                mois: TARIFS.musicien.mois,
              })}
            </span>
          </div>
          <p className="help" style={{ marginBottom: 0 }}>
            {t('Morceaux illimités · live jusqu’à 15 spectateurs en simultané.')}
          </p>
        </div>
        <div className="card" style={{ textAlign: 'left', width: '100%' }}>
          <div className="usagerow">
            <strong>{t('Scène')}</strong>
            <span className="planbadge">
              {t('{an}/an ou {mois}/mois', {
                an: TARIFS.scene.an,
                mois: TARIFS.scene.mois,
              })}
            </span>
          </div>
          <p className="help" style={{ marginBottom: 0 }}>
            {t('Morceaux illimités · salle de live illimitée.')}
          </p>
        </div>
        <ul className="uplist">
          <li>
            <span className="upcheck" aria-hidden="true">
              ✓
            </span>
            {t('Groupes, setlists et import : déjà sans limite pour tous')}
          </li>
        </ul>
        {/* CTA ambre : depuis b460 il mène à la page « Changer de plan »
            (#/offres) — le comparatif complet, et demain la caisse. */}
        <button
          className="btn block"
          onClick={() => {
            onClose();
            navigate('/offres');
          }}
        >
          {t('Changer de plan')}
        </button>
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
