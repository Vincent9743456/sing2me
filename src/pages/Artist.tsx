import { LiveBanner } from '../components/LiveBanner';
import React, { useEffect, useMemo, useState } from 'react';

import { Icon } from '../components/Icon';
import { ShareModal } from '../components/ShareModal';
import { AccountSection } from '../components/Account';
import { GearEditor } from '../components/GearEditor';
import { LinkPreviews } from '../components/LinkPreviews';
import { Field, Modal, TopBar } from '../components/ui';
import {
  fetchAudienceSessions,
  fetchLiveStats,
  fetchMessages,
  heartTotals,
  LiveMessage,
  LiveSession,
  LiveStat,
  messagesBySong,
} from '../lib/live';
import { fetchFollowerStats, FollowerStats } from '../lib/fanbase';
import { stripChords } from '../lib/chordpro';
import { pushLive } from '../lib/live';
import { APP_BUILD } from '../version';
import { PublicNameCard } from '../components/PublicNameCard';
import { getValidSession } from '../lib/auth';
import { ensurePublicPage } from '../lib/publicPages';
import { bandToProfile, creatorMember } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { isUpcoming } from './Concerts';
import {
  ArtistProfile,
  defaultPublicScreen,
  emptyBand,
  makeId,
  PublicScreen,
  SharePayload,
  ViewMode,
} from '../types';

/** Libellés des blocs de l'écran public, dans l'ordre d'affichage. */
const PUBLIC_SCREEN_LABELS: { key: keyof PublicScreen; label: string; hint: string }[] = [
  { key: 'songTitle', label: 'Titre du morceau en cours', hint: 'pendant le direct' },
  { key: 'lyrics', label: 'Paroles en direct', hint: 'le cœur du karaoké public' },
  { key: 'hearts', label: 'Cœurs ❤', hint: 'bouton d’envoi + compteur' },
  { key: 'messages', label: 'Messages du public', hint: 'petits mots envoyés pendant le concert' },
  { key: 'tips', label: 'Pourboires', hint: 'si ton lien de paiement est renseigné' },
  { key: 'profile', label: 'Fiche artiste (photo, bio)', hint: 'hors morceau : avant, pause, fin' },
  { key: 'links', label: 'Liens streaming & réseaux', hint: 'avec lecteurs YouTube / Spotify' },
  { key: 'follow', label: 'Bouton « Suivre l’artiste »', hint: 'alertes de tes prochains concerts' },
  { key: 'appInvite', label: 'Invitation à découvrir Sing2Me', hint: 'discrète, pause et fin seulement' },
];

const LINK_PRESETS = [
  'Spotify',
  'Apple Music',
  'Deezer',
  'YouTube',
  'Instagram',
  'Facebook',
  'TikTok',
  'Site web',
];

/** Réduit une photo en data-URL compacte (partage + stockage). */
async function resizePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image illisible'));
      img.src = url;
    });
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponible');
    const min = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - min) / 2,
      (img.height - min) / 2,
      min,
      min,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Artist() {
  const {
    artist,
    saveArtist,
    concerts,
    prefs,
    savePrefs,
    bands,
    saveBand,
    deleteBand,
    setlists,
    songs,
    saveSong,
  } = useStore();
  const [draft, setDraft] = useState<ArtistProfile>(() => ({
    ...artist,
    links: artist.links.map((l) => ({ ...l })),
  }));
  const [share, setShare] = useState(false);
  const [saved, setSaved] = useState(false);
  // Vue par défaut = profil mis en forme (ce que voit le public) ; « Modifier »
  // ouvre le formulaire complet. Profil vide → « Créer le profil artiste ».
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<LiveStat[] | null>(null);
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [followers, setFollowers] = useState<FollowerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMessage[] | null>(null);


  const payload = useMemo<SharePayload | null>(() => {
    if (draft.name.trim() === '') return null;
    return {
      v: 1,
      type: 'artist',
      view: 'paroles',
      // Le matériel reste privé : jamais dans la page publique
      artist: { ...draft, gear: undefined },
      concerts: concerts
        .filter((c) => c.visibility === 'public' && isUpcoming(c))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map((c) => ({ title: c.title, date: c.date, time: c.time, venue: c.venue })),
    };
  }, [draft, concerts]);

  function update(patch: Partial<ArtistProfile>) {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  }

  const [publicPreview, setPublicPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'idle' | 'live' | 'pause'>(
    'idle',
  );
  const screen = { ...defaultPublicScreen(), ...(draft.publicScreen ?? {}) };
  function toggleScreen(key: keyof PublicScreen) {
    update({ publicScreen: { ...screen, [key]: !screen[key] } });
  }

  // Qui apparaît sur le QR : moi (solo) ou un de mes groupes. Même
  // réglage que le panneau ON AIR (choix partagé).
  const [who, setWho] = useState(
    () => localStorage.getItem('sing2me/onairWho') || 'solo',
  );
  // Groupe supprimé entre-temps → retour automatique sur « moi » :
  // sinon la page publique resterait figée sur l'identité fantôme.
  useEffect(() => {
    if (who !== 'solo' && !bands.some((b) => b.id === who)) {
      setWho('solo');
      localStorage.setItem('sing2me/onairWho', 'solo');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, bands.length]);
  const [whoBusy, setWhoBusy] = useState(false);
  const [whoMsg, setWhoMsg] = useState<string | null>(null);
  const whoProfile: ArtistProfile =
    who === 'solo'
      ? draft
      : (() => {
          const b = bands.find((x) => x.id === who);
          return b ? bandToProfile(b) : draft;
        })();
  /** Pousse l'identité + réglages actuels vers la page publique du QR. */
  async function pushPublic(value: string) {
    setWhoMsg(null);
    const onair = localStorage.getItem('sing2me/onair') || 'off';
    if (onair !== 'off' || prefs.liveKey.trim() === '') {
      setWhoMsg(
        onair !== 'off'
          ? 'Direct en cours : le changement s’appliquera au prochain ON AIR.'
          : 'Renseigne ta clé ON AIR (plus bas) pour mettre la page à jour.',
      );
      return;
    }
    const b = value === 'solo' ? null : bands.find((x) => x.id === value);
    const profile = b ? bandToProfile(b) : draft;
    setWhoBusy(true);
    try {
      await pushLive(prefs.liveKey, {
        status: 'off',
        song: null,
        bandSong: null,
        concert: null,
        artist: {
          ...profile,
          gear: undefined,
          publicScreen: draft.publicScreen,
        },
      });
      setWhoMsg('✓ Page publique mise à jour.');
    } catch (e) {
      setWhoMsg(
        e instanceof Error ? e.message : 'La mise à jour a échoué.',
      );
    } finally {
      setWhoBusy(false);
    }
  }

  async function changeWho(value: string) {
    setWho(value);
    localStorage.setItem('sing2me/onairWho', value);
    await pushPublic(value);
  }
  const upcomingPublic = useMemo(
    () =>
      concerts
        .filter((c) => c.visibility === 'public' && isUpcoming(c))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [concerts],
  );
  const liveUrl = `${location.origin}${location.pathname}#/live`;
  // Exemple « en direct » : un vrai morceau de ta bibliothèque
  const sampleSong = useMemo(
    () => songs.find((s) => s.idea !== true && s.lyrics.trim() !== '') ?? null,
    [songs],
  );
  const sampleLyrics = useMemo(() => {
    if (!sampleSong) return '';
    return stripChords(sampleSong.lyrics)
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(0, 8)
      .join('\n');
  }, [sampleSong]);

  return (
    <>
      <TopBar
        title="Profil artiste"
        right={
          <button
            className="btn icon"
            title="Réglages et paramètres"
            aria-label="Réglages et paramètres"
            onClick={() => navigate('/reglages')}
          >
            <Icon name="sliders" size={20} />
          </button>
        }
      />
      <div className="page">
        <LiveBanner />
        <AccountSection />
        <div className="spacer" />

        {editing && (
          <button
            className="btn ghost small"
            onClick={() => {
              saveArtist(draft);
              setSaved(true);
              setEditing(false);
            }}
          >
            ← Enregistrer et revenir au profil
          </button>
        )}

        {!editing && artist.name.trim() === '' && (
          <div className="empty">
            Ton profil artiste n'est pas encore créé.
            <br />
            Ta photo, ta bio et tes liens apparaîtront sur ta page publique.
            <div className="spacer" />
            <button className="btn" onClick={() => setEditing(true)}>
              Créer le profil artiste
            </button>
            <p className="help" style={{ marginTop: 10 }}>
              Créer ta fiche débloque aussi le mode <strong>ON AIR</strong> :
              tes concerts en direct, avec paroles pour le public.
            </p>
          </div>
        )}

        {!editing && artist.name.trim() !== '' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {artist.photo !== '' ? (
                <img
                  src={artist.photo}
                  alt={artist.name}
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid var(--border)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: '50%',
                    background: 'var(--surface-high)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.4rem',
                  }}
                >
                  ◉
                </div>
              )}
              <h1 style={{ margin: '12px 0 2px', fontSize: '1.4rem' }}>
                {artist.name}
              </h1>
              {artist.bio !== '' ? (
                <p
                  className="help"
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxWidth: 480,
                    margin: '4px auto 0',
                  }}
                >
                  {artist.bio}
                </p>
              ) : (
                <button className="slot" onClick={() => setEditing(true)}>
                  ＋ Ajoute une bio pour te présenter au public
                </button>
              )}
            </div>
            {artist.links.some((l) => l.url.trim() !== '') ? (
              <LinkPreviews links={artist.links} showChips />
            ) : (
              <button className="slot" onClick={() => setEditing(true)}>
                ＋ Ajoute tes liens (Spotify, Instagram, YouTube…)
              </button>
            )}
            {upcomingPublic.length === 0 && (
              <button className="slot" onClick={() => navigate('/concerts')}>
                ＋ Annonce tes prochains concerts
              </button>
            )}
            {upcomingPublic.length > 0 && (
              <>
                <h2 className="pagetitle">Prochains concerts</h2>
                <div className="list">
                  {upcomingPublic.map((c) => (
                    <div
                      className="row"
                      key={c.id}
                      style={{ cursor: 'default' }}
                    >
                      <div className="grow">
                        <div className="title">{c.title}</div>
                        <div className="sub">
                          {c.date}
                          {c.time !== '' ? ` · ${c.time}` : ''}
                          {c.venue !== '' ? ` · ${c.venue}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* Mes groupes : icônes cliquables (accès direct à la fiche). */}
            <h2 className="pagetitle">Mes groupes</h2>
            {bands.length === 0 ? (
              <button className="slot" onClick={() => setEditing(true)}>
                ＋ Crée ou rejoins un groupe pour partager ton répertoire
              </button>
            ) : (
              <div className="bandavatars">
                {bands.map((band) => (
                  <button
                    key={band.id}
                    className="bandavatar"
                    title={`${band.name || 'Groupe'} — ouvrir la fiche`}
                    onClick={() => navigate(`/band/${band.id}`)}
                  >
                    {band.photo !== '' ? (
                      <img src={band.photo} alt="" />
                    ) : (
                      <span aria-hidden="true">👥</span>
                    )}
                    <span className="bandavatar-name">
                      {band.name || '(sans nom)'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="spacer" />
            <div className="rowactions">
              <button className="btn" onClick={() => setEditing(true)}>
                Modifier
              </button>
              <button
                className="btn ghost"
                disabled={payload === null}
                onClick={() => {
                  saveArtist(draft);
                  setShare(true);
                }}
              >
                Page publique / QR
              </button>
            </div>
          </>
        )}

        {editing && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {draft.photo !== '' ? (
            <img
              src={draft.photo}
              alt="Photo de profil"
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--border)',
              }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                background: 'var(--surface-high)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              ◉
            </div>
          )}
          <div className="spacer" />
          <label className="btn ghost small" style={{ cursor: 'pointer' }}>
            {draft.photo !== '' ? 'Changer la photo' : 'Ajouter une photo'}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  update({ photo: await resizePhoto(file) });
                } catch {
                  alert("Cette image n'a pas pu être lue.");
                }
              }}
            />
          </label>
        </div>

        <Field label="Nom d'artiste">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => {
              update({ name: e.target.value });
              // Un seul nom partout : il signe aussi les notes de répétition
              savePrefs({ ...prefs, userName: e.target.value });
            }}
          />
        </Field>
        <Field label="Biographie">
          <textarea
            value={draft.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder="Quelques lignes sur toi ou ton groupe…"
          />
        </Field>

        <h2 className="pagetitle">Lien public</h2>
        <PublicNameCard artist={artist} />

        <h2 className="pagetitle">Écran public (QR)</h2>
        <Field label="Qui apparaît sur la page du QR ?">
          <select
            value={who}
            onChange={(e) => void changeWho(e.target.value)}
            disabled={whoBusy}
          >
            <option value="solo">
              {draft.name !== '' ? `${draft.name} (moi, solo)` : 'Moi (solo)'}
            </option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || 'Groupe sans nom'}
              </option>
            ))}
          </select>
        </Field>
        {whoMsg && <p className="help">{whoMsg}</p>}
        <button
          className="btn ghost small"
          onClick={() => void pushPublic(who)}
          disabled={whoBusy}
          title="Renvoie l'identité et les réglages actuels vers la page du QR (utile si elle affiche encore une ancienne identité)"
        >
          ↻ Mettre à jour la page publique maintenant
        </button>
        <p className="help">
          C'est aussi l'identité proposée au lancement d'un direct (panneau
          ON AIR). Choisis ensuite ce que voient les personnes qui scannent
          ton QR — pendant les morceaux et entre eux. Tout est actif par
          défaut.
        </p>
        {PUBLIC_SCREEN_LABELS.map((item) => (
          <label
            key={item.key}
            className="hstack"
            style={{ padding: '5px 0', cursor: 'pointer', gap: 10 }}
          >
            <input
              type="checkbox"
              checked={screen[item.key]}
              onChange={() => toggleScreen(item.key)}
            />
            <span style={{ flex: 1 }}>
              {item.label}{' '}
              <span className="help" style={{ display: 'inline' }}>
                — {item.hint}
              </span>
            </span>
          </label>
        ))}
        <div className="spacer" />
        <button
          className="btn ghost block"
          onClick={() => setPublicPreview(true)}
          title="Prévisualise la page publique que découvrent les visiteurs de ton QR code"
        >
          👁 Aperçu — ce que verra le public (QR)
        </button>
        <div className="spacer" />
        {publicPreview && (
          <Modal
            title="Ce que voit le public (QR)"
            onClose={() => setPublicPreview(false)}
          >
            <div className="chips" style={{ marginBottom: 10 }}>
              <button
                className={`chip ${previewMode === 'idle' ? '' : 'off'}`}
                onClick={() => setPreviewMode('idle')}
              >
                Hors concert
              </button>
              <button
                className={`chip ${previewMode === 'live' ? '' : 'off'}`}
                onClick={() => setPreviewMode('live')}
              >
                🔴 En direct
              </button>
              <button
                className={`chip ${previewMode === 'pause' ? '' : 'off'}`}
                onClick={() => setPreviewMode('pause')}
              >
                ⏸ Pause
              </button>
            </div>
            <p className="help" style={{ marginTop: 0 }}>
              Identité affichée : <strong>{whoProfile.name || '(à renseigner)'}</strong>{' '}
              — selon tes réglages « Écran public ».
            </p>

            {previewMode === 'live' ? (
              <>
                <div className="livebadge">
                  <span className="dot" /> EN DIRECT
                  {screen.hearts && <span className="livehearts">❤ 27</span>}
                </div>
                {screen.songTitle && (
                  <>
                    <h1 className="livetitle" style={{ fontSize: '1.3rem' }}>
                      {sampleSong?.title ?? 'Titre du morceau'}
                    </h1>
                    {sampleSong && sampleSong.artist !== '' && (
                      <p
                        className="help"
                        style={{ textAlign: 'center', marginTop: 0 }}
                      >
                        {sampleSong.artist}
                      </p>
                    )}
                  </>
                )}
                {screen.lyrics ? (
                  <div
                    className="livelyrics"
                    style={{
                      fontSize: '0.95rem',
                      maxHeight: 180,
                      overflow: 'hidden',
                    }}
                  >
                    {sampleLyrics ||
                      'Les paroles du morceau joué\ns’affichent ici, en direct,\nvers après vers…'}
                  </div>
                ) : (
                  <p style={{ textAlign: 'center' }}>
                    🎶 Concert en cours — profitez du moment !
                  </p>
                )}
                {screen.tips && (
                  <div style={{ textAlign: 'center', margin: '10px 0' }}>
                    <div className="help" style={{ marginBottom: 6 }}>
                      💛 Un pourboire pour {whoProfile.name || 'l’artiste'} ?
                    </div>
                    <div
                      className="hstack"
                      style={{
                        justifyContent: 'center',
                        gap: 8,
                        pointerEvents: 'none',
                      }}
                    >
                      <span className="btn ghost small">2 €</span>
                      <span className="btn ghost small">5 €</span>
                      <span className="btn ghost small">10 €</span>
                      <span className="btn ghost small">Libre</span>
                    </div>
                    {draft.tipUrl === '' && (
                      <p className="help" style={{ marginTop: 4 }}>
                        (visible seulement si ton lien de pourboire est
                        renseigné)
                      </p>
                    )}
                  </div>
                )}
                {screen.messages && (
                  <div
                    className="card"
                    style={{ pointerEvents: 'none', textAlign: 'center' }}
                  >
                    💬 <strong>Un mot pour les musiciens ?</strong>
                    <div
                      className="help"
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        margin: '6px auto 0',
                        maxWidth: 260,
                        textAlign: 'left',
                      }}
                    >
                      Bravo pour ce concert !…
                    </div>
                  </div>
                )}
                {screen.hearts && (
                  <div style={{ textAlign: 'right', marginTop: 8 }}>
                    <span
                      className="heartfab"
                      style={{
                        position: 'static',
                        display: 'inline-flex',
                        pointerEvents: 'none',
                      }}
                    >
                      ❤
                    </span>
                    <div className="help">bouton d'envoi de cœurs</div>
                  </div>
                )}
              </>
            ) : (
              <>
                {previewMode === 'pause' && (
                  <>
                    <div className="livebadge pause">⏸ PAUSE</div>
                    <p style={{ textAlign: 'center' }}>
                      Le concert reprend dans un instant…
                    </p>
                  </>
                )}
                {screen.profile ? (
                  <div className="artisthead" style={{ textAlign: 'center' }}>
                    {whoProfile.photo !== '' && (
                      <img
                        src={whoProfile.photo}
                        alt={whoProfile.name}
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: '50%',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <h1 style={{ margin: '10px 0 4px' }}>
                      {whoProfile.name || '(nom à renseigner)'}
                    </h1>
                    {whoProfile.bio !== '' && (
                      <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
                        {whoProfile.bio}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="help" style={{ textAlign: 'center' }}>
                    (fiche artiste masquée par tes réglages)
                  </p>
                )}
                {previewMode === 'idle' && screen.follow && (
                  <p style={{ textAlign: 'center' }}>
                    <span className="btn" style={{ pointerEvents: 'none' }}>
                      ⭐ Suivre {whoProfile.name || 'l’artiste'}
                    </span>
                  </p>
                )}
                {screen.links && (
                  <LinkPreviews links={whoProfile.links} showChips />
                )}
                {screen.messages && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    💬 « Un mot pour les musiciens ? »
                  </p>
                )}
                {screen.tips && whoProfile.tipUrl !== '' && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    💛 Pourboire : 2 € · 5 € · 10 € · libre
                  </p>
                )}
                {screen.appInvite && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    🎵 « Téléchargez Sing2Me — votre songbook, gratuit »
                  </p>
                )}
                {previewMode === 'idle' && upcomingPublic.length > 0 && (
                  <>
                    <div className="help" style={{ margin: '10px 0 6px' }}>
                      PROCHAINS CONCERTS (publics)
                    </div>
                    {upcomingPublic.map((c) => (
                      <div
                        className="help"
                        key={c.id}
                        style={{ padding: '2px 0' }}
                      >
                        📅 {c.date}
                        {c.time !== '' ? ` · ${c.time}` : ''} — {c.title}
                        {c.venue !== '' ? ` · ${c.venue}` : ''}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
            <div className="spacer" />
            <a
              className="btn block"
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              Ouvrir la vraie page dans un nouvel onglet →
            </a>
            <p className="help" style={{ textAlign: 'center' }}>
              (l'adresse exacte de ton QR : {liveUrl})
            </p>
          </Modal>
        )}

        <h2 className="pagetitle">Mes groupes</h2>
        <p className="help">
          Les groupes ont désormais leur onglet dédié 👥 dans la barre de
          navigation — fiche, membres, répertoire partagé et discussion.
        </p>
        <p className="help">
          Clique sur un groupe pour gérer son profil public, ses musiciens et
          les invitations.
        </p>
        <div className="list">
          {bands.map((band) => (
            <div
              className="row"
              key={band.id}
              onClick={() => navigate(`/band/${band.id}`)}
            >
              {band.photo !== '' ? (
                <img
                  src={band.photo}
                  alt=""
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <span style={{ fontSize: '1.3rem' }}>👥</span>
              )}
              <div className="grow">
                <div className="title">{band.name || '(sans nom)'}</div>
                <div className="sub">
                  {band.members.length} musicien
                  {band.members.length > 1 ? 's' : ''}
                  {band.members.length > 0
                    ? ` · ${band.members
                        .map((m) => m.name)
                        .filter((n) => n !== '')
                        .join(', ')}`
                    : ''}
                </div>
              </div>
              <span className="chevron">›</span>
            </div>
          ))}
        </div>
        <div className="spacer" />
        <button
          className="btn ghost"
          onClick={() => {
            // Le créateur est automatiquement le premier musicien du groupe
            const b = {
              ...emptyBand(),
              name: 'Mon groupe',
              owned: true,
              members: [creatorMember(draft, prefs.userName)],
            };
            saveBand(b);
            navigate(`/band/${b.id}`);
          }}
        >
          ＋ Créer un groupe
        </button>
        <div className="spacer" />

        <h2 className="pagetitle">Mon matériel</h2>
        <p className="help">
          Instruments, micros, amplis, effets, câbles… Ton inventaire
          personnel (privé) — les setlists peuvent ensuite y piocher pour
          préparer la scène et vérifier que rien ne manque.
        </p>
        <GearEditor
          items={draft.gear ?? []}
          onChange={(gear) => update({ gear })}
        />
        <div className="spacer" />

        <h2 className="pagetitle">Pourboires</h2>
        <p className="help">
          Ton lien de paiement (PayPal.me, Lydia, Revolut, Stripe…). Le public
          pourra te soutenir en 2 clics depuis la page du direct (2 € / 5 € /
          10 € / libre).
        </p>
        <input
          type="url"
          value={draft.tipUrl}
          placeholder="https://paypal.me/toncompte"
          onChange={(e) => update({ tipUrl: e.target.value })}
        />
        <div className="spacer" />

        <h2 className="pagetitle">Mode ON AIR</h2>
        {import.meta.env.VITE_LIVE_KEY ? (
          <p className="help">
            Le direct est configuré automatiquement — rien à saisir. Touche le
            bouton ON AIR pour lancer le partage avec le public.
          </p>
        ) : (
          <>
            <p className="help">
              Ta clé secrète du direct — identique à la variable LIVE_KEY
              configurée sur Vercel. Elle autorise ton appareil à piloter le
              direct (bouton ON AIR).
            </p>
            <input
              type="text"
              value={prefs.liveKey}
              placeholder="ma-cle-secrete"
              onChange={(e) => savePrefs({ ...prefs, liveKey: e.target.value })}
            />
          </>
        )}
        <div className="spacer" />

        <h2 className="pagetitle">Statistiques des directs</h2>
        <p className="help">
          Les ❤ envoyés par le public, morceau par morceau, et l'audience de
          tes concerts (spectateurs uniques).
        </p>
        <button
          className="btn ghost small"
          onClick={async () => {
            setStatsError(null);
            try {
              setStats(await fetchLiveStats(prefs.liveKey));
              setMessages(await fetchMessages(prefs.liveKey));
              setSessions(await fetchAudienceSessions(prefs.liveKey));
              setFollowers(
                await fetchFollowerStats(prefs.liveKey, artist.name),
              );
            } catch (e) {
              setStatsError(
                e instanceof Error ? e.message : 'Chargement impossible.',
              );
            }
          }}
        >
          Voir les statistiques
        </button>
        {statsError && (
          <p style={{ color: 'var(--danger)' }}>{statsError}</p>
        )}
        {followers !== null && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="help" style={{ marginBottom: 4 }}>
              ⭐ TA FANBASE
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {followers.count} suiveur{followers.count > 1 ? 's' : ''}
            </div>
            {followers.sharedEmails.length > 0 && (
              <>
                <p className="help" style={{ marginTop: 8, marginBottom: 4 }}>
                  Emails partagés avec toi ({followers.sharedEmails.length}) :
                </p>
                <div className="help" style={{ wordBreak: 'break-all' }}>
                  {followers.sharedEmails.join(', ')}
                </div>
              </>
            )}
          </div>
        )}
        {sessions !== null && sessions.length > 0 && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="help" style={{ marginBottom: 8 }}>
              👥 AUDIENCE DE TES CONCERTS
            </div>
            {sessions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span>
                  {new Date(s.started_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  {new Date(s.started_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {s.ended_at === null && (
                    <em className="stauthor"> · en cours</em>
                  )}
                </span>
                <strong style={{ whiteSpace: 'nowrap' }}>
                  {s.uniques} spectateur{s.uniques > 1 ? 's' : ''}
                </strong>
              </div>
            ))}
          </div>
        )}
        {messages !== null && messages.length > 0 && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="help" style={{ marginBottom: 8 }}>
              💬 MESSAGES DU PUBLIC
            </div>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                « {m.body} »
                <div className="stauthor">
                  — {m.author !== '' ? m.author : 'anonyme'} ·{' '}
                  {new Date(m.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  {new Date(m.created_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {m.song_title !== '' && <> · pendant « {m.song_title} »</>}
                  {m.performer !== '' && <> · {m.performer}</>}
                </div>
              </div>
            ))}
          </div>
        )}
        {stats !== null && stats.length > 0 && (
          <button
            className="btn ghost small"
            style={{ marginTop: 10 }}
            onClick={() => {
              const totals = heartTotals(stats);
              const bySong = messagesBySong(messages ?? []);
              let n = 0;
              for (const s of songs) {
                const total = totals.get(s.title);
                const known = new Set(s.fanMessages.map((m) => m.id));
                const fresh = bySong
                  .get(s.title)
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
                  n++;
                }
              }
              alert(
                n > 0
                  ? `❤ et messages reportés sur ${n} morceau${n > 1 ? 'x' : ''}.`
                  : 'La bibliothèque est déjà à jour.',
              );
            }}
          >
            ↻ Reporter ❤ et messages dans la bibliothèque
          </button>
        )}
        {stats !== null && (
          <div className="card" style={{ marginTop: 10 }}>
            {stats.length === 0 && (
              <p className="help">Pas encore de données — lance un direct !</p>
            )}
            {stats.map((st, i) => (
              <div className="strow" key={i}>
                <span className="stlabel">
                  {new Date(st.played_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span style={{ flex: 1 }}>
                  {st.song_title}
                  {st.concert_title !== '' && (
                    <span className="stauthor"> · {st.concert_title}</span>
                  )}
                </span>
                <span style={{ color: 'var(--live)', fontWeight: 700 }}>
                  ❤ {st.hearts}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="spacer" />

        <h2 className="pagetitle">Streaming & réseaux</h2>
        {draft.links.map((link) => (
          <div key={link.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              list="link-presets"
              value={link.label}
              placeholder="Spotify, Instagram…"
              style={{ flex: '0 0 132px' }}
              onChange={(e) =>
                update({
                  links: draft.links.map((l) =>
                    l.id === link.id ? { ...l, label: e.target.value } : l,
                  ),
                })
              }
            />
            <input
              type="url"
              value={link.url}
              placeholder="https://…"
              onChange={(e) =>
                update({
                  links: draft.links.map((l) =>
                    l.id === link.id ? { ...l, url: e.target.value } : l,
                  ),
                })
              }
            />
            <button
              className="btn ghost small"
              style={{ color: 'var(--danger)' }}
              onClick={() =>
                update({ links: draft.links.filter((l) => l.id !== link.id) })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <datalist id="link-presets">
          {LINK_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <button
          className="btn ghost block"
          onClick={() =>
            update({
              links: [...draft.links, { id: makeId(), label: '', url: '' }],
            })
          }
        >
          ＋ Ajouter un lien
        </button>

        {draft.links.some((l) => l.url.trim() !== '') && (
          <>
            <p className="help" style={{ marginTop: 12 }}>
              Aperçu — ce que verra le public (la vidéo YouTube se regarde et
              le lien Spotify s'écoute directement) :
            </p>
            <LinkPreviews links={draft.links} />
          </>
        )}

        <div className="rowactions">
          <button
            className="btn"
            onClick={() => {
              saveArtist(draft);
              setSaved(true);
              setEditing(false);
              // La fiche publique suit le profil (b136) : elle est republiée
              // sous le nom déjà réservé, ou un nom dérivé du nom d'artiste
              // est réservé automatiquement. Best-effort, jamais bloquant.
              void (async () => {
                const s = await getValidSession();
                if (s) await ensurePublicPage(s, draft);
              })();
            }}
          >
            {saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
          <button
            className="btn ghost"
            disabled={payload === null}
            onClick={() => {
              saveArtist(draft);
              setShare(true);
            }}
          >
            Page publique / QR
          </button>
        </div>
        <p className="help">
          La page publique montre ta photo, ta bio, tes liens de streaming et
          tes prochains concerts publics. Partage-la avec ton public via le QR
          code ou le lien.
        </p>
          </>
        )}
        <p
          className="help"
          style={{ textAlign: 'center', opacity: 0.6, marginTop: 24 }}
        >
          Sing2Me — version du {APP_BUILD}
        </p>
      </div>

      {share && payload && (
        <ShareModal
          title={`Page publique de ${draft.name}`}
          payload={payload}
          onClose={() => setShare(false)}
        />
      )}
    </>
  );
}
