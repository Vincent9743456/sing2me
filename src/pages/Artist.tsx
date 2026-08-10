import { LiveBanner } from '../components/LiveBanner';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../components/Icon';
import { PublicPagePeek } from '../components/PublicPagePeek';
import { ProfilRestore } from '../components/ProfilRestore';
import { AccountSection } from '../components/Account';
import { GearEditor } from '../components/GearEditor';
import { LinkPreviews } from '../components/LinkPreviews';
import { LiveStats } from '../components/LiveStats';
import { liveReady } from '../lib/liveAuth';
import { Field, Modal, TopBar } from '../components/ui';
import { t } from '../i18n';
import { stripChords } from '../lib/chordpro';
import { pushLive } from '../lib/live';
import { APP_BUILD } from '../version';
import { PublicLyrics } from '../components/PublicLyrics';
import { PublicNameCard } from '../components/PublicNameCard';
import { findPublicPageByArtist, monAdressePublique } from '../lib/publicPages';
import { getValidSession } from '../lib/auth';
import {
  ensurePublicPage,
  profilAPublier,
  publierFichesGroupes,
} from '../lib/publicPages';
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
  { key: 'appInvite', label: 'Invitation à découvrir DodoSongs', hint: 'discrète, pause et fin seulement' },
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
  /**
   * MON ADRESSE PUBLIQUE (b245). `null` tant qu'on la cherche : le cache
   * local se vide sans que l'adresse bouge côté serveur, et l'aperçu
   * annonçait alors « pas encore réservée » à quelqu'un qui en avait une
   * (écran envoyé par Vincent). On la demande à l'ouverture de l'écran — donc
   * elle est prête avant qu'on appuie, et le cache est recalé pour tout le
   * reste de l'app (QR du panneau ON AIR, carte du lien public).
   */
  const [adressePublique, setAdressePublique] = useState<string | null>(null);
  /**
   * Une page existe-t-elle sous mon NOM alors que ce compte n'a réservé
   * aucune adresse (b246) ? C'est le seul cas où « pas encore réservée » est
   * vrai mais trompeur : la page est bien là, elle appartient à un autre
   * compte — typiquement après une reconnexion avec une autre adresse
   * e-mail. Le dire vaut mieux que laisser chercher.
   */
  const [pageHomonyme, setPageHomonyme] = useState('');
  useEffect(() => {
    let annule = false;
    void (async () => {
      const nom = await monAdressePublique();
      if (annule) return;
      setAdressePublique(nom);
      if (nom !== '') return;
      const autre = await findPublicPageByArtist(artist.name ?? '');
      if (!annule && autre) setPageHomonyme(autre.name);
    })();
    return () => {
      annule = true;
    };
    // Une seule recherche par ouverture de l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Vue par défaut = profil mis en forme (ce que voit le public) ; « Modifier »
  // ouvre le formulaire complet. Profil vide → « Créer le profil artiste ».
  const [editing, setEditing] = useState(false);

  /**
   * LE BROUILLON SUIT LE PROFIL (b243, perte de données signalée par Vincent :
   * « je me suis déconnecté et reconnecté, j'ai perdu les informations de
   * profil, photo, liens… »).
   *
   * `draft` était figé au MONTAGE de l'écran. Or la synchro de connexion
   * arrive APRÈS : le store recevait le vrai profil, le brouillon gardait
   * l'ancien — et le premier `saveArtist(draft)` le réécrivait par-dessus,
   * avec un horodatage tout neuf. Le profil vide gagnait alors la fusion
   * suivante et partait écraser le cloud : la perte devenait définitive, sur
   * tous les appareils.
   *
   * On resynchronise donc dès que le profil enregistré change SOUS l'écran —
   * jamais pendant qu'on édite, sinon la synchro effacerait ce qu'on est en
   * train de taper.
   */
  const profilRef = useRef(JSON.stringify(artist));
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    const signature = JSON.stringify(artist);
    if (signature === profilRef.current) return;
    profilRef.current = signature;
    if (editingRef.current) return;
    setDraft({ ...artist, links: (artist.links ?? []).map((l) => ({ ...l })) });
  }, [artist]);


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
    if (onair !== 'off' || !liveReady(prefs.liveKey)) {
      setWhoMsg(
        onair !== 'off'
          ? t(
              'Direct en cours : le changement s’appliquera au prochain ON AIR.',
            )
          : t(
              'Renseigne ta clé ON AIR (plus bas) pour mettre la page à jour.',
            ),
      );
      return;
    }
    const choisi = value === 'solo' ? null : bands.find((x) => x.id === value);
    // Masqué au public = jamais publié sous son nom (b227).
    const b = choisi?.hiddenFromPublic === true ? null : choisi;
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
      setWhoMsg(t('✓ Page publique mise à jour.'));
    } catch (e) {
      setWhoMsg(
        e instanceof Error ? e.message : t('La mise à jour a échoué.'),
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
        title={t('Profil artiste')}
        right={
          <button
            className="btn icon"
            title={t('Réglages et paramètres')}
            aria-label={t('Réglages et paramètres')}
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
            ← {t('Enregistrer et revenir au profil')}
          </button>
        )}

        {/* Filet de récupération (b243) : la fiche PUBLIÉE garde une copie
            complète du profil. Si le profil local a perdu des champs qu'elle
            a encore, on le dit et on propose de les rendre — seulement ceux
            qui manquent, jamais par-dessus ce qui est là. La bannière se
            lève toute seule quand il n'y a plus rien à rendre (règle 11). */}
        {!editing && (
          <ProfilRestore
            artist={artist}
            onRestore={(champs) => {
              const rendu = { ...artist, ...champs };
              saveArtist(rendu);
              setDraft({
                ...rendu,
                links: (rendu.links ?? []).map((l) => ({ ...l })),
              });
            }}
          />
        )}

        {!editing && artist.name.trim() === '' && (
          <div className="empty">
            {t("Ton profil artiste n'est pas encore créé.")}
            <br />
            {t('Ta photo, ta bio et tes liens apparaîtront sur ta page publique.')}
            <div className="spacer" />
            <button className="btn" onClick={() => setEditing(true)}>
              {t('Créer le profil artiste')}
            </button>
            <p className="help" style={{ marginTop: 10 }}>
              {t('Créer ta fiche débloque aussi le mode')}{' '}
              <strong>ON AIR</strong>{' '}
              {t(': tes concerts en direct, avec paroles pour le public.')}
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
                  ＋ {t('Ajoute une bio pour te présenter au public')}
                </button>
              )}
            </div>
            {artist.links.some((l) => l.url.trim() !== '') ? (
              <LinkPreviews links={artist.links} showChips />
            ) : (
              <button className="slot" onClick={() => setEditing(true)}>
                ＋ {t('Ajoute tes liens (Spotify, Instagram, YouTube…)')}
              </button>
            )}
            {upcomingPublic.length === 0 && (
              <button className="slot" onClick={() => navigate('/concerts')}>
                ＋ {t('Annonce tes prochains concerts')}
              </button>
            )}
            {upcomingPublic.length > 0 && (
              <>
                <h2 className="pagetitle">{t('Prochains concerts')}</h2>
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
            {/* Les chiffres des directs, visibles SANS passer par « Modifier »
                (b171). Privés : cette page vit dans l'app, jamais sur le QR. */}
            <LiveStats />
            {/* Mes groupes : icônes cliquables (accès direct à la fiche). */}
            <h2 className="pagetitle">{t('Mes groupes')}</h2>
            {bands.length === 0 ? (
              <button className="slot" onClick={() => setEditing(true)}>
                ＋ {t('Crée ou rejoins un groupe pour partager ton répertoire')}
              </button>
            ) : (
              <div className="bandavatars">
                {bands.map((band) => (
                  <button
                    key={band.id}
                    /* Groupe masqué = en transparence (b230, demande de
                       Vincent) : cet écran donne l'identité publique de
                       l'artiste, il doit donc distinguer ce que le public
                       verra de ce qu'il ne verra pas. */
                    className={`bandavatar${band.hiddenFromPublic === true ? ' masque' : ''}`}
                    title={
                      band.hiddenFromPublic === true
                        ? t('{nom} — masqué au public', {
                            nom: band.name || t('Groupe'),
                          })
                        : t('{nom} — ouvrir la fiche', {
                            nom: band.name || t('Groupe'),
                          })
                    }
                    onClick={() => navigate(`/band/${band.id}`)}
                  >
                    {band.photo !== '' ? (
                      <img src={band.photo} alt="" />
                    ) : (
                      <span aria-hidden="true">👥</span>
                    )}
                    <span className="bandavatar-name">
                      {band.name || t('(sans nom)')}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {bands.some((b) => b.hiddenFromPublic === true) && (
              <p className="help" style={{ marginTop: 'var(--sp-2)' }}>
                {t(
                  'Les groupes en transparence sont masqués au public : ils n’apparaissent pas sur ta page publique et ne peuvent pas porter un direct. Un appui sur l’œil, dans l’onglet Groupes, les rend visibles.',
                )}
              </p>
            )}
            <div className="spacer" />
            <div className="rowactions">
              <button className="btn" onClick={() => setEditing(true)}>
                {t('Modifier')}
              </button>
              <button
                className="btn ghost"
                disabled={payload === null}
                /* Consulter n'est pas enregistrer (b243) : ce bouton écrivait
                   `draft` au passage, ce qui suffisait à réécrire le profil
                   par un brouillon périmé. L'aperçu republie de toute façon
                   depuis le profil ENREGISTRÉ. */
                onClick={() => setShare(true)}
              >
                {t('Page publique / QR')}
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
            {draft.photo !== ''
              ? t('Changer la photo')
              : t('Ajouter une photo')}
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
                  alert(t("Cette image n'a pas pu être lue."));
                }
              }}
            />
          </label>
        </div>

        <Field label={t("Nom d'artiste")}>
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
        <Field label={t('Biographie')}>
          <textarea
            value={draft.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder={t('Quelques lignes sur toi ou ton groupe…')}
          />
        </Field>

        <h2 className="pagetitle">{t('Lien public')}</h2>
        <PublicNameCard artist={artist} />

        <h2 className="pagetitle">{t('Écran public (QR)')}</h2>
        <Field label={t('Qui apparaît sur la page du QR ?')}>
          <select
            value={who}
            onChange={(e) => void changeWho(e.target.value)}
            disabled={whoBusy}
          >
            <option value="solo">
              {draft.name !== ''
                ? t('{nom} (moi, solo)', { nom: draft.name })
                : t('Moi (solo)')}
            </option>
            {/* Un groupe masqué ne s'affiche pas ici : le masquer, c'est
                justement ne pas l'exposer au public (b227). */}
            {bands
              .filter((b) => b.hiddenFromPublic !== true)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || t('Groupe sans nom')}
                </option>
              ))}
          </select>
        </Field>
        {whoMsg && <p className="help">{whoMsg}</p>}
        <button
          className="btn ghost small"
          onClick={() => void pushPublic(who)}
          disabled={whoBusy}
          title={t(
            "Renvoie l'identité et les réglages actuels vers la page du QR (utile si elle affiche encore une ancienne identité)",
          )}
        >
          ↻ {t('Mettre à jour la page publique maintenant')}
        </button>
        <p className="help">
          {t(
            "C'est aussi l'identité proposée au lancement d'un direct (panneau ON AIR). Choisis ensuite ce que voient les personnes qui scannent ton QR — pendant les morceaux et entre eux. Tout est actif par défaut.",
          )}
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
              {t(item.label)}{' '}
              <span className="help" style={{ display: 'inline' }}>
                — {t(item.hint)}
              </span>
            </span>
          </label>
        ))}
        <div className="spacer" />
        <button
          className="btn ghost block"
          onClick={() => setPublicPreview(true)}
          title={t(
            'Prévisualise la page publique que découvrent les visiteurs de ton QR code',
          )}
        >
          👁 {t('Aperçu — ce que verra le public (QR)')}
        </button>
        <div className="spacer" />
        {publicPreview && (
          <Modal
            title={t('Ce que voit le public (QR)')}
            onClose={() => setPublicPreview(false)}
          >
            <div className="chips" style={{ marginBottom: 10 }}>
              <button
                className={`chip ${previewMode === 'idle' ? '' : 'off'}`}
                onClick={() => setPreviewMode('idle')}
              >
                {t('Hors concert')}
              </button>
              <button
                className={`chip ${previewMode === 'live' ? '' : 'off'}`}
                onClick={() => setPreviewMode('live')}
              >
                🔴 {t('En direct')}
              </button>
              <button
                className={`chip ${previewMode === 'pause' ? '' : 'off'}`}
                onClick={() => setPreviewMode('pause')}
              >
                ⏸ {t('Pause')}
              </button>
            </div>
            <p className="help" style={{ marginTop: 0 }}>
              {t('Identité affichée :')}{' '}
              <strong>{whoProfile.name || t('(à renseigner)')}</strong>{' '}
              {t('— selon tes réglages « Écran public ».')}
            </p>

            {previewMode === 'live' ? (
              <>
                <div className="livebadge">
                  <span className="dot" /> {t('EN DIRECT')}
                  {screen.hearts && <span className="livehearts">❤ 27</span>}
                </div>
                {screen.songTitle && (
                  <>
                    <h1 className="livetitle" style={{ fontSize: '1.3rem' }}>
                      {sampleSong?.title ?? t('Titre du morceau')}
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
                  <PublicLyrics
                    text={
                      sampleLyrics ||
                      t(
                        'Les paroles du morceau joué\ns’affichent ici, en direct,\nvers après vers…',
                      )
                    }
                    style={{
                      fontSize: '0.95rem',
                      maxHeight: 180,
                      overflow: 'hidden',
                    }}
                  />
                ) : (
                  <p style={{ textAlign: 'center' }}>
                    {t('🎶 Concert en cours — profitez du moment !')}
                  </p>
                )}
                {screen.tips && (
                  <div style={{ textAlign: 'center', margin: '10px 0' }}>
                    <div className="help" style={{ marginBottom: 6 }}>
                      {t('💛 Un pourboire pour {nom} ?', {
                        nom: whoProfile.name || t('l’artiste'),
                      })}
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
                      <span className="btn ghost small">{t('Libre')}</span>
                    </div>
                    {draft.tipUrl === '' && (
                      <p className="help" style={{ marginTop: 4 }}>
                        {t(
                          '(visible seulement si ton lien de pourboire est renseigné)',
                        )}
                      </p>
                    )}
                  </div>
                )}
                {screen.messages && (
                  <div
                    className="card"
                    style={{ pointerEvents: 'none', textAlign: 'center' }}
                  >
                    💬 <strong>{t('Un mot pour les musiciens ?')}</strong>
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
                      {t('Bravo pour ce concert !…')}
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
                    <div className="help">{t("bouton d'envoi de cœurs")}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                {previewMode === 'pause' && (
                  <>
                    <div className="livebadge pause">⏸ {t('PAUSE')}</div>
                    <p style={{ textAlign: 'center' }}>
                      {t('Le concert reprend dans un instant…')}
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
                      {whoProfile.name || t('(nom à renseigner)')}
                    </h1>
                    {whoProfile.bio !== '' && (
                      <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
                        {whoProfile.bio}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="help" style={{ textAlign: 'center' }}>
                    {t('(fiche artiste masquée par tes réglages)')}
                  </p>
                )}
                {previewMode === 'idle' && screen.follow && (
                  <p style={{ textAlign: 'center' }}>
                    <span className="btn" style={{ pointerEvents: 'none' }}>
                      {t('⭐ Suivre {nom}', {
                        nom: whoProfile.name || t('l’artiste'),
                      })}
                    </span>
                  </p>
                )}
                {screen.links && (
                  <LinkPreviews links={whoProfile.links} showChips />
                )}
                {screen.messages && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    {t('💬 « Un mot pour les musiciens ? »')}
                  </p>
                )}
                {screen.tips && whoProfile.tipUrl !== '' && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    {t('💛 Pourboire : 2 € · 5 € · 10 € · libre')}
                  </p>
                )}
                {screen.appInvite && (
                  <p className="help" style={{ textAlign: 'center' }}>
                    {t('🎵 « Téléchargez DodoSongs — votre songbook, gratuit »')}
                  </p>
                )}
                {previewMode === 'idle' && upcomingPublic.length > 0 && (
                  <>
                    <div className="help" style={{ margin: '10px 0 6px' }}>
                      {t('PROCHAINS CONCERTS (publics)')}
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
              {t('Ouvrir la vraie page dans un nouvel onglet →')}
            </a>
            <p className="help" style={{ textAlign: 'center' }}>
              {t("(l'adresse exacte de ton QR : {url})", { url: liveUrl })}
            </p>
          </Modal>
        )}

        <h2 className="pagetitle">{t('Mes groupes')}</h2>
        <p className="help">
          {t(
            'Les groupes ont désormais leur onglet dédié 👥 dans la barre de navigation — fiche, membres, répertoire partagé et discussion.',
          )}
        </p>
        <p className="help">
          {t(
            'Clique sur un groupe pour gérer son profil public, ses musiciens et les invitations.',
          )}
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
                <div className="title">{band.name || t('(sans nom)')}</div>
                <div className="sub">
                  {band.members.length > 1
                    ? t('{n} musiciens', { n: band.members.length })
                    : t('{n} musicien', { n: band.members.length })}
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
              name: t('Mon groupe'),
              owned: true,
              members: [creatorMember(draft, prefs.userName)],
            };
            saveBand(b);
            navigate(`/band/${b.id}`);
          }}
        >
          ＋ {t('Créer un groupe')}
        </button>
        <div className="spacer" />

        <h2 className="pagetitle">{t('Mon matériel')}</h2>
        <p className="help">
          {t(
            'Instruments, micros, amplis, effets, câbles… Ton inventaire personnel (privé) — les setlists peuvent ensuite y piocher pour préparer la scène et vérifier que rien ne manque.',
          )}
        </p>
        <GearEditor
          items={draft.gear ?? []}
          onChange={(gear) => update({ gear })}
        />
        <div className="spacer" />

        <h2 className="pagetitle">{t('Pourboires')}</h2>
        <p className="help">
          {t(
            'Ton lien de paiement (PayPal.me, Lydia, Revolut, Stripe…). Le public pourra te soutenir en 2 clics depuis la page du direct (2 € / 5 € / 10 € / libre).',
          )}
        </p>
        <input
          type="url"
          value={draft.tipUrl}
          placeholder="https://paypal.me/toncompte"
          onChange={(e) => update({ tipUrl: e.target.value })}
        />
        <div className="spacer" />

        <h2 className="pagetitle">{t('Mode ON AIR')}</h2>
        {/* b192 : c'est le COMPTE qui autorise le direct. La clé n'est plus
            demandée à personne — elle n'est acceptée que le temps que les
            applications installées se mettent à jour. */}
        {liveReady(prefs.liveKey) ? (
          <p className="help">
            {t(
              'Ton compte suffit : touche le bouton ON AIR pour lancer le partage avec le public.',
            )}
          </p>
        ) : (
          <>
            <p className="help">
              {t(
                'Ta clé secrète du direct — identique à la variable LIVE_KEY configurée sur Vercel. Elle autorise ton appareil à piloter le direct (bouton ON AIR).',
              )}
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

        <h2 className="pagetitle">{t('Streaming & réseaux')}</h2>
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
          ＋ {t('Ajouter un lien')}
        </button>

        {draft.links.some((l) => l.url.trim() !== '') && (
          <>
            <p className="help" style={{ marginTop: 12 }}>
              {t(
                "Aperçu — ce que verra le public (la vidéo YouTube se regarde et le lien Spotify s'écoute directement) :",
              )}
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
                if (!s) return;
                // La fiche part avec les groupes NON masqués (b231)…
                await ensurePublicPage(s, await profilAPublier(draft, bands));
                // …et les fiches de mes groupes se rafraîchissent (b232) :
                // ma photo y figure comme musicien, elle vient de changer.
                await publierFichesGroupes(s, bands, draft);
              })();
            }}
          >
            {saved ? `✓ ${t('Enregistré')}` : t('Enregistrer')}
          </button>
          <button
            className="btn ghost"
            disabled={payload === null}
            onClick={() => setShare(true)}
          >
            {t('Page publique / QR')}
          </button>
        </div>
        <p className="help">
          {t(
            'La page publique montre ta photo, ta bio, tes liens de streaming et tes prochains concerts publics. Partage-la avec ton public via le QR code ou le lien.',
          )}
        </p>
          </>
        )}
        <p
          className="help"
          style={{ textAlign: 'center', opacity: 0.6, marginTop: 24 }}
        >
          {t('DodoSongs — version du {build}', { build: APP_BUILD })}
        </p>
      </div>

      {/* MA PAGE PUBLIQUE (b242, retour de Vincent : « ça devrait afficher ma
          page telle que le public doit la voir »). Ce bouton n'ouvrait qu'un
          QR et une rangée de raccourcis d'envoi — on ne pouvait donc pas
          vérifier ce qu'un spectateur voit. L'aperçu montre maintenant la
          page RÉELLEMENT publiée, relue depuis le serveur et rendue par le
          composant de la vraie page. Le QR reste, en grand et enregistrable ;
          les raccourcis e-mail et WhatsApp sont partis (« n'ont pas
          d'utilité »). */}
      {share && (
        <PublicPagePeek
          titre={t('Page publique de {nom}', { nom: draft.name })}
          adresse={adressePublique}
          /* Aucune publication ici (b245) — extension de la règle b243
             « un bouton qui CONSULTE n'écrit rien ». La fiche publiée est le
             FILET de récupération du profil : la republier pour un simple
             coup d'œil, avec un profil qu'on vient justement de perdre,
             écraserait la dernière copie qui restait. Le profil enregistré
             et le passage ON AIR la republient, eux — ce sont des actes. */
          sansAdresse={
            pageHomonyme !== ''
              ? t(
                  'Ce compte n’a réservé aucune adresse. Une page publique existe pourtant à ton nom, à l’adresse {adresse} : elle a été créée avec un autre compte — tu t’es peut-être reconnecté avec une autre adresse e-mail que celle d’origine.',
                  { adresse: pageHomonyme },
                )
              : t(
                  'Ta page publique n’est pas encore réservée. Enregistre ton profil : l’adresse se crée toute seule, à partir de ton nom d’artiste.',
                )
          }
          onClose={() => setShare(false)}
        />
      )}
    </>
  );
}
