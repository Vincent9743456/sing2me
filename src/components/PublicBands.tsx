/**
 * LES DEUX LISTES RÉCIPROQUES DES PAGES PUBLIQUES (b231, refondu b232).
 *
 *  · `PublicBands`   — sur la page d'un ARTISTE : ses groupes.
 *  · `PublicMembers` — sur la page d'un GROUPE : ses musiciens.
 *
 * Même grammaire pour les deux, parce que c'est la même information vue des
 * deux côtés : une vignette, un nom, et un lien vers la page de l'autre
 * quand elle existe. « Il faut qu'un spectateur puisse consulter le profil
 * du Groupe Zakoustiks auquel Vincent appartient » (Vincent, b232) — d'où le
 * lien, et d'où la présence de ce bloc jusque DANS la fiche ouverte pendant
 * un concert : c'est là que se trouve le spectateur qui vient de flasher.
 *
 * Module de l'entrée publique légère : aucune dépendance au store, aucun
 * accès réseau. Tout ce qu'il affiche a été publié avec la fiche.
 */
import React from 'react';

import { t } from '../i18n';
import { PublicBand, PublicMember } from '../types';

/** Initiales de secours : jamais de silhouette anonyme, jamais d'avatar
 *  inventé — les lettres de son nom, et rien d'autre. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter((m) => m !== '');
  if (mots.length === 0) return '?';
  const dernier = mots.length > 1 ? mots[mots.length - 1] : '';
  return (mots[0][0] + (dernier !== '' ? dernier[0] : '')).toUpperCase();
}

/** Vignette ronde : la photo de l'annuaire, ou les initiales. */
function Vignette({
  nom,
  photo,
  taille,
}: {
  nom: string;
  photo?: string;
  taille: number;
}) {
  const style = { width: taille, height: taille };
  if ((photo ?? '') !== '')
    return <img className="pg-photo" src={photo} alt="" style={style} />;
  return (
    <span
      className="pg-photo pg-initiales"
      style={{ ...style, fontSize: Math.round(taille * 0.36) }}
      aria-hidden="true"
    >
      {initiales(nom)}
    </span>
  );
}

/**
 * Les musiciens d'un groupe publié. Les fiches publiées AVANT b232 portent
 * une simple liste de noms : le serveur garde le JSON qu'on lui a donné et
 * ne le migre pas, donc la lecture accepte les deux formes.
 */
export function musiciensDe(g: PublicBand): PublicMember[] {
  return (g.members ?? [])
    .map((m) => (typeof m === 'string' ? { name: m } : m))
    .filter((m) => (m?.name ?? '') !== '');
}

/** Un musicien : sa vignette, son nom, sa page quand il en a une. */
function Musicien({ m }: { m: PublicMember }) {
  const dedans = (
    <>
      <Vignette nom={m.name} photo={m.photo} taille={56} />
      <span className="pg-nom">{m.name}</span>
    </>
  );
  return m.address ? (
    <a className="pg-musicien" href={`/${m.address}`}>
      {dedans}
    </a>
  ) : (
    <span className="pg-musicien">{dedans}</span>
  );
}

/** La composition d'un groupe, sur sa page publique. */
export function PublicMembers({ members }: { members?: PublicMember[] }) {
  const liste = (members ?? []).filter((m) => (m?.name ?? '') !== '');
  if (liste.length === 0) return null;
  return (
    <div className="pubgroupes">
      <h2>{t('Les musiciens')}</h2>
      <div className="pg-musiciens">
        {liste.map((m, i) => (
          <Musicien key={i} m={m} />
        ))}
      </div>
    </div>
  );
}

/**
 * Les groupes d'un artiste. Ceux qu'il a masqués n'y sont pas : la liste est
 * construite au moment où il publie sa fiche, donc c'est son choix par
 * construction. Un groupe qui a une adresse est CLIQUABLE — c'est tout
 * l'objet du lot.
 */
export function PublicBands({ bands }: { bands?: PublicBand[] }) {
  const liste = (bands ?? []).filter((g) => (g?.name ?? '') !== '');
  if (liste.length === 0) return null;
  return (
    <div className="pubgroupes">
      <h2>{t('Ses groupes')}</h2>
      {liste.map((g, i) => {
        const musiciens = musiciensDe(g);
        const dedans = (
          <>
            <Vignette nom={g.name} photo={g.photo} taille={48} />
            <span className="pg-textes">
              <span className="pg-nom">{g.name}</span>
              {g.address ? (
                <span className="pg-adresse">
                  {location.host}/{g.address}
                </span>
              ) : null}
              {musiciens.length > 0 && (
                <span className="pg-membres">
                  {musiciens.map((m) => m.name).join(' · ')}
                </span>
              )}
            </span>
          </>
        );
        return (
          <div className="pubgroupe" key={i}>
            {g.address ? (
              <a className="pg-tete" href={`/${g.address}`}>
                {dedans}
              </a>
            ) : (
              <div className="pg-tete">{dedans}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
