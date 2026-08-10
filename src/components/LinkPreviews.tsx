/**
 * Aperçu des liens d'un artiste : puces cliquables + lecteurs intégrés
 * (YouTube en vidéo, Spotify en écoute directe). Utilisé sur la fiche
 * Artiste et sur les pages publiques.
 *
 * **Un lecteur intégré peut afficher n'importe quoi, et on n'en saura rien**
 * (b263) : c'est un document d'une AUTRE origine — impossible de lire ce
 * qu'il contient, impossible de savoir qu'il a échoué (`onError` ne se
 * déclenche pas sur un 503, `onLoad` si). Le jour où Spotify est tombé, sa
 * page « Error 503 » s'est affichée telle quelle au milieu de la fiche de
 * Vincent. On ne PRÉTEND donc rien détecter : la seule chose qu'on maîtrise
 * est le fond prêté au document, posé après un délai dans `.embedbox iframe`
 * pour qu'un texte étranger reste lisible. Les puces, elles, marchent
 * toujours : le lien reste cliquable quand le lecteur est en panne — c'est
 * pour ça qu'on ne remplace jamais les puces par le lecteur.
 */
import React from 'react';

import { t } from '../i18n';
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
    // `utm_source=generator` = format d'embed Spotify actuel ; sans lui, le
    // lecteur reste noir/vide.
    src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator`,
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
            title={t('Vidéo YouTube')}
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
            title={t('Écoute Spotify')}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ borderRadius: 12 }}
          />
        </div>
      )}
    </div>
  );
}
