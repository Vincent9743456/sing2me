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
