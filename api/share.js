/**
 * Fonction serveur Vercel : liens de partage courts.
 * POST /api/share  {payload}  — réservé à l'artiste (x-live-key) → {id}
 * GET  /api/share?id=xxxx     — public : renvoie le contenu partagé
 * Nécessite supabase/shares.sql + SUPABASE_URL / SUPABASE_SERVICE_KEY.
 */

function sbHeaders(json) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const h = { apikey: key, authorization: `Bearer ${key}` };
  if (json) h['content-type'] = 'application/json';
  return h;
}

function shortId() {
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.status(501).json({ error: 'Liens courts non configurés' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    if (req.method === 'GET') {
      const id = req.query?.id;
      if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9]{4,24}$/.test(id)) {
        res.status(400).json({ error: 'Identifiant invalide' });
        return;
      }
      const r = await fetch(
        `${base}/rest/v1/shares?id=eq.${id}&select=payload`,
        { headers: sbHeaders(false) },
      );
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      const rows = await r.json();
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) {
        res.status(404).json({ error: 'Ce lien de partage n’existe plus.' });
        return;
      }
      // Contenu immuable : cache long côté navigateur/CDN
      res.setHeader('cache-control', 'public, max-age=86400');
      res.status(200).json({ payload: row.payload });
      return;
    }

    if (req.method === 'POST') {
      if (
        !process.env.LIVE_KEY ||
        req.headers['x-live-key'] !== process.env.LIVE_KEY
      ) {
        res.status(403).json({ error: 'Clé On Air incorrecte' });
        return;
      }
      const payload = req.body?.payload;
      if (!payload || typeof payload !== 'object') {
        res.status(400).json({ error: 'Contenu manquant' });
        return;
      }
      const size = JSON.stringify(payload).length;
      if (size > 900_000) {
        res.status(413).json({ error: 'Contenu trop volumineux' });
        return;
      }
      const id = shortId();
      const r = await fetch(`${base}/rest/v1/shares`, {
        method: 'POST',
        headers: sbHeaders(true),
        body: JSON.stringify({ id, payload }),
      });
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      res.status(200).json({ id });
      return;
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
