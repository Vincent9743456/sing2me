/**
 * Fonction serveur Vercel : statistiques des directs (réservé à l'artiste).
 * GET /api/live-stats — en-tête requis : x-live-key = LIVE_KEY
 */

import { identifie, refuse } from './identity.js';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, authorization: `Bearer ${key}` };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Méthode non autorisée' });
      return;
    }
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_KEY ||
      !process.env.LIVE_KEY
    ) {
      res.status(501).json({ error: 'Mode ON AIR non configuré' });
      return;
    }
    // b192 : le COMPTE identifie l'appelant ; l'ancienne clé reste acceptée
    // le temps que les applications installées se mettent à jour.
    const qui = await identifie(req);
    if (!qui.ok) {
      refuse(res);
      return;
    }
    const moi = qui.user?.id ?? '';
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    /*
     * À QUI APPARTIENT UN LIVE (b188) — la question posée par Vincent, et
     * elle a une réponse simple : un live est SOLO (celui qui l'a lancé) ou
     * DE GROUPE (tous ses membres). La table `lives` porte déjà `band_id` et
     * `started_by` ; il suffisait de s'en servir.
     *
     * Jusqu'ici on triait les morceaux archivés sur le NOM affiché
     * (`performer`), en acceptant le nom vide « pour ne rien perdre ». Deux
     * musiciens de la même installation se mélangeaient donc dès qu'un
     * profil n'était pas rempli. Désormais :
     *   1. on établit la liste des lives QUI SONT LES MIENS ;
     *   2. on ne renvoie que les morceaux et les mots de CES lives.
     * Le nom ne sert plus que pour les archives d'avant les séances.
     */
    const names = String(req.query?.performer ?? '')
      .slice(0, 600)
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n !== '')
      .slice(0, 20);
    // cloudId des groupes dont je suis membre (le client les connaît).
    const mesGroupes = new Set(
      String(req.query?.bands ?? '')
        .slice(0, 900)
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c !== '')
        .slice(0, 30),
    );
    const norm = (v) => String(v ?? '').trim().toLowerCase();
    const mesNoms = new Set(names.map(norm));

    // Les LIVES eux-mêmes (b182) : une ligne par appui sur GO LIVE, avec son
    // début, sa fin (updated_at à la clôture), qui jouait et quelle setlist.
    let lives = [];
    try {
      let l = await fetch(
        `${base}/rest/v1/lives?select=id,artist,band_id,started_by,owner_id,setlist_name,started_at,updated_at,status,session_id&order=started_at.desc.nullslast&limit=200`,
        { headers: sbHeaders() },
      );
      if (!l.ok) {
        // Colonne b192 pas encore créée (SQL non rejoué) : sans elle.
        l = await fetch(
          `${base}/rest/v1/lives?select=id,artist,band_id,started_by,setlist_name,started_at,updated_at,status,session_id&order=started_at.desc.nullslast&limit=200`,
          { headers: sbHeaders() },
        );
      }
      if (l.ok) lives = await l.json();
    } catch {
      /* historique best-effort */
    }
    if (!Array.isArray(lives)) lives = [];
    /** Ce live est-il le mien ? Même règle que dans l'app (pastlives.ts). */
    const monLive = (r) => {
      // Le propriétaire du live (b192) tranche avant tout le reste : c'est
      // un identifiant de compte, il ne change jamais. Les noms ne servent
      // plus qu'aux lignes d'avant.
      const proprio = String(r?.owner_id ?? '').trim();
      if (proprio !== '' && moi !== '') return proprio === moi;
      const bid = String(r?.band_id ?? '').trim();
      if (bid !== '') return mesGroupes.has(bid); // live de groupe → ses membres
      const par = norm(r?.started_by);
      if (par !== '') return mesNoms.has(par); // solo → celui qui l'a lancé
      const nom = norm(r?.artist?.name);
      return nom !== '' && mesNoms.has(nom); // vieux live sans lanceur
    };
    // Aucune identité d'aucune sorte (ni compte, ni nom) : on ne peut rien
    // trier — c'est le cas d'un très vieux bundle. Sinon on filtre TOUJOURS.
    const anonyme = moi === '' && mesNoms.size === 0;
    const miens = anonyme ? lives : lives.filter(monLive);
    const mesSessions = new Set(
      miens.map((r) => String(r.session_id ?? '').trim()).filter((x) => x !== ''),
    );
    const mesLives = new Set(miens.map((r) => String(r.id ?? '')));

    // `performer` dit QUI jouait, `setlist_name` quelle setlist tournait
    // (b180), `session_id` à quel live le morceau appartient (b186).
    const select =
      'song_title,song_artist,hearts,concert_id,concert_title,played_at,performer,setlist_name,session_id';
    let r = await fetch(
      `${base}/rest/v1/live_stats?select=${select}&order=played_at.desc&limit=800`,
      { headers: sbHeaders() },
    );
    // Colonnes pas encore créées (SQL non rejoué) : on retombe sur des
    // lectures de plus en plus pauvres plutôt que de ne rien renvoyer.
    const replis = [
      `select=song_title,song_artist,hearts,concert_id,concert_title,played_at,performer,session_id&order=played_at.desc&limit=800`,
      `select=song_title,song_artist,hearts,concert_id,concert_title,played_at,performer&order=played_at.desc&limit=800`,
      `select=song_title,song_artist,hearts,played_at&order=played_at.desc&limit=800`,
      // Dernier repli : tout ce que la table a (b195). Voir server/message.js
      // — une cascade de replis qui nomment tous les mêmes colonnes ne
      // protège de rien le jour où l'une d'elles manque.
      `select=*&order=played_at.desc&limit=800`,
    ];
    for (const q of replis) {
      if (r.ok) break;
      r = await fetch(`${base}/rest/v1/live_stats?${q}`, {
        headers: sbHeaders(),
      });
    }
    if (!r.ok) {
      res.status(502).json({ error: `Supabase a répondu ${r.status}` });
      return;
    }
    const toutes = await r.json();
    // Un morceau MARQUÉ appartient à sa séance, un point. Un morceau sans
    // séance (archives d'avant) retombe sur le nom, nom vide compris — c'est
    // le seul repère qu'il ait jamais eu.
    const stats = (Array.isArray(toutes) ? toutes : []).filter((x) => {
      const sid = String(x.session_id ?? '').trim();
      if (sid !== '') {
        if (mesSessions.has(sid)) return true;
        // Séance sans live enregistré : on retombe sur le nom, sinon les
        // morceaux d'un vieux direct disparaîtraient de l'historique.
        if (anonyme) return true;
        const p0 = norm(x.performer);
        return p0 !== '' && mesNoms.has(p0);
      }
      if (anonyme) return true;
      const p = norm(x.performer);
      return p === '' || mesNoms.has(p);
    });

    // Sessions ON AIR (chantier 2 — audience) : uniques + dates. Best-effort :
    // si la table n'existe pas encore (SQL pas exécuté), on renvoie [].
    let sessions = [];
    try {
      const s = await fetch(
        `${base}/rest/v1/live_sessions?select=id,artist_name,started_at,ended_at,uniques&order=started_at.desc&limit=200`,
        { headers: sbHeaders() },
      );
      if (s.ok) sessions = await s.json();
    } catch {
      /* audience best-effort */
    }
    if (!Array.isArray(sessions)) sessions = [];

    res.status(200).json({
      stats,
      // Une séance m'appartient si elle porte l'un de MES lives, ou si elle
      // est à mon nom (archives d'avant les lives enregistrés).
      sessions: sessions.filter(
        (se) =>
          anonyme ||
          mesSessions.has(String(se.id ?? '')) ||
          (mesNoms.size > 0 && mesNoms.has(norm(se.artist_name))),
      ),
      lives: miens,
      // De quoi trier les MOTS du public côté app : eux aussi appartiennent
      // à un live, jamais à une heure.
      liveIds: [...mesLives],
    });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
