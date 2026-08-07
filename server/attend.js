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
        `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}&select=status,session_id&limit=1`,
        { headers: sbHeaders() },
      );
      const rows2 = r2.ok ? await r2.json() : [];
      const row2 = Array.isArray(rows2) && rows2[0] ? rows2[0] : null;
      if (row2 && row2.status !== 'off' && row2.session_id) {
        await fetch(`${base}/rest/v1/live_attendance`, {
          method: 'POST',
          headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            session_id: row2.session_id,
            device_id: device,
            last_seen: new Date().toISOString(),
          }),
        });
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

    // Présence (session, appareil anonyme) : 1 ligne par unique.
    await fetch(`${base}/rest/v1/live_attendance`, {
      method: 'POST',
      headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        session_id: row.session_id,
        device_id: device,
        last_seen: new Date().toISOString(),
      }),
    });

    // Met à jour le compteur d'uniques courant (léger, best-effort).
    try {
      const c = await fetch(
        `${base}/rest/v1/live_attendance?session_id=eq.${row.session_id}&select=device_id`,
        { headers: { ...sbHeaders(), prefer: 'count=exact' } },
      );
      const range = c.headers.get('content-range') || '';
      const m = /\/(\d+)$/.exec(range);
      const uniques = m ? parseInt(m[1], 10) : 0;
      await fetch(`${base}/rest/v1/live_sessions?id=eq.${row.session_id}`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ uniques }),
      });
    } catch {
      /* comptage best-effort */
    }

    res.status(200).json({ ok: true });
  } catch {
    // Jamais d'erreur visible au spectateur : la mesure ne bloque rien.
    res.status(200).json({ ok: false });
  }
}
