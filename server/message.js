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
      let setlist_name = '';
      let performer = '';
      let concert_id = '';
      let concert_title = '';
      try {
        const url =
          liveId !== '' && liveId !== 'legacy'
            ? `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}&select=status,song,artist,concert,setlist_name&limit=1`
            : `${base}/rest/v1/live_state?id=eq.live&select=status,song,artist,concert`;
        const cur = await fetch(url, { headers: sbHeaders(false) });
        const rows = cur.ok ? await cur.json() : [];
        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (row) {
          if (row.status === 'on') song_title = row.song?.title ?? '';
          setlist_name = row.setlist_name ?? '';
          performer = row.artist?.name ?? '';
          concert_id = row.concert?.id ?? '';
          concert_title = row.concert?.title ?? '';
        }
      } catch {
        // sans contexte, le message part quand même
      }
      // Le titre du morceau vient du direct ; à défaut (direct hérité,
      // lecture impossible) on retient celui que la page publique affichait
      // — un message doit TOUJOURS pouvoir se rattacher à sa chanson.
      if (song_title === '') {
        song_title = (req.body?.songTitle ?? '').toString().trim().slice(0, 200);
      }
      // Insertion en CASCADE : chaque essai retire les colonnes que la base
      // n'a peut-être pas encore (migrations live.sql pas rejouées). Le
      // dernier essai n'utilise que author + body, présents depuis le
      // premier jour. Un message ne doit jamais être perdu pour une colonne.
      const attempts = [
        {
          author,
          body: text,
          song_title,
          setlist_name,
          performer,
          concert_id,
          concert_title,
          live_id: liveId !== '' && liveId !== 'legacy' ? liveId : null,
        },
        { author, body: text, song_title, setlist_name, performer },
        { author, body: text, song_title, performer },
        { author, body: text, song_title },
        { author, body: text },
      ];
      let r = null;
      for (const payload of attempts) {
        r = await fetch(`${base}/rest/v1/live_messages`, {
          method: 'POST',
          headers: sbHeaders(true),
          body: JSON.stringify(payload),
        });
        if (r.ok) break;
        // 400/422 = colonne inconnue ou type invalide → on retente plus
        // pauvre. Toute autre erreur (404 table absente, 401…) est
        // définitive : inutile d'insister.
        if (r.status !== 400 && r.status !== 422) break;
      }
      if (!r || !r.ok) {
        // `unavailable` : le livre d'or n'est pas exploitable sur cette
        // installation (table absente, droits) — la page publique masque
        // alors la boîte au lieu d'afficher une erreur au spectateur.
        const status = r ? r.status : 0;
        const unavailable = status === 404 || status === 401 || status === 403;
        res.status(unavailable ? 200 : 502).json({
          error: `Le livre d'or est indisponible (${status}).`,
          code: unavailable ? 'unavailable' : 'failed',
        });
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
      // Même prudence en lecture : si les colonnes de contexte manquent,
      // l'artiste doit quand même voir les mots de son public.
      const selects = [
        'author,body,song_title,setlist_name,performer,concert_id,concert_title,created_at',
        'author,body,song_title,performer,concert_id,concert_title,created_at',
        'author,body,song_title,performer,created_at',
        'author,body,song_title,created_at',
        'author,body,created_at',
      ];
      let r = null;
      for (const sel of selects) {
        r = await fetch(
          `${base}/rest/v1/live_messages?select=${sel}&order=created_at.desc&limit=200`,
          { headers: sbHeaders(false) },
        );
        if (r.ok) break;
        if (r.status !== 400 && r.status !== 422) break;
      }
      if (!r || !r.ok) {
        // Livre d'or absent : liste vide plutôt qu'une erreur qui casse
        // l'écran de statistiques de l'artiste.
        res.status(200).json({ messages: [] });
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
