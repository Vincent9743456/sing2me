/**
 * Fonction serveur Vercel : cœurs du public pendant le direct.
 * POST /api/heart {n, liveId, device} — public, uniquement quand le direct
 * est actif.
 *
 * UN CŒUR PAR SPECTATEUR ET PAR MORCEAU (b225, demande de Vincent). Le
 * public tape autant qu'il veut — le ❤ s'envole à chaque fois, c'est le
 * retour immédiat qui fait le geste — mais un seul cœur est COMPTABILISÉ.
 * Sinon le chiffre ne dit plus « combien de gens ont aimé », il dit « qui a
 * le doigt le plus rapide », et les statistiques de l'artiste ne veulent
 * plus rien dire.
 *
 * Le spectateur n'a pas de compte : il est identifié par l'identifiant
 * anonyme et stable de son navigateur, le même que pour le comptage des
 * spectateurs uniques. Le MORCEAU, lui, est lu sur la ligne du live par le
 * serveur — jamais annoncé par le client, qui pourrait en changer.
 *
 * Règle de survie, la même que partout ailleurs : ce garde-fou ne doit
 * JAMAIS faire échouer un cœur. Table absente (SQL pas rejoué), base qui
 * traîne, réponse inattendue — on laisse passer et on compte, comme avant.
 * Un concert ne s'interrompt pas pour une question de statistiques.
 */

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

/**
 * Ce spectateur a-t-il DÉJÀ un cœur au compteur pour ce morceau ?
 *
 * Renvoie true seulement si on en est SÛR. Le moindre doute (table absente,
 * base injoignable, réponse illisible) répond false : mieux vaut un cœur de
 * trop qu'un cœur perdu.
 */
async function dejaCompte(base, liveId, songKey, device) {
  if (device === '' || songKey === '') return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`${base}/rest/v1/live_hearts`, {
      method: 'POST',
      headers: {
        ...sbHeaders(),
        // Le doublon n'est pas une erreur : c'est la réponse à la question.
        prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify({
        live_id: liveId,
        song_key: songKey,
        device,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return false; // table absente, RLS, panne : on compte
    const rows = await r.json();
    // Tableau vide = rien n'a été inséré = ce cœur existait déjà.
    return Array.isArray(rows) && rows.length === 0;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
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
    const demande = Math.max(1, Math.min(10, parseInt(req.body?.n, 10) || 1));
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const device = String(req.body?.device ?? '').slice(0, 80);

    // Multi-live (b121) : le spectateur précise SON direct.
    const liveId = String(req.body?.liveId ?? '').slice(0, 60);
    if (liveId !== '' && liveId !== 'legacy') {
      const r2 = await fetch(
        `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}&select=status,hearts,song&limit=1`,
        { headers: sbHeaders() },
      );
      const rows2 = r2.ok ? await r2.json() : [];
      const row2 = Array.isArray(rows2) && rows2[0] ? rows2[0] : null;
      if (!row2 || row2.status !== 'on') {
        res.status(409).json({ error: 'Aucun live en cours' });
        return;
      }
      // Le titre vient de la ligne du live, pas du client.
      const songKey = String(row2.song?.title ?? '').slice(0, 200);
      if (await dejaCompte(base, liveId, songKey, device)) {
        // Déjà aimé : on ne compte pas, mais ce n'est PAS une erreur — le
        // spectateur ne doit rien voir d'anormal.
        res.status(200).json({ hearts: row2.hearts ?? 0, compte: false });
        return;
      }
      // Un spectateur identifié ne vaut qu'un cœur, quel que soit le lot
      // envoyé ; sans identifiant (stockage indisponible), on garde l'ancien
      // comportement plutôt que de perdre le geste.
      const n = device !== '' && songKey !== '' ? 1 : demande;
      const hearts2 = (row2.hearts ?? 0) + n;
      const u2 = await fetch(
        `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}`,
        {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ hearts: hearts2 }),
        },
      );
      if (!u2.ok) {
        res.status(502).json({ error: `Supabase a répondu ${u2.status}` });
        return;
      }
      res.status(200).json({ hearts: hearts2, compte: true });
      return;
    }

    const r = await fetch(
      `${base}/rest/v1/live_state?id=eq.live&select=status,hearts,song`,
      { headers: sbHeaders() },
    );
    if (!r.ok) {
      res.status(502).json({ error: `Supabase a répondu ${r.status}` });
      return;
    }
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row || row.status !== 'on') {
      res.status(409).json({ error: 'Aucun live en cours' });
      return;
    }
    const songKey = String(row.song?.title ?? '').slice(0, 200);
    if (await dejaCompte(base, 'legacy', songKey, device)) {
      res.status(200).json({ hearts: row.hearts ?? 0, compte: false });
      return;
    }
    const n = device !== '' && songKey !== '' ? 1 : demande;
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
    res.status(200).json({ hearts, compte: true });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
