/**
 * LE FACTEUR DES GROUPES (b353, demande de Vincent : « tant que les
 * notifications ne sont pas possibles, envoyer des mails lorsque des
 * messages ou des ajouts de morceaux au répertoire du groupe sont
 * écrits »).
 *
 * Un cron Vercel appelle cette fonction toutes les 15 minutes. Elle lit ce
 * qui s'est écrit dans `band_messages` depuis son dernier passage (repère
 * `notif_state`) — messages ET morceaux proposés passent tous par cette
 * table (b174) — puis envoie à chaque membre concerné UN e-mail de résumé
 * par groupe. Jamais un e-mail par message : une conversation animée ne
 * doit pas devenir du spam.
 *
 * Règles :
 *  · l'AUTEUR n'est jamais notifié de ses propres écrits — exclusion par
 *    `user_id` (le compte), jamais par le nom (cicatrice b247) ;
 *  · le premier passage POSE le repère et n'envoie rien : on ne réveille
 *    pas tout le monde avec l'historique ;
 *  · le repère n'avance que si les envois ont pu partir — Resend muet,
 *    on réessaie au passage suivant plutôt que de perdre les e-mails ;
 *  · plafond d'envois par passage : un emballement ne vide jamais le
 *    quota d'e-mails ;
 *  · tout est best-effort : une panne ici ne casse RIEN dans l'app.
 *
 * Variables Vercel : RESEND_API_KEY (obligatoire — la même clé que le
 * SMTP Supabase), MAIL_FROM (facultative, « mojosong <marco@mojosong.com> »
 * par défaut). SQL : supabase/notify.sql (table notif_state).
 */

const REPERE = 'band_mail';
const MAX_ENVOIS = 50;
const MAX_LIGNES = 6;

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

function extrait(texte, max = 70) {
  const t = String(texte ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Ligne du résumé pour un message du fil. */
function ligne(m) {
  const auteur = String(m.author ?? '').trim() || 'Un musicien';
  if (m.kind === 'chanson') return `🎵 ${extrait(m.text)} — proposé par ${auteur}`;
  if (m.kind === 'repet' || m.kind === 'concert')
    return `📅 ${auteur} : ${extrait(m.text)}`;
  return `💬 ${auteur} : ${extrait(m.text)}`;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_KEY ||
      !process.env.RESEND_API_KEY
    ) {
      // Pas configuré : on ne pose même pas le repère.
      res.status(200).json({ skipped: 'non configuré' });
      return;
    }
    // Seul le cron Vercel a des raisons d'appeler — un appel étranger ne
    // déclenche rien (les envois sont de toute façon bornés par le repère).
    const ua = String(req.headers['user-agent'] ?? '');
    if (!ua.includes('vercel-cron')) {
      res.status(403).json({ error: 'Réservé au cron' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    // 1. Le repère — premier passage : on le pose et on s'arrête là.
    const rs = await fetch(
      `${base}/rest/v1/notif_state?id=eq.${REPERE}&select=last_at&limit=1`,
      { headers: sbHeaders() },
    );
    if (!rs.ok) {
      res.status(200).json({ skipped: 'notif_state absente (SQL pas joué)' });
      return;
    }
    const etats = await rs.json();
    if (!Array.isArray(etats) || etats.length === 0) {
      await fetch(`${base}/rest/v1/notif_state`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({ id: REPERE, last_at: new Date().toISOString() }),
      });
      res.status(200).json({ init: true });
      return;
    }
    const depuis = String(etats[0].last_at);
    // Borne haute à −60 s : on laisse retomber les écritures en vol.
    const jusqua = new Date(Date.now() - 60000).toISOString();
    if (jusqua <= depuis) {
      res.status(200).json({ sent: 0 });
      return;
    }

    // 2. Ce qui s'est écrit depuis. `select=*` en repli d'esprit b195 : on
    // nomme les colonnes du fichier SQL, qui crée cette table.
    const rm = await fetch(
      `${base}/rest/v1/band_messages?created_at=gt.${encodeURIComponent(depuis)}&created_at=lte.${encodeURIComponent(jusqua)}&select=band_id,user_id,author,kind,text,created_at&order=created_at.asc&limit=200`,
      { headers: sbHeaders() },
    );
    if (!rm.ok) {
      res.status(200).json({ skipped: `lecture messages ${rm.status}` });
      return;
    }
    const messages = await rm.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      await fetch(`${base}/rest/v1/notif_state?id=eq.${REPERE}`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ last_at: jusqua }),
      });
      res.status(200).json({ sent: 0 });
      return;
    }

    // 3. Les groupes concernés : nom, créateur, membres.
    const bandIds = [...new Set(messages.map((m) => String(m.band_id)))];
    const enc = encodeURIComponent;
    const inList = `in.(${bandIds.map(enc).join(',')})`;
    const [rb, rmb] = await Promise.all([
      fetch(`${base}/rest/v1/cloud_bands?id=${inList}&select=id,name,owner`, {
        headers: sbHeaders(),
      }),
      fetch(
        `${base}/rest/v1/cloud_band_members?band_id=${inList}&select=band_id,user_id`,
        { headers: sbHeaders() },
      ),
    ]);
    const bandsRows = rb.ok ? await rb.json() : [];
    const memberRows = rmb.ok ? await rmb.json() : [];
    const bands = new Map(
      (Array.isArray(bandsRows) ? bandsRows : []).map((b) => [
        String(b.id),
        { name: String(b.name ?? ''), owner: String(b.owner ?? '') },
      ]),
    );
    const membres = new Map(); // band_id → Set<user_id>
    for (const b of bandIds) {
      const set = new Set();
      const owner = bands.get(b)?.owner ?? '';
      if (owner !== '') set.add(owner);
      membres.set(b, set);
    }
    for (const m of Array.isArray(memberRows) ? memberRows : []) {
      membres.get(String(m.band_id))?.add(String(m.user_id));
    }

    // 4. Les adresses des destinataires (API admin, clé service).
    const userIds = new Set();
    for (const set of membres.values()) for (const u of set) userIds.add(u);
    const emails = new Map(); // user_id → email
    for (const uid of [...userIds].slice(0, 60)) {
      try {
        const ru = await fetch(`${base}/auth/v1/admin/users/${enc(uid)}`, {
          headers: sbHeaders(),
        });
        if (!ru.ok) continue;
        const u = await ru.json();
        const em = String(u?.email ?? '').trim();
        if (em !== '') emails.set(uid, em);
      } catch {
        /* un destinataire illisible n'empêche pas les autres */
      }
    }

    // 5. Un résumé par (membre, groupe) — sans ses propres écrits.
    let envoyes = 0;
    let echecs = 0;
    for (const bandId of bandIds) {
      if (envoyes >= MAX_ENVOIS) break;
      const nom = bands.get(bandId)?.name || 'Ton groupe';
      const duGroupe = messages.filter((m) => String(m.band_id) === bandId);
      for (const uid of membres.get(bandId) ?? []) {
        if (envoyes >= MAX_ENVOIS) break;
        const email = emails.get(uid);
        if (!email) continue;
        const pourLui = duGroupe.filter((m) => String(m.user_id) !== uid);
        if (pourLui.length === 0) continue;
        const lignes = pourLui.slice(0, MAX_LIGNES).map(ligne);
        if (pourLui.length > MAX_LIGNES) {
          lignes.push(`… et ${pourLui.length - MAX_LIGNES} de plus`);
        }
        const corps =
          `Du nouveau dans ${nom} :\n\n${lignes.join('\n')}\n\n` +
          `Ouvre mojosong pour répondre ou écouter : https://mojosong.com\n\n` +
          `—\nTu reçois cet e-mail parce que tu es membre de « ${nom} » sur mojosong.`;
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
              subject: `Du nouveau dans ${nom}`,
              text: corps,
            }),
          });
          if (rr.ok) envoyes++;
          else echecs++;
        } catch {
          echecs++;
        }
      }
    }

    // 6. Le repère n'avance que si le courrier a pu partir : tout en échec
    // (Resend en panne), on réessaiera au prochain passage.
    if (envoyes > 0 || echecs === 0) {
      await fetch(`${base}/rest/v1/notif_state?id=eq.${REPERE}`, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify({ last_at: jusqua }),
      });
    }
    res.status(200).json({ sent: envoyes, failed: echecs });
  } catch {
    res.status(200).json({ skipped: 'erreur inattendue' });
  }
}
