/**
 * Mise à jour automatique de l'app INSTALLÉE (plein écran, sans bouton
 * recharger). Il n'y a pas de service worker : c'est iOS/Android qui garde
 * l'ancienne version en cache et « reprend » l'app sans la recharger.
 *
 * Stratégie (basée sur /version.txt, déjà publié à chaque livraison) :
 *  • à l'OUVERTURE : si une version plus récente est en ligne, rechargement
 *    silencieux immédiat (une seule fois par version — jamais de boucle) ;
 *  • au RETOUR dans l'app (elle revient au premier plan) : pas de
 *    rechargement d'office (on ne casse pas ce que tu faisais) — un petit
 *    bandeau « Mettre à jour » apparaît, un tap suffit ;
 *  • JAMAIS pendant un direct (règle : aucune coupure en plein concert).
 */
import React, { useEffect, useState } from 'react';

import { t } from '../i18n';
import { APP_BUILD } from '../version';

const RELOADED_KEY = 'sing2me/autoReloadFor';
const CURRENT = /b(\d+)\s*$/.exec(APP_BUILD)?.[1] ?? '';

function liveActive(): boolean {
  try {
    const s = localStorage.getItem('sing2me/onair');
    return s === 'on' || s === 'pause';
  } catch {
    return false;
  }
}

/** Version en ligne (« 128 ») ou '' si injoignable — jamais d'erreur. */
async function fetchRemoteBuild(): Promise<string> {
  try {
    const res = await fetch('/version.txt', { cache: 'no-store' });
    if (!res.ok) return '';
    const m = /b?(\d+)/.exec((await res.text()).trim());
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

export function UpdateHint() {
  const [remote, setRemote] = useState('');

  useEffect(() => {
    if (CURRENT === '') return;
    let lastCheck = 0;

    async function check(coldLaunch: boolean) {
      const now = Date.now();
      if (now - lastCheck < 60000) return; // au plus une fois par minute
      lastCheck = now;
      if (liveActive()) return; // jamais pendant un direct
      const online = await fetchRemoteBuild();
      if (online === '' || Number(online) <= Number(CURRENT)) return;
      let already = '';
      try {
        already = localStorage.getItem(RELOADED_KEY) ?? '';
      } catch {
        /* stockage indisponible */
      }
      if (coldLaunch && already !== online) {
        // Ouverture : rechargement transparent, une seule fois par version
        // (si le cache résiste, on retombe sur le bandeau — pas de boucle).
        try {
          localStorage.setItem(RELOADED_KEY, online);
        } catch {
          /* stockage indisponible */
        }
        location.reload();
        return;
      }
      setRemote(online);
    }

    // Ouverture de l'app : vérification rapide.
    // (nommé `timerId`, pas `t` : `t` est réservé à la fonction de traduction)
    const timerId = window.setTimeout(() => void check(true), 1500);
    // Retour au premier plan (app installée « reprise » sans rechargement).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (remote === '') return null;

  return (
    <div
      className="installhint"
      role="status"
      aria-label={t('Mise à jour disponible')}
    >
      <span className="installhint-ico" aria-hidden="true">
        ✨
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <strong>{t('Nouvelle version disponible')}</strong>
        <div className="help" style={{ margin: 0 }}>
          {t("Un tap et c'est à jour — tes données ne bougent pas.")}
        </div>
      </div>
      <button className="btn small" onClick={() => location.reload()}>
        {t('Mettre à jour')}
      </button>
    </div>
  );
}
