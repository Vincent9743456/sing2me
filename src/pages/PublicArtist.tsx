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
import { Live } from './Live';
import { fetchPublicPage } from '../lib/publicPages';
import { ArtistProfile } from '../types';

/** Rythme de veille du concert : assez vif pour qu'un spectateur arrivé en
 *  avance bascule tout seul quand ça démarre, assez calme pour le réseau. */
const WATCH_MS = 8000;

/**
 * Sortie de secours (b187). Cette page est d'abord celle du QR : un
 * spectateur y arrive directement, il n'a nulle part où revenir et ne doit
 * voir aucun bouton. Mais on y arrive AUSSI depuis un lien — et dans l'app
 * installée sur iPhone, la vue s'ouvre sans barre de navigation : on restait
 * coincé sur la fiche, sans retour possible (signalé deux fois par Vincent).
 * Le bouton n'apparaît donc que s'il y a vraiment quelque chose derrière.
 */
function RetourSiPossible() {
  const [peut] = useState(() => {
    try {
      // `history.length` ne dit rien de fiable (un onglet neuf compte déjà
      // deux entrées). Ce qui compte, c'est d'où l'on VIENT : un lien depuis
      // le site laisse un référent de même origine ; un QR scanné depuis
      // l'appareil photo n'en laisse aucun.
      return (
        document.referrer !== '' &&
        document.referrer.startsWith(location.origin) &&
        !document.referrer.startsWith(location.href)
      );
    } catch {
      return false;
    }
  });
  if (!peut) return null;
  return (
    <button
      className="btn ghost small"
      style={{ margin: '0 0 var(--sp-3)' }}
      onClick={() => window.history.back()}
    >
      ← {t('Retour')}
    </button>
  );
}

export function PublicArtist({ name }: { name: string }) {
  const [profile, setProfile] = useState<ArtistProfile | null | undefined>(
    undefined,
  );
  const [liveNow, setLiveNow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await fetchPublicPage(name);
      if (cancelled) return;
      setProfile(page ? page.profile : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Veille du concert (b170). Plus de redirection vers un code de session :
  // le spectateur RESTE sur cette adresse, qui est celle de l'artiste. On
  // regarde en boucle s'il est en train de jouer — donc un concert qui
  // s'arrête et repart est retrouvé tout seul, sans rescanner le QR.
  const performer = profile?.name ?? '';
  useEffect(() => {
    if (performer === '') return;
    let cancelled = false;
    const look = async () => {
      try {
        const live = await fetchLiveForArtist(performer);
        if (!cancelled) setLiveNow(live != null && live.mode === 'concert');
      } catch {
        // Réseau perdu : on garde ce qu'on affichait déjà.
      }
    };
    void look();
    const id = window.setInterval(() => void look(), WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [performer]);

  // En concert : les paroles, ici même. Le direct est désigné par le NOM de
  // l'artiste, jamais par une session.
  if (liveNow && performer !== '') {
    return <Live artistName={performer} />;
  }

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
      <RetourSiPossible />
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
