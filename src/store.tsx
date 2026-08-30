/**
 * Store global, persisté dans localStorage (local-first).
 * La persistance est isolée derrière loadState/saveState : le branchement
 * Supabase (v2 collaborative) remplacera ces deux fonctions sans toucher
 * aux écrans — voir supabase/schema.sql.
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
  bandKeysMatch,
  keyTitlePart,
  normalizeTitle,
  songKey,
} from './lib/normalizeTitle';
import { monId } from './lib/auth';
import { announceBandSong, quiPropose } from './lib/bands';
import {
  leverNouveauPourGroupe,
  lireNouveauPourGroupe,
} from './lib/nouveaupourgroupe';
import { ResetMarks } from './lib/sync';
import { remisEnIdee, sortDuMorceau } from './lib/deletesong';
import { planDeTri } from './lib/depassement';
import {
  duplicateVersion,
  dedupeBandMembers,
  isAbandonedSetlist,
  majMaPhotoDansGroupes,
  migrateConcert,
  migrateSetlist,
  migrateSong,
  removeVersion,
  switchVersion,
  versionForBand,
} from './lib/model';
import {
  dedupeExamples,
  exampleSetlist,
  exampleSongs,
  SEED_KEY,
  SEED_VERSION,
} from './seed';
import { dedupeSongsByContent, reparerSetlists } from './lib/sync';
import { authAvailable } from './lib/auth';
import {
  ArtistProfile,
  Band,
  Concert,
  defaultPrefs,
  emptyArtist,
  estBrouillon,
  Prefs,
  Setlist,
  Song,
  SongNote,
  Tombstone,
  BandRemoval,
} from './types';

const STORAGE_KEY = 'sing2me/web/v1';

export interface AppState {
  songs: Song[];
  setlists: Setlist[];
  concerts: Concert[];
  bands: Band[];
  artist: ArtistProfile;
  prefs: Prefs;
  /** Suppressions à propager entre appareils (500 dernières) */
  deleted: Tombstone[];
  /** Retraits de morceaux des répertoires de groupes (propagés) */
  bandRemovals: BandRemoval[];
  /**
   * Points zéro des réinitialisations (b137) : ce qui est plus vieux que
   * cette date, côté cloud, ne revient pas. Indispensable au-delà de 500
   * éléments effacés — les pierres tombales, elles, sont plafonnées.
   */
  resetAt?: ResetMarks;
}

/** Ajoute une pierre tombale (suppression à propager). */
function bury(deleted: Tombstone[], id: string, key?: string): Tombstone[] {
  return [
    ...deleted.slice(-499),
    { id, at: new Date().toISOString(), ...(key ? { key } : {}) },
  ];
}

interface StoreValue extends AppState {
  /** Remplace tout l'état (synchronisation cloud). */
  hydrate: (state: AppState) => void;
  saveSong: (song: Song) => void;
  deleteSong: (songId: string) => void;
  /** Accepte une proposition de groupe : elle entre en bibliothèque ET dans
   *  le répertoire du groupe qui l'a proposée (b205). */
  acceptSong: (songId: string) => void;
  /** Sort une proposition en retirant le morceau du répertoire du groupe
   *  (b421) — acte de niveau groupe, propagé à tous les membres. */
  retirerProposition: (songId: string) => void;
  /** Tri du dépassement (b422) : ramène la bibliothèque au plafond du plan
   *  gratuit — décision dans lib/depassement.ts (planDeTri). */
  appliquerPlafond: (max: number) => void;
  saveSetlist: (setlist: Setlist) => void;
  deleteSetlist: (setlistId: string) => void;
  saveConcert: (concert: Concert) => void;
  deleteConcert: (concertId: string) => void;
  saveArtist: (artist: ArtistProfile) => void;
  savePrefs: (prefs: Prefs) => void;
  saveBand: (band: Band) => void;
  deleteBand: (bandId: string) => void;
  /** Supprime une note de répétition (suppression propagée partout). */
  deleteNote: (songId: string, noteId: string) => void;
  /** Remplace une note par sa version à jour (note vivante, b154). */
  replaceNote: (songId: string, oldNoteId: string, note: SongNote) => void;
  /** Retire un morceau (titre normalisé) du répertoire d'un groupe. */
  recordBandRemoval: (bandId: string, key: string) => void;
  /** Annule un retrait (le morceau ré-intègre le répertoire du groupe). */
  clearBandRemoval: (bandId: string, key: string) => void;
  /** Réinitialise une partie des données (écran Réglages). */
  resetData: (parts: ResetParts) => void;
  /**
   * Retire une setlist DU GROUPE (b146) : elle disparaît chez tous les
   * membres, mais reste chez son auteur — simplement détachée du groupe.
   */
  removeSetlistFromBand: (setlistId: string) => void;
  /**
   * Supprime un BROUILLON de création (b319) — sans pierre tombale : un
   * brouillon n'est jamais synchronisé, une tombe ne servirait qu'à polluer
   * la liste des suppressions. Ne touche jamais un morceau validé.
   */
  purgeBrouillon: (songId: string) => void;
}

/** Ce que l'utilisateur choisit d'effacer (réinitialisation partielle). */
export interface ResetParts {
  artist?: boolean;
  bands?: boolean;
  songs?: boolean;
  setlists?: boolean;
  concerts?: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * Renseigne automatiquement la clé du direct (ON AIR) depuis la variable de
 * build VITE_LIVE_KEY quand l'utilisateur ne l'a pas saisie : plus rien à
 * copier à la main. (Doit valoir la même chose que LIVE_KEY côté serveur.)
 */
function withEmbeddedLiveKey(state: AppState): AppState {
  const embedded = import.meta.env.VITE_LIVE_KEY;
  if (embedded && state.prefs.liveKey.trim() === '') {
    return { ...state, prefs: { ...state.prefs, liveKey: embedded } };
  }
  return state;
}

/** Brouillon de création plus vieux que 6 h → balayé au chargement (b319). */
const BROUILLON_TTL_MS = 6 * 60 * 60 * 1000;
function brouillonPerime(s: Song): boolean {
  if (!estBrouillon(s)) return false;
  const t = Date.parse(s.createdAt);
  return Number.isNaN(t) || Date.now() - t > BROUILLON_TTL_MS;
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      // Effondre d'emblée les doublons de contenu (b286 pour les exemples,
      // b316 pour les vrais morceaux dupliqués par une double connexion) : on
      // nettoie au chargement, et les tombstones posés se propagent à la
      // fusion suivante. Puis RÉPARE les items de setlist orphelins (b473,
      // bug de Marco) via les redirections de tombes et les clés d'items.
      // Les trois passes sont idempotentes.
      return reparerSetlists(dedupeSongsByContent(dedupeExamples(withEmbeddedLiveKey({
        // migration automatique de l'ancien modèle à sections.
        // Les BROUILLONS de création périmés (b319) sont balayés au
        // chargement : TTL de 6 h — pas de cimetière de brouillons. Un
        // brouillon récent survit (backgrounding, appel reçu…).
        songs: (Array.isArray(parsed.songs) ? parsed.songs : [])
          .map(migrateSong)
          .filter((s) => !brouillonPerime(s)),
        // Coquilles vides laissées par le défaut corrigé en b146 : on les
        // retire au chargement (aucune donnée réelle n'y est perdue).
        setlists: (Array.isArray(parsed.setlists) ? parsed.setlists : [])
          .map(migrateSetlist)
          .filter((sl) => !isAbandonedSetlist(sl)),
        concerts: (Array.isArray(parsed.concerts) ? parsed.concerts : []).map(
          migrateConcert,
        ),
        // Valeurs par défaut d'un groupe lu du disque : un fichier ancien
        // peut ne pas avoir ces champs. L'étalement passe APRÈS, donc ce
        // qui existe gagne (une clé absente ne remplace rien).
        bands: (Array.isArray(parsed.bands) ? parsed.bands : []).map(
          (b: Partial<Band>) =>
            // Un musicien inscrit deux fois (à la main ET par son compte)
            // n'a qu'une ligne (b248) : les écrans le cachaient, la page
            // publique le montrait — on répare à la source.
            dedupeBandMembers({
              bio: '',
              photo: '',
              links: [],
              tipUrl: '',
              ...b,
            } as Band),
        ),
        artist: { ...emptyArtist(), ...(parsed.artist ?? {}) },
        prefs: { ...defaultPrefs(), ...(parsed.prefs ?? {}) },
        deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
        resetAt: parsed.resetAt ?? {},
        bandRemovals: Array.isArray(parsed.bandRemovals)
          ? parsed.bandRemovals
          : [],
      }))));
    }
  } catch {
    // stockage illisible : on repart des données de démo
  }
  // Installation neuve : bibliothèque vide (le contenu témoin est injecté
  // ensuite par un effet, sauf pour les invités — voir StoreProvider).
  return withEmbeddedLiveKey({
    songs: [],
    setlists: [],
    concerts: [],
    bands: [],
    artist: emptyArtist(),
    prefs: defaultPrefs(),
    deleted: [],
    bandRemovals: [],
  });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const timer = useRef<number | null>(null);
  // Lecture de l'état courant hors setState (b472) : saveSong doit décider
  // AVANT d'écrire (le morceau est-il nouveau ? le groupe existe-t-il ?)
  // sans réexécuter d'effets dans l'updater — React peut le rejouer.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Contenu témoin : deux morceaux d'exemple à la toute première ouverture.
   *
   * DEUX GARDES, apprises à nos dépens (b200 — signalé par Marco, qui a vu
   * « À la claire fontaine » et « Le temps des cerises » revenir après les
   * avoir supprimés) :
   *
   *  1. Les exemples reçoivent un identifiant NEUF à chaque injection : une
   *     pierre tombale, qui vise un identifiant, ne pouvait donc jamais les
   *     arrêter. On compare maintenant par TITRE — un exemple enterré ne
   *     réapparaît plus jamais.
   *  2. Le seed s'exécutait au montage, AVANT que la synchronisation n'ait
   *     rapatrié la bibliothèque du compte. Sur un appareil dont le stockage
   *     local a été vidé, l'app voyait une bibliothèque vide et injectait les
   *     exemples par-dessus une vraie collection. Quand un compte est
   *     connecté, on laisse donc à la synchro le temps de parler.
   */
  useEffect(() => {
    // AVEC UN CLOUD, C'EST LA SYNCHRO QUI SÈME (b286). Le seul instant où l'on
    // est CERTAIN qu'un compte n'a jamais eu de bibliothèque, c'est quand sa
    // ligne cloud n'existe pas encore — ce que seul le premier sync sait
    // (`AccountProvider`). Semer ici, au montage, avant que la synchro n'ait
    // parlé, c'était la cause des « Ma première setlist » en série : la course
    // injectait les exemples par-dessus une biblio qui arrivait juste après,
    // et la fusion par id (exemples ré-identifiés à neuf) les empilait.
    // Ce seed local ne sert donc plus qu'aux déploiements SANS cloud.
    if (authAvailable()) return;
    let seeded = false;
    try {
      seeded = localStorage.getItem(SEED_KEY) !== null;
    } catch {
      seeded = true;
    }
    if (seeded) return;
    // Sur un lien de partage/invitation (#/s/… ou #/p/…), on ne seede pas et
    // on ne pose PAS le drapeau : l'invité voit du vrai contenu.
    try {
      if (/^#\/(s|p)\//.test(location.hash)) return;
    } catch {
      /* location indisponible */
    }
    let invited = false;
    let connecte = false;
    try {
      invited = localStorage.getItem('sing2me/pendingInvite') !== null;
      connecte = localStorage.getItem('sing2me/session') !== null;
    } catch {
      invited = false;
    }
    const poser = () => {
      try {
        localStorage.setItem(SEED_KEY, SEED_VERSION);
      } catch {
        // stockage indisponible : tant pis, pas d'exemples
      }
    };
    if (invited) {
      poser();
      return;
    }
    const injecter = () => {
      poser();
      setState((prev) => {
        if (prev.songs.length > 0 || prev.setlists.length > 0) return prev;
        // Garde 1 : un exemple ENTERRÉ ne revient pas. La comparaison se fait
        // sur le titre, seul repère stable — l'identifiant, lui, est neuf.
        const enterres = new Set(
          prev.deleted
            .map((t) => keyTitlePart(t.key ?? ''))
            .filter((t) => t !== ''),
        );
        const songs = exampleSongs().filter(
          (sg) => !enterres.has(normalizeTitle(sg.title)),
        );
        if (songs.length === 0) return prev;
        const setlist = exampleSetlist(songs.map((sg) => sg.id));
        return { ...prev, songs, setlists: [setlist] };
      });
    };
    // Garde 2 : avec un compte, la bibliothèque arrive du cloud — on lui
    // laisse le temps. `injecter` re-teste de toute façon avant d'écrire.
    if (!connecte) {
      injecter();
      return;
    }
    const id = window.setTimeout(injecter, 6000);
    return () => window.clearTimeout(id);
    // au montage uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ecrire = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // quota dépassé : on ignore (les photos trop lourdes peuvent saturer)
      }
    };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(ecrire, 250);
    /*
     * VIDAGE IMMÉDIAT au passage en arrière-plan (b323, brouillon perdu par
     * Vincent) : iOS suspend la PWA à l'instant où un autre onglet/app
     * s'ouvre — le différé de 250 ms n'avait alors jamais lieu, et un état
     * tout juste créé (le brouillon de recherche, ouvert vers UG dans la
     * même seconde) disparaissait si l'app était rechargée au retour.
     * `pagehide` + `visibilitychange(hidden)` sont les deux signaux fiables
     * d'iOS ; écrire deux fois est sans effet (même contenu).
     */
    const surMasquage = () => {
      if (document.visibilityState === 'hidden') ecrire();
    };
    window.addEventListener('pagehide', ecrire);
    document.addEventListener('visibilitychange', surMasquage);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      window.removeEventListener('pagehide', ecrire);
      document.removeEventListener('visibilitychange', surMasquage);
    };
  }, [state]);

  const saveSong = useCallback((song: Song) => {
    let stamped = { ...song, updatedAt: new Date().toISOString() };
    /*
     * MORCEAU CRÉÉ POUR UN GROUPE (b472, point 1 des retours de Vincent) :
     * le ＋ de Morceaux en contexte groupe pose un marqueur de session ;
     * il se consomme ICI, au point d'écriture unique, à l'instant où le
     * morceau devient DÉFINITIF (nouveau, ou brouillon qui se valide) —
     * ainsi tous les chemins de création (recherche, lien, collage,
     * écriture à la main) l'appliquent sans y penser. Même geste que le
     * SongCollector : version de groupe + provenance (b420), retrait
     * annulé (tombstone), annonce dans la discussion (best-effort).
     */
    const etat = stateRef.current;
    let auGroupe: { bandId: string; cloudId?: string } | null = null;
    if (!estBrouillon(stamped)) {
      const avant = etat.songs.find((s) => s.id === stamped.id);
      if (avant === undefined || estBrouillon(avant)) {
        const bandId = lireNouveauPourGroupe();
        const b =
          bandId !== '' ? etat.bands.find((x) => x.id === bandId) : undefined;
        if (bandId !== '') leverNouveauPourGroupe();
        if (b && versionForBand(stamped, b.id) === null) {
          stamped = switchVersion(
            duplicateVersion(
              stamped,
              b.name || 'Groupe',
              b.id,
              quiPropose(etat.prefs.userName || etat.artist.name),
            ),
            stamped.activeVersionId,
          );
          auGroupe = { bandId: b.id, cloudId: b.cloudId };
        }
      }
    }
    const aj = auGroupe;
    setState((prev) => ({
      ...prev,
      songs: prev.songs.some((s) => s.id === stamped.id)
        ? prev.songs.map((s) => (s.id === stamped.id ? stamped : s))
        : [...prev.songs, stamped],
      // Un retrait passé de ce titre ne doit pas ré-effacer l'ajout.
      bandRemovals:
        aj === null
          ? prev.bandRemovals
          : (prev.bandRemovals ?? []).filter(
              (r) =>
                !(
                  r.bandId === aj.bandId &&
                  bandKeysMatch(r.key, songKey(stamped.title, stamped.artist))
                ),
            ),
    }));
    if (aj !== null) {
      void announceBandSong(
        aj.cloudId,
        etat.prefs.userName || etat.artist.name || 'Moi',
        stamped.title,
        stamped.artist,
      );
    }
  }, []);

  /**
   * ACCEPTER une proposition de groupe (b205, constat de Vincent : « j'ai
   * accepté la chanson proposée par Marco, mais après l'acceptation je ne la
   * vois pas dans le groupe »).
   *
   * Le bouton « ✓ Accepter » n'effaçait que la PROVENANCE
   * (`pendingBandId`) et laissait le morceau à l'état d'idée. Il sortait
   * donc de la vue du groupe (qui l'y montrait justement grâce à cette
   * provenance) sans entrer nulle part ailleurs : accepter le faisait
   * disparaître. Accepter, c'est exactement ce que fait déjà le fait de le
   * programmer dans une setlist (règle b174) — l'inscrire en bibliothèque.
   *
   * Et puisqu'il vient d'un groupe, il ENTRE dans le répertoire de ce
   * groupe : on garantit la version de contexte au lieu d'espérer qu'elle
   * ait survécu au voyage. C'est la demande de Vincent, mot pour mot :
   * « il faudrait qu'elle soit automatiquement rattachée à ce groupe ».
   *
   * Placé dans le store, comme la règle des setlists, pour que les deux
   * chemins d'acceptation ne puissent plus diverger.
   */
  const acceptSong = useCallback((songId: string) => {
    setState((prev) => ({
      ...prev,
      songs: prev.songs.map((s) => {
        if (s.id !== songId) return s;
        const from = (s.pendingBandId ?? '').trim();
        const adopte: Song = {
          ...s,
          idea: false,
          pendingBandId: undefined,
          updatedAt: new Date().toISOString(),
        };
        if (from === '' || versionForBand(adopte, from) !== null) return adopte;
        return {
          ...duplicateVersion(adopte, 'Version groupe', from),
          updatedAt: adopte.updatedAt,
        };
      }),
    }));
  }, []);

  /**
   * SUPPRIMER — trois issues, décidées par `sortDuMorceau` (b239).
   *
   * La règle vit ICI, dans le store, pour que TOUS les chemins de
   * suppression l'appliquent sans avoir à y penser (fiche morceau, ligne de
   * la bibliothèque, volet d'aperçu, éditeur) — même raisonnement que pour
   * `saveSetlist`. Les écrans, eux, ANNONCENT la même décision avant de
   * demander confirmation : ils appellent la même fonction.
   */
  const deleteSong = useCallback((songId: string) => {
    setState((prev) => {
      const song = prev.songs.find((s) => s.id === songId);
      const sort = song
        ? sortDuMorceau(song, prev.setlists, prev.bands)
        : { mode: 'supprime' as const };
      // Programmé dans une setlist du GROUPE : on ne touche à rien. Le
      // retirer du programme engage les autres musiciens, pas seulement moi.
      if (sort.mode === 'refus') return prev;
      // UNE PROPOSITION NE SE REFUSE PAS (b418, arbitrage Vincent —
      // remplace l'écartée de b240) : elle attend l'acceptation, et
      // disparaît d'elle-même si le groupe la retire de son répertoire.
      // La feuille de suppression l'explique ; ici, rien ne se passe.
      if (sort.mode === 'proposition') return prev;
      // Morceau du répertoire d'un groupe : il ne s'efface pas, il REDEVIENT
      // une proposition dans les Idées — récupérable, et sans pierre
      // tombale (une tombe l'empêcherait de revenir).
      if (sort.mode === 'idee' && song) {
        return {
          ...prev,
          songs: prev.songs.map((s) =>
            s.id === songId ? remisEnIdee(s, sort.bandId) : s,
          ),
          setlists: prev.setlists.map((sl) => ({
            ...sl,
            items: sl.items.filter((it) => it.songId !== songId),
          })),
        };
      }
      return {
        ...prev,
        songs: prev.songs.filter((s) => s.id !== songId),
        setlists: prev.setlists.map((sl) => ({
          ...sl,
          items: sl.items.filter((it) => it.songId !== songId),
        })),
        // Pierre tombale avec la clé titre @ artiste (b132) — l'import en
        // masse et la synchro de groupe comparent en souplesse
        // (bandKeysMatch), les anciennes tombes « titre seul » valent encore.
        deleted: bury(
          prev.deleted,
          songId,
          song ? songKey(song.title, song.artist) : undefined,
        ),
      };
    });
  }, []);

  /**
   * SORTIR UNE PROPOSITION EN LA RETIRANT DU RÉPERTOIRE (b421, constat de
   * Vincent : « je ne peux pas les supprimer alors que c'est moi qui les ai
   * envoyés »). Une proposition ne se refuse pas (b418) — mais retirer le
   * morceau du répertoire du groupe est un acte de NIVEAU GROUPE auquel tout
   * membre a droit (b110), et c'est la sortie que b418 décrivait déjà :
   * « elle disparaît d'elle-même si le morceau est retiré du répertoire ».
   * Ici, tout se fait d'un geste : le retrait part au groupe (bandRemovals,
   * même canal que recordBandRemoval) et ma copie en boîte disparaît — tombe
   * par ID seul, jamais de clé (un retrait n'interdit pas de réimporter le
   * titre un jour). Chez les autres : une copie ACCEPTÉE reste personnelle,
   * une proposition en attente disparaît (b418, applyBandData).
   */
  const retirerProposition = useCallback((songId: string) => {
    setState((prev) => {
      const s = prev.songs.find((x) => x.id === songId);
      if (!s || s.idea !== true) return prev;
      const bandId = (s.pendingBandId ?? '').trim();
      if (bandId === '') return prev;
      const key = songKey(s.title, s.artist);
      return {
        ...prev,
        songs: prev.songs.filter((x) => x.id !== songId),
        bandRemovals:
          key === ''
            ? prev.bandRemovals
            : [
                ...(prev.bandRemovals ?? []).filter(
                  (r) => !(r.bandId === bandId && bandKeysMatch(r.key, key)),
                ),
              ]
                .slice(-499)
                .concat({ bandId, key, at: new Date().toISOString() }),
        deleted: bury(prev.deleted, songId),
      };
    });
  }, []);

  /**
   * LE TRI DU DÉPASSEMENT (b422) : ramène la bibliothèque au plafond du
   * plan gratuit, à l'échéance des 30 jours. La DÉCISION vit dans
   * `lib/depassement.ts` (planDeTri, pur et annonçable) ; ici on ne fait
   * que l'appliquer : les morceaux de répertoire de groupe RETOURNENT en
   * proposition (remisEnIdee — rien n'est perdu pour le groupe), les
   * personnels sont supprimés avec une tombe par ID seul (un réimport
   * futur reste possible — pas de clé), les programmés d'une setlist de
   * groupe sont intouchables (b239) et restent, même au-delà du plafond.
   */
  const appliquerPlafond = useCallback((max: number) => {
    setState((prev) => {
      const tri = planDeTri(prev.songs, prev.setlists, prev.bands, max);
      if (tri.enProposition.length === 0 && tri.aSupprimer.length === 0)
        return prev;
      const enProp = new Map(tri.enProposition.map((e) => [e.song.id, e]));
      const mortes = new Set(tri.aSupprimer.map((s) => s.id));
      let deleted = prev.deleted;
      for (const s of tri.aSupprimer) deleted = bury(deleted, s.id);
      return {
        ...prev,
        songs: prev.songs
          .filter((s) => !mortes.has(s.id))
          .map((s) => {
            const e = enProp.get(s.id);
            return e ? remisEnIdee(s, e.bandId) : s;
          }),
        // Un morceau supprimé quitte aussi mes setlists (solo — celles de
        // groupe sont protégées par la porte 'refus' en amont).
        setlists: prev.setlists.map((sl) => ({
          ...sl,
          items: sl.items.filter((it) => !mortes.has(it.songId)),
        })),
        deleted,
      };
    });
  }, []);

  const saveSetlist = useCallback((setlist: Setlist) => {
    // Chaque item porte la CLÉ DE CONTENU de son morceau (b473) : si l'id
    // local meurt un jour (dédoublonnage, réimport), `reparerSetlists`
    // retrouve le morceau par cette clé au lieu d'afficher
    // « (morceau supprimé) ». Tamponnée ici, au point d'écriture unique.
    const chansons = new Map(stateRef.current.songs.map((s) => [s.id, s]));
    const stamped = {
      ...setlist,
      items: setlist.items.map((it) => {
        const s = chansons.get(it.songId);
        const cle = s ? songKey(s.title, s.artist) : it.cle ?? '';
        return cle !== '' && cle !== it.cle ? { ...it, cle } : it;
      }),
      updatedAt: new Date().toISOString(),
    };
    // RÈGLE (décision Vincent, b174) : mettre un morceau dans une setlist
    // ENTÉRINE son inscription en bibliothèque. Une idée qu'on va jouer
    // n'est plus une idée ; une proposition qu'on programme n'a plus à être
    // acceptée. C'est fait ICI, dans le store, pour que TOUS les chemins
    // d'ajout (feuille « Ajouter à… », sélecteur plein écran, éditeur de
    // setlist, génération IA) l'appliquent sans avoir à y penser.
    const dansLaSetlist = new Set(stamped.items.map((it) => it.songId));
    setState((prev) => ({
      ...prev,
      songs: prev.songs.map((s) =>
        dansLaSetlist.has(s.id) &&
        (s.idea === true || (s.pendingBandId ?? '') !== '')
          ? {
              ...s,
              idea: false,
              pendingBandId: undefined,
              updatedAt: new Date().toISOString(),
            }
          : s,
      ),
      setlists: prev.setlists.some((s) => s.id === stamped.id)
        ? prev.setlists.map((s) => (s.id === stamped.id ? stamped : s))
        : [...prev.setlists, stamped],
    }));
  }, []);

  const deleteSetlist = useCallback((setlistId: string) => {
    setState((prev) => ({
      ...prev,
      setlists: prev.setlists.filter((s) => s.id !== setlistId),
      concerts: prev.concerts.map((c) =>
        c.setlistId === setlistId ? { ...c, setlistId: '' } : c,
      ),
      deleted: bury(prev.deleted, setlistId),
    }));
  }, []);

  const saveConcert = useCallback((concert: Concert) => {
    const stamped = { ...concert, updatedAt: new Date().toISOString() };
    setState((prev) => ({
      ...prev,
      concerts: prev.concerts.some((c) => c.id === stamped.id)
        ? prev.concerts.map((c) => (c.id === stamped.id ? stamped : c))
        : [...prev.concerts, stamped],
    }));
  }, []);

  const deleteConcert = useCallback((concertId: string) => {
    setState((prev) => ({
      ...prev,
      concerts: prev.concerts.filter((c) => c.id !== concertId),
      deleted: bury(prev.deleted, concertId),
    }));
  }, []);

  const saveArtist = useCallback((artist: ArtistProfile) => {
    setState((prev) => ({
      ...prev,
      artist: { ...artist, updatedAt: new Date().toISOString() },
      // MA PHOTO SUIT DANS MES GROUPES (b247). La ligne de musicien garde une
      // COPIE de la photo, recopiée à la création du groupe : elle ne bougeait
      // plus jamais, donc les autres membres voyaient une pastille grise même
      // après que j'aie mis une photo. On la recale ici — enregistrer son
      // profil est un ACTE, pas une consultation (b243/b245) — et seulement
      // la photo : le nom, lui, sert à me reconnaître, on n'y touche pas.
      bands: majMaPhotoDansGroupes(
        prev.bands ?? [],
        artist,
        prev.prefs?.userName ?? '',
        monId(),
      ),
    }));
  }, []);

  const savePrefs = useCallback((prefs: Prefs) => {
    setState((prev) => ({ ...prev, prefs }));
  }, []);

  const saveBand = useCallback((band: Band) => {
    setState((prev) => {
      const existe = prev.bands.some((b) => b.id === band.id);
      // Une CRÉATION est toujours datée (b374) : sans date, un groupe créé
      // après une réinitialisation était écarté à jamais par le filtre
      // `afterReset` sur tous les autres appareils (constat de Marco). Les
      // modifications d'un groupe EXISTANT, elles, ne se datent que sur un
      // geste délibéré (`tamponneBand`, b373) — jamais sur une réparation.
      const neuf =
        !existe && !band.updatedAt
          ? { ...band, updatedAt: new Date().toISOString() }
          : band;
      return {
        ...prev,
        bands: existe
          ? prev.bands.map((b) => (b.id === band.id ? band : b))
          : [...prev.bands, neuf],
      };
    });
  }, []);

  /**
   * Quitter (ou dissoudre) un groupe. Mes morceaux restent — c'est la règle :
   * chacun garde sa copie personnelle. Mais les VERSIONS rattachées à ce
   * groupe s'en vont avec lui (b185) : sans ça, elles survivaient avec l'id
   * d'un groupe qui n'existe plus, invisibles et inertes. En cas de retour
   * dans le même groupe, l'adhésion crée un NOUVEL identifiant local : le
   * morceau se retrouvait alors avec deux versions pour un seul et même
   * groupe, dont une fantôme.
   *
   * Les setlists, elles, sont seulement DÉTACHÉES : elles portent un travail
   * d'organisation qui n'appartient pas au groupe seul (et si l'on y revient,
   * la synchro les rattache — voir applyBandData).
   */
  const deleteBand = useCallback((bandId: string) => {
    setState((prev) => {
      /**
       * UNE PROPOSITION JAMAIS ACCEPTÉE MEURT AVEC LE GROUPE (b419, règle
       * de Vincent — complète b418) : en sortant du groupe, un morceau
       * qu'on n'a jamais accepté n'a aucune raison de rester — le garder
       * l'aurait « libéré » en bibliothèque (migration b274), comme si on
       * l'avait voulu. Une copie ACCEPTÉE, elle, reste : ses versions de
       * groupe redeviennent personnelles juste en dessous (b185).
       * Pierre tombale par ID seul — la suppression se propage entre mes
       * appareils, sans jamais bloquer un futur import du même titre.
       */
      const propositionsMortes = prev.songs.filter(
        (s) => s.idea === true && (s.pendingBandId ?? '') === bandId,
      );
      let deleted = bury(prev.deleted, bandId);
      for (const s of propositionsMortes) deleted = bury(deleted, s.id);
      const mortes = new Set(propositionsMortes.map((s) => s.id));
      return {
        ...prev,
        bands: prev.bands.filter((b) => b.id !== bandId),
        songs: prev.songs
          .filter((s) => !mortes.has(s.id))
          .map((s) => {
            const parties = s.versions.filter(
              (v) => (v.bandId ?? '') === bandId,
            );
            if (parties.length === 0) return s;
            const next = parties.reduce((acc, v) => removeVersion(acc, v.id), s);
            // Le morceau ne venait QUE de ce groupe : `removeVersion` refuse de
            // laisser un morceau sans version, et c'est heureux. On garde donc la
            // partition, en la rendant personnelle — un morceau ne doit jamais
            // rester rattaché à un groupe qui n'existe plus.
            return {
              ...next,
              versions: next.versions.map((v) =>
                (v.bandId ?? '') === bandId ? { ...v, bandId: '' } : v,
              ),
            };
          }),
        setlists: prev.setlists.map((sl) =>
          sl.bandId === bandId ? { ...sl, bandId: '' } : sl,
        ),
        deleted,
      };
    });
  }, []);

  const hydrate = useCallback((next: AppState) => {
    setState(next);
  }, []);

  /**
   * Note VIVANTE (b154) : la fusion IA remplace l'ancienne note par la
   * version à jour — en un seul geste atomique : retrait de l'ancienne,
   * pierre tombale « #note » (pour qu'elle disparaisse aussi chez les
   * autres membres — la synchro n'échange les notes que par ajout d'id),
   * et ajout de la nouvelle.
   */
  const replaceNote = (songId: string, oldNoteId: string, note: SongNote) => {
    setState((prev) => ({
      ...prev,
      songs: prev.songs.map((sg) =>
        sg.id === songId
          ? {
              ...sg,
              rehearsalNotes: [
                ...sg.rehearsalNotes.filter((n) => n.id !== oldNoteId),
                note,
              ],
              updatedAt: new Date().toISOString(),
            }
          : sg,
      ),
      deleted: bury(prev.deleted, oldNoteId, '#note'),
    }));
  };
  const deleteNote = (songId: string, noteId: string) => {
    setState((prev) => ({
      ...prev,
      songs: prev.songs.map((sg) =>
        sg.id === songId
          ? {
              ...sg,
              rehearsalNotes: sg.rehearsalNotes.filter((n) => n.id !== noteId),
              updatedAt: new Date().toISOString(),
            }
          : sg,
      ),
      // Pierre tombale « #note » : la suppression vaut sur tous les
      // appareils ET dans le répertoire partagé du groupe.
      deleted: bury(prev.deleted, noteId, '#note'),
    }));
  };
  const recordBandRemoval = (bandId: string, key: string) => {
    if (bandId === '' || key === '') return;
    setState((prev) => ({
      ...prev,
      bandRemovals: [
        ...(prev.bandRemovals ?? []).filter(
          (r) => !(r.bandId === bandId && bandKeysMatch(r.key, key)),
        ),
      ].slice(-499).concat({ bandId, key, at: new Date().toISOString() }),
    }));
  };
  const clearBandRemoval = (bandId: string, key: string) => {
    setState((prev) => ({
      ...prev,
      // Correspondance souple : une annulation par « titre @ artiste »
      // efface aussi un vieux retrait « titre seul » (et inversement).
      bandRemovals: (prev.bandRemovals ?? []).filter(
        (r) => !(r.bandId === bandId && bandKeysMatch(r.key, key)),
      ),
    }));
  };

  /**
   * Réinitialisation partielle (écran Réglages). Chaque élément effacé
   * reçoit une pierre tombale PAR ID (sans clé de titre) : la suppression
   * se propage aux autres appareils via la synchro cloud SANS bloquer un
   * futur ré-import (seules les tombes avec clé bloquent l'import en
   * masse). Quitter les groupes est local : le groupe continue d'exister
   * pour les autres membres.
   */
  const resetData = (parts: ResetParts) => {
    setState((prev) => {
      const at = new Date().toISOString();
      let deleted = [...prev.deleted];
      const buryAll = (items: { id: string }[]) => {
        deleted = [...deleted, ...items.map((x) => ({ id: x.id, at }))].slice(
          -500,
        );
      };
      if (parts.songs) buryAll(prev.songs);
      if (parts.setlists) buryAll(prev.setlists);
      if (parts.concerts) buryAll(prev.concerts);
      if (parts.bands) buryAll(prev.bands);
      /**
       * UNE PROPOSITION JAMAIS ACCEPTÉE MEURT AVEC LE GROUPE (b419, règle de
       * Vincent) : réinitialiser « Groupes », c'est quitter tous ses groupes
       * — les morceaux qu'ils proposaient et qu'on n'a jamais acceptés n'ont
       * aucune raison de rester. Même règle que `deleteBand`, tombe par ID
       * seul (jamais de clé : elle bloquerait un futur import du titre).
       */
      const propositionsMortes = parts.bands && !parts.songs
        ? prev.songs.filter(
            (s) => s.idea === true && (s.pendingBandId ?? '') !== '',
          )
        : [];
      buryAll(propositionsMortes);
      const mortes = new Set(propositionsMortes.map((s) => s.id));
      // Point zéro par catégorie : garde-fou qui ne dépend PAS du volume
      // (au-delà de 500 tombes, le cloud ressuscitait les morceaux).
      const resetAt: ResetMarks = { ...(prev.resetAt ?? {}) };
      if (parts.songs) resetAt.songs = at;
      if (parts.setlists) resetAt.setlists = at;
      if (parts.concerts) resetAt.concerts = at;
      // L'onglet s'appelle « Live » : réinitialiser les concerts doit aussi
      // vider l'historique des directs (remarque de Marco). Les lives sont
      // côté serveur et souvent collectifs — on ne les efface pas, on arrête
      // de montrer ceux d'avant.
      if (parts.concerts) resetAt.lives = at;
      if (parts.bands) resetAt.bands = at;
      return {
        ...prev,
        songs: parts.songs ? [] : prev.songs.filter((s) => !mortes.has(s.id)),
        // Sans leurs morceaux, les setlists gardent leurs réglages mais
        // perdent les items orphelins au prochain rendu — cohérent.
        setlists: parts.setlists ? [] : prev.setlists,
        concerts: parts.concerts ? [] : prev.concerts,
        bands: parts.bands ? [] : prev.bands,
        bandRemovals: parts.bands ? [] : prev.bandRemovals,
        artist: parts.artist
          ? { ...emptyArtist(), updatedAt: at }
          : prev.artist,
        deleted,
        resetAt,
      };
    });
  };

  /**
   * Retrait d'une setlist du répertoire d'un groupe (b146). Le retrait
   * voyage dans `bandRemovals` — le même canal que les morceaux retirés —
   * sous une clé préfixée « #setlist: » ; les membres l'appliquent à la
   * synchro suivante. Chez l'auteur, la setlist est CONSERVÉE, détachée
   * du groupe (bandId vide) : son travail n'est jamais perdu.
   */
  const removeSetlistFromBand = (setlistId: string) => {
    setState((prev) => {
      const sl = prev.setlists.find((x) => x.id === setlistId);
      const bandId = sl?.bandId ?? '';
      if (!sl || bandId === '') return prev;
      return {
        ...prev,
        setlists: prev.setlists.map((x) =>
          x.id === setlistId
            ? { ...x, bandId: '', updatedAt: new Date().toISOString() }
            : x,
        ),
        // `?? []` : un état hydraté depuis le cloud peut ne pas porter la
        // liste (anciens bundles) — sans cette garde, le retrait faisait
        // planter le rendu (bug trouvé en test, b146).
        bandRemovals: [
          ...(prev.bandRemovals ?? []).filter(
            (r) => !(r.bandId === bandId && r.key === `#setlist:${setlistId}`),
          ),
        ]
          .slice(-499)
          .concat({
            bandId,
            key: `#setlist:${setlistId}`,
            at: new Date().toISOString(),
          }),
      };
    });
  };

  // Un brouillon se purge SANS pierre tombale (b319) : jamais synchronisé,
  // donc rien à propager — et jamais un morceau validé, quoi qu'il arrive.
  const purgeBrouillon = (songId: string) => {
    setState((prev) => ({
      ...prev,
      songs: prev.songs.filter((s) => !(s.id === songId && estBrouillon(s))),
    }));
  };

  const value: StoreValue = {
    ...state,
    hydrate,
    saveSong,
    deleteSong,
    acceptSong,
    retirerProposition,
    appliquerPlafond,
    saveSetlist,
    deleteSetlist,
    saveConcert,
    deleteConcert,
    saveArtist,
    savePrefs,
    saveBand,
    deleteBand,
    deleteNote,
    replaceNote,
    recordBandRemoval,
    clearBandRemoval,
    resetData,
    removeSetlistFromBand,
    purgeBrouillon,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé dans <StoreProvider>');
  return ctx;
}

/** Variante tolérante : null hors <StoreProvider> (entrée publique légère).
 *  Permet aux composants partagés app/spectateur (page Live) d'activer des
 *  fonctions « app seulement » comme « Garder ce morceau ». */
export function useStoreMaybe(): StoreValue | null {
  return useContext(StoreContext);
}
