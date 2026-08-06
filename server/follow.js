/**
 * Fonction serveur Vercel — « Suivre cet artiste » (fanbase V1, chantier 6).
 *
 * POST /api/follow  body: { artist, email, shareEmail }
 *   → enregistre un suiveur (consentement recueilli côté public). Best-effort.
 * GET  /api/follow?artist=Nom  (en-tête x-live-key requis)
 *   → { count, sharedEmails }  pour l'artiste : le NOMBRE de suiveurs, et le
 *     détail des emails UNIQUEMENT pour ceux qui ont accepté de le partager.
 *
 * ⚠️ RGPD : consentement explicite au moment du suivi (côté client), l'artiste
 * ne voit que l'agrégat sauf partage explicite du suiveur. Désabonnement et
 * purge : à traiter via le lien des notifications (infra d'envoi à venir).
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
    if (!configured()) {
      res.status(501).json({ error: 'Fanbase non configurée côté serveur.' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    if (req.method === 'POST') {
      const artist = String(req.body?.artist ?? '').trim().slice(0, 200);
      const email = String(req.body?.email ?? '').trim().slice(0, 200);
      const shareEmail = req.body?.shareEmail === true;
      if (artist === '' || email === '' || !email.includes('@')) {
        res.status(400).json({ error: 'Artiste et email valides requis.' });
        return;
      }
      const r = await fetch(
        `${base}/rest/v1/followers?on_conflict=artist_name,email`,
        {
          method: 'POST',
          headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            artist_name: artist,
            email,
            share_email: shareEmail,
          }),
        },
      );
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      if (req.headers['x-live-key'] !== process.env.LIVE_KEY) {
        res.status(403).json({ error: 'Clé On Air incorrecte' });
        return;
      }
      const artist = String(req.query?.artist ?? '').trim();
      if (artist === '') {
        res.status(400).json({ error: 'Artiste requis.' });
        return;
      }
      const q = `artist_name=eq.${encodeURIComponent(artist)}`;
      // Compteur (agrégé).
      const c = await fetch(
        `${base}/rest/v1/followers?${q}&select=id`,
        { headers: { ...sbHeaders(), prefer: 'count=exact' } },
      );
      const range = c.headers.get('content-range') || '';
      const m = /\/(\d+)$/.exec(range);
      const count = m ? parseInt(m[1], 10) : 0;
      // Emails partagés uniquement (consentement explicite du suiveur).
      let sharedEmails = [];
      try {
        const s = await fetch(
          `${base}/rest/v1/followers?${q}&share_email=eq.true&select=email`,
          { headers: sbHeaders() },
        );
        if (s.ok) {
          const rows = await s.json();
          sharedEmails = Array.isArray(rows)
            ? rows.map((x) => x.email).filter(Boolean)
            : [];
        }
      } catch {
        /* best-effort */
      }
      res.status(200).json({ count, sharedEmails });
      return;
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
