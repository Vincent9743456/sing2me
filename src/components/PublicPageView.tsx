/**
 * UNE PAGE PUBLIQUE, TELLE QUE LE PUBLIC LA VOIT (b242).
 *
 * Un seul rendu, deux emplois : la vraie page (`PublicArtist`, ouverte par
 * un spectateur) et l'aperçu dans l'app (`PublicPagePeek`, ouvert par
 * l'artiste ou par le détenteur d'un groupe). C'est le point : un aperçu qui
 * REDESSINE la page à sa façon finit toujours par mentir — il montre autre
 * chose que ce qu'on vérifie. Ici, l'aperçu et la page sont le même code.
 *
 * Purement présentationnel : aucune requête, aucun store. Ce qu'il affiche a
 * été publié, et lui est donné.
 */
import React from 'react';

import { PublicBands, PublicMembers } from './PublicBands';
import { TipBox } from './TipBox';
import { t } from '../i18n';
import { ArtistProfile } from '../types';

export function PublicPageView({
  profile,
  sorte = 'artiste',
  nomDeSecours = '',
}: {
  profile: ArtistProfile;
  /** Une fiche de GROUPE porte le mot « Groupe » sous son nom (b232). */
  sorte?: 'artiste' | 'groupe';
  /** Adresse à afficher tant que la fiche n'a pas encore de nom. */
  nomDeSecours?: string;
}) {
  const links = (profile.links ?? []).filter((l) => l.url !== '');
  const nom = (profile.name ?? '') !== '' ? profile.name : nomDeSecours;
  return (
    <>
      <div className="artisthead">
        {(profile.photo ?? '') !== '' && <img src={profile.photo} alt={nom} />}
        <h1 style={{ margin: '10px 0 4px' }}>{nom}</h1>
        {sorte === 'groupe' && <p className="pubsorte">{t('Groupe')}</p>}
        {(profile.bio ?? '') !== '' && (
          <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
            {profile.bio}
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

      {/* Réciproque exacte : la page de l'artiste nomme ses groupes, celle du
          groupe nomme ses musiciens, et chaque nom mène à la page de l'autre
          quand elle existe (b231, enrichi b232). Un seul des deux blocs
          s'affiche — une fiche est d'un artiste OU d'un groupe. */}
      <PublicMembers members={profile.publicMembers} />
      <PublicBands bands={profile.publicBands} />

      <TipBox artist={profile} />
    </>
  );
}
