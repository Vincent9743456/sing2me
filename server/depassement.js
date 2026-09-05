/**
 * L'HORLOGE DU DÉPASSEMENT (b422, arbitrage Vincent + Marco).
 *
 * Un compte repassé en gratuit au-dessus du plafond (PLAFOND) a 30 jours
 * pour choisir — se réabonner, ou revenir au plafond — avant le tri
 * (côté client, à l'ouverture : le serveur ne touche JAMAIS aux
 * bibliothèques). Ce cron quotidien :
 *  1. repère les comptes gratuits au-dessus du plafond
 *     (`comptes_en_depassement`, plans.sql) et POSE l'horloge
 *     (`depassement_avis.depuis`) — c'est elle que l'app lit pour le
 *     compte à rebours et le tri ;
 *  2. EFFACE la ligne d'un compte revenu dans les clous (réabonné, ou
 *     redescendu sous le plafond) : motif disparu, tout se lève seul (règle 11) ;
 *  3. envoie les E-MAILS DE PRÉVENANCE (demande de Vincent) : à
 *     l'ouverture du délai, chaque semaine, puis chaque jour les 3
 *     derniers jours. Jamais deux avis à moins de 20 h d'écart
 *     (`dernier_avis`).
 *
 * Tout est best-effort : Resend muet, table absente (SQL pas joué), rien
 * ne casse — on réessaie au passage suivant. Variables : SUPABASE_URL,
 * SUPABASE_SERVICE_KEY, RESEND_API_KEY, MAIL_FROM (facultative).
 */

const JOURS_DE_GRACE = 30;
const PLAFOND = 30; // = limites.ts (free.maxSongs) et plans.sql (v_max) — 50→30 en b424
const MAX_ENVOIS = 40;
const JOUR_MS = 86400000;

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

function dateFr(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(d).slice(0, 10);
  }
}

function dateEn(d) {
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(d).slice(0, 10);
  }
}

/** Le corps commun : ce qui va se passer, et les deux sorties.
 *  Bilingue SYSTÉMATIQUE (b423, décision Vincent) : français d'abord,
 *  anglais en dessous — on ne connaît pas la langue du destinataire. */
function corps(morceaux, echeanceLe) {
  return (
    `Ta bibliothèque mojosong compte ${morceaux} morceaux, et le plan ` +
    `gratuit en garde ${PLAFOND}.\n\n` +
    `Jusqu'au ${dateFr(echeanceLe)}, rien ne bouge : tu peux repasser en ` +
    `illimité, ou choisir toi-même ce que tu gardes. Ensuite, l'application ` +
    `gardera automatiquement les ${PLAFOND} morceaux les plus utilisés (ceux de tes ` +
    `setlists et de tes concerts d'abord) — les morceaux venus d'un groupe ` +
    `retourneront dans ses propositions, les autres seront supprimés.\n\n` +
    `À tout moment, tu peux exporter TOUTE ta bibliothèque depuis les ` +
    `Réglages : rien n'est pris en otage.\n\n` +
    `Ouvre mojosong : https://mojosong.com\n\n` +
    `— English —\n\n` +
    `Your mojosong library holds ${morceaux} songs, and the free plan ` +
    `keeps ${PLAFOND}.\n\n` +
    `Until ${dateEn(echeanceLe)}, nothing changes: you can go unlimited ` +
    `again, or choose what to keep yourself. After that, the app will ` +
    `automatically keep your ${PLAFOND} most-used songs (those in your setlists ` +
    `and concerts first) — songs that came from a band will return to its ` +
    `suggestions, the others will be deleted.\n\n` +
    `You can export your WHOLE library from Settings at any time: nothing ` +
    `is held hostage.\n\n` +
    `Open mojosong: https://mojosong.com\n\n` +
    `—\nTu reçois cet e-mail parce que ta bibliothèque dépasse le plan ` +
    `gratuit de mojosong.\n` +
    `You're receiving this because your library exceeds mojosong's free plan.`
  );
}

function sujet(joursRestants) {
  if (joursRestants <= 0)
    return `Ta bibliothèque va être ramenée à ${PLAFOND} morceaux · your library will be trimmed to ${PLAFOND}`;
  if (joursRestants === 1)
    return 'Dernier jour : tri automatique demain · last day before the automatic trim';
  if (joursRestants <= 3)
    return `Plus que ${joursRestants} jours avant le tri automatique · ${joursRestants} days left`;
  return `Ta bibliothèque dépasse le plan gratuit — ${joursRestants} jours pour choisir · ${joursRestants} days to choose`;
}

/** Faut-il écrire aujourd'hui ? J0 (ouverture), chaque semaine, puis
 *  chaque jour les 3 derniers jours. */
function doitEcrire(joursEcoules, joursRestants) {
  if (joursEcoules === 0) return true;
  if (joursRestants <= 3) return true;
  return joursEcoules % 7 === 0;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_KEY ||
      !process.env.RESEND_API_KEY
    ) {
      res.status(200).json({ skipped: 'non configuré' });
      return;
    }
    const ua = String(req.headers['user-agent'] ?? '');
    if (!ua.includes('vercel-cron')) {
      res.status(403).json({ error: 'Réservé au cron' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const enc = encodeURIComponent;
    const now = Date.now();

    // 0. CLÔTURE DE SECOURS DES LIVES ABANDONNÉS (b498) : l'auto-arrêt
    // d'api/live.js est paresseux (il n'agit qu'à la lecture) — un live que
    // plus personne ne sonde restait « on » sans fin, durées fausses. Le
    // balayage SQL clôt et date la fin AU MOMENT de l'expiration. Best-effort
    // (RPC absente tant que live.sql n'est pas rejoué) : jamais bloquant.
    let livesBalayes = null;
    try {
      const bal = await fetch(
        `${base}/rest/v1/rpc/balayer_lives_abandonnes`,
        { method: 'POST', headers: sbHeaders(), body: '{}' },
      );
      if (bal.ok) livesBalayes = await bal.json().catch(() => null);
    } catch {
      /* le reste du cron ne dépend pas du balayage */
    }

    // 1. Les comptes gratuits au-dessus du plafond (RPC service_role).
    const rd = await fetch(`${base}/rest/v1/rpc/comptes_en_depassement`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ p_max: PLAFOND }),
    });
    if (!rd.ok) {
      res.status(200).json({ skipped: `rpc ${rd.status} (SQL pas joué ?)` });
      return;
    }
    const dep = await rd.json();
    const surLeFil = new Map(
      (Array.isArray(dep) ? dep : []).map((r) => [
        String(r.user_id),
        Number(r.morceaux ?? 0),
      ]),
    );

    // 2. Les horloges déjà posées.
    const rl = await fetch(
      `${base}/rest/v1/depassement_avis?select=user_id,depuis,dernier_avis`,
      { headers: sbHeaders() },
    );
    if (!rl.ok) {
      res.status(200).json({ skipped: `avis ${rl.status} (SQL pas joué ?)` });
      return;
    }
    const lignes = await rl.json();
    const horloges = new Map(
      (Array.isArray(lignes) ? lignes : []).map((l) => [
        String(l.user_id),
        l,
      ]),
    );

    // 3. Revenus dans les clous : le motif disparaît, la ligne aussi.
    let fermes = 0;
    for (const uid of horloges.keys()) {
      if (surLeFil.has(uid)) continue;
      await fetch(`${base}/rest/v1/depassement_avis?user_id=eq.${enc(uid)}`, {
        method: 'DELETE',
        headers: sbHeaders(),
      });
      fermes++;
    }

    // 4. Nouveaux dépassements : on pose l'horloge (l'avis J0 part au 5).
    for (const uid of surLeFil.keys()) {
      if (horloges.has(uid)) continue;
      const ligne = { user_id: uid, depuis: new Date(now).toISOString() };
      const ri = await fetch(`${base}/rest/v1/depassement_avis`, {
        method: 'POST',
        headers: { ...sbHeaders(), prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(ligne),
      });
      if (ri.ok) horloges.set(uid, { ...ligne, dernier_avis: null });
    }

    // 5. Les avis du jour.
    let envoyes = 0;
    let echecs = 0;
    for (const [uid, morceaux] of surLeFil) {
      if (envoyes >= MAX_ENVOIS) break;
      const h = horloges.get(uid);
      if (!h) continue; // horloge pas posée (insert raté) : au prochain tour
      const depuis = new Date(h.depuis).getTime();
      const joursEcoules = Math.floor((now - depuis) / JOUR_MS);
      const joursRestants = JOURS_DE_GRACE - joursEcoules;
      if (!doitEcrire(joursEcoules, joursRestants)) continue;
      // Jamais deux avis à moins de 20 h d'écart.
      const dernier = h.dernier_avis ? new Date(h.dernier_avis).getTime() : 0;
      if (now - dernier < 20 * 3600000) continue;
      // L'adresse du compte (API admin, clé service — comme notify.js).
      let email = '';
      try {
        const ru = await fetch(`${base}/auth/v1/admin/users/${enc(uid)}`, {
          headers: sbHeaders(),
        });
        if (ru.ok) email = String((await ru.json())?.email ?? '').trim();
      } catch {
        /* un destinataire illisible n'empêche pas les autres */
      }
      if (email === '') continue;
      const echeanceLe = depuis + JOURS_DE_GRACE * JOUR_MS;
      try {
        const rr = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM || 'mojosong <marco@mojosong.com>',
            to: [email],
            subject: sujet(joursRestants),
            text: corps(morceaux, echeanceLe),
          }),
        });
        if (rr.ok) {
          envoyes++;
          // L'avis n'est noté QUE s'il est parti (esprit notify.js).
          await fetch(
            `${base}/rest/v1/depassement_avis?user_id=eq.${enc(uid)}`,
            {
              method: 'PATCH',
              headers: sbHeaders(),
              body: JSON.stringify({
                dernier_avis: new Date(now).toISOString(),
              }),
            },
          );
        } else echecs++;
      } catch {
        echecs++;
      }
    }

    res
      .status(200)
      .json({ over: surLeFil.size, sent: envoyes, failed: echecs, closed: fermes, livesBalayes });
  } catch {
    res.status(200).json({ skipped: 'erreur inattendue' });
  }
}
