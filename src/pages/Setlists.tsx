import React from 'react';

import { Empty, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { navigate } from '../router';
import { useStore } from '../store';
import { formatDuration, Setlist } from '../types';

export function totalDuration(setlist: Setlist, durations: Map<string, number>): number {
  return setlist.items.reduce(
    (sum, it) => sum + (durations.get(it.songId) ?? 0),
    0,
  );
}

/** Couleurs des pastilles de groupe (tokens --band-*, stables par ordre). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

export function Setlists() {
  const { setlists, songs, bands } = useStore();
  const bandIndex = new Map(bands.map((b, i) => [b.id, i]));
  const durations = new Map(songs.map((s) => [s.id, s.durationSec]));
  const sorted = [...setlists].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return (
    <>
      <TopBar
        title="Setlists"
        right={
          <>
            <button
              className="btn icon"
              title="Suivre le groupe (concert)"
              onClick={() => navigate('/follow')}
            >
              <Icon name="antenna" size={20} />
            </button>
            <button
              className="btn icon"
              title="Nouvelle setlist"
              onClick={() => navigate('/setlist/new')}
            >
              <Icon name="plus" size={20} />
            </button>
          </>
        }
      />
      <div className="page">
        {sorted.length === 0 ? (
          <Empty>
            Aucune setlist pour l'instant.
            <br />
            Appuie sur ＋ pour préparer ton prochain concert.
          </Empty>
        ) : (
          <div className="list">
          {sorted.map((sl) => {
            const total = totalDuration(sl, durations);
            const bIdx = bandIndex.get(sl.bandId);
            const band = bIdx !== undefined ? bands[bIdx] : undefined;
            const color =
              bIdx !== undefined
                ? BAND_COLORS[bIdx % BAND_COLORS.length]
                : 'var(--muted)';
            return (
              <div
                className="row"
                key={sl.id}
                onClick={() => navigate(`/setlist/${sl.id}`)}
              >
                <div className="grow">
                  <div className="title">{sl.name || '(sans nom)'}</div>
                  <div className="sub">
                    <span style={{ color }} title="Groupe de la setlist">
                      ● {band ? band.name || 'Groupe sans nom' : 'Aucun groupe'}
                    </span>
                    {' · '}
                    {[
                      `${sl.items.length} morceau${sl.items.length > 1 ? 'x' : ''}`,
                      total > 0 ? `≈ ${formatDuration(total)}` : '',
                      sl.comment,
                    ]
                      .filter((x) => x !== undefined && x !== '')
                      .join(' · ')}
                  </div>
                </div>
                {sl.items.length > 0 && (
                  <>
                    <button
                      className="btn ghost small"
                      title="Régie (chanteur sans partition)"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/remote/${sl.id}`);
                      }}
                    >
                      <Icon name="sliders" size={16} />
                    </button>
                    <button
                      className="btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/stage/${sl.id}`);
                      }}
                    >
                      <Icon name="play" size={13} /> Scène
                    </button>
                  </>
                )}
              </div>
            );
          })}
          </div>
        )}
      </div>
    </>
  );
}
