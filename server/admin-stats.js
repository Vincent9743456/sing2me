/**
 * Tableau de bord fondateur (b160) — chiffres agrégés, rien de nominatif.
 *
 * Renvoie : comptes créés, connexions récentes, directs, et surtout le
 * COÛT des IA embarquées, mesuré par nous (`ai_usage`) plutôt que
 * demandé aux fournisseurs — ni Anthropic ni OpenAI n'exposent le solde
 * restant par API. Le restant est reconstitué : rechargements saisis à
 * la main moins la dépense mesurée.
 *
 * Accès réservé : l'appelant doit présenter un jeton Supabase valide ET
 * son e-mail doit figurer dans ADMIN_EMAILS (liste séparée par des
 * virgules dans Vercel). Sans cette variable, l'endpoint est fermé.
 */

function ready() {
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

/** Vérifie le jeton de l'appelant et son appartenance à ADMIN_EMAILS. */
async function adminEmail(req) {
  const allowed = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '');
  if (allowed.length === 0) return null;
  const auth = String(req.headers?.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token === '') return null;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const email = String(u?.email || '').toLowerCase();
    return allowed.includes(email) ? email : null;
  } catch {
    return null;
  }
}

/** Comptes : total, créations et connexions récentes. */
async function accounts() {
  const out = { total: 0, new7: 0, new30: 0, active7: 0, active30: 0 };
  const now = Date.now();
  const days = (d) => now - d * 86400000;
  // L'API d'administration Supabase pagine à 1000 ; largement suffisant
  // ici, et on s'arrête proprement si le compte grossit.
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { headers: sbHeaders() },
    );
    if (!r.ok) break;
    const body = await r.json();
    const users = Array.isArray(body?.users) ? body.users : [];
    for (const u of users) {
      out.total++;
      const created = Date.parse(u.created_at ?? '') || 0;
      const seen = Date.parse(u.last_sign_in_at ?? '') || 0;
      if (created > days(7)) out.new7++;
      if (created > days(30)) out.new30++;
      if (seen > days(7)) out.active7++;
      if (seen > days(30)) out.active30++;
    }
    if (users.length < 1000) break;
  }
  return out;
}

/** Compte les lignes d'une table, sans les rapatrier. */
async function countRows(table, filter = '') {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/${table}?select=id${filter}`,
      { headers: { ...sbHeaders(), prefer: 'count=exact', range: '0-0' } },
    );
    const range = r.headers.get('content-range') ?? '';
    const total = range.split('/')[1];
    return Number(total) || 0;
  } catch {
    return 0;
  }
}

/** Dépense IA mesurée, par fournisseur et par fonction. */
async function aiSpend() {
  const since = (d) =>
    new Date(Date.now() - d * 86400000).toISOString();
  const empty = { total: 0, byProvider: {}, byFn: {}, calls: 0 };
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ai_usage` +
        `?select=provider,fn,cost_usd&at=gte.${since(30)}`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return { d30: empty, all: empty };
    const rows = await r.json();
    const acc = { total: 0, byProvider: {}, byFn: {}, calls: rows.length };
    for (const row of rows) {
      const c = Number(row.cost_usd) || 0;
      acc.total += c;
      acc.byProvider[row.provider] = (acc.byProvider[row.provider] ?? 0) + c;
      acc.byFn[row.fn] = (acc.byFn[row.fn] ?? 0) + c;
    }
    // Dépense TOTALE depuis le début, par fournisseur (pour le restant).
    const r2 = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ai_usage?select=provider,cost_usd`,
      { headers: sbHeaders() },
    );
    const all = { total: 0, byProvider: {}, byFn: {}, calls: 0 };
    if (r2.ok) {
      const rows2 = await r2.json();
      all.calls = rows2.length;
      for (const row of rows2) {
        const c = Number(row.cost_usd) || 0;
        all.total += c;
        all.byProvider[row.provider] = (all.byProvider[row.provider] ?? 0) + c;
      }
    }
    return { d30: acc, all };
  } catch {
    return { d30: empty, all: empty };
  }
}

/** Rechargements saisis à la main, par fournisseur. */
async function topups() {
  const out = {};
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/billing_topups?select=provider,amount_usd,at&order=at.desc`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return { byProvider: out, last: [] };
    const rows = await r.json();
    for (const row of rows) {
      out[row.provider] = (out[row.provider] ?? 0) + (Number(row.amount_usd) || 0);
    }
    return { byProvider: out, last: rows.slice(0, 5) };
  } catch {
    return { byProvider: out, last: [] };
  }
}

export default async function handler(req, res) {
  try {
    if (!ready()) {
      res.status(501).json({ error: 'Supabase non configuré côté serveur.' });
      return;
    }
    const who = await adminEmail(req);
    if (!who) {
      // Volontairement avare : on ne dit pas si la variable manque ou si
      // c'est l'e-mail qui n'est pas autorisé.
      res.status(403).json({ error: 'Accès réservé.' });
      return;
    }

    // Enregistrer un rechargement (POST) plutôt que lire le tableau.
    if (req.method === 'POST') {
      const provider = String(req.body?.provider ?? '');
      const amount = Number(req.body?.amount_usd ?? 0);
      if (!['anthropic', 'openai'].includes(provider) || !(amount > 0)) {
        res.status(400).json({ error: 'Rechargement invalide.' });
        return;
      }
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/billing_topups`,
        {
          method: 'POST',
          headers: { ...sbHeaders(), prefer: 'return=minimal' },
          body: JSON.stringify({
            provider,
            amount_usd: amount,
            note: String(req.body?.note ?? '').slice(0, 200),
          }),
        },
      );
      if (!r.ok) {
        res.status(502).json({ error: "Le rechargement n'a pas pu être noté." });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    const [acc, spend, tops, bands, lives, songsShared] = await Promise.all([
      accounts(),
      aiSpend(),
      topups(),
      countRows('cloud_bands'),
      countRows('lives'),
      countRows('band_library'),
    ]);

    const remaining = {};
    for (const p of ['anthropic', 'openai']) {
      const paid = tops.byProvider[p] ?? 0;
      const used = spend.all.byProvider[p] ?? 0;
      remaining[p] = { paid, used, left: paid - used };
    }

    res.status(200).json({
      at: new Date().toISOString(),
      accounts: acc,
      bands,
      lives,
      songsShared,
      ai: { last30: spend.d30, allTime: spend.all },
      billing: { remaining, lastTopups: tops.last },
      // Le modèle économique n'est pas arrêté : le chiffre d'affaires
      // reste explicitement absent plutôt qu'affiché à zéro.
      revenue: null,
    });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
