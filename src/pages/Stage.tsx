/**
 * Mode scène : plein écran, grandes polices, swipe entre morceaux,
 * défilement automatique, anti-veille, zéro distraction.
 * Fonctionne hors connexion (toutes les données sont locales).
 */
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useOnAirLive,
  useOnAirSetlist,
  useOnAirSong,
} from '../components/OnAir';
import { LivePublicSong } from '../lib/live';
import { SongBody } from '../components/SongBody';
import { NoteModal } from '../components/NoteModal';
import { DndHint } from '../components/ui';
import { StageList } from '../components/StageList';
import { Icon } from '../components/Icon';
import { CoachMark } from '../components/CoachMark';
import {
  spellingForKey,
  semitonesBetween,
  transposeKeyName,
} from '../lib/chords';
import { parolesPubliques } from '../lib/publiclyrics';
import { demarrerMidi, sabonnerActionMidi } from '../lib/midi';
import { t } from '../i18n';
import { notesForBand, resolveVersion } from '../lib/model';
import { useStore } from '../store';
import { EXAMPLE_TAG } from '../seed';
import { STAGE_PLAYED_KEY } from '../components/Onboarding';
import { Song, ViewMode } from '../types';

interface StageItem {
  song: Song;
  keyOverride: string;
  note: string;
}

export function Stage({
  setlistId,
  songId,
  startIndex = 0,
}: {
  setlistId: string | null;
  songId: string | null;
  /** Morceau de départ dans la setlist (b164) : le mode scène s'ouvre
   *  sur celui qu'on regardait, plus au début du set. */
  startIndex?: number;
}) {
  const { songs, setlists, prefs, savePrefs, saveSong, replaceNote } =
    useStore();
  /**
   * LE MODE SCÈNE EST SOMBRE, ET C'EST LA SEULE OPTION (b235, décision de
   * Vincent). Y entrer en mode clair fait basculer TOUTE l'app en sombre —
   * et ça ne se défait pas tout seul en sortant : « repasser en mode clair,
   * même hors mode scène, doit faire l'objet d'une nouvelle action de
   * l'utilisateur ». On ne mémorise donc rien pour restaurer : le bouton de
   * la bibliothèque est le seul chemin du retour.
   *
   * `useLayoutEffect` et pas `useEffect` : le basculement doit être posé
   * avant que le navigateur ne peigne, sinon le premier appui sur « Scène »
   * ferait un éclair blanc — exactement au moment où l'on monte sur scène.
   */
  useLayoutEffect(() => {
    if (prefs.theme === 'clair') savePrefs({ ...prefs, theme: 'sombre' });
    // Une seule fois, à l'entrée : rejouer à chaque rendu écraserait un
    // changement volontaire (et il n'y en a pas d'autre ici, mais la règle
    // vaut pour la suite).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [index, setIndex] = useState(startIndex);
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

  // Checklist onboarding (E3) : le mode scène a été ouvert sur un vrai
  // morceau (pas un exemple).
  useEffect(() => {
    const s = item?.song;
    if (s && !(s.tags ?? []).includes(EXAMPLE_TAG)) {
      try {
        localStorage.setItem(STAGE_PLAYED_KEY, new Date().toISOString());
      } catch {
        // stockage indisponible
      }
    }
  }, [item?.song?.id]);

  // Ce que voit le chanteur → publié si la session est active
  // (paroles pour le public, accords pour la vue musicien du QR)
  useOnAirSong(
    item
      ? {
          title: item.song.title,
          artist: item.song.artist,
          lyrics: parolesPubliques(item.song),
          chords: item.song.lyrics,
          chordKey: item.song.key,
          playedKey: item.keyOverride !== '' ? item.keyOverride : item.song.key,
          capo: item.song.capo,
        }
      : null,
    // Le capo fait partie de la clé de rafraîchissement (b169) : sans lui, en
    // poser un ne republiait rien et le direct gardait l'ancienne valeur.
    item
      ? `${item.keyOverride !== '' ? item.keyOverride : item.song.key}:${item.song.capo}`
      : '',
  );

  // Diffusion de la setlist au public (concert) : il peut la parcourir
  // lui-même. Uniquement pour une vraie setlist (pas un morceau isolé).
  const publicSetlist = useMemo<LivePublicSong[] | null>(
    () =>
      setlistId && items.length > 0
        ? items.map((it) => ({
            title: it.song.title,
            artist: it.song.artist,
            lyrics: parolesPubliques(it.song),
          }))
        : null,
    [setlistId, items],
  );
  useOnAirSetlist(
    publicSetlist,
    setlists.find((s) => s.id === setlistId)?.name ?? '',
  );
  const live = useOnAirLive();
  // Repère discret : la setlist est bien diffusée au public (concert actif).
  const setlistBroadcast =
    publicSetlist !== null && live.status === 'on' && live.mode === 'concert';

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

  // Navigation clavier / PÉDALE BLUETOOTH. La plupart des pédales
  // « tourne-pages » (AirTurn, PageFlip, iRig BlueBoard, Donner…) se
  // comportent comme un clavier Bluetooth et envoient ces touches ; on les
  // mappe donc sur : suivant/précédent, défilement auto, vitesse, retour haut.
  const noteOpenRef = useRef(noteOpen);
  noteOpenRef.current = noteOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ne pas capter les touches quand on écrit (dictée / saisie d'une note).
      if (noteOpenRef.current) return;
      // (nom `tag` et pas `t` : `t` est la fonction de traduction)
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          setIndex((i) => Math.min(items.length - 1, i + 1));
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          setIndex((i) => Math.max(0, i - 1));
          break;
        case 'ArrowDown':
        case 'Enter':
          // Défilement automatique : marche / arrêt.
          e.preventDefault();
          setScroll((s) => !s);
          break;
        case 'ArrowUp':
          // Revenir en haut du morceau.
          e.preventDefault();
          if (bodyRef.current) bodyRef.current.scrollTop = 0;
          break;
        case '+':
        case '=':
          setSpeed((s) => Math.min(120, s + 10));
          break;
        case '-':
        case '_':
          setSpeed((s) => Math.max(10, s - 10));
          break;
        case 'Escape':
          history.back();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length]);

  // PÉDALE MIDI (b296) : mêmes gestes que le clavier / la pédale Bluetooth,
  // pour les pédales qui parlent MIDI. La config est apprise dans les Réglages.
  useEffect(() => {
    demarrerMidi();
    return sabonnerActionMidi((action) => {
      if (noteOpenRef.current) return;
      if (action === 'suivant') {
        setIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (action === 'precedent') {
        setIndex((i) => Math.max(0, i - 1));
      } else if (action === 'defilement') {
        setScroll((s) => !s);
      }
    });
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
        <div style={{ padding: '8px 12px 0' }}>
          <CoachMark
            id="stage-gestures"
            text={t(
              "Balaie pour changer de morceau · ▲ défilement automatique · l'écran ne se met pas en veille.",
            )}
          />
        </div>
        <div className="body">
          <p style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
            {t('Setlist vide ou introuvable.')}
          </p>
        </div>
        <div className="controls">
          <button className="btn ghost" onClick={() => history.back()}>
            {t('✕ Quitter')}
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
        {setlistBroadcast && (
          <div
            className="stage-broadcast"
            title={t(
              'Le public peut ouvrir la setlist et lire les paroles depuis son téléphone',
            )}
          >
            {t('📋 Setlist visible du public')}
          </div>
        )}
        <h2 className="songtitle" style={{ fontSize: `${fontSize * 1.4}rem` }}>
          {song.title}
        </h2>
        {/* CAPO EN ÉVIDENCE (b290, demande de Vincent : « l'information du
            Capo n'est pas visible. C'est important qu'elle le soit »). Sur
            scène, à distance, un « Capo 2 » noyé dans la ligne grise se rate —
            et c'est une info qu'on pose AVANT de jouer. Pastille à fort
            contraste, sous le titre. En vue « tonalité réelle » (basse), le
            capo ne s'applique pas au jeu : on ne l'affiche pas. */}
        {!displayReal && song.capo > 0 && (
          <div className="stage-capo">
            🎸 {t('Capo {n}', { n: song.capo })}
            {realKey !== '' ? (
              <span className="sc-real">
                {t('sonne en {ton}', { ton: realKey })}
              </span>
            ) : null}
          </div>
        )}
        <div className="help" style={{ marginBottom: 10 }}>
          {[
            song.artist,
            shownKey,
            song.tempo > 0 ? `${song.tempo} BPM` : '',
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
                {t('Mes réglages')}
                {song.mySetup.instrument !== ''
                  ? ` — ${song.mySetup.instrument}`
                  : ''}
              </div>
              {song.mySetup.notes}
            </div>
          )}
        {view === 'complete' && song.rehearsalNotes.length > 0 && (
            <div className="notesbox">
              <div className="label">{t('Répétition')}</div>
              {song.rehearsalNotes
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
      {/* UNE seule modale de note (b156) : ce bloc était dupliqué — en mode
          scène, deux modales se superposaient, avec deux dictées possibles
          en même temps. */}
      {noteOpen && originalSong && (
        <NoteModal
          song={originalSong}
          author={prefs.userName}
          initialBandId={noteBandId}
          onClose={() => setNoteOpen(false)}
          onSave={(n, replaces) => {
            // Note vivante (b154) : la fusion IA remplace l'ancienne note.
            if (replaces) {
              replaceNote(originalSong.id, replaces, n);
              return;
            }
            saveSong({
              ...originalSong,
              rehearsalNotes: [...originalSong.rehearsalNotes, n],
            });
          }}
        />
      )}
      <div className="controls">
        <button
          className="btn ghost"
          aria-label={t('Quitter le mode scène')}
          onClick={() => history.back()}
        >
          <Icon name="x" size={18} />
        </button>
        {items.length > 1 && (
          <>
            <button
              className="btn ghost"
              title={t('Morceau précédent')}
              aria-label={t('Morceau précédent')}
              disabled={clamped <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <Icon name="chevron-left" size={20} />
            </button>
            <button
              className="btn ghost"
              title={t('Voir la setlist / choisir un morceau')}
              onClick={() => setShowList(true)}
            >
              <Icon name="list" size={17} /> {clamped + 1}/{items.length}
            </button>
            <button
              className="btn ghost"
              title={t('Morceau suivant')}
              aria-label={t('Morceau suivant')}
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
          title={t('Défilement automatique')}
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
          title={t('Note de répétition (dictée possible)')}
          aria-label={t('Ajouter une note de répétition')}
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
        <StageList onClose={() => setShowList(false)}>
          <div className="inner">
            <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
              {t(
                "Tape un morceau pour l'afficher — l'ordre de la setlist ne change pas.",
              )}
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
                {i === clamped && (
                  <span className="rbadge">{t('EN COURS')}</span>
                )}
              </button>
            ))}
            <button
              className="btn ghost block"
              onClick={() => setShowList(false)}
            >
              {t('Fermer')}
            </button>
          </div>
        </StageList>
      )}
    </div>
  );
}
