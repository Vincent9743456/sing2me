import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAccount } from '../components/Account';
import { Icon } from '../components/Icon';
import { SongBody } from '../components/SongBody';
import { applyUgTextToSong, UgUpgradeModal } from '../components/UgUpgrade';
import { AssignSheet, SongCollector } from '../components/SongPicker';
import { ConfirmSheet, MenuSheet } from '../components/Feedback';
import { Onboarding } from '../components/Onboarding';
import { EXAMPLE_TAG } from '../seed';
import { Empty, TopBar } from '../components/ui';
import { t } from '../i18n';

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
import { announceBandSong } from '../lib/bands';
import { LiveBanner } from '../components/LiveBanner';
import { spellingForKey, transposeKeyName } from '../lib/chords';
import { songKey } from '../lib/importer';
import {
  contextVersionId,
  duplicateVersion,
  removeVersion,
  switchVersion,
  versionForBand,
} from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { emptySetlist, formatDuration, makeId, Setlist, Song } from '../types';
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

/** Initiales d'un nom de groupe : « Les Zamis » → LZ. */
function bandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Une partition « nouvelle » : ajoutée à la bibliothèque dans les 7 jours. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function isRecent(createdAt: string): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && Date.now() - t < WEEK_MS;
}

export function Library() {
  const {
    songs,
    deleteSong,
    acceptSong,
    bands,
    setlists,
    saveSong,
    deleteSetlist,
    clearBandRemoval,
    prefs,
    artist,
  } = useStore();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  // null = tous · '' = solo (aucun groupe) · sinon id du groupe
  const [bandFilter, setBandFilter] = useState<string | null>(null);
  // Panneau « Filtrer » : tri + vues + répertoires + tags — replié par
  // défaut (règle : recherche + liste, rien d'autre).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const account = useAccount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
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
  const [showIdeas, setShowIdeas] = useState(false);
  const ideaCount = useMemo(
    () => songs.filter((s) => s.idea === true).length,
    [songs],
  );
  // Nouveautés : partitions ajoutées dans la semaine (repérage rapide)
  const [showNew, setShowNew] = useState(false);
  const newCount = useMemo(
    () =>
      songs.filter(
        (s) =>
          s.idea !== true &&
          (s.pendingBandId ?? '') === '' &&
          !(s.tags ?? []).includes(EXAMPLE_TAG) &&
          isRecent(s.createdAt),
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
  const showNudge =
    account?.available === true && account.email === null && !nudgeHidden;

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
    songs.forEach((s) => s.tags.forEach((t) => set.add(t)));
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
    const q = query.trim().toLowerCase();
    const byTitle = (a: (typeof songs)[number], b: (typeof songs)[number]) =>
      a.title.localeCompare(b.title, 'fr');
    // Les nouvelles importations restent épinglées EN TÊTE tant qu'elles
    // sont « nouvelles » (une semaine) — sauf en tri par artiste (qui
    // regroupe) ou dans une vue filtrée dédiée.
    const pinTop = sort !== 'artist' && !showNew && !showIdeas;
    const isProposal = (s: (typeof songs)[number]) =>
      (s.pendingBandId ?? '') !== '';
    const freshRank = (s: (typeof songs)[number]) =>
      s.idea !== true &&
      !isProposal(s) &&
      !(s.tags ?? []).includes(EXAMPLE_TAG) &&
      isRecent(s.createdAt);
    return [...songs]
      .sort((a, b) => {
        if (pinTop) {
          // Les nouvelles importations de la semaine, en tête.
          const fa = freshRank(a);
          const fb = freshRank(b);
          if (fa !== fb) return fa ? -1 : 1;
          if (fa && fb) {
            const cmp = b.createdAt.localeCompare(a.createdAt);
            if (cmp !== 0) return cmp;
          }
        }
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
        // Vue « Idées » : la réserve à travailler — y compris les morceaux
        // proposés par un groupe, qui arrivent désormais ici (b174).
        if (showIdeas) return s.idea === true;
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
          return (s.pendingBandId ?? '') === bandFilter;
        }
        // Vue par défaut « Tous les morceaux » : ce qu'on joue vraiment. Les
        // idées (et donc les propositions) attendent dans leur vue ; les
        // programmer dans une setlist les fait entrer ici pour de bon.
        return s.idea !== true;
      })
      .filter((s) => (showNew ? isRecent(s.createdAt) : true))
      .filter((s) => (tag ? s.tags.includes(tag) : true))
      .filter((s) => {
        if (bandFilter === null) return true;
        // Solo : tous les morceaux par défaut, sauf déqualifiés (noSolo)
        if (bandFilter === '') return s.noSolo !== true;
        return membership.bandsBySong.get(s.id)?.has(bandFilter) ?? false;
      })
      .filter(
        (s) =>
          q === '' ||
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
  }, [
    songs,
    query,
    tag,
    sort,
    bandFilter,
    membership,
    showIdeas,
    showNew,
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
  // dans un filtre groupe → la version du groupe ; sinon (toutes / solo) →
  // la version originale. Comme SongView/SongEdit et les notes suivent la
  // version active, commentaires et modifications visent la bonne version.
  function openWithContext(song: Song) {
    const bid = bandFilter && bandFilter !== '' ? bandFilter : '';
    const vid = contextVersionId(song, bid);
    if (vid !== song.activeVersionId) saveSong(switchVersion(song, vid));
  }

  const renderRow = (song: (typeof filtered)[number]) => (
                  <div
                    className={`row ${selectedId === song.id ? 'selected' : ''} ${
                      (song.pendingBandId ?? '') !== '' ? 'proposal' : ''
                    }`}
                    key={song.id}
                    onClick={() => {
                      openWithContext(song);
                      if (isSplitScreen()) setSelectedId(song.id);
                      else navigate(`/song/${song.id}`);
                    }}
                  >
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{song.title || t('(sans titre)')}</div>
                      {(song.pendingBandId ?? '') !== '' ? (
                        <div
                          className="sub"
                          style={{ color: 'var(--accent)', fontWeight: 600 }}
                        >
                          {/* Dans le répertoire du groupe qui propose, répéter
                              son nom n'apprend rien : ce qu'il faut lire,
                              c'est qu'il reste un geste à faire (b203). */}
                          {bandFilter !== null &&
                          bandFilter === (song.pendingBandId ?? '')
                            ? t('📥 À valider')
                            : `${t('📥 Proposé par')} ${
                                bands.find((b) => b.id === song.pendingBandId)
                                  ?.name || t('ton groupe')
                              }`}
                          {song.artist !== '' ? ` · ${song.artist}` : ''}
                        </div>
                      ) : (
                        <div className="sub">
                          {[
                            (song.tags ?? []).includes(EXAMPLE_TAG)
                              ? t('Exemple')
                              : '',
                            song.artist,
                            song.key,
                            song.tempo > 0 ? `${song.tempo} BPM` : '',
                            formatDuration(song.durationSec),
                          ]
                            .filter((x) => x !== '')
                            .join(' · ') || ' '}
                        </div>
                      )}
                    </div>
                    {/* Le repérage des nouveautés passe par le chip
                        « ✨ Nouveautés » (filtre actionnable) — plus de badge
                        par ligne : sur un import en masse, chaque ligne en
                        portait un (bruit signalé par l'audit UI). */}
                    {[...(membership.bandsBySong.get(song.id) ?? [])].map((bid) => {
                      const idx = bandIndex.get(bid) ?? 0;
                      const b = bands[idx];
                      const color = BAND_COLORS[idx % BAND_COLORS.length];
                      return (
                        <span
                          key={bid}
                          className="bandtag"
                          style={{ borderColor: color, color }}
                          title={t('Groupe : {name} — cliquer pour filtrer', {
                            name: b?.name || t('sans nom'),
                          })}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBandFilter(bandFilter === bid ? null : bid);
                          }}
                        >
                          {bandInitials(b?.name ?? '')}
                        </span>
                      );
                    })}
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
                    {(song.pendingBandId ?? '') !== '' && (
                      <button
                        className="btn small"
                        title={t('Accepter « {title} » dans ta bibliothèque', {
                          title: song.title || t('ce morceau'),
                        })}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Accepter = entrer en bibliothèque ET dans le
                          // répertoire du groupe (b205). La règle vit dans
                          // le store, comme celle des setlists.
                          acceptSong(song.id);
                        }}
                      >
                        {t('✓ Accepter')}
                      </button>
                    )}
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
                  </div>
  );

  // Badge du bouton « Filtrer » : nombre de filtres actifs (une vue
  // particulière, un répertoire, un tag — le tri n'est pas un filtre).
  const activeFilters =
    (showIdeas || showNew ? 1 : 0) +
    (bandFilter !== null ? 1 : 0) +
    (tag !== null ? 1 : 0);

  return (
    <>
      <TopBar title={t('Morceaux')} />
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
        </div>
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
          (bands.length > 0 || ideaCount > 0 || newCount > 0) && (
          <>
            <div className="spacer" />
            {/* Rangée 1 — VUES particulières (état des morceaux) :
                tout / propositions / nouveautés / idées. */}
            <div className="chips filterchips scrollrow">
              <button
                className={`chip ${bandFilter === null && !showIdeas && !showNew ? '' : 'off'}`}
                onClick={() => {
                  setBandFilter(null);
                  setShowIdeas(false);
                  setShowNew(false);
                }}
              >
                {t('Tous les morceaux')}
              </button>
              {/* La puce « 📥 Propositions » a été retirée (b203, décision
                  Vincent : « Proposition n'est pas utile »). Elle doublait
                  les Idées, où les propositions vivent depuis b174 — et
                  elles apparaissent maintenant dans le répertoire du groupe
                  qui les a proposées, là où on les cherche vraiment. */}
              {newCount > 0 && (
                <button
                  className={`chip ${showNew ? '' : 'off'}`}
                  title={t('Partitions ajoutées dans la semaine')}
                  onClick={() => {
                    setShowNew(!showNew);
                    setBandFilter(null);
                    setShowIdeas(false);
                  }}
                >
                  {t('✨ Nouveautés ({n})', { n: newCount })}
                </button>
              )}
              {ideaCount > 0 && (
                <button
                  className={`chip ${showIdeas ? '' : 'off'}`}
                  title={t(
                    'Morceaux importés non encore validés — réserve à travailler',
                  )}
                  onClick={() => {
                    setShowIdeas(!showIdeas);
                    setBandFilter(null);
                    setShowNew(false);
                  }}
                >
                  {t('💡 Idées ({n})', { n: ideaCount })}
                </button>
              )}
            </div>
            {/* Rangée 2 — RÉPERTOIRES (identification par groupe / solo) :
                fonction différente, rendue évidente par le libellé et la
                rangée séparée. */}
            {bands.length > 0 && (
              <div
                className="chips filterchips scrollrow"
                style={{ marginTop: 'var(--sp-2)', alignItems: 'center' }}
              >
                <span className="help" style={{ margin: 0 }}>
                  {t('Répertoires :')}
                </span>
                <button
                  className={`chip ${bandFilter === '' && !showIdeas && !showNew ? '' : 'off'}`}
                  title={t(
                    'Répertoire jouable en solo (tous les morceaux par défaut, sauf déqualifiés depuis leur fiche)',
                  )}
                  onClick={() => {
                    setBandFilter('');
                    setShowIdeas(false);
                    setShowNew(false);
                  }}
                >
                  <Icon name="mic" size={12} /> {t('Solo')}
                </button>
                {bands.map((b, i) => (
                  <button
                    key={b.id}
                    className={`chip ${bandFilter === b.id && !showIdeas && !showNew ? '' : 'off'}`}
                    onClick={() => {
                      setBandFilter(bandFilter === b.id ? null : b.id);
                      setShowIdeas(false);
                      setShowNew(false);
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
        {/* Résumé du filtre actif : TOUJOURS visible (même panneau fermé),
            pour que la liste réduite s'explique d'elle-même. */}
        {(showIdeas || showNew || bandFilter !== null) && (
          <>
            {showIdeas && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                {t(
                  'Réserve à travailler : jouables partout, mais pas encore validées dans la bibliothèque — ouvre un morceau pour le valider ✓ ou le supprimer.',
                )}
              </p>
            )}
            {showNew && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                {filtered.length > 1
                  ? t('Partitions ajoutées cette semaine — {n} morceaux.', {
                      n: filtered.length,
                    })
                  : t('Partitions ajoutées cette semaine — {n} morceau.', {
                      n: filtered.length,
                    })}
              </p>
            )}
            {!showIdeas && !showNew && bandFilter !== null && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                {t('Filtre actif :')}{' '}
                <strong style={{ color: 'var(--accent)' }}>
                  {bandFilter === ''
                    ? t('Solo')
                    : (bands.find((b) => b.id === bandFilter)?.name ?? t('Groupe'))}
                </strong>{' '}
                —{' '}
                {filtered.length > 1
                  ? t('{n} morceaux', { n: filtered.length })
                  : t('{n} morceau', { n: filtered.length })}{' '}
                ·{' '}
                <button
                  className="btn ghost small"
                  onClick={() => setBandFilter(null)}
                >
                  {t('Tout afficher')}
                </button>
              </p>
            )}
          </>
        )}
        {tag !== null && (
          <p className="help" style={{ margin: '6px 0 0' }}>
            {t('Tag :')} <strong style={{ color: 'var(--accent)' }}>{tag}</strong> ·{' '}
            <button className="btn ghost small" onClick={() => setTag(null)}>
              {t('Retirer')}
            </button>
          </p>
        )}
        {filtersOpen && allTags.length > 0 && (
          <>
            <div className="spacer" />
            <div className="chips">
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
        <Onboarding />
        <div className={`libsplit${selectedId ? ' hasdetail' : ''}`}>
          <div>
            {filtered.length === 0 ? (
              songs.length === 0 ? (
                <Empty>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>
                    {t('Importe tes partitions')}
                  </div>
                  {t(
                    "Colle un texte, un lien d'une page de partition, un PDF ou un fichier Word — Sing2Me met tout au propre.",
                  )}
                  <div className="spacer" />
                  <button
                    className="btn"
                    onClick={() => navigate('/import')}
                  >
                    <Icon name="import" size={16} /> {t('Importer mon premier morceau')}
                  </button>
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
            onClose={() => setSelectedId(null)}
            onPickSetlist={(id) => setPickerFor(id)}
          />
        </div>
      </div>

      {/* Action principale unique : importer — ou, en vue répertoire d'un
          groupe (filtre actif), ajouter des morceaux à ce répertoire. */}
      {bandFilter !== null && bandFilter !== '' ? (
        <button
          className="btn libfab"
          title={t('Ajouter des morceaux au répertoire du groupe')}
          onClick={() => setBandCollect(true)}
        >
          <Icon name="plus" size={17} /> {t('Ajouter des morceaux')}
        </button>
      ) : (
        <button
          className="btn libfab"
          title={t(
            "Ajouter un morceau (importer un texte, un lien, un PDF… ou écrire à la main)",
          )}
          onClick={() => navigate('/import')}
        >
          <Icon name="plus" size={17} /> {t('Nouveau morceau')}
        </button>
      )}
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
                  duplicateVersion(s, b.name || 'Groupe', b.id),
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
              onClick: () => navigate(`/stage/song/${rowMenu.id}`),
            },
            {
              label: t('Modifier'),
              icon: 'edit',
              onClick: () => navigate(`/song/${rowMenu.id}/edit`),
            },
            {
              label: t('Ajouter à…'),
              icon: 'plus',
              onClick: () => setRowAssign(rowMenu.id),
            },
            {
              label: t('Supprimer'),
              icon: 'trash',
              danger: true,
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
        <ConfirmSheet
          title={t('Supprimer « {title} » ?', {
            title: rowDelete.title || t('ce morceau'),
          })}
          message={t('Le morceau sera aussi retiré des setlists.')}
          confirmLabel={t('Supprimer')}
          danger
          onConfirm={() => {
            deleteSong(rowDelete.id);
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
    deleteSong,
    bands,
    setlists,
    saveSetlist,
    recordBandRemoval,
    clearBandRemoval,
  } = useStore();
  const author = prefs.userName || artist.name || t('Moi');
  const song = id ? songs.find((s) => s.id === id) : undefined;
  const paneRef = useRef<HTMLElement | null>(null);
  const [ugOpen, setUgOpen] = useState(false);
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
    setUgOpen(false);
    setAssocOpen(false);
  }, [id]);

  if (!song) return null;
  // Appartenances actuelles (pour l'état compact).
  const memberBands = bands.filter((b) => versionForBand(song, b.id) !== null);
  const memberSetlists = setlists.filter((sl) =>
    sl.items.some((it) => it.songId === song.id),
  );
  return (
    <aside className="libpreview" ref={paneRef}>
      {ugOpen && (
        <UgUpgradeModal
          song={song}
          onApply={(text, mode) => {
            saveSong(applyUgTextToSong(song, text, mode));
            setUgOpen(false);
          }}
          onClose={() => setUgOpen(false)}
        />
      )}
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
          className="btn ai small"
          onClick={() => setUgOpen(true)}
          title={t(
            'Sing2Me cherche la version la mieux notée de cette partition et te la propose',
          )}
        >
          {t('★ Meilleure version ?')}
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
          onClick={() => {
            if (
              confirm(
                t('Supprimer « {title} » ? Le morceau sera aussi retiré des setlists.', {
                  title: song.title || t('(sans titre)'),
                }),
              )
            ) {
              deleteSong(song.id);
              onClose();
            }
          }}
        >
          <Icon name="trash" size={14} />
        </button>
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
          <select
            style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
            value={song.activeVersionId}
            title={t('Changer de version (solo, groupe…)')}
            onChange={(e) => saveSong(switchVersion(song, e.target.value))}
          >
            {song.versions.map((v) => {
              const bandName =
                v.bandId !== ''
                  ? (bands.find((b) => b.id === v.bandId)?.name ?? '')
                  : '';
              return (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {bandName !== '' ? ` · ${bandName}` : ''}
                  {v.key !== '' ? ` (${v.key})` : ''}
                </option>
              );
            })}
          </select>
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
