/**
 * Mode ON AIR : bouton global + panneau de contrôle du direct.
 * Quand le direct est actif, la partition courante (paroles seules)
 * est publiée pour les spectateurs (page /#/live).
 */
import QRCode from 'qrcode';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  fetchLive,
  fetchLiveStats,
  fetchMessages,
  heartTotals,
  LiveMode,
  LiveSong,
  LiveStatus,
  liveUrl,
  messagesBySong,
  pushBandSong,
  pushLive,
} from '../lib/live';
import { bandToProfile } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { Modal } from './ui';

interface OnAirValue {
  status: LiveStatus;
  /** La page courante déclare ce que voit le chanteur. */
  setCurrent: (song: LiveSong | null, meta?: { key: string }) => void;
}

const OnAirContext = createContext<OnAirValue | null>(null);
const StatusContext = createContext<{
  status: LiveStatus;
  hearts: number;
  openPanel: () => void;
} | null>(null);

export function OnAirProvider({ children }: { children: React.ReactNode }) {
  const { prefs, artist, bands, songs, saveSong, concerts } = useStore();

  // Concert du jour (planifié dans l'onglet Concerts) → tague les interactions
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayConcert = concerts
    .filter((c) => c.date === todayStr)
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  const [hearts, setHearts] = useState(0);
  const [who, setWho] = useState<string>(
    () => localStorage.getItem('sing2me/onairWho') ?? 'solo',
  );
  const [mode, setMode] = useState<LiveMode>(() =>
    localStorage.getItem('sing2me/onairMode') === 'repet' ? 'repet' : 'concert',
  );

  useEffect(() => {
    localStorage.setItem('sing2me/onairMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('sing2me/onairWho', who);
  }, [who]);

  const performerBase =
    who === 'solo'
      ? artist.name !== ''
        ? artist
        : null
      : (() => {
          const b = bands.find((x) => x.id === who);
          return b ? bandToProfile(b) : artist.name !== '' ? artist : null;
        })();
  // L'écran public suit TES réglages, même en groupe ; le matériel
  // (privé) ne part jamais dans l'état du direct.
  const performer = performerBase
    ? { ...performerBase, gear: undefined, publicScreen: artist.publicScreen }
    : null;
  const [status, setStatus] = useState<LiveStatus>(
    () => (localStorage.getItem('sing2me/onair') as LiveStatus) || 'off',
  );
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const currentRef = useRef<LiveSong | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    localStorage.setItem('sing2me/onair', status);
  }, [status]);

  // Pendant le direct : le musicien voit les ❤ arriver en temps réel
  useEffect(() => {
    if (status !== 'on') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchLive();
        if (!cancelled) setHearts(s.hearts);
      } catch {
        // silencieux
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status]);

  // Reporte les totaux de ❤ (historique des directs) dans la bibliothèque.
  const syncHearts = useCallback(async () => {
    try {
      const totals = heartTotals(await fetchLiveStats(prefs.liveKey));
      const bySong = messagesBySong(await fetchMessages(prefs.liveKey));
      for (const s of songs) {
        const total = totals.get(s.title);
        const msgs = bySong.get(s.title);
        const known = new Set(s.fanMessages.map((m) => m.id));
        const fresh = msgs
          .map((m) => ({
            id: `${m.created_at}|${m.author}|${m.body.slice(0, 40)}`,
            author: m.author,
            text: m.body,
            createdAt: m.created_at,
          }))
          .filter((m) => !known.has(m.id));
        const heartsChanged = total !== undefined && total !== s.hearts;
        if (heartsChanged || fresh.length > 0) {
          saveSong({
            ...s,
            hearts: heartsChanged ? (total as number) : s.hearts,
            fanMessages: [...s.fanMessages, ...fresh],
          });
        }
      }
    } catch {
      // silencieux : la synchro retentera au prochain arrêt de direct
    }
  }, [prefs.liveKey, songs, saveSong]);

  const lastMetaRef = useRef<{ title: string; artist: string; key: string } | null>(
    null,
  );

  const setCurrent = useCallback(
    (song: LiveSong | null, meta?: { key: string }) => {
      currentRef.current = song;
      if (song) {
        lastMetaRef.current = {
          title: song.title,
          artist: song.artist,
          key: meta?.key ?? '',
        };
      }
      if (statusRef.current === 'on' && song) {
        pushLive(prefs.liveKey, { status: 'on', song }).catch(() => {
          // publication silencieuse : l'erreur détaillée apparaît dans le panneau
        });
      }
      // Synchro du groupe : automatique, toujours active (best-effort).
      // Sans réseau, chaque musicien garde la main sur sa bibliothèque locale.
      if (song) {
        void pushBandSong(prefs.liveKey, lastMetaRef.current);
      }
    },
    [prefs.liveKey],
  );

  async function act(next: LiveStatus) {
    setBusy(true);
    setError(null);
    try {
      await pushLive(prefs.liveKey, {
        status: next,
        mode,
        song: next === 'off' ? null : currentRef.current,
        bandSong: next === 'off' ? null : lastMetaRef.current,
        artist: performer,
        concert:
          next === 'off'
            ? null
            : todayConcert
              ? {
                  id: todayConcert.id,
                  title: todayConcert.title,
                  date: todayConcert.date,
                }
              : null,
      });
      setStatus(next);
      if (next === 'off') {
        setPanel(false);
        setHearts(0);
        // les ❤ de la dernière chanson viennent d'être archivés côté serveur
        window.setTimeout(() => void syncHearts(), 1200);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function showQr() {
    try {
      setQr(await QRCode.toDataURL(liveUrl(), { width: 440, margin: 1 }));
    } catch {
      setQr(null);
    }
  }

  return (
    <OnAirContext.Provider value={{ status, setCurrent }}>
      <StatusContext.Provider
        value={{ status, hearts, openPanel: () => setPanel(true) }}
      >
        {children}
        {panel && (
          <Modal title="Mode ON AIR" onClose={() => setPanel(false)}>
            <p className="help" style={{ textAlign: 'center' }}>
              {status === 'on' &&
                (mode === 'repet'
                  ? '🎸 Répétition en cours — seuls les musiciens voient le morceau ; le public, rien.'
                  : '🔴 En direct — le public voit les paroles, les musiciens leur partition.')}
              {status === 'pause' &&
                '⏸ En pause — le public voit un écran d’attente.'}
              {status === 'off' &&
                'Hors session — le QR ne montre que ta page artiste.'}
            </p>
            {status === 'off' && todayConcert && (
              <p className="help" style={{ textAlign: 'center' }}>
                🎪 Concert détecté : <strong>{todayConcert.title}</strong> — les
                ❤ et messages lui seront rattachés.
              </p>
            )}
            {status === 'off' && (
              <div className="field" style={{ maxWidth: 320, margin: '0 auto 6px' }}>
                <label>Type de session</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as LiveMode)}
                >
                  <option value="concert">
                    🎤 Concert — public + musiciens
                  </option>
                  <option value="repet">
                    🎸 Répétition — musiciens seulement
                  </option>
                </select>
              </div>
            )}
            {status === 'off' && (
              <div className="field" style={{ maxWidth: 320, margin: '0 auto 6px' }}>
                <label>Qui joue ce soir ?</label>
                <select value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="solo">
                    {artist.name !== '' ? `${artist.name} (solo)` : 'Moi (solo)'}
                  </option>
                  {bands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name || 'Groupe sans nom'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'center',
                margin: '14px 0',
              }}
            >
              {status === 'off' && (
                <button className="btn" disabled={busy} onClick={() => act('on')}>
                  {mode === 'repet'
                    ? '🎸 Démarrer la répétition'
                    : '🔴 Démarrer le direct'}
                </button>
              )}
              {status === 'on' && (
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => act('pause')}
                >
                  ⏸ Pause
                </button>
              )}
              {status === 'pause' && (
                <button className="btn" disabled={busy} onClick={() => act('on')}>
                  ▶ Reprendre
                </button>
              )}
              {status !== 'off' && (
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => act('off')}
                >
                  ⏹ Arrêter
                </button>
              )}
              <button className="btn ghost" onClick={() => void showQr()}>
                Mon QR unique
              </button>
            </div>
            {qr && (
              <div className="qrbox">
                <img src={qr} alt="QR unique de tes sessions" />
                <div className="linkbox">{liveUrl()}</div>
                <p className="help" style={{ textAlign: 'center' }}>
                  <strong>Un seul QR pour tout, à imprimer une fois.</strong>
                  <br />
                  Concert : le public voit les paroles, un musicien (du groupe
                  ou de passage) touche « 🎸 Je joue » pour sa partition.
                  Répétition : seuls les musiciens voient le morceau. Hors
                  session : ta page artiste.
                </p>
              </div>
            )}
            {error && (
              <p style={{ color: 'var(--danger)', textAlign: 'center' }}>
                {error}
              </p>
            )}
            <p className="help" style={{ textAlign: 'center', margin: '4px 0 10px' }}>
              📡 Synchro du groupe <strong>automatique</strong> : les musiciens
              qui suivent voient ton morceau, dans leur vue et leur tonalité.
              Sans réseau, chacun reprend la main sur sa bibliothèque locale.
            </p>
            <p className="help" style={{ textAlign: 'center' }}>
              Tu es musicien du groupe ?{' '}
              <a
                href="#/follow"
                style={{ color: 'var(--accent)' }}
                onClick={() => setPanel(false)}
              >
                Suivre le morceau en cours →
              </a>
            </p>
            {prefs.liveKey.trim() === '' && (
              <p className="help" style={{ textAlign: 'center' }}>
                ⚠ Renseigne ta clé On Air dans l'onglet Artiste (identique à la
                variable LIVE_KEY configurée sur Vercel).
              </p>
            )}
          </Modal>
        )}
      </StatusContext.Provider>
    </OnAirContext.Provider>
  );
}

/** Bouton flottant, présent sur toutes les pages du musicien. */
export function OnAirButton() {
  const ctx = useContext(StatusContext);
  if (!ctx) return null;
  const { status, hearts, openPanel } = ctx;
  return (
    <button
      className={`onair ${status}`}
      onClick={openPanel}
      title="Mode ON AIR (direct public)"
    >
      {status === 'on' ? (
        <>
          <span className="dot" /> ON AIR
          {hearts > 0 && <span className="onairhearts">❤ {hearts}</span>}
        </>
      ) : status === 'pause' ? (
        '⏸ ON AIR'
      ) : (
        '◦ ON AIR'
      )}
    </button>
  );
}

/**
 * À appeler depuis les pages de partition : déclare le morceau
 * que voit le chanteur (publié automatiquement si le direct est actif).
 */
export function useOnAirSong(song: LiveSong | null, songKey = '') {
  const ctx = useContext(OnAirContext);
  const setCurrent = ctx?.setCurrent;
  const key = song
    ? `${song.title}|${song.artist}|${song.lyrics.length}|${songKey}`
    : '';
  useEffect(() => {
    if (setCurrent) setCurrent(song, { key: songKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrent, key]);
}
