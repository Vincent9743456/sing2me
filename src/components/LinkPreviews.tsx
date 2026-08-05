/**
 * Aperçu des liens d'un artiste : puces cliquables + lecteurs intégrés
 * (YouTube en vidéo, Spotify en écoute directe). Utilisé sur la fiche
 * Artiste et sur les pages publiques.
 */
import React from 'react';

import { ArtistLink } from '../types';

/** URL d'intégration YouTube (watch / youtu.be / shorts / embed). */
export function youtubeEmbed(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/.exec(
      url,
    );
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

/** URL d'intégration Spotify (track / album / artist / playlist). */
export function spotifyEmbed(
  url: string,
): { src: string; height: number } | null {
  const m =
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|artist|playlist)\/([\w]{8,40})/.exec(
      url,
    );
  if (!m) return null;
  return {
    src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
    height: m[1] === 'track' ? 152 : 352,
  };
}

export function LinkPreviews({
  links,
  showChips = true,
}: {
  links: ArtistLink[];
  showChips?: boolean;
}) {
  const valid = links.filter((l) => l.url.trim() !== '');
  if (valid.length === 0) return null;
  const yt = valid.map((l) => youtubeEmbed(l.url)).find((x) => x !== null);
  const sp = valid.map((l) => spotifyEmbed(l.url)).find((x) => x != null);

  return (
    <div className="linkpreviews">
      {showChips && (
        <div className="links">
          {valid.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noreferrer">
              {l.label || l.url}
            </a>
          ))}
        </div>
      )}
      {yt && (
        <div className="embedbox video">
          <iframe
            src={yt}
            title="Vidéo YouTube"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      {sp && (
        <div className="embedbox" style={{ height: sp.height }}>
          <iframe
            src={sp.src}
            title="Écoute Spotify"
            allow="encrypted-media"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
