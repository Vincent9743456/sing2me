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

/** Prochaines dates publiques (b479) — refiltrées au rendu. */
function ProchainsConcerts({
  concerts,
}: {
  concerts: ArtistProfile['publicConcerts'];
}) {
  const seuil = Date.now() - 6 * 3600 * 1000;
  const aVenir = (concerts ?? []).filter((c) => {
    if (c.date === '') return false;
    const d = new Date(`${c.date}T${c.time || '00:00'}`).getTime();
    return Number.isFinite(d) && d >= seuil;
  });
  if (aVenir.length === 0) return null;
  return (
    <div className="pubconcerts">
      <h2 className="pubsection">{t('Prochains concerts')}</h2>
      {aVenir.map((c, i) => {
        const d = new Date(`${c.date}T${c.time || '00:00'}`);
        const quand =
          d.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }) + (c.time !== '' ? ` · ${c.time}` : '');
        return (
          <div key={i} className="pubconcert">
            <strong>{quand}</strong>
            {[c.title, c.venue]
              .filter((x) => x !== '')
              .map((x) => ` · ${x}`)
              .join('')}
          </div>
        );
      })}
    </div>
  );
}

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

      {/* PROCHAINES DATES (b479, audit P-1) : publiées avec la fiche,
          REFILTRÉES au rendu — une fiche pas republiée depuis un moment ne
          montre jamais une date passée. */}
      <ProchainsConcerts concerts={profile.publicConcerts} />

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
