import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAccount } from '../components/Account';
import { Icon } from '../components/Icon';
import { garderLaMiseEnForme, revenirAvantIA } from '../lib/aiFormat';
import { SongBody } from '../components/SongBody';
import { AssignSheet, SongCollector } from '../components/SongPicker';
import { SongDeleteSheet } from '../components/SongDeleteSheet';
import { ConfirmSheet, MenuSheet, useToast } from '../components/Feedback';
import { Onboarding } from '../components/Onboarding';
import { BackupNudge } from '../components/BackupNudge';
import { signalerLimite } from '../components/UpgradeSheet';
import { useLimits } from '../components/useLimits';
import { useDepassement } from '../components/useDepassement';
import { presDeLaLimite, propositionBloquee } from '../lib/limites';
import { EXAMPLE_TAG } from '../seed';
import { Empty, HeaderPlus, TopBar } from '../components/ui';
import { t } from '../i18n';
import { replier } from '../lib/recherche';

/** Ajout / retrait d'un morceau dans les setlists, sans quitter la liste. */
function SetlistPicker({
  songId,
  onClose,
}: {
  songId: string;
  onClose: () => void;
}) {
  const { songs, setlists, saveSetlist, bands } = useStore();
  const [newName, setNewName] = useState('');
  const song = songs.find((s) => s.id === songId);
  if (!song) return null;

  function toggle(sl: Setlist) {
    if (!song) return;
    const has = sl.items.some((it) => it.songId === song.id);
    saveSetlist(
      has
        ? { ...sl, items: sl.items.filter((it) => it.songId !== song.id) }
        : {
            ...sl,
            items: [
              ...sl.items,
              {
                id: makeId(),
                songId: song.id,
                note: '',
                keyOverride: '',
                versionId: versionForBand(song, sl.bandId ?? '')?.id ?? '',
              },
            ],
          },
    );
  }

  const sorted = [...setlists].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return (
    <Modal
      title={t('« {title} » dans…', { title: song.title || t('Sans titre') })}
      onClose={onClose}
    >
      {sorted.length === 0 && (
        <p className="help">
          {t('Pas encore de setlist — crée la première juste en dessous.')}
        </p>
      )}
      {sorted.map((sl) => {
        const has = sl.items.some((it) => it.songId === song.id);
        const bandName =
          (sl.bandId ?? '') !== ''
            ? (bands.find((b) => b.id === sl.bandId)?.name ?? '')
            : t('Solo');
        return (
          <div className="row" key={sl.id} onClick={() => toggle(sl)}>
            <div className="grow">
              <div className="title">{sl.name || t('(sans nom)')}</div>
              <div className="sub">
                {[
                  bandName,
                  sl.items.length > 1
                    ? t('{n} morceaux', { n: sl.items.length })
                    : t('{n} morceau', { n: sl.items.length }),
                ]
                  .filter((x) => x !== '')
                  .join(' · ')}
              </div>
            </div>
            {has ? (
              <span
                style={{ color: 'var(--accent)', fontWeight: 700 }}
                title={t('Cliquer pour retirer')}
              >
                {t('✓ Dedans')}
              </span>
            ) : (
              <span className="chevron">
                <Icon name="plus" size={16} />
              </span>
            )}
          </div>
        );
      })}
      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={newName}
          placeholder={t('Nouvelle setlist (nom)…')}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          className="btn"
          style={{ flexShrink: 0 }}
          disabled={newName.trim() === ''}
          onClick={() => {
            if (!song) return;
            const sl: Setlist = {
              ...emptySetlist(),
              name: newName.trim(),
              items: [
                {
                  id: makeId(),
                  songId: song.id,
                  note: '',
                  keyOverride: '',
                  versionId: '',
                },
              ],
            };
            saveSetlist(sl);
            setNewName('');
          }}
        >
          {t('Créer')}
        </button>
      </div>
      <div className="spacer" />
      <button className="btn ghost block" onClick={onClose}>
        {t('Fermer')}
      </button>
    </Modal>
  );
}
import { announceBandSong, quiPropose } from '../lib/bands';
import { LiveBanner } from '../components/LiveBanner';
import { SwipeRow } from '../components/SwipeRow';
import { spellingForKey, transposeKeyName } from '../lib/chords';
import { songKey } from '../lib/importer';
import {
  contextVersionId,
  duplicateVersion,
  removeVersion,
  switchVersion,
  tagsAffichables,
  versionForBand,
} from '../lib/model';
import {
  auRepertoire,
  retireDuRepertoire,
  texteRetrait,
} from '../lib/retraitgroupe';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptySetlist,
  estBrouillon,
  formatDuration,
  makeId,
  Setlist,
  Song,
} from '../types';
import { Modal } from '../components/ui';

/**
 * Vue maître-détail : uniquement sur ordinateur (grand écran + souris).
 * Téléphone et tablette ouvrent toujours la partition en pleine page.
 */
const SPLIT_QUERY =
  '(min-width: 1100px) and (hover: hover) and (pointer: fine)';
function isSplitScreen(): boolean {
  return window.matchMedia(SPLIT_QUERY).matches;
}


type SortMode = 'title' | 'artist' | 'recent';

/**
 * MÉMOIRE DES FILTRES (b402, demande de Vincent : « quand je filtre puis
 * ouvre une chanson, le bouton revenir doit me ramener avec le même
 * filtre — là il disparaît »). Le ← d'une partition remonte vers l'onglet
 * Morceaux (navigation vers un parent explicite), ce qui REMONTE le
 * composant : tout état local part avec lui. Même principe que la mémoire
 * de défilement juste en dessous — qui, sans les filtres, retombait de
 * toute façon au mauvais endroit : la liste n'était plus la même.
 * `sessionStorage` : propre à l'appareil et à la session, jamais
 * synchronisé — un filtre est un réglage d'écran, pas une donnée.
 */
const FILTRES_KEY = 'sing2me/libFiltres';
interface FiltresMemo {
  query: string;
  tag: string | null;
  bandFilter: string | null;
  showIdeas: boolean;
  showCheck: boolean;
}
function litFiltres(): Partial<FiltresMemo> {
  try {
    const raw = sessionStorage.getItem(FILTRES_KEY);
    const v = raw !== null ? (JSON.parse(raw) as Partial<FiltresMemo>) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Couleurs des pastilles de groupe (tokens --band-*, stables par ordre). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

export function Library() {
  const {
    songs,
    acceptSong,
    bands,
    setlists,
    saveSong,
    deleteSetlist,
    clearBandRemoval,
    recordBandRemoval,
    prefs,
    savePrefs,
    artist,
    purgeBrouillon,
  } = useStore();
  const toast = useToast();
  // Création en cours (b319) : au plus UN brouillon vit à la fois.
  const brouillonEnCours = useMemo(
    () => songs.find((s) => estBrouillon(s)) ?? null,
    [songs],
  );
  // Filtres restaurés au montage (b402) — un répertoire de groupe qui
  // n'existe plus n'est pas restauré : il filtrerait sur du vide.
  const [depart] = useState(litFiltres);
  const [query, setQuery] = useState(depart.query ?? '');
  const [tag, setTag] = useState<string | null>(depart.tag ?? null);
  // null = tous les morceaux · sinon id du répertoire de groupe
  const [bandFilter, setBandFilter] = useState<string | null>(() => {
    const b = depart.bandFilter ?? null;
    return b !== null && bands.some((x) => x.id === b) ? b : null;
  });
  // Panneau « Filtrer » : tri + vues + répertoires + tags — replié par
  // défaut (règle : recherche + liste, rien d'autre).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const account = useAccount();
  // Limites du plan (b381) : le ＋ annonce la limite au lieu d'échouer plus
  // tard à la synchro, et le compteur dit où on en est (calculé au rendu).
  const limites = useLimits();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  /**
   * LA LISTE NE BOUGE PAS QUAND LE VOLET S'OUVRE (b434, constat de Vincent :
   * « lorsque j'ouvre une partition, la liste remonte »). Ouvrir ou fermer
   * l'aperçu re-dispose la liste (plusieurs colonnes ↔ une colonne de
   * 400 px) : chaque carte change de position verticale, mais la fenêtre
   * garde son défilement en PIXELS — on se retrouvait donc plus haut dans la
   * liste, la ligne qu'on venait de toucher hors de vue. On note la position
   * à l'écran de la ligne concernée AVANT le changement, et on recale le
   * défilement juste après le rendu pour qu'elle n'ait pas bougé.
   */
  const ancreReflow = useRef<{ id: string; top: number } | null>(null);
  function ancrerLigne(id: string | null) {
    if (id === null) return;
    const el = document.querySelector(`[data-rowid="${CSS.escape(id)}"]`);
    if (el) ancreReflow.current = { id, top: el.getBoundingClientRect().top };
  }
  useLayoutEffect(() => {
    const a = ancreReflow.current;
    ancreReflow.current = null;
    if (!a) return;
    const el = document.querySelector(`[data-rowid="${CSS.escape(a.id)}"]`);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - a.top;
    if (delta !== 0) window.scrollBy(0, delta);
  }, [selectedId]);
  /**
   * Le groupe DONT on regarde le répertoire — `null` partout ailleurs. C'est
   * lui qui décide si « Retirer du répertoire » a un sens : hors de cette
   * vue, la question « de quel groupe ? » n'a pas de réponse (b278).
   */
  // Menu « ⋯ » d'un morceau (Jouer / Modifier / Ajouter à… / Supprimer),
  // menu « ⋯ » de l'en-tête, et sous-feuilles ouvertes depuis ces menus.
  const [rowMenu, setRowMenu] = useState<Song | null>(null);
  const [rowAssign, setRowAssign] = useState<string | null>(null);
  const [rowDelete, setRowDelete] = useState<Song | null>(null);
  // Collecteur « Ajouter des morceaux » quand la bibliothèque est filtrée
  // sur un groupe (vue répertoire — porte du groupe, règle 1).
  const [bandCollect, setBandCollect] = useState(false);
  // Filtre demandé par une autre page (porte « Répertoire du groupe »).
  useEffect(() => {
    let pending: string | null = null;
    try {
      pending = localStorage.getItem('sing2me/libBandFilter');
      if (pending) localStorage.removeItem('sing2me/libBandFilter');
    } catch {
      pending = null;
    }
    if (pending) setBandFilter(pending);
    // au montage uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Barre d'outils figée : on mesure l'en-tête + la barre pour la caler
  // juste sous l'en-tête, et positionner le volet d'aperçu en dessous.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = toolbarRef.current;
    const apply = () => {
      const tb = document.querySelector('.topbar');
      const topH = tb ? Math.round(tb.getBoundingClientRect().height) : 60;
      const barH = el ? Math.round(el.getBoundingClientRect().height) : 0;
      const root = document.documentElement.style;
      root.setProperty('--topbar-h', `${topH}px`);
      root.setProperty('--lib-sticky-top', `${topH + barH}px`);
    };
    apply();
    // ResizeObserver absent sur d'anciens Safari (vieux iPad) : on se rabat
    // sur l'écoute du redimensionnement, sans jamais planter.
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    if (ro && el) ro.observe(el);
    const tb = document.querySelector('.topbar');
    if (ro && tb) ro.observe(tb);
    window.addEventListener('resize', apply);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, []);
  // Réserve d'« idées » : morceaux importés non encore validés
  // « À vérifier » : morceaux dont l'import a douté (filet de sécurité du
  // chantier « Reprise de répertoire »). Ils sont bien en bibliothèque —
  // un mauvais import signalé vaut mieux qu'un import manquant — mais on
  // les retrouve d'un geste, avec la raison du doute sur chaque ligne.
  const groupeAffiche =
    bandFilter !== null && bandFilter !== ''
      ? (bands.find((b) => b.id === bandFilter) ?? null)
      : null;
  const [showCheck, setShowCheck] = useState(depart.showCheck === true);
  // Les compteurs excluent les BROUILLONS (b319) : une pastille compte
  // exactement ce que l'écran montrera (règle 11), et un brouillon ne se
  // montre nulle part.
  const checkCount = useMemo(
    () =>
      songs.filter((s) => s.needsCheck !== undefined && !estBrouillon(s))
        .length,
    [songs],
  );
  const [showIdeas, setShowIdeas] = useState(depart.showIdeas === true);
  const ideaCount = useMemo(
    // Les propositions ÉCARTÉES (b240) n'y sont pas : la pastille compte
    // EXACTEMENT ce que l'écran montrera (règle 11).
    () =>
      songs.filter(
        (s) => s.idea === true && s.declined !== true && !estBrouillon(s),
      ).length,
    [songs],
  );
  // Propositions de groupe en attente d'acceptation (non importées tant
  // qu'on ne les a pas acceptées d'un clic).
  // La vue « Propositions » a disparu avec sa puce (b203). Les propositions
  // vivent dans les Idées et dans le répertoire du groupe qui les propose ;
  // `pendingCount` sert encore à savoir s'il y a matière à filtrer.
  const pendingCount = useMemo(
    () => songs.filter((s) => (s.pendingBandId ?? '') !== '').length,
    [songs],
  );
  const [nudgeHidden, setNudgeHidden] = useState(
    () => localStorage.getItem('sing2me/accountNudge') === '1',
  );
  /** Ligne « À vérifier » dont la raison est dépliée (b427) — au tap. */
  const [checkDetail, setCheckDetail] = useState<string | null>(null);
  const showNudge =
    account?.available === true && account.email === null && !nudgeHidden;
  // Dépassement du plan gratuit (b422) : horloge du serveur, bandeau, et
  // tri automatique à l'échéance — tout vit dans le hook.
  const {
    etat: depassement,
    bilan: bilanTri,
    fermerBilan,
  } = useDepassement();
  const [depassementVu, setDepassementVu] = useState(() => {
    try {
      return sessionStorage.getItem('sing2me/depassementVu') === '1';
    } catch {
      return false;
    }
  });

  // Mémoire de défilement : en revenant d'une partition, on retrouve la
  // bibliothèque à l'endroit où on l'avait laissée (pas de re-scroll).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sing2me/libScroll');
      const y = raw !== null ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(y) && y > 0) {
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    } catch {
      /* stockage indisponible */
    }
    const save = () => {
      try {
        sessionStorage.setItem('sing2me/libScroll', String(window.scrollY));
      } catch {
        /* stockage indisponible */
      }
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  // Mémoire des filtres (b402) : notée à chaque changement, relue au
  // montage — le ← d'une partition retrouve la même liste.
  useEffect(() => {
    try {
      const memo: FiltresMemo = { query, tag, bandFilter, showIdeas, showCheck };
      sessionStorage.setItem(FILTRES_KEY, JSON.stringify(memo));
    } catch {
      /* stockage indisponible */
    }
  }, [query, tag, bandFilter, showIdeas, showCheck]);
  const [sort, setSort] = useState<SortMode>(() => {
    const saved = localStorage.getItem('sing2me/librarySort');
    return saved === 'artist' || saved === 'recent' ? saved : 'title';
  });

  function changeSort(mode: SortMode) {
    setSort(mode);
    localStorage.setItem('sing2me/librarySort', mode);
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    songs.forEach((s) => tagsAffichables(s).forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [songs]);

  const bandIndex = useMemo(
    () => new Map(bands.map((b, i) => [b.id, i])),
    [bands],
  );

  // Affectations : groupes (via versions + setlists du groupe) et setlists.
  const membership = useMemo(() => {
    const bandsBySong = new Map<string, Set<string>>();
    const setlistsBySong = new Map<string, string[]>();
    songs.forEach((s) => {
      const set = new Set<string>();
      s.versions.forEach((v) => {
        if (v.bandId !== '' && bandIndex.has(v.bandId)) set.add(v.bandId);
      });
      // Une proposition appartient à la vue du groupe qui l'a faite, même si
      // elle est arrivée sans version de contexte (b205). Sans cette ligne,
      // les deux filtres se contredisaient : la vue disait « montre-la », le
      // filtre par répertoire l'écartait.
      const de = (s.pendingBandId ?? '').trim();
      if (de !== '' && bandIndex.has(de)) set.add(de);
      bandsBySong.set(s.id, set);
    });
    setlists.forEach((sl) => {
      const name = sl.name || t('(sans nom)');
      sl.items.forEach((it) => {
        if ((sl.bandId ?? '') !== '' && bandIndex.has(sl.bandId)) {
          bandsBySong.get(it.songId)?.add(sl.bandId);
        }
        const arr = setlistsBySong.get(it.songId) ?? [];
        if (!arr.includes(name)) arr.push(name);
        setlistsBySong.set(it.songId, arr);
      });
    });
    return { bandsBySong, setlistsBySong };
  }, [songs, setlists, bandIndex]);

  const filtered = useMemo(() => {
    // Recherche repliée (b337) : accents, casse et ponctuation ne comptent
    // pas — « la bas » trouve « Là-Bas ».
    const q = replier(query);
    const byTitle = (a: (typeof songs)[number], b: (typeof songs)[number]) =>
      a.title.localeCompare(b.title, 'fr');
    return [...songs]
      .sort((a, b) => {
        if (sort === 'artist') {
          const cmp = a.artist.localeCompare(b.artist, 'fr');
          return cmp !== 0 ? cmp : byTitle(a, b);
        }
        if (sort === 'recent') {
          return b.updatedAt.localeCompare(a.updatedAt);
        }
        return byTitle(a, b);
      })
      .filter((s) => {
        // Un BROUILLON de création (b319) n'apparaît NULLE PART : ni dans le
        // répertoire, ni dans les vues filtrées, ni dans les compteurs.
        if (estBrouillon(s)) return false;
        // Vue « Idées » : la réserve à travailler — y compris les morceaux
        // proposés par un groupe, qui arrivent désormais ici (b174).
        if (showIdeas) return s.idea === true && s.declined !== true;
        if (showCheck) return s.needsCheck !== undefined;
        /*
         * Dans le RÉPERTOIRE D'UN GROUPE, ce que ce groupe vient de proposer
         * s'affiche (b203, constat de Vincent) : « je sais que Marco a
         * proposé un morceau, mais quand je vais dans la bibliothèque du
         * groupe je ne le vois pas ». Il attendait dans les Idées — sa
         * maison, décidée en b174 — mais le répertoire du groupe est
         * l'endroit où on le CHERCHE. La ligne porte « À valider » : rien
         * n'entre dans ma bibliothèque sans mon accord, la règle de b174
         * tient toujours. Ailleurs (« Tous les morceaux »), les idées
         * attendent leur tour comme avant.
         */
        if (bandFilter !== null && bandFilter !== '' && s.idea === true) {
          /*
           * Une proposition appartient à la vue de CHAQUE groupe dont le
           * répertoire la porte (b420) : le même morceau peut être proposé
           * par deux groupes, et `pendingBandId` ne retient que le premier.
           * Sans la version de contexte, le répertoire du deuxième groupe
           * cachait un morceau que sa propre vue « Propositions » montrait.
           */
          return (
            (s.pendingBandId ?? '') === bandFilter ||
            versionForBand(s, bandFilter) !== null
          );
        }
        // Vue par défaut « Tous les morceaux » : ce qu'on joue vraiment. Les
        // idées (et donc les propositions) attendent dans leur vue ; les
        // programmer dans une setlist les fait entrer ici pour de bon.
        return s.idea !== true;
      })
      .filter((s) => (tag ? s.tags.includes(tag) : true))
      .filter((s) => {
        if (bandFilter === null) return true;
        return membership.bandsBySong.get(s.id)?.has(bandFilter) ?? false;
      })
      .filter(
        (s) =>
          q === '' ||
          replier(s.title).includes(q) ||
          replier(s.artist).includes(q) ||
          s.tags.some((t) => replier(t).includes(q)),
      );
  }, [
    songs,
    query,
    tag,
    sort,
    bandFilter,
    membership,
    showIdeas,
    showCheck,
  ]);

  // Regroupement par artiste (tri « artiste » uniquement)
  const artistGroups = useMemo(() => {
    const groups: { name: string; songs: typeof filtered }[] = [];
    for (const s of filtered) {
      const name = s.artist.trim() || t('Sans artiste');
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.songs.push(s);
      else groups.push({ name, songs: [s] });
    }
    return groups;
  }, [filtered]);

  // Ouvrir un morceau applique par défaut la version du contexte courant :
  // dans un filtre groupe → la version du groupe ; sinon (tous) → la version
  // originale. Comme SongView/SongEdit et les notes suivent la version active,
  // commentaires et modifications visent la bonne version.
  function openWithContext(song: Song) {
    const bid = bandFilter ?? '';
    const vid = contextVersionId(song, bid);
    if (vid !== song.activeVersionId) saveSong(switchVersion(song, vid));
  }

  /**
   * Groupes qui ont ce morceau au répertoire, en toutes lettres (b211,
   * arbitrage Vincent) : les pastilles à initiales demandaient un décodage
   * (« LZ », c'est qui ?) et prenaient la place du contenu. Le nom va dans
   * le sous-titre, avec le reste de ce qu'on lit sans réfléchir.
   * Le groupe filtré n'y figure pas : le répéter sur chaque ligne
   * n'apprend rien (même raison qu'en b203).
   */
  const bandsOfSong = (songId: string) =>
    [...(membership.bandsBySong.get(songId) ?? [])]
      .filter((bid) => bid !== bandFilter)
      .map((bid) => {
        const i = bandIndex.get(bid) ?? 0;
        return {
          id: bid,
          name: bands[i]?.name?.trim() || t('Groupe sans nom'),
          // La MÊME couleur que la pastille des filtres (b427/F-2) : le
          // groupe se reconnaît d'un coup d'œil, du filtre à la ligne.
          color: BAND_COLORS[i % BAND_COLORS.length],
        };
      });

  /* GLISSER VERS LA GAUCHE POUR RÉVÉLER LA CORBEILLE (b279, demande de
     Vincent) — le même geste que sur la liste des groupes (b254), donc
     appris une seule fois. La corbeille n'AGIT pas : elle ouvre la feuille
     qui demande l'intention (retirer du répertoire, ou supprimer). */
  const renderRow = (song: (typeof filtered)[number]) => (
    <SwipeRow
      key={song.id}
      rowId={song.id}
      label={song.title || t('ce morceau')}
      onDelete={() => setRowDelete(song)}
      /* La CLASSE va au corps du balayage, pas à un div de plus (b280) :
         emboîter une deuxième `.row` doublait le rembourrage et la bordure,
         et faisait rétrécir la ligne intérieure à la largeur de son
         contenu — la régression signalée par Vincent. */
      className={`row ${selectedId === song.id ? 'selected' : ''} ${
        (song.pendingBandId ?? '') !== '' ? 'proposal' : ''
      }`}
      onClick={() => {
        // Au plafond, une proposition se VOIT mais ne s'OUVRE pas (b426) :
        // même message que l'acceptation de la 31ᵉ chanson.
        if (propositionBloquee(song, limites.peutAjouter)) {
          signalerLimite('LIMIT_SONGS');
          return;
        }
        openWithContext(song);
        if (isSplitScreen()) {
          // La ligne cliquée reste au même endroit de l'écran (b434).
          ancrerLigne(song.id);
          setSelectedId(song.id);
        } else navigate(`/song/${song.id}`);
      }}
    >
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{song.title || t('(sans titre)')}</div>
                      {(song.pendingBandId ?? '') !== '' ? (
                        /* Une seule ligne, comme le sous-titre ordinaire
                           (b427) : la provenance qui s'étalait sur trois
                           lignes faisait des cartes de hauteurs inégales. */
                        <div
                          className="sub"
                          style={{
                            color: 'var(--accent)',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {/* Dans une vue de groupe, répéter un nom de groupe
                              n'apprend rien — et nommer un AUTRE groupe est
                              pire (b420, constat de Vincent : sous le filtre
                              « Marcus et Vince », une proposition disait
                              « Proposé par Zakoustiks » parce que le morceau
                              vit dans les deux répertoires). Ce qu'il faut
                              lire ici, c'est qu'il reste un geste à faire
                              (b203). Ailleurs : la PERSONNE qui a proposé
                              quand on la connaît (b420), sinon le répertoire
                              d'où le morceau vient. */}
                          {bandFilter !== null && bandFilter !== ''
                            ? t('📥 À valider')
                            : ((nom) =>
                                nom
                                  ? `${t('📥 Proposé par')} ${nom}`
                                  : t('📥 Du répertoire de {groupe}', {
                                      groupe:
                                        bands.find(
                                          (b) => b.id === song.pendingBandId,
                                        )?.name || t('ton groupe'),
                                    }))(
                                versionForBand(
                                  song,
                                  song.pendingBandId ?? '',
                                )?.par?.nom ?? '',
                              )}
                          {song.artist !== '' ? ` · ${song.artist}` : ''}
                        </div>
                      ) : song.needsCheck ? (
                        /* L'import a douté : BADGE compact, la raison au tap
                           (b427 — la phrase complète inline gonflait la ligne
                           sur 3 hauteurs). Modifier le morceau efface tout. */
                        <div className="sub" style={{ color: 'var(--warn)' }}>
                          <button
                            className="checkbadge"
                            aria-expanded={checkDetail === song.id}
                            title={t('Voir pourquoi ce morceau est à relire')}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCheckDetail(
                                checkDetail === song.id ? null : song.id,
                              );
                            }}
                          >
                            ⚠ {t('À vérifier')}
                          </button>
                          {song.artist !== '' ? ` · ${song.artist}` : ''}
                          {checkDetail === song.id && (
                            <div
                              className="help"
                              style={{ margin: '4px 0 0', color: 'var(--warn)' }}
                            >
                              {song.needsCheck.reason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="sub"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {(() => {
                            // Le nom du groupe, en clair (b211) — AVANT la
                            // technique — et avec SA couleur (b427/F-2), la
                            // même que dans les filtres.
                            const noeuds: React.ReactNode[] = [
                              ...[
                                (song.tags ?? []).includes(EXAMPLE_TAG)
                                  ? t('Exemple')
                                  : '',
                                song.artist,
                              ].filter((x) => x !== ''),
                              ...bandsOfSong(song.id).map((b) => (
                                <span
                                  key={b.id}
                                  style={{ whiteSpace: 'nowrap' }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      display: 'inline-block',
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      background: b.color,
                                      marginRight: 3,
                                    }}
                                  />
                                  {b.name}
                                </span>
                              )),
                              ...[
                                song.key,
                                song.tempo > 0 ? `${song.tempo} BPM` : '',
                                formatDuration(song.durationSec),
                              ].filter((x) => x !== ''),
                            ];
                            if (noeuds.length === 0) return ' ';
                            return noeuds.map((n, i) => (
                              <React.Fragment key={i}>
                                {i > 0 ? ' · ' : ''}
                                {n}
                              </React.Fragment>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                    {/* Plus d'icône presse-papier par ligne (bruit) : la
                        présence en setlist se voit dans « Ajouter à… ». */}
                    {song.hearts > 0 && (
                      <span className="rowhearts" title={t('Cœurs reçus en concert')}>
                        <Icon name="heart" size={12} /> {song.hearts}
                      </span>
                    )}
                    {song.fanMessages.length > 0 && (
                      <span
                        className="rowhearts"
                        style={{ color: 'var(--accent)' }}
                        title={t('Messages du public')}
                      >
                        <Icon name="message" size={12} /> {song.fanMessages.length}
                      </span>
                    )}
                    {/* Un seul geste sur une proposition : ACCEPTER (b418,
                        arbitrage Vincent — plus d'écartée). Elle attend, ou
                        disparaît si le groupe la retire avant. */}
                    {(song.pendingBandId ?? '') !== '' && (
                        <button
                          className="btn small"
                          title={t('Accepter « {title} » dans ta bibliothèque', {
                            title: song.title || t('ce morceau'),
                          })}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Accepter fait ENTRER le morceau dans le compte
                            // du plan (b386) : au plafond, le bouton reste
                            // actif et la feuille propose l'illimité (b390).
                            if (!limites.peutAjouter) {
                              signalerLimite('LIMIT_SONGS');
                              return;
                            }
                            // Accepter = entrer en bibliothèque ET dans le
                            // répertoire du groupe (b205). La règle vit dans
                            // le store, comme celle des setlists.
                            acceptSong(song.id);
                          }}
                        >
                          {t('✓ Accepter')}
                        </button>
                      )}
                    {/* ▶ Scène directement sur la ligne (demande de Marco,
                        sa priorité) : jouer un morceau était à deux gestes —
                        ouvrir le « ⋯ », puis choisir. C'est l'action la plus
                        fréquente de l'écran, elle mérite d'être la plus
                        courte. */}
                    <button
                      className="btn icon"
                      title={t('Jouer en mode scène')}
                      aria-label={t('Jouer « {title} » en mode scène', {
                        title: song.title || t('ce morceau'),
                      })}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (propositionBloquee(song, limites.peutAjouter)) {
                          signalerLimite('LIMIT_SONGS');
                          return;
                        }
                        navigate(`/stage/song/${song.id}`);
                      }}
                    >
                      <Icon name="play" size={18} />
                    </button>
                    <button
                      className="btn icon"
                      title={t('Actions')}
                      aria-label={t('Actions pour « {title} »', {
                        title: song.title || t('ce morceau'),
                      })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRowMenu(song);
                      }}
                    >
                      <Icon name="more" size={20} />
                    </button>
    </SwipeRow>
  );

  // Badge du bouton « Filtrer » : nombre de filtres actifs (une vue
  // particulière, un répertoire, un tag — le tri n'est pas un filtre).
  // Le chiffre du bouton « Filtrer » ne compte que ce qui vit DEDANS : les
  // Idées ont leur propre bouton, à l'écran (b225) — les compter ici ferait
  // parler la pastille d'un réglage que le pli ne montre pas.
  const activeFilters =
    (showCheck ? 1 : 0) +
    (bandFilter !== null ? 1 : 0) +
    (tag !== null ? 1 : 0);

  return (
    <>
      <TopBar
        title={t('Morceaux')}
        right={
          bandFilter !== null && bandFilter !== '' ? (
            <HeaderPlus
              label={t('Ajouter des morceaux')}
              onClick={() => setBandCollect(true)}
            />
          ) : (
            <HeaderPlus
              label={t('Nouveau morceau')}
              onClick={() => {
                // 50 morceaux, c'est tout (b386) : au plafond, le ＋
                // annonce la limite au lieu de laisser importer pour rien.
                if (!limites.peutAjouter) {
                  signalerLimite('LIMIT_SONGS');
                  return;
                }
                navigate('/import');
              }}
            />
          )
        }
      />
      <div className="page">
        {showNudge && (
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
            }}
          >
            <span className="help" style={{ flex: 1, margin: 0 }}>
              {t(
                '☁ Sauvegarde ta bibliothèque et retrouve-la sur tous tes appareils — compte gratuit.',
              )}
            </span>
            <button className="btn small" onClick={() => navigate('/artist')}>
              {t('Créer / me connecter')}
            </button>
            <button
              className="btn ghost small"
              title={t('Ne plus afficher')}
              onClick={() => {
                localStorage.setItem('sing2me/accountNudge', '1');
                setNudgeHidden(true);
              }}
            >
              ✕
            </button>
          </div>
        )}
        {/* DÉPASSEMENT du plan gratuit (b422) : bilan d'un tri appliqué… */}
        {bilanTri && (
          <div
            className="card"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 1 }}>
              🧹 <strong>{t('Bibliothèque ramenée au plan gratuit')}</strong>
              <br />
              <span className="help">
                {t(
                  'Gardés : {g} · rendus aux propositions de leur groupe : {p} · supprimés : {s}.',
                  {
                    g: bilanTri.gardes,
                    p: bilanTri.propositions,
                    s: bilanTri.supprimes,
                  },
                )}
              </span>
            </span>
            <button
              className="btn ghost small"
              title={t('Fermer')}
              onClick={fermerBilan}
            >
              ✕
            </button>
          </div>
        )}
        {/* …et compte à rebours tant que le délai court. La sortie (règle
            11) : ✕ pour la session, et le bandeau se lève SEUL quand le
            motif disparaît (retour sous le plafond, ou plan illimité). */}
        {depassement && !depassementVu && (
          <div
            className="card"
            style={{
              borderColor: 'var(--warn)',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 1 }}>
              ⏳{' '}
              <strong>
                {t('Ta bibliothèque dépasse le plan gratuit ({n}/{max})', {
                  n: depassement.morceaux,
                  max: depassement.max,
                })}
              </strong>
              <br />
              <span className="help">
                {t(
                  'Jusqu’au {date} : repasse en illimité, ou choisis toi-même ce que tu gardes. Ensuite l’app gardera les {max} morceaux les plus utilisés (setlists et concerts d’abord) — les morceaux venus d’un groupe retourneront en proposition, les autres seront supprimés. Tu peux exporter toute ta bibliothèque depuis les Réglages.',
                  {
                    date: depassement.echeanceLe.toLocaleDateString(),
                    max: depassement.max,
                  },
                )}
              </span>
            </span>
            <button
              className="btn ghost small"
              title={t('Masquer jusqu’au prochain lancement')}
              onClick={() => {
                try {
                  sessionStorage.setItem('sing2me/depassementVu', '1');
                } catch {
                  // au pire, le bandeau restera visible
                }
                setDepassementVu(true);
              }}
            >
              ✕
            </button>
          </div>
        )}
        <LiveBanner />
        {/* Barre d'outils figée : recherche + tri + filtres toujours
            accessibles pendant le défilement de la bibliothèque. */}
        <div className="libtoolbar" ref={toolbarRef}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <input
              type="text"
              placeholder={t('Rechercher un morceau, un artiste, un tag…')}
              value={query}
              style={query !== '' ? { paddingRight: 40, width: '100%' } : { width: '100%' }}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query !== '' && (
              <button
                aria-label={t('Effacer la recherche')}
                title={t('Effacer la recherche')}
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 32,
                  height: 32,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-dim)',
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
          {/* Tri, vues, répertoires et tags vivent derrière ce bouton :
              l'écran ne montre que la recherche et la liste. */}
          <button
            className={`btn ${filtersOpen || activeFilters > 0 ? '' : 'ghost'}`}
            style={{ flexShrink: 0, minHeight: 44 }}
            aria-expanded={filtersOpen}
            title={t('Trier et filtrer la bibliothèque')}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <Icon name="sliders" size={16} /> {t('Filtrer')}
            {activeFilters > 0 && (
              <span className="filtercount">{activeFilters}</span>
            )}
          </button>
          {/* 📥 PROPOSITIONS — compacte, DANS la barre (b427, passe UX de
              Vincent : « ne doit plus occuper une ligne pleine dédiée »).
              La doctrine b225 tient toujours : elle reste À L'ÉCRAN, jamais
              derrière « Filtrer » (c'est le seul filtre qui cache des
              morceaux), et n'existe que s'il y a quelque chose à montrer.
              Ce n'est PAS un filtre du panneau : objet à part, la sortie
              vit dans la rangée « Filtre actif » (b414). */}
          {ideaCount > 0 && (
            <button
              className={`btn ${showIdeas ? '' : 'ghost'}`}
              style={{ flexShrink: 0, minHeight: 44 }}
              aria-pressed={showIdeas}
              title={t(
                'Ce qu’un groupe te propose, et ce que tu as gardé à un bœuf',
              )}
              onClick={() => {
                setShowIdeas(!showIdeas);
                setBandFilter(null);
                setShowCheck(false);
              }}
            >
              📥<span className="filtercount">{ideaCount}</span>
            </button>
          )}
          {/* SOMBRE / CLAIR : déménagé dans les Réglages (b354, demande de
              Vincent — remplace le placement b234 dans cette barre). */}
        </div>
        {/* FILTRE ACTIF, DANS LA BARRE COLLANTE (b414, demande de Vincent :
            « il faut que "tous les morceaux" soit facilement accessible,
            et que ce soit clair qu'un filtre est en cours »). L'ancien
            résumé défilait avec la liste : au milieu de la bibliothèque, la
            barre restait visible mais rien ne disait qu'un filtre réduisait
            la liste, et la sortie demandait de remonter ou d'ouvrir le
            panneau. Ici, l'état ET la sortie suivent le défilement — la
            barre est déjà mesurée par le ResizeObserver, la hauteur suit. */}
        {(activeFilters > 0 || showIdeas) && (
          <div
            className="hstack"
            style={{
              gap: 8,
              marginTop: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span className="help" style={{ margin: 0, minWidth: 0 }}>
              {t('Filtre actif :')}{' '}
              <strong style={{ color: 'var(--accent)' }}>
                {[
                  bandFilter !== null
                    ? (bands.find((b) => b.id === bandFilter)?.name ??
                      t('Groupe'))
                    : '',
                  tag !== null ? `#${tag}` : '',
                  showIdeas ? t('📥 Propositions') : '',
                  showCheck ? t('🔎 À vérifier') : '',
                ]
                  .filter((x) => x !== '')
                  .join(' · ')}
              </strong>{' '}
              —{' '}
              {filtered.length > 1
                ? t('{n} morceaux', { n: filtered.length })
                : t('{n} morceau', { n: filtered.length })}
            </span>
            {/* Fantôme, pas ambre : le bouton Filtrer actif porte déjà
                l'accent, et un seul bouton ambre par écran (charte). */}
            <button
              className="btn ghost small"
              onClick={() => {
                setBandFilter(null);
                setTag(null);
                setShowIdeas(false);
                setShowCheck(false);
              }}
            >
              {t('Tout afficher')}
            </button>
          </div>
        )}
        {filtersOpen && (
          <>
            <div className="spacer" />
            <div className="field" style={{ maxWidth: 220 }}>
              <label>{t('Tri')}</label>
              <select
                value={sort}
                onChange={(e) => changeSort(e.target.value as SortMode)}
              >
                <option value="title">{t('Titre')}</option>
                <option value="artist">{t('Artiste')}</option>
                <option value="recent">{t('Récents')}</option>
              </select>
            </div>
          </>
        )}
        {filtersOpen &&
          (bands.length > 0 || checkCount > 0) && (
          <>
            <div className="spacer" />
            {/* Rangée 1 — VUES particulières (état des morceaux). */}
            <div className="chips filterchips scrollrow">
              <button
                className={`chip ${bandFilter === null && !showIdeas ? '' : 'off'}`}
                onClick={() => {
                  setBandFilter(null);
                  setShowIdeas(false);
                  setShowCheck(false);
                }}
              >
                {t('Tous les morceaux')}
              </button>
              {checkCount > 0 && (
                <button
                  className={`chip ${showCheck ? '' : 'off'}`}
                  title={t(
                    'Morceaux dont l’import a douté — un coup d’œil suffit souvent',
                  )}
                  onClick={() => {
                    setShowCheck(!showCheck);
                    setBandFilter(null);
                    setShowIdeas(false);
                  }}
                >
                  {t('🔎 À vérifier ({n})', { n: checkCount })}
                </button>
              )}
            </div>
            {/* Rangée 2 — vues par GROUPE. « Groupes : » et plus
                « Répertoires : » (b347, demande de Vincent) : les pastilles
                listent des groupes, l'étiquette dit ce qu'on lit. Le
                répertoire « solo » a disparu (b293) — pour se faire un
                répertoire perso, on crée un groupe dont on est seul membre. */}
            {bands.length > 0 && (
              <div
                className="chips filterchips scrollrow"
                style={{ marginTop: 'var(--sp-2)', alignItems: 'center' }}
              >
                <span className="help" style={{ margin: 0 }}>
                  {t('Groupes :')}
                </span>
                {bands.map((b, i) => (
                  <button
                    key={b.id}
                    className={`chip ${bandFilter === b.id && !showIdeas ? '' : 'off'}`}
                    onClick={() => {
                      setBandFilter(bandFilter === b.id ? null : b.id);
                      setShowIdeas(false);
                    }}
                  >
                    {/* La couleur du groupe = un point discret, pas une
                        bordure (l'encadrement signale la sélection). */}
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: BAND_COLORS[i % BAND_COLORS.length],
                        marginRight: 2,
                      }}
                    />
                    {b.name || t('Groupe sans nom')}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {/* Le résumé du filtre vit désormais DANS la barre collante (b414) :
            visible même au milieu de la liste, avec sa sortie. */}
        {filtersOpen && allTags.length > 0 && (
          <>
            <div className="spacer" />
            {/* Même grammaire que la rangée des groupes (b427/F-1) : un
                label dit ce que les pastilles listent. */}
            <div
              className="chips filterchips scrollrow"
              style={{ alignItems: 'center' }}
            >
              <span className="help" style={{ margin: 0 }}>
                {t('Tags :')}
              </span>
              {allTags.map((t) => (
                <button
                  key={t}
                  className={`chip ${tag === t ? '' : 'off'}`}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
        </div>
        {/* COMPTEUR DU PLAN GRATUIT (b381, simplifié b386) : discret,
            calculé au rendu (règle 11) ; à l'approche du plafond (≥ 80 %),
            il prévient — jamais de surprise au moment d'ajouter. */}
        {limites.maxMorceaux !== null && (
          <p
            className="help"
            style={{
              margin: '6px 0 0',
              ...(presDeLaLimite(limites.morceaux, limites.maxMorceaux)
                ? { color: 'var(--warn)' }
                : {}),
            }}
          >
            {t('{n} / {max} morceaux', {
              n: limites.morceaux,
              max: limites.maxMorceaux,
            })}
            {limites.morceaux >= limites.maxMorceaux
              ? ' — ' + t('ta bibliothèque gratuite est pleine.')
              : ''}
          </p>
        )}
        {/* La rangée pleine « 📥 Propositions » a rejoint la barre d'outils
            en bouton compact (b427) — la sortie vit dans « Filtre actif »
            (b414), l'explication reste juste en dessous. */}
        {/* L'explication vient APRÈS le bouton qui l'a déclenchée — au-dessus,
            elle répondait à une question que personne ne s'était encore posée. */}
        {showIdeas && (
          <p className="help" style={{ margin: '6px 0 0' }}>
            {t(
              // Plus d'« écarter » depuis b418 : le seul geste est Accepter.
              'Ce qu’on te propose : le répertoire d’un groupe, ou un morceau gardé à un bœuf. Jouables partout — accepte ✓ ceux que tu veux garder.',
            )}
          </p>
        )}
        <Onboarding />
        <BackupNudge />
        {/* Reprise d'une création en cours (b319) : un brouillon vivant se
            propose DISCRÈTEMENT — et la mention a une sortie (règle 11) :
            « Supprimer » la lève à la main, la validation ou le TTL 6 h la
            lèvent tout seuls. */}
        {brouillonEnCours && (
          <div className="card" style={{ marginBottom: 'var(--sp-3)' }}>
            <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="help" style={{ flex: 1, minWidth: 160 }}>
                {t('Reprendre la création de « {titre} » ?', {
                  titre: brouillonEnCours.title,
                })}
              </span>
              <button
                className="btn small"
                onClick={() => navigate(`/creer/${brouillonEnCours.id}`)}
              >
                {t('Reprendre')}
              </button>
              <button
                className="btn ghost small"
                onClick={() => purgeBrouillon(brouillonEnCours.id)}
              >
                {t('Supprimer')}
              </button>
            </div>
          </div>
        )}
        <div className={`libsplit${selectedId ? ' hasdetail' : ''}`}>
          <div>
            {filtered.length === 0 ? (
              songs.length === 0 ? (
                <Empty>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>
                    {t('Importe tes partitions')}
                  </div>
                  {t(
                    'Tu as déjà une collection ? Dépose tous tes fichiers ou tes pages enregistrées en une fois — mojosong met tout au propre.',
                  )}
                  <div className="spacer" />
                  <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      className="btn"
                      onClick={() => navigate('/import/bulk')}
                    >
                      <Icon name="import" size={16} /> {t('Importer ma collection')}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => navigate('/import')}
                    >
                      {t('Ajouter un seul morceau')}
                    </button>
                  </div>
                </Empty>
              ) : (
                <Empty>{t('Aucun morceau ne correspond à ta recherche.')}</Empty>
              )
            ) : (
              <div className="list">
                {sort === 'artist'
                  ? artistGroups.map((g) => (
                      <React.Fragment key={g.name}>
                        <div className="listgroup">
                          {g.name}
                          <span className="count">{g.songs.length}</span>
                        </div>
                        {g.songs.map(renderRow)}
                      </React.Fragment>
                    ))
                  : filtered.map(renderRow)}
              </div>
            )}
          </div>

          {/* Volet de droite (ordinateur) : le morceau sélectionné */}
          <SongPreview
            id={selectedId}
            onClose={() => {
              // Même recalage à la fermeture : la liste se re-déploie en
              // colonnes, la ligne qu'on lisait ne doit pas bouger (b434).
              ancrerLigne(selectedId);
              setSelectedId(null);
            }}
            onPickSetlist={(id) => setPickerFor(id)}
          />
        </div>
      </div>

      {bandCollect && bandFilter !== null && bandFilter !== '' && (
        <SongCollector
          title={t('Ajouter au répertoire — {band}', {
            band: bands.find((b) => b.id === bandFilter)?.name || t('groupe'),
          })}
          alreadyIn={songs
            .filter((s) => versionForBand(s, bandFilter) !== null)
            .map((s) => s.id)}
          confirmLabel={(n) =>
            n > 1
              ? t('Ajouter {n} morceaux au répertoire', { n })
              : t('Ajouter {n} morceau au répertoire', { n })
          }
          onConfirm={(ids) => {
            const b = bands.find((x) => x.id === bandFilter);
            if (!b) return;
            for (const id of ids) {
              const s = songs.find((x) => x.id === id);
              if (!s || versionForBand(s, b.id) !== null) continue;
              saveSong(
                switchVersion(
                  duplicateVersion(
                    s,
                    b.name || 'Groupe',
                    b.id,
                    // La provenance suit l'acte (b420) : c'est moi qui propose.
                    quiPropose(prefs.userName || artist.name),
                  ),
                  s.activeVersionId,
                ),
              );
              clearBandRemoval(b.id, songKey(s.title, s.artist));
              void announceBandSong(
                b.cloudId,
                prefs.userName || artist.name || t('Moi'),
                s.title,
                s.artist,
              );
            }
          }}
          onClose={() => setBandCollect(false)}
        />
      )}

      {pickerFor !== null && (
        <SetlistPicker songId={pickerFor} onClose={() => setPickerFor(null)} />
      )}

      {/* Menu « ⋯ » d'un morceau : 4 actions maximum. */}
      {rowMenu && (
        <MenuSheet
          title={rowMenu.title || t('Ce morceau')}
          items={[
            {
              label: t('Jouer (mode scène)'),
              icon: 'play',
              onClick: () => {
                // Au plafond, une proposition ne s'ouvre pas (b426).
                if (propositionBloquee(rowMenu, limites.peutAjouter)) {
                  signalerLimite('LIMIT_SONGS');
                  return;
                }
                navigate(`/stage/song/${rowMenu.id}`);
              },
            },
            {
              label: t('Modifier'),
              icon: 'edit',
              onClick: () => {
                if (propositionBloquee(rowMenu, limites.peutAjouter)) {
                  signalerLimite('LIMIT_SONGS');
                  return;
                }
                navigate(`/song/${rowMenu.id}/edit`);
              },
            },
            {
              label: t('Ajouter à…'),
              icon: 'plus',
              onClick: () => setRowAssign(rowMenu.id),
            },
            // Toute mention qui réclame une action doit pouvoir être levée
            // d'un geste (règle 11, b212) : « À vérifier » n'avait aucune
            // sortie — elle survivait même au remplacement de la partition
            // (signalement de Vincent, b218). C'est le musicien qui juge.
            ...(songs.find((s) => s.id === rowMenu.id)?.needsCheck
              ? [
                  {
                    label: t('✓ Partition vérifiée'),
                    icon: 'eye' as const,
                    onClick: () => {
                      const s = songs.find((x) => x.id === rowMenu.id);
                      if (s) saveSong(garderLaMiseEnForme(s));
                    },
                  },
                ]
              : []),
            // Le doute de la mise en forme automatique se tranche ICI
            // quand il vient d'un import en masse (b220) : le lot ne
            // s'arrête pas pour poser la question, donc la partition
            // d'avant l'IA voyage avec le morceau jusqu'à la réponse.
            ...(songs.find((s) => s.id === rowMenu.id)?.beforeAi
              ? [
                  {
                    label: t('↩ Revenir à ma partition d’origine'),
                    icon: 'undo' as const,
                    onClick: () => {
                      const s = songs.find((x) => x.id === rowMenu.id);
                      if (s) saveSong(revenirAvantIA(s));
                    },
                  },
                ]
              : []),
            {
              label: t('Supprimer'),
              icon: 'trash',
              danger: true,
              // Isolée des actions courantes (b427/A-9) : un trait au-dessus
              // réduit le tap accidentel depuis « Ajouter à… ».
              sep: true,
              onClick: () => setRowDelete(rowMenu),
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      )}
      {rowAssign !== null && (
        <AssignSheet songId={rowAssign} onClose={() => setRowAssign(null)} />
      )}
      {rowDelete && (
        <SongDeleteSheet
          song={rowDelete}
          band={groupeAffiche}
          onDeleted={() => {
            if (selectedId === rowDelete.id) setSelectedId(null);
          }}
          onClose={() => setRowDelete(null)}
        />
      )}
    </>
  );
}

/** Aperçu du morceau sélectionné (volet droit, ≥ 1100px). */
function SongPreview({
  id,
  onClose,
  onPickSetlist,
}: {
  id: string | null;
  onClose: () => void;
  onPickSetlist: (songId: string) => void;
}) {
  const {
    songs,
    prefs,
    artist,
    saveSong,
    bands,
    setlists,
    saveSetlist,
    recordBandRemoval,
    clearBandRemoval,
  } = useStore();
  const author = prefs.userName || artist.name || t('Moi');
  const limitesPane = useLimits();
  const [suppr, setSuppr] = useState(false);
  const song = id ? songs.find((s) => s.id === id) : undefined;
  const paneRef = useRef<HTMLElement | null>(null);
  // Éditeur « Ajouter à un groupe / une setlist » (à la demande).
  const [assocOpen, setAssocOpen] = useState(false);

  // Mêmes réglages de lecture que la fiche : tonalité/capo mémorisés
  // par morceau + version (sur cet appareil).
  // Transpose des formes + capo, éditables et mémorisés par appareil.
  const [shift, setShift] = useState(0);
  const [viewCapo, setViewCapo] = useState(0);
  useEffect(() => {
    if (!song) return;
    try {
      const raw = localStorage.getItem(
        `sing2me/viewkey/${song.id}/${song.activeVersionId}`,
      );
      if (raw !== null) {
        const v = JSON.parse(raw) as { shift?: number; capo?: number };
        setShift(typeof v.shift === 'number' ? v.shift : 0);
        setViewCapo(typeof v.capo === 'number' ? v.capo : song.capo);
      } else {
        setShift(0);
        setViewCapo(song.capo);
      }
    } catch {
      setShift(0);
      setViewCapo(song?.capo ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, song?.activeVersionId]);
  useEffect(() => {
    if (!song) return;
    try {
      const key = `sing2me/viewkey/${song.id}/${song.activeVersionId}`;
      if (shift === 0 && viewCapo === song.capo) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ shift, capo: viewCapo }));
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, viewCapo]);
  const displayReal = localStorage.getItem('sing2me/showRealKey') === '1';
  // song.key = tonalité des formes ; tonalité réelle = formes + capo.
  const shapeKeyShown =
    song && song.key !== '' ? transposeKeyName(song.key, shift) : '';
  const realKeyShown =
    song && song.key !== ''
      ? transposeKeyName(song.key, shift + viewCapo)
      : '';
  const displayShift = displayReal ? shift + viewCapo : shift;
  const shownKey = displayReal ? realKeyShown : shapeKeyShown;
  const preferFlat = spellingForKey(shownKey);

  // Chaque morceau affiché commence à son début (pas de scroll hérité)
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
    setAssocOpen(false);
  }, [id]);

  if (!song) return null;
  // Au plafond, une proposition se VOIT mais ne s'OUVRE pas (b426) : le
  // volet d'aperçu est une des portes vers le contenu — il montre le titre
  // et la sortie, jamais la partition.
  if (propositionBloquee(song, limitesPane.peutAjouter)) {
    return (
      <aside className="libpreview" ref={paneRef}>
        <div className="hstack" style={{ marginBottom: 4 }}>
          <strong style={{ flex: 1, fontSize: '1.1rem', minWidth: 0 }}>
            {song.title || t('(sans titre)')}
            {song.artist !== '' && (
              <span className="stauthor"> — {song.artist}</span>
            )}
          </strong>
          <button
            className="btn icon"
            aria-label={t("Fermer l'aperçu")}
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="help">
          📥{' '}
          {t(
            'Cette proposition attend dans ta boîte, mais ta bibliothèque gratuite est pleine : son contenu s’ouvrira quand tu pourras l’accepter.',
          )}
        </p>
        <button
          className="btn block"
          onClick={() => signalerLimite('LIMIT_SONGS')}
        >
          {t('Passer en illimité')}
        </button>
      </aside>
    );
  }
  // Appartenances actuelles (pour l'état compact).
  const memberBands = bands.filter((b) => versionForBand(song, b.id) !== null);
  const memberSetlists = setlists.filter((sl) =>
    sl.items.some((it) => it.songId === song.id),
  );
  return (
    <aside className="libpreview" ref={paneRef}>
      {/* Titre sur sa propre ligne (✕ à droite), actions en dessous :
          plus d'écrasement ni de débordement quand l'écran se resserre. */}
      <div className="hstack" style={{ marginBottom: 4 }}>
        <strong style={{ flex: 1, fontSize: '1.1rem', minWidth: 0 }}>
          {song.title || t('(sans titre)')}
          {song.artist !== '' && (
            <span className="stauthor"> — {song.artist}</span>
          )}
        </strong>
        <button
          className="btn icon"
          aria-label={t("Fermer l'aperçu")}
          onClick={onClose}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <div
        className="hstack"
        style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}
      >
        <button
          className="btn ghost small"
          onClick={() => navigate(`/song/${song.id}`)}
        >
          {t('Ouvrir')}
        </button>
        <button
          className="btn ghost small"
          onClick={() => navigate(`/song/${song.id}/edit`)}
          title={t('Modifier la partition')}
        >
          <Icon name="edit" size={14} /> {t('Modifier')}
        </button>
        <button
          className="btn ghost small"
          onClick={() => navigate(`/stage/song/${song.id}`)}
          title={t('Mode scène')}
        >
          <Icon name="play" size={14} /> {t('Scène')}
        </button>
        <button
          className="btn ghost small"
          title={t('Ajouter à une setlist')}
          onClick={() => onPickSetlist(song.id)}
        >
          <Icon name="list" size={14} /> {t('Setlist')}
        </button>
        <button
          className="btn ghost small"
          style={{ color: 'var(--danger)' }}
          title={t('Supprimer ce morceau')}
          aria-label={t('Supprimer ce morceau')}
          onClick={() => setSuppr(true)}
        >
          <Icon name="trash" size={14} />
        </button>
        {suppr && (
          <SongDeleteSheet
            song={song}
            onDeleted={onClose}
            onClose={() => setSuppr(false)}
          />
        )}
      </div>
      <div className="hstack" style={{ marginBottom: 10 }}>
        <span className="help">
          {[
            song.tempo > 0 ? `${song.tempo} BPM` : '',
            formatDuration(song.durationSec),
          ]
            .filter((x) => x !== '')
            .join(' · ')}
        </span>
        {song.versions.length > 1 && (
          <span className="versionpick">
          <select
            value={song.activeVersionId}
            title={t('Changer de version (solo, groupe…)')}
            onChange={(e) => saveSong(switchVersion(song, e.target.value))}
          >
            {song.versions.map((v) => {
              const bandName =
                v.bandId !== ''
                  ? (bands.find((b) => b.id === v.bandId)?.name ?? '')
                  : '';
              // Évite « Zakoustiks · Zakoustiks » quand le nom de la version
              // reprend déjà celui du groupe (même garde que SongView).
              const suffix =
                bandName !== '' && bandName.trim() !== v.name.trim()
                  ? ` · ${bandName}`
                  : '';
              return (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {suffix}
                  {v.key !== '' ? ` (${v.key})` : ''}
                </option>
              );
            })}
          </select>
          </span>
        )}
      </div>
      {/* Appartenances : état compact (où le morceau EST) + éditeur à la
          demande pour l'ajouter/retirer d'un groupe ou d'une setlist. */}
      <div
        className="hstack"
        style={{
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <span className="help">{t('Dans :')}</span>
        {memberBands.length === 0 && memberSetlists.length === 0 && (
          <span className="help" style={{ margin: 0 }}>
            {t('aucun groupe ni setlist')}
          </span>
        )}
        {memberBands.map((b) => (
          <span key={b.id} className="chip static">
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background:
                  BAND_COLORS[
                    bands.findIndex((x) => x.id === b.id) % BAND_COLORS.length
                  ],
                marginRight: 4,
              }}
            />
            {b.name || t('Groupe sans nom')}
          </span>
        ))}
        {memberSetlists.map((sl) => (
          <span key={sl.id} className="chip static">
            {sl.name || t('(sans nom)')}
          </span>
        ))}
        <button
          className="chip off"
          title={t('Ajouter ce morceau à un groupe ou une setlist')}
          onClick={() => setAssocOpen(true)}
        >
          {t('＋ Ajouter à…')}
        </button>
      </div>

      {assocOpen && (
        <AssignSheet songId={song.id} onClose={() => setAssocOpen(false)} />
      )}
      {!displayReal && (
        <div className="transpose" style={{ marginBottom: 10 }}>
          <span className="transpose-unit">
            <span className="lbl">{t('Transposer')}</span>
            <div className="stepper">
              <button
                title={t(
                  'Accords plus bas (capo +1) — la tonalité réelle ne change pas',
                )}
                onClick={() => {
                  setShift((s) => s - 1);
                  setViewCapo((c) => Math.min(11, c + 1));
                }}
              >
                ♭
              </button>
              <span>
                {shapeKeyShown !== ''
                  ? shapeKeyShown
                  : shift === 0
                    ? '—'
                    : t('{n} ½t', { n: shift > 6 ? shift - 12 : shift })}
              </span>
              <button
                title={t('Accords plus haut (capo −1)')}
                onClick={() => {
                  setShift((s) => s + 1);
                  if (viewCapo > 0) setViewCapo((c) => c - 1);
                }}
              >
                ♯
              </button>
            </div>
          </span>
          <span className="transpose-unit">
            <span className="lbl">{t('Capo')}</span>
            <div className="stepper">
              <button
                title={t('Le capo change ce qui sonne, pas les accords affichés')}
                onClick={() => setViewCapo((c) => Math.max(0, c - 1))}
              >
                −
              </button>
              <span>{viewCapo}</span>
              <button onClick={() => setViewCapo((c) => Math.min(11, c + 1))}>
                ＋
              </button>
            </div>
          </span>
          {(shift !== 0 || viewCapo !== song.capo) && (
            <button
              className="btn ghost small"
              onClick={() => {
                setShift(0);
                setViewCapo(song.capo);
              }}
            >
              {t('Réinitialiser')}
            </button>
          )}
        </div>
      )}
      <SongBody
        song={song}
        view="complete"
        semitones={displayShift}
        capo={0}
        preferFlat={preferFlat}
      />
    </aside>
  );
}
