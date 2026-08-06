/**
 * Fiche artiste/groupe consultable PENDANT le concert (vue public) :
 * ouverte par le bouton-avatar, elle montre photo, bio, liens et pourboire.
 * Le retour aux paroles est volontairement évident : grand bouton en tête
 * + fermeture d'un tap n'importe où autour du contenu. Chunk différé.
 */
import React from 'react';

import { TipBox } from '../../components/TipBox';
import { ArtistProfile } from '../../types';

export default function ArtistSheet({
  artist,
  onClose,
}: {
  artist: ArtistProfile;
  onClose: () => void;
}) {
  const links = (artist.links ?? []).filter((l) => l.url !== '');
  return (
    <div
      className="stagelist"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="inner">
        <button className="btn block" onClick={onClose}>
          ← Revenir aux paroles
        </button>
        <div className="artisthead" style={{ marginTop: 16 }}>
          {artist.photo !== '' && <img src={artist.photo} alt={artist.name} />}
          <h1 style={{ margin: '10px 0 4px' }}>{artist.name}</h1>
          {artist.bio !== '' && (
            <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
              {artist.bio}
            </p>
          )}
          {links.length > 0 && (
            <div className="links">
              {links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer">
                  {l.label || l.url}
                </a>
              ))}
            </div>
          )}
        </div>
        <TipBox artist={artist} />
        <button className="btn ghost block" onClick={onClose}>
          ← Revenir aux paroles
        </button>
      </div>
    </div>
  );
}
