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
import { miniature } from './photo';
import { normalizePublicName, publicNameError } from './publicName';
import { ArtistProfile, Band, PublicBand, PublicMember } from '../types';

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
  /**
   * Adresse du DÉTENTEUR du groupe — renseignée seulement pour l'adresse d'un
   * GROUPE. Elle suit le transfert toute seule (c'est le propriétaire de
   * `cloud_bands` qui la désigne), et c'est elle qui porte le direct : un
   * groupe n'a pas de QR à lui, le QR est celui du lanceur (b227).
   */
  miroirDe?: string | null;
  /**
   * Sorte d'adresse (b232). Un groupe a désormais une PAGE à lui — sa photo,
   * sa présentation, ses liens, ses musiciens — et non plus seulement un
   * renvoi vers celle de son détenteur : « la page du Groupe ou de l'artiste
   * doivent rester consultables » (Vincent). Le renvoi ne concerne plus que
   * le DIRECT.
   */
  sorte?: 'artiste' | 'groupe';
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

/**
 * L'ADRESSE PUBLIQUE D'UN MUSICIEN, PAR SON NOM (b232).
 *
 * Même résolution que `findPublicPageByArtist`, mais on ne ramène QUE
 * l'adresse : cette fonction est appelée une fois par musicien de chaque
 * groupe au moment de publier, et une fiche entière pèse ses photos.
 *
 * Deux pages du même nom : on rend une chaîne vide. Un lien vers le mauvais
 * Vincent serait pire que pas de lien du tout.
 */
export async function adressePubliqueDuNom(nom: string): Promise<string> {
  const name = nom.trim();
  if (!publicPagesAvailable() || name === '') return '';
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/public_pages?profile->>name=eq.${encodeURIComponent(
        name,
      )}&select=name&limit=2`,
      { headers: { apikey: anon(), authorization: `Bearer ${anon()}` } },
    );
    if (!res.ok) return '';
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length !== 1) return ''; // 0 ou ambigu
    return typeof rows[0]?.name === 'string' ? rows[0].name : '';
  } catch {
    return '';
  }
}

/**
 * Fiche publique par nom dictable (lecture anonyme).
 *
 * Passe par `resolve_public_name` (b227), qui connaît DEUX sortes d'adresses :
 * celle d'un artiste, et celle d'un GROUPE — un MIROIR vers la page de son
 * détenteur. La fonction est `security definer` parce qu'un spectateur n'a
 * aucun droit sur la table des groupes, et n'en aura pas : elle ne rend que
 * du public.
 */
export async function fetchPublicPage(name: string): Promise<PublicPage | null> {
  if (!publicPagesAvailable() || name === '') return null;
  try {
    const res = await fetch(`${sbUrl()}/rest/v1/rpc/resolve_public_name`, {
      method: 'POST',
      headers: {
        apikey: anon(),
        authorization: `Bearer ${anon()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_name: name }),
    });
    if (!res.ok) return anciennePageParNom(name);
    const rows = await res.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;
    return {
      name: row.nom ?? name,
      profile: (row.profil ?? {}) as ArtistProfile,
      miroirDe: row.miroir_de ?? null,
      // `sorte` manque tant que `public.sql` n'a pas été rejoué : on la
      // déduit alors du miroir, comme avant b232.
      sorte:
        row.sorte === 'groupe' || row.sorte === 'artiste'
          ? row.sorte
          : (row.miroir_de ?? null) !== null
            ? 'groupe'
            : 'artiste',
    };
  } catch {
    return null;
  }
}

/**
 * Repli : la RPC n'existe pas encore (`supabase/public.sql` pas rejoué). On
 * lit la table directement — le miroir de groupe ne marchera pas, mais une
 * page d'artiste s'ouvre comme avant. Jamais d'écran mort pour un spectateur.
 */
async function anciennePageParNom(name: string): Promise<PublicPage | null> {
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
    return row
      ? { name: row.name, profile: (row.profile ?? {}) as ArtistProfile }
      : null;
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

/* ============================================================
 * L'ADRESSE MIROIR D'UN GROUPE (b227, décision de Vincent).
 *
 * Un groupe n'a pas de QR à lui — le QR est celui de l'artiste, et c'est
 * l'artiste qui décide, au lancement, si le public voit son nom ou celui du
 * groupe. Mais le groupe a une ADRESSE, qui MONTRE la page de son détenteur.
 *
 * Le détenteur n'est stocké nulle part ici : il est lu à la volée sur
 * `cloud_bands.owner`, la colonne que `transfer_band` met à jour. Transmettre
 * le groupe déplace donc le miroir tout seul — il n'y a rien à
 * resynchroniser, donc rien qui puisse se désynchroniser.
 * ============================================================ */

/** L'adresse de CE groupe publié, ou '' s'il n'en a pas. */
export async function fetchBandPageName(cloudId: string): Promise<string> {
  if (!publicPagesAvailable() || cloudId === '') return '';
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/band_pages?band_id=eq.${encodeURIComponent(
        cloudId,
      )}&select=name&limit=1`,
      { headers: { apikey: anon(), authorization: `Bearer ${anon()}` } },
    );
    if (!res.ok) return '';
    const rows = await res.json();
    return (Array.isArray(rows) && rows[0]?.name) || '';
  } catch {
    return '';
  }
}

/**
 * Réserve (ou renomme) l'adresse d'un groupe. Réservée au DÉTENTEUR : la
 * politique RLS le vérifie côté base, on ne se contente pas d'un test
 * d'interface.
 */
export async function claimBandPage(
  s: AuthSession,
  cloudId: string,
  name: string,
): Promise<void> {
  if (!publicPagesAvailable()) {
    throw new Error('La synchronisation cloud doit être configurée.');
  }
  const err = publicNameError(name);
  if (err) throw new Error(err);
  // Renommer = supprimer l'ancienne ligne (le nom est la clé) puis écrire.
  const ancien = await fetchBandPageName(cloudId);
  if (ancien !== '' && ancien !== name) await releaseBandPage(s, cloudId);
  const res = await fetch(`${sbUrl()}/rest/v1/band_pages`, {
    method: 'POST',
    headers: {
      apikey: anon(),
      authorization: `Bearer ${s.accessToken}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      name,
      band_id: cloudId,
      updated_at: new Date().toISOString(),
    }),
  });
  if (res.status === 409) {
    throw new Error('Ce nom est déjà pris — choisis-en un autre.');
  }
  if (!res.ok) {
    throw new Error(
      res.status === 400
        ? 'Nom invalide ou réservé — 3 à 30 lettres/chiffres.'
        : res.status === 403
          ? 'Seul le créateur du groupe peut changer son adresse.'
          : `La réservation a échoué (${res.status}).`,
    );
  }
}

/**
 * Retire l'adresse d'un groupe — appelée quand on le MASQUE au public :
 * masquer un groupe et lui laisser une adresse publique serait un mensonge.
 * Best-effort : un échec ne bloque jamais le masquage côté application.
 */
export async function releaseBandPage(
  s: AuthSession,
  cloudId: string,
): Promise<void> {
  if (!publicPagesAvailable() || cloudId === '') return;
  try {
    await fetch(
      `${sbUrl()}/rest/v1/band_pages?band_id=eq.${encodeURIComponent(cloudId)}`,
      {
        method: 'DELETE',
        headers: { apikey: anon(), authorization: `Bearer ${s.accessToken}` },
      },
    );
  } catch {
    /* hors ligne : l'adresse partira au prochain passage */
  }
}

/* ============================================================
 * CE QUE LE PUBLIC VOIT D'UN GROUPE (b231, refondu b232)
 *
 * Deux pages, deux métiers, et un seul espace de noms :
 *  · `/vincent`     — la fiche de l'artiste. Elle NOMME ses groupes.
 *  · `/zakoustiks`  — la fiche du GROUPE : sa photo, sa présentation, ses
 *                     liens, sa composition. Elle NOMME ses musiciens.
 * Chacune mène à l'autre. « Le QR code est unique et la page du live dépend
 * de comment a été paramétré le live, mais la page du Groupe ou de l'artiste
 * doivent rester consultables » (Vincent, b232) : le renvoi vers le
 * détenteur ne concerne donc plus que le DIRECT — plus l'affichage.
 * ============================================================ */

/** Tailles d'affichage des vignettes publiques (b232), en pixels. */
const MINI_GROUPE = 96;
const MINI_MUSICIEN = 64;
/**
 * Plafond de photos embarquées dans UNE fiche publique, en caractères de
 * data-URL. Une fiche part au serveur en un seul objet JSON, republié à
 * chaque enregistrement de profil et à chaque GO LIVE : au-delà, on préfère
 * une fiche sans quelques vignettes à une fiche qui traîne. Ce qui se lit en
 * premier se sert en premier.
 */
const BUDGET_PHOTOS = 160_000;

/** Compteur de vignettes : une fiche, un budget. */
function porteMonnaie() {
  let poids = 0;
  return async (source: string, taille: number): Promise<string> => {
    if ((source ?? '') === '' || poids >= BUDGET_PHOTOS) return '';
    const mini = await miniature(source, taille);
    if (mini === '' || poids + mini.length > BUDGET_PHOTOS) return '';
    poids += mini.length;
    return mini;
  };
}

/**
 * Résolveur d'adresses de musiciens, avec mémoire : une même personne joue
 * dans deux groupes, son adresse ne se cherche qu'une fois. Ma propre page
 * n'est jamais cherchée — un lien vers soi-même n'a aucun sens.
 */
function resolveurAdresses(moi: string) {
  const connues = new Map<string, Promise<string>>();
  return (nom: string): Promise<string> => {
    const cle = nom.trim().toLowerCase();
    if (cle === '' || cle === moi) return Promise.resolve('');
    const deja = connues.get(cle);
    if (deja) return deja;
    const p = adressePubliqueDuNom(nom);
    connues.set(cle, p);
    return p;
  };
}

/**
 * Les musiciens d'un groupe, prêts à publier.
 *
 * Deux refus explicites : un invité qui n'a pas accepté n'est PAS annoncé au
 * public (il n'a rien accepté), et un nom qui désigne deux pages publiques
 * n'est pas lié — mieux vaut pas de lien qu'un lien vers un homonyme.
 *
 * `vignette` absente : on ne publie que les noms et les adresses. C'est le
 * cas sur la fiche d'un ARTISTE, où les groupes ne sont qu'une mention ; les
 * visages appartiennent à la page du groupe.
 */
async function musiciensPublics(
  band: Band,
  artist: ArtistProfile | undefined,
  adresseDe: (nom: string) => Promise<string>,
  vignette?: (source: string, taille: number) => Promise<string>,
): Promise<PublicMember[]> {
  const moi = (artist?.name ?? '').trim().toLowerCase();
  // Doublons de nom écartés en gardant la fiche la plus fournie.
  const parNom = new Map<string, { name: string; photo: string }>();
  for (const m of band.members ?? []) {
    if (m.pending === true) continue;
    const nom = (m.name ?? '').trim();
    if (nom === '') continue;
    const cle = nom.toLowerCase();
    // Le détenteur est souvent absent des membres cloud : sa photo de profil
    // sert de secours, comme dans la fiche du groupe côté musicien.
    const photo =
      (m.photo ?? '') !== ''
        ? (m.photo as string)
        : cle === moi
          ? (artist?.photo ?? '')
          : '';
    const vu = parNom.get(cle);
    if (!vu) parNom.set(cle, { name: nom, photo });
    else if (vu.photo === '' && photo !== '') vu.photo = photo;
  }
  const membres = [...parNom.values()];
  const adresses = await Promise.all(membres.map((m) => adresseDe(m.name)));
  const out: PublicMember[] = [];
  for (let i = 0; i < membres.length; i++) {
    const photo = vignette
      ? await vignette(membres[i].photo, MINI_MUSICIEN)
      : '';
    out.push({
      name: membres[i].name,
      ...(photo !== '' ? { photo } : {}),
      ...(adresses[i] !== '' ? { address: adresses[i] } : {}),
    });
  }
  return out;
}

/**
 * LES GROUPES À PUBLIER AVEC LE PROFIL DE L'ARTISTE (b231, enrichi b232).
 *
 * Les groupes MASQUÉS n'y entrent jamais — c'est tout l'objet du réglage.
 *
 * On en sort le nom du groupe, sa photo (« le mieux est de mettre la photo
 * présente sur la fiche du Groupe ou du musicien, et un lien cliquable »),
 * son adresse publique si elle existe, et les noms de ses musiciens. Rien
 * n'est créé ici : aucune adresse n'est réservée au nom de quelqu'un
 * d'autre, on ne fait que dire celles qu'un visiteur trouverait seul.
 */
export async function groupesPublics(
  bands: Band[],
  artist?: ArtistProfile,
): Promise<PublicBand[]> {
  const visibles = bands.filter(
    (b) => b.hiddenFromPublic !== true && (b.name ?? '').trim() !== '',
  );
  const adresseDe = resolveurAdresses((artist?.name ?? '').trim().toLowerCase());
  const vignette = porteMonnaie();

  const brut = await Promise.all(
    visibles.map(async (b) => ({
      nom: (b.name ?? '').trim(),
      photo: b.photo ?? '',
      adresse: await fetchBandPageName(b.cloudId ?? ''),
      membres: await musiciensPublics(b, artist, adresseDe),
    })),
  );

  const out: PublicBand[] = [];
  for (const g of brut) {
    const photo = await vignette(g.photo, MINI_GROUPE);
    out.push({
      name: g.nom,
      members: g.membres,
      ...(g.adresse !== '' ? { address: g.adresse } : {}),
      ...(photo !== '' ? { photo } : {}),
    });
  }
  return out;
}

/** Le profil enrichi de ses groupes, prêt à publier. */
export async function profilAPublier(
  artist: ArtistProfile,
  bands: Band[],
): Promise<ArtistProfile> {
  try {
    return { ...artist, publicBands: await groupesPublics(bands, artist) };
  } catch {
    // Jamais bloquant : sans la liste, la fiche part quand même.
    return artist;
  }
}

/**
 * LA FICHE PUBLIQUE D'UN GROUPE (b232).
 *
 * Même forme qu'une fiche d'artiste — un groupe se présente au public
 * exactement comme un musicien : une photo, une présentation, des liens, un
 * pourboire — avec en plus sa composition (`publicMembers`).
 */
export async function ficheGroupe(
  band: Band,
  artist?: ArtistProfile,
): Promise<ArtistProfile> {
  const adresseDe = resolveurAdresses((artist?.name ?? '').trim().toLowerCase());
  const vignette = porteMonnaie();
  const membres = await musiciensPublics(band, artist, adresseDe, vignette);
  return {
    name: (band.name ?? '').trim(),
    bio: band.bio ?? '',
    photo: await vignette(band.photo ?? '', MINI_GROUPE * 2),
    links: (band.links ?? []).filter((l) => (l.url ?? '') !== ''),
    tipUrl: band.tipUrl ?? '',
    publicMembers: membres,
  };
}

/**
 * Publie (ou rafraîchit) la fiche d'un groupe à son adresse.
 *
 * Best-effort de bout en bout : sans adresse il n'y a rien à publier, et la
 * politique RLS refuse tout net si je ne suis pas le détenteur — dans les
 * deux cas on s'en va sans bruit. Une fiche publique qui ne part pas ne doit
 * jamais empêcher d'enregistrer un profil ni de lancer un concert.
 */
export async function publierFicheGroupe(
  s: AuthSession,
  band: Band,
  artist?: ArtistProfile,
): Promise<void> {
  if (!publicPagesAvailable()) return;
  const cloudId = band.cloudId ?? '';
  if (cloudId === '' || band.owned !== true || band.hiddenFromPublic === true) {
    return;
  }
  try {
    if ((await fetchBandPageName(cloudId)) === '') return;
    await fetch(
      `${sbUrl()}/rest/v1/band_pages?band_id=eq.${encodeURIComponent(cloudId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: anon(),
          authorization: `Bearer ${s.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          profile: await ficheGroupe(band, artist),
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } catch {
    /* hors ligne : la fiche partira au prochain passage */
  }
}

/** Rafraîchit d'un coup les fiches de tous mes groupes publiés. */
export async function publierFichesGroupes(
  s: AuthSession,
  bands: Band[],
  artist?: ArtistProfile,
): Promise<void> {
  try {
    await Promise.all(bands.map((b) => publierFicheGroupe(s, b, artist)));
  } catch {
    /* jamais bloquant */
  }
}
