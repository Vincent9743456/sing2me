import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAccount } from '../components/Account';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Logo';
import { SongBody } from '../components/SongBody';
import { applyUgTextToSong, UgUpgradeModal } from '../components/UgUpgrade';
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
  const { songs, deleteSong, bands, setlists, saveSong } = useStore();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  // null = tous · '' = solo (aucun groupe) · sinon id du groupe
  const [bandFilter, setBandFilter] = useState<string | null>(null);
  const session = useLiveSession();
  const account = useAccount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Réserve d'« idées » : morceaux importés non encore validés
  const [showIdeas, setShowIdeas] = useState(false);
  const ideaCount = useMemo(
    () => songs.filter((s) => s.idea === true).length,
    [songs],
  );
  // Nouveautés : partitions ajoutées dans la semaine (repérage rapide)
  const [showNew, setShowNew] = useState(false);
  const newCount = useMemo(
    () => songs.filter((s) => s.idea !== true && isRecent(s.createdAt)).length,
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
      .filter((s) => (showIdeas ? s.idea === true : s.idea !== true))
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
  }, [songs, query, tag, sort, bandFilter, membership, showIdeas, showNew]);

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
                    <button
                      className="btn ghost small"
                      title="Ajouter à une setlist"
                      aria-label="Ajouter à une setlist"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPickerFor(song.id);
                      }}
                    >
                      <Icon name="list" size={15} />
                    </button>
                    <button
                      className="btn ghost small"
                      style={{ color: 'var(--danger)' }}
                      title="Supprimer ce morceau"
                      aria-label="Supprimer ce morceau"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          confirm(
                            `Supprimer « ${song.title || '(sans titre)'} » ? ` +
                              'Le morceau sera aussi retiré des setlists.',
                          )
                        ) {
                          deleteSong(song.id);
                          if (selectedId === song.id) setSelectedId(null);
                        }
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                    <span className="chevron">
                      <Icon name="chevron-right" size={18} />
                    </span>
                  </div>
  );

  return (
    <>
      <TopBar title={<Brand size={24} />} />
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
        <button
          className="btn block"
          onClick={() => navigate('/import')}
        >
          <Icon name="plus" size={17} /> Ajouter un morceau
        </button>
        <div className="spacer" />
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
        {(bands.length > 0 || ideaCount > 0 || newCount > 0) && (
          <>
            <div className="spacer" />
            <div className="chips filterchips">
              <button
                className={`chip ${bandFilter === null && !showIdeas && !showNew ? '' : 'off'}`}
                onClick={() => {
                  setBandFilter(null);
                  setShowIdeas(false);
                  setShowNew(false);
                }}
              >
                Toutes les partitions
              </button>
              {newCount > 0 && (
                <button
                  className={`chip ${showNew ? '' : 'off'}`}
                  title="Partitions ajoutées dans la semaine"
                  onClick={() => {
                    setShowNew(!showNew);
                    setBandFilter(null);
                    setShowIdeas(false);
                  }}
                >
                  ✨ Nouveautés ({newCount})
                </button>
              )}
              {bands.length > 0 && (
                <button
                  className={`chip ${bandFilter === '' && !showIdeas && !showNew ? '' : 'off'}`}
                  title="Répertoire jouable en solo (tous les morceaux par défaut, sauf déqualifiés depuis leur fiche)"
                  onClick={() => {
                    setBandFilter('');
                    setShowIdeas(false);
                    setShowNew(false);
                  }}
                >
                  <Icon name="mic" size={12} /> Solo
                </button>
              )}
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
        <div className="libsplit">
          <div>
            {filtered.length === 0 ? (
              <Empty>
                {songs.length === 0 ? (
                  <>
                    Ta bibliothèque est vide.
                    <br />
                    Importe tes morceaux ou crée-en un (boutons en haut).
                  </>
                ) : (
                  'Aucun morceau ne correspond à ta recherche.'
                )}
              </Empty>
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

      {pickerFor !== null && (
        <SetlistPicker songId={pickerFor} onClose={() => setPickerFor(null)} />
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
    recordBandRemoval,
    clearBandRemoval,
  } = useStore();
  const author = prefs.userName || artist.name || 'Moi';
  const song = id ? songs.find((s) => s.id === id) : undefined;
  const paneRef = useRef<HTMLElement | null>(null);
  const [ugOpen, setUgOpen] = useState(false);

  // Mêmes réglages de lecture que la fiche : tonalité/capo mémorisés
  // par morceau + version (sur cet appareil).
  const viewPref = useMemo(() => {
    if (!song) return null;
    try {
      const raw = localStorage.getItem(
        `sing2me/viewkey/${song.id}/${song.activeVersionId}`,
      );
      if (raw === null) return null;
      const v = JSON.parse(raw) as { shift?: number; capo?: number };
      return {
        shift:
          typeof v.shift === 'number' ? ((v.shift % 12) + 12) % 12 : 0,
        capo: typeof v.capo === 'number' ? v.capo : song.capo,
      };
    } catch {
      return null;
    }
  }, [song, song?.id, song?.activeVersionId]);
  const shift = viewPref?.shift ?? 0;
  const viewCapo = viewPref?.capo ?? song?.capo ?? 0;
  const shownKey =
    song && song.key !== '' ? transposeKeyName(song.key, shift) : '';
  const preferFlat = spellingForKey(shownKey);

  // Chaque morceau affiché commence à son début (pas de scroll hérité)
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
    setUgOpen(false);
  }, [id]);

  if (!song) {
    return (
      <aside className="libpreview empty-pane" aria-hidden="true">
        <p className="help" style={{ textAlign: 'center' }}>
          Sélectionne un morceau pour l'afficher ici.
        </p>
      </aside>
    );
  }
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
          className="btn ghost small"
          onClick={() => setUgOpen(true)}
          title="Sing2Me cherche sur Ultimate Guitar l'équivalent le mieux noté de cette partition"
        >
          ★ Mieux sur UG ?
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
            shownKey !== ''
              ? `Tonalité ${shownKey}${shift !== 0 ? ' (transposée)' : ''}`
              : '',
            song.tempo > 0 ? `${song.tempo} BPM` : '',
            viewCapo > 0 ? `Capo ${viewCapo}` : '',
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
      {bands.length > 0 && (
        <div
          className="hstack"
          style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}
        >
          <span className="help">Groupes :</span>
          {bands.map((b, i) => {
            const v = versionForBand(song, b.id);
            const active = v !== null;
            return (
              <button
                key={b.id}
                className={`chip ${active ? '' : 'off'}`}
                title={
                  active
                    ? `Ce morceau a une version pour ${b.name || 'ce groupe'} — cliquer pour la retirer`
                    : `Créer la version « ${b.name || 'Groupe'} » de ce morceau (copie de l'actuelle)`
                }
                onClick={() => {
                  if (active && v) {
                    if (
                      song.versions.length <= 1 ||
                      !confirm(
                        `Retirer « ${song.title} » du répertoire de ` +
                          `${b.name || 'ce groupe'} ? Le morceau sortira du ` +
                          'répertoire du groupe pour TOUS les membres — ' +
                          'chacun garde la partition dans sa bibliothèque ' +
                          'personnelle.',
                      )
                    )
                      return;
                    saveSong(removeVersion(song, v.id));
                    // Retrait PROPAGÉ : le morceau sort du répertoire du
                    // groupe pour tous les membres (chacun garde sa
                    // partition en personnel).
                    recordBandRemoval(b.id, normalizeTitle(song.title));
                  } else {
                    // Version créée en arrière-plan : le morceau RESTE sur
                    // sa version affichée (pas de bascule surprise).
                    const prev = song.activeVersionId;
                    saveSong(
                      switchVersion(
                        duplicateVersion(song, b.name || 'Groupe', b.id),
                        prev,
                      ),
                    );
                    // Ré-intégration : on annule un éventuel retrait
                    clearBandRemoval(b.id, normalizeTitle(song.title));
                    // Le groupe est informé (best-effort si publié + connecté)
                    void announceBandSong(
                      b.cloudId,
                      author,
                      song.title,
                      song.artist,
                    );
                  }
                }}
              >
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
            );
          })}
        </div>
      )}
      <SongBody
        song={song}
        view="complete"
        semitones={shift}
        capo={viewCapo}
        preferFlat={preferFlat}
      />
    </aside>
  );
}
