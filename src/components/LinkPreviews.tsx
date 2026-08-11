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

/**
 * URL d'intégration Spotify (track / album / artist / playlist).
 *
 * LA HAUTEUR EST CELLE DU LECTEUR, PAS CELLE QU'ON ESPÈRE (b267, constat de
 * Vincent : « il y a du blanc en dessous »). Sur un écran étroit, Spotify
 * dessine TOUJOURS son lecteur compact — 152 px — quelle que soit la hauteur
 * qu'on lui donne : réserver 352 px pour une page d'artiste laissait 200 px
 * vides. Ça ne se voyait pas tant que le fond restait transparent ; depuis
 * qu'on prête un fond clair aux documents étrangers (b263), ce vide est une
 * grande plaque crème.
 *
 * `haute` dit donc si CE contenu a une version haute, et le CSS ne la sert
 * qu'à partir de 640 px de large, là où Spotify la dessine vraiment.
 */
export function spotifyEmbed(
  url: string,
): { src: string; haute: boolean } | null {
  const m =
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|artist|playlist)\/([\w]{8,40})/.exec(
      url,
    );
  if (!m) return null;
  return {
    // `utm_source=generator` = format d'embed Spotify actuel ; sans lui, le
    // lecteur reste noir/vide.
    src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator`,
    haute: m[1] !== 'track',
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
  /**
   * TOUS les liens qui savent se lire, dans l'ordre où l'artiste les a
   * écrits (b267, demande de Vincent : « si un 3ᵉ lien est ajouté par
   * l'utilisateur, il devient lui aussi visible »). Avant, on ne gardait que
   * le PREMIER YouTube et le PREMIER Spotify : une deuxième vidéo restait une
   * puce, sans qu'on sache pourquoi.
   */
  const lecteurs = valid
    .map((l) => ({ l, yt: youtubeEmbed(l.url), sp: spotifyEmbed(l.url) }))
    .filter((x) => x.yt !== null || x.sp !== null);

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
      {lecteurs.map(({ l, yt, sp }) =>
        yt !== null ? (
          <div className="embedbox video" key={l.id}>
            <iframe
              src={yt}
              title={t('Vidéo YouTube')}
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <div
            className={`embedbox audio${sp!.haute ? ' haute' : ''}`}
            key={l.id}
          >
            <iframe
              src={sp!.src}
              title={t('Écoute Spotify')}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              style={{ borderRadius: 12 }}
            />
          </div>
        ),
      )}
    </div>
  );
}
