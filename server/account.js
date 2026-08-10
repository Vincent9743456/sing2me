/**
 * SUPPRIMER SON COMPTE — ET TOUT CE QU'IL CONTIENT (b261, demande de
 * Vincent : « c'est important pour les utilisateurs de pouvoir supprimer
 * toutes les données »).
 *
 * Un compte se crée en trois secondes depuis l'app ; il devait pouvoir s'en
 * effacer aussi. Deux points de méthode, parce qu'une suppression ratée est
 * pire qu'une suppression absente :
 *
 *  · L'APPELANT EST SON COMPTE, jamais un identifiant qu'il annonce. Le
 *    serveur lit le jeton (b192), en tire l'identifiant, et n'efface QUE ce
 *    qui porte cet identifiant. Un client qui demanderait la suppression de
 *    quelqu'un d'autre n'a aucun moyen de se faire entendre.
 *  · ON EFFACE AVANT DE FERMER LA PORTE. Le compte d'authentification est
 *    supprimé EN DERNIER : s'il partait d'abord, un échec au milieu
 *    laisserait des données orphelines que plus personne — pas même leur
 *    propriétaire — ne pourrait retrouver ni effacer.
 *
 * CE QUI PART AVEC LE COMPTE :
 *  · la bibliothèque en ligne (`user_library`) ;
 *  · la page publique et l'adresse réservée (`public_pages`) — l'adresse
 *    redevient libre ;
 *  · la fiche d'annuaire (`musician_directory`) : plus personne ne le trouve ;
 *  · les GROUPES qu'il a créés (`cloud_bands`), et par cascade leur
 *    répertoire, leurs discussions, leurs membres, leurs invitations et leur
 *    page publique. C'est la conséquence la plus lourde : elle est annoncée
 *    à l'écran, avec le nombre de groupes, AVANT de demander confirmation ;
 *  · ses adhésions aux groupes des AUTRES (`cloud_band_members`) : ces
 *    groupes continuent d'exister, sans lui ;
 *  · ses messages de groupe, ses invitations reçues et envoyées ;
 *  · ses directs et tout ce qu'ils ont produit (séances, morceaux joués,
 *    mots du public) ;
 *  · ses suiveurs, s'il avait une adresse publique.
 *
 * CE QUI NE PART PAS, et pourquoi : les copies personnelles que d'autres
 * musiciens ont faites de ses morceaux (elles sont à EUX, dans leur
 * bibliothèque), et la mesure anonyme des appels aux IA (`ai_usage`), qui ne
 * porte aucun identifiant — il n'y a rien à y retrouver.
 */
import { identifie } from './identity.js';

function sbUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function entetes() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, authorization: `Bearer ${key}`, prefer: 'return=minimal' };
}

/** DELETE sur une table, best-effort : on recense les échecs sans s'arrêter. */
async function efface(table, filtre, rates) {
  try {
    const r = await fetch(`${sbUrl()}/rest/v1/${table}?${filtre}`, {
      method: 'DELETE',
      headers: entetes(),
    });
    // 404 = la table n'existe pas sur cette base (schéma plus ancien) : ce
    // n'est pas un échec, il n'y a simplement rien à effacer.
    if (!r.ok && r.status !== 404) rates.push(`${table} (${r.status})`);
  } catch {
    rates.push(table);
  }
}

/** Ce que le compte possède, pour l'annoncer avant d'effacer. */
async function inventaire(uid) {
  const lire = async (chemin) => {
    try {
      const r = await fetch(`${sbUrl()}/rest/v1/${chemin}`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_KEY,
                   authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
      });
      if (!r.ok) return [];
      const rows = await r.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const [groupes, adresse, adhesions] = await Promise.all([
    lire(`cloud_bands?owner=eq.${uid}&select=id,name`),
    lire(`public_pages?user_id=eq.${uid}&select=name`),
    lire(`cloud_band_members?user_id=eq.${uid}&select=band_id`),
  ]);
  return {
    groupes: groupes.map((b) => b.name || ''),
    adresse: adresse[0]?.name ?? '',
    adhesions: adhesions.length,
  };
}

export default async function handler(req, res) {
  if (sbUrl() === '' || !process.env.SUPABASE_SERVICE_KEY) {
    res.status(503).json({ error: 'Suppression indisponible sur ce déploiement.' });
    return;
  }
  // L'appelant DOIT être un compte : la vieille clé partagée ne suffit pas
  // pour un acte irréversible qui ne concerne qu'une seule personne.
  const qui = await identifie(req);
  if (!qui.ok || !qui.user) {
    res.status(403).json({ error: 'Connecte-toi pour supprimer ton compte.' });
    return;
  }
  const uid = qui.user.id;

  // GET : ce que la suppression emportera. Sert à écrire un avertissement
  // exact plutôt qu'une formule vague.
  if (req.method === 'GET') {
    res.status(200).json(await inventaire(uid));
    return;
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const inv = await inventaire(uid);
  const rates = [];

  // 1. Les groupes que je possède : la cascade emporte répertoire,
  //    discussions, membres, invitations et page publique du groupe.
  await efface('cloud_bands', `owner=eq.${uid}`, rates);
  // 2. Mes adhésions aux groupes des autres (qui, eux, restent).
  await efface('cloud_band_members', `user_id=eq.${uid}`, rates);
  await efface('band_messages', `user_id=eq.${uid}`, rates);
  await efface('band_invites', `invited_user=eq.${uid}`, rates);
  await efface('band_invites', `invited_by=eq.${uid}`, rates);
  await efface('band_invite_links', `invited_by=eq.${uid}`, rates);
  // 3. Mes directs et ce qu'ils ont produit.
  await efface('live_messages', `owner_id=eq.${uid}`, rates);
  await efface('live_stats', `owner_id=eq.${uid}`, rates);
  await efface('live_sessions', `owner_id=eq.${uid}`, rates);
  await efface('lives', `owner_id=eq.${uid}`, rates);
  // 4. Mes suiveurs — ils suivaient une adresse qui n'existera plus.
  if (inv.adresse !== '') {
    await efface(
      'followers',
      `artist_name=eq.${encodeURIComponent(inv.adresse)}`,
      rates,
    );
  }
  // 5. Mon identité publique et ma bibliothèque.
  await efface('public_pages', `user_id=eq.${uid}`, rates);
  await efface('musician_directory', `user_id=eq.${uid}`, rates);
  await efface('user_library', `id=eq.${uid}`, rates);

  // 6. EN DERNIER : le compte lui-même. Si quelque chose a échoué avant, on
  //    ne le supprime PAS — sinon les restes deviendraient inatteignables,
  //    y compris pour une seconde tentative.
  if (rates.length > 0) {
    res.status(500).json({
      error:
        'Une partie de tes données n’a pas pu être effacée — ton compte est conservé. Réessaie dans un instant.',
      details: rates,
    });
    return;
  }
  try {
    const r = await fetch(`${sbUrl()}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!r.ok) {
      res.status(500).json({
        error:
          'Tes données ont été effacées, mais le compte n’a pas pu être fermé. Réessaie — il ne reste rien à perdre.',
      });
      return;
    }
  } catch {
    res.status(500).json({
      error:
        'Tes données ont été effacées, mais le compte n’a pas pu être fermé. Réessaie — il ne reste rien à perdre.',
    });
    return;
  }
  res.status(200).json({ ok: true, ...inv });
}
