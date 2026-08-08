/**
 * Profil d'un groupe : identité publique, membres, invitations.
 * Connecté : le groupe est publié dans le cloud à la première invitation,
 * et les musiciens qui ont un compte le rejoignent en un clic (liste des
 * membres réels ✓ affichée ici).
 */
import React, { useEffect, useMemo, useState } from 'react';

import { useAccount } from '../components/Account';
import { ConfirmSheet, MenuSheet } from '../components/Feedback';
import { GearEditor } from '../components/GearEditor';
import { Icon } from '../components/Icon';
import { LinkPreviews } from '../components/LinkPreviews';
import { ShareModal } from '../components/ShareModal';
import { Field, Modal, SaveBar, TopBar } from '../components/ui';
import { t } from '../i18n';
import { getValidSession } from '../lib/auth';
import { findPublicPageByArtist, PublicPage } from '../lib/publicPages';
import {
  announceBandSong,
  CloudMember,
  deleteCloudBand,
  DirectoryPerson,
  ensureCloudBand,
  BandDeparture,
  fetchBandDepartures,
  fetchBandMembers,
  fetchBandMessages,
  inviteToBand,
  removeBandMember,
  searchProfiles,
} from '../lib/bands';
import {
  bandToProfile,
  dedupeMusicians,
  duplicateVersion,
  removeVersion,
  sameMusician,
  switchVersion,
  versionForBand,
} from '../lib/model';
import { normalizeTitle } from '../lib/importer';
import { resizePhoto } from '../lib/photo';
import { navigate } from '../router';
import { useStore } from '../store';
import { Band, makeId, SharePayload, Song } from '../types';
import { isUpcoming } from './Concerts';

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

/** Pastille membre : photo de profil si disponible, sinon initiales. */
function Avatar({ name, photo }: { name: string; photo?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  const base = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    flexShrink: 0,
  } as const;
  return photo && photo !== '' ? (
    <img src={photo} alt="" style={{ ...base, objectFit: 'cover' }} />
  ) : (
    <div
      style={{
        ...base,
        background: 'var(--surface-high)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '0.85rem',
        color: 'var(--text-dim)',
      }}
    >
      {initials}
    </div>
  );
}

/** Ancienneté lisible (« il y a 2 h ») pour le sous-titre de la Discussion. */
function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("à l'instant");
  if (min < 60) return t('il y a {min} min', { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('il y a {h} h', { h });
  return t('il y a {j} j', { j: Math.floor(h / 24) });
}

export function BandEdit({ id }: { id: string }) {
  const {
    bands,
    saveBand,
    deleteBand,
    setlists,
    songs,
    saveSong,
    clearBandRemoval,
    recordBandRemoval,
    concerts,
    prefs,
    artist,
  } = useStore();
  const band = bands.find((b) => b.id === id);
  const account = useAccount();
  const [invite, setInvite] = useState(false);
  const [share, setShare] = useState(false);
  const [cloudRef, setCloudRef] = useState<{
    cloudId: string;
    token: string;
  } | null>(null);
  const [cloudMembers, setCloudMembers] = useState<CloudMember[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  // Vue par défaut = écran d'accueil du groupe (3 portes) ; l'avancé
  // (édition, page publique, suppression) vit derrière « ⋯ ».
  const [editing, setEditing] = useState(false);
  // b149 : l'édition passe par un BROUILLON — rien n'est enregistré tant
  // que « Valider » (barre de validation) n'est pas pressé.
  const [editDraft, setEditDraft] = useState<Band | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // Fiche d'un membre ouverte au clic (null = fermée). Pour MOI → onglet Artiste.
  const [viewMember, setViewMember] = useState<{
    name: string;
    instrument?: string;
    photo?: string;
  } | null>(null);
  // Page publique du musicien affiché (b173) : undefined = on cherche
  // encore, null = il n'en a pas (ou son nom est porté par plusieurs
  // artistes — on refuse alors de deviner).
  const [memberPage, setMemberPage] = useState<PublicPage | null | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!viewMember) return;
    let cancelled = false;
    setMemberPage(undefined);
    void (async () => {
      const page = await findPublicPageByArtist(viewMember.name);
      if (!cancelled) setMemberPage(page);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMember]);

  // Étape « prénom de l'invité » avant de partager le lien.
  const [invitePrompt, setInvitePrompt] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastMsg, setLastMsg] = useState<{ text: string; at: string } | null>(
    null,
  );
  const [myId, setMyId] = useState('');
  // Ajout d'un membre : recherche dans l'annuaire ou repli lien/email.
  const [addOpen, setAddOpen] = useState(false);
  const [dirQuery, setDirQuery] = useState('');
  const [dirResults, setDirResults] = useState<DirectoryPerson[]>([]);
  const [dirBusy, setDirBusy] = useState(false);
  const [dirMsg, setDirMsg] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  // Invitations RENVOYÉES à des membres déjà inscrits (b140).
  const [reinvited, setReinvited] = useState<Set<string>>(new Set());
  // Musiciens partis de CE groupe, à réinviter (b142).
  const [departures, setDepartures] = useState<BandDeparture[]>([]);
  // Retrait d'un membre par le créateur (b143) — confirmé, jamais brutal.
  const [removeMember, setRemoveMember] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  // Membres réels (comptes) du groupe publié
  useEffect(() => {
    const cid = band?.cloudId;
    if (!cid || account?.email == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await getValidSession();
        if (!s || cancelled) return;
        if (!cancelled) setMyId(s.userId);
        const members = await fetchBandMembers(s, cid);
        if (!cancelled) setCloudMembers(members);
        // Départs à traiter sur CE groupe (b142).
        const gone = await fetchBandDepartures(s);
        if (!cancelled) {
          setDepartures(gone.filter((d) => d.bandId === cid));
        }
        // Dernier message pour le sous-titre de la porte « Discussion ».
        try {
          const msgs = await fetchBandMessages(s, cid);
          const last = msgs.length ? msgs[msgs.length - 1] : null;
          if (!cancelled && last) {
            setLastMsg({ text: last.text, at: last.created_at });
          }
        } catch {
          // fil injoignable : sous-titre générique
        }
      } catch {
        // silencieux : la liste locale reste affichée
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [band?.cloudId, account?.email]);

  async function openInvite() {
    if (!band) return;
    setInviteBusy(true);
    try {
      // Connecté : publie le groupe dans le cloud pour l'adhésion en 1 clic
      if (account?.email != null) {
        const s = await getValidSession();
        if (s) {
          const ref = await ensureCloudBand(s, band.id, band.name);
          setCloudRef(ref);
          if (band.cloudId !== ref.cloudId) {
            saveBand({ ...band, cloudId: ref.cloudId, owned: true });
          }
        }
      }
    } catch {
      // sans cloud, l'invitation classique (répertoire + carte) reste valable
    } finally {
      setInviteBusy(false);
      // On demande d'abord le prénom de l'invité (pour l'afficher « en
      // attente »), puis on partage le lien.
      setPendingName('');
      setInvitePrompt(true);
    }
  }

  /** Ouvre l'ajout de membre : publie le groupe (pour l'annuaire + le jeton). */
  async function openAddMember() {
    if (!band) return;
    setInviteBusy(true);
    try {
      if (account?.email != null) {
        const s = await getValidSession();
        if (s) {
          const ref = await ensureCloudBand(s, band.id, band.name);
          setCloudRef(ref);
          if (band.cloudId !== ref.cloudId) {
            saveBand({ ...band, cloudId: ref.cloudId, owned: true });
          }
        }
      }
    } catch {
      // sans cloud : seul l'invite par lien/carte reste possible
    } finally {
      setInviteBusy(false);
      setDirMsg(null);
      setDirResults([]);
      setDirQuery('');
      setAddOpen(true);
    }
  }

  async function doSearch() {
    if (dirQuery.trim().length < 2 || dirBusy) return;
    setDirBusy(true);
    setDirMsg(null);
    try {
      const s = await getValidSession();
      if (!s) {
        setDirMsg(
          t('Connecte-toi (Profil artiste) pour chercher dans l’annuaire.'),
        );
        return;
      }
      const rows = await searchProfiles(s, dirQuery.trim());
      setDirResults(rows);
      if (rows.length === 0)
        setDirMsg(t('Aucun musicien trouvé pour ce nom.'));
    } catch {
      setDirMsg(t("L'annuaire n'est pas disponible pour le moment."));
      setDirResults([]);
    } finally {
      setDirBusy(false);
    }
  }

  async function invitePerson(person: DirectoryPerson) {
    const cid = band?.cloudId;
    if (!cid) {
      setDirMsg(
        t(
          'Publie d’abord le groupe (invite par lien) avant d’inviter depuis l’annuaire.',
        ),
      );
      return;
    }
    try {
      const s = await getValidSession();
      if (!s) return;
      await inviteToBand(s, cid, person.user_id);
      setInvited((prev) => new Set(prev).add(person.user_id));
      // On matérialise l'invitation par un profil « en attente d'acceptation »
      // dans le groupe : le musicien apparaît tout de suite, marqué comme
      // pas encore accepté (il deviendra un membre normal à son adhésion).
      const already = band?.members.some(
        (m) =>
          m.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
      );
      if (band && !already && person.name.trim() !== '') {
        saveBand({
          ...band,
          members: [
            ...band.members,
            {
              id: makeId(),
              name: person.name.trim(),
              instrument: '',
              pending: true,
            },
          ],
        });
      }
    } catch (e) {
      setDirMsg(e instanceof Error ? e.message : t('Invitation impossible.'));
    }
  }

  const invitePayload = useMemo<SharePayload | null>(() => {
    if (!band) return null;
    // Lien d'invitation MINIMAL : uniquement l'invitation à rejoindre le
    // groupe (pas le répertoire — il arrive par le cloud après adhésion).
    // → lien court, page d'accueil claire, orientée « crée ton compte ».
    return {
      v: 1,
      type: 'invite',
      view: 'paroles',
      invite: {
        band: band.name || t('notre groupe'),
        from: prefs.userName || artist.name || t('Un musicien'),
        bandId: band.id,
        cloudId: cloudRef?.cloudId,
        token: cloudRef?.token,
      },
    };
  }, [band, prefs.userName, artist.name, cloudRef]);

  const publicPayload = useMemo<SharePayload | null>(() => {
    if (!band || band.name.trim() === '') return null;
    const bandSetlistIds = new Set(
      setlists.filter((sl) => sl.bandId === band.id).map((sl) => sl.id),
    );
    return {
      v: 1,
      type: 'artist',
      view: 'paroles',
      artist: bandToProfile(band),
      concerts: concerts
        .filter(
          (c) =>
            c.visibility === 'public' &&
            isUpcoming(c) &&
            (bandSetlistIds.size === 0 || bandSetlistIds.has(c.setlistId)),
        )
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map((c) => ({ title: c.title, date: c.date, time: c.time, venue: c.venue })),
    };
  }, [band, concerts, setlists]);

  if (!band) {
    return (
      <>
        <TopBar title={t('Groupe')} onBack={() => navigate('/bands')} />
        <div className="page">
        <button
          className="btn block"
          onClick={() => navigate(`/band/${band.id}/chat`)}
          title={t(
            'Discussion du groupe : préparer les répéts et concerts, proposer des morceaux',
          )}
        >
          💬 {t('Espace du groupe — discussion, répéts, concerts')}
        </button>
        <div className="spacer" />
          <p className="help">{t("Ce groupe n'existe plus.")}</p>
        </div>
      </>
    );
  }

  /** Copie de travail du groupe (liens et membres dupliqués). */
  const draftOf = (b: Band): Band => ({
    ...b,
    links: b.links.map((l) => ({ ...l })),
    members: b.members.map((m) => ({
      ...m,
      gear: m.gear?.map((g) => ({ ...g })),
    })),
  });

  function startEditing() {
    if (!band) return;
    setEditDraft(draftOf(band));
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setEditDraft(null);
  }

  // b149 : en mode édition, chaque changement va dans le brouillon ; la
  // barre « Valider / Annuler » apparaît dès qu'il diffère du groupe.
  function update(patch: Partial<typeof band>) {
    setEditDraft((d) => (d === null ? d : { ...d, ...patch }));
  }

  // Ce que l'écran d'édition AFFICHE : le brouillon (identique au groupe
  // enregistré hors édition, donc sans effet ailleurs).
  const shown = editing && editDraft !== null ? editDraft : band;
  const editDirty =
    editing &&
    editDraft !== null &&
    JSON.stringify(editDraft) !== JSON.stringify(band);

  function confirmEdit() {
    if (editDraft === null) return;
    saveBand(editDraft);
    setEditSaved(true);
    window.setTimeout(() => setEditSaved(false), 1400);
  }

  function cancelEdit() {
    if (band) setEditDraft(draftOf(band));
  }

  // Propriétaire = créateur du groupe. Lui seul peut supprimer le groupe,
  // inviter ou retirer un musicien. Les autres peuvent seulement le quitter.
  // (owned non renseigné = groupe créé avant cette règle → considéré comme
  // mien pour ne pas bloquer d'anciens groupes ; les adhésions récentes
  // posent explicitement owned:false.)
  const isOwner = band.owned !== false;

  /** Propriétaire → dissout le groupe pour tout le monde ; membre → le quitte
   *  (retire sa propre adhésion cloud). Dans les deux cas, on le retire de mon
   *  app ; mes copies personnelles des morceaux restent. */
  async function dissolveOrLeave() {
    if (!band) return;
    const cid = band.cloudId;
    if (cid) {
      try {
        const s = await getValidSession();
        if (s) {
          if (isOwner) await deleteCloudBand(s, cid);
          else await removeBandMember(s, cid, s.userId);
        }
      } catch {
        // best-effort : la suppression locale a lieu de toute façon
      }
    }
    deleteBand(band.id);
    navigate(isOwner ? '/artist' : '/bands');
  }

  const meKey = (prefs.userName || artist.name || '').trim().toLowerCase();
  // Photo d'un membre : la sienne, ou — pour MOI (le créateur, absent des
  // membres cloud) — celle de mon profil artiste en secours.
  const photoOf = (m: { name: string; photo?: string }): string =>
    m.photo ||
    (meKey !== '' && m.name.trim().toLowerCase() === meKey
      ? artist.photo || ''
      : '');
  const cloudNames = new Set(
    cloudMembers
      .map((m) => m.name.trim().toLowerCase())
      .filter((n) => n !== ''),
  );
  const cloudNamesArr = [...cloudNames];
  // Rapprochement FLOU : un membre local (prénom d'invitation, saisie
  // manuelle) est considéré déjà représenté par un compte cloud dès que
  // l'un contient l'autre (« Marco » ↔ « marco.bosio »). Évite le doublon
  // quand le vrai compte a rejoint sous un nom d'annuaire différent.
  const nameMatchesCloud = (nm: string): boolean =>
    nm !== '' && cloudNamesArr.some((cn) => sameMusician(cn, nm));
  // Membres manuels non déjà représentés par un compte cloud, hors profils
  // « en attente d'acceptation » (comptés à part).
  const manualMembers = shown.members.filter(
    (m) => m.pending !== true && !nameMatchesCloud(m.name.trim().toLowerCase()),
  );
  // Invités pas encore acceptés. Dès que le vrai compte a rejoint (nom cloud
  // qui contient le prénom, ou l'inverse), l'invité n'est plus « en attente ».
  const pendingMembers = shown.members.filter(
    (m) => m.pending === true && !nameMatchesCloud(m.name.trim().toLowerCase()),
  );

  // Données des 3 portes.
  const allMembers = dedupeMusicians([...cloudMembers, ...manualMembers]);
  const memberCount = allMembers.length;
  const fewMembers = memberCount < 2;
  const repCount = songs.filter(
    (s) => versionForBand(s, band.id) !== null,
  ).length;
  const propCount = songs.filter(
    (s) => (s.pendingBandId ?? '') === band.id,
  ).length;
  const bandSetlists = [...setlists]
    .filter((sl) => sl.bandId === band.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function openRepertoire() {
    if (!band) return;
    // Règle 1 : le répertoire = la bibliothèque filtrée sur ce groupe.
    try {
      localStorage.setItem('sing2me/libBandFilter', band.id);
    } catch {
      // stockage indisponible : la bibliothèque s'ouvrira sans filtre
    }
    navigate('/');
  }

  return (
    <>
      <TopBar
        title={band.name || 'Groupe'}
        onBack={() => (editing ? stopEditing() : navigate('/bands'))}
        right={
          !editing ? (
            <button
              className="btn icon"
              title="Plus"
              aria-label="Plus d'actions"
              onClick={() => setHeaderMenu(true)}
            >
              <Icon name="more" size={20} />
            </button>
          ) : undefined
        }
      />
      <div className="page">
        {/* Un musicien a quitté CE groupe (b142) : signalé haut et clair,
            avec le geste qui répare juste à côté. */}
        {departures.length > 0 && (
          <div
            className="card"
            style={{ borderColor: 'var(--accent)', marginBottom: 12 }}
          >
            {departures.map((d) => (
              <div key={d.userId} style={{ marginBottom: 8 }}>
                <div>
                  <strong>{d.name || t('Un musicien')}</strong>{' '}
                  {t(
                    "n'a plus accès au groupe — son application a été réinitialisée.",
                  )}
                </div>
                <div className="rowactions">
                  <button
                    className="btn"
                    disabled={reinvited.has(d.userId)}
                    onClick={() => {
                      const cid = band.cloudId;
                      if (!cid) return;
                      void (async () => {
                        try {
                          const s = await getValidSession();
                          if (!s) return;
                          await inviteToBand(s, cid, d.userId);
                          setReinvited((prev) => new Set(prev).add(d.userId));
                          setDepartures((list) =>
                            list.filter((x) => x.userId !== d.userId),
                          );
                        } catch {
                          /* silencieux : la carte reste */
                        }
                      })();
                    }}
                  >
                    {t('↻ Lui renvoyer la demande')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!editing && (
          <>
            {/* En-tête : photo + nom + membres + Inviter. */}
            <div className="bandhead">
              <button
                className="bandhead-photo"
                title={t('Modifier le groupe (photo, nom…)')}
                onClick={() => startEditing()}
              >
                {band.photo !== '' ? (
                  <img src={band.photo} alt={band.name} />
                ) : (
                  <span aria-hidden="true">👥</span>
                )}
              </button>
              <h1>{band.name || t('Groupe')}</h1>
              <button
                className="bandhead-members"
                onClick={() => setMembersOpen(true)}
                title={t('Voir les musiciens du groupe')}
              >
                <span className="avstack" aria-hidden="true">
                  {allMembers.slice(0, 4).map((m, i) => (
                    <span className="av" key={i}>
                      {photoOf(m) ? (
                        <img src={photoOf(m)} alt="" />
                      ) : (
                        (m.name.trim()[0] || '?').toUpperCase()
                      )}
                    </span>
                  ))}
                  {pendingMembers.slice(0, 2).map((m, i) => (
                    <span
                      className="av pending"
                      key={`p${i}`}
                      title={t("En attente d'acceptation")}
                    >
                      {(m.name.trim()[0] || '?').toUpperCase()}
                    </span>
                  ))}
                </span>
                <span>
                  {band.owned === false && (band.ownerName ?? '') !== ''
                    ? t('créé par {nom} · ', { nom: band.ownerName })
                    : ''}
                  {memberCount > 1
                    ? t('{n} musiciens', { n: memberCount })
                    : t('{n} musicien', { n: memberCount })}
                  {pendingMembers.length > 0
                    ? t(' · {n} en attente', { n: pendingMembers.length })
                    : ''}
                </span>
              </button>
              {isOwner ? (
                <button
                  className={`btn ${fewMembers ? '' : 'ghost'}`}
                  disabled={inviteBusy}
                  onClick={() => void openInvite()}
                  title={t(
                    'Inviter un musicien : il rejoint avec son compte, le répertoire se partage tout seul',
                  )}
                >
                  {inviteBusy ? '…' : `＋ ${t('Inviter')}`}
                </button>
              ) : (
                <span className="help" style={{ margin: 0 }}>
                  {t('Membre du groupe')}
                </span>
              )}
            </div>

            {/* Trois grandes portes. */}
            <button
              className="bigrow"
              onClick={() => navigate(`/band/${band.id}/chat`)}
            >
              <span className="i" aria-hidden="true">
                💬
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Discussion')}</div>
                <div className="su">
                  {lastMsg
                    ? `« ${lastMsg.text.slice(0, 40)}${lastMsg.text.length > 40 ? '…' : ''} » · ${ago(lastMsg.at)}`
                    : t('Prépare répéts et concerts, propose des morceaux')}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            <button className="bigrow" onClick={openRepertoire}>
              <span className="i" aria-hidden="true">
                🎵
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Répertoire du groupe')}</div>
                <div className="su">
                  {repCount > 1
                    ? t('{n} morceaux', { n: repCount })
                    : t('{n} morceau', { n: repCount })}
                  {propCount > 0
                    ? propCount > 1
                      ? t(' · {n} propositions à valider', { n: propCount })
                      : t(' · {n} proposition à valider', { n: propCount })
                    : ''}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            <button
              className="bigrow"
              onClick={() => navigate('/setlists')}
            >
              <span className="i" aria-hidden="true">
                📋
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Setlists du groupe')}</div>
                <div className="su">
                  {bandSetlists.length === 0
                    ? t('Aucune setlist pour ce groupe')
                    : t('{nom} · {n} au total', {
                        nom: bandSetlists[0].name || t('(sans nom)'),
                        n: bandSetlists.length,
                      })}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>
          </>
        )}

        {editing && (
          <>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {shown.photo !== '' ? (
            <img
              src={shown.photo}
              alt={shown.name}
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
              👥
            </div>
          )}
          <div className="spacer" />
          <label className="btn ghost small" style={{ cursor: 'pointer' }}>
            {shown.photo !== ''
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

        <Field label={t('Nom du groupe')}>
          <input
            type="text"
            value={shown.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label={t('Biographie')}>
          <textarea
            value={shown.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder={t('Quelques lignes sur le groupe…')}
          />
        </Field>
        <Field label={t('Lien de pourboire (PayPal.me, Lydia…)')}>
          <input
            type="url"
            value={shown.tipUrl}
            placeholder="https://paypal.me/legroupe"
            onChange={(e) => update({ tipUrl: e.target.value })}
          />
        </Field>

        <h2 className="pagetitle">{t('Streaming & réseaux')}</h2>
        {shown.links.map((link) => (
          <div key={link.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              list="band-link-presets"
              value={link.label}
              placeholder="Spotify, Instagram…"
              style={{ flex: '0 0 132px' }}
              onChange={(e) =>
                update({
                  links: shown.links.map((l) =>
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
                  links: shown.links.map((l) =>
                    l.id === link.id ? { ...l, url: e.target.value } : l,
                  ),
                })
              }
            />
            <button
              className="btn ghost small"
              style={{ color: 'var(--danger)' }}
              onClick={() =>
                update({ links: shown.links.filter((l) => l.id !== link.id) })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <datalist id="band-link-presets">
          {LINK_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <button
          className="btn ghost block"
          onClick={() =>
            update({ links: [...shown.links, { id: makeId(), label: '', url: '' }] })
          }
        >
          ＋ {t('Ajouter un lien')}
        </button>

        <h2 className="pagetitle">{t('Musiciens')}</h2>
        {cloudMembers.length > 0 && (
          <>
            <p className="help">{t('Membres avec compte Sing2Me :')}</p>
            {cloudMembers.map((m) => (
              <div
                key={m.user_id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span style={{ color: 'var(--accent)' }}>✓</span>
                <span style={{ flex: 1 }}>
                  {m.name || t('(sans nom)')}
                  {m.instrument !== '' && (
                    <span className="stauthor"> · {m.instrument}</span>
                  )}
                </span>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  title={t('Retirer du groupe')}
                  onClick={() => {
                    const cid = band.cloudId;
                    if (!cid) return;
                    if (
                      !confirm(
                        t('Retirer {nom} du groupe ?', {
                          nom: m.name || t('ce musicien'),
                        }),
                      )
                    )
                      return;
                    void (async () => {
                      try {
                        const s = await getValidSession();
                        if (!s) return;
                        await removeBandMember(s, cid, m.user_id);
                        setCloudMembers((list) =>
                          list.filter((x) => x.user_id !== m.user_id),
                        );
                      } catch {
                        alert(
                          t('Impossible de retirer ce membre pour le moment.'),
                        );
                      }
                    })();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="spacer" />
            <p className="help">{t('Autres musiciens (saisis à la main) :')}</p>
          </>
        )}
        {/* Musiciens saisis à la main, SANS ceux qui ont déjà un compte
            dans la liste au-dessus (b143) : « Dam » invité et « Dam »
            connecté sont la même personne. */}
        {manualMembers.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
          {m.pending === true ? (
            <div className="pendingmember">
              <span className="av pending" aria-hidden="true">
                {(m.name.trim()[0] || '?').toUpperCase()}
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">{m.name || t('(invité)')}</div>
                <div className="sub">{t("⏳ En attente d'acceptation")}</div>
              </div>
              <button
                className="btn ghost small"
                style={{ color: 'var(--danger)' }}
                title={t("Annuler l'invitation")}
                onClick={() =>
                  update({ members: shown.members.filter((x) => x.id !== m.id) })
                }
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ) : (
          <>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            {m.verified === true && (
              <span
                title={t(
                  'Profil Sing2Me confirmé (carte de musicien reçue)',
                )}
                style={{ color: 'var(--accent)', flexShrink: 0 }}
              >
                ✓
              </span>
            )}
            {m.verified === true ? (
              // Le nom d'un membre qui a son propre compte lui appartient :
              // personne d'autre ne peut le modifier (évite les désyncs et
              // les doublons). Seul lui le change, dans son onglet Artiste.
              <div
                className="grow"
                style={{ minWidth: 0 }}
                title={t(
                  'Nom géré par son compte — seul ce musicien peut le modifier',
                )}
              >
                <div className="title">{m.name || t('Musicien')}</div>
                <div className="sub">{t('Nom géré par son compte')}</div>
              </div>
            ) : (
              <input
                type="text"
                value={m.name}
                placeholder={t('Nom du musicien')}
                onChange={(e) =>
                  update({
                    members: shown.members.map((x) =>
                      x.id === m.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
            )}
            <input
              type="text"
              value={m.instrument}
              placeholder={t('Instrument')}
              style={{ maxWidth: 160 }}
              onChange={(e) =>
                update({
                  members: shown.members.map((x) =>
                    x.id === m.id ? { ...x, instrument: e.target.value } : x,
                  ),
                })
              }
            />
            {isOwner && (
              <button
                className="btn ghost small"
                style={{ color: 'var(--danger)' }}
                title={t('Retirer ce musicien')}
                onClick={() =>
                  update({ members: shown.members.filter((x) => x.id !== m.id) })
                }
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <details className="stfold" style={{ margin: '4px 0 0 8px' }}>
            <summary>
              {t('Matériel')}
              {(m.gear ?? []).length > 0 ? ` (${(m.gear ?? []).length})` : ''}
            </summary>
            <div className="spacer" />
            <GearEditor
              items={m.gear ?? []}
              onChange={(gear) =>
                update({
                  members: shown.members.map((x) =>
                    x.id === m.id ? { ...x, gear } : x,
                  ),
                })
              }
            />
          </details>
          </>
          )}
          </div>
        ))}
        {isOwner && (
          <button
            className="btn ghost block"
            onClick={() =>
              update({
                members: [...shown.members, { id: makeId(), name: '', instrument: '' }],
              })
            }
          >
            ＋ {t('Ajouter un musicien')}
          </button>
        )}

        <div className="rowactions">
          {isOwner && (
            <button
              className="btn"
              disabled={inviteBusy}
              onClick={() => void openInvite()}
            >
              {inviteBusy ? '…' : `📨 ${t('Inviter un musicien')}`}
            </button>
          )}
          <button
            className="btn ghost"
            disabled={publicPayload === null}
            onClick={() => setShare(true)}
          >
            {t('Page publique / QR')}
          </button>
          <button
            className="btn danger"
            onClick={() => setConfirmDel(true)}
          >
            {isOwner ? t('Supprimer le groupe') : t('Quitter le groupe')}
          </button>
        </div>
        <p className="help">
          {t(
            "L'invitation contient le répertoire du groupe (morceaux de ses setlists). Si le musicien a un compte Sing2Me, il rejoint le groupe en un clic et apparaît ici avec ✓. Sinon, il peut te renvoyer sa « carte de musicien » (l'ouvrir ici met à jour la liste manuelle).",
          )}
        </p>
        {editSaved && !editDirty && (
          <div className="savedhint">✓ {t('Enregistré')}</div>
        )}
        <div className="spacer" />
        {/* Sortie visible seulement quand tout est enregistré : quand le
            brouillon diffère, la barre Valider / Annuler prend la main. */}
        {!editDirty && (
          <button
            className="btn ghost small"
            onClick={() => stopEditing()}
          >
            ← {t('Terminer')}
          </button>
        )}
          </>
        )}
      </div>
      <SaveBar visible={editDirty} onSave={confirmEdit} onCancel={cancelEdit} />

      {addOpen && (
        <Modal title={t('Ajouter un membre')} onClose={() => setAddOpen(false)}>
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              'Cherche un musicien qui a déjà Sing2Me (il devra accepter), ou envoie-lui un lien / email.',
            )}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={dirQuery}
              placeholder={t('Nom du musicien…')}
              autoFocus
              onChange={(e) => setDirQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doSearch();
              }}
            />
            <button
              className="btn"
              style={{ flexShrink: 0 }}
              disabled={dirQuery.trim().length < 2 || dirBusy}
              onClick={() => void doSearch()}
            >
              {dirBusy ? '…' : t('Chercher')}
            </button>
          </div>
          {dirMsg && <p className="help">{dirMsg}</p>}
          {dirResults.length > 0 && (
            <div className="list">
              {dirResults.map((person) => (
                <div
                  className="row"
                  key={person.user_id}
                  style={{ cursor: 'default' }}
                >
                  <Avatar name={person.name} photo={person.photo} />
                  <div className="grow">
                    <div className="title">
                      {person.name || t('(sans nom)')}
                    </div>
                    {person.instrument !== '' && (
                      <div className="sub">{person.instrument}</div>
                    )}
                  </div>
                  {invited.has(person.user_id) ? (
                    <span style={{ color: 'var(--accent)', fontWeight: 650 }}>
                      ✓ {t('Invité')}
                    </span>
                  ) : (
                    <button
                      className="btn ghost small"
                      onClick={() => void invitePerson(person)}
                    >
                      {t('Inviter')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="spacer" />
          <button
            className="btn ghost block"
            onClick={() => {
              setAddOpen(false);
              setInvite(true);
            }}
          >
            🔗 {t('Inviter par lien / email')}
          </button>
        </Modal>
      )}
      {invitePrompt && (
        <Modal
          title={t('Inviter un musicien')}
          onClose={() => setInvitePrompt(false)}
        >
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              "Qui invites-tu ? Note son prénom : il apparaîtra « en attente » jusqu'à ce qu'il rejoigne, puis son nom d'artiste le remplacera.",
            )}
          </p>
          <input
            type="text"
            value={pendingName}
            placeholder={t("Prénom de l'invité·e")}
            autoFocus
            onChange={(e) => setPendingName(e.target.value)}
          />
          <div className="spacer" />
          <button
            className="btn block"
            onClick={() => {
              const nm = pendingName.trim();
              if (
                nm !== '' &&
                !band.members.some(
                  (m) => m.name.trim().toLowerCase() === nm.toLowerCase(),
                )
              ) {
                saveBand({
                  ...band,
                  members: [
                    ...band.members,
                    { id: makeId(), name: nm, instrument: '', pending: true },
                  ],
                });
              }
              setInvitePrompt(false);
              setInvite(true);
            }}
          >
            {t("Obtenir le lien d'invitation")}
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 8 }}
            onClick={() => {
              setInvitePrompt(false);
              setInvite(true);
            }}
          >
            {t('Partager sans noter de prénom')}
          </button>
        </Modal>
      )}
      {invite && invitePayload && (
        <ShareModal
          title={t('Inviter dans « {nom} »', { nom: band.name })}
          payload={invitePayload}
          onClose={() => setInvite(false)}
        />
      )}
      {share && publicPayload && (
        <ShareModal
          title={t('Page publique — {nom}', { nom: band.name })}
          payload={publicPayload}
          onClose={() => setShare(false)}
        />
      )}
      {/* « ⋯ » de l'en-tête : tout l'avancé du groupe. */}
      {removeMember && (
        <ConfirmSheet
          title={t('Retirer {nom} du groupe ?', {
            nom: removeMember.name || t('ce musicien'),
          })}
          message={t(
            "Il perdra l'accès au répertoire et aux setlists du groupe. Sa bibliothèque personnelle, elle, ne bouge pas. Tu pourras le réinviter plus tard.",
          )}
          confirmLabel={t('Retirer du groupe')}
          danger
          onConfirm={() => {
            const cid = band.cloudId;
            const target = removeMember.userId;
            if (!cid) return;
            void (async () => {
              try {
                const s = await getValidSession();
                if (!s) return;
                await removeBandMember(s, cid, target);
                setCloudMembers((list) =>
                  list.filter((x) => x.user_id !== target),
                );
                // Retirer aussi son entrée LOCALE : sinon le musicien
                // réapparaît juste en dessous, en « saisi à la main ».
                saveBand({
                  ...band,
                  members: band.members.filter(
                    (x) => !sameMusician(x.name, removeMember.name),
                  ),
                });
                setDepartures((list) =>
                  list.filter((x) => x.userId !== target),
                );
              } catch {
                /* silencieux : la liste se rafraîchira à la prochaine ouverture */
              }
            })();
          }}
          onClose={() => setRemoveMember(null)}
        />
      )}

      {membersOpen && (
        <Modal
          title={t('Musiciens du groupe')}
          onClose={() => setMembersOpen(false)}
        >
          {allMembers.length === 0 && pendingMembers.length === 0 && (
            <p className="help">{t("Aucun musicien pour l'instant.")}</p>
          )}
          {allMembers.map((m, i) => {
            const isMe =
              meKey !== '' && m.name.trim().toLowerCase() === meKey;
            // Membre avec compte : le créateur peut le retirer du groupe
            // (b143). Les musiciens saisis à la main n'ont pas de compte.
            const cloud = cloudMembers.find((c) => sameMusician(c.name, m.name));
            const canRemove =
              band.owned === true && !isMe && cloud !== undefined;
            // Ligne CLIQUABLE avec ses actions dedans (b145) — un <button>
            // dans un <button> est invalide en HTML : la corbeille passait
            // à la ligne, décalée sous le musicien.
            return (
              <div
                className="row"
                key={`a${i}`}
                style={{ cursor: 'pointer' }}
                title={
                  isMe
                    ? t('Voir / modifier ma fiche')
                    : t('Voir la fiche de {nom}', { nom: m.name })
                }
                onClick={() => {
                  if (isMe) {
                    setMembersOpen(false);
                    navigate('/artist');
                  } else {
                    setViewMember({
                      name: m.name,
                      instrument: m.instrument,
                      photo: photoOf(m),
                    });
                  }
                }}
              >
                <Avatar name={m.name} photo={photoOf(m)} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title">{m.name || t('Musicien')}</div>
                  {m.instrument !== '' && (
                    <div className="sub">{m.instrument}</div>
                  )}
                </div>
                {canRemove && (
                  <button
                    className="btn icon"
                    style={{ color: 'var(--danger)', flexShrink: 0 }}
                    title={t('Retirer {nom} du groupe', {
                      nom: m.name || t('ce musicien'),
                    })}
                    aria-label={t('Retirer {nom} du groupe', {
                      nom: m.name || t('ce musicien'),
                    })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemoveMember({
                        userId: cloud!.user_id,
                        name: m.name,
                      });
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
                <span className="chevron" aria-hidden="true">
                  <Icon name="chevron-right" size={16} />
                </span>
              </div>
            );
          })}
        </Modal>
      )}
      {viewMember && (
        <Modal title={t('Fiche musicien')} onClose={() => setViewMember(null)}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--sp-3)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              <Avatar name={viewMember.name} photo={viewMember.photo} />
            </div>
            <h2 style={{ margin: '0 0 2px' }}>
              {viewMember.name || t('Musicien')}
            </h2>
            {(viewMember.instrument ?? '') !== '' && (
              <p className="help" style={{ margin: 0 }}>
                {viewMember.instrument}
              </p>
            )}
          </div>
          {memberPage === undefined ? (
            <p className="help" style={{ textAlign: 'center' }}>
              {t('Recherche de sa page publique…')}
            </p>
          ) : memberPage === null ? (
            <p className="help" style={{ textAlign: 'center' }}>
              {t(
                'Ce musicien n’a pas encore de page publique Sing2Me — ou son nom d’artiste est porté par plusieurs comptes.',
              )}
            </p>
          ) : (
            <>
              {(memberPage.profile.bio ?? '') !== '' && (
                <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
                  {memberPage.profile.bio}
                </p>
              )}
              {(memberPage.profile.links ?? []).some(
                (l) => l.url.trim() !== '',
              ) && (
                <LinkPreviews links={memberPage.profile.links ?? []} showChips />
              )}
              {/* Ouverture dans un ONGLET À PART (b175) : dans l'app
                  installée, un lien ordinaire remplaçait l'écran et il n'y
                  avait plus aucun moyen de revenir au groupe. */}
              <button
                className="btn block"
                onClick={() =>
                  window.open(
                    `${location.origin}/${memberPage.name}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                {t('Voir sa page publique')}
              </button>
            </>
          )}
        </Modal>
      )}
      {headerMenu && (
        <MenuSheet
          title={band.name || t('Groupe')}
          items={[
            {
              label: t('Modifier le groupe'),
              icon: 'edit',
              onClick: () => startEditing(),
            },
            {
              label: t('Page publique / QR'),
              icon: 'qr',
              onClick: () => setShare(true),
            },
            {
              label: isOwner ? t('Supprimer le groupe') : t('Quitter le groupe'),
              icon: isOwner ? 'trash' : 'x',
              danger: true,
              onClick: () => setConfirmDel(true),
            },
          ]}
          onClose={() => setHeaderMenu(false)}
        />
      )}
      {confirmDel && (
        <ConfirmSheet
          title={
            isOwner
              ? t('Supprimer le groupe « {nom} » ?', {
                  nom: band.name || t('ce groupe'),
                })
              : t('Quitter le groupe « {nom} » ?', {
                  nom: band.name || t('ce groupe'),
                })
          }
          message={
            isOwner
              ? t(
                  'Le groupe sera dissous pour tous les membres (chacun garde ses copies personnelles des morceaux).',
                )
              : t(
                  'Tu quittes ce groupe. Tes copies personnelles des morceaux restent dans ta bibliothèque.',
                )
          }
          confirmLabel={isOwner ? t('Supprimer le groupe') : t('Quitter le groupe')}
          danger
          onConfirm={() => void dissolveOrLeave()}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </>
  );
}
