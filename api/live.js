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

// Garde-fous « direct oublié » : 4 h max depuis le début, ou 1 h sans
// nouvelle partition. Renvoie true si le live doit être coupé.
const AUTO_STOP_MAX_MS = 4 * 60 * 60 * 1000; // 4 h après le début
const AUTO_STOP_IDLE_MS = 60 * 60 * 1000; // 1 h sans partition
function liveExpired(row) {
  const now = Date.now();
  const started = row?.started_at ? Date.parse(row.started_at) : NaN;
  const lastSong = row?.last_song_at ? Date.parse(row.last_song_at) : NaN;
  if (!Number.isNaN(started) && now - started > AUTO_STOP_MAX_MS) return true;
  // Inactivité : référence = dernière partition, sinon le début du direct.
  const ref = !Number.isNaN(lastSong) ? lastSong : started;
  if (!Number.isNaN(ref) && now - ref > AUTO_STOP_IDLE_MS) return true;
  return false;
}

// Archive la dernière partition jouée (registre « setlist souvenir »).
async function archivePlayedSong(base, row) {
  const title = row?.song?.title ?? '';
  if (title === '') return;
  let ins = await fetch(`${base}/rest/v1/live_stats`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      song_title: title,
      song_artist: row.song?.artist ?? '',
      hearts: row.hearts ?? 0,
      concert_id: row.concert?.id ?? '',
      concert_title: row.concert?.title ?? '',
      session_id: row.session_id ?? null,
      played_at: new Date().toISOString(),
    }),
  });
  if (ins.status === 400) {
    await fetch(`${base}/rest/v1/live_stats`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        song_title: title,
        song_artist: row.song?.artist ?? '',
        hearts: row.hearts ?? 0,
        played_at: new Date().toISOString(),
      }),
    });
  }
}

// Fige le nombre d'uniques et l'heure de fin d'une session ON AIR.
async function finalizeSession(base, sessionId) {
  if (!sessionId) return;
  let uniques = 0;
  try {
    const c = await fetch(
      `${base}/rest/v1/live_attendance?session_id=eq.${sessionId}&select=device_id`,
      { headers: { ...sbHeaders(), prefer: 'count=exact' } },
    );
    const range = c.headers.get('content-range') || '';
    const m = /\/(\d+)$/.exec(range);
    uniques = m ? parseInt(m[1], 10) : 0;
  } catch {
    /* comptage best-effort */
  }
  await fetch(`${base}/rest/v1/live_sessions?id=eq.${sessionId}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ ended_at: new Date().toISOString(), uniques }),
  });
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
      let r = await fetch(
        `${base}/rest/v1/live_state?id=eq.live&select=status,mode,song,artist,hearts,band_song,concert,setlist_count,updated_at,band_id,started_by,started_at,last_song_at,session_id`,
        { headers: sbHeaders() },
      );
      // Repli si les colonnes récentes n'existent pas encore (migration
      // supabase/live.sql pas rejouée) : ne jamais casser l'état.
      if (r.status === 400) {
        r = await fetch(
          `${base}/rest/v1/live_state?id=eq.live&select=status,mode,song,artist,hearts,band_song,concert,setlist_count,updated_at`,
          { headers: sbHeaders() },
        );
      }
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      const rows = await r.json();
      const row = Array.isArray(rows) && rows[0] ? rows[0] : {};

      // Garde-fou « direct oublié » : à la lecture, si le live dépasse 4 h
      // ou reste 1 h sans nouvelle partition, on le coupe côté serveur (même
      // si le leader a fermé son app). Le PATCH conditionnel (status<>off)
      // sert de verrou : un seul appel « gagne » la clôture et archive.
      if (row.status && row.status !== 'off' && liveExpired(row)) {
        try {
          const claim = await fetch(
            `${base}/rest/v1/live_state?id=eq.live&status=neq.off`,
            {
              method: 'PATCH',
              headers: { ...sbHeaders(), prefer: 'return=representation' },
              body: JSON.stringify({
                status: 'off',
                song: null,
                band_song: null,
                setlist: null,
                setlist_count: 0,
                concert: null,
                band_id: '',
                started_by: '',
                started_at: null,
                last_song_at: null,
                session_id: null,
                hearts: 0,
                updated_at: new Date().toISOString(),
              }),
            },
          );
          let claimed = [];
          try {
            claimed = await claim.json();
          } catch {
            claimed = [];
          }
          if (Array.isArray(claimed) && claimed.length > 0) {
            // On a gagné la clôture : on finalise comme un arrêt manuel.
            await archivePlayedSong(base, row);
            await finalizeSession(base, row.session_id);
            try {
              await fetch(`${base}/rest/v1/live_messages?id=not.is.null`, {
                method: 'DELETE',
                headers: sbHeaders(),
              });
            } catch {
              /* purge best-effort */
            }
          }
        } catch {
          // auto-arrêt best-effort : en cas d'échec on renvoie « off » quand même
        }
        res.status(200).json({
          status: 'off',
          mode: row.mode === 'repet' ? 'repet' : 'concert',
          song: null,
          artist: null,
          hearts: 0,
          bandSong: null,
          concert: null,
          setlistCount: 0,
          updatedAt: new Date().toISOString(),
          bandId: '',
          startedBy: '',
        });
        return;
      }

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
        // Portée « mon groupe » + qui a lancé le direct.
        bandId: typeof row.band_id === 'string' ? row.band_id : '',
        startedBy: typeof row.started_by === 'string' ? row.started_by : '',
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
        // Purge de l'état live à la clôture (chantier 3 — défensif) : aucune
        // parole poussée ne reste côté serveur ; on ne garde que l'agrégat
        // statistique (cœurs archivés par chanson, compteurs de session).
        patch.concert = null;
        patch.setlist = null;
        patch.setlist_count = 0;
        patch.song = null;
        patch.band_song = null;
        patch.band_id = '';
        patch.started_by = '';
        patch.started_at = null;
        patch.last_song_at = null;
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
      // Toute partition poussée réarme le compte à rebours d'inactivité (1 h).
      if (status !== 'off' && patch.song && patch.song.title) {
        patch.last_song_at = new Date().toISOString();
      }
      if (status !== 'off' && 'bandId' in (req.body ?? {})) {
        patch.band_id =
          typeof req.body.bandId === 'string' ? req.body.bandId.slice(0, 200) : '';
      }
      if (status !== 'off' && 'startedBy' in (req.body ?? {})) {
        patch.started_by =
          typeof req.body.startedBy === 'string'
            ? req.body.startedBy.slice(0, 120)
            : '';
      }
      if ('bandSong' in (req.body ?? {})) patch.band_song = req.body.bandSong ?? null;
      if ('concert' in (req.body ?? {})) patch.concert = req.body.concert ?? null;

      // Archiver les cœurs de la chanson qui se termine (stats du groupe).
      let liveRow = null;
      try {
        const cur = await fetch(
          `${base}/rest/v1/live_state?id=eq.live&select=song,hearts,concert,status,session_id`,
          { headers: sbHeaders() },
        );
        const rows = cur.ok ? await cur.json() : [];
        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        liveRow = row;
        const prevTitle = row?.song?.title ?? '';
        const nextTitle = patch.song?.title ?? '';
        const songChanged = 'song' in patch && nextTitle !== prevTitle;
        if (row && prevTitle !== '' && (songChanged || status === 'off')) {
          // On archive CHAQUE morceau joué (même 0 cœur) : c'est le registre
          // de la « setlist souvenir » (titres/artistes, aucune parole).
          let ins = await fetch(`${base}/rest/v1/live_stats`, {
            method: 'POST',
            headers: sbHeaders(),
            body: JSON.stringify({
              song_title: prevTitle,
              song_artist: row.song?.artist ?? '',
              hearts: row.hearts ?? 0,
              concert_id: row.concert?.id ?? '',
              concert_title: row.concert?.title ?? '',
              session_id: row.session_id ?? null,
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
          patch.hearts = 0;
        }
        if (songChanged) patch.hearts = 0;
      } catch {
        // archivage best-effort : ne bloque jamais le direct
      }

      // Chantier 2 — cycle de session ON AIR (MESURE seulement, best-effort).
      // GO LIVE (off → on/pause) ouvre une session ; l'arrêt la clôt et fige
      // le nombre d'uniques. Ne bloque JAMAIS le direct, n'a aucun effet
      // visible côté public ni musicien.
      try {
        const wasLive = !!liveRow && liveRow.status && liveRow.status !== 'off';
        if (status !== 'off' && !wasLive) {
          // Passage en direct : on horodate le début (garde-fou 4 h) et on
          // amorce le compteur d'inactivité (garde-fou 1 h sans partition).
          patch.started_at = new Date().toISOString();
          if (!patch.last_song_at) patch.last_song_at = patch.started_at;
          const artistName =
            patch.artist?.name || liveRow?.artist?.name || '';
          const s = await fetch(`${base}/rest/v1/live_sessions`, {
            method: 'POST',
            headers: { ...sbHeaders(), prefer: 'return=representation' },
            body: JSON.stringify({ artist_name: artistName }),
          });
          if (s.ok) {
            const arr = await s.json();
            const sid = Array.isArray(arr) && arr[0] ? arr[0].id : null;
            if (sid) patch.session_id = sid;
          }
        } else if (status === 'off' && liveRow?.session_id) {
          let uniques = 0;
          try {
            const c = await fetch(
              `${base}/rest/v1/live_attendance?session_id=eq.${liveRow.session_id}&select=device_id`,
              { headers: { ...sbHeaders(), prefer: 'count=exact' } },
            );
            const range = c.headers.get('content-range') || '';
            const m = /\/(\d+)$/.exec(range);
            uniques = m ? parseInt(m[1], 10) : 0;
          } catch {
            /* comptage best-effort */
          }
          await fetch(
            `${base}/rest/v1/live_sessions?id=eq.${liveRow.session_id}`,
            {
              method: 'PATCH',
              headers: sbHeaders(),
              body: JSON.stringify({
                ended_at: new Date().toISOString(),
                uniques,
              }),
            },
          );
          patch.session_id = null;
        }
      } catch {
        // mesure best-effort : ne bloque jamais le direct
      }

      // Purge défensive des messages du public à la clôture (chantier 3) :
      // on ne conserve aucune parole côté serveur après le concert. Les cœurs
      // sont déjà agrégés dans live_stats. Best-effort, jamais bloquant.
      if (status === 'off') {
        try {
          await fetch(`${base}/rest/v1/live_messages?id=not.is.null`, {
            method: 'DELETE',
            headers: sbHeaders(),
          });
        } catch {
          // purge best-effort
        }
      }
      let r = await fetch(`${base}/rest/v1/live_state`, {
        method: 'POST',
        headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(patch),
      });
      // Repli si band_id/started_by n'existent pas encore côté base
      // (migration pas rejouée) : on réécrit sans ces colonnes plutôt que
      // de couper le direct. « Jamais de coupure en plein concert. »
      if (
        r.status === 400 &&
        ('band_id' in patch ||
          'started_by' in patch ||
          'started_at' in patch ||
          'last_song_at' in patch)
      ) {
        const { band_id, started_by, started_at, last_song_at, ...safe } = patch;
        void band_id;
        void started_by;
        void started_at;
        void last_song_at;
        r = await fetch(`${base}/rest/v1/live_state`, {
          method: 'POST',
          headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(safe),
        });
      }
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
