/**
 * Fonction serveur Vercel : livre d'or du public.
 * POST /api/message {name?, text}  — public
 * GET  /api/message                — réservé à l'artiste (x-live-key)
 */

function sbHeaders(json) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const h = { apikey: key, authorization: `Bearer ${key}` };
  if (json) h['content-type'] = 'application/json';
  return h;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.status(501).json({ error: 'Mode ON AIR non configuré' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    if (req.method === 'POST') {
      const text = (req.body?.text ?? '').toString().trim().slice(0, 500);
      const author = (req.body?.name ?? '').toString().trim().slice(0, 60);
      if (text === '') {
        res.status(400).json({ error: 'Message vide' });
        return;
      }
      // Contexte : quel morceau était joué, par qui (best-effort).
      // Multi-live (b121) : le spectateur précise SON direct (liveId).
      const liveId = String(req.body?.liveId ?? '').slice(0, 60);
      let song_title = '';
      let performer = '';
      let concert_id = '';
      let concert_title = '';
      try {
        const url =
          liveId !== '' && liveId !== 'legacy'
            ? `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}&select=status,song,artist,concert&limit=1`
            : `${base}/rest/v1/live_state?id=eq.live&select=status,song,artist,concert`;
        const cur = await fetch(url, { headers: sbHeaders(false) });
        const rows = cur.ok ? await cur.json() : [];
        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (row) {
          if (row.status === 'on') song_title = row.song?.title ?? '';
          performer = row.artist?.name ?? '';
          concert_id = row.concert?.id ?? '';
          concert_title = row.concert?.title ?? '';
        }
      } catch {
        // sans contexte, le message part quand même
      }
      let r = await fetch(`${base}/rest/v1/live_messages`, {
        method: 'POST',
        headers: sbHeaders(true),
        body: JSON.stringify({
          author,
          body: text,
          song_title,
          performer,
          concert_id,
          concert_title,
          live_id: liveId !== '' && liveId !== 'legacy' ? liveId : null,
        }),
      });
      // Repli si les colonnes de contexte n'existent pas encore (migration
      // live.sql pas à jour) : on n'envoie que l'essentiel (auteur + message).
      if (r.status === 400) {
        r = await fetch(`${base}/rest/v1/live_messages`, {
          method: 'POST',
          headers: sbHeaders(true),
          body: JSON.stringify({ author, body: text }),
        });
      }
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      if (
        !process.env.LIVE_KEY ||
        req.headers['x-live-key'] !== process.env.LIVE_KEY
      ) {
        res.status(403).json({ error: 'Clé On Air incorrecte' });
        return;
      }
      const r = await fetch(
        `${base}/rest/v1/live_messages?select=author,body,song_title,performer,concert_id,concert_title,created_at&order=created_at.desc&limit=200`,
        { headers: sbHeaders(false) },
      );
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      res.status(200).json({ messages: await r.json() });
      return;
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
