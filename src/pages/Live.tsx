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

import { StageList } from '../components/StageList';
import { LogoMark } from '../components/Logo';
import { PublicLyrics } from '../components/PublicLyrics';
import { TipBox } from '../components/TipBox';
import { t } from '../i18n';
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
const ShareLive = lazy(() => import('./live/ShareLive'));

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
  artistName = '',
  page = '',
  onKeep,
}: {
  code?: string;
  /**
   * Direct désigné par l'IDENTITÉ de l'artiste (b170). C'est le chemin
   * normal : le spectateur reste sur /sonnom, et si le concert s'arrête et
   * repart, la page retrouve le nouveau direct toute seule. Un code de
   * session, lui, mourait avec la session.
   */
  artistName?: string;
  /** Adresse publique d'où l'on vient (b227) : clé UNIQUE du direct. */
  page?: string;
  /** App seulement : « Garder ce morceau » (copie perso en Idée) — voir
   *  lib/keepSong. L'entrée publique légère ne passe rien (pas de store). */
  onKeep?: (song: NonNullable<LiveState['song']>) => string;
} = {}) {
  // Code de salon : plus produit nulle part depuis b170. On le lit encore
  // (prop de l'ancienne route #/live/CODE, ou ?c= d'un vieux lien partagé)
  // pour ne casser aucune adresse déjà en circulation.
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
  // Panneau « Faire venir du monde » : QR + partage du lien du direct.
  const [shareOpen, setShareOpen] = useState(false);
  // Panneaux ouverts depuis la barre d'interaction (b172) : le pourboire et
  // le mot au groupe ne sont plus enfouis sous les paroles.
  const [tipOpen, setTipOpen] = useState(false);
  const [wordOpen, setWordOpen] = useState(false);
  const lastTitle = useRef('');
  // Nombre de morceaux de la dernière setlist préchargée (re-précharge si change).
  const lastSetlistCount = useRef(-1);
  const pending = useRef(0);
  const flushTimer = useRef<number | null>(null);
  const floatId = useRef(0);
  // Identifiant du live suivi (pour cœurs / messages / présence).
  const stateIdRef = useRef('');
  /**
   * UN CŒUR PAR MORCEAU (b225, demande de Vincent). Le titre du morceau déjà
   * aimé : taper encore fait voler un ❤ — le geste reste libre, et c'est ce
   * retour immédiat qui compte pour le spectateur — mais rien ne repart au
   * serveur, et le chiffre affiché ne ment pas.
   *
   * Le serveur refuse le doublon de son côté aussi (une page rouverte, un
   * deuxième onglet) : ici on lui évite simplement des appels inutiles.
   */
  const dejaAime = useRef('');

  function onHeart() {
    // animation immédiate — toujours, même quand le cœur ne compte plus.
    const id = ++floatId.current;
    setFloats((f) => [...f, { id, x: Math.random() * 40 - 20 }]);
    window.setTimeout(
      () => setFloats((f) => f.filter((h) => h.id !== id)),
      1300,
    );
    const titre = state?.song?.title ?? '';
    if (dejaAime.current === titre && titre !== '') return;
    dejaAime.current = titre;
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
        const s = await fetchLive(joinCode, artistName, page);
        if (cancelled) return;
        setState(s);
        stateIdRef.current = s.id;
        setOffline(false); // réseau OK → reprise silencieuse du suivi
        // remonter en haut quand la chanson change
        // (variable renommée : `t` masquait la fonction de traduction)
        const newTitle = s.song?.title ?? '';
        if (newTitle !== lastTitle.current) {
          lastTitle.current = newTitle;
          // Nouveau morceau, nouveau cœur possible (b225).
          dejaAime.current = '';
          setLocalHearts(0);
          window.scrollTo({ top: 0 });
        }
        // PRÉCHARGEMENT : dès le 1er chargement et à chaque changement de
        // setlist, on récupère TOUT le set (paroles) et on le met en cache —
        // ainsi une coupure réseau ne prive jamais le spectateur du set.
        if (s.setlistCount !== lastSetlistCount.current) {
          lastSetlistCount.current = s.setlistCount;
          if (s.setlistCount > 0) {
            const list = await fetchLiveSetlist(joinCode, artistName, page);
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

  /**
   * Mesure d'audience : signale la présence de ce spectateur pour le
   * comptage des uniques. Sans limite ni blocage, best-effort, silencieux.
   *
   * Le premier signalement partait AU MONTAGE, quand l'identifiant du direct
   * n'était pas encore connu (b201) : il tombait alors dans l'ancien chemin,
   * sans séance, et n'enregistrait rien. Le suivant n'arrivait que 90 s plus
   * tard — un spectateur qui écoutait un morceau, laissait un cœur et
   * repartait n'était jamais compté. On signale donc dès que le direct est
   * identifié, puis toutes les 90 s.
   */
  // ⚠️ `state` est NUL au premier rendu (b215) : lire `state.id` ici — y
  // compris dans le tableau de dépendances, évalué à CHAQUE rendu — plantait
  // la page du spectateur avant même le premier appel réseau. Un crochet
  // vit AVANT le garde `if (state === null)` plus bas : il doit donc être
  // écrit comme si l'état n'existait pas encore.
  const liveId = state?.id ?? '';
  // Salle pleine (b387) : un spectateur resté à la porte ne compte pas
  // comme spectateur — il n'a rien vu du concert.
  const refuse = state?.status === 'full';
  useEffect(() => {
    if (liveId === '' || refuse) return;
    void pingAttendance(liveId);
    const id = window.setInterval(() => void pingAttendance(liveId), 90000);
    return () => window.clearInterval(id);
  }, [liveId, refuse]);

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
          {offline
            ? t('Hors ligne — reconnexion au direct…')
            : t('Connexion au direct…')}
        </p>
        {offline && cached && cached.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn small" onClick={() => void openBrowse()}>
              {t('📋 Revoir la setlist ({n})', { n: cached.length })}
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
  // Direct en cours mais aucune partition affichée : le concert n'a pas
  // encore commencé, ou l'artiste est entre deux morceaux (b170). Ce n'est
  // PAS une pause déclarée — on ne dit donc pas la même chose.
  const waitingNow = publicSession && state.status === 'on' && !state.song;
  const pauseNow = publicSession && state.status === 'pause';
  // Salle pleine (b387) : le concert est en cours mais les 15 places du
  // plan gratuit sont prises — le serveur n'envoie que le titre en cours.
  // On RESTE sur la page : la place se libère toute seule quand quelqu'un
  // part, et le prochain sondage fait entrer sans rien relancer.
  const fullNow = publicSession && state.status === 'full';
  // L'artiste choisit ce qui s'affiche (réglages « Écran public »).
  const ps = { ...defaultPublicScreen(), ...(state.artist?.publicScreen ?? {}) };
  // Consultable dès qu'on a un set (serveur OU cache) — vrai même hors ligne,
  // et dans les DEUX rôles (public et musicien-invité).
  const cachedCount = browseSetlist?.length ?? 0;
  const browseCount = state.setlistCount > 0 ? state.setlistCount : cachedCount;
  const canBrowse =
    (publicSession || role === 'musicien') && browseCount > 0;
  // Partage du direct (public comme musicien de passage) : dès qu'une
  // session est active — un spectateur invite ses amis, un musicien au
  // bœuf fait venir d'autres musiciens.
  const sessionActive = state.status === 'on' || state.status === 'pause';
  const canShare = sessionActive && (publicSession || role === 'musicien');
  // Barre d'interaction : uniquement quand des paroles occupent l'écran —
  // ailleurs (pause, hors direct), tout est déjà visible sans défiler.
  const canTip = ps.tips && (state.artist?.tipUrl ?? '').trim() !== '';
  const showBar =
    role === 'public' &&
    liveNow &&
    state.song !== null &&
    (ps.hearts || canTip || ps.messages);
  // Adresse à partager : celle où l'on se trouve déjà (b170). Quand la page
  // est ouverte sur /sonnom, c'est l'adresse STABLE de l'artiste — elle
  // survit à l'arrêt et au redémarrage du concert, contrairement à un code
  // de session.
  const shareUrl =
    artistName !== ''
      ? `${location.origin}${location.pathname}`
      : `${location.origin}/live`;

  async function openBrowse() {
    setBrowseIdx(null);
    setSouvenir(false);
    setBrowseOpen(true);
    // Repli réseau : si rien en cache, on tente une récupération (best-effort).
    if (browseSetlist === null) {
      const list = await fetchLiveSetlist(joinCode, artistName, page);
      if (list.length > 0) {
        setBrowseSetlist(list);
        saveCachedSetlist(list);
      }
    }
  }

  return (
    <div className={`public${showBar ? ' withbar' : ''}`}>
      {/* Mode dégradé : suivi interrompu, le set reste consultable à la main. */}
      {offline && (
        <div className="offlinebanner" role="status">
          {t(
            '⚠ Suivi interrompu — fais défiler à la main. Reprise automatique dès le retour du réseau.',
          )}
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
            aria-label={t('Voir la page de {name}', { name: state.artist.name })}
            title={t('Voir la page de {name}', { name: state.artist.name })}
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
            showFollow={ps.follow}
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
            {t('🎸 Tu es musicien ? Suis avec les accords')}
          </button>
        </div>
      )}
      {(canBrowse || canShare) && (
        <div
          className="rowactions"
          style={{ justifyContent: 'center', margin: '0 0 12px' }}
        >
          {canBrowse && (
            <button className="btn small" onClick={() => void openBrowse()}>
              {t('📋 Voir la setlist ({n})', { n: browseCount })}
            </button>
          )}
          {canShare && (
            <button
              className="btn ghost small"
              onClick={() => setShareOpen(true)}
            >
              {t('📣 Inviter')}
            </button>
          )}
        </div>
      )}
      {shareOpen && (
        <Suspense fallback={null}>
          <ShareLive
            url={shareUrl}
            artistName={state.artist?.name ?? ''}
            onClose={() => setShareOpen(false)}
          />
        </Suspense>
      )}
      {role === 'musicien' ? (
        <Suspense
          fallback={
            <p className="help" style={{ textAlign: 'center' }}>
              {t('Ouverture de la partition…')}
            </p>
          }
        >
          <MusicianLive
            state={state}
            onPublic={() => switchRole('public')}
            onKeep={onKeep}
          />
        </Suspense>
      ) : fullNow ? (
        <>
          <div className="livebadge">
            <span className="dot" /> {t('EN DIRECT')}
          </div>
          {state.song?.title && (
            <>
              <h1 className="livetitle">{state.song.title}</h1>
              {(state.song.artist ?? '') !== '' && (
                <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
                  {state.song.artist}
                </p>
              )}
            </>
          )}
          <p style={{ textAlign: 'center', fontSize: '1.1rem' }}>
            {t('La salle est pleine — quinze personnes suivent déjà le concert en même temps.')}
          </p>
          <p className="help" style={{ textAlign: 'center' }}>
            {t('Reste sur cette page : ta place se libère dès que quelqu’un part, et tu entres automatiquement.')}
          </p>
          {ps.profile && <ArtistBlock state={state} showLinks={ps.links} />}
        </>
      ) : liveNow && state.song ? (
        <>
          <div className="livebadge">
            <span className="dot" /> {t('EN DIRECT')}
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
            <PublicLyrics text={decodeHtmlEntities(state.song.lyrics)} />
          ) : (
            <p style={{ textAlign: 'center', fontSize: '1.2rem' }}>
              {t('🎶 Concert en cours — profitez du moment !')}
            </p>
          )}
          {/* Le pourboire et le mot au groupe ne sont plus posés SOUS les
              paroles (b172) : ils s'ouvrent depuis la barre du bas, qui les
              rend accessibles sans jamais faire défiler un morceau. */}
        </>
      ) : pauseNow || waitingNow ? (
        <>
          {waitingNow ? (
            <div className="livebadge">
              <span className="dot" /> {t('EN DIRECT')}
            </div>
          ) : (
            <div className="livebadge pause">{t('⏸ PAUSE')}</div>
          )}
          <p style={{ textAlign: 'center', fontSize: '1.1rem' }}>
            {waitingNow
              ? t('Le concert commence dans un instant…')
              : t('Le concert reprend dans un instant…')}
          </p>
          {ps.profile && <ArtistBlock state={state} showLinks={ps.links} />}
          {ps.tips && <TipBox artist={state.artist} />}
          {ps.messages && (
            <Suspense fallback={null}>
              <MessageBox liveId={state.id} artist={state.artist?.name ?? ''} />
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
              <MessageBox liveId={state.id} artist={state.artist?.name ?? ''} />
            </Suspense>
          )}
          {(!state.artist || state.artist.name === '') &&
            !(souvenirData && souvenirData.songs.length > 0) && (
              <p className="help" style={{ textAlign: 'center' }}>
                {t('Aucun concert en cours.')}
              </p>
            )}
        </>
      )}
      {/* ————— Barre d'interaction avec l'artiste (b172) —————
          Toujours atteignable pendant un morceau, sans défiler. Basse et
          sobre : les paroles gardent la place et le contraste. Chaque bouton
          n'apparaît que si l'artiste l'a autorisé (réglages « Écran public »). */}
      {showBar && (
        <div className="pubbar" role="group" aria-label={t('Réagir')}>
          {ps.hearts && (
            <button
              className={`heart ${localHearts > 0 ? 'done' : ''}`}
              onClick={onHeart}
              aria-pressed={localHearts > 0}
              aria-label={t('Envoyer un j’aime')}
            >
              <span className="ico" aria-hidden="true">
                ❤
              </span>
              {/* Pas de compteur ici : le total du concert s'affiche en haut,
                  et il n'inclut mes cœurs qu'au tour de suivi suivant. Un
                  chiffre qui ne bouge pas au tap serait un faux retour — le
                  cœur qui s'envole, lui, est immédiat. */}
              {/* « J'aime » plutôt que « Un cœur » (retour de Marco) : le
                  geste est universel, le mot n'a pas à être appris. Le
                  symbole ❤ reste — c'est lui qui s'envole au tap. */}
              <span>{localHearts > 0 ? t('Aimé') : t('J’aime')}</span>
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
          {canTip && (
            <button onClick={() => setTipOpen(true)}>
              <span className="ico" aria-hidden="true">
                💛
              </span>
              <span>{t('Soutenir')}</span>
            </button>
          )}
          {ps.messages && (
            <button onClick={() => setWordOpen(true)}>
              <span className="ico" aria-hidden="true">
                💬
              </span>
              <span>{t('Un mot')}</span>
            </button>
          )}
        </div>
      )}
      {tipOpen && (
        <StageList onClose={() => setTipOpen(false)}>
          <div className="inner">
            <button className="btn block" onClick={() => setTipOpen(false)}>
              {t('← Revenir aux paroles')}
            </button>
            <div className="spacer" />
            <TipBox artist={state.artist} />
          </div>
        </StageList>
      )}
      {wordOpen && (
        <StageList onClose={() => setWordOpen(false)}>
          <div className="inner">
            <button className="btn block" onClick={() => setWordOpen(false)}>
              {t('← Revenir aux paroles')}
            </button>
            <div className="spacer" />
            <Suspense fallback={null}>
              <MessageBox
                songTitle={state.song?.title ?? ''}
                liveId={state.id}
                artist={state.artist?.name ?? ''}
              />
            </Suspense>
          </div>
        </StageList>
      )}
      {browseOpen &&
        (browseSetlist === null ? (
          <StageList onClose={() => setBrowseOpen(false)} closeOnAnyClick>
            <div className="inner">
              <p className="help" style={{ textAlign: 'center' }}>
                {t('Chargement de la setlist…')}
              </p>
            </div>
          </StageList>
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
            <LogoMark size={44} /> {t('Téléchargez')} <strong>mojosong</strong>{' '}
            {t('— votre songbook, gratuit')}
          </a>
          <p className="help" style={{ textAlign: 'center', marginTop: 6 }}>
            <a href="/#/cgu" style={{ color: 'var(--text-dim)' }}>
              {t("Conditions d'utilisation")}
            </a>
            {' · '}
            <a href="/#/report" style={{ color: 'var(--text-dim)' }}>
              {t('Signaler un contenu')}
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
  // Profil diffusé par un ancien bundle, ou fiche de groupe incomplète : les
  // champs peuvent manquer. La page du SPECTATEUR ne doit jamais planter pour
  // ça — c'est l'écran le moins rattrapable de l'application (b170).
  const links = artist.links ?? [];
  return (
    <div className="artisthead">
      {(artist.photo ?? '') !== '' && <img src={artist.photo} alt={artist.name} />}
      <h1 style={{ margin: '10px 0 4px' }}>{artist.name}</h1>
      {(artist.bio ?? '') !== '' && (
        <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
          {artist.bio}
        </p>
      )}
      {showLinks && links.length > 0 && (
        <div className="links">
          {links
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
