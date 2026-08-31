/**
 * Tableau de bord fondateur (b160) — chiffres agrégés, et depuis b485 la
 * vue PAR UTILISATEUR (demande de Marco : dernière connexion, abonnement,
 * nb de morceaux, nb de lives, spectateurs connectés). Nominatif, donc
 * strictement réservé aux fondateurs (ADMIN_EMAILS) — rien de tout ça ne
 * sort de cet endpoint.
 *
 * Renvoie : comptes créés, connexions récentes, directs, et surtout le
 * COÛT des IA embarquées, mesuré par nous (`ai_usage`) plutôt que
 * demandé aux fournisseurs — ni Anthropic ni OpenAI n'exposent le solde
 * restant par API. Le restant est reconstitué : rechargements saisis à
 * la main moins la dépense mesurée.
 *
 * Accès réservé : l'appelant doit présenter un jeton Supabase valide ET
 * son e-mail doit figurer dans ADMIN_EMAILS (liste dans Vercel — virgule,
 * point-virgule ou espaces, b486 : la variable réelle de Vincent était
 * séparée par « ; » et le split(',') verrouillait les DEUX fondateurs
 * dehors). Sans cette variable, l'endpoint est fermé.
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
    .split(/[,;\s]+/)
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

/** Comptes : total, créations et connexions récentes — et depuis b485 la
 *  LISTE des comptes (id, e-mail, dates), déjà parcourue ici de toute
 *  façon : la vue par utilisateur ne coûte aucune requête de plus. */
async function accounts() {
  const out = { total: 0, new7: 0, new30: 0, active7: 0, active30: 0 };
  const rows = [];
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
      rows.push({
        id: String(u.id ?? ''),
        email: String(u.email ?? ''),
        cree: u.created_at ?? null,
        vu: u.last_sign_in_at ?? null,
      });
    }
    if (users.length < 1000) break;
  }
  return { stats: out, rows };
}

/** Morceaux et dernière synchro PAR COMPTE (b485) — compté en base par la
 *  RPC admin_user_songs (supabase/admin.sql). `null` si la fonction n'est
 *  pas encore installée : l'écran le dit au lieu d'afficher des zéros. */
async function userSongs() {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/admin_user_songs`,
      { method: 'POST', headers: sbHeaders(), body: '{}' },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    const map = {};
    for (const row of rows) {
      map[row.user_id] = {
        morceaux: Number(row.morceaux) || 0,
        synchro: row.synchro ?? null,
      };
    }
    return map;
  } catch {
    return null;
  }
}

/** Plan par compte (b485) — 'pro' (héritage b381) compte comme 'scene'. */
async function plansParCompte() {
  const map = {};
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/user_plans?select=user_id,plan`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return map;
    for (const row of await r.json()) {
      map[row.user_id] = row.plan === 'pro' ? 'scene' : String(row.plan ?? '');
    }
    return map;
  } catch {
    return map;
  }
}

/**
 * Lives par compte + lives EN COURS avec spectateurs connectés (b485).
 * Un siège « connecté » = vu depuis moins de 2 minutes — la même
 * définition que la jauge de salle (api/live.js) ; la sentinelle
 * `__salle_pleine__` n'est pas un spectateur.
 */
async function livesParCompte() {
  const parCompte = {};
  const enDirect = [];
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/lives?select=id,owner_id,status,started_at,artist&order=started_at.desc`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return { parCompte, enDirect };
    const rows = await r.json();
    const ouverts = [];
    for (const row of rows) {
      const owner = row.owner_id ?? '';
      if (owner !== '') {
        const c = parCompte[owner] ?? { lives: 0, dernier: null };
        c.lives++;
        if (c.dernier === null) c.dernier = row.started_at ?? null;
        parCompte[owner] = c;
      }
      if (row.status && row.status !== 'off') ouverts.push(row);
    }
    // Spectateurs des lives ouverts — une requête par live ouvert : il y en
    // a zéro ou un la plupart du temps, jamais des dizaines.
    const seuil = new Date(Date.now() - 2 * 60000).toISOString();
    for (const live of ouverts.slice(0, 10)) {
      let spectateurs = 0;
      try {
        const s = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/live_seats?select=device_id&live_id=eq.${encodeURIComponent(live.id)}&last_seen=gte.${encodeURIComponent(seuil)}&device_id=neq.__salle_pleine__`,
          { headers: { ...sbHeaders(), prefer: 'count=exact', range: '0-0' } },
        );
        const range = s.headers.get('content-range') ?? '';
        spectateurs = Number(range.split('/')[1]) || 0;
      } catch {
        /* la jauge manque : on montre le live quand même */
      }
      enDirect.push({
        artiste: String(live.artist?.name ?? ''),
        ownerId: live.owner_id ?? '',
        depuis: live.started_at ?? null,
        statut: String(live.status ?? ''),
        spectateurs,
      });
    }
    return { parCompte, enDirect };
  } catch {
    return { parCompte, enDirect };
  }
}

/**
 * Répartition des ABONNEMENTS (b411) : lignes de user_plans agrégées par
 * plan ('pro', héritage b381, compte avec 'scene'). Les comptes sans ligne
 * sont gratuits — le total vient de `accounts()`, pas d'ici.
 */
async function plansBreakdown() {
  const out = { musicien: 0, scene: 0, admin: 0 };
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/user_plans?select=plan`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return out;
    const rows = await r.json();
    for (const row of rows) {
      const p = row.plan === 'pro' ? 'scene' : row.plan;
      if (p in out) out[p]++;
    }
    return out;
  } catch {
    return out;
  }
}

/**
 * Partitions des bibliothèques personnelles (b411) : total, et UNIQUES
 * (hors copies créées par le partage en groupe — même titre + artiste
 * comptés une fois). Calculé EN BASE (`admin_song_stats`, supabase/
 * admin.sql) : rapatrier les blobs entiers pour compter coûterait des
 * mégaoctets à chaque affichage. `null` si la fonction n'est pas encore
 * installée — l'écran le dit au lieu d'afficher un zéro trompeur.
 */
async function songStats() {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/admin_song_stats`,
      { method: 'POST', headers: sbHeaders(), body: '{}' },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return {
      total: Number(row.total) || 0,
      uniques: Number(row.uniques) || 0,
    };
  } catch {
    return null;
  }
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

/**
 * Dépense IA mesurée, par fournisseur et par fonction.
 *
 * UNE seule requête (b455, « le chargement est assez long », Vincent) :
 * l'ancien code interrogeait la table DEUX fois de suite — les 30 jours,
 * puis TOUTES les lignes — alors qu'une seule lecture permet de calculer
 * les deux fenêtres en un passage. La sonde `measurement` (b161) est
 * devenue un sous-produit : le succès de CETTE requête dit si la table
 * existe, plus besoin d'une requête de sonde à part.
 */
async function aiSpend() {
  const since30 = Date.now() - 30 * 86400000;
  const empty = { total: 0, byProvider: {}, byFn: {}, calls: 0 };
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ai_usage?select=provider,fn,cost_usd,at`,
      { headers: sbHeaders() },
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return {
        d30: empty,
        all: empty,
        probe: { ok: false, status: r.status, detail: detail.slice(0, 200) },
      };
    }
    const rows = await r.json();
    const d30 = { total: 0, byProvider: {}, byFn: {}, calls: 0 };
    const all = { total: 0, byProvider: {}, byFn: {}, calls: rows.length };
    for (const row of rows) {
      const c = Number(row.cost_usd) || 0;
      all.total += c;
      all.byProvider[row.provider] = (all.byProvider[row.provider] ?? 0) + c;
      if ((Date.parse(row.at ?? '') || 0) >= since30) {
        d30.calls++;
        d30.total += c;
        d30.byProvider[row.provider] = (d30.byProvider[row.provider] ?? 0) + c;
        d30.byFn[row.fn] = (d30.byFn[row.fn] ?? 0) + c;
      }
    }
    return { d30, all, probe: { ok: true } };
  } catch {
    return {
      d30: empty,
      all: empty,
      probe: { ok: false, status: 0, detail: 'injoignable' },
    };
  }
}

/** Rechargements saisis à la main, par fournisseur — avec, en sous-produit,
 *  la sonde b161 (la table existe-t-elle ?), comme pour `aiSpend`. */
async function topups() {
  const out = {};
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/billing_topups?select=provider,amount_usd,at&order=at.desc`,
      { headers: sbHeaders() },
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return {
        byProvider: out,
        last: [],
        probe: { ok: false, status: r.status, detail: detail.slice(0, 200) },
      };
    }
    const rows = await r.json();
    for (const row of rows) {
      out[row.provider] = (out[row.provider] ?? 0) + (Number(row.amount_usd) || 0);
    }
    return { byProvider: out, last: rows.slice(0, 5), probe: { ok: true } };
  } catch {
    return {
      byProvider: out,
      last: [],
      probe: { ok: false, status: 0, detail: 'injoignable' },
    };
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
        const detail = await r.text().catch(() => '');
        const missing = /does not exist|relation .* does not exist|PGRST205/i.test(
          detail,
        );
        res.status(502).json({
          error: missing
            ? "La table des rechargements n'existe pas encore — exécute supabase/admin.sql dans le SQL Editor."
            : "Le rechargement n'a pas pu être noté.",
          detail: detail.slice(0, 200),
        });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    // « Morceaux partagés en groupe » (band_library) est retiré (b411,
    // demande de Vincent : pas à jour, pas utile) au profit du compteur de
    // partitions des bibliothèques personnelles.
    const [acc, spend, tops, bands, lives, plans, songs, perSongs, perPlans, perLives] =
      await Promise.all([
        accounts(),
        aiSpend(),
        topups(),
        countRows('cloud_bands'),
        countRows('lives'),
        plansBreakdown(),
        songStats(),
        userSongs(),
        plansParCompte(),
        livesParCompte(),
      ]);
    // Diagnostic b161, sans requêtes dédiées (b455) : les lectures
    // ci-dessus ont déjà touché les deux tables de mesure — leur succès
    // EST la sonde.
    const meas = {
      ready: spend.probe.ok && tops.probe.ok,
      aiUsage: spend.probe,
      topups: tops.probe,
      since: null,
    };

    const remaining = {};
    for (const p of ['anthropic', 'openai']) {
      const paid = tops.byProvider[p] ?? 0;
      const used = spend.all.byProvider[p] ?? 0;
      remaining[p] = { paid, used, left: paid - used };
    }

    // Vue par utilisateur (b485) : la liste des comptes vient du parcours
    // déjà fait par accounts() — trié par dernière connexion, les jamais
    // connectés en queue.
    const utilisateurs = acc.rows
      .map((u) => ({
        ...u,
        plan: perPlans[u.id] ?? 'free',
        morceaux: perSongs?.[u.id]?.morceaux ?? null,
        synchro: perSongs?.[u.id]?.synchro ?? null,
        lives: perLives.parCompte[u.id]?.lives ?? 0,
        dernierLive: perLives.parCompte[u.id]?.dernier ?? null,
      }))
      .sort(
        (a, b) => (Date.parse(b.vu ?? '') || 0) - (Date.parse(a.vu ?? '') || 0),
      );

    res.status(200).json({
      at: new Date().toISOString(),
      accounts: acc.stats,
      utilisateurs,
      // `null` tant qu'admin.sql (admin_user_songs) n'est pas rejoué — les
      // colonnes morceaux/synchro s'affichent alors « — », jamais 0.
      morceauxParCompte: perSongs !== null,
      enDirect: perLives.enDirect,
      plans,
      bands,
      lives,
      songs,
      ai: { last30: spend.d30, allTime: spend.all },
      // Diagnostic (b161) : l'app affiche un avertissement explicite si la
      // mesure n'est pas opérationnelle, au lieu d'un zéro trompeur.
      measurement: meas,
      billing: { remaining, lastTopups: tops.last },
      // Le modèle économique n'est pas arrêté : le chiffre d'affaires
      // reste explicitement absent plutôt qu'affiché à zéro.
      revenue: null,
    });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
