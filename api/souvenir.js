/**
 * Fonction serveur Vercel — « Setlist souvenir » (fanbase V1, chantier 6).
 *
 * GET /api/souvenir
 *   → la liste des morceaux du DERNIER concert terminé (titres + artistes
 *     seulement, AUCUNE parole — cohérent avec la purge défensive). Le
 *     spectateur qui était là peut ainsi retrouver « c'était quoi le 3ᵉ ? ».
 *
 * Public (lecture) et best-effort. Source : live_sessions (dernière session
 * clôturée) + live_stats (morceaux archivés de cette session).
 */

function configured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
}
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
    if (!configured()) {
      res.status(200).json({ session: null, songs: [] });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    // Dernière session terminée.
    const s = await fetch(
      `${base}/rest/v1/live_sessions?ended_at=not.is.null&select=id,artist_name,started_at,ended_at&order=ended_at.desc&limit=1`,
      { headers: sbHeaders() },
    );
    const sessions = s.ok ? await s.json() : [];
    const session = Array.isArray(sessions) && sessions[0] ? sessions[0] : null;
    if (!session) {
      res.status(200).json({ session: null, songs: [] });
      return;
    }
    // Morceaux de cette session (titres/artistes seuls — jamais les paroles).
    const st = await fetch(
      `${base}/rest/v1/live_stats?session_id=eq.${session.id}&select=song_title,song_artist,hearts,played_at&order=played_at.asc`,
      { headers: sbHeaders() },
    );
    const rows = st.ok ? await st.json() : [];
    const songs = Array.isArray(rows)
      ? rows.map((r) => ({
          title: r.song_title ?? '',
          artist: r.song_artist ?? '',
          hearts: r.hearts ?? 0,
        }))
      : [];
    res.status(200).json({
      session: {
        artist: session.artist_name ?? '',
        started_at: session.started_at ?? null,
        ended_at: session.ended_at ?? null,
      },
      songs,
    });
  } catch {
    res.status(200).json({ session: null, songs: [] });
  }
}
