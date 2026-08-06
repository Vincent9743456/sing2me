/**
 * Authentification Supabase (REST pur, sans dépendance) :
 * - lien magique par email (zéro mot de passe)
 * - Google / Facebook (OAuth, à activer dans le tableau de bord Supabase)
 * - session persistée en localStorage, rafraîchie automatiquement
 * - lecture/écriture de la sauvegarde cloud (table user_library, RLS)
 *
 * Nécessite les variables Vercel (préfixe VITE_ = embarquées côté client,
 * la clé "anon" est publique par conception — la sécurité est dans RLS) :
 *   VITE_SUPABASE_URL       ex. https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  clé "anon public" (Settings → API Keys)
 */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Époque en secondes */
  expiresAt: number;
  userId: string;
  email: string;
}

const STORAGE_KEY = 'sing2me/session';

// IMPORTANT : accès « en dur » obligatoire — Vite remplace ces expressions
// statiquement au build ; un accès dynamique (env['VITE_…']) resterait vide.
function supabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
}

function anonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
}

/** L'authentification est-elle configurée sur ce déploiement ? */
export function authAvailable(): boolean {
  return supabaseUrl() !== '' && anonKey() !== '';
}

function appUrl(): string {
  return location.origin + location.pathname;
}

function decodeJwt(token: string): { sub?: string; email?: string } {
  try {
    const part = token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as { sub?: string; email?: string };
  } catch {
    return {};
  }
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    return s.accessToken && s.userId ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s: AuthSession | null): void {
  // Jamais bloquant : un stockage plein ou indisponible (navigateur intégré
  // d'une app mail, mode privé…) ne doit pas faire planter le rendu.
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* stockage indisponible */
  }
}

let lastAuthError: string | null = null;
/** Message d'erreur du dernier retour OAuth (affiché une fois). */
export function takeAuthError(): string | null {
  const e = lastAuthError;
  lastAuthError = null;
  return e;
}

/**
 * À l'ouverture de l'app : si l'URL contient le retour d'un lien magique
 * ou d'un OAuth (#access_token=…), crée la session et nettoie l'URL.
 */
export function handleRedirectHash(): AuthSession | null {
  // Appelé pendant le rendu initial (initialisation d'état) : ne DOIT jamais
  // lever d'exception, sinon l'application ne monte pas (écran noir au retour
  // du lien magique). Tout est donc encapsulé.
  try {
    const h = location.hash;
    if (!h.includes('access_token=') && !h.includes('error_description=')) {
      return null;
    }
    const params = new URLSearchParams(h.replace(/^#\/?/, ''));
    const err = params.get('error_description');
    if (err) {
      lastAuthError = err.replace(/\+/g, ' ');
      location.hash = '#/artist';
      return null;
    }
    const access = params.get('access_token') ?? '';
    if (access === '') {
      // Jeton absent/illisible : on nettoie l'URL au lieu de rester bloqué
      // sur un hash technique qui n'est aucune route.
      location.hash = '#/artist';
      return null;
    }
    const claims = decodeJwt(access);
    const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10) || 3600;
    const session: AuthSession = {
      accessToken: access,
      refreshToken: params.get('refresh_token') ?? '',
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      userId: claims.sub ?? '',
      email: claims.email ?? '',
    };
    saveSession(session);
    location.hash = '#/artist';
    return session;
  } catch {
    // En dernier ressort : ne pas laisser un écran noir. On repart propre.
    try {
      location.hash = '#/artist';
    } catch {
      /* location indisponible */
    }
    return null;
  }
}

/** Envoie le lien magique de connexion (crée le compte si besoin). */
export async function signInWithEmail(email: string): Promise<void> {
  const res = await fetch(
    `${supabaseUrl()}/auth/v1/otp?redirect_to=${encodeURIComponent(appUrl())}`,
    {
      method: 'POST',
      headers: { apikey: anonKey(), 'content-type': 'application/json' },
      body: JSON.stringify({ email, create_user: true }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      msg?: string;
      error_description?: string;
    };
    const raw = body.msg ?? body.error_description ?? '';
    // Messages Supabase (anglais) → français
    if (/rate limit/i.test(raw)) {
      throw new Error(
        "Limite d'envoi d'emails atteinte — réessaie dans quelques minutes.",
      );
    }
    if (/only request this after/i.test(raw)) {
      throw new Error(
        'Un lien vient de partir — attends quelques secondes avant d’en redemander un.',
      );
    }
    throw new Error(raw || `Supabase a répondu ${res.status}`);
  }
}

/** Redirige vers Google / Facebook (provider activé dans Supabase). */
export function signInWithProvider(provider: 'google' | 'facebook'): void {
  location.href =
    `${supabaseUrl()}/auth/v1/authorize?provider=${provider}` +
    `&redirect_to=${encodeURIComponent(appUrl())}`;
}

/**
 * Renouvelle le jeton. Distingue deux échecs très différents :
 * - 'invalid' : le jeton est réellement refusé → déconnexion ;
 * - null : problème réseau/serveur passager → on GARDE la session
 *   et on réessaiera (ne jamais déconnecter pour une coupure réseau).
 */
async function refreshSession(
  s: AuthSession,
): Promise<AuthSession | null | 'invalid'> {
  try {
    const res = await fetch(
      `${supabaseUrl()}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: { apikey: anonKey(), 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refreshToken }),
      },
    );
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return 'invalid';
    }
    if (!res.ok) return null;
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) return null;
    const claims = decodeJwt(body.access_token);
    const next: AuthSession = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? s.refreshToken,
      expiresAt:
        Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
      userId: claims.sub ?? s.userId,
      email: claims.email ?? s.email,
    };
    saveSession(next);
    return next;
  } catch {
    return null;
  }
}

/** Session utilisable (rafraîchie si proche de l'expiration). */
export async function getValidSession(): Promise<AuthSession | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() / 1000 > 120) return s;
  const next = await refreshSession(s);
  if (next === 'invalid') {
    // Jeton réellement révoqué : déconnexion propre
    saveSession(null);
    return null;
  }
  // null = réseau : la session reste stockée, nouvel essai plus tard
  return next;
}

export function signOut(): void {
  const s = loadSession();
  saveSession(null);
  if (s) {
    // Best-effort : invalide le refresh token côté serveur
    void fetch(`${supabaseUrl()}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: anonKey(),
        authorization: `Bearer ${s.accessToken}`,
      },
    }).catch(() => undefined);
  }
}

/** Appel REST authentifié vers Supabase (RLS appliqué côté serveur). */
export async function sbAuthed(
  s: AuthSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${supabaseUrl()}${path}`, {
    ...init,
    headers: {
      apikey: anonKey(),
      authorization: `Bearer ${s.accessToken}`,
      'content-type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Sauvegarde cloud de la bibliothèque (table user_library, RLS)       */
/* ------------------------------------------------------------------ */

export async function pullCloud(
  s: AuthSession,
): Promise<{ data: unknown; updatedAt: string } | null> {
  const res = await fetch(
    `${supabaseUrl()}/rest/v1/user_library?id=eq.${s.userId}&select=data,updated_at`,
    {
      headers: {
        apikey: anonKey(),
        authorization: `Bearer ${s.accessToken}`,
      },
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    throw new Error(
      `Supabase a répondu ${res.status} (lecture bibliothèque)` +
        (detail !== '' ? ` — ${detail}` : ''),
    );
  }
  const rows = (await res.json()) as { data: unknown; updated_at: string }[];
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row ? { data: row.data, updatedAt: row.updated_at } : null;
}

export async function pushCloud(
  s: AuthSession,
  data: unknown,
): Promise<void> {
  const res = await fetch(`${supabaseUrl()}/rest/v1/user_library`, {
    method: 'POST',
    headers: {
      apikey: anonKey(),
      authorization: `Bearer ${s.accessToken}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    // Ceinture : PostgreSQL refuse le caractère NUL (22P05) — on purge
    // les échappements  du JSON avant envoi, quoi qu'il arrive.
    body: JSON.stringify({
      id: s.userId,
      data,
      updated_at: new Date().toISOString(),
    }).replace(/\\u0000/g, ''),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    throw new Error(
      `Supabase a répondu ${res.status} (écriture bibliothèque)` +
        (detail !== '' ? ` — ${detail}` : ''),
    );
  }
}
