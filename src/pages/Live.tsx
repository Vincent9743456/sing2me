/**
 * Page spectateur du mode ON AIR (/#/live).
 * En direct : paroles du morceau en cours, rafraîchies automatiquement.
 * En pause : écran d'attente. Hors direct : page artiste seule.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { LogoMark } from '../components/Logo';
import { ChordLine } from '../components/SongBody';
import { TipBox } from '../components/TipBox';
import { parseContent } from '../lib/chordpro';
import {
  spellingForKey,
  semitonesBetween,
  transposeContent,
  transposeKeyName,
} from '../lib/chords';
import {
  fetchLive,
  fetchLiveSetlist,
  LivePublicSong,
  LiveState,
  sendHearts,
  sendMessage,
} from '../lib/live';
import { decodeHtmlEntities, repairChordedLyrics } from '../lib/textRepair';
import { useWakeLock } from '../lib/wakelock';
import { defaultPublicScreen } from '../types';

const POLL_MS = 4000;

/** Liens de recherche du morceau sur les plateformes (souvenir de concert). */
function streamLinks(title: string, artist: string) {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return [
    { name: 'Spotify', url: `https://open.spotify.com/search/${q}` },
    { name: 'Apple Music', url: `https://music.apple.com/search?term=${q}` },
    { name: 'Deezer', url: `https://www.deezer.com/search/${q}` },
  ];
}

function MessageBox({ songTitle = '' }: { songTitle?: string }) {
  const [name, setName] = useState(
    () => localStorage.getItem('sing2me/fanName') ?? '',
  );
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    if (text.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(name.trim(), text.trim());
      localStorage.setItem('sing2me/fanName', name.trim());
      setSent(true);
      setText('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "L'envoi a échoué — réessaie dans un instant.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tipbox">
      <div className="tiptitle">
        {songTitle !== ''
          ? `💬 Un mot sur « ${songTitle} » ?`
          : '💬 Un mot pour les musiciens ?'}
      </div>
      {sent ? (
        <>
          <p style={{ margin: '6px 0', fontWeight: 650 }}>
            ✅ Message transmis aux musiciens — merci ! 🎸
          </p>
          <button className="btn ghost small" onClick={() => setSent(false)}>
            Envoyer un autre mot
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={name}
            placeholder="Ton prénom (optionnel)"
            style={{ marginBottom: 8 }}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            value={text}
            placeholder="Bravo pour ce concert !…"
            style={{ minHeight: 70, marginBottom: 8 }}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn"
            disabled={text.trim() === '' || busy}
            onClick={() => void onSend()}
          >
            {busy ? 'Envoi…' : 'Envoyer'}
          </button>
          {error && (
            <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
          )}
        </>
      )}
    </div>
  );
}

function FollowButton({ state }: { state: LiveState }) {
  const artistName = state.artist?.name ?? '';
  const [following, setFollowing] = useState(() => {
    if (artistName === '') return false;
    try {
      const list = JSON.parse(
        localStorage.getItem('sing2me/following') ?? '[]',
      ) as string[];
      return list.includes(artistName);
    } catch {
      return false;
    }
  });
  if (artistName === '') return null;
  return (
    <div style={{ textAlign: 'center', margin: '14px 0' }}>
      <button
        className={`btn ${following ? 'ghost' : ''}`}
        onClick={() => {
          try {
            const list = JSON.parse(
              localStorage.getItem('sing2me/following') ?? '[]',
            ) as string[];
            const next = following
              ? list.filter((n) => n !== artistName)
              : [...list, artistName];
            localStorage.setItem('sing2me/following', JSON.stringify(next));
            setFollowing(!following);
          } catch {
            // stockage indisponible
          }
        }}
      >
        {following ? '✓ Suivi' : `⭐ Suivre ${artistName}`}
      </button>
      <p className="help" style={{ marginTop: 6 }}>
        Mémorisé sur cet appareil. Les alertes de nouveaux concerts arriveront
        avec les comptes fans.
      </p>
    </div>
  );
}

function ArtistBlock({
  state,
  showLinks = true,
}: {
  state: LiveState;
  showLinks?: boolean;
}) {
  const artist = state.artist;
  if (!artist || artist.name === '') return null;
  return (
    <div className="artisthead">
      {artist.photo !== '' && <img src={artist.photo} alt={artist.name} />}
      <h1 style={{ margin: '10px 0 4px' }}>{artist.name}</h1>
      {artist.bio !== '' && (
        <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
          {artist.bio}
        </p>
      )}
      {showLinks && artist.links.length > 0 && (
        <div className="links">
          {artist.links
            .filter((l) => l.url !== '')
            .map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer">
                {l.label || l.url}
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

/** Vue musicien (QR unique) : partition avec accords, transposée. */
function MusicianLive({
  state,
  onPublic,
}: {
  state: LiveState;
  onPublic: () => void;
}) {
  const [fontSize, setFontSize] = useState(1.05);
  // 'shapes' = les formes du leader (+ capo) ; 'real' = les vrais accords.
  const [chordMode, setChordMode] = useState<'shapes' | 'real'>('shapes');
  const song = state.song;
  const active = state.status === 'on' || state.status === 'pause';

  const capo = song?.capo ?? 0;
  // Tonalité des formes que joue le leader.
  const shapeKey = song?.playedKey ?? '';
  // Tonalité réelle (ce qui sonne) = formes + capo.
  const realKey = shapeKey !== '' ? transposeKeyName(shapeKey, capo) : '';
  const showReal = chordMode === 'real' && capo > 0;

  const semis = useMemo(() => {
    if (!song?.chordKey || !shapeKey) return showReal ? capo : 0;
    if (song.chordKey === '' || shapeKey === '') return showReal ? capo : 0;
    const toShapes = semitonesBetween(song.chordKey, shapeKey) ?? 0;
    return toShapes + (showReal ? capo : 0);
  }, [song, shapeKey, showReal, capo]);
  const preferFlat = useMemo(() => {
    return spellingForKey(showReal ? realKey : shapeKey);
  }, [showReal, realKey, shapeKey]);
  const lines = useMemo(() => {
    if (!song) return [];
    if (song.chords && song.chords !== '') {
      return parseContent(
        transposeContent(repairChordedLyrics(song.chords), semis, preferFlat),
      );
    }
    return parseContent(decodeHtmlEntities(song.lyrics));
  }, [song, semis, preferFlat]);

  return (
    <>
      <div
        className={`livebadge ${state.status === 'pause' ? 'pause' : ''}`}
      >
        {state.status === 'pause'
          ? '⏸ PAUSE'
          : state.mode === 'repet'
            ? '🎸 RÉPÉTITION'
            : '🎸 VUE MUSICIEN'}
      </div>
      {!active || !song ? (
        <p style={{ textAlign: 'center', fontSize: '1.05rem' }}>
          En attente de la session…
          <br />
          <span className="help">
            Dès que le leader lance un morceau, ta partition s'affiche ici,
            avec les accords dans la tonalité jouée.
          </span>
        </p>
      ) : (
        <>
          <h1 className="livetitle">{song.title}</h1>
          <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
            {[
              song.artist,
              showReal
                ? realKey !== ''
                  ? `Accords réels · ${realKey}`
                  : 'Accords réels'
                : shapeKey !== ''
                  ? capo > 0
                    ? `Formes ${shapeKey} · Capo ${capo} (sonne en ${realKey})`
                    : `Tonalité ${shapeKey}`
                  : '',
            ]
              .filter((x) => x !== '')
              .join(' · ')}
          </p>
          {capo > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <button
                className="btn ghost small"
                onClick={() =>
                  setChordMode((m) => (m === 'real' ? 'shapes' : 'real'))
                }
              >
                {showReal
                  ? `🎸 Voir comme le leader (${shapeKey}, capo ${capo})`
                  : `🎸 Voir les vrais accords (${realKey})`}
              </button>
            </div>
          )}
          <div style={{ fontSize: `${fontSize}rem`, padding: '0 4px' }}>
            {lines.map((line, i) => (
              <ChordLine key={i} line={line} />
            ))}
          </div>
          <div className="rowactions" style={{ justifyContent: 'center' }}>
            <button
              className="btn ghost"
              onClick={() => setFontSize((f) => Math.max(0.8, +(f - 0.1).toFixed(2)))}
            >
              A−
            </button>
            <button
              className="btn ghost"
              onClick={() => setFontSize((f) => Math.min(1.8, +(f + 0.1).toFixed(2)))}
            >
              A＋
            </button>
          </div>
        </>
      )}
      <p className="help" style={{ textAlign: 'center' }}>
        <button className="btn ghost small" onClick={onPublic}>
          ← Vue public
        </button>
      </p>
    </>
  );
}

export function Live() {
  const [state, setState] = useState<LiveState | null>(null);
  const [role, setRole] = useState<'public' | 'musicien'>(() =>
    localStorage.getItem('sing2me/liveRole') === 'musicien'
      ? 'musicien'
      : 'public',
  );
  function switchRole(r: 'public' | 'musicien') {
    setRole(r);
    localStorage.setItem('sing2me/liveRole', r);
  }
  // L'écran du spectateur reste allumé pendant le direct
  useWakeLock();
  const [error, setError] = useState<string | null>(null);
  const [floats, setFloats] = useState<{ id: number; x: number }[]>([]);
  const [localHearts, setLocalHearts] = useState(0);
  // Parcours libre de la setlist par le public + souvenir (playlist).
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseSetlist, setBrowseSetlist] = useState<LivePublicSong[] | null>(
    null,
  );
  const [browseIdx, setBrowseIdx] = useState<number | null>(null);
  const [souvenir, setSouvenir] = useState(false);
  const lastTitle = useRef('');
  const pending = useRef(0);
  const flushTimer = useRef<number | null>(null);
  const floatId = useRef(0);

  function onHeart() {
    // animation immédiate
    const id = ++floatId.current;
    setFloats((f) => [...f, { id, x: Math.random() * 40 - 20 }]);
    window.setTimeout(
      () => setFloats((f) => f.filter((h) => h.id !== id)),
      1300,
    );
    setLocalHearts((h) => h + 1);
    // envoi groupé (toutes les 600 ms)
    pending.current += 1;
    if (flushTimer.current === null) {
      flushTimer.current = window.setTimeout(() => {
        const n = pending.current;
        pending.current = 0;
        flushTimer.current = null;
        void sendHearts(n);
      }, 600);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const s = await fetchLive();
        if (cancelled) return;
        setState(s);
        setError(null);
        // remonter en haut quand la chanson change
        const t = s.song?.title ?? '';
        if (t !== lastTitle.current) {
          lastTitle.current = t;
          setLocalHearts(0);
          window.scrollTo({ top: 0 });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Connexion impossible.');
        }
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (state === null) {
    return (
      <div className="public">
        <p className="help" style={{ textAlign: 'center' }}>
          {error ?? 'Connexion au direct…'}
        </p>
      </div>
    );
  }

  // Ce que voit le public : rien d'une répétition (réservée aux musiciens).
  const publicSession = state.mode === 'concert';
  const liveNow = publicSession && state.status === 'on' && state.song !== null;
  const pauseNow =
    publicSession &&
    (state.status === 'pause' || (state.status === 'on' && !state.song));
  // L'artiste choisit ce qui s'affiche (réglages « Écran public »).
  const ps = { ...defaultPublicScreen(), ...(state.artist?.publicScreen ?? {}) };
  const canBrowse = publicSession && state.setlistCount > 0;

  async function openBrowse() {
    setBrowseIdx(null);
    setSouvenir(false);
    setBrowseOpen(true);
    if (browseSetlist === null) {
      setBrowseSetlist(await fetchLiveSetlist());
    }
  }

  return (
    <div className="public">
      {/* Visible au premier coup d'œil : un musicien bascule sur sa partition */}
      {role === 'public' && (
        <div style={{ textAlign: 'center', margin: '0 0 10px' }}>
          <button
            className="btn ghost small"
            onClick={() => switchRole('musicien')}
          >
            🎸 Tu es musicien ? Vue partition
          </button>
        </div>
      )}
      {role === 'public' && canBrowse && (
        <div style={{ textAlign: 'center', margin: '0 0 12px' }}>
          <button className="btn small" onClick={() => void openBrowse()}>
            📋 Voir la setlist ({state.setlistCount})
          </button>
        </div>
      )}
      {role === 'musicien' ? (
        <MusicianLive state={state} onPublic={() => switchRole('public')} />
      ) : liveNow && state.song ? (
        <>
          <div className="livebadge">
            <span className="dot" /> EN DIRECT
            {ps.hearts && (
              <span className="livehearts">
                ❤ {Math.max(state.hearts, localHearts)}
              </span>
            )}
          </div>
          {ps.songTitle && (
            <>
              <h1 className="livetitle">{state.song.title}</h1>
              {state.song.artist !== '' && (
                <p
                  className="help"
                  style={{ textAlign: 'center', marginTop: 0 }}
                >
                  {state.song.artist}
                </p>
              )}
            </>
          )}
          {ps.lyrics ? (
            <div className="livelyrics">
              {decodeHtmlEntities(state.song.lyrics)}
            </div>
          ) : (
            <p style={{ textAlign: 'center', fontSize: '1.2rem' }}>
              🎶 Concert en cours — profitez du moment !
            </p>
          )}
          {ps.tips && <TipBox artist={state.artist} />}
          {ps.messages && <MessageBox songTitle={state.song.title} />}
          {ps.hearts && (
            <button
              className="heartfab"
              onClick={onHeart}
              aria-label="Envoyer un cœur"
            >
              ❤
              {floats.map((f) => (
                <span
                  key={f.id}
                  className="heartfloat"
                  style={{ marginLeft: f.x }}
                >
                  ❤
                </span>
              ))}
            </button>
          )}
        </>
      ) : pauseNow ? (
        <>
          <div className="livebadge pause">⏸ PAUSE</div>
          <p style={{ textAlign: 'center', fontSize: '1.1rem' }}>
            Le concert reprend dans un instant…
          </p>
          {ps.profile && <ArtistBlock state={state} showLinks={ps.links} />}
          {ps.tips && <TipBox artist={state.artist} />}
          {ps.messages && <MessageBox />}
        </>
      ) : (
        <>
          {ps.profile && <ArtistBlock state={state} showLinks={ps.links} />}
          {ps.follow && <FollowButton state={state} />}
          {ps.tips && <TipBox artist={state.artist} />}
          {ps.messages && <MessageBox />}
          {(!state.artist || state.artist.name === '') && (
            <p className="help" style={{ textAlign: 'center' }}>
              Aucun concert en cours.
            </p>
          )}
        </>
      )}
      {browseOpen && (
        <div
          className="stagelist"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBrowseOpen(false);
          }}
        >
          <div className="inner">
            {browseSetlist === null ? (
              <p className="help" style={{ textAlign: 'center' }}>
                Chargement de la setlist…
              </p>
            ) : browseIdx !== null && browseSetlist[browseIdx] ? (
              <>
                <button
                  className="btn ghost small"
                  onClick={() => setBrowseIdx(null)}
                >
                  ◀ La setlist
                </button>
                <h2 className="livetitle" style={{ marginTop: 10 }}>
                  {browseSetlist[browseIdx].title}
                </h2>
                {browseSetlist[browseIdx].artist !== '' && (
                  <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
                    {browseSetlist[browseIdx].artist}
                  </p>
                )}
                <div className="livelyrics">
                  {decodeHtmlEntities(browseSetlist[browseIdx].lyrics) ||
                    '(paroles non disponibles)'}
                </div>
                <div className="rowactions" style={{ justifyContent: 'center' }}>
                  <button
                    className="btn ghost small"
                    disabled={browseIdx <= 0}
                    onClick={() => setBrowseIdx((i) => Math.max(0, (i ?? 0) - 1))}
                  >
                    ‹ Précédent
                  </button>
                  <button
                    className="btn ghost small"
                    disabled={browseIdx >= browseSetlist.length - 1}
                    onClick={() =>
                      setBrowseIdx((i) =>
                        Math.min(browseSetlist.length - 1, (i ?? 0) + 1),
                      )
                    }
                  >
                    Suivant ›
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
                  La setlist du concert — tape un morceau pour lire les paroles.
                </p>
                {browseSetlist.length === 0 && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    Setlist momentanément indisponible.
                  </p>
                )}
                {browseSetlist.map((s, i) => (
                  <button
                    key={i}
                    className="remoterow"
                    onClick={() => setBrowseIdx(i)}
                  >
                    <span className="num">{i + 1}</span>
                    <span className="grow">
                      <span className="rtitle">{s.title || '(sans titre)'}</span>
                      {s.artist !== '' && (
                        <span className="rsub">{s.artist}</span>
                      )}
                    </span>
                    {souvenir && (
                      <span
                        style={{ display: 'flex', gap: 6 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {streamLinks(s.title, s.artist).map((l) => (
                          <a
                            key={l.name}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn ghost small"
                            title={`Chercher sur ${l.name}`}
                          >
                            {l.name[0]}
                          </a>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
                {browseSetlist.length > 0 && (
                  <button
                    className={`btn ${souvenir ? '' : 'ghost'} block`}
                    style={{ marginTop: 8 }}
                    onClick={() => setSouvenir((v) => !v)}
                  >
                    🎧 {souvenir ? 'Masquer' : 'Garder un souvenir'} — écouter sur
                    Spotify / Apple / Deezer
                  </button>
                )}
                <button
                  className="btn ghost block"
                  onClick={() => setBrowseOpen(false)}
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Invitation discrète, seulement hors morceau (pause / fin de live) */}
      {!liveNow && role === 'public' && ps.appInvite && (
        <div className="footer">
          <a className="ctabanner" href={location.origin + location.pathname}>
            <LogoMark size={22} /> Téléchargez <strong>Sing2Me</strong> — votre
            songbook, gratuit
          </a>
          <p className="help" style={{ textAlign: 'center', marginTop: 6 }}>
            <a href="#/cgu" style={{ color: 'var(--text-dim)' }}>
              Conditions d'utilisation · signaler un contenu
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
