import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAccount } from '../components/Account';
import { Icon } from '../components/Icon';
import { SongBody } from '../components/SongBody';
import { applyUgTextToSong, UgUpgradeModal } from '../components/UgUpgrade';
import { AssignSheet, SongCollector } from '../components/SongPicker';
import { ConfirmSheet, MenuSheet } from '../components/Feedback';
import { Onboarding } from '../components/Onboarding';
import { EXAMPLE_TAG } from '../seed';
import { hintsOff, setHintsOff } from '../components/CoachMark';
import { Empty, TopBar } from '../components/ui';

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
    <Modal title={`« ${song.title || 'Sans titre'} » dans…`} onClose={onClose}>
      {sorted.length === 0 && (
        <p className="help">
          Pas encore de setlist — crée la première juste en dessous.
        </p>
      )}
      {sorted.map((sl) => {
        const has = sl.items.some((it) => it.songId === song.id);
        const bandName =
          (sl.bandId ?? '') !== ''
            ? (bands.find((b) => b.id === sl.bandId)?.name ?? '')
            : 'Solo';
        return (
          <div className="row" key={sl.id} onClick={() => toggle(sl)}>
            <div className="grow">
              <div className="title">{sl.name || '(sans nom)'}</div>
              <div className="sub">
                {[bandName, `${sl.items.length} morceau${sl.items.length > 1 ? 'x' : ''}`]
                  .filter((x) => x !== '')
                  .join(' · ')}
              </div>
            </div>
            {has ? (
              <span
                style={{ color: 'var(--accent)', fontWeight: 700 }}
                title="Cliquer pour retirer"
              >
                ✓ Dedans
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
          placeholder="Nouvelle setlist (nom)…"
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
          Créer
        </button>
      </div>
      <div className="spacer" />
      <button className="btn ghost block" onClick={onClose}>
        Fermer
      </button>
    </Modal>
  );
}
import { announceBandSong } from '../lib/bands';
import { fetchLive } from '../lib/live';
import { spellingForKey, transposeKeyName } from '../lib/chords';
import { normalizeTitle } from '../lib/importer';
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

/** Session active côté leader ? (équivalent notification pour les membres) */
function useLiveSession(): { mode: 'concert' | 'repet'; title: string } | null {
  const [session, setSession] = useState<{
    mode: 'concert' | 'repet';
    title: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      // Le leader (ON AIR actif sur cet appareil) n'a pas besoin de bannière.
      if ((localStorage.getItem('sing2me/onair') ?? 'off') !== 'off') {
        if (!cancelled) setSession(null);
        return;
      }
      try {
        const s = await fetchLive();
        if (cancelled) return;
        setSession(
          s.status !== 'off'
            ? {
                mode: s.mode,
                title: s.song?.title ?? s.bandSong?.title ?? '',
              }
            : null,
        );
      } catch {
        if (!cancelled) setSession(null);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 45000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return session;
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
  const session = useLiveSession();
  const account = useAccount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Menu « ⋯ » d'un morceau (Jouer / Modifier / Ajouter à… / Supprimer),
  // menu « ⋯ » de l'en-tête, et sous-feuilles ouvertes depuis ces menus.
  const [rowMenu, setRowMenu] = useState<Song | null>(null);
  const [rowAssign, setRowAssign] = useState<string | null>(null);
  const [rowDelete, setRowDelete] = useState<Song | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [confirmExamples, setConfirmExamples] = useState(false);
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
    const ro = new ResizeObserver(apply);
    if (el) ro.observe(el);
    const tb = document.querySelector('.topbar');
    if (tb) ro.observe(tb);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
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
          isRecent(s.createdAt),
      ).length,
    [songs],
  );
  // Propositions de groupe en attente d'acceptation (non importées tant
  // qu'on ne les a pas acceptées d'un clic).
  const [showPending, setShowPending] = useState(false);
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
      bandsBySong.set(s.id, set);
    });
    setlists.forEach((sl) => {
      const name = sl.name || '(sans nom)';
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
    const pinNew = sort !== 'artist' && !showNew && !showIdeas && !showPending;
    const freshRank = (s: (typeof songs)[number]) =>
      s.idea !== true &&
      (s.pendingBandId ?? '') === '' &&
      isRecent(s.createdAt);
    return [...songs]
      .sort((a, b) => {
        if (pinNew) {
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
        // Vue « Propositions » : uniquement les propositions en attente.
        if (showPending) return (s.pendingBandId ?? '') !== '';
        // Partout ailleurs, une proposition non acceptée reste invisible
        // dans la bibliothèque personnelle.
        if ((s.pendingBandId ?? '') !== '') return false;
        return showIdeas ? s.idea === true : s.idea !== true;
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
    showPending,
  ]);

  // Regroupement par artiste (tri « artiste » uniquement)
  const artistGroups = useMemo(() => {
    const groups: { name: string; songs: typeof filtered }[] = [];
    for (const s of filtered) {
      const name = s.artist.trim() || 'Sans artiste';
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
                    className={`row ${selectedId === song.id ? 'selected' : ''}`}
                    key={song.id}
                    onClick={() => {
                      openWithContext(song);
                      if (isSplitScreen()) setSelectedId(song.id);
                      else navigate(`/song/${song.id}`);
                    }}
                  >
                    <div className="grow">
                      <div className="title">{song.title || '(sans titre)'}</div>
                      <div className="sub">
                        {[
                          (song.tags ?? []).includes(EXAMPLE_TAG)
                            ? 'Exemple'
                            : '',
                          song.artist,
                          song.key,
                          song.tempo > 0 ? `${song.tempo} BPM` : '',
                          formatDuration(song.durationSec),
                        ]
                          .filter((x) => x !== '')
                          .join(' · ') || ' '}
                      </div>
                    </div>
                    {song.idea !== true && isRecent(song.createdAt) && (
                      <span className="newtag" title="Ajoutée cette semaine">
                        Nouveau
                      </span>
                    )}
                    {[...(membership.bandsBySong.get(song.id) ?? [])].map((bid) => {
                      const idx = bandIndex.get(bid) ?? 0;
                      const b = bands[idx];
                      const color = BAND_COLORS[idx % BAND_COLORS.length];
                      return (
                        <span
                          key={bid}
                          className="bandtag"
                          style={{ borderColor: color, color }}
                          title={`Groupe : ${b?.name || 'sans nom'} — cliquer pour filtrer`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBandFilter(bandFilter === bid ? null : bid);
                          }}
                        >
                          {bandInitials(b?.name ?? '')}
                        </span>
                      );
                    })}
                    {(membership.setlistsBySong.get(song.id) ?? []).length > 0 && (
                      <span
                        className="rowicon"
                        title={`Dans ${
                          (membership.setlistsBySong.get(song.id) ?? []).length
                        } setlist(s) : ${(
                          membership.setlistsBySong.get(song.id) ?? []
                        ).join(', ')}`}
                      >
                        <Icon name="clipboard" size={14} />
                      </span>
                    )}
                    {song.hearts > 0 && (
                      <span className="rowhearts" title="Cœurs reçus en concert">
                        <Icon name="heart" size={12} /> {song.hearts}
                      </span>
                    )}
                    {song.fanMessages.length > 0 && (
                      <span
                        className="rowhearts"
                        style={{ color: 'var(--accent)' }}
                        title="Messages du public"
                      >
                        <Icon name="message" size={12} /> {song.fanMessages.length}
                      </span>
                    )}
                    {(song.pendingBandId ?? '') !== '' && (
                      <button
                        className="btn small"
                        title={`Accepter « ${song.title || 'ce morceau'} » dans ta bibliothèque`}
                        onClick={(e) => {
                          e.stopPropagation();
                          saveSong({ ...song, pendingBandId: undefined });
                          if (pendingCount <= 1) setShowPending(false);
                        }}
                      >
                        ✓ Accepter
                      </button>
                    )}
                    <button
                      className="btn icon"
                      title="Actions"
                      aria-label={`Actions pour « ${song.title || 'ce morceau'} »`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRowMenu(song);
                      }}
                    >
                      <Icon name="more" size={20} />
                    </button>
                  </div>
  );

  return (
    <>
      <TopBar
        title="Morceaux"
        right={
          <button
            className="btn icon"
            title="Plus"
            aria-label="Plus d'actions"
            onClick={() => setHeaderMenu(true)}
          >
            <Icon name="more" size={20} />
          </button>
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
              ☁ Sauvegarde ta bibliothèque et retrouve-la sur tous tes
              appareils — compte gratuit.
            </span>
            <button className="btn small" onClick={() => navigate('/artist')}>
              Créer / me connecter
            </button>
            <button
              className="btn ghost small"
              title="Ne plus afficher"
              onClick={() => {
                localStorage.setItem('sing2me/accountNudge', '1');
                setNudgeHidden(true);
              }}
            >
              ✕
            </button>
          </div>
        )}
        {session && (
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderColor: 'var(--accent)',
            }}
          >
            <span style={{ flex: 1 }}>
              {session.mode === 'repet' ? '🎸 Répétition' : '🔴 Concert'} en
              cours
              {session.title !== '' && (
                <>
                  {' '}
                  — <strong>{session.title}</strong>
                </>
              )}
            </span>
            <button className="btn" onClick={() => navigate('/follow')}>
              Rejoindre 📡
            </button>
          </div>
        )}
        {/* Barre d'outils figée : recherche + tri + filtres toujours
            accessibles pendant le défilement de la bibliothèque. */}
        <div className="libtoolbar" ref={toolbarRef}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Rechercher un morceau, un artiste, un tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            value={sort}
            title="Trier la bibliothèque"
            style={{ width: 'auto', flexShrink: 0 }}
            onChange={(e) => changeSort(e.target.value as SortMode)}
          >
            <option value="title">Tri : titre</option>
            <option value="artist">Tri : artiste</option>
            <option value="recent">Tri : récents</option>
          </select>
        </div>
        {(bands.length > 0 ||
          ideaCount > 0 ||
          newCount > 0 ||
          pendingCount > 0) && (
          <>
            <div className="spacer" />
            <div className="chips filterchips">
              <button
                className={`chip ${bandFilter === null && !showIdeas && !showNew && !showPending ? '' : 'off'}`}
                onClick={() => {
                  setBandFilter(null);
                  setShowIdeas(false);
                  setShowNew(false);
                  setShowPending(false);
                }}
              >
                Toutes les partitions
              </button>
              {pendingCount > 0 && (
                <button
                  className={`chip ${showPending ? '' : 'off'}`}
                  title="Morceaux proposés par un groupe — à accepter avant qu'ils rejoignent ta bibliothèque"
                  onClick={() => {
                    setShowPending(!showPending);
                    setBandFilter(null);
                    setShowIdeas(false);
                    setShowNew(false);
                  }}
                >
                  📥 Propositions ({pendingCount})
                </button>
              )}
              {newCount > 0 && (
                <button
                  className={`chip ${showNew ? '' : 'off'}`}
                  title="Partitions ajoutées dans la semaine"
                  onClick={() => {
                    setShowNew(!showNew);
                    setBandFilter(null);
                    setShowIdeas(false);
                    setShowPending(false);
                  }}
                >
                  ✨ Nouveautés ({newCount})
                </button>
              )}
              {bands.length > 0 && (
                <button
                  className={`chip ${bandFilter === '' && !showIdeas && !showNew && !showPending ? '' : 'off'}`}
                  title="Répertoire jouable en solo (tous les morceaux par défaut, sauf déqualifiés depuis leur fiche)"
                  onClick={() => {
                    setBandFilter('');
                    setShowIdeas(false);
                    setShowNew(false);
                    setShowPending(false);
                  }}
                >
                  <Icon name="mic" size={12} /> Solo
                </button>
              )}
              {bands.map((b, i) => (
                <button
                  key={b.id}
                  className={`chip ${bandFilter === b.id && !showIdeas && !showNew && !showPending ? '' : 'off'}`}
                  onClick={() => {
                    setBandFilter(bandFilter === b.id ? null : b.id);
                    setShowIdeas(false);
                    setShowNew(false);
                    setShowPending(false);
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
                  {b.name || 'Groupe sans nom'}
                </button>
              ))}
              {ideaCount > 0 && (
                <button
                  className={`chip ${showIdeas ? '' : 'off'}`}
                  title="Morceaux importés non encore validés — réserve à travailler"
                  onClick={() => {
                    setShowIdeas(!showIdeas);
                    setBandFilter(null);
                    setShowNew(false);
                    setShowPending(false);
                  }}
                >
                  💡 Idées ({ideaCount})
                </button>
              )}
            </div>
            {showIdeas && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                Réserve à travailler : jouables partout, mais pas encore
                validées dans la bibliothèque — ouvre un morceau pour le
                valider ✓ ou le supprimer.
              </p>
            )}
            {showPending && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                Morceaux proposés par tes groupes : ils n'entreront dans ta
                bibliothèque qu'une fois acceptés. Accepte d'un clic ✓ ceux
                que tu veux garder — les autres restent ici sans t'encombrer.
              </p>
            )}
            {showNew && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                Partitions ajoutées cette semaine — {filtered.length} morceau
                {filtered.length > 1 ? 'x' : ''}.
              </p>
            )}
            {!showIdeas && !showNew && bandFilter !== null && (
              <p className="help" style={{ margin: '6px 0 0' }}>
                Filtre actif :{' '}
                <strong style={{ color: 'var(--accent)' }}>
                  {bandFilter === ''
                    ? 'Solo'
                    : (bands.find((b) => b.id === bandFilter)?.name ?? 'Groupe')}
                </strong>{' '}
                — {filtered.length} morceau{filtered.length > 1 ? 'x' : ''} ·{' '}
                <button
                  className="btn ghost small"
                  onClick={() => setBandFilter(null)}
                >
                  Tout afficher
                </button>
              </p>
            )}
          </>
        )}
        </div>
        <Onboarding />
        {allTags.length > 0 && (
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
        <div className={`libsplit${selectedId ? ' hasdetail' : ''}`}>
          <div>
            {filtered.length === 0 ? (
              songs.length === 0 ? (
                <Empty>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>
                    Importe tes partitions
                  </div>
                  Colle un texte, un lien Ultimate Guitar, un PDF ou un fichier
                  Word — Sing2Me met tout au propre.
                  <div className="spacer" />
                  <button
                    className="btn"
                    onClick={() => navigate('/import')}
                  >
                    <Icon name="import" size={16} /> Importer mon premier morceau
                  </button>
                </Empty>
              ) : (
                <Empty>Aucun morceau ne correspond à ta recherche.</Empty>
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
          title="Ajouter des morceaux au répertoire du groupe"
          onClick={() => setBandCollect(true)}
        >
          <Icon name="plus" size={17} /> Ajouter des morceaux
        </button>
      ) : (
        <button
          className="btn libfab"
          title="Importer un morceau (texte, lien Ultimate Guitar, PDF, Word…)"
          onClick={() => navigate('/import')}
        >
          <Icon name="import" size={17} /> Importer
        </button>
      )}
      {bandCollect && bandFilter !== null && bandFilter !== '' && (
        <SongCollector
          title={`Ajouter au répertoire — ${
            bands.find((b) => b.id === bandFilter)?.name || 'groupe'
          }`}
          alreadyIn={songs
            .filter((s) => versionForBand(s, bandFilter) !== null)
            .map((s) => s.id)}
          confirmLabel={(n) => `Ajouter ${n} morceau${n > 1 ? 'x' : ''} au répertoire`}
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
              clearBandRemoval(b.id, normalizeTitle(s.title));
              void announceBandSong(
                b.cloudId,
                prefs.userName || artist.name || 'Moi',
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
          title={rowMenu.title || 'Ce morceau'}
          items={[
            {
              label: 'Jouer (mode scène)',
              icon: 'play',
              onClick: () => navigate(`/stage/song/${rowMenu.id}`),
            },
            {
              label: 'Modifier',
              icon: 'edit',
              onClick: () => navigate(`/song/${rowMenu.id}/edit`),
            },
            {
              label: 'Ajouter à…',
              icon: 'plus',
              onClick: () => setRowAssign(rowMenu.id),
            },
            {
              label: 'Supprimer',
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
          title={`Supprimer « ${rowDelete.title || 'ce morceau'} » ?`}
          message="Le morceau sera aussi retiré des setlists."
          confirmLabel="Supprimer"
          danger
          onConfirm={() => {
            deleteSong(rowDelete.id);
            if (selectedId === rowDelete.id) setSelectedId(null);
          }}
          onClose={() => setRowDelete(null)}
        />
      )}

      {/* Menu « ⋯ » de l'en-tête : création manuelle (l'action principale
          reste « Importer »). */}
      {headerMenu && (
        <MenuSheet
          items={[
            {
              label: 'Nouveau morceau vide',
              icon: 'edit',
              onClick: () => navigate('/song/new'),
            },
            ...(songs.some((s) => (s.tags ?? []).includes(EXAMPLE_TAG))
              ? [
                  {
                    label: 'Supprimer les exemples',
                    icon: 'trash' as const,
                    danger: true,
                    onClick: () => setConfirmExamples(true),
                  },
                ]
              : []),
            {
              label: hintsOff() ? 'Réafficher les aides' : 'Masquer toutes les aides',
              icon: 'eye' as const,
              onClick: () => setHintsOff(!hintsOff()),
            },
          ]}
          onClose={() => setHeaderMenu(false)}
        />
      )}
      {confirmExamples && (
        <ConfirmSheet
          title="Supprimer les morceaux d'exemple ?"
          message="Les 2 morceaux d'exemple et « Ma première setlist (exemple) » seront retirés. Tes propres morceaux ne sont pas touchés."
          confirmLabel="Supprimer les exemples"
          danger
          onConfirm={() => {
            songs
              .filter((s) => (s.tags ?? []).includes(EXAMPLE_TAG))
              .forEach((s) => deleteSong(s.id));
            setlists
              .filter((sl) => /\(exemple\)/i.test(sl.name))
              .forEach((sl) => deleteSetlist(sl.id));
          }}
          onClose={() => setConfirmExamples(false)}
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
  const author = prefs.userName || artist.name || 'Moi';
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
          {song.title || '(sans titre)'}
          {song.artist !== '' && (
            <span className="stauthor"> — {song.artist}</span>
          )}
        </strong>
        <button
          className="btn icon"
          aria-label="Fermer l'aperçu"
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
          Ouvrir
        </button>
        <button
          className="btn ghost small"
          onClick={() => navigate(`/song/${song.id}/edit`)}
          title="Modifier la partition"
        >
          <Icon name="edit" size={14} /> Modifier
        </button>
        <button
          className="btn ai small"
          onClick={() => setUgOpen(true)}
          title="Sing2Me cherche la version la mieux notée de cette partition et te la propose"
        >
          ★ Meilleure version ?
        </button>
        <button
          className="btn ghost small"
          onClick={() => navigate(`/stage/song/${song.id}`)}
          title="Mode scène"
        >
          <Icon name="play" size={14} /> Scène
        </button>
        <button
          className="btn ghost small"
          title="Ajouter à une setlist"
          onClick={() => onPickSetlist(song.id)}
        >
          <Icon name="list" size={14} /> Setlist
        </button>
        <button
          className="btn ghost small"
          style={{ color: 'var(--danger)' }}
          title="Supprimer ce morceau"
          aria-label="Supprimer ce morceau"
          onClick={() => {
            if (
              confirm(
                `Supprimer « ${song.title || '(sans titre)'} » ? ` +
                  'Le morceau sera aussi retiré des setlists.',
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
            title="Changer de version (solo, groupe…)"
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
        <span className="help">Dans :</span>
        {memberBands.length === 0 && memberSetlists.length === 0 && (
          <span className="help" style={{ margin: 0 }}>
            aucun groupe ni setlist
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
            {b.name || 'Groupe sans nom'}
          </span>
        ))}
        {memberSetlists.map((sl) => (
          <span key={sl.id} className="chip static">
            {sl.name || '(sans nom)'}
          </span>
        ))}
        <button
          className="chip off"
          title="Ajouter ce morceau à un groupe ou une setlist"
          onClick={() => setAssocOpen(true)}
        >
          ＋ Ajouter à…
        </button>
      </div>

      {assocOpen && (
        <AssignSheet songId={song.id} onClose={() => setAssocOpen(false)} />
      )}
      {!displayReal && (
        <div className="transpose" style={{ marginBottom: 10 }}>
          <span className="lbl">Transposer</span>
          <div className="stepper">
            <button
              title="Accords plus bas (capo +1) — la tonalité réelle ne change pas"
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
                  : `${shift > 6 ? shift - 12 : shift} ½t`}
            </span>
            <button
              title="Accords plus haut (capo −1)"
              onClick={() => {
                setShift((s) => s + 1);
                if (viewCapo > 0) setViewCapo((c) => c - 1);
              }}
            >
              ♯
            </button>
          </div>
          <span className="lbl">Capo</span>
          <div className="stepper">
            <button
              title="Le capo change ce qui sonne, pas les accords affichés"
              onClick={() => setViewCapo((c) => Math.max(0, c - 1))}
            >
              −
            </button>
            <span>{viewCapo}</span>
            <button onClick={() => setViewCapo((c) => Math.min(11, c + 1))}>
              ＋
            </button>
          </div>
          {realKeyShown !== '' && (
            <span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              🔊 sonne en{' '}
              <strong style={{ color: 'var(--text)' }}>{realKeyShown}</strong>
            </span>
          )}
          {(shift !== 0 || viewCapo !== song.capo) && (
            <button
              className="btn ghost small"
              onClick={() => {
                setShift(0);
                setViewCapo(song.capo);
              }}
            >
              Réinitialiser
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
