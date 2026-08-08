/**
 * Fonction serveur Vercel : livre d'or du public.
 * POST /api/message {name?, text, liveId?, artist?, bandId?, songTitle?} — public
 * GET  /api/message?performer=a,b  — réservé à l'artiste (x-live-key)
 *
 * RÈGLE D'ATTACHEMENT (b168) — un mot du public appartient à QUELQU'UN :
 *   • toujours à l'artiste (ou au groupe) qui joue — `performer` / `band_id` ;
 *   • à la setlist jouée quand il y en a une — `setlist_name` ;
 *   • au concert quand un concert est lancé — `concert_id` / `concert_title` ;
 *   • au morceau écouté à cet instant, s'il y en a un — `song_title`.
 * Aucun de ces contextes n'est OBLIGATOIRE : un mot laissé sur la page d'un
 * artiste hors direct part quand même, rattaché à son compte. Un livre d'or
 * qui refuse un message parce qu'il manque un contexte est un livre d'or
 * cassé.
 */

function sbHeaders(json) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const h = { apikey: key, authorization: `Bearer ${key}` };
  if (json) h['content-type'] = 'application/json';
  return h;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Colonnes RÉELLES de live_messages, lues une fois par instance.
 *
 * Pourquoi : les fichiers `supabase/*.sql` sont ré-exécutés à la main. Une
 * base en retard d'une migration faisait échouer l'insertion en 400 pour une
 * colonne inconnue, et le message du spectateur était perdu. On demande donc
 * à PostgREST ce qu'il connaît, et on n'écrit QUE ça. `null` = on n'a pas pu
 * savoir : on retombe alors sur l'écriture minimale.
 */
let columnsCache = null;

async function knownColumns(base) {
  if (columnsCache !== null) return columnsCache;
  try {
    const r = await fetch(`${base}/rest/v1/`, { headers: sbHeaders(false) });
    if (!r.ok) return null;
    const doc = await r.json();
    const props = doc?.definitions?.live_messages?.properties;
    if (!props || typeof props !== 'object') return null;
    columnsCache = new Set(Object.keys(props));
    return columnsCache;
  } catch {
    return null;
  }
}

/** Contexte du direct en cours : par son identifiant, sinon par l'artiste. */
async function liveContext(base, liveId, artistName) {
  const cols = 'status,song,artist,concert,setlist_name,band_id';
  let url = null;
  if (liveId !== '' && liveId !== 'legacy' && UUID_RE.test(liveId)) {
    url = `${base}/rest/v1/lives?id=eq.${encodeURIComponent(liveId)}&select=${cols}&limit=1`;
  } else if (artistName !== '') {
    // Le spectateur n'a plus de code de session (b169) : c'est le NOM de
    // l'artiste dont il regarde la page qui désigne le direct.
    const safe = artistName.slice(0, 120).replace(/[%_]/g, '');
    url = `${base}/rest/v1/lives?artist->>name=ilike.${encodeURIComponent(safe)}&status=neq.off&select=${cols}&order=started_at.desc&limit=1`;
  } else {
    url = `${base}/rest/v1/live_state?id=eq.live&select=status,song,artist,concert`;
  }
  try {
    const r = await fetch(url, { headers: sbHeaders(false) });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

/** Détail technique d'une réponse PostgREST (jamais montré au spectateur). */
async function failureDetail(r) {
  if (!r) return 'aucune réponse';
  let body = '';
  try {
    body = (await r.text()).slice(0, 300);
  } catch {
    /* corps illisible */
  }
  return `${r.status} ${body}`;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.status(501).json({ error: 'Mode ON AIR non configuré' });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    if (req.method === 'POST') {
      const text = (req.body?.text ?? '').toString().trim().slice(0, 500);
      const author = (req.body?.name ?? '').toString().trim().slice(0, 60);
      if (text === '') {
        res.status(400).json({ error: 'Message vide' });
        return;
      }
      const liveId = String(req.body?.liveId ?? '').slice(0, 60);
      const pageArtist = String(req.body?.artist ?? '')
        .trim()
        .slice(0, 120);

      const row = await liveContext(base, liveId, pageArtist);
      const onAir = row?.status === 'on';
      // Le propriétaire du mot : l'artiste du direct, sinon celui dont le
      // spectateur regarde la page. Un message sans propriétaire serait
      // invisible pour tout le monde.
      const performer = (row?.artist?.name ?? '') || pageArtist;
      const bandId =
        (typeof row?.band_id === 'string' ? row.band_id : '') ||
        String(req.body?.bandId ?? '').slice(0, 60);
      const songTitle =
        (onAir ? (row?.song?.title ?? '') : '') ||
        (req.body?.songTitle ?? '').toString().trim().slice(0, 200);

      const full = {
        author,
        body: text,
        performer,
        band_id: bandId,
        song_title: songTitle,
        setlist_name: (row?.setlist_name ?? '').toString().slice(0, 200),
        concert_id: (row?.concert?.id ?? '').toString().slice(0, 80),
        concert_title: (row?.concert?.title ?? '').toString().slice(0, 200),
        live_id:
          liveId !== '' && liveId !== 'legacy' && UUID_RE.test(liveId)
            ? liveId
            : null,
      };
      // On n'écrit que des colonnes qui existent vraiment ; `author` et
      // `body` sont là depuis le premier jour et servent de repli.
      const cols = await knownColumns(base);
      const payload = cols
        ? Object.fromEntries(
            Object.entries(full).filter(([k]) => cols.has(k)),
          )
        : { author, body: text };
      if (!payload.body) payload.body = text;

      const insert = (p) =>
        fetch(`${base}/rest/v1/live_messages`, {
          method: 'POST',
          headers: sbHeaders(true),
          body: JSON.stringify(p),
        });

      let r = await insert(payload);
      let detail = '';
      if (!r.ok) {
        detail = await failureDetail(r);
        // Le schéma a peut-être bougé depuis notre lecture (migration jouée
        // à la main entre-temps) : on le relit une fois avant d'abandonner
        // le contexte.
        columnsCache = null;
        const fresh = await knownColumns(base);
        const retry = fresh
          ? Object.fromEntries(
              Object.entries(full).filter(([k]) => fresh.has(k)),
            )
          : null;
        if (retry && JSON.stringify(retry) !== JSON.stringify(payload)) {
          r = await insert(retry);
          if (!r.ok) detail += ` | relecture: ${await failureDetail(r)}`;
        }
        if (!r.ok) {
          // Dernière chance : l'écriture minimale, celle qui ne dépend
          // d'aucune migration. Un mot du public ne se perd pas pour une
          // colonne.
          r = await insert({ author, body: text });
          if (!r.ok) detail += ` | minimal: ${await failureDetail(r)}`;
        }
      }
      if (!r.ok) {
        // `unavailable` : le livre d'or n'existe pas sur cette installation
        // (table absente, droits) — la page publique masque la boîte au lieu
        // d'afficher une erreur au spectateur.
        const status = r.status;
        const unavailable = status === 404 || status === 401 || status === 403;
        // Le détail technique n'est JAMAIS montré spontanément : il n'apparaît
        // que sur demande explicite (page publique ouverte avec ?diag=1).
        console.error('livre d’or — insertion refusée :', detail);
        res.status(unavailable ? 200 : 502).json({
          error: unavailable
            ? "Le livre d'or est indisponible."
            : "Ton mot n'est pas parti — réessaie dans un instant.",
          code: unavailable ? 'unavailable' : 'failed',
          detail,
        });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      if (
        !process.env.LIVE_KEY ||
        req.headers['x-live-key'] !== process.env.LIVE_KEY
      ) {
        res.status(403).json({ error: 'Clé On Air incorrecte' });
        return;
      }
      // Les mots appartiennent à l'artiste ou au groupe qui jouait : chacun
      // ne lit QUE les siens. La clé ON AIR est commune à l'installation —
      // sans ce filtre, tout le monde voyait les mots de tout le monde.
      // `performer.eq.` garde les lignes d'avant la colonne.
      const who = String(req.query?.performer ?? '').slice(0, 600);
      const names = who
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n !== '')
        .slice(0, 20);
      // Le tri « à qui appartient ce mot » se fait EN MÉMOIRE (b175), plus
      // par un filtre PostgREST. Le filtre `or=(performer.eq.,…)` dépendait
      // de la présence de la colonne, de l'échappement du nom et d'une
      // égalité stricte : trois façons de renvoyer une liste vide sans
      // qu'on sache laquelle. Ici on lit, puis on garde ce qui est à nous.
      // `live_id` (b186) : rattachement EXACT d'un mot à son concert —
      // l'heure seule mélangeait les directs de deux musiciens.
      const selects = [
        'author,body,song_title,setlist_name,performer,band_id,live_id,concert_id,concert_title,created_at',
        'author,body,song_title,setlist_name,performer,band_id,concert_id,concert_title,created_at',
        'author,body,song_title,setlist_name,performer,concert_id,concert_title,created_at',
        'author,body,song_title,performer,concert_id,concert_title,created_at',
        'author,body,song_title,performer,created_at',
        'author,body,created_at',
      ];
      let r = null;
      for (const sel of selects) {
        r = await fetch(
          `${base}/rest/v1/live_messages?select=${sel}&order=created_at.desc&limit=400`,
          { headers: sbHeaders(false) },
        );
        if (r.ok) break;
        if (r.status !== 400 && r.status !== 422) break;
      }
      if (!r || !r.ok) {
        // Livre d'or absent : liste vide plutôt qu'une erreur qui casse
        // l'écran de statistiques de l'artiste.
        res.status(200).json({ messages: [] });
        return;
      }
      const rows = await r.json();
      const all = Array.isArray(rows) ? rows : [];
      // Comparaison SOUPLE : casse et espaces ne doivent pas faire perdre un
      // mot du public. Un message sans propriétaire (avant b168, ou laissé
      // hors direct) revient à celui qui demande — sinon il serait invisible
      // pour tout le monde, ce qui est pire que de le montrer à son auteur.
      const norm = (v) => String(v ?? '').trim().toLowerCase();
      const mine = new Set(names.map(norm));
      const messages =
        mine.size === 0
          ? all
          : all.filter((m) => {
              const who = norm(m.performer);
              return who === '' || mine.has(who);
            });
      res.status(200).json({ messages });
      return;
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
