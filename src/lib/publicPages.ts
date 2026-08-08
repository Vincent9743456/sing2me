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
import { normalizePublicName, publicNameError } from './publicName';
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

/* Cache LOCAL du nom public de CE compte : le QR unique (panneau ON AIR)
 * doit le connaître même sans réseau — le nom ne change pratiquement
 * jamais, on le mémorise à chaque lecture/réservation réussie. */
const NAME_CACHE = 'sing2me/publicName';

/** Nom public mémorisé localement ('' si inconnu). */
export function cachedPublicName(): string {
  try {
    return localStorage.getItem(NAME_CACHE) ?? '';
  } catch {
    return '';
  }
}

/** Mémorise (ou oublie, si '') le nom public de ce compte. */
export function rememberPublicName(name: string): void {
  try {
    if (name === '') localStorage.removeItem(NAME_CACHE);
    else localStorage.setItem(NAME_CACHE, name);
  } catch {
    /* stockage indisponible : tant pis, on redemandera au serveur */
  }
}

/**
 * Page publique d'un musicien retrouvée par son NOM D'ARTISTE (b173).
 *
 * Une fiche de membre de groupe ne porte aucun identifiant de compte : le
 * seul lien possible avec sa page publique est son nom. On refuse donc de
 * répondre s'il y a plus d'un porteur du nom — mieux vaut ne rien proposer
 * que d'envoyer le groupe sur la page de quelqu'un d'autre.
 *
 * Lecture anonyme d'une page déjà publique : rien de nouveau n'est exposé.
 */
export async function findPublicPageByArtist(
  artistName: string,
): Promise<PublicPage | null> {
  const name = artistName.trim();
  if (!publicPagesAvailable() || name === '') return null;
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/public_pages?profile->>name=eq.${encodeURIComponent(
        name,
      )}&select=name,profile&limit=2`,
      { headers: { apikey: anon(), authorization: `Bearer ${anon()}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length !== 1) return null; // 0 ou ambigu
    return { name: rows[0].name, profile: (rows[0].profile ?? {}) as ArtistProfile };
  } catch {
    return null;
  }
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

/**
 * Ce nom public est-il libre ? (b137 — l'artiste peut changer d'adresse
 * après la réservation automatique.) Lecture anonyme : on ne voit que
 * l'existence d'une ligne. Renvoie `true` si personne ne l'a pris, ou si
 * c'est déjà le nôtre ; `null` si la question n'a pas pu être posée
 * (hors ligne, cloud non configuré) — l'appelant reste alors muet.
 */
export async function isPublicNameFree(
  name: string,
  myUserId?: string,
): Promise<boolean | null> {
  if (!publicPagesAvailable() || name === '') return null;
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/public_pages?name=eq.${encodeURIComponent(
        name,
      )}&select=user_id`,
      { headers: { apikey: anon(), authorization: `Bearer ${anon()}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return true;
    return myUserId !== undefined && row.user_id === myUserId;
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
 * Nom public AUTOMATIQUE + fiche à jour (b136 — bug signalé par Marco).
 *
 * Deux pièges réglés d'un coup :
 * 1. la fiche publiée était un INSTANTANÉ pris à la réservation — un artiste
 *    qui réservait son nom avant de remplir son profil gardait une fiche
 *    vide, et /sonnom affichait « Page introuvable » ;
 * 2. il fallait penser à réserver le nom à la main, alors que le QR pointe
 *    déjà vers /sonnom.
 *
 * Cette fonction est donc appelée à chaque enregistrement du profil et au
 * passage ON AIR : elle republie la fiche sous le nom déjà réservé, ou en
 * réserve un dérivé du nom d'artiste (suffixe numérique si déjà pris).
 * Best-effort et silencieuse : elle ne bloque JAMAIS un passage en direct.
 * Renvoie le nom en service, ou null si rien n'a pu être fait.
 */
export async function ensurePublicPage(
  s: AuthSession,
  artist: ArtistProfile,
): Promise<string | null> {
  if (!publicPagesAvailable()) return null;
  const existing = (await fetchMyPublicName(s)) ?? '';
  if (existing !== '') {
    try {
      await claimPublicPage(s, existing, artist);
    } catch {
      /* republication impossible (hors ligne…) : le nom reste valable */
    }
    rememberPublicName(existing);
    return existing;
  }
  const base = normalizePublicName(artist.name);
  if (base === '' || publicNameError(base) !== null) return null;
  // Nom pris (ou refusé) → base2, base3… puis on abandonne : l'artiste
  // gardera la main dans « Ton lien public dictable ».
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`.slice(0, 30);
    if (publicNameError(candidate) !== null) continue;
    try {
      await claimPublicPage(s, candidate, artist);
      rememberPublicName(candidate);
      return candidate;
    } catch {
      /* déjà pris : on tente le suivant */
    }
  }
  return null;
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
