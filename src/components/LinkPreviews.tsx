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
 * PAS DE HAUTEUR À DEVINER (b267, corrigé en b275). Spotify dessine son
 * lecteur COMPACT — 152 px — quelle que soit la hauteur qu'on lui donne et
 * quelle que soit la largeur de l'écran : b267 croyait qu'une version haute
 * apparaissait au-delà de 640 px, la capture de Vincent sur un écran de
 * 1553 px dit le contraire. Réserver plus laissait 200 px de vide.
 *
 * On ne suppose donc plus rien sur ce qu'un service tiers décide de
 * dessiner : le CSS prend la seule hauteur qu'il garantit.
 */
export function spotifyEmbed(url: string): { src: string } | null {
  const m =
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|artist|playlist)\/([\w]{8,40})/.exec(
      url,
    );
  if (!m) return null;
  return {
    // `utm_source=generator` = format d'embed Spotify actuel ; sans lui, le
    // lecteur reste noir/vide.
    src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator`,
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
          <React.Fragment key={l.id}>
            <div className="embedbox video">
              <iframe
                src={yt}
                title={t('Vidéo YouTube')}
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
            {/* Un lecteur mort n'est jamais un cul-de-sac (b346, constat de
                Vincent : cadre vide, « je ne vois plus mon lien YouTube »).
                On ne SAIT pas quand l'intégration échoue (b263) : la sortie
                est donc toujours là, discrète — comme les puces, elle
                fonctionne même quand le lecteur est en panne. */}
            <p className="embedexit">
              <a href={l.url} target="_blank" rel="noreferrer">
                {t('▶ Regarder sur YouTube')}
              </a>
            </p>
          </React.Fragment>
        ) : (
          <React.Fragment key={l.id}>
            <div className="embedbox audio">
              <iframe
                src={sp!.src}
                title={t('Écoute Spotify')}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                style={{ borderRadius: 12 }}
              />
            </div>
            <p className="embedexit">
              <a href={l.url} target="_blank" rel="noreferrer">
                {t('♪ Écouter sur Spotify')}
              </a>
            </p>
          </React.Fragment>
        ),
      )}
    </div>
  );
}
