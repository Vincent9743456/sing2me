/**
 * Compte musicien + synchronisation cloud de la bibliothèque (étape 1).
 *
 * - AccountProvider : gère la session (lien magique / Google / Facebook),
 *   tire la sauvegarde cloud à la connexion, fusionne avec la bibliothèque
 *   locale (rien n'est perdu), puis pousse chaque modification (debounce).
 * - AccountSection : le bloc « Mon compte » affiché dans l'onglet Artiste.
 *
 * Local-first : sans compte ou sans réseau, tout fonctionne comme avant.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  authAvailable,
  AuthSession,
  getValidSession,
  handleRedirectHash,
  loadSession,
  pullCloud,
  pushCloud,
  signInWithEmail,
  signInWithProvider,
  signOut,
  takeAuthError,
} from '../lib/auth';
import { pullBandLibrary, pushBandLibrary } from '../lib/bands';
import {
  applyBandData,
  BandData,
  bandDataEqual,
  emptyBandData,
  exportBandData,
  mergeBandData,
} from '../lib/bandSync';
import { migrateSong } from '../lib/model';
import { mergeStates, SyncState } from '../lib/sync';
import { AppState, useStore } from '../store';
import { Field } from './ui';

/** Valide la forme d'une bibliothèque de groupe venant du cloud. */
function sanitizeBand(raw: unknown): BandData {
  if (!raw || typeof raw !== 'object') return emptyBandData();
  const r = raw as {
    songs?: unknown;
    setlists?: unknown;
    removed?: unknown;
    removedNotes?: unknown;
  };
  return {
    songs: Array.isArray(r.songs) ? (r.songs as BandData['songs']) : [],
    setlists: Array.isArray(r.setlists)
      ? (r.setlists as BandData['setlists'])
      : [],
    removed: Array.isArray(r.removed)
      ? (r.removed as BandData['removed'])
      : [],
    removedNotes: Array.isArray(r.removedNotes)
      ? (r.removedNotes as BandData['removedNotes'])
      : [],
  };
}

type SyncStatus = 'anon' | 'sync' | 'ok' | 'error';

interface AccountValue {
  available: boolean;
  email: string | null;
  status: SyncStatus;
  lastSync: string | null;
  error: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  loginWith: (p: 'google' | 'facebook') => void;
  logout: () => void;
}

const AccountContext = createContext<AccountValue | null>(null);

export function useAccount(): AccountValue | null {
  return useContext(AccountContext);
}

/** Nettoie/migre une sauvegarde cloud avant fusion. */
function fromCloud(raw: unknown): Partial<SyncState> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    songs: Array.isArray(r.songs) ? r.songs.map(migrateSong) : undefined,
    setlists: Array.isArray(r.setlists)
      ? (r.setlists as SyncState['setlists']).map((sl) => ({
          ...sl,
          bandId: sl.bandId ?? '',
        }))
      : undefined,
    concerts: Array.isArray(r.concerts)
      ? (r.concerts as SyncState['concerts']).map((c) => ({
          ...c,
          venueUrl: c.venueUrl ?? '',
          eventUrl: c.eventUrl ?? '',
        }))
      : undefined,
    bands: Array.isArray(r.bands)
      ? (r.bands as SyncState['bands'])
      : undefined,
    artist:
      r.artist && typeof r.artist === 'object'
        ? (r.artist as SyncState['artist'])
        : undefined,
    prefs:
      r.prefs && typeof r.prefs === 'object'
        ? (r.prefs as SyncState['prefs'])
        : undefined,
    deleted: Array.isArray(r.deleted)
      ? (r.deleted as SyncState['deleted'])
      : undefined,
  };
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [session, setSession] = useState<AuthSession | null>(
    () => handleRedirectHash() ?? loadSession(),
  );
  const [status, setStatus] = useState<SyncStatus>(
    session ? 'sync' : 'anon',
  );
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => takeAuthError());
  // Pas de push tant que la fusion initiale n'a pas eu lieu
  const readyRef = useRef(false);

  const stateJson = JSON.stringify({
    songs: store.songs,
    setlists: store.setlists,
    concerts: store.concerts,
    bands: store.bands,
    artist: store.artist,
    prefs: store.prefs,
    deleted: store.deleted,
  });
  const stateRef = useRef(stateJson);
  stateRef.current = stateJson;
  const hydrateRef = useRef(store.hydrate);
  hydrateRef.current = store.hydrate;
  const bandSyncBusy = useRef(false);

  /**
   * Étape 2b : synchronise le répertoire partagé de chaque groupe publié
   * (versions du groupe, notes de répét partagées, setlists du groupe).
   * Best-effort, jamais bloquant.
   */
  const syncBands = useCallback(async (valid: AuthSession) => {
    if (bandSyncBusy.current) return;
    bandSyncBusy.current = true;
    try {
      const st = JSON.parse(stateRef.current) as SyncState;
      let songs = st.songs;
      let setlists = st.setlists;
      let changed = false;
      for (const band of st.bands) {
        const cid = band.cloudId;
        if (!cid) continue;
        try {
          const cloudData = sanitizeBand(await pullBandLibrary(valid, cid));
          const removals = (st.bandRemovals ?? [])
            .filter((r) => r.bandId === band.id)
            .map((r) => ({ key: r.key, at: r.at }));
          // Notes supprimées : pierres tombales marquées « #note »
          const noteRemovals = (st.deleted ?? [])
            .filter((t) => t.key === '#note')
            .map((t) => ({ key: t.id, at: t.at }));
          const localData = exportBandData(
            songs,
            setlists,
            band.id,
            removals,
            noteRemovals,
          );
          const merged = mergeBandData(cloudData, localData);
          const skipKeys = new Set(
            (st.deleted ?? [])
              .map((t) => t.key)
              .filter((k): k is string => typeof k === 'string' && k !== ''),
          );
          const applied = applyBandData(
            merged,
            songs,
            setlists,
            band.id,
            skipKeys,
          );
          songs = applied.songs;
          setlists = applied.setlists;
          changed = changed || applied.changed;
          if (!bandDataEqual(merged, cloudData)) {
            await pushBandLibrary(valid, cid, merged);
          }
        } catch {
          // groupe injoignable : on réessaiera au prochain cycle
        }
      }
      if (changed) {
        hydrateRef.current({ ...st, songs, setlists } as AppState);
      }
    } finally {
      bandSyncBusy.current = false;
    }
  }, []);

  // À la connexion : tirer le cloud, fusionner, pousser le résultat.
  useEffect(() => {
    if (!session) {
      readyRef.current = false;
      setStatus('anon');
      return;
    }
    let cancelled = false;
    (async () => {
      setStatus('sync');
      setError(null);
      try {
        const valid = await getValidSession();
        if (cancelled) return;
        if (!valid) {
          if (loadSession() === null) {
            // Jeton réellement révoqué : retour à l'état déconnecté
            setSession(null);
          } else {
            // Problème réseau passager : session conservée, on réessaiera
            setStatus('error');
            setError('Synchronisation impossible pour le moment — nouvel essai automatique.');
          }
          return;
        }
        const cloud = await pullCloud(valid);
        if (cancelled) return;
        const local = JSON.parse(stateRef.current) as SyncState;
        const merged = cloud
          ? mergeStates(local, fromCloud(cloud.data))
          : local;
        hydrateRef.current(merged as AppState);
        await pushCloud(valid, merged);
        if (cancelled) return;
        readyRef.current = true;
        setLastSync(new Date().toISOString());
        setStatus('ok');
        // Répertoires de groupes (étape 2b), après la bibliothèque perso
        void syncBands(valid);
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(
            e instanceof Error ? e.message : 'Synchronisation impossible.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  // À chaque modification : pousser (debounce 3 s), best-effort.
  useEffect(() => {
    if (!session || !readyRef.current) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const valid = await getValidSession();
          if (!valid) return;
          await pushCloud(valid, JSON.parse(stateJson));
          setLastSync(new Date().toISOString());
          setStatus('ok');
          void syncBands(valid);
        } catch {
          setStatus('error');
        }
      })();
    }, 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateJson, session?.userId]);

  // Cycle régulier : récupère ce que les autres membres ont modifié
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      if (!readyRef.current || document.visibilityState !== 'visible') return;
      void (async () => {
        const valid = await getValidSession();
        if (valid) void syncBands(valid);
      })();
    }, 90000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  const value: AccountValue = {
    available: authAvailable(),
    email: session?.email ?? null,
    status,
    lastSync,
    error,
    sendMagicLink: (email: string) => signInWithEmail(email),
    loginWith: (p) => signInWithProvider(p),
    logout: () => {
      signOut();
      setSession(null);
      setLastSync(null);
    },
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

/** Bloc « Mon compte » (onglet Artiste). */
export function AccountSection() {
  const account = useAccount();
  // Adresse mémorisée : pas de re-saisie sur le même appareil
  const [email, setEmail] = useState(
    () => localStorage.getItem('sing2me/lastEmail') ?? '',
  );
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!account) return null;

  if (!account.available) {
    return (
      <p className="help">
        ☁ Synchronisation cloud non configurée — ajoute VITE_SUPABASE_URL et
        VITE_SUPABASE_ANON_KEY sur Vercel puis redéploie (voir README).
      </p>
    );
  }

  if (account.email !== null) {
    return (
      <div className="card" style={{ borderColor: 'var(--accent-dark)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>
            <strong style={{ color: 'var(--accent)', fontSize: '1.05rem' }}>
              ✓ Connecté
            </strong>{' '}
            — <strong>{account.email}</strong>
            <br />
            <span className="help">
              {account.status === 'ok' &&
                `Bibliothèque synchronisée ✓${
                  account.lastSync
                    ? ` (${new Date(account.lastSync).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })})`
                    : ''
                }`}
              {account.status === 'sync' && 'Synchronisation en cours…'}
              {account.status === 'error' &&
                `⚠ ${account.error ?? 'Synchronisation impossible — nouvel essai à la prochaine modification.'}`}
            </span>
          </span>
          <button className="btn ghost small" onClick={account.logout}>
            Se déconnecter
          </button>
        </div>
        <p className="help" style={{ marginBottom: 0 }}>
          Ta bibliothèque est sauvegardée dans le cloud et te suit sur tous
          tes appareils : connecte-toi avec le même compte sur ton téléphone.
          Sans réseau, tout continue de fonctionner en local.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="help" style={{ marginTop: 0 }}>
        <strong>Connecte-toi ou crée ton compte (gratuit)</strong> — c'est le
        même champ : entre ton email, le lien reçu te connecte (et crée le
        compte s'il n'existe pas encore). Ta bibliothèque te suit ensuite sur
        tous tes appareils. Sans compte, tout reste utilisable ici.
      </p>
      {sent ? (
        <div>
          <p style={{ marginTop: 0 }}>
            <strong style={{ color: 'var(--accent)' }}>
              Lien envoyé à {email}
            </strong>
          </p>
          <p className="help">
            Ouvre cet email <strong>sur cet appareil</strong> et touche le
            lien : tu reviendras ici, connecté (pense aux spams). Rien reçu
            après une minute ?
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn ghost small"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                account
                  .sendMagicLink(email.trim())
                  .catch(() => undefined)
                  .finally(() => setBusy(false));
              }}
            >
              Renvoyer le lien
            </button>
            <button
              className="btn ghost small"
              onClick={() => setSent(false)}
            >
              Changer d'adresse
            </button>
          </div>
        </div>
      ) : (
        <Field label="Email">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={email}
              placeholder="toi@exemple.com"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="btn"
              style={{ flexShrink: 0 }}
              title="Connexion OU création de compte — le lien magique fait les deux"
              disabled={!email.includes('@') || busy}
              onClick={() => {
                setBusy(true);
                setLocalError(null);
                account
                  .sendMagicLink(email.trim())
                  .then(() => {
                    localStorage.setItem('sing2me/lastEmail', email.trim());
                    setSent(true);
                  })
                  .catch((e: unknown) =>
                    setLocalError(
                      e instanceof Error ? e.message : "L'envoi a échoué.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? '…' : 'Recevoir mon lien'}
            </button>
          </div>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn ghost"
          onClick={() => account.loginWith('google')}
        >
          Continuer avec Google
        </button>
        <button
          className="btn ghost"
          onClick={() => account.loginWith('facebook')}
        >
          Continuer avec Facebook
        </button>
      </div>
      {(localError ?? account.error) && (
        <p style={{ color: 'var(--danger)', marginBottom: 0 }}>
          {localError ?? account.error}
        </p>
      )}
      <p className="help" style={{ marginBottom: 0 }}>
        Le lien magique fonctionne sans mot de passe. Google et Facebook
        nécessitent d'être activés dans Supabase (voir README). En créant un
        compte, tu acceptes les{' '}
        <a href="#/cgu" style={{ color: 'var(--accent)' }}>
          conditions d'utilisation
        </a>
        .
      </p>
    </div>
  );
}
