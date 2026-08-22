/**
 * PLAN GRATUIT ATTEINT (b381) — la feuille qui l'annonce, et le canal
 * unique par lequel toute limite se signale.
 *
 * Un seul mécanisme pour les DEUX côtés :
 *  • les gardes CLIENT (bouton ＋ de Morceaux/Groupes, import en masse)
 *    appellent `signalerLimite(kind)` ;
 *  • le REFUS SERVEUR (LIMIT_SONGS sur la poussée cloud, intercepté dans
 *    Account) appelle la même fonction.
 * `signalerLimite` note l'événement côté serveur (mesure produit) puis
 * émet un événement fenêtre ; `LimiteHost`, montée une fois dans App,
 * l'écoute et ouvre la feuille. Deux chemins qui ouvriraient chacun leur
 * modale finiraient par se contredire.
 *
 * Garde-fous du modèle (spec Vincent) : JAMAIS de prix ni de seuil
 * chiffré au-delà des limites elles-mêmes — les chiffres de l'offre ne
 * sont pas arrêtés. Le CTA ambre est un emplacement, pas une vente.
 */
import React, { useEffect, useState } from 'react';

import { t } from '../i18n';
import { limitesDuPlan, Plan } from '../lib/limites';
import { noterLimiteAtteinte } from '../lib/plan';
import { Sheet } from './Feedback';
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
  plan,
  onClose,
}: {
  motif: MotifLimite | null;
  plan: Plan;
  onClose: () => void;
}) {
  const lim = limitesDuPlan(plan);
  const titre =
    motif === 'LIMIT_SONGS'
      ? t('Ta bibliothèque gratuite est pleine')
      : motif === 'LIMIT_GROUPS'
        ? t('Tes groupes gratuits sont au complet')
        : t('Passer en illimité');
  return (
    <Sheet title={titre} onClose={onClose}>
      {motif === 'LIMIT_SONGS' && lim.maxSongs !== null && (
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Le plan gratuit couvre {n} morceaux dans ta bibliothèque. Tout ce qui y est déjà reste à toi — tu peux jouer, modifier et supprimer sans limite.',
            { n: lim.maxSongs },
          )}
        </p>
      )}
      {motif === 'LIMIT_GROUPS' && lim.maxOwnedGroups !== null && (
        <p className="help" style={{ marginTop: 0 }}>
          {t(
            'Le plan gratuit couvre {n} groupes créés par toi. Rejoindre un groupe sur invitation reste toujours possible, sans limite.',
            { n: lim.maxOwnedGroups },
          )}
        </p>
      )}
      <p className="help" style={motif === null ? { marginTop: 0 } : undefined}>
        {t(
          'L’offre illimitée — morceaux et groupes sans plafond — arrive bientôt. Rien ne presse : tu seras prévenu ici même.',
        )}
      </p>
      {/* CTA ambre : l'emplacement du paiement à venir (hors périmètre b381).
          Un seul bouton ambre par écran — celui qui fera avancer. */}
      <button className="btn block" onClick={onClose}>
        {t('Passer en illimité (bientôt)')}
      </button>
      <button
        className="btn ghost block"
        style={{ marginTop: 8 }}
        onClick={onClose}
      >
        {t('Continuer en gratuit')}
      </button>
    </Sheet>
  );
}

/** Montée UNE fois (App) : écoute les signaux et ouvre la feuille. */
export function LimiteHost() {
  const { plan } = useLimits();
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
  return (
    <UpgradeSheet motif={motif} plan={plan} onClose={() => setMotif(null)} />
  );
}
