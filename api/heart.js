/**
 * Fonction serveur Vercel : cœurs du public pendant le direct.
 * POST /api/heart {n} — public, uniquement quand le direct est actif.
 */

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
      res.status(405).json({ error: 'Méthode non autorisée' });
      return;
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.status(501).json({ error: 'Mode ON AIR non configuré' });
      return;
    }
    const n = Math.max(1, Math.min(10, parseInt(req.body?.n, 10) || 1));
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    const r = await fetch(
      `${base}/rest/v1/live_state?id=eq.live&select=status,hearts`,
      { headers: sbHeaders() },
    );
    if (!r.ok) {
      res.status(502).json({ error: `Supabase a répondu ${r.status}` });
      return;
    }
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row || row.status !== 'on') {
      res.status(409).json({ error: 'Aucun direct en cours' });
      return;
    }
    const hearts = (row.hearts ?? 0) + n;
    const u = await fetch(`${base}/rest/v1/live_state?id=eq.live`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ hearts }),
    });
    if (!u.ok) {
      res.status(502).json({ error: `Supabase a répondu ${u.status}` });
      return;
    }
    res.status(200).json({ hearts });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
