/**
 * Vue synthétique d'une setlist : propre, lisible d'un coup d'œil et
 * imprimable. Les morceaux dans leur ordre, avec leur tonalité de concert,
 * les commentaires de structure, la note de setlist — et, en option, les
 * notes personnelles du musicien. Les morceaux « en réserve » sont
 * regroupés à part (jouables au besoin, hors durée prévue).
 */
import React, { useMemo, useState } from 'react';

import { Icon } from '../components/Icon';
import { Empty, TopBar } from '../components/ui';
import { resolveVersion } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { formatDuration, Setlist, songSeconds } from '../types';

/** Couleurs des pastilles de groupe (mêmes tokens que partout). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

export function SetlistView({ id }: { id: string }) {
  const { setlists, songs, bands } = useStore();
  const [showPerso, setShowPerso] = useState(false);
  const setlist = setlists.find((s) => s.id === id);
  const songById = useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs],
  );

  if (!setlist) {
    return (
      <>
        <TopBar title="Setlist" onBack={() => navigate('/setlists')} />
        <div className="page">
          <Empty>Cette setlist n'existe plus.</Empty>
        </div>
      </>
    );
  }

  const bIdx = bands.findIndex((b) => b.id === (setlist.bandId ?? ''));
  const band = bIdx >= 0 ? bands[bIdx] : undefined;
  const bandColor = bIdx >= 0 ? BAND_COLORS[bIdx % BAND_COLORS.length] : '';

  const played = setlist.items.filter((it) => it.reserve !== true);
  const reserve = setlist.items.filter((it) => it.reserve === true);
  const seconds = (its: Setlist['items']) =>
    its.reduce((sum, it) => sum + songSeconds(songById.get(it.songId)), 0);
  const playedSec = seconds(played);
  const reserveSec = seconds(reserve);
  // Une durée est « estimée » dès qu'un morceau joué n'a pas de durée réelle.
  const hasEstimate = played.some(
    (it) => (songById.get(it.songId)?.durationSec ?? 0) <= 0,
  );

  const renderItem = (item: Setlist['items'][number], num: number | null) => {
    const raw = songById.get(item.songId);
    if (!raw) {
      return (
        <div className="slv-item" key={item.id}>
          <span className="slv-num">{num !== null ? `${num}.` : '·'}</span>
          <div className="grow">
            <div className="slv-title">(morceau supprimé)</div>
          </div>
        </div>
      );
    }
    const song = resolveVersion(raw, item.versionId ?? '');
    const shownKey = item.keyOverride !== '' ? item.keyOverride : song.key;
    const structureRows = song.structure.filter(
      (r) => r.label.trim() !== '' || r.comment.trim() !== '',
    );
    const persoNotes = showPerso
      ? song.rehearsalNotes.filter((n) => n.visibility === 'privee')
      : [];
    return (
      <div className="slv-item" key={item.id}>
        <span className="slv-num">{num !== null ? `${num}.` : '·'}</span>
        <div className="grow">
          <div className="slv-title">
            {song.title || '(sans titre)'}
            {song.artist !== '' && (
              <span className="slv-artist"> — {song.artist}</span>
            )}
          </div>
          <div className="slv-meta">
            {[
              shownKey !== ''
                ? item.keyOverride !== ''
                  ? `Tonalité ${shownKey} (concert)`
                  : `Tonalité ${shownKey}`
                : '',
              formatDuration(songSeconds(raw)),
              raw.durationSec <= 0 ? '(estimée)' : '',
              song.tempo > 0 ? `${song.tempo} BPM` : '',
            ]
              .filter((x) => x !== '')
              .join(' · ')}
          </div>
          {item.note.trim() !== '' && (
            <div className="slv-note">▸ {item.note}</div>
          )}
          {song.structureNotes && song.structureNotes.trim() !== '' && (
            <div className="slv-struct">{song.structureNotes}</div>
          )}
          {structureRows.length > 0 && (
            <ul className="slv-struct-list">
              {structureRows.map((r) => (
                <li key={r.id}>
                  {r.label.trim() !== '' && (
                    <strong>{r.label}</strong>
                  )}
                  {r.chords.trim() !== '' && (
                    <span className="slv-chords"> {r.chords}</span>
                  )}
                  {r.comment.trim() !== '' && (
                    <span className="slv-rowcomment"> — {r.comment}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {persoNotes.length > 0 && (
            <div className="slv-perso">
              {persoNotes.map((n) => (
                <div key={n.id}>✎ {n.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <TopBar
        title={setlist.name || 'Setlist'}
        onBack={() => navigate('/setlists')}
        right={
          <button
            className="btn icon noprint"
            title="Modifier la setlist"
            onClick={() => navigate(`/setlist/${setlist.id}/edit`)}
          >
            <Icon name="edit" size={18} />
          </button>
        }
      />
      <div className="page printarea">
        <div className="slv-head">
          <h1 className="slv-name">{setlist.name || '(sans nom)'}</h1>
          <div className="slv-sub">
            {band ? (
              <span style={{ color: bandColor }}>
                ● {band.name || 'Groupe sans nom'}
              </span>
            ) : (
              <span className="help" style={{ margin: 0 }}>
                <Icon name="mic" size={12} /> Solo
              </span>
            )}
            {setlist.partyType && setlist.partyType.trim() !== '' && (
              <span className="slv-party"> · {setlist.partyType}</span>
            )}
            {setlist.comment.trim() !== '' && (
              <span> · {setlist.comment}</span>
            )}
          </div>
          <div className="slv-duration">
            <strong>
              {played.length} morceau{played.length > 1 ? 'x' : ''} ·{' '}
              {hasEstimate ? '≈ ' : ''}
              {formatDuration(playedSec)}
            </strong>
            {reserve.length > 0 && (
              <span className="help" style={{ margin: 0 }}>
                {' '}
                + {reserve.length} en réserve (≈ {formatDuration(reserveSec)})
              </span>
            )}
            {hasEstimate && (
              <span className="help" style={{ margin: 0 }}>
                {' '}
                · durée estimée à 5 min pour les morceaux sans durée renseignée
              </span>
            )}
          </div>
        </div>

        <div className="slv-actions noprint">
          <button
            className="btn ghost small"
            style={showPerso ? { color: 'var(--accent)' } : undefined}
            title="Afficher mes notes personnelles (privées) sous chaque morceau"
            onClick={() => setShowPerso((v) => !v)}
          >
            {showPerso ? '✓ ' : ''}Mes notes perso
          </button>
          {setlist.items.length > 0 && (
            <>
              <button
                className="btn ghost small"
                onClick={() => navigate(`/stage/${setlist.id}`)}
              >
                <Icon name="play" size={13} /> Scène
              </button>
              <button
                className="btn ghost small"
                title="Régie (chanteur sans partition)"
                onClick={() => navigate(`/remote/${setlist.id}`)}
              >
                <Icon name="sliders" size={14} /> Régie
              </button>
              <button
                className="btn ghost small"
                title="Vue d'ensemble imprimable"
                onClick={() => window.print()}
              >
                <Icon name="clipboard" size={14} /> Imprimer
              </button>
            </>
          )}
        </div>

        {setlist.items.length === 0 ? (
          <Empty>
            Setlist vide —{' '}
            <button
              className="btn ghost small"
              onClick={() => navigate(`/setlist/${setlist.id}/edit`)}
            >
              ajoute des morceaux
            </button>
          </Empty>
        ) : (
          <>
            <div className="slv-list">
              {played.map((item, i) => renderItem(item, i + 1))}
            </div>
            {reserve.length > 0 && (
              <>
                <h2 className="slv-section">
                  En réserve — à jouer selon l'ambiance
                </h2>
                <div className="slv-list slv-reserve">
                  {reserve.map((item) => renderItem(item, null))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
