/**
 * Parcours de la setlist (public) — fonctionne à partir du set en cache,
 * donc consultable même hors ligne. Chargé en différé (code-splitting de la
 * page publique) : le cœur paroles/position n'attend pas ce composant.
 */
import React from 'react';

import { streamLinks } from './streamLinks';
import { t } from '../../i18n';
import { LivePublicSong } from '../../lib/live';
import { decodeHtmlEntities } from '../../lib/textRepair';

export default function SetlistBrowser({
  setlist,
  idx,
  souvenir,
  onIdx,
  onSouvenir,
  onClose,
}: {
  setlist: LivePublicSong[];
  idx: number | null;
  souvenir: boolean;
  onIdx: (i: number | null) => void;
  onSouvenir: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="stagelist"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="inner">
        {idx !== null && setlist[idx] ? (
          <>
            <button className="btn ghost small" onClick={() => onIdx(null)}>
              {t('◀ La setlist')}
            </button>
            <h2 className="livetitle" style={{ marginTop: 10 }}>
              {setlist[idx].title}
            </h2>
            {setlist[idx].artist !== '' && (
              <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
                {setlist[idx].artist}
              </p>
            )}
            <div className="livelyrics">
              {decodeHtmlEntities(setlist[idx].lyrics) ||
                t('(paroles non disponibles)')}
            </div>
            <div className="rowactions" style={{ justifyContent: 'center' }}>
              <button
                className="btn ghost small"
                disabled={idx <= 0}
                onClick={() => onIdx(Math.max(0, idx - 1))}
              >
                {t('‹ Précédent')}
              </button>
              <button
                className="btn ghost small"
                disabled={idx >= setlist.length - 1}
                onClick={() => onIdx(Math.min(setlist.length - 1, idx + 1))}
              >
                {t('Suivant ›')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
              {t('La setlist du concert — tape un morceau pour lire les paroles.')}
            </p>
            {setlist.length === 0 && (
              <p className="help" style={{ textAlign: 'center' }}>
                {t('Setlist momentanément indisponible.')}
              </p>
            )}
            {setlist.map((s, i) => (
              <button key={i} className="remoterow" onClick={() => onIdx(i)}>
                <span className="num">{i + 1}</span>
                <span className="grow">
                  <span className="rtitle">
                    {s.title || t('(sans titre)')}
                  </span>
                  {s.artist !== '' && <span className="rsub">{s.artist}</span>}
                </span>
                {souvenir && (
                  <span
                    style={{ display: 'flex', gap: 6 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {streamLinks(s.title, s.artist).map((l) => (
                      <a
                        key={l.name}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn ghost small"
                        title={t('Chercher sur {name}', { name: l.name })}
                      >
                        {l.name[0]}
                      </a>
                    ))}
                  </span>
                )}
              </button>
            ))}
            {setlist.length > 0 && (
              <button
                className={`btn ${souvenir ? '' : 'ghost'} block`}
                style={{ marginTop: 8 }}
                onClick={onSouvenir}
              >
                🎧 {souvenir ? t('Masquer') : t('Garder un souvenir')}{' '}
                {t('— écouter sur Spotify / Apple / Deezer')}
              </button>
            )}
            <button className="btn ghost block" onClick={onClose}>
              {t('Fermer')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
