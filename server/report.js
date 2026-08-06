/**
 * Fonction serveur Vercel — signalement de contenu (chantier 3, défensif).
 *
 * POST /api/report  body: { url, reason, contact }
 *   → enregistre le signalement (table `reports`) pour examen par les
 *     fondateurs. Engagement de retrait rapide affiché côté public.
 *
 * Nécessite SUPABASE_URL + SUPABASE_SERVICE_KEY et supabase/reports.sql.
 * (Email direct aux fondateurs : à brancher quand une infra d'envoi est
 *  configurée ; en attendant, les signalements sont consultables en base.)
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
      res.status(405).json({ error: 'Méthode non autorisée' });
      return;
    }
    if (!configured()) {
      res.status(501).json({ error: 'Signalement non configuré côté serveur.' });
      return;
    }
    const reason = String(req.body?.reason ?? '').trim().slice(0, 4000);
    if (reason === '') {
      res.status(400).json({ error: 'Motif requis.' });
      return;
    }
    const url = String(req.body?.url ?? '').trim().slice(0, 500);
    const contact = String(req.body?.contact ?? '').trim().slice(0, 200);
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const r = await fetch(`${base}/rest/v1/reports`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ url, reason, contact }),
    });
    if (!r.ok) {
      res.status(502).json({ error: `Supabase a répondu ${r.status}` });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
