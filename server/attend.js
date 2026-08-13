/**
 * Fonction serveur Vercel — MESURE D'AUDIENCE (chantier 2).
 *
 * POST /api/attend  body: { device: "<id anonyme>" }
 *   → enregistre la présence d'un spectateur à la session ON AIR en cours,
 *     pour le comptage des spectateurs UNIQUES.
 *
 * ⚠️ MESURE SEULEMENT : aucune limite, aucun blocage, aucune notification.
 * Totalement isolé du direct (aucune écriture sur l'état public) et
 * best-effort : ne renvoie jamais d'erreur visible au spectateur, ne bloque
 * jamais rien. Nécessite les colonnes/tables de supabase/live.sql (audience).
 */

function configured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

/**
 * Présence d'un spectateur — écrite UNE SEULE FOIS par appareil (b313).
 *
 * AVANT : chaque ping (toutes les 8 s, par spectateur) ré-écrivait `last_seen`
 * sur `live_attendance` ET ré-appliquait `uniques=N` sur `live_sessions`, MÊME
 * inchangé. Un concert de 3 h à 3 spectateurs = des milliers d'UPDATE sur une
 * seule ligne → 3 Mo de tuples morts pour 8 sessions, alors que la donnée
 * logique est infime. Et `last_seen`/`first_seen` ne sont RELUS nulle part
 * (seul diag.js sonde l'existence de la colonne).
 *
 * DÉSORMAIS : un ping d'un spectateur DÉJÀ vu ne fait qu'une LECTURE, aucune
 * écriture. On n'écrit (présence + recompte des uniques) que lorsqu'un NOUVEL
 * appareil apparaît — quelques fois par concert, plus des milliers. La mesure
 * reste exacte : on change QUAND on écrit, pas ce qu'on compte.
 */
async function markPresence(base, sessionId, device) {
  const sid = encodeURIComponent(sessionId);
  const dev = encodeURIComponent(device);
  // Déjà présent ? Alors le compteur n'a pas bougé : rien à écrire.
  const seen = await fetch(
    `${base}/rest/v1/live_attendance?session_id=eq.${sid}&device_id=eq.${dev}&select=device_id&limit=1`,
    { headers: sbHeaders() },
  );
  if (seen.ok) {
    const arr = await seen.json();
    if (Array.isArray(arr) && arr.length > 0) return;
  }
  // Nouvel appareil : on l'inscrit une fois (ignore-duplicates couvre une
  // course entre deux pings simultanés — jamais un doublon, jamais un UPDATE).
  await fetch(`${base}/rest/v1/live_attendance`, {
    method: 'POST',
    headers: { ...sbHeaders(), prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ session_id: sessionId, device_id: device }),
  });
  // Le nombre d'uniques change → on le recale (rare : à chaque arrivant).
  try {
    const c = await fetch(
      `${base}/rest/v1/live_attendance?session_id=eq.${sid}&select=device_id`,
      { headers: { ...sbHeaders(), prefer: 'count=exact' } },
    );
    const range = c.headers.get('content-range') || '';
    const m = /\/(\d+)$/.exec(range);
    const uniques = m ? parseInt(m[1], 10) : 0;
    if (uniques > 0) {
      await fetch(`${base}/rest/v1/live_sessions?id=eq.${sid}`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ uniques }),
      });
    }
  } catch {
    /* comptage best-effort */
  }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false });
      return;
    }
    if (!configured()) {
      res.status(200).json({ ok: false });
      return;
    }
    const device = String(req.body?.device ?? '').slice(0, 80);
    if (device === '') {
      res.status(200).json({ ok: false });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    // Multi-live (b121) : présence rattachée au direct indiqué.
    const liveId = String(req.body?.liveId ?? '').slice(0, 60);
    if (liveId !== '' && liveId !== 'legacy') {
      const r2 = await fetch(
        `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}&select=status,session_id,artist,started_at&limit=1`,
        { headers: sbHeaders() },
      );
      const rows2 = r2.ok ? await r2.json() : [];
      let row2 = Array.isArray(rows2) && rows2[0] ? rows2[0] : null;
      // Séance manquante (b181) : elle n'est créée qu'en « best-effort » au
      // lancement du direct, et son échec passe inaperçu. Sans elle, AUCUNE
      // présence n'était enregistrée — d'où « 0 spectateur » alors qu'il y
      // avait du public. On la crée donc ici, à la première présence
      // constatée, et on la rattache au direct.
      if (row2 && row2.status !== 'off' && !row2.session_id) {
        try {
          const cr = await fetch(`${base}/rest/v1/live_sessions`, {
            method: 'POST',
            headers: { ...sbHeaders(), prefer: 'return=representation' },
            body: JSON.stringify({
              artist_name: row2.artist?.name ?? '',
              started_at: row2.started_at ?? new Date().toISOString(),
            }),
          });
          if (cr.ok) {
            const arr = await cr.json();
            const id = Array.isArray(arr) && arr[0] ? arr[0].id : null;
            if (id) {
              await fetch(
                `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}`,
                {
                  method: 'PATCH',
                  headers: sbHeaders(),
                  body: JSON.stringify({ session_id: id }),
                },
              );
              row2 = { ...row2, session_id: id };
            }
          }
        } catch {
          /* rattrapage best-effort */
        }
      }
      if (row2 && row2.status !== 'off' && row2.session_id) {
        // Compteur d'uniques tenu à jour PENDANT le direct (b201), mais écrit
        // seulement quand un nouvel appareil apparaît (b313, voir markPresence).
        await markPresence(base, row2.session_id, device);
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Y a-t-il une session ON AIR active ? (legacy)
    const r = await fetch(
      `${base}/rest/v1/live_state?id=eq.live&select=status,session_id`,
      { headers: sbHeaders() },
    );
    const rows = r.ok ? await r.json() : [];
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row || row.status === 'off' || !row.session_id) {
      res.status(200).json({ ok: true });
      return;
    }

    // Présence (session, appareil anonyme) : 1 ligne par unique, écrite une
    // seule fois — le recompte des uniques suit (b313, voir markPresence).
    await markPresence(base, row.session_id, device);

    res.status(200).json({ ok: true });
  } catch {
    // Jamais d'erreur visible au spectateur : la mesure ne bloque rien.
    res.status(200).json({ ok: false });
  }
}
