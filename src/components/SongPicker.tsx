/**
 * SongPicker — LE sélecteur unique d'affectation de morceaux (règle
 * d'architecture n°2 : une action = un seul geste appris une fois).
 *
 * Deux sens, un seul composant :
 *  • mode « assign »  : depuis un MORCEAU → feuille « Ajouter à… » (setlists
 *    + groupes en cases à cocher, appartenances pré-cochées, un bouton
 *    « Valider » qui applique toutes les différences d'un coup).
 *  • mode « collect » : depuis une SETLIST ou un GROUPE → plein écran,
 *    recherche + multi-sélection de TOUTE la bibliothèque, l'existant grisé,
 *    un bouton collant « Ajouter N morceaux ». La logique métier reste chez
 *    l'appelant (via onConfirm) : seule l'interface de sélection est unifiée.
 */
import React, { useMemo, useState } from 'react';

import { announceBandSong } from '../lib/bands';
import { normalizeTitle } from '../lib/importer';
import {
  duplicateVersion,
  removeVersion,
  switchVersion,
  versionForBand,
} from '../lib/model';
import { useStore } from '../store';
import { makeId, Setlist, Song } from '../types';
import { Icon } from './Icon';
import { Modal } from './ui';

const BAND_COLORS = [
  '#fbbf24',
  '#60a5fa',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#22d3ee',
];

/* ------------------------------------------------------------------ */
/* Sens 1 — depuis un morceau : « Ajouter à… »                         */
/* ------------------------------------------------------------------ */

export function AssignSheet({
  songId,
  onClose,
}: {
  songId: string;
  onClose: () => void;
}) {
  const {
    songs,
    setlists,
    bands,
    prefs,
    artist,
    saveSong,
    saveSetlist,
    recordBandRemoval,
    clearBandRemoval,
  } = useStore();
  const song = songs.find((s) => s.id === songId);

  const author = prefs.userName || artist.name || 'Moi';
  const initialSetlists = useMemo(
    () =>
      new Set(
        setlists
          .filter((sl) => sl.items.some((it) => it.songId === songId))
          .map((sl) => sl.id),
      ),
    [setlists, songId],
  );
  const initialBands = useMemo(
    () =>
      new Set(
        song
          ? bands.filter((b) => versionForBand(song, b.id) !== null).map((b) => b.id)
          : [],
      ),
    [bands, song],
  );
  const [wantSetlists, setWantSetlists] = useState<Set<string>>(
    () => new Set(initialSetlists),
  );
  const [wantBands, setWantBands] = useState<Set<string>>(
    () => new Set(initialBands),
  );

  if (!song) return null;

  const sortedSetlists = [...setlists].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  function toggleIn(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function addBandVersion(s: Song, bandId: string, bandName: string): Song {
    return switchVersion(
      duplicateVersion(s, bandName || 'Groupe', bandId),
      s.activeVersionId,
    );
  }

  function apply() {
    if (!song) return;
    let workingSong = song;

    // 1) Groupes (répertoire) — on accumule sur une copie de travail.
    for (const b of bands) {
      const want = wantBands.has(b.id);
      const v = versionForBand(workingSong, b.id);
      if (want && !v) {
        workingSong = addBandVersion(workingSong, b.id, b.name || '');
        clearBandRemoval(b.id, normalizeTitle(song.title));
        void announceBandSong(b.cloudId, author, song.title, song.artist);
      } else if (!want && v) {
        // Retrait de répertoire = acte de niveau groupe (propagé à tous).
        if (
          !confirm(
            `Retirer « ${song.title} » du répertoire de ${b.name || 'ce groupe'} ? ` +
              'Le morceau sortira du répertoire du groupe pour TOUS les ' +
              'membres — chacun garde la partition dans sa bibliothèque ' +
              'personnelle.',
          )
        ) {
          continue;
        }
        workingSong =
          workingSong.versions.length > 1
            ? removeVersion(workingSong, v.id)
            : {
                ...workingSong,
                versions: workingSong.versions.map((x) =>
                  x.id === v.id ? { ...x, bandId: '' } : x,
                ),
              };
        recordBandRemoval(b.id, normalizeTitle(song.title));
      }
    }

    // 2) Setlists — ajout à une setlist de groupe = entrée auto au répertoire.
    const updates: Setlist[] = [];
    for (const sl of setlists) {
      const want = wantSetlists.has(sl.id);
      const has = sl.items.some((it) => it.songId === song.id);
      if (want && !has) {
        const bandId = sl.bandId ?? '';
        let versionId = versionForBand(workingSong, bandId)?.id ?? '';
        if (bandId !== '' && versionId === '') {
          const b = bands.find((x) => x.id === bandId);
          workingSong = addBandVersion(workingSong, bandId, b?.name || '');
          clearBandRemoval(bandId, normalizeTitle(song.title));
          void announceBandSong(b?.cloudId, author, song.title, song.artist);
          versionId = versionForBand(workingSong, bandId)?.id ?? '';
        }
        updates.push({
          ...sl,
          items: [
            ...sl.items,
            { id: makeId(), songId: song.id, note: '', keyOverride: '', versionId },
          ],
        });
      } else if (!want && has) {
        updates.push({
          ...sl,
          items: sl.items.filter((it) => it.songId !== song.id),
        });
      }
    }

    if (workingSong !== song) saveSong(workingSong);
    updates.forEach(saveSetlist);
    onClose();
  }

  return (
    <Modal title={`Ajouter « ${song.title || 'Sans titre'} » à…`} onClose={onClose}>
      <div className="field">
        <label>Mes setlists</label>
        {sortedSetlists.length === 0 ? (
          <p className="help" style={{ margin: 0 }}>
            Pas encore de setlist.
          </p>
        ) : (
          sortedSetlists.map((sl) => {
            const on = wantSetlists.has(sl.id);
            const already = initialSetlists.has(sl.id);
            return (
              <button
                key={sl.id}
                className="pickopt"
                onClick={() => setWantSetlists((s) => toggleIn(s, sl.id))}
              >
                <span className={`pickcb ${on ? 'on' : ''}`} aria-hidden="true" />
                <span className="grow">{sl.name || '(sans nom)'}</span>
                {already && (
                  <span className="picktag">déjà dans la setlist</span>
                )}
              </button>
            );
          })
        )}
      </div>
      {bands.length > 0 && (
        <div className="field">
          <label>Mes groupes</label>
          {bands.map((b, i) => {
            const on = wantBands.has(b.id);
            const already = initialBands.has(b.id);
            return (
              <button
                key={b.id}
                className="pickopt"
                onClick={() => setWantBands((s) => toggleIn(s, b.id))}
              >
                <span className={`pickcb ${on ? 'on' : ''}`} aria-hidden="true" />
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: BAND_COLORS[i % BAND_COLORS.length],
                  }}
                />
                <span className="grow">{b.name || 'Groupe sans nom'}</span>
                {already && <span className="picktag">déjà au répertoire</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="spacer" />
      <button className="btn block" onClick={apply}>
        Valider
      </button>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Sens 2 — depuis une setlist ou un groupe : « Ajouter des morceaux »  */
/* ------------------------------------------------------------------ */

export function SongCollector({
  title,
  alreadyIn,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  /** ids des morceaux déjà présents dans la cible (grisés, non cliquables). */
  alreadyIn: string[];
  /** libellé du bouton, ex. (n) => `Ajouter ${n} au répertoire`. */
  confirmLabel?: (n: number) => string;
  onConfirm: (songIds: string[]) => void;
  onClose: () => void;
}) {
  const { songs } = useStore();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const present = useMemo(() => new Set(alreadyIn), [alreadyIn]);

  // Bibliothèque personnelle : on exclut les idées et les propositions.
  const library = useMemo(
    () =>
      songs
        .filter((s) => s.idea !== true && (s.pendingBandId ?? '') === '')
        .sort((a, b) =>
          (a.title || '').localeCompare(b.title || '', 'fr', {
            sensitivity: 'base',
          }),
        ),
    [songs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return library;
    return library.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q),
    );
  }, [library, query]);

  function toggle(id: string) {
    if (present.has(id)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = picked.size;
  const label = confirmLabel
    ? confirmLabel(count)
    : `Ajouter ${count} morceau${count > 1 ? 'x' : ''}`;

  return (
    <div className="pickerfull">
      <div className="pickerfull-head">
        <button
          className="btn icon"
          aria-label="Fermer"
          onClick={onClose}
          style={{ marginLeft: -6 }}
        >
          <Icon name="chevron-down" size={20} />
        </button>
        <h2>{title}</h2>
        <input
          type="text"
          autoFocus
          placeholder="Rechercher un titre, un artiste…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="pickerfull-list">
        {filtered.length === 0 ? (
          <p className="help" style={{ textAlign: 'center' }}>
            {library.length === 0
              ? 'Ta bibliothèque est vide — importe des morceaux d’abord.'
              : 'Aucun morceau ne correspond.'}
          </p>
        ) : (
          filtered.map((s) => {
            const here = present.has(s.id);
            const on = picked.has(s.id);
            return (
              <button
                key={s.id}
                className={`pickrow ${here ? 'here' : ''}`}
                disabled={here}
                onClick={() => toggle(s.id)}
              >
                {here ? (
                  <span className="pickdone" aria-hidden="true">
                    ✓
                  </span>
                ) : (
                  <span className={`pickcb ${on ? 'on' : ''}`} aria-hidden="true" />
                )}
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="title">{s.title || 'Sans titre'}</span>
                  <span className="sub">
                    {here
                      ? 'déjà au répertoire'
                      : [s.artist, s.key].filter((x) => x !== '').join(' · ')}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="pickerfull-foot">
        <button
          className="btn block"
          disabled={count === 0}
          onClick={() => {
            onConfirm([...picked]);
            onClose();
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
