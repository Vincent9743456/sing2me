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
  monId,
  pullCloud,
  pushCloud,
  signInWithEmail,
  verifyEmailCode,
  signInWithProvider,
  signOut,
  SESSION_MAJ_EVENT,
  takeAuthError,
} from '../lib/auth';
import { ProviderMark } from './ProviderMark';
import {
  cleanupOrphanCloudBands,
  clearPendingInvite,
  INVITE_EVENT,
  joinBand,
  leaveBand,
  peekPendingInvite,
  pullBandLibrary,
  pushBandLibrary,
  upsertProfile,
} from '../lib/bands';
import {
  departsEnAttente,
  retirerDepartEnAttente,
} from '../lib/departs';
import {
  applyBandData,
  appliquerIdentite,
  BandData,
  bandDataEqual,
  emptyBandData,
  exportBandData,
  identiteDuGroupe,
  mergeBandData,
} from '../lib/bandSync';
import { migrateSong } from '../lib/model';
import { dedupeExamples, exampleSetlist, exampleSongs } from '../seed';
import {
  ensureBandPage,
  reserverAdresseArtiste,
} from '../lib/publicPages';
import { republierFicheArtiste } from '../lib/masquagegroupe';
import {
  compteLocal,
  noterCompteLocal,
  oublierCachesDuCompte,
} from '../lib/compte';
import { compterEnAttente, etatVide, mergeStates, SyncState } from '../lib/sync';
import { navigate } from '../router';
import { AppState, useStore } from '../store';
import { Band, emptyBand, estBrouillon, makeId } from '../types';
import { t } from '../i18n';
import { Field } from './ui';
import { signalerLimite } from './UpgradeSheet';

/**
 * Boutons OAuth (Google / Facebook) : masqués tant que ces fournisseurs ne
 * sont pas activés dans Supabase — sinon le clic renvoie une erreur 400
 * « provider is not enabled ». Le lien magique par email fonctionne toujours.
 * Depuis b166, l'app DEMANDE à Supabase quels fournisseurs sont actifs :
 * plus rien à activer côté Vercel. VITE_OAUTH_ENABLED='0' reste un
 * coupe-circuit pour tout masquer si besoin.
 */

/** Valide la forme d'une bibliothèque de groupe venant du cloud. */
/**
 * On ÉTALE, on ne RECONSTRUIT pas (cicatrice b202, quatrième récidive —
 * découverte en ajoutant l'identité du groupe, b273).
 *
 * Cette fonction listait les champs À LA MAIN : `band`, ajoutée aujourd'hui,
 * n'existait pas dans la liste écrite hier, donc la photo du groupe partait
 * bien du créateur, arrivait bien du serveur… et était jetée ici, en silence,
 * juste avant la fusion. Invisible au test si on ne regarde que l'envoi.
 *
 * Le rôle de cette fonction est de GARANTIR les tableaux, pas de décider ce
 * qui a le droit d'exister : tout le reste passe tel quel.
 */
function sanitizeBand(raw: unknown): BandData {
  if (!raw || typeof raw !== 'object') return emptyBandData();
  const r = raw as Partial<BandData> & Record<string, unknown>;
  return {
    ...r,
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
/**
 * Les BROUILLONS de création ne montent JAMAIS au cloud (b319) : ils sont
 * locaux à l'appareil par construction. Le filtre s'applique à l'ENVOI
 * seulement — jamais à l'état fusionné/hydraté, sinon chaque rattrapage
 * effacerait le brouillon en cours de l'appareil.
 */
function sansBrouillons<S extends { songs?: { status?: string }[] }>(
  etat: S,
): S {
  const songs = etat.songs ?? [];
  const gardes = songs.filter((s) => !estBrouillon(s as { status?: 'draft' | 'formatting' }));
  if (gardes.length === songs.length) return etat;
  return { ...etat, songs: gardes };
}

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

/** Le refus LIMIT_SONGS, dit en français — UN texte pour les deux chemins
 *  (synchro de connexion et envoi en cours de route, b381/b383). Fonction,
 *  pas constante : `t()` ne s'appelle jamais au niveau module. */
function messageLimiteMorceaux(): string {
  return t(
    'Ta bibliothèque dépasse le plan gratuit : les nouveaux morceaux restent sur cet appareil tant que tu n’en supprimes pas (ou ne passes pas en illimité). Rien n’est perdu.',
  );
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [session, setSession] = useState<AuthSession | null>(
    () => handleRedirectHash() ?? loadSession(),
  );
  // L'adresse e-mail du compte peut changer SOUS l'app (b405, confirmation
  // d'un changement d'adresse) : on relit la session stockée quand la lib
  // d'auth le signale. Même compte (userId inchangé) → aucune resynchro.
  useEffect(() => {
    const relire = () => setSession(loadSession());
    window.addEventListener(SESSION_MAJ_EVENT, relire);
    return () => window.removeEventListener(SESSION_MAJ_EVENT, relire);
  }, []);
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

  /**
   * NOM DONNÉ PAR LE FOURNISSEUR (Google/Apple/Facebook) — MIS DE CÔTÉ, PAS
   * ÉCRIT TOUT DE SUITE (b244, deuxième cause de la perte de profil de
   * Vincent : son nom d'artiste était devenu « tessier vincent »).
   *
   * Ce nom s'écrivait AU MONTAGE, donc AVANT la fusion de connexion — et
   * `saveArtist` horodate. Un profil local vide se retrouvait donc estampillé
   * à l'instant, battait la copie du cloud à la fusion suivante, et partait
   * l'écraser. Le nom du compte remplaçait le nom d'artiste, et le reste
   * disparaissait.
   *
   * On garde donc le nom sous le coude et on ne l'applique qu'APRÈS la
   * fusion, et seulement si le profil est TOUJOURS sans nom. C'est le seul
   * moment où l'écrire ne peut rien écraser.
   */
  const nomFournisseur = useRef('');
  useEffect(() => {
    const given = takeProviderName();
    if (given !== '') nomFournisseur.current = given;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Pas de push tant que la fusion initiale n'a pas eu lieu
  const readyRef = useRef(false);
  /**
   * L'« ESSAI AUTOMATIQUE » PROMIS EXISTE DÉSORMAIS (b397, capture de
   * Vincent : « Synchronisation impossible pour le moment — nouvel essai
   * automatique » affiché en 5G, et rien ne repartait jamais). Quand la
   * synchro de CONNEXION échoue — réseau pas encore rétabli au lancement,
   * serveur muet, rafraîchissement de jeton raté —, `readyRef` restait à
   * false et TOUT ce qui en dépend (l'envoi, le débounce, le cycle de 90 s)
   * rendait la main sans rien faire ; l'effet, accroché à `session.userId`,
   * ne repartait qu'à la relance complète de l'app. Le message promettait
   * donc un essai qui n'existait pas, et « en attente du réseau » accusait
   * un réseau parfaitement là. `initTick` relance l'effet : recul
   * progressif (5, 15, 30 s puis toutes les 60 s), et tout de suite au
   * retour du réseau ou au premier plan.
   */
  const [initTick, setInitTick] = useState(0);
  const essaisInit = useRef(0);
  /** La synchro de connexion est en échec — c'est elle qu'il faut relancer. */
  const initEnEchec = useRef(false);
  /**
   * Une invitation de groupe est en cours de traitement (b286). Posé AVANT
   * `joinBand` (donc avant tout effacement de `pendingInvite`), il est le seul
   * signal fiable pour que le seed ne s'exécute PAS chez un compte créé sur
   * invitation — dont les premiers morceaux doivent être ceux du groupe.
   * Déclaré ici pour être lisible par l'effet de synchro initiale, qui tourne
   * juste au-dessus.
   */
  const invitedRef = useRef(false);
  /**
   * SYNCHRO PERSO MULTI-APPAREILS (b287, signalé par Vincent : une modif faite
   * sur l'ordi n'apparaissait pas sur l'iPhone). Avant, la bibliothèque perso
   * n'était tirée du cloud QU'au démarrage — l'intervalle et le retour au
   * premier plan ne rappelaient que `syncBands` (les groupes) ou ne faisaient
   * que POUSSER. Un appareil déjà ouvert restait donc sur son état de
   * lancement. Pire : `pushCloud` remplace toute la ligne (aucune fusion
   * serveur), donc un appareil à l'état périmé qui poussait ÉCRASAIT le
   * travail plus récent d'un autre.
   *
   * `persoSyncBusy` sérialise les opérations perso (un seul pull/merge/push à
   * la fois, comme `bandSyncBusy` pour les groupes). `dernierCloud` retient
   * l'`updated_at` du cloud déjà intégré : il distingue une vraie nouveauté
   * d'un autre appareil (→ rafraîchir l'écran) de sa propre poussée (→ ne rien
   * refaire), ce qui évite toute boucle.
   */
  const persoSyncBusy = useRef(false);
  const dernierCloud = useRef('');
  /**
   * Tire la bibliothèque perso et la fusionne (par objet, dernier écrit gagne)
   * avec l'état local. Ne pousse ni n'hydrate : l'appelant décide. La ceinture
   * de b137 s'applique aussi ici (une fusion ne VIDE jamais une biblio pleine).
   */
  const fusionnerPerso = useCallback(async (valid: AuthSession) => {
    const cloud = await pullCloud(valid);
    const local = JSON.parse(stateRef.current) as SyncState;
    const merged = cloud ? mergeStates(local, fromCloud(cloud.data)) : local;
    const videe =
      (local.songs?.length ?? 0) > 0 && (merged.songs?.length ?? 0) === 0;
    return {
      cloudTs: cloud?.updatedAt ?? '',
      neuf: cloud !== null && (cloud.updatedAt ?? '') !== dernierCloud.current,
      etat: videe ? local : merged,
    };
  }, []);
  /**
   * RATTRAPAGE (lecture seule) : ce qu'un AUTRE appareil a modifié dans la
   * biblio perso. Ne pousse pas — le débounce s'en charge quand c'est nous
   * qui avons changé. Ne rafraîchit l'écran QUE si le cloud a du neuf (sinon
   * on relancerait le débounce en boucle).
   */
  /**
   * DÉPARTS DE GROUPE RESTÉS EN ATTENTE (b408, cas Marco) : la
   * réinitialisation et « Quitter le groupe » notent leurs départs avant
   * de les tenter — ici, la synchro rejoue ce qui n'est pas parti, jusqu'à
   * ce que le serveur l'enregistre. Jamais bloquant, jamais d'erreur.
   */
  const rejouerDeparts = useCallback(async (valid: AuthSession) => {
    for (const cid of departsEnAttente()) {
      if (await leaveBand(valid, cid)) retirerDepartEnAttente(cid);
    }
  }, []);

  const rattraperPerso = useCallback(
    async (valid: AuthSession) => {
      if (persoSyncBusy.current) return;
      persoSyncBusy.current = true;
      try {
        const { cloudTs, neuf, etat } = await fusionnerPerso(valid);
        if (!neuf) return;
        dernierCloud.current = cloudTs;
        hydrateRef.current(etat as AppState);
      } catch {
        /* réseau : on réessaiera au prochain cycle */
      } finally {
        persoSyncBusy.current = false;
      }
    },
    [fusionnerPerso],
  );

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
      // Identités de groupe reçues (b273) : la photo et le nom écrits par le
      // créateur, appliqués chez les membres à la fin du tour.
      const identites = new Map<string, Band>();
      let changed = false;
      for (const band of st.bands) {
        const cid = band.cloudId;
        if (!cid) continue;
        // Adresse du groupe, dérivée de son nom (b271). Idempotente et
        // mémorisée : un seul appel réseau par groupe et par lancement.
        void ensureBandPage(valid, band).catch(() => {
          /* jamais bloquant pour la synchro du répertoire */
        });
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
            // Le créateur PUBLIE l'identité du groupe ; un membre ne
            // l'exporte jamais, sinon deux applications se la disputeraient.
            band.owned === true ? identiteDuGroupe(band) : undefined,
          );
          const merged = mergeBandData(cloudData, localData);
          if (merged.band) {
            const maj = appliquerIdentite(band, merged.band);
            if (maj) identites.set(band.id, maj);
          }
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
            // Ce que J'AI apporté au groupe n'est jamais une proposition
            // pour moi (b421).
            monId(),
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
      if (changed || identites.size > 0) {
        const bands = st.bands.map((b) => identites.get(b.id) ?? b);
        hydrateRef.current({ ...st, songs, setlists, bands } as AppState);
      }
      /**
       * UN MASQUAGE QUI N'A PAS ABOUTI REPART TOUT SEUL (b282, même principe
       * que les modifications faites hors ligne, b221). La page publique
       * nommerait sinon un groupe masqué jusqu'au prochain enregistrement du
       * profil — un geste qui ne viendra peut-être jamais.
       */
      const apres = JSON.parse(stateRef.current) as SyncState;
      if (apres.prefs?.ficheARepublier === true) {
        const fait = await republierFicheArtiste(
          valid,
          apres.artist,
          apres.bands,
          apres.prefs.pagePubliqueMasquee === true,
        );
        if (fait) {
          store.savePrefs({ ...apres.prefs, ficheARepublier: undefined });
        }
      }
    } finally {
      bandSyncBusy.current = false;
    }
  }, [store.savePrefs]);

  // À la connexion : tirer le cloud, fusionner, pousser le résultat.
  useEffect(() => {
    if (!session) {
      readyRef.current = false;
      essaisInit.current = 0;
      initEnEchec.current = false;
      setStatus('anon');
      return;
    }
    let cancelled = false;
    // Relance de la synchro de connexion (b397) : programmée sur échec,
    // annulée si l'effet repart (retour au premier plan, changement de
    // compte) — deux relances ne courent jamais en même temps.
    let relance: number | null = null;
    const reessayerBientot = () => {
      if (cancelled) return;
      initEnEchec.current = true;
      const attente = [5, 15, 30][essaisInit.current] ?? 60;
      essaisInit.current++;
      relance = window.setTimeout(
        () => setInitTick((n) => n + 1),
        attente * 1000,
      );
    };
    (async () => {
      setStatus('sync');
      setError(null);
      initEnEchec.current = false;
      try {
        const valid = await getValidSession();
        if (cancelled) return;
        if (!valid) {
          if (loadSession() === null) {
            // Jeton réellement révoqué : retour à l'état déconnecté
            setSession(null);
          } else {
            // Problème réseau passager : session conservée — et l'essai
            // annoncé est bien PROGRAMMÉ (b397).
            setStatus('error');
            setError(
              t(
                'Synchronisation impossible pour le moment — nouvel essai automatique.',
              ),
            );
            reessayerBientot();
          }
          return;
        }
        const cloud = await pullCloud(valid);
        if (cancelled) return;
        const local = JSON.parse(stateRef.current) as SyncState;
        /*
         * DEUX COMPTES NE FUSIONNENT PAS (b259, question de Vincent : « j'ai
         * créé 2 comptes avec 2 mails différents… j'ai l'impression qu'ils
         * fusionnent »). Il avait raison : `localStorage` appartient à
         * l'APPAREIL, la déconnexion n'effaçait que la session, et la
         * synchro suivante fusionnait la bibliothèque du compte précédent
         * avec le cloud du compte qui arrive — puis la POUSSAIT. Au bout
         * d'un aller-retour, les deux comptes contenaient tout.
         *
         * Quand le compte change, on repart donc de RIEN en local : le
         * cloud du compte qui arrive fait foi, à lui seul. Ce n'est pas une
         * perte — les données du compte précédent sont dans SON cloud (le
         * marqueur n'est posé qu'après un envoi réussi), et elles
         * reviennent s'il se reconnecte ici.
         */
        const precedent = compteLocal();
        const changeDeCompte = precedent !== '' && precedent !== valid.userId;
        if (changeDeCompte) {
          oublierCachesDuCompte();
          setError(
            t(
              'Tu as changé de compte : les données du compte précédent restent chez lui, elles ne sont pas mélangées avec celles-ci.',
            ),
          );
        }
        const depart = changeDeCompte ? etatVide() : local;
        const merged = cloud
          ? mergeStates(depart, fromCloud(cloud.data))
          : depart;
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
        // La ceinture ne s'applique PAS à un changement de compte (b259) :
        // arriver sur un compte neuf, c'est légitimement une bibliothèque
        // vide — et garder celle du compte précédent la lui donnerait.
        const videe =
          !changeDeCompte &&
          (local.songs?.length ?? 0) > 0 &&
          (merged.songs?.length ?? 0) === 0;
        const sur = videe ? local : merged;
        if (videe) {
          setError(
            t(
              'Sauvegarde en ligne incohérente — ta bibliothèque locale a été conservée.',
            ),
          );
        }
        /**
         * CONTENU D'EXEMPLE : UNE SEULE FOIS, À LA CRÉATION DU COMPTE (b286,
         * signalé par Vincent : « j'ai plein de "Ma première setlist" »).
         *
         * `cloud === null` = la ligne `user_library` n'existe pas encore, donc
         * ce compte n'a JAMAIS rien eu : c'est le seul instant certain pour
         * semer, et il est LU sur le cloud, pas deviné par un délai. Le premier
         * envoi crée la ligne ; elle n'est plus jamais nulle → aucun re-seed,
         * et une suppression volontaire reste définitive. Jamais sur un lien
         * public ou une invitation (l'invité voit du vrai contenu).
         */
        let hors = false;
        let invite = false;
        try {
          hors = /^#\/(s|p)\//.test(location.hash);
          invite = localStorage.getItem('sing2me/pendingInvite') !== null;
        } catch {
          /* location/stockage indisponible : on ne sème pas dans le doute */
          hors = true;
        }
        let aEcrire = sur;
        if (
          cloud === null &&
          !hors &&
          !invite &&
          // Signal fiable, posé avant `joinBand` : un compte créé sur
          // invitation ne reçoit jamais d'exemples (b286).
          !invitedRef.current &&
          (sur.songs?.length ?? 0) === 0 &&
          (sur.setlists?.length ?? 0) === 0
        ) {
          const songs = exampleSongs();
          aEcrire = {
            ...sur,
            songs,
            setlists: [exampleSetlist(songs.map((s) => s.id))],
          };
        }
        // Effondre les doublons hérités de l'ancien bug, sur l'état FUSIONNÉ
        // (donc en tenant compte de ce que d'autres appareils avaient empilé) ;
        // les tombstones posés se propagent au prochain cycle.
        aEcrire = dedupeExamples(aEcrire);
        hydrateRef.current(aEcrire as AppState);
        // Repère de départ pour le rattrapage multi-appareils (b287) : notre
        // propre poussée ne doit pas passer ensuite pour une nouveauté.
        dernierCloud.current = await pushCloud(valid, sansBrouillons(aEcrire));
        if (cancelled) return;
        // Noté APRÈS l'envoi : un compte marqué dont le cloud n'aurait rien
        // reçu ferait perdre ces données au changement suivant.
        noterCompteLocal(valid.userId);
        readyRef.current = true;
        essaisInit.current = 0;
        setLastSync(new Date().toISOString());
        setStatus('ok');
        // Le nom du fournisseur, MAINTENANT que la fusion est faite : il ne
        // sert qu'à un compte qui n'a vraiment aucun nom (b244).
        const donne = nomFournisseur.current;
        nomFournisseur.current = '';
        if (donne !== '') {
          const apres = JSON.parse(stateRef.current) as SyncState;
          if ((apres.prefs?.userName ?? '').trim() === '') {
            store.savePrefs({ ...apres.prefs, userName: donne });
          }
          if ((apres.artist?.name ?? '').trim() === '') {
            store.saveArtist({ ...apres.artist, name: donne });
          }
        }
        /**
         * ADRESSE PUBLIQUE, RÉSERVÉE TOUTE SEULE (b271, demande de Vincent).
         * Après la fusion — jamais avant (cicatrice b244) — et seulement si
         * ce compte n'en a pas déjà une : on ne republie rien ici, c'est une
         * réservation, pas une sauvegarde.
         */
        void (async () => {
          try {
            const st = JSON.parse(stateRef.current) as SyncState;
            await reserverAdresseArtiste(
              valid,
              st.artist,
              st.bands,
              st.prefs?.pagePubliqueMasquee === true,
              // Même repli que l'annuaire (b276) : sans nom d'artiste, un
              // compte tout neuf a quand même une adresse et une fiche.
              st.prefs?.userName || (valid.email ?? '').split('@')[0] || '',
            );
          } catch {
            // sans adresse, la carte « Ton lien public » reste disponible
          }
        })();
        // Départs de groupe restés en attente (b408) : rejoués avant la
        // synchro des groupes, sinon celle-ci ressusciterait le répertoire
        // d'un groupe qu'on est en train de quitter.
        void rejouerDeparts(valid);
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
          // LIMITE DU PLAN À LA CONNEXION (b383, capture de Vincent : le
          // JSON brut du serveur s'affichait sur la fiche Artiste). Seule
          // la POUSSÉE est refusée — la lecture, la fusion et l'hydratation
          // ont déjà réussi. La synchro reste donc EN VIE (`readyRef`) :
          // le rattrapage, les groupes et les prochains essais d'envoi
          // continuent ; sans ça, un refus au démarrage éteignait toute la
          // synchro de la session. Même message et même feuille que le
          // refus en cours de route ; `noterCompteLocal` reste NON posé
          // (b259 : jamais avant un envoi réussi).
          if (String(e).includes('LIMIT_SONGS')) {
            readyRef.current = true;
            essaisInit.current = 0;
            limiteSignalee.current = true;
            signalerLimite('LIMIT_SONGS');
            setStatus('error');
            setError(messageLimiteMorceaux());
          } else {
            setStatus('error');
            setError(
              e instanceof Error ? e.message : t('Synchronisation impossible.'),
            );
            reessayerBientot();
          }
        }
      }
    })();
    return () => {
      cancelled = true;
      if (relance !== null) window.clearTimeout(relance);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, initTick]);

  /**
   * INVITATION EN ATTENTE — TERMINÉE TOUTE SEULE, COMPTE NEUF OU PAS (b252).
   *
   * L'adhésion automatique n'était déclenchée que par le CHANGEMENT de
   * compte (`session?.userId`) : parfaite au retour du lien magique, elle ne
   * partait JAMAIS pour quelqu'un qui avait déjà un compte — la navigation
   * vers l'onglet Artiste ne remonte pas le composant, donc rien ne
   * réveillait l'effet. L'invitation restait en attente indéfiniment :
   * « j'ai accepté une invitation mais je ne vois pas le groupe » (Vincent).
   *
   * On écoute donc AUSSI le dépôt de l'invitation, et le retour de l'app au
   * premier plan — un lien ouvert dans un autre onglet ne laisse pas d'autre
   * signal.
   */
  const [inviteTick, setInviteTick] = useState(0);
  useEffect(() => {
    const reveille = () => setInviteTick((n) => n + 1);
    window.addEventListener(INVITE_EVENT, reveille);
    window.addEventListener('focus', reveille);
    return () => {
      window.removeEventListener(INVITE_EVENT, reveille);
      window.removeEventListener('focus', reveille);
    };
  }, []);
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
        // On garde le repère de bienvenue (utilisé par l'accueil), mais on
        // mène l'invité DROIT DANS LE GROUPE (P1-1) : après une connexion par
        // lien magique, l'adhésion se termine seule ici, et on ouvre la fiche
        // du groupe — jamais un écran mort ni un onglet à chercher.
        try {
          localStorage.setItem(
            'sing2me/justJoined',
            JSON.stringify({ name: bandName || pending.band, bandId: localBandId }),
          );
        } catch {
          // stockage indisponible
        }
        navigate(localBandId ? '/band/' + localBandId : '/');
      } catch {
        // échec passager : on retentera au prochain cycle de session
        invitedRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, inviteTick]);

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
  /** Le message « plan gratuit dépassé » se lève tout seul dès qu'une
   *  poussée passe (règle 11) — sans toucher aux autres messages. */
  const limiteSignalee = useRef(false);

  /** L'envoi lui-même, appelable par le débounce ET par le retour du réseau. */
  const envoyer = useCallback(async () => {
    if (!readyRef.current) return;
    // Un rattrapage tient le verrou : on repasse très vite (le drapeau
    // `aEnvoyer` reste levé, donc rien n'est perdu).
    if (persoSyncBusy.current) {
      window.setTimeout(() => void envoyer(), 500);
      return;
    }
    persoSyncBusy.current = true;
    try {
      const valid = await getValidSession();
      if (!valid) {
        // Une session qu'on ne peut pas valider N'EST PAS un succès (b374) :
        // abandonner en silence laissait croire que tout partait, pendant
        // que les modifications restaient sur l'appareil. Le statut passe en
        // erreur — le compteur « en attente » et le bloc du compte le disent.
        setStatus('error');
        return;
      }
      // FUSIONNER AVANT DE POUSSER (b287) : `pushCloud` remplace toute la
      // ligne (aucune fusion serveur). Sans ce pull+merge, un appareil à
      // l'état périmé écraserait le travail plus récent d'un autre. Le cloud
      // a-t-il du neuf d'un autre appareil ? Alors on l'affiche aussi.
      const { cloudTs, neuf, etat } = await fusionnerPerso(valid);
      if (neuf) {
        dernierCloud.current = cloudTs;
        hydrateRef.current(etat as AppState);
      }
      dernierCloud.current = await pushCloud(valid, sansBrouillons(etat));
      aEnvoyer.current = false;
      noterEnvoi(new Date().toISOString());
      setStatus('ok');
      if (limiteSignalee.current) {
        limiteSignalee.current = false;
        setError(null);
      }
      void syncBands(valid);
    } catch (e) {
      // LIMITE DU PLAN (b381) : le serveur a refusé la poussée parce que la
      // bibliothèque dépasse le plan gratuit (travail hors ligne, autre
      // appareil…). Ce n'est PAS une panne : on l'explique — la feuille
      // s'ouvre, et le bloc du compte dit pourquoi rien ne part. Tout
      // reste en local, rien n'est perdu.
      if (String(e).includes('LIMIT_SONGS')) {
        signalerLimite('LIMIT_SONGS');
        limiteSignalee.current = true;
        setError(messageLimiteMorceaux());
      }
      // Hors ligne ou serveur muet : rien n'est perdu, tout est en local.
      // Le drapeau reste levé, le prochain retour de réseau réessaiera.
      setStatus('error');
    } finally {
      persoSyncBusy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncBands, noterEnvoi, fusionnerPerso]);

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
    const horsLigne = () =>
      typeof navigator.onLine === 'boolean' && !navigator.onLine;
    const pousserEnAttente = () => {
      if (!aEnvoyer.current || horsLigne()) return;
      void envoyer();
    };
    // Rattrape ce qu'un AUTRE appareil a changé (b287) — c'est ce qui
    // manquait : sans ça, l'iPhone restait sur son état de lancement.
    const rattraper = () => {
      if (horsLigne()) return;
      void (async () => {
        const valid = await getValidSession();
        if (!valid) return;
        // Départs de groupe en attente (b408) : le retour du réseau est
        // exactement le moment où un départ raté peut enfin partir.
        void rejouerDeparts(valid);
        await rattraperPerso(valid);
      })();
    };
    const auRetour = () => {
      // La synchro de CONNEXION est en échec : c'est ELLE qu'on relance,
      // tout de suite (b397) — le rattrapage et l'envoi n'ont pas le droit
      // de courir avant la fusion initiale (cicatrice b244).
      if (initEnEchec.current) {
        setInitTick((n) => n + 1);
        return;
      }
      if (!readyRef.current) return;
      pousserEnAttente();
      rattraper();
    };
    const auPremierPlan = () => {
      if (document.visibilityState === 'visible') auRetour();
    };
    window.addEventListener('online', auRetour);
    document.addEventListener('visibilitychange', auPremierPlan);
    return () => {
      window.removeEventListener('online', auRetour);
      document.removeEventListener('visibilitychange', auPremierPlan);
    };
  }, [session?.userId, envoyer, rattraperPerso, rejouerDeparts]);

  // Cycle régulier : récupère ce que les autres appareils (biblio perso) ET
  // les autres membres (répertoires de groupe) ont modifié.
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      if (!readyRef.current || document.visibilityState !== 'visible') return;
      void (async () => {
        const valid = await getValidSession();
        if (!valid) return;
        await rattraperPerso(valid);
        // Ce qui attend repart aussi sur le cycle (b397) : un envoi tombé
        // sur un serveur muet ne doit pas attendre la prochaine
        // modification pour retenter sa chance. Même règle pour les
        // départs de groupe restés en attente (b408).
        if (aEnvoyer.current) void envoyer();
        void rejouerDeparts(valid);
        void syncBands(valid);
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
  /** Confirmation d'un renvoi (b277) : sans elle, le bouton ne dit rien. */
  const [renvoye, setRenvoye] = useState(false);
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
        {/* CHANGEMENT DE COMPTE (b259) : le message vivait dans le
            formulaire de connexion — donc invisible une fois connecté,
            c'est-à-dire au seul moment où il a quelque chose à dire. */}
        {account.error !== null && (
          <span
            className="help"
            style={{ color: 'var(--warn)', width: '100%' }}
            aria-live="polite"
          >
            {account.error}
          </span>
        )}
        {account.enAttente > 0 && (
          <span
            className="help"
            style={{ color: 'var(--warn)', width: '100%' }}
            aria-live="polite"
          >
            ↑{' '}
            {/* « au retour du réseau » accusait le réseau même quand c'est
                le serveur ou la connexion qui a échoué (b397, capture de
                Vincent : le message affiché en 5G). On promet ce qui se
                passe vraiment : un nouvel essai automatique. */}
            {account.enAttente > 1
              ? t(
                  '{n} modifications en attente — elles partiront toutes seules au prochain essai.',
                  { n: account.enAttente },
                )
              : t(
                  '{n} modification en attente — elle partira toute seule au prochain essai.',
                  { n: account.enAttente },
                )}
          </span>
        )}
        {/* QUEL COMPTE ? (b260, question de Vincent : « je peux supprimer un
            compte sans impacter l'autre ? »). On ne peut pas répondre à ça
            sans savoir sur lequel on est — et l'écran ne disait que
            « Connecté ». Avec deux comptes, c'est la seule information qui
            permette d'agir sans se tromper de côté. */}
        <span
          style={{
            flexShrink: 1,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={account.email}
        >
          <span style={{ color: 'var(--accent)', fontWeight: 650 }}>
            {t('☁ Connecté')}
          </span>
          <span style={{ color: 'var(--text-dim)' }}> · {account.email}</span>
        </span>
        <button className="btn ghost small" onClick={account.logout}>
          {t('Se déconnecter')}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      {/* LE PRINCIPE S'EXPLIQUE ICI, EN TOUTES LETTRES (b407, retour de
          Cédric via Vincent : il a cru avoir « oublié son code » et a
          cherché à le récupérer). Deux choses que l'écran ne disait pas :
          il n'y a PAS de mot de passe, et le code change à chaque fois —
          il n'y a rien à retenir. Et depuis b285, l'email ne contient
          QU'UN CODE (gabarit sans lien, à cause des scanners de
          messagerie) : tout le vocabulaire « lien » de cet écran mentait. */}
      <p className="help" style={{ marginTop: 0 }}>
        <strong>{t('Connecte-toi ou crée ton compte (gratuit)')}</strong>
        {t(
          " — c'est le même champ : entre ton email, saisis le code reçu, c'est tout. Pas de mot de passe — un nouveau code t'est envoyé à chaque connexion, il n'y a rien à retenir. Ta bibliothèque te suit ensuite sur tous tes appareils.",
        )}
      </p>
      {sent ? (
        <div>
          <p style={{ marginTop: 0 }}>
            <strong style={{ color: 'var(--accent)' }}>
              {t('Code envoyé à {email}', { email })}
            </strong>
          </p>
          <p className="help">
            {t('Ouvre l’email reçu et saisis ici le ')}
            <strong>{t('code de connexion')}</strong>
            {t(
              '. Un nouveau code t’est envoyé à chaque connexion — rien à retenir, jamais de mot de passe. Pense aux spams.',
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
                setLocalError(null);
                setRenvoye(false);
                account
                  .sendMagicLink(email.trim())
                  .then(() => setRenvoye(true))
                  // UN RENVOI MUET NE SERT À RIEN (b277, constat de Vincent :
                  // « je n'ai pas reçu de magic link »). Ce bouton avalait
                  // TOUTES les erreurs : plafond d'envoi atteint, adresse
                  // refusée, service d'e-mail non configuré — on ne voyait
                  // rien, et on attendait un message qui n'était jamais parti.
                  // Le premier envoi, lui, disait déjà la vérité.
                  .catch((e: unknown) =>
                    setLocalError(
                      e instanceof Error ? e.message : t("L'envoi a échoué."),
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy
                ? '…'
                : renvoye
                  ? t('✓ Nouveau code envoyé')
                  : t('Renvoyer un code')}
            </button>
            <button
              className="btn ghost small"
              onClick={() => setSent(false)}
            >
              {t("Changer d'adresse")}
            </button>
          </div>
          {/* b495 (cas Rodrigo : « il ne reçoit pas le code ») : les trois
              causes réelles, écrites au moment où l'on attend — spams,
              codes qui s'annulent entre eux, mauvaise adresse. */}
          <p className="help" style={{ marginBottom: 0 }}>
            {t(
              'Rien reçu au bout d’une minute ? Regarde tes spams — l’e-mail vient de mojosong.com. Si tu redemandes un code, seul le dernier reçu fonctionne. Et vérifie l’adresse ci-dessus : le code part vers elle, exactement.',
            )}
          </p>
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
                'Connexion OU création de compte — le même code fait les deux',
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
              {busy ? '…' : t('Recevoir mon code')}
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
          {t('Je veux recevoir les nouveautés de mojosong (facultatif).')}
        </span>
      </label>
      {(localError ?? account.error) && (
        <p style={{ color: 'var(--danger)', marginBottom: 0 }}>
          {localError ?? account.error}
        </p>
      )}
      <p className="help" style={{ marginBottom: 0 }}>
        {t(
          'Entre ton email et touche « Recevoir mon code » : le code te connecte (et crée ton compte si besoin) — jamais de mot de passe. En créant un compte, tu acceptes les',
        )}{' '}
        <a href="#/cgu" style={{ color: 'var(--accent)' }}>
          {t("conditions d'utilisation")}
        </a>
        .
      </p>
    </div>
  );
}
