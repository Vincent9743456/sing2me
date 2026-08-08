/**
 * Suivi de groupe (📡) : la partition suit automatiquement le morceau
 * lancé par celui qui mène (chanteur / leader), affichée dans la vue du
 * musicien et transposée dans la tonalité jouée.
 * Jamais bloquant : sans réseau, retour direct à la bibliothèque locale.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { SongBody } from '../components/SongBody';
import { DndHint, TopBar } from '../components/ui';
import { t } from '../i18n';
import { semitonesBetween, spellingForKey } from '../lib/chords';
import { normalizeTitle } from '../lib/importer';
import { BandSong, fetchLive } from '../lib/live';
import { navigate } from '../router';
import { useStore } from '../store';
import { ViewMode } from '../types';

const POLL_MS = 3000;

export function Follow({ code = '' }: { code?: string } = {}) {
  const { songs, prefs } = useStore();
  const view = 'complete' as ViewMode; // partition entière pour tous
  const [bandSong, setBandSong] = useState<BandSong | null>(null);
  const [offline, setOffline] = useState(false);
  const [fontSize, setFontSize] = useState(1.1);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const s = await fetchLive(code);
        if (cancelled) return;
        setOffline(false);
        setBandSong(s.bandSong);
      } catch {
        if (!cancelled) setOffline(true);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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
    return () => {
      active = false;
      if (lock) void lock.release();
    };
  }, []);

  const localSong = useMemo(() => {
    if (!bandSong) return null;
    const norm = normalizeTitle(bandSong.title);
    return songs.find((s) => normalizeTitle(s.title) === norm) ?? null;
  }, [songs, bandSong]);

  // Transposition automatique vers la tonalité jouée par le leader
  const semis = useMemo(() => {
    if (!localSong || !bandSong) return 0;
    if (localSong.key === '' || bandSong.key === '') return 0;
    return semitonesBetween(localSong.key, bandSong.key) ?? 0;
  }, [localSong, bandSong]);
  const preferFlat = useMemo(() => {
    return spellingForKey(bandSong?.key ?? '');
  }, [bandSong]);

  return (
    <>
      <TopBar title={t('📡 Suivi du groupe')} onBack={() => navigate('/')} />
      <div className="page">
        <DndHint />
        {offline && (
          <div className="card" style={{ borderColor: 'var(--accent-dark)' }}>
            <strong>{t('Pas de réseau')}</strong>
            <p className="help" style={{ margin: '4px 0 10px' }}>
              {t(
                'Le suivi automatique est indisponible — ta bibliothèque locale, elle, fonctionne toujours.',
              )}
            </p>
            <button className="btn" onClick={() => navigate('/')}>
              {t('Ouvrir ma bibliothèque')}
            </button>
          </div>
        )}

        {!offline && bandSong === null && (
          <div className="empty">
            {t('En attente du leader…')}
            <br />
            <span className="help">
              {t(
                "Dès qu'il active « 📡 Synchroniser le groupe » (panneau ON AIR) et ouvre un morceau, il s'affichera ici — dans ta vue, transposé dans sa tonalité.",
              )}
            </span>
          </div>
        )}

        {bandSong !== null && (
          <>
            <div className="songmeta chips">
              <span className="chip static">▶ {bandSong.title}</span>
              {bandSong.artist !== '' && (
                <span className="chip static off">{bandSong.artist}</span>
              )}
              {bandSong.key !== '' && (
                <span className="chip static off">
                  {t('Tonalité {key}', { key: bandSong.key })}
                </span>
              )}
              {semis !== 0 && (
                <span className="chip static off">
                  {t('transposé automatiquement')}
                </span>
              )}
            </div>

            {localSong &&
              view !== 'paroles' &&
              (localSong.mySetup?.instrument || localSong.mySetup?.notes) && (
                <div className="notesbox">
                  <div className="label">
                    {t('Mes réglages')}
                    {localSong.mySetup.instrument !== ''
                      ? ` — ${localSong.mySetup.instrument}`
                      : ''}
                  </div>
                  {localSong.mySetup.notes}
                </div>
              )}
            {localSong ? (
              <SongBody
                song={localSong}
                view={view}
                semitones={semis}
                capo={view === 'complete' ? localSong.capo : 0}
                preferFlat={preferFlat}
                fontSize={fontSize}
              />
            ) : (
              <div className="empty">
                {t("« {title} » n'est pas dans ta bibliothèque.", {
                  title: bandSong.title,
                })}
                <br />
                <span className="help">
                  {t(
                    "Demande au leader de te partager le répertoire (invitation de groupe) — tu pourras l'ajouter en un clic.",
                  )}
                </span>
              </div>
            )}

            <div className="rowactions">
              <button
                className="btn ghost"
                onClick={() => setFontSize((f) => Math.max(0.8, +(f - 0.1).toFixed(2)))}
              >
                A−
              </button>
              <button
                className="btn ghost"
                onClick={() => setFontSize((f) => Math.min(2, +(f + 0.1).toFixed(2)))}
              >
                A＋
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
