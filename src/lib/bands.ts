/**
 * Groupes réels entre comptes (étape 2) : publication d'un groupe dans le
 * cloud, invitation par jeton, adhésion en un clic, liste des membres
 * vérifiés. Nécessite d'être connecté (voir auth.ts) et supabase/bands.sql.
 */
import { AuthSession, getValidSession, sbAuthed } from './auth';

export interface CloudBandRef {
  cloudId: string;
  token: string;
}

/**
 * Invitation en attente : mémorisée quand un destinataire pas encore
 * connecté choisit de rejoindre un groupe. Après création de son compte
 * (lien magique par email), l'adhésion se termine automatiquement.
 */
export interface LinkInvite {
  cloudId: string;
  token: string;
  band: string;
}
const PENDING_KEY = 'sing2me/pendingInvite';

/**
 * Une invitation vient d'être mise en attente (b252). L'adhésion
 * automatique était accrochée au CHANGEMENT de compte : elle ne partait donc
 * que pour un compte NEUF. Quelqu'un qui en avait déjà un déposait son
 * invitation… et rien ne se passait jamais — « j'ai accepté une invitation
 * mais je ne vois pas le groupe » (Vincent). Cet événement réveille
 * l'adhésion, session inchangée ou non.
 */
export const INVITE_EVENT = 'mojosong:invitation';

export function savePendingInvite(inv: LinkInvite): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(inv));
  } catch {
    // stockage indisponible : l'invité pourra rejoindre manuellement
  }
  try {
    window.dispatchEvent(new Event(INVITE_EVENT));
  } catch {
    // pas de fenêtre (test) : l'adhésion partira au prochain lancement
  }
}

export function peekPendingInvite(): LinkInvite | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LinkInvite;
    return p && p.cloudId && p.token ? p : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // rien à faire
  }
}

export interface CloudMember {
  user_id: string;
  name: string;
  instrument: string;
  joined_at: string;
  /** Photo de profil du membre (si l'annuaire cloud la fournit) */
  photo?: string;
}

/**
 * Publie le groupe dans le cloud (ou retrouve sa publication existante)
 * et renvoie l'identifiant + le jeton d'invitation.
 */
export async function ensureCloudBand(
  s: AuthSession,
  localId: string,
  name: string,
): Promise<CloudBandRef> {
  const found = await sbAuthed(
    s,
    `/rest/v1/cloud_bands?local_id=eq.${encodeURIComponent(localId)}&select=id,invite_token,name`,
  );
  if (!found.ok) throw new Error(`Supabase a répondu ${found.status}`);
  const rows = (await found.json()) as {
    id: string;
    invite_token: string;
    name: string;
  }[];
  if (rows[0]) {
    if (rows[0].name !== name) {
      // Nom mis à jour depuis la dernière invitation
      await sbAuthed(s, `/rest/v1/cloud_bands?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }).catch(() => undefined);
    }
    return { cloudId: rows[0].id, token: rows[0].invite_token };
  }
  const token = crypto.randomUUID().replace(/-/g, '');
  const created = await sbAuthed(s, '/rest/v1/cloud_bands', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      owner: s.userId,
      local_id: localId,
      name,
      invite_token: token,
    }),
  });
  if (!created.ok) throw new Error(`Supabase a répondu ${created.status}`);
  const row = ((await created.json()) as { id: string }[])[0];
  return { cloudId: row.id, token };
}

/**
 * UNE INVITATION PAR LIEN EST NOMINATIVE ET À USAGE UNIQUE (b251, demande de
 * Vincent : « il faut que cette invitation soit nominative et que personne
 * d'autre ne puisse utiliser ce lien »).
 *
 * Le lien portait jusqu'ici le jeton DU GROUPE — un seul, permanent,
 * réutilisable à l'infini par quiconque le recevait. On crée maintenant une
 * invitation par personne : elle porte son nom, expire, et se referme sur le
 * premier compte qui l'utilise.
 *
 * Pas de repli si l'appel échoue : produire quand même un lien ouvert
 * reviendrait à contourner en silence la règle demandée.
 */
export async function createBandInvite(
  s: AuthSession,
  cloudId: string,
  name: string,
): Promise<string> {
  const res = await sbAuthed(s, '/rest/v1/rpc/create_band_invite', {
    method: 'POST',
    body: JSON.stringify({ p_band: cloudId, p_name: name }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const body = (await res.json()) as { token?: string; error?: string };
  if (body.error) throw new Error(body.error);
  if (!body.token) throw new Error('Invitation non créée');
  return body.token;
}

/**
 * Annule une invitation EN ATTENTE (b307) — côté serveur, pas seulement en
 * local. Une seule fonction pour les deux chemins : par annuaire (compte
 * connu → `p_user`) et/ou par lien nominatif (→ `p_name`). Best-effort côté
 * appelant : l'annulation locale ne doit pas dépendre du réseau.
 */
export async function cancelBandInvite(
  s: AuthSession,
  cloudId: string,
  userId: string,
  name: string,
): Promise<void> {
  const res = await sbAuthed(s, '/rest/v1/rpc/cancel_band_invite', {
    method: 'POST',
    body: JSON.stringify({
      p_band: cloudId,
      p_user: userId.trim() !== '' ? userId : null,
      p_name: name,
    }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (body.error) throw new Error(body.error);
}

/** Rejoint un groupe via le jeton de l'invitation. */
export async function joinBand(
  s: AuthSession,
  cloudId: string,
  token: string,
  name: string,
  instrument: string,
): Promise<string> {
  const res = await sbAuthed(s, '/rest/v1/rpc/join_band', {
    method: 'POST',
    body: JSON.stringify({
      p_band: cloudId,
      p_token: token,
      p_name: name,
      p_instrument: instrument,
    }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const body = (await res.json()) as {
    ok?: boolean;
    band?: string;
    error?: string;
  };
  if (body.error) throw new Error(body.error);
  return body.band ?? '';
}

/** Le créateur d'un groupe (b213). */
export interface BandOwner {
  userId: string;
  name: string;
  photo: string;
}

/**
 * Qui possède ce groupe ? Visible de tous ses membres. Best-effort :
 * `null` si le serveur est injoignable ou la fonction pas encore
 * installée — l'écran retombe alors sur ce qu'il sait en local.
 */
export async function fetchBandOwner(
  s: AuthSession,
  cloudId: string,
): Promise<BandOwner | null> {
  try {
    const res = await sbAuthed(s, '/rest/v1/rpc/band_owner', {
      method: 'POST',
      body: JSON.stringify({ p_band: cloudId }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as {
      user_id: string;
      name: string;
      photo: string;
    }[];
    const r = Array.isArray(rows) ? rows[0] : undefined;
    return r
      ? { userId: r.user_id, name: r.name ?? '', photo: r.photo ?? '' }
      : null;
  } catch {
    return null;
  }
}

/**
 * Transmet le groupe à l'un de ses membres (b213). Le serveur vérifie que
 * l'appelant en est bien le créateur et que la cible est membre ; l'ancien
 * créateur reste dans le groupe comme musicien ordinaire.
 */
export async function transferBand(
  s: AuthSession,
  cloudId: string,
  userId: string,
): Promise<void> {
  const res = await sbAuthed(s, '/rest/v1/rpc/transfer_band', {
    method: 'POST',
    body: JSON.stringify({ p_band: cloudId, p_user: userId }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (body.error) throw new Error(body.error);
}

/** Membres réels du groupe (créateur ou membre uniquement). */
export async function fetchBandMembers(
  s: AuthSession,
  cloudId: string,
): Promise<CloudMember[]> {
  const res = await sbAuthed(s, '/rest/v1/rpc/band_members', {
    method: 'POST',
    body: JSON.stringify({ p_band: cloudId }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const rows = (await res.json()) as CloudMember[];
  return Array.isArray(rows) ? rows : [];
}

/** Bibliothèque partagée du groupe : lecture. */
export async function pullBandLibrary(
  s: AuthSession,
  cloudId: string,
): Promise<unknown | null> {
  const res = await sbAuthed(
    s,
    `/rest/v1/band_library?band_id=eq.${cloudId}&select=data`,
  );
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const rows = (await res.json()) as { data: unknown }[];
  return Array.isArray(rows) && rows[0] ? rows[0].data : null;
}

/** Bibliothèque partagée du groupe : écriture (upsert). */
export async function pushBandLibrary(
  s: AuthSession,
  cloudId: string,
  data: unknown,
): Promise<void> {
  const res = await sbAuthed(s, '/rest/v1/band_library', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      band_id: cloudId,
      data,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
}

/* ------------------------------------------------------------------ */
/* Espace du groupe : fil de discussion entre membres                  */
/* ------------------------------------------------------------------ */

export type BandMessageKind = 'message' | 'chanson' | 'repet' | 'concert';

export interface BandMessage {
  id: string;
  user_id: string;
  author: string;
  kind: BandMessageKind;
  text: string;
  created_at: string;
}

/** Fil du groupe (les 200 derniers messages, du plus ancien au plus récent). */
export async function fetchBandMessages(
  s: AuthSession,
  cloudId: string,
): Promise<BandMessage[]> {
  const res = await sbAuthed(
    s,
    `/rest/v1/band_messages?band_id=eq.${cloudId}` +
      `&select=id,user_id,author,kind,text,created_at` +
      `&order=created_at.desc&limit=200`,
  );
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const rows = (await res.json()) as BandMessage[];
  return Array.isArray(rows) ? rows.reverse() : [];
}

export async function postBandMessage(
  s: AuthSession,
  cloudId: string,
  msg: { author: string; kind: BandMessageKind; text: string },
): Promise<void> {
  const res = await sbAuthed(s, '/rest/v1/band_messages', {
    method: 'POST',
    body: JSON.stringify({
      band_id: cloudId,
      user_id: s.userId,
      author: msg.author,
      kind: msg.kind,
      text: msg.text,
    }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
}

/**
 * Annonce best-effort, dans le chat du groupe, qu'une chanson vient de
 * rejoindre son répertoire (bascule « sur un groupe » depuis la bibliothèque
 * ou la fiche chanson). Ne fait rien si le groupe n'est pas publié dans le
 * cloud (groupe purement local : personne à prévenir) ou si l'utilisateur
 * n'est pas connecté — l'association locale, elle, reste faite.
 */
export async function announceBandSong(
  cloudId: string | undefined,
  author: string,
  title: string,
  artist: string,
): Promise<void> {
  if (cloudId == null || cloudId === '') return;
  try {
    const s = await getValidSession();
    if (!s) return;
    await postBandMessage(s, cloudId, {
      author,
      kind: 'chanson',
      text: `${title || '(sans titre)'}${artist !== '' ? ` — ${artist}` : ''}`,
    });
  } catch {
    // best-effort : la chanson reste associée localement
  }
}

/** Supprime un message (auteur, ou créateur du groupe — RLS). */
export async function deleteBandMessage(
  s: AuthSession,
  messageId: string,
): Promise<void> {
  const res = await sbAuthed(s, `/rest/v1/band_messages?id=eq.${messageId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
}

/* ------------------------------------------------------------------ */
/* Annuaire des musiciens + invitations avec acceptation (directory.sql) */
/* ------------------------------------------------------------------ */

export interface DirectoryPerson {
  user_id: string;
  name: string;
  photo: string;
  instrument: string;
}

export interface PendingInvite {
  id: string;
  band_id: string;
  band_name: string;
  from_name: string;
  created_at: string;
}

/** Publie/actualise sa fiche d'annuaire (pour être trouvable). Best-effort. */
export async function upsertProfile(
  s: AuthSession,
  name: string,
  photo: string,
  instrument: string,
): Promise<void> {
  const res = await sbAuthed(s, '/rest/v1/rpc/upsert_profile', {
    method: 'POST',
    body: JSON.stringify({
      p_name: name,
      p_photo: photo,
      p_instrument: instrument,
    }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
}

/** Recherche un musicien dans l'annuaire (par nom). */
export async function searchProfiles(
  s: AuthSession,
  query: string,
): Promise<DirectoryPerson[]> {
  const res = await sbAuthed(s, '/rest/v1/rpc/search_profiles', {
    method: 'POST',
    body: JSON.stringify({ p_query: query }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const rows = (await res.json()) as DirectoryPerson[];
  return Array.isArray(rows) ? rows : [];
}

/** Invite un musicien de l'annuaire dans un groupe (il devra accepter). */
export async function inviteToBand(
  s: AuthSession,
  cloudId: string,
  userId: string,
): Promise<void> {
  const res = await sbAuthed(s, '/rest/v1/rpc/invite_to_band', {
    method: 'POST',
    body: JSON.stringify({ p_band: cloudId, p_user: userId }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (body.error) throw new Error(body.error);
}

/**
 * Quitte un groupe côté SERVEUR (b140). Sans cela, réinitialiser son
 * application laissait un membre fantôme chez le créateur — qui ne
 * pouvait alors plus le réinviter. Best-effort : un échec réseau ne
 * bloque jamais la réinitialisation locale.
 */
export async function leaveBand(
  s: AuthSession,
  cloudId: string,
): Promise<void> {
  try {
    await sbAuthed(s, '/rest/v1/rpc/leave_band', {
      method: 'POST',
      body: JSON.stringify({ p_band: cloudId }),
    });
  } catch {
    /* silencieux */
  }
}

/** Un musicien qui a quitté un de MES groupes (b142). */
export interface BandDeparture {
  bandId: string;
  bandName: string;
  userId: string;
  name: string;
  at: string;
}

/** Clé locale d'un départ (pour l'écarter d'un geste). */
export function departureKey(d: { bandId: string; userId: string }): string {
  return `${d.bandId}|${d.userId}`;
}

/**
 * Les départs qu'on MONTRE vraiment (b212 — signalement de Marco). Trois
 * conditions, et un départ qui n'en remplit pas une n'appelle aucune
 * action de ma part :
 *
 *  1. **jamais moi-même.** Réinitialiser son application appelle
 *     `leaveBand` sur TOUS ses groupes, y compris ceux qu'on a créés :
 *     Marco s'est retrouvé invité à se réinviter lui-même ;
 *  2. **jamais un groupe que je n'ai plus.** La réinitialisation efface
 *     aussi mes groupes en local ; proposer de réinviter quelqu'un dans un
 *     groupe absent de mon application n'a aucun sens ;
 *  3. **jamais un départ que j'ai écarté** (`prefs.hiddenDepartures`) —
 *     une bannière sans sortie est une impasse.
 */
export function departuresToShow(
  list: BandDeparture[],
  opts: { myUserId: string; myCloudIds: string[]; hidden?: string[] },
): BandDeparture[] {
  const miens = new Set(opts.myCloudIds.filter((x) => x !== ''));
  const ecartes = new Set(opts.hidden ?? []);
  return list.filter(
    (d) =>
      d.userId !== '' &&
      d.userId !== opts.myUserId &&
      miens.has(d.bandId) &&
      !ecartes.has(departureKey(d)),
  );
}

/**
 * Départs à traiter dans mes groupes (b142) : le plus souvent un
 * musicien qui a réinitialisé son application et n'a donc plus le
 * groupe. Le réinviter fait disparaître la ligne. Best-effort : [] si
 * le serveur est injoignable ou la fonction pas encore installée.
 * À filtrer par `departuresToShow` avant tout affichage.
 */
export async function fetchBandDepartures(
  s: AuthSession,
): Promise<BandDeparture[]> {
  try {
    const res = await sbAuthed(s, '/rest/v1/rpc/my_band_departures', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as {
      band_id: string;
      band_name: string;
      user_id: string;
      name: string;
      at: string;
    }[];
    return Array.isArray(rows)
      ? rows.map((r) => ({
          bandId: r.band_id,
          bandName: r.band_name ?? '',
          userId: r.user_id,
          name: r.name ?? '',
          at: r.at ?? '',
        }))
      : [];
  } catch {
    return [];
  }
}

/** Mes invitations de groupe en attente (best-effort : [] si indisponible). */
export async function fetchMyInvites(
  s: AuthSession,
): Promise<PendingInvite[]> {
  try {
    const res = await sbAuthed(s, '/rest/v1/rpc/my_invites', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as PendingInvite[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Répond à une invitation : accepter (= rejoindre) ou refuser. */
export async function respondInvite(
  s: AuthSession,
  inviteId: string,
  accept: boolean,
  name: string,
  instrument: string,
): Promise<{ band?: string; name?: string }> {
  const res = await sbAuthed(s, '/rest/v1/rpc/respond_invite', {
    method: 'POST',
    body: JSON.stringify({
      p_invite: inviteId,
      p_accept: accept,
      p_name: name,
      p_instrument: instrument,
    }),
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    band?: string;
    name?: string;
  };
  if (body.error) throw new Error(body.error);
  return { band: body.band, name: body.name };
}

/** Retire un membre (créateur) ou quitte le groupe (membre). */
export async function removeBandMember(
  s: AuthSession,
  cloudId: string,
  userId: string,
): Promise<void> {
  const res = await sbAuthed(
    s,
    `/rest/v1/cloud_band_members?band_id=eq.${cloudId}&user_id=eq.${userId}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
}

/**
 * Dissout le groupe côté cloud (suppression de la ligne cloud_bands). La RLS
 * n'autorise que le PROPRIÉTAIRE : pour un simple membre, la requête ne
 * supprime rien (sans erreur). La cascade retire membres, répertoire et
 * messages — chaque membre garde ses copies personnelles des morceaux.
 * Les membres détectent la disparition à leur prochaine synchro (le groupe
 * est alors retiré de leur app, avec une notification).
 */
export async function deleteCloudBand(
  s: AuthSession,
  cloudId: string,
): Promise<void> {
  const res = await sbAuthed(s, `/rest/v1/cloud_bands?id=eq.${cloudId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
}

/**
 * Nettoie les groupes cloud ORPHELINS : ceux dont je suis propriétaire mais
 * qui n'existent plus dans mon app (supprimés localement, éventuellement avant
 * que la suppression cloud n'existe). Les membres les verront alors disparaître
 * à leur tour. Sûr : `localBands` vient de l'état déjà fusionné avec le cloud,
 * donc un groupe absent est un groupe réellement supprimé. Best-effort.
 */
export async function cleanupOrphanCloudBands(
  s: AuthSession,
  localBands: { cloudId?: string }[],
): Promise<void> {
  try {
    const res = await sbAuthed(
      s,
      `/rest/v1/cloud_bands?owner=eq.${s.userId}&select=id`,
    );
    if (!res.ok) return;
    const rows = (await res.json()) as { id: string }[];
    const alive = new Set(
      localBands.map((b) => b.cloudId).filter((x): x is string => !!x),
    );
    for (const row of rows) {
      if (!alive.has(row.id)) {
        await deleteCloudBand(s, row.id).catch(() => undefined);
      }
    }
  } catch {
    // best-effort : réessayé à la prochaine synchro
  }
}
