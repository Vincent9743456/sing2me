/**
 * Fonction serveur Vercel : état du mode ON AIR (direct).
 *
 * GET  /api/live            → état public {status, song, artist, updatedAt}
 * POST /api/live            → mise à jour (réservé à l'artiste)
 *      en-tête requis : x-live-key = LIVE_KEY
 *
 * Variables d'environnement Vercel requises :
 *  - SUPABASE_URL          (ex. https://xxxx.supabase.co)
 *  - SUPABASE_SERVICE_KEY  (clé "service_role" du projet Supabase)
 *  - LIVE_KEY              (secret choisi par l'artiste, aussi saisi dans l'app)
 * Et exécuter supabase/live.sql dans le projet Supabase.
 */

function configured() {
  return (
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_KEY &&
    !!process.env.LIVE_KEY
  );
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (!configured()) {
      res.status(501).json({
        error:
          "Le mode ON AIR n'est pas configuré : ajoute SUPABASE_URL, " +
          'SUPABASE_SERVICE_KEY et LIVE_KEY dans Vercel, exécute ' +
          'supabase/live.sql dans Supabase, puis redéploie.',
      });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    if (req.method === 'GET') {
      // Récupération à la demande de la setlist complète (parcours public).
      if (req.query?.setlist === '1' || req.query?.setlist === 'true') {
        const r = await fetch(
          `${base}/rest/v1/live_state?id=eq.live&select=status,mode,setlist`,
          { headers: sbHeaders() },
        );
        if (!r.ok) {
          res.status(502).json({ error: `Supabase a répondu ${r.status}` });
          return;
        }
        const rows = await r.json();
        const row = Array.isArray(rows) && rows[0] ? rows[0] : {};
        // La setlist n'est visible que pendant un concert actif.
        const visible = row.status !== 'off' && row.mode !== 'repet';
        res.status(200).json({
          setlist: visible && Array.isArray(row.setlist) ? row.setlist : [],
        });
        return;
      }
      const r = await fetch(
        `${base}/rest/v1/live_state?id=eq.live&select=status,mode,song,artist,hearts,band_song,concert,setlist_count,updated_at`,
        { headers: sbHeaders() },
      );
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      const rows = await r.json();
      const row = Array.isArray(rows) && rows[0] ? rows[0] : {};
      res.status(200).json({
        status: row.status ?? 'off',
        mode: row.mode === 'repet' ? 'repet' : 'concert',
        song: row.song ?? null,
        artist: row.artist ?? null,
        hearts: row.hearts ?? 0,
        bandSong: row.band_song ?? null,
        concert: row.concert ?? null,
        setlistCount:
          typeof row.setlist_count === 'number' ? row.setlist_count : 0,
        updatedAt: row.updated_at ?? null,
      });
      return;
    }

    if (req.method === 'POST') {
      const provided = req.headers['x-live-key'];
      if (provided !== process.env.LIVE_KEY) {
        res.status(403).json({ error: 'Clé On Air incorrecte' });
        return;
      }
      // Nettoyage de la setlist diffusée (limites de taille anti-abus).
      const sanitizeSetlist = (v) =>
        Array.isArray(v)
          ? v.slice(0, 60).map((s) => ({
              title: typeof s?.title === 'string' ? s.title.slice(0, 200) : '',
              artist:
                typeof s?.artist === 'string' ? s.artist.slice(0, 200) : '',
              lyrics:
                typeof s?.lyrics === 'string' ? s.lyrics.slice(0, 8000) : '',
            }))
          : [];

      // Mise à jour du suivi de groupe seul (sans toucher au direct public)
      if (!('status' in (req.body ?? {})) && 'bandSong' in (req.body ?? {})) {
        const u = await fetch(`${base}/rest/v1/live_state?id=eq.live`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ band_song: req.body.bandSong ?? null }),
        });
        if (!u.ok) {
          res.status(502).json({ error: `Supabase a répondu ${u.status}` });
          return;
        }
        res.status(200).json({ ok: true });
        return;
      }
      // Mise à jour de la setlist diffusée seule.
      if (!('status' in (req.body ?? {})) && 'setlist' in (req.body ?? {})) {
        const list = sanitizeSetlist(req.body.setlist);
        const u = await fetch(`${base}/rest/v1/live_state?id=eq.live`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ setlist: list, setlist_count: list.length }),
        });
        if (!u.ok) {
          res.status(502).json({ error: `Supabase a répondu ${u.status}` });
          return;
        }
        res.status(200).json({ ok: true });
        return;
      }
      const status = req.body?.status;
      if (status !== 'on' && status !== 'pause' && status !== 'off') {
        res.status(400).json({ error: 'Statut invalide' });
        return;
      }
      const patch = {
        id: 'live',
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === 'off') {
        patch.concert = null;
        patch.setlist = null;
        patch.setlist_count = 0;
      }
      if (req.body?.mode === 'repet' || req.body?.mode === 'concert') {
        patch.mode = req.body.mode;
      }
      if (status !== 'off' && 'setlist' in (req.body ?? {})) {
        const list = sanitizeSetlist(req.body.setlist);
        patch.setlist = list;
        patch.setlist_count = list.length;
      }
      if ('song' in (req.body ?? {})) patch.song = req.body.song ?? null;
      if ('artist' in (req.body ?? {})) patch.artist = req.body.artist ?? null;
      if ('bandSong' in (req.body ?? {})) patch.band_song = req.body.bandSong ?? null;
      if ('concert' in (req.body ?? {})) patch.concert = req.body.concert ?? null;

      // Archiver les cœurs de la chanson qui se termine (stats du groupe).
      try {
        const cur = await fetch(
          `${base}/rest/v1/live_state?id=eq.live&select=song,hearts,concert`,
          { headers: sbHeaders() },
        );
        const rows = cur.ok ? await cur.json() : [];
        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        const prevTitle = row?.song?.title ?? '';
        const nextTitle = patch.song?.title ?? '';
        const songChanged = 'song' in patch && nextTitle !== prevTitle;
        if (row && prevTitle !== '' && (songChanged || status === 'off')) {
          if ((row.hearts ?? 0) > 0) {
            let ins = await fetch(`${base}/rest/v1/live_stats`, {
              method: 'POST',
              headers: sbHeaders(),
              body: JSON.stringify({
                song_title: prevTitle,
                song_artist: row.song?.artist ?? '',
                hearts: row.hearts ?? 0,
                concert_id: row.concert?.id ?? '',
                concert_title: row.concert?.title ?? '',
                played_at: new Date().toISOString(),
              }),
            });
            // Repli si colonnes de contexte absentes (migration pas à jour) :
            // on archive au moins le morceau et ses cœurs.
            if (ins.status === 400) {
              ins = await fetch(`${base}/rest/v1/live_stats`, {
                method: 'POST',
                headers: sbHeaders(),
                body: JSON.stringify({
                  song_title: prevTitle,
                  song_artist: row.song?.artist ?? '',
                  hearts: row.hearts ?? 0,
                  played_at: new Date().toISOString(),
                }),
              });
            }
          }
          patch.hearts = 0;
        }
        if (songChanged) patch.hearts = 0;
      } catch {
        // archivage best-effort : ne bloque jamais le direct
      }
      const r = await fetch(`${base}/rest/v1/live_state`, {
        method: 'POST',
        headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
