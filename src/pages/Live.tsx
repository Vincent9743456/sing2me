/**
 * Page spectateur du mode ON AIR — servie par l'ENTRÉE PUBLIQUE LÉGÈRE
 * (/live → public.html) et, en compatibilité, par l'app (/#/live pour les
 * QR déjà imprimés).
 *
 * Architecture (chantier page publique) :
 *  - le CŒUR charge en premier : paroles + suivi de position + cœurs +
 *    lien de pourboire ;
 *  - les briques d'engagement (setlist, messages, suivre l'artiste,
 *    souvenir, vue musicien du bœuf) sont des chunks DIFFÉRÉS (React.lazy)
 *    chargés après le premier affichage ou à la demande.
 */
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { LogoMark } from '../components/Logo';
import { TipBox } from '../components/TipBox';
import {
  fetchLive,
  fetchLiveSetlist,
  LivePublicSong,
  LiveState,
  pingAttendance,
  sendHearts,
} from '../lib/live';
import { fetchSouvenir, Souvenir } from '../lib/fanbase';
import { decodeHtmlEntities } from '../lib/textRepair';
import { useWakeLock } from '../lib/wakelock';
import { defaultPublicScreen } from '../types';

// Briques d'engagement : chunks différés (jamais dans le chargement initial).
const SetlistBrowser = lazy(() => import('./live/SetlistBrowser'));
const MessageBox = lazy(() => import('./live/MessageBox'));
const FollowButton = lazy(() => import('./live/FollowButton'));
const MusicianLive = lazy(() => import('./live/MusicianLive'));
const SouvenirCard = lazy(() => import('./live/SouvenirCard'));
const ArtistSheet = lazy(() => import('./live/ArtistSheet'));

const POLL_MS = 4000;

/**
 * Préchargement + mode dégradé réseau (chantier 1) : la setlist entière du
 * concert (paroles publiques) est mise en cache localStorage dès le premier
 * chargement. Ensuite les appels périodiques ne servent qu'au SUIVI (position
 * + statut) ; si le réseau tombe, le spectateur garde tout le set consultable
 * hors ligne — y compris dans la vue musicien-invité — et le suivi reprend
 * seul au retour du réseau.
 */
const SETLIST_CACHE_KEY = 'sing2me/live/setlist';

function loadCachedSetlist(): LivePublicSong[] | null {
  try {
    const raw = localStorage.getItem(SETLIST_CACHE_KEY);
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as LivePublicSong[]) : null;
  } catch {
    return null;
  }
}

function saveCachedSetlist(list: LivePublicSong[]): void {
  try {
    localStorage.setItem(SETLIST_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Mémoire du rôle « musicien » (bifurcation bœuf) : conservée le temps
 * d'une soirée (rechargements compris), mais EXPIRE ensuite — un spectateur
 * qui a regardé les accords à un bœuf ne doit pas retomber dessus au
 * concert suivant. La vue public reste le défaut.
 */
const ROLE_KEY = 'sing2me/liveRole';
const ROLE_AT_KEY = 'sing2me/liveRoleAt';
const ROLE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — large pour un long bœuf

function initialRole(): 'public' | 'musicien' {
  try {
    if (localStorage.getItem(ROLE_KEY) !== 'musicien') return 'public';
    const at = Date.parse(localStorage.getItem(ROLE_AT_KEY) ?? '');
    if (Number.isNaN(at) || Date.now() - at > ROLE_TTL_MS) return 'public';
    // Toujours dans la fenêtre : on la fait glisser (soirée qui se prolonge).
    localStorage.setItem(ROLE_AT_KEY, new Date().toISOString());
    return 'musicien';
  } catch {
    return 'public';
  }
}

export function Live({
  code = '',
  onKeep,
}: {
  code?: string;
  /** App seulement : « Garder ce morceau » (copie perso en Idée) — voir
   *  lib/keepSong. L'entrée publique légère ne passe rien (pas de store). */
  onKeep?: (song: NonNullable<LiveState['song']>) => string;
} = {}) {
  // Code de salon : prop (route de l'app #/live/CODE) ou ?c= (entrée
  // publique /live?c=482913 — le QR du lanceur l'embarque).
  const joinCode =
    code !== ''
      ? code
      : (() => {
          try {
            return new URLSearchParams(location.search).get('c') ?? '';
          } catch {
            return '';
          }
        })();
  const [state, setState] = useState<LiveState | null>(null);
  const [role, setRole] = useState<'public' | 'musicien'>(initialRole);
  function switchRole(r: 'public' | 'musicien') {
    setRole(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
      localStorage.setItem(ROLE_AT_KEY, new Date().toISOString());
    } catch {
      /* stockage indisponible */
    }
  }
  // L'écran du spectateur reste allumé pendant le direct
  useWakeLock();
  // Réseau perdu en cours de session : on garde le dernier état + le set en
  // cache, un bandeau discret invite à défiler à la main ; reprise auto.
  const [offline, setOffline] = useState(false);
  const [floats, setFloats] = useState<{ id: number; x: number }[]>([]);
  const [localHearts, setLocalHearts] = useState(0);
  // Parcours libre de la setlist par le public + souvenir (playlist).
  // Initialisé depuis le cache : consultable même hors ligne.
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseSetlist, setBrowseSetlist] = useState<LivePublicSong[] | null>(
    () => loadCachedSetlist(),
  );
  const [browseIdx, setBrowseIdx] = useState<number | null>(null);
  const [souvenir, setSouvenir] = useState(false);
  // Setlist souvenir (fanbase V1) : morceaux du dernier concert terminé.
  const [souvenirData, setSouvenirData] = useState<Souvenir | null>(null);
  // Fiche artiste consultable pendant le direct (bouton-avatar).
  const [artistOpen, setArtistOpen] = useState(false);
  const lastTitle = useRef('');
  // Nombre de morceaux de la dernière setlist préchargée (re-précharge si change).
  const lastSetlistCount = useRef(-1);
  const pending = useRef(0);
  const flushTimer = useRef<number | null>(null);
  const floatId = useRef(0);
  // Identifiant du live suivi (pour cœurs / messages / présence).
  const stateIdRef = useRef('');

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
        void sendHearts(n, stateIdRef.current);
      }, 600);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        // Appel de SUIVI : position (morceau courant) + statut.
        const s = await fetchLive(joinCode);
        if (cancelled) return;
        setState(s);
        stateIdRef.current = s.id;
        setOffline(false); // réseau OK → reprise silencieuse du suivi
        // remonter en haut quand la chanson change
        const t = s.song?.title ?? '';
        if (t !== lastTitle.current) {
          lastTitle.current = t;
          setLocalHearts(0);
          window.scrollTo({ top: 0 });
        }
        // PRÉCHARGEMENT : dès le 1er chargement et à chaque changement de
        // setlist, on récupère TOUT le set (paroles) et on le met en cache —
        // ainsi une coupure réseau ne prive jamais le spectateur du set.
        if (s.setlistCount !== lastSetlistCount.current) {
          lastSetlistCount.current = s.setlistCount;
          if (s.setlistCount > 0) {
            const list = await fetchLiveSetlist(joinCode);
            if (!cancelled && list.length > 0) {
              setBrowseSetlist(list);
              saveCachedSetlist(list);
            }
          }
        }
      } catch {
        // Réseau perdu : on NE touche pas au dernier état connu ni au cache.
        if (!cancelled) setOffline(true);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Mesure d'audience (chantier 2) : signale la présence de ce spectateur à
  // la session en cours pour le comptage des uniques. SANS limite ni blocage,
  // best-effort, silencieux. Un ping au chargement puis toutes les 90 s.
  useEffect(() => {
    void pingAttendance(stateIdRef.current);
    const id = window.setInterval(
      () => void pingAttendance(stateIdRef.current),
      90000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Setlist souvenir : chargée une fois (le dernier concert terminé).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await fetchSouvenir();
      if (!cancelled) setSouvenirData(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) {
    // Jamais connecté encore : si un set est en cache (session précédente sur
    // cet appareil), on laisse quand même le parcourir hors ligne.
    const cached = browseSetlist;
    return (
      <div className="public">
        <p className="help" style={{ textAlign: 'center' }}>
          {offline ? 'Hors ligne — reconnexion au direct…' : 'Connexion au direct…'}
        </p>
        {offline && cached && cached.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn small" onClick={() => void openBrowse()}>
              📋 Revoir la setlist ({cached.length})
            </button>
          </div>
        )}
        {browseOpen && cached && (
          <Suspense fallback={null}>
            <SetlistBrowser
              setlist={cached}
              idx={browseIdx}
              souvenir={souvenir}
              onIdx={setBrowseIdx}
              onSouvenir={() => setSouvenir((v) => !v)}
              onClose={() => setBrowseOpen(false)}
            />
          </Suspense>
        )}
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
  // Consultable dès qu'on a un set (serveur OU cache) — vrai même hors ligne,
  // et dans les DEUX rôles (public et musicien-invité).
  const cachedCount = browseSetlist?.length ?? 0;
  const browseCount = state.setlistCount > 0 ? state.setlistCount : cachedCount;
  const canBrowse =
    (publicSession || role === 'musicien') && browseCount > 0;

  async function openBrowse() {
    setBrowseIdx(null);
    setSouvenir(false);
    setBrowseOpen(true);
    // Repli réseau : si rien en cache, on tente une récupération (best-effort).
    if (browseSetlist === null) {
      const list = await fetchLiveSetlist(joinCode);
      if (list.length > 0) {
        setBrowseSetlist(list);
        saveCachedSetlist(list);
      }
    }
  }

  return (
    <div className="public">
      {/* Mode dégradé : suivi interrompu, le set reste consultable à la main. */}
      {offline && (
        <div className="offlinebanner" role="status">
          ⚠ Suivi interrompu — fais défiler à la main. Reprise automatique dès
          le retour du réseau.
        </div>
      )}
      {/* Fiche artiste pendant le concert : bouton-avatar (photo du groupe /
          de l'artiste) en haut à droite — la fiche s'ouvre par-dessus les
          paroles, le retour est immédiat (grand bouton + tap à côté). */}
      {role === 'public' &&
        publicSession &&
        (state.status === 'on' || state.status === 'pause') &&
        state.artist &&
        state.artist.name !== '' &&
        ps.profile && (
          <button
            aria-label={`Voir la page de ${state.artist.name}`}
            title={`Voir la page de ${state.artist.name}`}
            onClick={() => setArtistOpen(true)}
            style={{
              position: 'fixed',
              top: 'var(--sp-3)',
              right: 'var(--sp-3)',
              width: 48,
              height: 48,
              borderRadius: '50%',
              padding: 0,
              border: '2px solid var(--accent)',
              background: 'var(--accent-soft)',
              overflow: 'hidden',
              zIndex: 60,
              cursor: 'pointer',
            }}
          >
            {state.artist.photo !== '' ? (
              <img
                src={state.artist.photo}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '1.3rem' }}>🎤</span>
            )}
          </button>
        )}
      {artistOpen && state.artist && (
        <Suspense fallback={null}>
          <ArtistSheet
            artist={state.artist}
            onClose={() => setArtistOpen(false)}
          />
        </Suspense>
      )}
      {/* Bifurcation « bœuf » : un musicien de passage bascule sur la
          partition complète (accords, transposition perso), sans compte. */}
      {role === 'public' && (
        <div style={{ textAlign: 'center', margin: '0 0 10px' }}>
          <button
            className="btn ghost small"
            onClick={() => switchRole('musicien')}
          >
            🎸 Tu es musicien ? Suis avec les accords
          </button>
        </div>
      )}
      {canBrowse && (
        <div style={{ textAlign: 'center', margin: '0 0 12px' }}>
          <button className="btn small" onClick={() => void openBrowse()}>
            📋 Voir la setlist ({browseCount})
          </button>
        </div>
      )}
      {role === 'musicien' ? (
        <Suspense
          fallback={
            <p className="help" style={{ textAlign: 'center' }}>
              Ouverture de la partition…
            </p>
          }
        >
          <MusicianLive
            state={state}
            onPublic={() => switchRole('public')}
            onKeep={onKeep}
          />
        </Suspense>
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
          {ps.messages && (
            <Suspense fallback={null}>
              <MessageBox songTitle={state.song.title} liveId={state.id} />
            </Suspense>
          )}
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
          {ps.messages && (
            <Suspense fallback={null}>
              <MessageBox liveId={state.id} />
            </Suspense>
          )}
        </>
      ) : (
        <>
          {souvenirData && souvenirData.songs.length > 0 && (
            <Suspense fallback={null}>
              <SouvenirCard data={souvenirData} />
            </Suspense>
          )}
          {ps.profile && <ArtistBlock state={state} showLinks={ps.links} />}
          {ps.follow && (
            <Suspense fallback={null}>
              <FollowButton
                artistName={
                  state.artist?.name || souvenirData?.session?.artist || ''
                }
              />
            </Suspense>
          )}
          {ps.tips && <TipBox artist={state.artist} />}
          {ps.messages && (
            <Suspense fallback={null}>
              <MessageBox liveId={state.id} />
            </Suspense>
          )}
          {(!state.artist || state.artist.name === '') &&
            !(souvenirData && souvenirData.songs.length > 0) && (
              <p className="help" style={{ textAlign: 'center' }}>
                Aucun concert en cours.
              </p>
            )}
        </>
      )}
      {browseOpen &&
        (browseSetlist === null ? (
          <div className="stagelist" onClick={() => setBrowseOpen(false)}>
            <div className="inner">
              <p className="help" style={{ textAlign: 'center' }}>
                Chargement de la setlist…
              </p>
            </div>
          </div>
        ) : (
          <Suspense fallback={null}>
            <SetlistBrowser
              setlist={browseSetlist}
              idx={browseIdx}
              souvenir={souvenir}
              onIdx={setBrowseIdx}
              onSouvenir={() => setSouvenir((v) => !v)}
              onClose={() => setBrowseOpen(false)}
            />
          </Suspense>
        ))}
      {/* Invitation discrète, seulement hors morceau (pause / fin de live).
          Liens ABSOLUS (/#/…) : la page peut être servie depuis /live. */}
      {!liveNow && role === 'public' && ps.appInvite && (
        <div className="footer">
          <a className="ctabanner" href={location.origin + '/'}>
            <LogoMark size={22} /> Téléchargez <strong>Sing2Me</strong> — votre
            songbook, gratuit
          </a>
          <p className="help" style={{ textAlign: 'center', marginTop: 6 }}>
            <a href="/#/cgu" style={{ color: 'var(--text-dim)' }}>
              Conditions d'utilisation
            </a>
            {' · '}
            <a href="/#/report" style={{ color: 'var(--text-dim)' }}>
              Signaler un contenu
            </a>
          </p>
        </div>
      )}
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
