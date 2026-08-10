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
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  authAvailable,
  AuthSession,
  getValidSession,
  enabledProviders,
  handleRedirectHash,
  OAuthProvider,
  setMarketingConsent,
  takeProviderName,
  loadSession,
  pullCloud,
  pushCloud,
  signInWithEmail,
  verifyEmailCode,
  signInWithProvider,
  signOut,
  takeAuthError,
} from '../lib/auth';
import { ProviderMark } from './ProviderMark';
import {
  cleanupOrphanCloudBands,
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
import { compterEnAttente, mergeStates, SyncState } from '../lib/sync';
import { navigate } from '../router';
import { AppState, useStore } from '../store';
import { emptyBand, makeId } from '../types';
import { t } from '../i18n';
import { Field } from './ui';

/**
 * Boutons OAuth (Google / Facebook) : masqués tant que ces fournisseurs ne
 * sont pas activés dans Supabase — sinon le clic renvoie une erreur 400
 * « provider is not enabled ». Le lien magique par email fonctionne toujours.
 * Depuis b166, l'app DEMANDE à Supabase quels fournisseurs sont actifs :
 * plus rien à activer côté Vercel. VITE_OAUTH_ENABLED='0' reste un
 * coupe-circuit pour tout masquer si besoin.
 */

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
  /**
   * Modifications faites depuis le dernier envoi réussi (b222). 0 quand tout
   * est parti — et 0 aussi quand aucun envoi n'a encore réussi sur cet
   * appareil : on n'annonce pas un chiffre qu'on ne sait pas établir.
   */
  enAttente: number;
  error: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  loginWith: (p: OAuthProvider) => void;
  logout: () => void;
  /**
   * Tire MAINTENANT le répertoire des groupes (b188). Le cycle régulier
   * tourne toutes les 90 s ; quand un membre annonce un morceau, on n'a pas
   * à attendre : on voyait la notification arriver alors que le morceau
   * n'était pas encore là — « je vois la notif mais pas le morceau ».
   */
  syncNow: () => void;
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
    // Retraits de répertoires de groupes (b202) : ils PARTAIENT dans le
    // cloud mais n'en revenaient pas — cette liste les oubliait. Un morceau
    // retiré du répertoire sur un téléphone pouvait donc revenir depuis un
    // autre. Toute liste écrite à la main finit par oublier un champ : si
    // tu en ajoutes un à SyncState, il se recopie ICI aussi.
    bandRemovals: Array.isArray(r.bandRemovals)
      ? (r.bandRemovals as SyncState['bandRemovals'])
      : undefined,
    // Points zéro des réinitialisations (b137) : sans eux, un reset fait
    // sur un appareil se ferait annuler par le cloud d'un autre.
    resetAt:
      r.resetAt && typeof r.resetAt === 'object'
        ? (r.resetAt as SyncState['resetAt'])
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
  /**
   * Dernier envoi réussi, gardé sur l'appareil : sans ça, le compteur de
   * modifications en attente repartirait de zéro à chaque lancement et
   * annoncerait toute la bibliothèque.
   */
  const [lastSync, setLastSync] = useState<string | null>(() => {
    try {
      return localStorage.getItem('sing2me/dernierEnvoi');
    } catch {
      return null;
    }
  });
  const noterEnvoi = useCallback((at: string) => {
    setLastSync(at);
    try {
      localStorage.setItem('sing2me/dernierEnvoi', at);
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const [error, setError] = useState<string | null>(() => takeAuthError());
  /**
   * Nom donné par le fournisseur social (b165). Apple ne le transmet
   * QU'À LA PREMIÈRE autorisation : on le capte au retour de redirection
   * et on le pose dans le profil s'il est encore vide — sinon il est
   * perdu pour toujours. On n'écrase JAMAIS un nom déjà saisi.
   */
  // Consentement en attente (choisi avant la redirection) : on le pose
  // sur le compte dès que la session existe.
  useEffect(() => {
    if (!session) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem('sing2me/consentPending');
    } catch {
      pending = null;
    }
    if (pending === null) return;
    try {
      sessionStorage.removeItem('sing2me/consentPending');
    } catch {
      /* stockage indisponible */
    }
    void setMarketingConsent(session, pending === '1');
  }, [session?.userId]);

  useEffect(() => {
    const given = takeProviderName();
    if (given === '') return;
    if ((store.prefs.userName ?? '').trim() === '') {
      store.savePrefs({ ...store.prefs, userName: given });
    }
    if (store.artist.name.trim() === '') {
      store.saveArtist({ ...store.artist, name: given });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Pas de push tant que la fusion initiale n'a pas eu lieu
  const readyRef = useRef(false);

  /*
   * Ce qui MONTE dans le cloud (b202). Cette liste oubliait deux choses, et
   * les oubliait en silence : les retraits de répertoires de groupes
   * (`bandRemovals`) et les points zéro des réinitialisations (`resetAt`).
   * Elles n'arrivaient là-haut qu'une fois, à la fusion de connexion — le
   * premier envoi suivant, trois secondes après n'importe quelle
   * modification, les effaçait. Un morceau retiré du répertoire pouvait
   * donc revenir, et une réinitialisation se faire annuler.
   *
   * Troisième endroit du même lot où une liste écrite à la main perdait des
   * données. Si tu ajoutes un champ à SyncState, il se recopie ICI, dans
   * `fromCloud` et dans `mergeStates` — les trois, sinon il fuit.
   */
  const stateJson = JSON.stringify({
    songs: store.songs,
    setlists: store.setlists,
    concerts: store.concerts,
    bands: store.bands,
    artist: store.artist,
    prefs: store.prefs,
    deleted: store.deleted,
    bandRemovals: store.bandRemovals,
    resetAt: store.resetAt,
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
            .filter((tomb) => tomb.key === '#note')
            .map((tomb) => ({ key: tomb.id, at: tomb.at }));
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
              .map((tomb) => tomb.key)
              .filter((k): k is string => typeof k === 'string' && k !== ''),
          );
          // Setlists supprimées localement (par id) : à ne pas ressusciter
          // depuis le répertoire du groupe.
          const skipSetlistIds = new Set(
            (st.deleted ?? []).map((tomb) => tomb.id),
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
            setError(
              t(
                'Synchronisation impossible pour le moment — nouvel essai automatique.',
              ),
            );
          }
          return;
        }
        const cloud = await pullCloud(valid);
        if (cancelled) return;
        const local = JSON.parse(stateRef.current) as SyncState;
        const merged = cloud
          ? mergeStates(local, fromCloud(cloud.data))
          : local;
        /*
         * CEINTURE DE SÉCURITÉ : une synchronisation ne VIDE JAMAIS une
         * bibliothèque déjà remplie.
         *
         * Par construction, la fusion ne peut pas perdre de morceau : une
         * lecture en échec lève, une ligne absente rend `null`, un contenu
         * vide laisse le local intact. Mais « par construction » est une
         * promesse, pas une garantie — il suffirait d'une donnée corrompue
         * qui ait l'air valide, ou d'une pierre tombale de trop, pour que
         * l'utilisateur voie sa collection disparaître d'un coup.
         *
         * Ici, le doute profite toujours au contenu : si la fusion rend une
         * bibliothèque vide alors que le téléphone en avait une, on la
         * REFUSE et on garde le local. Un décalage se rattrape à la synchro
         * suivante ; une collection effacée, non.
         */
        const videe =
          (local.songs?.length ?? 0) > 0 && (merged.songs?.length ?? 0) === 0;
        const sur = videe ? local : merged;
        if (videe) {
          setError(
            t(
              'Sauvegarde en ligne incohérente — ta bibliothèque locale a été conservée.',
            ),
          );
        }
        hydrateRef.current(sur as AppState);
        await pushCloud(valid, sur);
        if (cancelled) return;
        readyRef.current = true;
        setLastSync(new Date().toISOString());
        setStatus('ok');
        // Répertoires de groupes (étape 2b), après la bibliothèque perso
        void syncBands(valid);
        // Groupes cloud orphelins (supprimés localement, y compris avant que
        // la propagation n'existe) → dissous pour de bon, les membres voient
        // le groupe disparaître à leur tour. `merged.bands` fait foi.
        void cleanupOrphanCloudBands(valid, sur.bands);
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
            e instanceof Error ? e.message : t('Synchronisation impossible.'),
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
            owned: false,
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
    // `timer` : évite de masquer la fonction de traduction `t`.
    const timer = window.setTimeout(() => {
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
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, dirName, dirPhoto]);

  /**
   * Ce qui a été modifié et pas encore envoyé (b221). Sans ce repère, une
   * modification faite hors ligne restait sur le téléphone jusqu'à la
   * PROCHAINE modification : l'envoi ne se déclenchait qu'au changement de
   * `stateJson`. Trois morceaux corrigés dans l'avion, on atterrit, on ouvre
   * l'app pour les relire sans y toucher — rien ne partait.
   */
  const aEnvoyer = useRef(false);

  /** L'envoi lui-même, appelable par le débounce ET par le retour du réseau. */
  const envoyer = useCallback(async () => {
    if (!readyRef.current) return;
    try {
      const valid = await getValidSession();
      if (!valid) return;
      await pushCloud(valid, JSON.parse(stateRef.current));
      aEnvoyer.current = false;
      noterEnvoi(new Date().toISOString());
      setStatus('ok');
      void syncBands(valid);
    } catch {
      // Hors ligne ou serveur muet : rien n'est perdu, tout est en local.
      // Le drapeau reste levé, le prochain retour de réseau réessaiera.
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncBands, noterEnvoi]);

  // À chaque modification : pousser (debounce 3 s), best-effort.
  useEffect(() => {
    if (!session || !readyRef.current) return;
    aEnvoyer.current = true;
    // `timer` : évite de masquer la fonction de traduction `t`.
    const timer = window.setTimeout(() => void envoyer(), 3000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateJson, session?.userId]);

  /**
   * Retour du réseau, ou retour de l'app au premier plan : on renvoie ce qui
   * attend. C'est le seul moment où l'on peut rattraper le travail fait hors
   * ligne, et il ne coûte rien quand il n'y a rien à envoyer.
   */
  useEffect(() => {
    if (!session) return;
    const reprendre = () => {
      if (!aEnvoyer.current) return;
      if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return;
      void envoyer();
    };
    const auPremierPlan = () => {
      if (document.visibilityState === 'visible') reprendre();
    };
    window.addEventListener('online', reprendre);
    document.addEventListener('visibilitychange', auPremierPlan);
    return () => {
      window.removeEventListener('online', reprendre);
      document.removeEventListener('visibilitychange', auPremierPlan);
    };
  }, [session?.userId, envoyer]);

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

  const syncNow = useCallback(() => {
    void (async () => {
      const valid = await getValidSession();
      if (valid) void syncBands(valid);
    })();
  }, [syncBands]);

  // Recalculé au rendu, à partir de l'état réel : le chiffre ne peut pas
  // se désynchroniser de ce que l'écran montre.
  const enAttente = useMemo(() => {
    if (!session) return 0;
    try {
      return compterEnAttente(JSON.parse(stateJson) as SyncState, lastSync);
    } catch {
      return 0;
    }
  }, [stateJson, lastSync, session?.userId]);

  const value: AccountValue = {
    available: authAvailable(),
    email: session?.email ?? null,
    status,
    lastSync,
    enAttente,
    error,
    sendMagicLink: (email: string) => signInWithEmail(email),
    loginWith: (p) => signInWithProvider(p),
    logout: () => {
      signOut();
      setSession(null);
      setLastSync(null);
    },
    syncNow,
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
  // Code de connexion (app installée : le lien ouvre Safari, pas l'app).
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * Consentement aux nouveautés (b165) : jamais pré-coché. Le choix est
   * mémorisé AVANT la redirection sociale (on quitte la page), puis posé
   * sur le compte une fois la session ouverte.
   */
  const [consent, setConsent] = useState(false);
  /**
   * Fournisseurs réellement actifs dans Supabase (b166) : on les demande
   * au serveur au lieu de dépendre d'une variable de compilation. Un
   * fournisseur activé apparaît sans qu'on redéploie quoi que ce soit.
   */
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  useEffect(() => {
    let alive = true;
    void enabledProviders().then((list) => {
      if (alive) setProviders(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  const rememberConsent = () => {
    try {
      sessionStorage.setItem('sing2me/consentPending', consent ? '1' : '0');
    } catch {
      // stockage indisponible : le consentement se redemandera
    }
  };

  // VITE_OAUTH_ENABLED ne sert plus qu'à COUPER les connexions sociales
  // (valeur « 0 ») ; sinon, c'est Supabase qui fait foi.
  const shownProviders =
    import.meta.env.VITE_OAUTH_ENABLED === '0' ? [] : providers;

  if (!account) return null;

  if (!account.available) {
    return (
      <p className="help">
        {t(
          "☁ Synchronisation indisponible pour le moment — tes données restent enregistrées sur cet appareil, rien n'est perdu.",
        )}
      </p>
    );
  }

  if (account.email !== null) {
    return (
      <div
        className="hstack"
        style={{ gap: 8, flexWrap: 'wrap', padding: '2px 0' }}
      >
        {/* Ce qui attend d'être envoyé (b222). Travailler sans réseau est
            devenu normal depuis b221 : ce repère dit que rien n'est perdu,
            sans réclamer d'action. Il disparaît dès qu'il n'a plus rien à
            dire — jamais de mention qui reste là à vie (règle 11). */}
        {account.enAttente > 0 && (
          <span
            className="help"
            style={{ color: 'var(--warn)', width: '100%' }}
            aria-live="polite"
          >
            ↑{' '}
            {account.enAttente > 1
              ? t(
                  '{n} modifications en attente — elles partiront au retour du réseau.',
                  { n: account.enAttente },
                )
              : t(
                  '{n} modification en attente — elle partira au retour du réseau.',
                  { n: account.enAttente },
                )}
          </span>
        )}
        <span
          style={{
            color: 'var(--accent)',
            fontWeight: 650,
            flexShrink: 0,
            flex: 1,
          }}
        >
          {t('☁ Connecté')}
        </span>
        <button className="btn ghost small" onClick={account.logout}>
          {t('Se déconnecter')}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="help" style={{ marginTop: 0 }}>
        <strong>{t('Connecte-toi ou crée ton compte (gratuit)')}</strong>
        {t(
          " — c'est le même champ : entre ton email, le lien reçu te connecte (et crée le compte s'il n'existe pas encore). Ta bibliothèque te suit ensuite sur tous tes appareils.",
        )}
      </p>
      {sent ? (
        <div>
          <p style={{ marginTop: 0 }}>
            <strong style={{ color: 'var(--accent)' }}>
              {t('Lien envoyé à {email}', { email })}
            </strong>
          </p>
          <p className="help">
            {t('Ouvre cet email ')}
            <strong>{t('sur cet appareil')}</strong>
            {t(' et touche le lien — ou saisis ici le ')}
            <strong>{t('code de connexion')}</strong>
            {t(
              " de l'email (recommandé si tu utilises l'app installée sur l'écran d'accueil). Pense aux spams.",
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={code}
              placeholder={t('Code de connexion')}
              inputMode="numeric"
              autoComplete="one-time-code"
              /* Longueur configurable côté serveur (6 à 10 chiffres selon
                 le projet — 8 chez nous) : on ne fige rien ici. */
              maxLength={10}
              style={{ letterSpacing: 3 }}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="btn"
              style={{ flexShrink: 0 }}
              disabled={code.length < 6 || busy}
              onClick={() => {
                setBusy(true);
                setLocalError(null);
                verifyEmailCode(email.trim(), code)
                  .then(() => {
                    // Reconstruction propre (mêmes effets que le retour du
                    // lien magique) : synchro cloud, comptes, groupes.
                    location.hash = '#/artist';
                    location.reload();
                  })
                  .catch((e) =>
                    setLocalError(
                      e instanceof Error ? e.message : t('Code refusé.'),
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? '…' : t('Valider')}
            </button>
          </div>
          {localError && (
            <p style={{ color: 'var(--danger)', marginTop: 0 }}>{localError}</p>
          )}
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
              {t('Renvoyer le lien')}
            </button>
            <button
              className="btn ghost small"
              onClick={() => setSent(false)}
            >
              {t("Changer d'adresse")}
            </button>
          </div>
        </div>
      ) : (
        <Field label={t('Email')}>
          {/* Le bouton passe à la ligne sur les petits écrans (b167) : à
              360px la ligne débordait de l'écran. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email"
              value={email}
              placeholder={t('toi@exemple.com')}
              autoFocus={joining}
              autoComplete="email"
              inputMode="email"
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 0 }}
            />
            <button
              className="btn"
              style={{ flex: '1 0 auto' }}
              title={t(
                'Connexion OU création de compte — le lien magique fait les deux',
              )}
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
                      e instanceof Error ? e.message : t("L'envoi a échoué."),
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? '…' : t('Recevoir mon lien')}
            </button>
          </div>
        </Field>
      )}
      {shownProviders.length > 0 && (
        <>
          <p className="help" style={{ margin: '4px 0 8px' }}>
            {t('Ou connecte-toi en un geste :')}
          </p>
          <div className="oauthrow">
            {shownProviders.map((p) => (
              <button
                key={p}
                className="btn ghost block oauthbtn"
                onClick={() => {
                  rememberConsent();
                  account.loginWith(p);
                }}
              >
                <ProviderMark provider={p} size={19} />
                <span>
                  {p === 'google' && t('Continuer avec Google')}
                  {p === 'apple' && t('Continuer avec Apple')}
                  {p === 'facebook' && t('Continuer avec Facebook')}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {/* Consentement AUX NOUVEAUTÉS uniquement (b165) : case jamais
          pré-cochée, comme l'exige le RGPD. Les messages de service
          (invitation d'un groupe, alerte) n'en dépendent pas. */}
      <label className="consentrow">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {t('Je veux recevoir les nouveautés de Sing2Me (facultatif).')}
        </span>
      </label>
      {(localError ?? account.error) && (
        <p style={{ color: 'var(--danger)', marginBottom: 0 }}>
          {localError ?? account.error}
        </p>
      )}
      <p className="help" style={{ marginBottom: 0 }}>
        {t(
          'Entre ton email et touche « Recevoir mon lien » : le lien magique te connecte (et crée ton compte si besoin), sans mot de passe. En créant un compte, tu acceptes les',
        )}{' '}
        <a href="#/cgu" style={{ color: 'var(--accent)' }}>
          {t("conditions d'utilisation")}
        </a>
        .
      </p>
    </div>
  );
}
