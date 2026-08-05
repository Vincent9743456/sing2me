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

import { normalizeTitle } from './lib/importer';
import { migrateSong } from './lib/model';
import { seedSongs } from './seed';
import {
  ArtistProfile,
  Band,
  Concert,
  defaultPrefs,
  emptyArtist,
  Prefs,
  Setlist,
  Song,
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
  /** Retire un morceau (titre normalisé) du répertoire d'un groupe. */
  recordBandRemoval: (bandId: string, key: string) => void;
  /** Annule un retrait (le morceau ré-intègre le répertoire du groupe). */
  clearBandRemoval: (bandId: string, key: string) => void;
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

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return withEmbeddedLiveKey({
        // migration automatique de l'ancien modèle à sections
        songs: (Array.isArray(parsed.songs) ? parsed.songs : []).map(migrateSong),
        setlists: (Array.isArray(parsed.setlists) ? parsed.setlists : []).map(
          (sl) => ({ ...sl, bandId: sl.bandId ?? '' }),
        ),
        concerts: (Array.isArray(parsed.concerts) ? parsed.concerts : []).map(
          (c) => ({ ...c, venueUrl: c.venueUrl ?? '', eventUrl: c.eventUrl ?? '' }),
        ),
        bands: (Array.isArray(parsed.bands) ? parsed.bands : []).map((b) => ({
          bio: '',
          photo: '',
          links: [],
          tipUrl: '',
          ...b,
        })),
        artist: { ...emptyArtist(), ...(parsed.artist ?? {}) },
        prefs: { ...defaultPrefs(), ...(parsed.prefs ?? {}) },
        deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
        bandRemovals: Array.isArray(parsed.bandRemovals)
          ? parsed.bandRemovals
          : [],
      });
    }
  } catch {
    // stockage illisible : on repart des données de démo
  }
  return withEmbeddedLiveKey({
    songs: seedSongs(),
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

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // quota dépassé : on ignore (les photos trop lourdes peuvent saturer)
      }
    }, 250);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [state]);

  const saveSong = useCallback((song: Song) => {
    const stamped = { ...song, updatedAt: new Date().toISOString() };
    setState((prev) => ({
      ...prev,
      songs: prev.songs.some((s) => s.id === stamped.id)
        ? prev.songs.map((s) => (s.id === stamped.id ? stamped : s))
        : [...prev.songs, stamped],
    }));
  }, []);

  const deleteSong = useCallback((songId: string) => {
    setState((prev) => {
      const song = prev.songs.find((s) => s.id === songId);
      return {
        ...prev,
        songs: prev.songs.filter((s) => s.id !== songId),
        setlists: prev.setlists.map((sl) => ({
          ...sl,
          items: sl.items.filter((it) => it.songId !== songId),
        })),
        deleted: bury(
          prev.deleted,
          songId,
          song ? normalizeTitle(song.title) : undefined,
        ),
      };
    });
  }, []);

  const saveSetlist = useCallback((setlist: Setlist) => {
    const stamped = { ...setlist, updatedAt: new Date().toISOString() };
    setState((prev) => ({
      ...prev,
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
    }));
  }, []);

  const savePrefs = useCallback((prefs: Prefs) => {
    setState((prev) => ({ ...prev, prefs }));
  }, []);

  const saveBand = useCallback((band: Band) => {
    setState((prev) => ({
      ...prev,
      bands: prev.bands.some((b) => b.id === band.id)
        ? prev.bands.map((b) => (b.id === band.id ? band : b))
        : [...prev.bands, band],
    }));
  }, []);

  const deleteBand = useCallback((bandId: string) => {
    setState((prev) => ({
      ...prev,
      bands: prev.bands.filter((b) => b.id !== bandId),
      setlists: prev.setlists.map((sl) =>
        sl.bandId === bandId ? { ...sl, bandId: '' } : sl,
      ),
      deleted: bury(prev.deleted, bandId),
    }));
  }, []);

  const hydrate = useCallback((next: AppState) => {
    setState(next);
  }, []);

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
        ...prev.bandRemovals.filter(
          (r) => !(r.bandId === bandId && r.key === key),
        ),
      ].slice(-499).concat({ bandId, key, at: new Date().toISOString() }),
    }));
  };
  const clearBandRemoval = (bandId: string, key: string) => {
    setState((prev) => ({
      ...prev,
      bandRemovals: prev.bandRemovals.filter(
        (r) => !(r.bandId === bandId && r.key === key),
      ),
    }));
  };

  const value: StoreValue = {
    ...state,
    hydrate,
    saveSong,
    deleteSong,
    saveSetlist,
    deleteSetlist,
    saveConcert,
    deleteConcert,
    saveArtist,
    savePrefs,
    saveBand,
    deleteBand,
    deleteNote,
    recordBandRemoval,
    clearBandRemoval,
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
