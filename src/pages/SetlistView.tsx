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
    // Setlist imprimable : on garde les COMMENTAIRES — pas les accords ni
    // la structure (Intro/Couplet…), qui alourdiraient la vue.
    // Commentaires fixes de structure + notes de répétition partagées.
    const comments = song.structure.filter((r) => r.comment.trim() !== '');
    const groupNotes = song.rehearsalNotes.filter(
      (n) => n.visibility === 'groupe' && n.text.trim() !== '',
    );
    const persoNotes = showPerso
      ? song.rehearsalNotes.filter(
          (n) => n.visibility === 'privee' && n.text.trim() !== '',
        )
      : [];
    const hasGeneral =
      item.note.trim() !== '' || comments.length > 0 || groupNotes.length > 0;
    return (
      <div className="slv-item" key={item.id}>
        <div className="slv-left">
          <span className="slv-num">{num !== null ? `${num}.` : '·'}</span>
          <div style={{ minWidth: 0 }}>
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
                raw.hearts > 0 ? `❤ ${raw.hearts}` : '',
              ]
                .filter((x) => x !== '')
                .join(' · ')}
            </div>
          </div>
        </div>
        {(hasGeneral || persoNotes.length > 0) && (
          <div className="slv-comments">
            {/* Commentaires généraux d'abord */}
            {item.note.trim() !== '' && (
              <div className="slv-note">▸ {item.note}</div>
            )}
            {comments.map((r) => (
              <div className="slv-gen" key={r.id}>
                {r.comment}
              </div>
            ))}
            {groupNotes.map((n) => (
              <div className="slv-gen" key={n.id}>
                {n.target !== '' ? `${n.target} — ` : ''}
                {n.text}
              </div>
            ))}
            {/* Commentaires perso en dessous */}
            {persoNotes.length > 0 && (
              <div className="slv-perso-block">
                {persoNotes.map((n) => (
                  <div className="slv-perso" key={n.id}>
                    ✎ {n.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <TopBar
        title={setlist.name || 'Setlist'}
        onBack={() => navigate(`/setlist/${setlist.id}`)}
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
          {setlist.items.length > 0 && (
            <button
              className="btn small"
              title="Imprimer cette vue d'ensemble"
              onClick={() => window.print()}
            >
              <Icon name="clipboard" size={14} /> Imprimer
            </button>
          )}
          <button
            className="btn ghost small"
            style={showPerso ? { color: 'var(--accent)' } : undefined}
            title="Afficher mes notes personnelles (privées) sous chaque morceau"
            onClick={() => setShowPerso((v) => !v)}
          >
            {showPerso ? '✓ ' : ''}Mes notes perso
          </button>
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
