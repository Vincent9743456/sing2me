/**
 * Portail d'entrée (décision Vincent, b120) : la connexion / création de
 * compte est OBLIGATOIRE avant d'utiliser l'app. Une seule page, très
 * épurée : logo, une phrase, le bloc de connexion (lien magique + code de
 * connexion), le lien CGU.
 *
 * HORS-LIGNE : cette page n'apparaît que si AUCUN compte n'existe sur cet
 * appareil (session en localStorage). Un compte déjà connecté ouvre l'app
 * même en mode avion — le portail ne dépend jamais du réseau. Les pages
 * publiques (/live, /nom, /s/…, CGU, signalement) ne passent pas par ici.
 */
import React from 'react';

import { AccountSection } from '../components/Account';
import { LogoMark } from '../components/Logo';
import { t } from '../i18n';
import { APP_BUILD } from '../version';

export function Welcome() {
  return (
    <div
      className="public"
      style={{ paddingTop: 'calc(var(--sp-6) + env(safe-area-inset-top))' }}
    >
      <div style={{ textAlign: 'center', marginBottom: 'var(--sp-5)' }}>
        <LogoMark size={128} />
        <h1 style={{ margin: 'var(--sp-3) 0 var(--sp-1)' }}>mojosong</h1>
        <p className="help" style={{ margin: 0 }}>
          {t('Ton songbook, tes groupes, tes concerts.')}
        </p>
      </div>
      <AccountSection />
      <p
        className="help"
        style={{ textAlign: 'center', marginTop: 'var(--sp-5)' }}
      >
        {t(
          'Gratuit. Ta bibliothèque reste sur ton appareil et te suit partout une fois connecté.',
        )}
      </p>
      <p className="help" style={{ textAlign: 'center' }}>
        <a href="#/cgu" style={{ color: 'var(--text-dim)' }}>
          {t("Conditions d'utilisation")}
        </a>
      </p>
      <p
        className="help"
        style={{ textAlign: 'center', color: 'var(--text-dim)' }}
      >
        {APP_BUILD}
      </p>
    </div>
  );
}
