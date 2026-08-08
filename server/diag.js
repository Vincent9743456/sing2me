/**
 * Diagnostic ON AIR (b178) — GET /api/live-x?fn=diag, réservé à l'artiste
 * (en-tête x-live-key).
 *
 * Pourquoi ce point d'entrée existe : trois écrans affichaient 0 (mots du
 * public, spectateurs, historique des directs) sans qu'on puisse savoir
 * lequel des maillons cassait — table absente, colonne manquante, droits,
 * ou simplement aucune donnée. Chaque correction à l'aveugle coûtait un
 * aller-retour d'une journée. Ici, on demande à la base ce qu'elle a.
 *
 * Ne renvoie AUCUN contenu : uniquement l'existence, le nombre de lignes et
 * la date de la plus récente. De quoi trancher, rien de plus.
 */

import { identifie, refuse } from './identity.js';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, authorization: `Bearer ${key}` };
}

/** État d'une table : lisible ? combien de lignes ? la plus récente ? */
async function probe(base, table, dateColumn) {
  const out = { table, ok: false, rows: null, last: null, detail: '' };
  try {
    // `count=exact` + Range vide : PostgREST renvoie le total dans
    // content-range sans rapatrier les lignes.
    const r = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
      headers: { ...sbHeaders(), prefer: 'count=exact', range: '0-0' },
    });
    out.ok = r.ok;
    if (!r.ok) {
      out.detail = `${r.status} ${(await r.text()).slice(0, 160)}`;
      return out;
    }
    const range = r.headers.get('content-range') ?? '';
    const total = range.split('/')[1];
    out.rows = total === '*' || total === undefined ? null : Number(total);
    if (dateColumn) {
      const d = await fetch(
        `${base}/rest/v1/${table}?select=${dateColumn}&order=${dateColumn}.desc&limit=1`,
        { headers: sbHeaders() },
      );
      if (d.ok) {
        const rows = await d.json();
        out.last = Array.isArray(rows) && rows[0] ? rows[0][dateColumn] : null;
      }
    }
  } catch (e) {
    out.detail = e instanceof Error ? e.message.slice(0, 160) : 'erreur';
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Méthode non autorisée' });
      return;
    }
    // b192 : compte, ou ancienne clé pendant la transition.
    const qui = await identifie(req);
    if (!qui.ok) {
      refuse(res);
      return;
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.status(200).json({
        configured: false,
        tables: [],
        note: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY manquante sur Vercel',
      });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const tables = await Promise.all([
      probe(base, 'lives', 'updated_at'),
      probe(base, 'live_sessions', 'started_at'),
      probe(base, 'live_stats', 'played_at'),
      probe(base, 'live_messages', 'created_at'),
      probe(base, 'live_attendance', 'last_seen'),
      probe(base, 'followers', 'created_at'),
    ]);
    res.status(200).json({ configured: true, tables });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
