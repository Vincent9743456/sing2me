/**
 * Setlist souvenir (fanbase V1) : le dernier concert terminé — titres et
 * artistes seulement, aucune parole. Brique d'engagement chargée en différé.
 */
import React from 'react';

import { streamLinks } from './streamLinks';
import { Souvenir } from '../../lib/fanbase';

export default function SouvenirCard({ data }: { data: Souvenir }) {
  if (data.songs.length === 0) return null;
  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 6 }}>
        🎶 Souvenir du concert
        {data.session?.artist ? ` — ${data.session.artist}` : ''}
      </div>
      <p className="help" style={{ marginTop: 0 }}>
        Les morceaux joués — pour les réécouter et t'en souvenir.
      </p>
      {data.songs.map((s, i) => (
        <div key={i} className="remoterow" style={{ cursor: 'default' }}>
          <span className="num">{i + 1}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="rtitle">{s.title || '(sans titre)'}</span>
            {s.artist !== '' && <span className="rsub">{s.artist}</span>}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            {streamLinks(s.title, s.artist).map((l) => (
              <a
                key={l.name}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn ghost small"
                title={`Chercher sur ${l.name}`}
              >
                {l.name[0]}
              </a>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
