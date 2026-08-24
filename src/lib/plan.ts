/**
 * LECTURE DU PLAN DU COMPTE (b381). Le plan vit côté serveur
 * (`user_plans`, RLS lecture seule) ; l'app le lit et le met en cache.
 *
 * `sing2me/plan` est un CACHE, pas une vérité (règle b245) :
 *  • plein, il accélère la réponse et fait vivre le hors-ligne ;
 *  • une PANNE réseau ne conclut jamais — on garde ce qu'on savait ;
 *  • seule une réponse du serveur recale la valeur (ligne absente
 *    comprise : un compte sans ligne EST 'free', c'est une réponse).
 * Sans session (déconnecté, déploiement sans cloud) : 'free' — le côté
 * sûr est de ne rien débloquer.
 */
import { anonKey, getValidSession, supabaseUrl } from './auth';
import { estUnPlan, Plan } from './limites';

const PLAN_KEY = 'sing2me/plan';

export function planEnCache(): Plan {
  try {
    const raw = localStorage.getItem(PLAN_KEY) ?? '';
    return estUnPlan(raw) ? raw : 'free';
  } catch {
    return 'free';
  }
}

function noterPlan(p: Plan): void {
  try {
    localStorage.setItem(PLAN_KEY, p);
  } catch {
    // stockage indisponible : on revivra sur la réponse suivante
  }
}

// Le cache appartient au COMPTE (b259) : `sing2me/plan` est dans
// CLES_DU_COMPTE (src/lib/compte.ts) et se vide au changement de compte.

/**
 * Le plan tel que le SERVEUR vient de le dire — `null` en cas de panne ou
 * sans session. À utiliser pour toute décision IRRÉVERSIBLE (le tri du
 * dépassement, b422) : une panne ne conclut jamais (b245), et le cache ne
 * suffit pas pour supprimer quoi que ce soit.
 */
export async function planConfirme(): Promise<Plan | null> {
  try {
    const s = await getValidSession();
    if (!s) return null;
    const res = await fetch(
      `${supabaseUrl()}/rest/v1/user_plans?select=plan&user_id=eq.${s.userId}`,
      {
        headers: {
          apikey: anonKey(),
          authorization: `Bearer ${s.accessToken}`,
        },
      },
    );
    if (!res.ok) return null; // panne ≠ absence (b245)
    const rows = (await res.json()) as { plan?: string }[];
    // Ligne absente = 'free' : c'est une RÉPONSE, pas une panne.
    const brut = Array.isArray(rows) ? (rows[0]?.plan ?? 'free') : 'free';
    const p: Plan = estUnPlan(brut) ? brut : 'free';
    noterPlan(p);
    return p;
  } catch {
    return null;
  }
}

/**
 * Rafraîchit le plan depuis le serveur ; en cas de panne, rend le cache.
 * Toujours résolue — jamais de rejet à attraper chez l'appelant.
 */
export async function chargerPlan(): Promise<Plan> {
  return (await planConfirme()) ?? planEnCache();
}

/**
 * L'HORLOGE DU DÉPASSEMENT (b422) : ma ligne `depassement_avis`, posée par
 * le cron serveur quand un compte gratuit dépasse le plafond. Une seule
 * vérité, au serveur — deux appareils ne comptent pas deux délais, et
 * vider le localStorage ne remet pas le compteur à zéro.
 * Renvoie la date d'ouverture du délai, 'aucune' si le serveur a répondu
 * qu'il n'y en a pas, `null` en cas de panne (on ne conclut rien).
 */
export async function chargerDepassement(): Promise<
  { depuis: string } | 'aucune' | null
> {
  try {
    const s = await getValidSession();
    if (!s) return null;
    const res = await fetch(
      `${supabaseUrl()}/rest/v1/depassement_avis?select=depuis`,
      {
        headers: {
          apikey: anonKey(),
          authorization: `Bearer ${s.accessToken}`,
        },
      },
    );
    // Table absente (SQL pas encore joué) ou panne : on ne conclut rien.
    if (!res.ok) return null;
    const rows = (await res.json()) as { depuis?: string }[];
    const depuis = Array.isArray(rows) ? String(rows[0]?.depuis ?? '') : '';
    return depuis === '' ? 'aucune' : { depuis };
  } catch {
    return null;
  }
}

/**
 * Note qu'une limite a été ATTEINTE (mesure produit — `limit_events`,
 * RPC en security definer : l'appelant est son compte, b192).
 * Best-effort absolu : ne bloque rien, n'échoue jamais bruyamment.
 */
export function noterLimiteAtteinte(kind: 'LIMIT_SONGS' | 'LIMIT_GROUPS'): void {
  void (async () => {
    try {
      const s = await getValidSession();
      if (!s) return;
      await fetch(`${supabaseUrl()}/rest/v1/rpc/note_limite`, {
        method: 'POST',
        headers: {
          apikey: anonKey(),
          authorization: `Bearer ${s.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_kind: kind }),
      });
    } catch {
      // une statistique ne vaut jamais une gêne
    }
  })();
}
