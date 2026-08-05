/**
 * Mode scène : plein écran, grandes polices, swipe entre morceaux,
 * défilement automatique, anti-veille, zéro distraction.
 * Fonctionne hors connexion (toutes les données sont locales).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useOnAirSong } from '../components/OnAir';
import { SongBody } from '../components/SongBody';
import { NoteModal } from '../components/NoteModal';
import { DndHint } from '../components/ui';
import { Icon } from '../components/Icon';
import {
  spellingForKey,
  semitonesBetween,
  transposeKeyName,
} from '../lib/chords';
import { stripChords } from '../lib/chordpro';
import { notesForBand, resolveVersion } from '../lib/model';
import { useStore } from '../store';
import { Song, ViewMode } from '../types';

interface StageItem {
  song: Song;
  keyOverride: string;
  note: string;
}

export function Stage({
  setlistId,
  songId,
}: {
  setlistId: string | null;
  songId: string | null;
}) {
  const { songs, setlists, prefs, saveSong } = useStore();
  const [index, setIndex] = useState(0);
  const view = 'complete' as ViewMode; // partition entière pour tous
  const [fontSize, setFontSize] = useState(() => {
    const saved = parseFloat(localStorage.getItem('sing2me/stageFont') ?? '');
    return Number.isFinite(saved) && saved > 0 ? saved : 1.25;
  });
  const [scroll, setScroll] = useState(false);
  const [speed, setSpeed] = useState(30); // pixels par seconde
  const [showList, setShowList] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const items = useMemo<StageItem[]>(() => {
    // Ne garde que les notes du contexte de la version jouée (solo ou groupe)
    function withContextNotes(song: Song, versionId: string): Song {
      const used =
        song.versions.find((v) => v.id === (versionId || song.activeVersionId)) ??
        null;
      const resolved = resolveVersion(song, versionId);
      return {
        ...resolved,
        rehearsalNotes: notesForBand(
          resolved.rehearsalNotes,
          used?.bandId ?? '',
        ),
      };
    }
    if (songId) {
      const song = songs.find((s) => s.id === songId);
      return song
        ? [{ song: withContextNotes(song, ''), keyOverride: '', note: '' }]
        : [];
    }
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return [];
    return setlist.items
      .map((it) => {
        const song = songs.find((s) => s.id === it.songId);
        return song
          ? {
              song: withContextNotes(song, it.versionId ?? ''),
              keyOverride: it.keyOverride,
              note: it.note,
            }
          : null;
      })
      .filter((x): x is StageItem => x !== null);
  }, [songs, setlists, setlistId, songId]);

  const clamped = Math.min(index, Math.max(0, items.length - 1));
  const item = items[clamped] ?? null;

  // Ce que voit le chanteur → publié si la session est active
  // (paroles pour le public, accords pour la vue musicien du QR)
  useOnAirSong(
    item
      ? {
          title: item.song.title,
          artist: item.song.artist,
          lyrics: stripChords(item.song.lyrics),
          chords: item.song.lyrics,
          chordKey: item.song.key,
          playedKey: item.keyOverride !== '' ? item.keyOverride : item.song.key,
        }
      : null,
    item ? (item.keyOverride !== '' ? item.keyOverride : item.song.key) : '',
  );

  // Anti-veille (Wake Lock) pendant toute la durée du mode scène.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let active = true;
    async function acquire() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock && active) {
          lock = await nav.wakeLock.request('screen');
        }
      } catch {
        // refusé (batterie faible…) : non bloquant
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

  // Défilement automatique
  useEffect(() => {
    if (!scroll) return;
    const el = bodyRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      acc += speed * dt;
      if (acc >= 1) {
        const px = Math.floor(acc);
        acc -= px;
        el.scrollTop += px;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scroll, speed, clamped]);

  // Navigation clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape') {
        history.back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length]);

  // Retour en haut à chaque changement de morceau
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [clamped]);

  useEffect(() => {
    localStorage.setItem('sing2me/stageFont', String(fontSize));
  }, [fontSize]);

  if (!item) {
    return (
      <div className="stage">
        <div className="body">
          <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
            Setlist vide ou introuvable.
          </p>
        </div>
        <div className="controls">
          <button className="btn ghost" onClick={() => history.back()}>
            ✕ Quitter
          </button>
        </div>
      </div>
    );
  }

  const { song, keyOverride, note } = item;
  // Pour ENREGISTRER une note : le morceau original du store (la copie
  // affichée a des notes filtrées), et le contexte de la version jouée.
  const originalSong = songs.find((s) => s.id === song.id) ?? null;
  const noteBandId =
    originalSong?.versions.find((v) => v.id === originalSong.activeVersionId)
      ?.bandId ?? '';
  // song.key = tonalité des FORMES écrites ; keyOverride = formes voulues pour
  // ce concert ; tonalité réelle = formes + capo. Vue « réelle » (basse) : on
  // remonte les accords du capo pour montrer ce qui sonne, sans capo.
  const displayReal = localStorage.getItem('sing2me/showRealKey') === '1';
  const semis =
    keyOverride !== '' && song.key !== ''
      ? (semitonesBetween(song.key, keyOverride) ?? 0)
      : 0;
  const baseShapeKey = keyOverride !== '' ? keyOverride : song.key;
  const realKey =
    baseShapeKey !== '' ? transposeKeyName(baseShapeKey, song.capo) : '';
  const shownKey = displayReal ? realKey : baseShapeKey;
  const dispSemis = semis + (displayReal ? song.capo : 0);
  const preferFlat = spellingForKey(shownKey);

  return (
    <div
      className="stage"
      onTouchStart={(e) => {
        touchStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          if (dx < 0) setIndex((i) => Math.min(items.length - 1, i + 1));
          else setIndex((i) => Math.max(0, i - 1));
        }
      }}
    >
      <div className="body" ref={bodyRef}>
        <DndHint />
        <h2 className="songtitle" style={{ fontSize: `${fontSize * 1.4}rem` }}>
          {song.title}
        </h2>
        <div className="help" style={{ marginBottom: 10 }}>
          {[
            song.artist,
            shownKey,
            song.tempo > 0 ? `${song.tempo} BPM` : '',
            !displayReal && song.capo > 0 ? `Capo ${song.capo}` : '',
            !displayReal && song.capo > 0 && realKey !== ''
              ? `sonne en ${realKey}`
              : '',
          ]
            .filter((x) => x !== '')
            .join(' · ')}
        </div>
        {note !== '' && (
          <div className="itemnote">
            <Icon name="flag" size={14} /> {note}
          </div>
        )}
        {view !== 'paroles' &&
          (song.mySetup?.instrument || song.mySetup?.notes) && (
            <div className="notesbox">
              <div className="label">
                Mes réglages
                {song.mySetup.instrument !== ''
                  ? ` — ${song.mySetup.instrument}`
                  : ''}
              </div>
              {song.mySetup.notes}
            </div>
          )}
        {(view === 'complete' || view === 'structure') &&
          song.rehearsalNotes.some((n) => n.target === '') && (
            <div className="notesbox">
              <div className="label">Répétition</div>
              {song.rehearsalNotes
                .filter((n) => n.target === '')
                .map((n) => (
                  <div key={n.id}>
                    <Icon name={n.visibility === 'privee' ? 'lock' : 'message'} size={13} />{' '}
                    {n.text}
                  </div>
                ))}
            </div>
          )}
        <SongBody
          song={song}
          view={view}
          semitones={dispSemis}
          capo={0}
          preferFlat={preferFlat}
          fontSize={fontSize}
        />
      </div>
      {noteOpen && originalSong && (
        <NoteModal
          song={originalSong}
          author={prefs.userName}
          initialBandId={noteBandId}
          onClose={() => setNoteOpen(false)}
          onSave={(n) =>
            saveSong({
              ...originalSong,
              rehearsalNotes: [...originalSong.rehearsalNotes, n],
            })
          }
        />
      )}
      {noteOpen && originalSong && (
        <NoteModal
          song={originalSong}
          author={prefs.userName}
          initialBandId={noteBandId}
          onClose={() => setNoteOpen(false)}
          onSave={(n) =>
            saveSong({
              ...originalSong,
              rehearsalNotes: [...originalSong.rehearsalNotes, n],
            })
          }
        />
      )}
      <div className="controls">
        <button className="btn ghost" aria-label="Quitter le mode scène" onClick={() => history.back()}>
          <Icon name="x" size={18} />
        </button>
        {items.length > 1 && (
          <>
            <button
              className="btn ghost"
              title="Morceau précédent"
              aria-label="Morceau précédent"
              disabled={clamped <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <Icon name="chevron-left" size={20} />
            </button>
            <button
              className="btn ghost"
              title="Voir la setlist / choisir un morceau"
              onClick={() => setShowList(true)}
            >
              <Icon name="list" size={17} /> {clamped + 1}/{items.length}
            </button>
            <button
              className="btn ghost"
              title="Morceau suivant"
              aria-label="Morceau suivant"
              disabled={clamped >= items.length - 1}
              onClick={() =>
                setIndex((i) => Math.min(items.length - 1, i + 1))
              }
            >
              <Icon name="chevron-right" size={20} />
            </button>
          </>
        )}
        <button
          className={`btn ${scroll ? '' : 'ghost'}`}
          title="Défilement automatique"
          onClick={() => setScroll((s) => !s)}
        >
          <Icon name="scroll" size={17} />
        </button>
        {scroll && (
          <>
            <button
              className="btn ghost"
              onClick={() => setSpeed((s) => Math.max(10, s - 10))}
            >
              −
            </button>
            <button
              className="btn ghost"
              onClick={() => setSpeed((s) => Math.min(120, s + 10))}
            >
              ＋
            </button>
          </>
        )}
        <button
          className="btn ghost"
          title="Note de répétition (dictée possible)"
          aria-label="Ajouter une note de répétition"
          onClick={() => setNoteOpen(true)}
        >
          <Icon name="message" size={17} />
        </button>
        <button
          className="btn ghost"
          onClick={() => setFontSize((f) => Math.max(0.9, +(f - 0.15).toFixed(2)))}
        >
          A−
        </button>
        <button
          className="btn ghost"
          onClick={() => setFontSize((f) => Math.min(2.2, +(f + 0.15).toFixed(2)))}
        >
          A＋
        </button>
      </div>

      {/* Choix libre d'un morceau : l'ordre de la setlist reste inchangé */}
      {showList && (
        <div
          className="stagelist"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowList(false);
          }}
        >
          <div className="inner">
            <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
              Tape un morceau pour l'afficher — l'ordre de la setlist ne
              change pas.
            </p>
            {items.map((it, i) => (
              <button
                key={i}
                className={`remoterow ${i === clamped ? 'current' : ''}`}
                onClick={() => {
                  setIndex(i);
                  setShowList(false);
                }}
              >
                <span className="num">{i + 1}</span>
                <span className="grow">
                  <span className="rtitle">{it.song.title}</span>
                  <span className="rsub">
                    {[
                      it.song.artist,
                      it.keyOverride !== '' ? it.keyOverride : it.song.key,
                      it.note,
                    ]
                      .filter((x) => x !== '')
                      .join(' · ')}
                  </span>
                </span>
                {i === clamped && <span className="rbadge">EN COURS</span>}
              </button>
            ))}
            <button
              className="btn ghost block"
              onClick={() => setShowList(false)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
