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
    // Statistiques de CET artiste (b138). La clé ON AIR est commune à
    // l'installation : sans filtre, chacun voyait la pile de tout le monde
    // — et ses propres morceaux pouvaient sortir des dernières lignes.
    // `performer.eq.` garde l'historique d'avant la colonne.
    // `performer` accepte PLUSIEURS noms séparés par des virgules (b139) :
    // l'artiste ET ses groupes, pour que chaque membre garde l'historique
    // des ❤ du groupe. Un seul appel — interroger nom par nom compterait
    // plusieurs fois l'historique non taggué.
    const who = String(req.query?.performer ?? '').slice(0, 600);
    const names = who
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n !== '')
      .slice(0, 20);
    const filter =
      names.length > 0
        ? `&or=(${names
            .map((n) => `performer.eq.${encodeURIComponent(n)}`)
            .join(',')},performer.eq.)`
        : '';
    // `performer` dit QUI jouait (soi, ou l'un de ses groupes) et
    // `setlist_name` quelle setlist tournait (b180) : c'est ce qui permet
    // à l'historique d'annoncer « Solo » ou « avec Zakoustiks ».
    const select =
      'song_title,song_artist,hearts,concert_id,concert_title,played_at,performer,setlist_name';
    let r = await fetch(
      `${base}/rest/v1/live_stats?select=${select}${filter}&order=played_at.desc&limit=500`,
      { headers: sbHeaders() },
    );
    // Colonnes pas encore créées (SQL non rejoué) : on retombe sur des
    // lectures de plus en plus pauvres plutôt que de ne rien renvoyer.
    const replis = [
      `select=song_title,song_artist,hearts,concert_id,concert_title,played_at,performer&order=played_at.desc&limit=500`,
      `select=song_title,song_artist,hearts,played_at&order=played_at.desc&limit=500`,
    ];
    if (!r.ok && filter !== '') {
      r = await fetch(
        `${base}/rest/v1/live_stats?select=${select}&order=played_at.desc&limit=500`,
        { headers: sbHeaders() },
      );
    }
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
    // Les LIVES eux-mêmes (b182) : une ligne par appui sur GO LIVE, avec son
    // début, sa fin (updated_at à la clôture), qui jouait et quelle setlist.
    // C'est la seule borne exacte d'un concert — le reste se déduisait.
    let lives = [];
    try {
      const l = await fetch(
        `${base}/rest/v1/lives?select=id,artist,band_id,started_by,setlist_name,started_at,updated_at,status,session_id&order=started_at.desc.nullslast&limit=100`,
        { headers: sbHeaders() },
      );
      if (l.ok) lives = await l.json();
    } catch {
      /* historique best-effort */
    }
    res.status(200).json({
      stats,
      sessions: Array.isArray(sessions) ? sessions : [],
      lives: Array.isArray(lives) ? lives : [],
    });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
