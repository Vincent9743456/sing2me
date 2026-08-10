/**
 * Régie 🎛 : vue simplifiée pour le chanteur qui ne lit pas de partition.
 * La setlist seule, en grand — un tap sur un titre et il devient le morceau
 * en cours : publié au public (ON AIR) et aux musiciens (suivi 📡).
 * Pensée pour le téléphone, entre deux chansons.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { useOnAirSong } from '../components/OnAir';
import { DndHint, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { parolesPubliques } from '../lib/publiclyrics';
import { t } from '../i18n';
import { resolveVersion } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { formatDuration } from '../types';

export function Remote({ setlistId }: { setlistId: string }) {
  const { songs, setlists } = useStore();
  const [index, setIndex] = useState<number | null>(null);

  const setlist = setlists.find((s) => s.id === setlistId);

  const items = useMemo(() => {
    if (!setlist) return [];
    return setlist.items
      .map((it) => {
        const song = songs.find((s) => s.id === it.songId);
        if (!song) return null;
        const resolved = resolveVersion(song, it.versionId ?? '');
        return {
          song: resolved,
          key: it.keyOverride !== '' ? it.keyOverride : resolved.key,
          note: it.note,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [setlist, songs]);

  const current = index !== null ? (items[index] ?? null) : null;

  // Publication : public (si ON AIR) + musiciens (synchro 📡 et vue QR)
  useOnAirSong(
    current
      ? {
          title: current.song.title,
          artist: current.song.artist,
          lyrics: parolesPubliques(current.song),
          chords: current.song.lyrics,
          chordKey: current.song.key,
          playedKey: current.key,
        }
      : null,
    current ? current.key : '',
  );

  // Anti-veille pendant le concert
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let active = true;
    async function acquire() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: {
            request: (t: 'screen') => Promise<{ release: () => Promise<void> }>;
          };
        };
        if (nav.wakeLock && active) lock = await nav.wakeLock.request('screen');
      } catch {
        // non bloquant
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) void lock.release();
    };
  }, []);

  if (!setlist) {
    return (
      <>
        <TopBar title={t('Régie')} onBack={() => navigate('/setlists')} />
        <div className="page">
          <p className="help">{t('Cette setlist n\'existe plus.')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={`🎛 ${setlist.name || t('Régie')}`}
        onBack={() => navigate('/setlists')}
      />
      <div className="page remote">
        <DndHint />
        <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
          {t('Tape le morceau qui démarre — le public et les musiciens suivent.')}
        </p>
        {items.map((item, i) => {
          const isCurrent = index === i;
          const isNext = index !== null && i === index + 1;
          return (
            <button
              key={i}
              className={`remoterow ${isCurrent ? 'current' : ''}`}
              onClick={() => setIndex(isCurrent ? null : i)}
            >
              <span className="num">{i + 1}</span>
              <span className="grow">
                <span className="rtitle">{item.song.title}</span>
                <span className="rsub">
                  {[
                    item.song.artist,
                    item.key,
                    item.song.durationSec > 0
                      ? formatDuration(item.song.durationSec)
                      : '',
                    item.note,
                  ]
                    .filter((x) => x !== '')
                    .join(' · ')}
                </span>
              </span>
              {isCurrent && <span className="rbadge">{t('▶ EN COURS')}</span>}
              {isNext && <span className="rnext">{t('suivant')}</span>}
            </button>
          );
        })}
        {index !== null && index < items.length - 1 && (
          <button
            className="btn block"
            style={{ marginTop: 14, padding: '16px' }}
            onClick={() => setIndex(index + 1)}
          >
            <Icon name="skip" size={16} />{' '}
            {t('Morceau suivant : {titre}', {
              titre: items[index + 1].song.title,
            })}
          </button>
        )}
        <p className="help" style={{ textAlign: 'center', marginTop: 14 }}>
          {t(
            'Re-taper le morceau en cours le désélectionne. Le direct public se pilote avec le bouton ON AIR en haut à droite.',
          )}
        </p>
      </div>
    </>
  );
}
