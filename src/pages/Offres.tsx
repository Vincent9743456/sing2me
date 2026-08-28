/**
 * CHANGER DE PLAN (#/offres, b460 — demande de Vincent : « un bouton qui
 * permette de changer de plan, pour upgrader ou downgrader ; mène à une
 * page présentant les différents plans, les tarifs et les détails en
 * comparatif »).
 *
 * La page compare les TROIS offres (Gratuit / Musicien / Scène), marque
 * celle du compte, et porte un bouton par offre. Tant que le PAIEMENT
 * n'existe pas, choisir une autre offre ne bascule rien : le bouton dit
 * la vérité (« disponible avec le paiement en ligne, très bientôt ») —
 * le plan reste établi côté serveur (b381), et cette page deviendra la
 * caisse au branchement du paiement.
 *
 * RÈGLE DE PRORATA ACTÉE (Vincent, b460) : un upgrade en cours
 * d'abonnement ANNUEL ne facture que le différentiel, au prorata des
 * mois restants et déjà payés (ex. Musicien → Scène). Elle est écrite
 * sur la page et devra être implémentée avec le paiement.
 */
import React, { useState } from 'react';

import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';
import { useLimits } from '../components/useLimits';
import { t } from '../i18n';
import { TARIFS } from '../lib/limites';
import { navigate } from '../router';

type Offre = 'free' | 'musicien' | 'scene';

/** L'offre AFFICHÉE pour le plan du compte ('pro' et 'admin' = Scène). */
function offreDuPlan(plan: string): Offre {
  if (plan === 'musicien') return 'musicien';
  if (plan === 'scene' || plan === 'pro' || plan === 'admin') return 'scene';
  return 'free';
}

export function Offres() {
  const limites = useLimits();
  const actuelle = offreDuPlan(limites.plan);
  // Une seule mention « bientôt » à la fois, sous l'offre touchée.
  const [choisie, setChoisie] = useState<Offre | null>(null);

  const OFFRES: {
    id: Offre;
    nom: string;
    prix: string;
    prixDetail: string;
    points: { texte: string; fort?: boolean }[];
  }[] = [
    {
      id: 'free',
      nom: t('Gratuit'),
      prix: t('0 €'),
      prixDetail: t('pour toujours'),
      points: [
        { texte: t('30 morceaux dans ta bibliothèque') },
        { texte: t('Live : jusqu’à 15 spectateurs en simultané') },
        { texte: t('Groupes et setlists illimités') },
        { texte: t('Page publique, QR et pourboires (sans commission)') },
      ],
    },
    {
      id: 'musicien',
      nom: t('Musicien'),
      prix: t('{an}/an', { an: TARIFS.musicien.an }),
      prixDetail: t('ou {mois}/mois', { mois: TARIFS.musicien.mois }),
      points: [
        { texte: t('Morceaux illimités'), fort: true },
        { texte: t('Live : jusqu’à 15 spectateurs en simultané') },
        { texte: t('Groupes et setlists illimités') },
        { texte: t('Page publique, QR et pourboires (sans commission)') },
      ],
    },
    {
      id: 'scene',
      nom: t('Scène'),
      prix: t('{an}/an', { an: TARIFS.scene.an }),
      prixDetail: t('ou {mois}/mois', { mois: TARIFS.scene.mois }),
      points: [
        { texte: t('Morceaux illimités'), fort: true },
        { texte: t('Live : salle illimitée'), fort: true },
        { texte: t('Groupes et setlists illimités') },
        { texte: t('Page publique, QR et pourboires (sans commission)') },
      ],
    },
  ];

  return (
    <>
      <TopBar
        live={false}
        title={t('Changer de plan')}
        onBack={() => navigate('/artist')}
      />
      <div className="page">
        <p className="help">
          {t(
            'Trois offres, un même mojosong : tout ce que tu as importé reste à toi, consultable et exportable, quel que soit ton choix.',
          )}
        </p>
        {OFFRES.map((o) => {
          const estActuelle = o.id === actuelle;
          return (
            <div
              key={o.id}
              className="offrecard"
              style={
                estActuelle
                  ? undefined
                  : { background: 'var(--surface)', borderColor: 'var(--border-soft)' }
              }
            >
              <div className="offrehead">
                <span className="offrestar" aria-hidden="true">
                  <Icon name="star" size={17} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="offretitre">{o.nom}</div>
                  <div className="offresub">
                    <strong>{o.prix}</strong> · {o.prixDetail}
                  </div>
                </div>
                {estActuelle && (
                  <span className="planbadge">{t('Ton plan actuel')}</span>
                )}
              </div>
              <ul className="uplist" style={{ margin: 'var(--sp-2) 0' }}>
                {o.points.map((p2) => (
                  <li key={p2.texte}>
                    <span className="upcheck" aria-hidden="true">
                      ✓
                    </span>
                    {p2.fort ? <strong>{p2.texte}</strong> : p2.texte}
                  </li>
                ))}
              </ul>
              {!estActuelle && (
                <>
                  <button
                    className="btn ghost block"
                    onClick={() => setChoisie(o.id)}
                  >
                    {t('Choisir {offre}', { offre: o.nom })}
                  </button>
                  {choisie === o.id && (
                    <p
                      className="help"
                      aria-live="polite"
                      style={{ margin: '8px 0 0' }}
                    >
                      {t(
                        'Le changement de plan ouvre très bientôt, avec le paiement en ligne. Tu seras prévenu ici même.',
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
        <p className="help">
          {t(
            'Upgrade en cours d’abonnement annuel : tu ne paies que la différence, au prorata des mois restants déjà payés (ex. Musicien → Scène).',
          )}
        </p>
        <p className="help">
          {t(
            'Downgrade : au-dessus de 30 morceaux en repassant en gratuit, tu gardes tout pendant 30 jours pour t’organiser — rien n’est pris en otage.',
          )}
        </p>
      </div>
    </>
  );
}
