/**
 * GARDE-FOU CONTRE L'USAGE ABUSIF DES APPELS PAYANTS (b220, demande de
 * Vincent).
 *
 * Depuis b220 l'IA remet en forme CHAQUE import : ce qui était un geste
 * délibéré devient automatique, et une boucle — un utilisateur qui s'acharne,
 * un script qui frappe l'endpoint — coûte de l'argent réel à chaque tour.
 *
 * Deux compteurs par appelant, glissants par HEURE et par JOUR. L'appelant
 * est son COMPTE quand il en a un (l'identifiant ne bouge jamais), sinon son
 * adresse, hachée : on ne veut pas d'un journal d'adresses IP en clair.
 *
 * Règle absolue, la même que pour la mesure (`meter.js`) : ce module ne doit
 * JAMAIS faire échouer une fonctionnalité. Si la base est injoignable, on
 * laisse passer — mieux vaut une facture qu'un musicien bloqué en pleine
 * reprise de répertoire.
 */
import { createHash } from 'node:crypto';

/** Plafonds par fonction : { compte: [heure, jour], anonyme: [heure, jour] }.
 *  Un compte doit pouvoir reprendre une collection entière dans la journée ;
 *  un anonyme doit pouvoir essayer, pas migrer une bibliothèque. */
const PLAFONDS = {
  clean: { compte: [120, 600], anonyme: [15, 40] },
  note: { compte: [60, 300], anonyme: [10, 30] },
  setlist: { compte: [30, 120], anonyme: [5, 15] },
  // La transcription est la plus chère à l'appel (audio à la minute).
  transcribe: { compte: [60, 200], anonyme: [5, 15] },
  // Recherche et récupération de partitions : pas d'IA, mais du trafic
  // sortant qu'on ne veut pas voir transformé en aspirateur.
  tabs: { compte: [400, 2000], anonyme: [60, 200] },
};

function ready() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
}

/** Adresse de l'appelant, telle que Vercel la transmet. */
function adresse(req) {
  const h = req.headers || {};
  const fwd = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(h['x-real-ip'] || '') || '';
}

/** Empreinte courte et stable — jamais l'adresse elle-même. */
function empreinte(valeur) {
  const sel = process.env.SUPABASE_SERVICE_KEY || 'sing2me';
  return createHash('sha256')
    .update(`${sel}|${valeur}`)
    .digest('hex')
    .slice(0, 32);
}

/** Début de la fenêtre courante, en ISO (heure pleine ou jour plein). */
function debutFenetre(portee) {
  const d = new Date();
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  if (portee === 'j') d.setUTCHours(0);
  return d.toISOString();
}

/**
 * Incrémente un compteur et renvoie sa valeur APRÈS incrément, ou null si la
 * base n'a pas répondu (on laissera passer).
 */
async function compte(bucket, portee) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  try {
    const r = await fetch(`${base}/rest/v1/rpc/bump_rate`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_bucket: bucket,
        p_window_start: debutFenetre(portee),
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const n = await r.json();
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * L'appel est-il autorisé ?
 *
 * Renvoie `{ ok: true }`, ou `{ ok: false, message, retryAfter }`. `userId`
 * vaut '' quand l'appelant n'est pas identifié.
 */
export async function autorise(fn, req, userId = '') {
  const plafond = PLAFONDS[fn];
  if (!plafond || !ready()) return { ok: true };
  const identifie = userId !== '';
  const [maxHeure, maxJour] = identifie ? plafond.compte : plafond.anonyme;
  const qui = identifie ? `u${empreinte(userId)}` : `a${empreinte(adresse(req))}`;
  const [nHeure, nJour] = await Promise.all([
    compte(`${fn}|h|${qui}`, 'h'),
    compte(`${fn}|j|${qui}`, 'j'),
  ]);
  if (nHeure !== null && nHeure > maxHeure) {
    return {
      ok: false,
      retryAfter: 900,
      message: identifie
        ? 'Beaucoup de mises en forme d’un coup — reprends dans un moment, tes morceaux sont enregistrés.'
        : 'Beaucoup de demandes d’un coup. Connecte-toi pour reprendre ta collection sans attendre.',
    };
  }
  if (nJour !== null && nJour > maxJour) {
    return {
      ok: false,
      retryAfter: 3600,
      message: identifie
        ? 'Tu as atteint la limite du jour. Elle repart demain — rien n’est perdu.'
        : 'Limite du jour atteinte. Connecte-toi pour reprendre ta collection.',
    };
  }
  return { ok: true };
}

/** Refus commun, formulé pour un musicien — jamais pour un développeur. */
export function refuseTrop(res, verdict) {
  res.setHeader('Retry-After', String(verdict.retryAfter ?? 900));
  res.status(429).json({ error: verdict.message, code: 'quota' });
}
