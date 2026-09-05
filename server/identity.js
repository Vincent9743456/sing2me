/**
 * QUI DEMANDE ? (b192)
 *
 * Jusqu'ici, tout ce qui est réservé à l'artiste était protégé par
 * `LIVE_KEY` : UNE clé, commune à toute l'installation, saisie à la main
 * dans les Réglages. Deux conséquences, toutes deux payées cher :
 *
 *  1. le serveur ne savait pas QUI l'appelait. Il fallait donc trier les
 *     morceaux, les mots et les séances sur le NOM affiché — d'où les
 *     mélanges entre musiciens (b138 → b191), et des mots devenus
 *     invisibles à leur propre auteur parce que son nom avait bougé ;
 *  2. quiconque obtenait la clé lisait tout le monde.
 *
 * Désormais l'appelant s'identifie par son JETON DE COMPTE (Supabase), que
 * l'app a déjà en mémoire. Le serveur le vérifie et obtient un identifiant
 * stable, qui ne change jamais — contrairement à un nom d'artiste.
 *
 * TRANSITION : la clé reste acceptée. Les applications installées ne se
 * mettent pas à jour au même instant, et un direct ne doit JAMAIS se couper
 * parce qu'un téléphone est en retard d'une version. Elle disparaîtra quand
 * plus personne ne l'enverra.
 *
 * Ce module ne dit rien du PUBLIC : un spectateur n'a pas de compte, et les
 * chemins qui lui sont ouverts (cœur, mot, présence) le restent.
 */

/** Cache des jetons déjà vérifiés — un aller-retour par jeton, pas par appel. */
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;
const MAX = 500;

function sbUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

/** Jeton porteur de la requête, s'il y en a un. */
function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : '';
}

/**
 * Vérifie le jeton auprès de Supabase et renvoie le compte, ou null.
 * Best-effort : si l'auth est injoignable, on ne prétend pas connaître
 * l'appelant — l'appel retombera sur la clé si elle est fournie.
 */
async function compteDuJeton(token) {
  if (token === '') return null;
  const hit = cache.get(token);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.user;
  const base = sbUrl();
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (base === '' || !key) return null;
  try {
    const r = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      // Jeton expiré ou invalide : on le mémorise aussi, pour ne pas
      // rappeler l'auth à chaque sondage d'un client qui boucle.
      cache.set(token, { at: Date.now(), user: null });
      return null;
    }
    const u = await r.json();
    const user =
      u && typeof u.id === 'string'
        ? { id: u.id, email: typeof u.email === 'string' ? u.email : '' }
        : null;
    if (cache.size > MAX) cache.clear();
    cache.set(token, { at: Date.now(), user });
    return user;
  } catch {
    return null;
  }
}

/**
 * Qui appelle ? Renvoie :
 *   { ok: true, user: {id, email} }  → compte identifié (chemin normal) ;
 *   { ok: true, user: null }         → ancienne clé, appelant inconnu ;
 *   { ok: false }                    → ni l'un ni l'autre : on refuse.
 */
export async function identifie(req) {
  const user = await compteDuJeton(bearer(req));
  if (user) return { ok: true, user };
  // La clé reste acceptée SAUF si on l'a explicitement coupée. Le jour où
  // toutes les applications enverront leur jeton, poser LIVE_KEY_LEGACY=0
  // sur Vercel ferme la porte — sans toucher au code.
  const key = process.env.LIVE_KEY;
  const legacy = process.env.LIVE_KEY_LEGACY !== '0';
  if (legacy && key && req.headers['x-live-key'] === key) {
    return { ok: true, user: null };
  }
  return { ok: false, user: null };
}

/** Refus commun, formulé pour l'app (jamais pour le public). */
export function refuse(res) {
  res.status(403).json({
    error: 'Connecte-toi pour accéder à tes lives.',
    code: 'auth',
  });
}
