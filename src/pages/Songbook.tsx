/**
 * Carnet imprimable de la bibliothèque (#/export-pdf) : tous les morceaux
 * validés (les idées restent à travailler), un par page, avec accords —
 * « Imprimer / Enregistrer en PDF » passe par la boîte d'impression du
 * navigateur (aucune dépendance, fonctionne hors ligne).
 */
import React, { useMemo } from 'react';

import { Icon } from '../components/Icon';
import { SongBody } from '../components/SongBody';
import { Empty, TopBar } from '../components/ui';
import { t } from '../i18n';
import { navigate } from '../router';
import { useStore } from '../store';
import { formatDuration } from '../types';

export function Songbook() {
  const { songs, artist, prefs } = useStore();
  const list = useMemo(
    () =>
      songs
        .filter((s) => s.idea !== true && (s.pendingBandId ?? '') === '')
        .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    [songs],
  );

  return (
    <>
      <TopBar
        live={false}
        title={t('Exporter en PDF')}
        onBack={() => navigate('/reglages')}
      />
      <div className="page printarea songbook">
        <div className="noprint">
          <p className="help" style={{ marginTop: 0 }}>
            {(list.length > 1
              ? t('{n} morceaux', { n: list.length })
              : t('{n} morceau', { n: list.length })) +
              t(
                ', un par page. « Imprimer » ouvre la boîte du navigateur : choisis « Enregistrer en PDF » comme destination.',
              )}
          </p>
          <button className="btn block" onClick={() => window.print()}>
            <Icon name="clipboard" size={15} />{' '}
            {t('Imprimer / Enregistrer en PDF')}
          </button>
          <div className="spacer" />
        </div>

        {list.length === 0 && (
          <Empty>
            {t('Aucun morceau validé dans la bibliothèque à exporter.')}
          </Empty>
        )}

        {/* Couverture sobre : nom + compte des morceaux. */}
        {list.length > 0 && (
          <div className="sbk-cover">
            <div className="sbk-cover-name">
              {artist.name || prefs.userName || t('Mon carnet')}
            </div>
            <div className="sbk-cover-sub">
              {(list.length > 1
                ? t('{n} morceaux', { n: list.length })
                : t('{n} morceau', { n: list.length })) + ' — Sing2Me'}
            </div>
          </div>
        )}

        {list.map((s) => (
          <section className="sbk-song" key={s.id}>
            <h2 className="sbk-title">
              {s.title || t('(sans titre)')}
              {s.artist !== '' && (
                <span className="sbk-artist"> — {s.artist}</span>
              )}
            </h2>
            <div className="sbk-meta">
              {[
                s.key !== '' ? t('Tonalité {key}', { key: s.key }) : '',
                s.capo > 0 ? t('Capo {capo}', { capo: s.capo }) : '',
                s.tempo > 0 ? `${s.tempo} BPM` : '',
                formatDuration(s.durationSec),
              ]
                .filter((x) => x !== '')
                .join(' · ')}
            </div>
            <SongBody song={s} view="complete" />
          </section>
        ))}
      </div>
    </>
  );
}
