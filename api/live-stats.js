/**
 * Fonction serveur Vercel : statistiques des directs (réservé à l'artiste).
 * GET /api/live-stats — en-tête requis : x-live-key = LIVE_KEY
 */

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
    if (req.headers['x-live-key'] !== process.env.LIVE_KEY) {
      res.status(403).json({ error: 'Clé On Air incorrecte' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const r = await fetch(
      `${base}/rest/v1/live_stats?select=song_title,song_artist,hearts,concert_id,concert_title,played_at&order=played_at.desc&limit=200`,
      { headers: sbHeaders() },
    );
    if (!r.ok) {
      res.status(502).json({ error: `Supabase a répondu ${r.status}` });
      return;
    }
    const stats = await r.json();
    // Sessions ON AIR (chantier 2 — audience) : uniques + dates. Best-effort :
    // si la table n'existe pas encore (SQL pas exécuté), on renvoie [].
    let sessions = [];
    try {
      const s = await fetch(
        `${base}/rest/v1/live_sessions?select=id,artist_name,started_at,ended_at,uniques&order=started_at.desc&limit=100`,
        { headers: sbHeaders() },
      );
      if (s.ok) sessions = await s.json();
    } catch {
      /* audience best-effort */
    }
    res.status(200).json({ stats, sessions: Array.isArray(sessions) ? sessions : [] });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
