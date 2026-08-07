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
  LivePublicSong,
  LiveSong,
  LiveStatus,
  currentLiveRef,
  liveUrl,
  messagesBySong,
  pushBandSong,
  pushLive,
  pushSetlist,
} from '../lib/live';
import { bandToProfile } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { Modal } from './ui';

/**
 * « Selon le contexte » : d'après la page sous le panneau ON AIR, renvoie la
 * route du mode scène à ouvrir en passant en direct — la setlist courante
 * (vue, édition, aperçu ou lecture d'un de ses morceaux) ou le morceau
 * courant. Ailleurs (bibliothèque, groupe…) : null (rien ne s'ouvre).
 */
function stageTargetFromHash(hash: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = hash.match(/^#\/setlist\/([^/]+)(?:\/song\/\d+|\/edit|\/apercu)?$/))) {
    return `/stage/${m[1]}`;
  }
  if ((m = hash.match(/^#\/song\/([^/]+?)(?:\/edit)?$/))) {
    return `/stage/song/${m[1]}`;
  }
  return null;
}

interface OnAirValue {
  status: LiveStatus;
  /** Session en cours : concert (public) ou répétition (musiciens seuls). */
  mode: LiveMode;
  /** La page courante déclare ce que voit le chanteur. */
  setCurrent: (song: LiveSong | null, meta?: { key: string }) => void;
  /** Une page de setlist déclare la setlist à diffuser au public. */
  setSetlist: (songs: LivePublicSong[] | null) => void;
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
  const [codeCopied, setCodeCopied] = useState(false);
  const currentRef = useRef<LiveSong | null>(null);
  const setlistRef = useRef<LivePublicSong[] | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  // Une page de setlist (mode scène ou lecture d'un morceau de la setlist)
  // déclare la setlist à diffuser : le public peut alors la parcourir
  // lui-même. Poussée si le direct est actif. L'effacement est différé pour
  // ne pas clignoter quand on passe d'un morceau à l'autre de la setlist.
  const setlistClearTimer = useRef<number | null>(null);
  const setSetlist = useCallback(
    (songs: LivePublicSong[] | null) => {
      setlistRef.current = songs;
      if (statusRef.current !== 'on') return;
      if (songs && songs.length > 0) {
        if (setlistClearTimer.current !== null) {
          window.clearTimeout(setlistClearTimer.current);
          setlistClearTimer.current = null;
        }
        void pushSetlist(prefs.liveKey, songs);
      } else {
        if (setlistClearTimer.current !== null) {
          window.clearTimeout(setlistClearTimer.current);
        }
        setlistClearTimer.current = window.setTimeout(() => {
          setlistClearTimer.current = null;
          if (
            (setlistRef.current?.length ?? 0) === 0 &&
            statusRef.current === 'on'
          ) {
            void pushSetlist(prefs.liveKey, null);
          }
        }, 900);
      }
    },
    [prefs.liveKey],
  );

  useEffect(() => {
    localStorage.setItem('sing2me/onair', status);
  }, [status]);

  // Pendant le direct : le musicien voit les ❤ arriver en temps réel
  useEffect(() => {
    if (status !== 'on') return;
    let cancelled = false;
    const tick = async () => {
      try {
        // Multi-live : le leader sonde SON direct (via son code de salon).
        const s = await fetchLive(currentLiveRef()?.joinCode ?? '');
        if (cancelled) return;
        setHearts(s.hearts);
        // Le serveur peut couper un direct oublié (4 h, ou 1 h sans
        // partition) : on répercute l'arrêt sur l'UI du leader.
        if (s.status === 'off') {
          setStatus('off');
          setPanel(false);
        }
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

  // Diffusion différée de « plus aucune chanson » : évite un clignotement
  // vers l'écran d'accueil quand on passe simplement d'une chanson à une autre.
  const clearTimer = useRef<number | null>(null);

  const setCurrent = useCallback(
    (song: LiveSong | null, meta?: { key: string }) => {
      currentRef.current = song;
      if (song) {
        lastMetaRef.current = {
          title: song.title,
          artist: song.artist,
          key: meta?.key ?? '',
        };
        if (clearTimer.current !== null) {
          window.clearTimeout(clearTimer.current);
          clearTimer.current = null;
        }
        if (statusRef.current === 'on') {
          pushLive(prefs.liveKey, { status: 'on', song }).catch(() => {
            // publication silencieuse : l'erreur détaillée apparaît dans le panneau
          });
        }
        // Synchro du groupe : automatique, toujours active (best-effort).
        // Sans réseau, chaque musicien garde la main sur sa bibliothèque locale.
        void pushBandSong(prefs.liveKey, lastMetaRef.current);
      } else {
        // Aucune chanson affichée : RÈGLE — tout le monde voit alors l'écran
        // d'accueil. Publié après un court délai (annulé si une nouvelle
        // chanson arrive) pour ne pas clignoter entre deux morceaux.
        if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
        clearTimer.current = window.setTimeout(() => {
          clearTimer.current = null;
          if (currentRef.current === null && statusRef.current === 'on') {
            pushLive(prefs.liveKey, { status: 'on', song: null }).catch(() => {});
            void pushBandSong(prefs.liveKey, null);
          }
        }, 600);
      }
    },
    [prefs.liveKey],
  );

  async function act(next: LiveStatus) {
    setBusy(true);
    setError(null);
    try {
      // Portée « mon groupe » : on tague le direct avec le cloudId du groupe
      // qui joue (vide en solo → n'apparaît chez aucun autre membre) et le nom
      // de la personne qui lance (affiché dans la bannière des membres).
      const liveBand = who === 'solo' ? null : bands.find((x) => x.id === who);
      await pushLive(prefs.liveKey, {
        status: next,
        mode,
        song: next === 'off' ? null : currentRef.current,
        bandSong: next === 'off' ? null : lastMetaRef.current,
        setlist: next === 'off' ? null : setlistRef.current,
        artist: performer,
        bandId: next === 'off' ? '' : (liveBand?.cloudId ?? ''),
        startedBy: next === 'off' ? '' : artist.name,
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
      } else if (next === 'on') {
        // Passage en direct → mode scène « selon le contexte » : le panneau est
        // une modale par-dessus la page courante ; on ouvre la scène de la
        // setlist ou du morceau sous-jacent (rien ailleurs).
        const target = stageTargetFromHash(location.hash);
        if (target) {
          setPanel(false);
          navigate(target);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function showQr() {
    try {
      setQr(
        await QRCode.toDataURL(liveUrl(currentLiveRef()?.joinCode ?? ''), {
          width: 440,
          margin: 1,
        }),
      );
    } catch {
      setQr(null);
    }
  }

  return (
    <OnAirContext.Provider value={{ status, mode, setCurrent, setSetlist }}>
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
            {/* Code de salon (multi-live b121) : affiché EN GRAND dès le
                lancement — se communique à la voix ou par message, et se
                copie d'un tap. Les musiciens/spectateurs le saisissent dans
                « Rejoindre un direct » (onglet Concerts) ou via le QR. */}
            {status !== 'off' && (currentLiveRef()?.joinCode ?? '') !== '' && (
              <div style={{ textAlign: 'center', margin: '10px 0' }}>
                <div className="label">Code pour rejoindre</div>
                <button
                  className="btn ghost"
                  title="Copier le code"
                  style={{
                    fontSize: '2rem',
                    letterSpacing: 6,
                    fontVariantNumeric: 'tabular-nums',
                    padding: '8px 18px',
                  }}
                  onClick={() => {
                    const c = currentLiveRef()?.joinCode ?? '';
                    try {
                      void navigator.clipboard.writeText(c);
                      setCodeCopied(true);
                      window.setTimeout(() => setCodeCopied(false), 1800);
                    } catch {
                      /* presse-papier indisponible */
                    }
                  }}
                >
                  {(currentLiveRef()?.joinCode ?? '').replace(
                    /^(\d{3})(\d{3})$/,
                    '$1 $2',
                  )}
                </button>
                <p className="help" style={{ margin: '4px 0 0' }}>
                  {codeCopied
                    ? '✓ Code copié !'
                    : 'Dicte-le ou copie-le — musiciens et public le saisissent dans « Rejoindre un direct ».'}
                </p>
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
                <div className="linkbox">
                  {liveUrl(currentLiveRef()?.joinCode ?? '')}
                </div>
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
            {/* La clé On Air est fournie automatiquement (embarquée au
                build) : aucun avertissement technique à montrer ici. */}
          </Modal>
        )}
      </StatusContext.Provider>
    </OnAirContext.Provider>
  );
}

/** Bouton flottant, présent sur toutes les pages du musicien.
 *  N'apparaît qu'une fois la fiche artiste créée (décision Vincent) : un
 *  débutant n'a pas à voir le mode direct avant d'avoir posé son nom.
 *  Exception : un direct déjà actif reste toujours pilotable. */
export function OnAirButton() {
  const ctx = useContext(StatusContext);
  const { artist } = useStore();
  if (!ctx) return null;
  const { status, hearts, openPanel } = ctx;
  if (artist.name.trim() === '' && status === 'off') return null;
  return (
    <button
      className={`onair ${status}`}
      onClick={openPanel}
      title={
        status === 'on' || status === 'pause'
          ? 'Direct en cours — gérer'
          : 'Passer en direct (public)'
      }
    >
      {status === 'on' ? (
        <>
          <span className="dot" /> LIVE
          {hearts > 0 && <span className="onairhearts">❤ {hearts}</span>}
        </>
      ) : status === 'pause' ? (
        '⏸ LIVE'
      ) : (
        '● GO LIVE'
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
    // En quittant une page de partition, plus aucune chanson n'est affichée
    // → l'écran d'accueil est diffusé (règle : c'est la chanson affichée qui
    // est vue par tous ; sinon l'accueil).
    return () => {
      if (setCurrent) setCurrent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrent, key]);
}

/** État du direct (pour afficher des repères côté musicien). */
export function useOnAirLive(): { status: LiveStatus; mode: LiveMode } {
  const ctx = useContext(OnAirContext);
  return { status: ctx?.status ?? 'off', mode: ctx?.mode ?? 'concert' };
}

/**
 * À appeler depuis le mode scène : déclare la setlist jouée, pour que le
 * public puisse la parcourir lui-même (diffusée seulement si le direct est
 * actif). Effacée en quittant.
 */
export function useOnAirSetlist(songs: LivePublicSong[] | null) {
  const ctx = useContext(OnAirContext);
  const setSetlist = ctx?.setSetlist;
  const key = songs
    ? `${songs.length}#${songs.map((s) => s.title).join('|')}`
    : '';
  useEffect(() => {
    if (setSetlist) setSetlist(songs && songs.length > 0 ? songs : null);
    return () => {
      if (setSetlist) setSetlist(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSetlist, key]);
}
