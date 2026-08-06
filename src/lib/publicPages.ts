/**
 * Pages publiques d'artiste par NOM dictable (chantier 4).
 * Multi-locataire : chaque artiste publie sa fiche publique sous un nom
 * unique ; `livemyband.fr/lenom` (domaine actuel pour l'instant) l'ouvre.
 *
 * Client-only : clé anon + RLS (règle projet). Lecture publique (anon),
 * écriture réservée au propriétaire (auth.uid() = user_id). Best-effort :
 * si Supabase n'est pas configuré, tout renvoie null sans jamais planter.
 */
import { AuthSession } from './auth';
import { ArtistProfile } from '../types';

function sbUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
}
function anon(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
}
export function publicPagesAvailable(): boolean {
  return sbUrl() !== '' && anon() !== '';
}

export interface PublicPage {
  name: string;
  profile: ArtistProfile;
}

/** Fiche publique d'un artiste par son nom dictable (lecture anonyme). */
export async function fetchPublicPage(name: string): Promise<PublicPage | null> {
  if (!publicPagesAvailable() || name === '') return null;
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/public_pages?name=eq.${encodeURIComponent(
        name,
      )}&select=name,profile`,
      { headers: { apikey: anon(), authorization: `Bearer ${anon()}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;
    return { name: row.name, profile: (row.profile ?? {}) as ArtistProfile };
  } catch {
    return null;
  }
}

/** Nom public actuel de CE compte (s'il en a réservé un). */
export async function fetchMyPublicName(
  s: AuthSession,
): Promise<string | null> {
  if (!publicPagesAvailable()) return null;
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/public_pages?user_id=eq.${s.userId}&select=name`,
      {
        headers: {
          apikey: anon(),
          authorization: `Bearer ${s.accessToken}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return row?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Réserve / met à jour le nom public + la fiche de CE compte. Renvoie une
 * erreur lisible si le nom est déjà pris (par un autre) ou réservé/invalide.
 */
export async function claimPublicPage(
  s: AuthSession,
  name: string,
  profile: ArtistProfile,
): Promise<void> {
  if (!publicPagesAvailable()) {
    throw new Error('La synchronisation cloud doit être configurée.');
  }
  const res = await fetch(`${sbUrl()}/rest/v1/public_pages`, {
    method: 'POST',
    headers: {
      apikey: anon(),
      authorization: `Bearer ${s.accessToken}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: s.userId,
      name,
      profile,
      updated_at: new Date().toISOString(),
    }),
  });
  if (res.status === 409) {
    throw new Error('Ce nom est déjà pris — choisis-en un autre.');
  }
  if (!res.ok) {
    // 400 = contrainte de format / nom réservé côté base.
    throw new Error(
      res.status === 400
        ? 'Nom invalide ou réservé — 3 à 30 lettres/chiffres.'
        : `La réservation a échoué (${res.status}).`,
    );
  }
}
