/**
 * RÉCUPÉRER UN PROFIL PERDU (b243, signalement de Vincent : « je me suis
 * déconnecté et reconnecté, j'ai perdu les informations de profil, photo,
 * liens… »).
 *
 * La cause est corrigée dans `Artist.tsx` (un brouillon figé au montage
 * réécrivait le profil rafraîchi par la synchro). Reste à rendre ce qui a
 * été perdu — et c'est possible : la fiche PUBLIÉE (`public_pages.profile`)
 * garde une copie complète du profil, écrite à chaque enregistrement et à
 * chaque passage ON AIR. Elle n'est jamais touchée par la synchro entre
 * appareils, donc elle survit exactement aux accidents de ce genre.
 *
 * Deux règles, tirées des cicatrices du projet :
 *  · on ne restaure QUE les champs vides ici — jamais on n'écrase ce qui est
 *    présent, sinon on transformerait un sauvetage en seconde perte ;
 *  · la bannière se lève TOUTE SEULE dès qu'il n'y a plus rien à rendre
 *    (règle 11) : ce n'est pas un réglage, c'est un constat.
 */
import React, { useEffect, useState } from 'react';

import { maFichePubliee } from '../lib/publicPages';
import { t } from '../i18n';
import { ArtistProfile } from '../types';

/** Ce que la fiche publiée sait et que le profil local a perdu. */
export function champsARendre(
  local: ArtistProfile,
  publie: ArtistProfile,
): Partial<ArtistProfile> {
  const out: Partial<ArtistProfile> = {};
  if ((local.photo ?? '') === '' && (publie.photo ?? '') !== '')
    out.photo = publie.photo;
  if ((local.bio ?? '') === '' && (publie.bio ?? '') !== '')
    out.bio = publie.bio;
  if ((local.tipUrl ?? '') === '' && (publie.tipUrl ?? '') !== '')
    out.tipUrl = publie.tipUrl;
  if ((local.links ?? []).length === 0 && (publie.links ?? []).length > 0)
    out.links = (publie.links ?? []).map((l) => ({ ...l }));
  if ((local.name ?? '') === '' && (publie.name ?? '') !== '')
    out.name = publie.name;
  return out;
}

/** Résumé lisible de ce qu'on propose de rendre. */
function resume(champs: Partial<ArtistProfile>): string[] {
  const out: string[] = [];
  if (champs.photo) out.push(t('ta photo'));
  if (champs.bio) out.push(t('ta présentation'));
  if (champs.links) out.push(t('tes liens'));
  if (champs.tipUrl) out.push(t('ton lien de pourboire'));
  if (champs.name) out.push(t('ton nom d’artiste'));
  return out;
}

export function ProfilRestore({
  artist,
  onRestore,
}: {
  artist: ArtistProfile;
  onRestore: (champs: Partial<ArtistProfile>) => void;
}) {
  const [champs, setChamps] = useState<Partial<ArtistProfile> | null>(null);
  // Fiche retrouvée par le NOM et non par le compte (b246) : on le dit.
  const [parNom, setParNom] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      // On DEMANDE au serveur si le cache local est muet (b245), et à défaut
      // d'adresse sur ce compte on cherche une page au même NOM D'ARTISTE
      // (b246) : une reconnexion avec une autre adresse e-mail crée un autre
      // compte, qui n'a jamais rien réservé — la fiche existe pourtant.
      const trouvee = await maFichePubliee(artist.name ?? '');
      if (annule) return;
      if (!trouvee) {
        setChamps(null);
        return;
      }
      const manquants = champsARendre(artist, trouvee.page.profile);
      if (!annule) {
        setParNom(trouvee.parNom);
        setChamps(Object.keys(manquants).length > 0 ? manquants : null);
      }
    })();
    return () => {
      annule = true;
    };
    // Recalculé à chaque changement du profil : la bannière disparaît d'elle
    // -même dès qu'on a rendu ce qui manquait.
  }, [artist]);

  if (champs === null) return null;
  const quoi = resume(champs);
  if (quoi.length === 0) return null;

  return (
    <div className="card" style={{ borderColor: 'var(--warn)' }}>
      <p style={{ margin: 0, color: 'var(--warn)' }}>
        {parNom
          ? t(
              '↩ Une page publique à ton nom contient encore {quoi}. Ce profil ne les a plus.',
              { quoi: quoi.join(', ') },
            )
          : t(
              '↩ Ta page publique contient encore {quoi}. Ce profil ne les a plus.',
              { quoi: quoi.join(', ') },
            )}
      </p>
      <div className="spacer" />
      <button className="btn" onClick={() => onRestore(champs)}>
        {t('Récupérer')}
      </button>
    </div>
  );
}
