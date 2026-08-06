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
import {
  clearPendingInvite,
  joinBand,
  peekPendingInvite,
  pullBandLibrary,
  pushBandLibrary,
  upsertProfile,
} from '../lib/bands';
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
import { navigate } from '../router';
import { AppState, useStore } from '../store';
import { emptyBand, makeId } from '../types';
import { Field } from './ui';

/**
 * Boutons OAuth (Google / Facebook) : masqués tant que ces fournisseurs ne
 * sont pas activés dans Supabase — sinon le clic renvoie une erreur 400
 * « provider is not enabled ». Le lien magique par email fonctionne toujours.
 * Pour les réactiver une fois configurés : VITE_OAUTH_ENABLED=1 (Vercel).
 */
const OAUTH_ENABLED = import.meta.env.VITE_OAUTH_ENABLED === '1';

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
          // Setlists supprimées localement (par id) : à ne pas ressusciter
          // depuis le répertoire du groupe.
          const skipSetlistIds = new Set(
            (st.deleted ?? []).map((t) => t.id),
          );
          const applied = applyBandData(
            merged,
            songs,
            setlists,
            band.id,
            skipKeys,
            skipSetlistIds,
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
        // Annuaire : publie sa fiche (nom + photo) pour être trouvable.
        // À défaut de nom d'artiste, on publie le début de l'email (souvent
        // le prénom) pour qu'un compte tout neuf soit quand même trouvable.
        void (async () => {
          try {
            const st = JSON.parse(stateRef.current) as SyncState;
            const dirName =
              st.artist?.name ||
              st.prefs?.userName ||
              (valid.email ?? '').split('@')[0] ||
              '';
            await upsertProfile(valid, dirName, st.artist?.photo ?? '', '');
          } catch {
            // annuaire non configuré (directory.sql non appliqué) : ignoré
          }
        })();
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

  // Invitation en attente : dès qu'un compte est disponible (typiquement au
  // retour du lien magique), on termine l'adhésion tout seul → « crée ton
  // compte » suffit pour devenir membre du groupe.
  const invitedRef = useRef(false);
  useEffect(() => {
    if (!session || invitedRef.current) return;
    const pending = peekPendingInvite();
    if (!pending) return;
    invitedRef.current = true;
    void (async () => {
      try {
        const valid = await getValidSession();
        if (!valid) {
          invitedRef.current = false;
          return;
        }
        const st = JSON.parse(stateRef.current) as SyncState;
        const name = (
          st.artist?.name ||
          st.prefs?.userName ||
          (session.email ?? '').split('@')[0] ||
          'Musicien'
        ).trim();
        const bandName = await joinBand(
          valid,
          pending.cloudId,
          pending.token,
          name,
          '',
        );
        clearPendingInvite();
        const already = (st.bands ?? []).find(
          (b) => b.cloudId === pending.cloudId,
        );
        let localBandId = already?.id ?? '';
        if (!already) {
          const nb = {
            ...emptyBand(),
            name: bandName || pending.band,
            cloudId: pending.cloudId,
            members: [
              {
                id: makeId(),
                name,
                instrument: '',
                verified: true,
                gear: store.artist.gear
                  ? store.artist.gear.map((g) => ({ ...g }))
                  : [],
              },
            ],
          };
          localBandId = nb.id;
          store.saveBand(nb);
        }
        // F3 : atterrissage sur Morceaux avec une bannière de bienvenue.
        try {
          localStorage.setItem(
            'sing2me/justJoined',
            JSON.stringify({ name: bandName || pending.band, bandId: localBandId }),
          );
        } catch {
          // stockage indisponible
        }
        navigate('/');
      } catch {
        // échec passager : on retentera au prochain cycle de session
        invitedRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  // Re-publier la fiche d'annuaire dès que le nom (ou la photo) change, pour
  // être trouvable tout de suite après avoir renseigné son profil — sans
  // attendre la prochaine connexion.
  const dirName = store.artist.name || store.prefs.userName || '';
  const dirPhoto = store.artist.photo || '';
  useEffect(() => {
    if (!session) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const valid = await getValidSession();
          if (!valid) return;
          const name = dirName || (valid.email ?? '').split('@')[0] || '';
          await upsertProfile(valid, name, dirPhoto, '');
        } catch {
          // annuaire indisponible : ignoré
        }
      })();
    }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, dirName, dirPhoto]);

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
  // Arrivée pour rejoindre un groupe (invitation) : on met le curseur droit
  // dans le champ email → plus de recherche du champ, saisie immédiate.
  const [joining] = useState(() => peekPendingInvite() != null);
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
      <div
        className="hstack"
        style={{ gap: 8, flexWrap: 'wrap', padding: '2px 0' }}
      >
        <span
          style={{
            color: 'var(--accent)',
            fontWeight: 650,
            flexShrink: 0,
            flex: 1,
          }}
        >
          ☁ Connecté
        </span>
        <button className="btn ghost small" onClick={account.logout}>
          Se déconnecter
        </button>
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
              autoFocus={joining}
              autoComplete="email"
              inputMode="email"
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
      {OAUTH_ENABLED && (
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
      )}
      {(localError ?? account.error) && (
        <p style={{ color: 'var(--danger)', marginBottom: 0 }}>
          {localError ?? account.error}
        </p>
      )}
      <p className="help" style={{ marginBottom: 0 }}>
        Entre ton email et touche « Recevoir mon lien » : le lien magique te
        connecte (et crée ton compte si besoin), sans mot de passe. En créant
        un compte, tu acceptes les{' '}
        <a href="#/cgu" style={{ color: 'var(--accent)' }}>
          conditions d'utilisation
        </a>
        .
      </p>
    </div>
  );
}
