/**
 * Fiche artiste/groupe consultable PENDANT le concert (vue public) :
 * ouverte par le bouton-avatar, elle montre photo, bio, liens, groupes et
 * pourboire.
 *
 * Les GROUPES y figurent depuis b232 (« Vincent lance un live en solo. Un
 * spectateur flashe, atterrit sur la page de Vincent, et veut consulter le
 * profil du Groupe Zakoustiks : il faut qu'il puisse le faire »). Pendant un
 * direct, cette fiche EST la page de l'artiste — sans ce bloc, la seule
 * porte vers la page d'un groupe se refermait dès que le concert commençait.
 * Le retour aux paroles est volontairement évident : grand bouton en tête
 * + fermeture d'un tap n'importe où autour du contenu. Chunk différé.
 */
import React, { Suspense, lazy } from 'react';

import { StageList } from '../../components/StageList';
import { TipBox } from '../../components/TipBox';
import { PublicBands, PublicMembers } from '../../components/PublicBands';
import { ArtistProfile } from '../../types';

// « Suivre » vit ici pendant le concert (b177) : le bouton n'existait que
// sur l'écran d'APRÈS le direct. Un spectateur conquis pendant le morceau
// n'avait aucun moyen de suivre l'artiste sans attendre la fin.
const FollowButton = lazy(() => import('./FollowButton'));

export default function ArtistSheet({
  artist,
  showFollow = true,
  onClose,
}: {
  artist: ArtistProfile;
  /** L'artiste peut retirer « Suivre » de son écran public. */
  showFollow?: boolean;
  onClose: () => void;
}) {
  const links = (artist.links ?? []).filter((l) => l.url !== '');
  return (
    <StageList onClose={onClose}>
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
        <PublicMembers members={artist.publicMembers} />
        <PublicBands bands={artist.publicBands} />
        <TipBox artist={artist} />
        {showFollow && artist.name !== '' && (
          <Suspense fallback={null}>
            <FollowButton artistName={artist.name} />
          </Suspense>
        )}
        <button className="btn ghost block" onClick={onClose}>
          ← Revenir aux paroles
        </button>
      </div>
    </StageList>
  );
}
