/**
 * Page publique d'un artiste, ouverte par son NOM dictable (chantier 4) :
 * livemyband.fr/lenom (domaine actuel pour l'instant). Multi-locataire —
 * la fiche est chargée depuis le serveur (public_pages). Si l'artiste est
 * en concert (session ON AIR en cours), on propose d'aller le suivre.
 */
import React, { useEffect, useState } from 'react';

import { LogoMark } from '../components/Logo';
import { TipBox } from '../components/TipBox';
import { t } from '../i18n';
import { fetchLiveForArtist } from '../lib/live';
import { fetchPublicPage } from '../lib/publicPages';
import { ArtistProfile } from '../types';

export function PublicArtist({ name }: { name: string }) {
  const [profile, setProfile] = useState<ArtistProfile | null | undefined>(
    undefined,
  );
  const [liveNow, setLiveNow] = useState(false);
  const [liveCode, setLiveCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await fetchPublicPage(name);
      if (cancelled) return;
      setProfile(page ? page.profile : null);
      // L'artiste est-il en concert en ce moment ? (multi-live : SON direct)
      try {
        const live = await fetchLiveForArtist(page?.profile.name ?? '');
        if (!cancelled && live && live.mode === 'concert') {
          setLiveNow(true);
          setLiveCode(live.joinCode);
          // QR unique et éternel : pendant le concert, le scan doit aboutir
          // DIRECTEMENT aux paroles — on bascule sans attendre de clic (la
          // fiche reste consultable depuis le direct via la photo d'artiste).
          location.replace(
            live.joinCode !== '' ? `/live?c=${live.joinCode}` : '/live',
          );
        }
      } catch {
        /* pas de direct : page statique */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (profile === undefined) {
    return (
      <div className="public">
        <p className="help" style={{ textAlign: 'center' }}>
          {t('Ouverture…')}
        </p>
      </div>
    );
  }

  // « Page introuvable » UNIQUEMENT si le nom n'existe pas (b136) : une fiche
  // réservée dont le profil est encore vide s'affiche quand même, sous son
  // nom public — sinon un artiste qui avait réservé avant de remplir son
  // profil voyait son propre QR mener à une impasse (signalé par Marco).
  if (profile === null) {
    return (
      <div className="public">
        <div className="card" style={{ textAlign: 'center' }}>
          <LogoMark size={40} />
          <h1 style={{ margin: '10px 0 4px' }}>{t('Page introuvable')}</h1>
          <p className="help">
            {t('Aucun artiste ne correspond à « {name} ».', { name })}
          </p>
          <a
            className="btn block"
            href={location.origin + location.pathname.replace(/[^/]*$/, '')}
          >
            {t('Découvrir Sing2Me')}
          </a>
        </div>
      </div>
    );
  }

  const links = (profile.links ?? []).filter((l) => l.url !== '');
  const shownName = (profile.name ?? '') !== '' ? profile.name : name;

  return (
    <div className="public">
      {liveNow && (
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          {/* Lien ABSOLU vers l'entrée publique légère : la page peut être
              servie depuis /lenom, un hash relatif serait cassé. */}
          <a className="btn block" href={liveCode !== '' ? `/live?c=${liveCode}` : '/live'}>
            🔴 {t('{name} est EN DIRECT — suivre le concert', { name: shownName })}
          </a>
        </div>
      )}

      <div className="artisthead">
        {profile.photo !== '' && (
          <img src={profile.photo} alt={shownName} />
        )}
        <h1 style={{ margin: '10px 0 4px' }}>{shownName}</h1>
        {profile.bio !== '' && (
          <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
            {profile.bio}
          </p>
        )}
        {links.length > 0 && (
          <div className="links">
            {links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer">
                {l.label || l.url}
              </a>
            ))}
          </div>
        )}
      </div>

      <TipBox artist={profile} />

      <div className="footer">
        <a
          className="ctabanner"
          href={location.origin + location.pathname.replace(/[^/]*$/, '')}
        >
          <LogoMark size={22} /> {t('Découvrez')} <strong>Sing2Me</strong>{' '}
          {t('— votre songbook, gratuit')}
        </a>
        <p className="help" style={{ textAlign: 'center', marginTop: 6 }}>
          <a href="/#/cgu" style={{ color: 'var(--text-dim)' }}>
            {t("Conditions d'utilisation")}
          </a>
          {' · '}
          <a href="/#/report" style={{ color: 'var(--text-dim)' }}>
            {t('Signaler un contenu')}
          </a>
        </p>
      </div>
    </div>
  );
}

/**
 * Détecte un nom public dictable dans le chemin (livemyband.fr/lenom) :
 * renvoie le nom si le chemin est un candidat valide, sinon null.
 */
export function publicNameFromPath(): string | null {
  try {
    const seg = location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if (seg === '' || seg.includes('/')) return null;
    return /^[a-z0-9]{3,30}$/.test(seg) ? seg : null;
  } catch {
    return null;
  }
}
