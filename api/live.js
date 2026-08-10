/**
 * Fonction serveur Vercel : mode ON AIR — MULTI-LIVE (b121).
 *
 * Plusieurs directs peuvent tourner EN MÊME TEMPS : chaque GO LIVE crée sa
 * ligne dans `lives`, avec un code de salon à 6 chiffres (rejoindre sans
 * QR) et un jeton d'écriture propre au lanceur (seul lui pilote SON live).
 *
 * GET  /api/live                 → live actif le plus récent (repli legacy)
 * GET  /api/live?code=482913     → le live actif portant ce code
 * GET  /api/live?id=<uuid>       → ce live précis
 * GET  /api/live?band=c1,c2      → live actif d'un de ces groupes (bannière)
 * GET  /api/live?setlist=1[&…]   → setlist du live résolu
 * POST /api/live (x-live-key)    → multi (liveId+writeToken) ou legacy
 *
 * Sécurité honnête (mesure, pas d'argent en jeu) : x-live-key reste la
 * porte d'entrée d'écriture globale ; le write_token garantit qu'un
 * lanceur ne pilote que son propre direct. Auto-arrêt par live : 4 h max,
 * ou 1 h sans nouvelle partition. L'ancienne ligne `live_state` reste
 * lue/écrite en repli pour les bundles pas encore à jour.
 */
import { identifie, refuse } from '../server/identity.js';


function configured() {
  return (
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_KEY &&
    !!process.env.LIVE_KEY
  );
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

const AUTO_STOP_MAX_MS = 4 * 60 * 60 * 1000; // 4 h après le début
const AUTO_STOP_IDLE_MS = 60 * 60 * 1000; // 1 h sans partition
function liveExpired(row) {
  const now = Date.now();
  const started = row?.started_at ? Date.parse(row.started_at) : NaN;
  const lastSong = row?.last_song_at ? Date.parse(row.last_song_at) : NaN;
  if (!Number.isNaN(started) && now - started > AUTO_STOP_MAX_MS) return true;
  const ref = !Number.isNaN(lastSong) ? lastSong : started;
  if (!Number.isNaN(ref) && now - ref > AUTO_STOP_IDLE_MS) return true;
  return false;
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const sanitizeSetlist = (v) =>
  Array.isArray(v)
    ? v.slice(0, 60).map((s) => ({
        title: typeof s?.title === 'string' ? s.title.slice(0, 200) : '',
        artist: typeof s?.artist === 'string' ? s.artist.slice(0, 200) : '',
        lyrics: typeof s?.lyrics === 'string' ? s.lyrics.slice(0, 8000) : '',
      }))
    : [];

/** Archive la partition jouée (registre « setlist souvenir » + stats). */
async function archivePlayedSong(base, row) {
  const title = row?.song?.title ?? '';
  if (title === '') return;
  let ins = await fetch(`${base}/rest/v1/live_stats`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      song_title: title,
      song_artist: row.song?.artist ?? '',
      hearts: row.hearts ?? 0,
      // À qui appartiennent ces ❤ (b138) : la clé ON AIR étant commune,
      // c'est le seul moyen de rendre à chacun ses statistiques.
      performer: row.artist?.name ?? '',
      // Setlist tournée pendant ce live (b180) : l'historique l'annonce.
      setlist_name: row.setlist_name ?? '',
      // Propriétaire du live (b192) : le seul repère qui ne change jamais.
      owner_id: row.owner_id ?? null,
      concert_id: row.concert?.id ?? '',
      concert_title: row.concert?.title ?? '',
      session_id: row.session_id ?? null,
      played_at: new Date().toISOString(),
    }),
  });
  if (ins.status === 400) {
    await fetch(`${base}/rest/v1/live_stats`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        song_title: title,
        song_artist: row.song?.artist ?? '',
        hearts: row.hearts ?? 0,
        played_at: new Date().toISOString(),
      }),
    });
  }
}

/** Fige le nombre d'uniques et l'heure de fin d'une session ON AIR. */
async function finalizeSession(base, sessionId) {
  if (!sessionId) return;
  let uniques = 0;
  try {
    const c = await fetch(
      `${base}/rest/v1/live_attendance?session_id=eq.${sessionId}&select=device_id`,
      { headers: { ...sbHeaders(), prefer: 'count=exact' } },
    );
    const range = c.headers.get('content-range') || '';
    const m = /\/(\d+)$/.exec(range);
    uniques = m ? parseInt(m[1], 10) : 0;
  } catch {
    /* comptage best-effort */
  }
  await fetch(`${base}/rest/v1/live_sessions?id=eq.${sessionId}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ ended_at: new Date().toISOString(), uniques }),
  });
}

/** Clôt un live (auto-arrêt ou arrêt manuel) : archive, finalise, purge. */
async function closeLive(base, row) {
  try {
    const claim = await fetch(
      `${base}/rest/v1/lives?id=eq.${row.id}&status=neq.off`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders(), prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'off',
          // Ce qui n'a plus lieu d'être une fois le direct fini.
          song: null,
          band_song: null,
          setlist: null,
          setlist_count: 0,
          join_code: '',
          last_song_at: null,
          hearts: 0,
          // b182 : on CONSERVE started_at, artist, band_id, setlist_name et
          // concert. La ligne devient la trace du live : c'est elle qui dit
          // quand il a commencé, qui jouait et sur quelle setlist. Les
          // effacer rendait tout historique live-par-live impossible —
          // il fallait alors deviner les frontières au temps écoulé.
          updated_at: new Date().toISOString(),
        }),
      },
    );
    let claimed = [];
    try {
      claimed = await claim.json();
    } catch {
      claimed = [];
    }
    if (Array.isArray(claimed) && claimed.length > 0) {
      await archivePlayedSong(base, row);
      await finalizeSession(base, row.session_id);
      // b180 — LES MOTS DU PUBLIC NE SONT PLUS EFFACÉS À LA CLÔTURE.
      // Ils l'étaient pour qu'un nouveau direct n'hérite pas des messages
      // du précédent. Mais chaque message porte son `live_id` et son
      // horodatage : l'historique sait déjà à quel concert il appartient.
      // La purge ne protégeait donc plus rien — elle détruisait
      // simplement, à chaque « Arrêter », ce que le public venait
      // d'écrire. C'est ce qui vidait la table.
    }
  } catch {
    /* clôture best-effort */
  }
}

// `setlist_name` voyage avec la ligne : sans lui, le morceau archivé à la
// clôture perdait le nom du set qui tournait (b182).
const LIVE_COLS =
  'id,join_code,status,mode,song,artist,hearts,band_song,concert,setlist_count,setlist_name,updated_at,band_id,started_by,owner_id,started_at,last_song_at,session_id';

/**
 * À QUI APPARTIENT UNE ADRESSE PUBLIQUE (b227).
 *
 * Renvoie `{ ownerId, nom }` — l'identifiant du COMPTE derrière `/lenom`, et
 * son nom d'affichage (gardé pour le repli sur les vieux directs, qui n'ont
 * pas d'`owner_id`).
 *
 * Deux sortes d'adresses, une seule porte : celle d'un artiste
 * (`public_pages`), et celle d'un GROUPE (`band_pages`), qui est un MIROIR
 * vers son détenteur — lu à la volée sur `cloud_bands.owner`, la colonne que
 * `transfer_band` met à jour. Transmettre le groupe déplace donc le miroir
 * sans qu'aucune donnée n'ait à être recopiée.
 */
async function proprietaireDeLAdresse(base, nomPublic) {
  const enc = encodeURIComponent;
  const nom = String(nomPublic).slice(0, 30).toLowerCase();
  if (!/^[a-z0-9]{3,30}$/.test(nom)) return null;
  try {
    const r = await fetch(
      `${base}/rest/v1/public_pages?name=eq.${enc(nom)}&select=user_id,profile&limit=1`,
      { headers: sbHeaders() },
    );
    if (r.ok) {
      const rows = await r.json();
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (row) {
        return { ownerId: row.user_id ?? '', nom: row.profile?.name ?? '' };
      }
    }
    // Adresse de groupe : on remonte au détenteur.
    const rb = await fetch(
      `${base}/rest/v1/band_pages?name=eq.${enc(nom)}&select=band_id&limit=1`,
      { headers: sbHeaders() },
    );
    if (!rb.ok) return null;
    const bandes = await rb.json();
    const bande = Array.isArray(bandes) && bandes[0] ? bandes[0] : null;
    if (!bande?.band_id) return null;
    const rc = await fetch(
      `${base}/rest/v1/cloud_bands?id=eq.${enc(bande.band_id)}&select=owner,name&limit=1`,
      { headers: sbHeaders() },
    );
    if (!rc.ok) return null;
    const cb = await rc.json();
    const groupe = Array.isArray(cb) && cb[0] ? cb[0] : null;
    if (!groupe?.owner) return null;
    // Le nom d'affichage utile au repli est celui du GROUPE : c'est lui que
    // porte un direct lancé au nom du groupe.
    return { ownerId: groupe.owner, nom: groupe.name ?? '' };
  } catch {
    return null;
  }
}

/** Résout le live visé par la requête GET (code / id / band / page / défaut). */
async function resolveLive(base, q) {
  const enc = encodeURIComponent;
  let url = null;
  const code = String(q?.code ?? '').replace(/\D/g, '');
  if (code.length === 6) {
    url = `${base}/rest/v1/lives?join_code=eq.${code}&status=neq.off&select=${LIVE_COLS}&order=started_at.desc&limit=1`;
  } else if (q?.id) {
    url = `${base}/rest/v1/lives?id=eq.${enc(String(q.id))}&select=${LIVE_COLS}&limit=1`;
  } else if (q?.band) {
    const ids = String(q.band)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .slice(0, 20);
    if (ids.length === 0) return null;
    url = `${base}/rest/v1/lives?band_id=in.(${ids.map(enc).join(',')})&status=neq.off&select=${LIVE_COLS}&order=started_at.desc&limit=1`;
  } else if (q?.page) {
    /**
     * ADRESSE PUBLIQUE → LE DIRECT DE CE COMPTE-LÀ (b227).
     *
     * Avant, `/sonnom` cherchait le direct par NOM AFFICHÉ. Or un nom
     * d'affichage n'est pas unique : rien n'empêche cinq Vincent. Les cinq
     * avaient bien cinq adresses distinctes — l'unicité de `public_pages`
     * tient — mais tombaient tous sur le MÊME concert, le plus récent. La
     * promesse « une adresse, la tienne » se brisait une couche plus bas.
     *
     * On résout donc par COMPTE (`owner_id`, b192), qui ne change jamais.
     * Le repli par nom reste pour les directs lancés avant b192, qui n'ont
     * pas d'`owner_id` : on ne casse pas un historique pour un correctif.
     */
    const proprio = await proprietaireDeLAdresse(base, q.page);
    if (!proprio) return null;
    if (proprio.ownerId !== '') {
      const parCompte = await fetch(
        `${base}/rest/v1/lives?owner_id=eq.${enc(proprio.ownerId)}&status=neq.off` +
          `&select=${LIVE_COLS}&order=started_at.desc&limit=1`,
        { headers: sbHeaders() },
      );
      if (parCompte.ok) {
        const rows = await parCompte.json();
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    }
    // Repli : un direct d'avant b192, reconnu à son nom.
    const nom = String(proprio.nom).slice(0, 120).replace(/[%_,()"]/g, '').trim();
    if (nom === '') return null;
    url =
      `${base}/rest/v1/lives?status=neq.off&select=${LIVE_COLS}` +
      `&or=(artist->>name.ilike.${enc(nom)},started_by.ilike.${enc(nom)})` +
      `&owner_id=is.null&order=started_at.desc&limit=1`;
  } else if (q?.artist) {
    // Page publique d'un artiste : SON live actif.
    //
    // Deux façons d'être « le sien » (b182) : le direct porte son nom, OU
    // c'est LUI qui l'a lancé. Un concert lancé au nom d'un groupe porte le
    // nom du GROUPE — la page /sonnom ne trouvait alors plus rien, et le
    // public restait devant une fiche statique pendant que ça jouait.
    // `ilike` sans jokers = comparaison exacte insensible à la casse ; les
    // % et _ du nom sont neutralisés, ainsi que les caractères qui servent
    // de grammaire à `or=(…)` — un nom vide après nettoyage ne doit surtout
    // pas se transformer en « n'importe quel direct ».
    const name = String(q.artist).slice(0, 120).replace(/[%_,()"]/g, '').trim();
    if (name === '') return null;
    url =
      `${base}/rest/v1/lives?status=neq.off&select=${LIVE_COLS}` +
      `&or=(artist->>name.ilike.${enc(name)},started_by.ilike.${enc(name)})` +
      `&order=started_at.desc&limit=1`;
  } else {
    url = `${base}/rest/v1/lives?status=neq.off&select=${LIVE_COLS}&order=started_at.desc&limit=1`;
  }
  let r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok && url.includes('setlist_name,')) {
    // Colonne facultative absente (supabase/live.sql pas rejoué) : on redemande
    // sans elle plutôt que de rendre le direct introuvable. Jamais de coupure
    // en plein concert pour un nom de setlist.
    r = await fetch(url.replace('setlist_name,', ''), { headers: sbHeaders() });
  }
  if (!r.ok && url.includes('owner_id,')) {
    // Colonne b192 pas encore créée : on redemande sans elle.
    r = await fetch(url.replace('owner_id,', '').replace('setlist_name,', ''), {
      headers: sbHeaders(),
    });
  }
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Ligne legacy live_state (vieux bundles encore en direct). */
async function legacyRow(base) {
  try {
    const r = await fetch(
      `${base}/rest/v1/live_state?id=eq.live&select=status,mode,song,artist,hearts,band_song,concert,setlist_count,updated_at,band_id,started_by,started_at,last_song_at,session_id`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

function offView() {
  return {
    id: '',
    joinCode: '',
    status: 'off',
    mode: 'concert',
    song: null,
    artist: null,
    hearts: 0,
    bandSong: null,
    concert: null,
    setlistCount: 0,
    updatedAt: new Date().toISOString(),
    bandId: '',
    startedBy: '',
  };
}

function publicView(row, id = '') {
  return {
    id: row.id ?? id,
    joinCode: typeof row.join_code === 'string' ? row.join_code : '',
    status: row.status ?? 'off',
    mode: row.mode === 'repet' ? 'repet' : 'concert',
    song: row.song ?? null,
    artist: row.artist ?? null,
    hearts: row.hearts ?? 0,
    bandSong: row.band_song ?? null,
    concert: row.concert ?? null,
    setlistCount:
      typeof row.setlist_count === 'number' ? row.setlist_count : 0,
    updatedAt: row.updated_at ?? null,
    bandId: typeof row.band_id === 'string' ? row.band_id : '',
    startedBy: typeof row.started_by === 'string' ? row.started_by : '',
  };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (!configured()) {
      res.status(501).json({
        error:
          "Le mode ON AIR n'est pas configuré : ajoute SUPABASE_URL, " +
          'SUPABASE_SERVICE_KEY et LIVE_KEY dans Vercel, exécute ' +
          'supabase/live.sql dans Supabase, puis redéploie.',
      });
      return;
    }
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');

    /* ── GET : lecture publique ─────────────────────────────────────── */
    if (req.method === 'GET') {
      let row = await resolveLive(base, req.query);
      // Auto-arrêt du live résolu s'il a expiré.
      if (row && row.status !== 'off' && liveExpired(row)) {
        await closeLive(base, row);
        row = { ...row, status: 'off' };
      }
      const wantSetlist =
        req.query?.setlist === '1' || req.query?.setlist === 'true';
      if (row && row.status !== 'off') {
        if (wantSetlist) {
          const r = await fetch(
            `${base}/rest/v1/lives?id=eq.${row.id}&select=status,mode,setlist`,
            { headers: sbHeaders() },
          );
          const rows = r.ok ? await r.json() : [];
          const full = Array.isArray(rows) && rows[0] ? rows[0] : {};
          const visible = full.status !== 'off' && full.mode !== 'repet';
          res.status(200).json({
            setlist: visible && Array.isArray(full.setlist) ? full.setlist : [],
          });
          return;
        }
        res.status(200).json(publicView(row));
        return;
      }
      // Repli legacy (bundle pas à jour encore en direct) — uniquement pour
      // la requête par défaut ou la setlist, jamais pour code/id/band.
      if (
        !req.query?.code &&
        !req.query?.id &&
        !req.query?.band &&
        !req.query?.artist
      ) {
        const leg = await legacyRow(base);
        if (leg && leg.status && leg.status !== 'off' && !liveExpired(leg)) {
          if (wantSetlist) {
            const visible = leg.mode !== 'repet';
            const r = await fetch(
              `${base}/rest/v1/live_state?id=eq.live&select=setlist`,
              { headers: sbHeaders() },
            );
            const rows = r.ok ? await r.json() : [];
            const full = Array.isArray(rows) && rows[0] ? rows[0] : {};
            res.status(200).json({
              setlist:
                visible && Array.isArray(full.setlist) ? full.setlist : [],
            });
            return;
          }
          res.status(200).json(publicView(leg, 'legacy'));
          return;
        }
      }
      if (wantSetlist) {
        res.status(200).json({ setlist: [] });
        return;
      }
      res.status(200).json(offView());
      return;
    }

    /* ── POST : pilotage (compte, ou ancienne clé + jeton par live) ── */
    if (req.method === 'POST') {
      // b192 : c'est le COMPTE qui pilote son direct. La clé reste acceptée
      // le temps que les applications installées se mettent à jour — jamais
      // de direct coupé parce qu'un téléphone est en retard d'une version.
      const qui = await identifie(req);
      if (!qui.ok) {
        refuse(res);
        return;
      }
      const ownerId = qui.user?.id ?? null;
      const body = req.body ?? {};

      /* — Chemin MULTI-LIVE (bundles b121+) — */
      if (
        body.liveId ||
        (body.multi === 1 &&
          (body.status === 'on' || body.status === 'pause'))
      ) {
        // Mise à jour / clôture d'un live existant.
        if (body.liveId) {
          const r = await fetch(
            `${base}/rest/v1/lives?id=eq.${encodeURIComponent(String(body.liveId))}&select=${LIVE_COLS},write_token&limit=1`,
            { headers: sbHeaders() },
          );
          const rows = r.ok ? await r.json() : [];
          const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
          if (!row || row.write_token !== String(body.writeToken ?? '')) {
            res.status(403).json({ error: 'Ce direct ne t’appartient pas.' });
            return;
          }
          // bandSong seul / setlist seule (pendant le direct)
          if (!('status' in body)) {
            const patch = { updated_at: new Date().toISOString() };
            if ('bandSong' in body) patch.band_song = body.bandSong ?? null;
            if ('setlist' in body) {
              const list = sanitizeSetlist(body.setlist);
              patch.setlist = list;
              patch.setlist_count = list.length;
            }
            const u = await fetch(`${base}/rest/v1/lives?id=eq.${row.id}`, {
              method: 'PATCH',
              headers: sbHeaders(),
              body: JSON.stringify(patch),
            });
            if (!u.ok) {
              res.status(502).json({ error: `Supabase a répondu ${u.status}` });
              return;
            }
            res.status(200).json({ ok: true });
            return;
          }
          const status = body.status;
          if (status !== 'on' && status !== 'pause' && status !== 'off') {
            res.status(400).json({ error: 'Statut invalide' });
            return;
          }
          // Un live CLOS ne se rallume pas (b217). La clôture efface son
          // code de salon (`join_code`) : rallumer la même ligne donnait un
          // direct que plus personne ne pouvait retrouver — le lanceur
          // lui-même le sondait par ce code et lisait « éteint ». Son
          // application voyait donc le bouton passer au rouge, puis revenir
          // au vert une seconde plus tard (signalement de Vincent).
          // On refuse : le client oublie sa référence périmée et ouvre un
          // NOUVEAU live — un live = un appui sur GO LIVE (b182).
          if (row.status === 'off' && status !== 'off') {
            res.status(403).json({ error: 'Ce direct est terminé.' });
            return;
          }
          if (status === 'off') {
            await closeLive(base, row);
            res.status(200).json({ ok: true });
            return;
          }
          const patch = {
            status,
            updated_at: new Date().toISOString(),
          };
          if (body.mode === 'repet' || body.mode === 'concert') {
            patch.mode = body.mode;
          }
          if ('setlist' in body) {
            const list = sanitizeSetlist(body.setlist);
            patch.setlist = list;
            patch.setlist_count = list.length;
            // Nom de la setlist jouée : les mots du public s'y rattachent.
            patch.setlist_name =
              list.length > 0 && typeof body.setlistName === 'string'
                ? body.setlistName.slice(0, 200)
                : '';
          }
          if ('song' in body) patch.song = body.song ?? null;
          if ('artist' in body) patch.artist = body.artist ?? null;
          if ('bandSong' in body) patch.band_song = body.bandSong ?? null;
          if ('concert' in body) patch.concert = body.concert ?? null;
          // Archivage de la partition qui se termine + réarmement inactivité.
          const prevTitle = row.song?.title ?? '';
          const nextTitle = patch.song?.title ?? '';
          if ('song' in patch && nextTitle !== prevTitle) {
            if (prevTitle !== '') await archivePlayedSong(base, row);
            patch.hearts = 0;
          }
          if (patch.song && patch.song.title) {
            patch.last_song_at = new Date().toISOString();
          }
          const u = await fetch(`${base}/rest/v1/lives?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: sbHeaders(),
            body: JSON.stringify(patch),
          });
          if (!u.ok) {
            res.status(502).json({ error: `Supabase a répondu ${u.status}` });
            return;
          }
          res.status(200).json({ ok: true, joinCode: row.join_code });
          return;
        }

        // GO LIVE : création d'un nouveau direct.
        const status = body.status;
        if (status !== 'on' && status !== 'pause') {
          res.status(400).json({ error: 'Statut invalide' });
          return;
        }
        // Code de salon : insert direct (collision quasi impossible parmi
        // les lives actifs, et la résolution prend le plus récent) — la
        // vérification préalable coûtait des allers-retours au lancement.
        const joinCode = randomCode();
        const writeToken = randomToken();
        // Session de mesure (chantier 2) — best-effort.
        let sessionId = null;
        try {
          const s = await fetch(`${base}/rest/v1/live_sessions`, {
            method: 'POST',
            headers: { ...sbHeaders(), prefer: 'return=representation' },
            body: JSON.stringify({
              artist_name: body.artist?.name ?? '',
              owner_id: ownerId,
            }),
          });
          if (s.ok) {
            const arr = await s.json();
            sessionId = Array.isArray(arr) && arr[0] ? arr[0].id : null;
          }
        } catch {
          /* mesure best-effort */
        }
        const now = new Date().toISOString();
        const list = sanitizeSetlist(body.setlist);
        const ins = await fetch(`${base}/rest/v1/lives`, {
          method: 'POST',
          headers: { ...sbHeaders(), prefer: 'return=representation' },
          body: JSON.stringify({
            join_code: joinCode,
            write_token: writeToken,
            status,
            mode: body.mode === 'repet' ? 'repet' : 'concert',
            song: body.song ?? null,
            artist: body.artist ?? null,
            band_song: body.bandSong ?? null,
            concert: body.concert ?? null,
            setlist: list,
            setlist_count: list.length,
            band_id: typeof body.bandId === 'string' ? body.bandId.slice(0, 200) : '',
            started_by:
              typeof body.startedBy === 'string' ? body.startedBy.slice(0, 120) : '',
            // À QUI est ce direct (b192) : l'identifiant du compte, qui ne
            // change jamais — contrairement au nom d'artiste.
            owner_id: ownerId,
            started_at: now,
            last_song_at: now,
            session_id: sessionId,
            updated_at: now,
          }),
        });
        if (!ins.ok) {
          // Table `lives` absente (supabase/live.sql pas rejoué) : on
          // démarre le direct sur l'ancienne ligne live_state — JAMAIS de
          // coupure. Sans liveId retourné, le client reste en mode legacy.
          const legacyPatch = {
            id: 'live',
            status,
            mode: body.mode === 'repet' ? 'repet' : 'concert',
            song: body.song ?? null,
            artist: body.artist ?? null,
            band_song: body.bandSong ?? null,
            concert: body.concert ?? null,
            setlist: list,
            setlist_count: list.length,
            updated_at: now,
          };
          let lr = await fetch(`${base}/rest/v1/live_state`, {
            method: 'POST',
            headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({
              ...legacyPatch,
              band_id:
                typeof body.bandId === 'string' ? body.bandId.slice(0, 200) : '',
              started_by:
                typeof body.startedBy === 'string'
                  ? body.startedBy.slice(0, 120)
                  : '',
              started_at: now,
              last_song_at: now,
              session_id: sessionId,
            }),
          });
          if (lr.status === 400) {
            lr = await fetch(`${base}/rest/v1/live_state`, {
              method: 'POST',
              headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify(legacyPatch),
            });
          }
          if (!lr.ok) {
            res.status(502).json({ error: `Supabase a répondu ${lr.status}` });
            return;
          }
          res.status(200).json({ ok: true });
          return;
        }
        const arr = await ins.json();
        const created = Array.isArray(arr) && arr[0] ? arr[0] : null;
        res.status(200).json({
          ok: true,
          liveId: created?.id ?? '',
          joinCode,
          writeToken,
        });
        return;
      }

      /* — Chemin LEGACY (bundles avant b121) : ligne unique live_state — */
      if (!('status' in body) && 'bandSong' in body) {
        const u = await fetch(`${base}/rest/v1/live_state?id=eq.live`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ band_song: body.bandSong ?? null }),
        });
        res.status(u.ok ? 200 : 502).json(u.ok ? { ok: true } : { error: `Supabase a répondu ${u.status}` });
        return;
      }
      if (!('status' in body) && 'setlist' in body) {
        const list = sanitizeSetlist(body.setlist);
        const u = await fetch(`${base}/rest/v1/live_state?id=eq.live`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ setlist: list, setlist_count: list.length }),
        });
        res.status(u.ok ? 200 : 502).json(u.ok ? { ok: true } : { error: `Supabase a répondu ${u.status}` });
        return;
      }
      const status = body.status;
      if (status !== 'on' && status !== 'pause' && status !== 'off') {
        res.status(400).json({ error: 'Statut invalide' });
        return;
      }
      const patch = { id: 'live', status, updated_at: new Date().toISOString() };
      if (status === 'off') {
        patch.concert = null;
        patch.setlist = null;
        patch.setlist_count = 0;
        patch.song = null;
        patch.band_song = null;
        patch.band_id = '';
        patch.started_by = '';
        patch.started_at = null;
        patch.last_song_at = null;
      }
      if (body.mode === 'repet' || body.mode === 'concert') patch.mode = body.mode;
      if (status !== 'off' && 'setlist' in body) {
        const list = sanitizeSetlist(body.setlist);
        patch.setlist = list;
        patch.setlist_count = list.length;
      }
      if ('song' in body) patch.song = body.song ?? null;
      if ('artist' in body) patch.artist = body.artist ?? null;
      if (status !== 'off' && patch.song && patch.song.title) {
        patch.last_song_at = new Date().toISOString();
      }
      if ('bandSong' in body) patch.band_song = body.bandSong ?? null;
      if ('concert' in body) patch.concert = body.concert ?? null;

      let liveRow = null;
      try {
        const cur = await fetch(
          `${base}/rest/v1/live_state?id=eq.live&select=song,hearts,concert,status,session_id`,
          { headers: sbHeaders() },
        );
        const rows = cur.ok ? await cur.json() : [];
        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        liveRow = row;
        const prevTitle = row?.song?.title ?? '';
        const nextTitle = patch.song?.title ?? '';
        const songChanged = 'song' in patch && nextTitle !== prevTitle;
        if (row && prevTitle !== '' && (songChanged || status === 'off')) {
          await archivePlayedSong(base, row);
          patch.hearts = 0;
        }
        if (songChanged) patch.hearts = 0;
      } catch {
        /* archivage best-effort */
      }
      try {
        const wasLive = !!liveRow && liveRow.status && liveRow.status !== 'off';
        if (status !== 'off' && !wasLive) {
          patch.started_at = new Date().toISOString();
          if (!patch.last_song_at) patch.last_song_at = patch.started_at;
          const s = await fetch(`${base}/rest/v1/live_sessions`, {
            method: 'POST',
            headers: { ...sbHeaders(), prefer: 'return=representation' },
            body: JSON.stringify({
              artist_name: patch.artist?.name || liveRow?.artist?.name || '',
            }),
          });
          if (s.ok) {
            const arr = await s.json();
            const sid = Array.isArray(arr) && arr[0] ? arr[0].id : null;
            if (sid) patch.session_id = sid;
          }
        } else if (status === 'off' && liveRow?.session_id) {
          await finalizeSession(base, liveRow.session_id);
          patch.session_id = null;
        }
      } catch {
        /* mesure best-effort */
      }
      // b180 : même raison — un mot laissé hors direct (ou par un ancien
      // bundle) appartient quand même à l'artiste. On ne l'efface plus.

      let r = await fetch(`${base}/rest/v1/live_state`, {
        method: 'POST',
        headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(patch),
      });
      if (
        r.status === 400 &&
        ('band_id' in patch ||
          'started_by' in patch ||
          'started_at' in patch ||
          'last_song_at' in patch)
      ) {
        const { band_id, started_by, started_at, last_song_at, ...safe } = patch;
        void band_id;
        void started_by;
        void started_at;
        void last_song_at;
        r = await fetch(`${base}/rest/v1/live_state`, {
          method: 'POST',
          headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(safe),
        });
      }
      if (!r.ok) {
        res.status(502).json({ error: `Supabase a répondu ${r.status}` });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Méthode non autorisée' });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
