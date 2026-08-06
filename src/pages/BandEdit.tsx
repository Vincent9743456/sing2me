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
import { Field, Modal, TopBar } from '../components/ui';
import { getValidSession } from '../lib/auth';
import {
  announceBandSong,
  CloudMember,
  DirectoryPerson,
  ensureCloudBand,
  fetchBandMembers,
  fetchBandMessages,
  inviteToBand,
  removeBandMember,
  searchProfiles,
} from '../lib/bands';
import {
  bandToProfile,
  duplicateVersion,
  removeVersion,
  switchVersion,
  versionForBand,
} from '../lib/model';
import { normalizeTitle } from '../lib/importer';
import { resizePhoto } from '../lib/photo';
import { navigate } from '../router';
import { useStore } from '../store';
import { makeId, SharePayload, Song } from '../types';
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
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
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
  const [headerMenu, setHeaderMenu] = useState(false);
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
            saveBand({ ...band, cloudId: ref.cloudId });
          }
        }
      }
    } catch {
      // sans cloud, l'invitation classique (répertoire + carte) reste valable
    } finally {
      setInviteBusy(false);
      setInvite(true);
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
            saveBand({ ...band, cloudId: ref.cloudId });
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
        setDirMsg('Connecte-toi (Profil artiste) pour chercher dans l’annuaire.');
        return;
      }
      const rows = await searchProfiles(s, dirQuery.trim());
      setDirResults(rows);
      if (rows.length === 0) setDirMsg('Aucun musicien trouvé pour ce nom.');
    } catch {
      setDirMsg("L'annuaire n'est pas disponible pour le moment.");
      setDirResults([]);
    } finally {
      setDirBusy(false);
    }
  }

  async function invitePerson(person: DirectoryPerson) {
    const cid = band?.cloudId;
    if (!cid) {
      setDirMsg(
        'Publie d’abord le groupe (invite par lien) avant d’inviter depuis l’annuaire.',
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
      setDirMsg(e instanceof Error ? e.message : 'Invitation impossible.');
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
        band: band.name || 'notre groupe',
        from: prefs.userName || artist.name || 'Un musicien',
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
        <TopBar title="Groupe" onBack={() => navigate('/bands')} />
        <div className="page">
        <button
          className="btn block"
          onClick={() => navigate(`/band/${band.id}/chat`)}
          title="Discussion du groupe : préparer les répéts et concerts, proposer des chansons"
        >
          💬 Espace du groupe — discussion, répéts, concerts
        </button>
        <div className="spacer" />
          <p className="help">Ce groupe n'existe plus.</p>
        </div>
      </>
    );
  }

  function update(patch: Partial<typeof band>) {
    if (band) saveBand({ ...band, ...patch });
  }

  const meKey = (prefs.userName || artist.name || '').trim().toLowerCase();
  const cloudNames = new Set(
    cloudMembers
      .map((m) => m.name.trim().toLowerCase())
      .filter((n) => n !== ''),
  );
  // Membres manuels non déjà représentés par un compte (dé-doublonnage :
  // évite le créateur affiché deux fois quand il devient membre cloud) — et
  // hors profils « en attente d'acceptation », comptés à part.
  const manualMembers = band.members.filter(
    (m) =>
      m.pending !== true &&
      (m.name.trim() === '' || !cloudNames.has(m.name.trim().toLowerCase())),
  );
  // Invités pas encore acceptés (si le vrai compte a rejoint entre-temps, le
  // même nom côté cloud le masque : plus « en attente »).
  const pendingMembers = band.members.filter(
    (m) => m.pending === true && !cloudNames.has(m.name.trim().toLowerCase()),
  );

  // Données des 3 portes.
  const allMembers = [...cloudMembers, ...manualMembers];
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
        onBack={() => (editing ? setEditing(false) : navigate('/bands'))}
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
        {!editing && (
          <>
            {/* En-tête : photo + nom + membres + Inviter. */}
            <div className="bandhead">
              <button
                className="bandhead-photo"
                title="Modifier le groupe (photo, nom…)"
                onClick={() => setEditing(true)}
              >
                {band.photo !== '' ? (
                  <img src={band.photo} alt={band.name} />
                ) : (
                  <span aria-hidden="true">👥</span>
                )}
              </button>
              <h1>{band.name || 'Groupe'}</h1>
              <div className="bandhead-members">
                <span className="avstack" aria-hidden="true">
                  {allMembers.slice(0, 4).map((m, i) => (
                    <span className="av" key={i}>
                      {(m.name.trim()[0] || '?').toUpperCase()}
                    </span>
                  ))}
                  {pendingMembers.slice(0, 2).map((m, i) => (
                    <span className="av pending" key={`p${i}`} title="En attente d'acceptation">
                      {(m.name.trim()[0] || '?').toUpperCase()}
                    </span>
                  ))}
                </span>
                <span>
                  {memberCount} musicien{memberCount > 1 ? 's' : ''}
                  {pendingMembers.length > 0
                    ? ` · ${pendingMembers.length} en attente`
                    : ''}
                </span>
              </div>
              <button
                className={`btn ${fewMembers ? '' : 'ghost'}`}
                disabled={inviteBusy}
                onClick={() => void openInvite()}
                title="Inviter un musicien : il rejoint avec son compte, le répertoire se partage tout seul"
              >
                {inviteBusy ? '…' : '＋ Inviter'}
              </button>
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
                <div className="ti">Discussion</div>
                <div className="su">
                  {lastMsg
                    ? `« ${lastMsg.text.slice(0, 40)}${lastMsg.text.length > 40 ? '…' : ''} » · ${ago(lastMsg.at)}`
                    : 'Prépare répéts et concerts, propose des chansons'}
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
                <div className="ti">Répertoire du groupe</div>
                <div className="su">
                  {repCount} morceau{repCount > 1 ? 'x' : ''}
                  {propCount > 0
                    ? ` · ${propCount} proposition${propCount > 1 ? 's' : ''} à valider`
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
                <div className="ti">Setlists du groupe</div>
                <div className="su">
                  {bandSetlists.length === 0
                    ? 'Aucune setlist pour ce groupe'
                    : `${bandSetlists[0].name || '(sans nom)'} · ${bandSetlists.length} au total`}
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
          {band.photo !== '' ? (
            <img
              src={band.photo}
              alt={band.name}
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
            {band.photo !== '' ? 'Changer la photo' : 'Ajouter une photo'}
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

        <Field label="Nom du groupe">
          <input
            type="text"
            value={band.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label="Biographie">
          <textarea
            value={band.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder="Quelques lignes sur le groupe…"
          />
        </Field>
        <Field label="Lien de pourboire (PayPal.me, Lydia…)">
          <input
            type="url"
            value={band.tipUrl}
            placeholder="https://paypal.me/legroupe"
            onChange={(e) => update({ tipUrl: e.target.value })}
          />
        </Field>

        <h2 className="pagetitle">Streaming & réseaux</h2>
        {band.links.map((link) => (
          <div key={link.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              list="band-link-presets"
              value={link.label}
              placeholder="Spotify, Instagram…"
              style={{ flex: '0 0 132px' }}
              onChange={(e) =>
                update({
                  links: band.links.map((l) =>
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
                  links: band.links.map((l) =>
                    l.id === link.id ? { ...l, url: e.target.value } : l,
                  ),
                })
              }
            />
            <button
              className="btn ghost small"
              style={{ color: 'var(--danger)' }}
              onClick={() =>
                update({ links: band.links.filter((l) => l.id !== link.id) })
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
            update({ links: [...band.links, { id: makeId(), label: '', url: '' }] })
          }
        >
          ＋ Ajouter un lien
        </button>

        <h2 className="pagetitle">Musiciens</h2>
        {cloudMembers.length > 0 && (
          <>
            <p className="help">Membres avec compte Sing2Me :</p>
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
                  {m.name || '(sans nom)'}
                  {m.instrument !== '' && (
                    <span className="stauthor"> · {m.instrument}</span>
                  )}
                </span>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  title="Retirer du groupe"
                  onClick={() => {
                    const cid = band.cloudId;
                    if (!cid) return;
                    if (!confirm(`Retirer ${m.name || 'ce musicien'} du groupe ?`)) return;
                    void (async () => {
                      try {
                        const s = await getValidSession();
                        if (!s) return;
                        await removeBandMember(s, cid, m.user_id);
                        setCloudMembers((list) =>
                          list.filter((x) => x.user_id !== m.user_id),
                        );
                      } catch {
                        alert('Impossible de retirer ce membre pour le moment.');
                      }
                    })();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="spacer" />
            <p className="help">Autres musiciens (saisis à la main) :</p>
          </>
        )}
        {band.members.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
          {m.pending === true ? (
            <div className="pendingmember">
              <span className="av pending" aria-hidden="true">
                {(m.name.trim()[0] || '?').toUpperCase()}
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">{m.name || '(invité)'}</div>
                <div className="sub">⏳ En attente d'acceptation</div>
              </div>
              <button
                className="btn ghost small"
                style={{ color: 'var(--danger)' }}
                title="Annuler l'invitation"
                onClick={() =>
                  update({ members: band.members.filter((x) => x.id !== m.id) })
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
                title="Profil Sing2Me confirmé (carte de musicien reçue)"
                style={{ color: 'var(--accent)', flexShrink: 0 }}
              >
                ✓
              </span>
            )}
            <input
              type="text"
              value={m.name}
              placeholder="Nom du musicien"
              onChange={(e) =>
                update({
                  members: band.members.map((x) =>
                    x.id === m.id ? { ...x, name: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              type="text"
              value={m.instrument}
              placeholder="Instrument"
              style={{ maxWidth: 160 }}
              onChange={(e) =>
                update({
                  members: band.members.map((x) =>
                    x.id === m.id ? { ...x, instrument: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              className="btn ghost small"
              style={{ color: 'var(--danger)' }}
              title="Retirer ce musicien"
              onClick={() =>
                update({ members: band.members.filter((x) => x.id !== m.id) })
              }
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <details className="stfold" style={{ margin: '4px 0 0 8px' }}>
            <summary>
              Matériel
              {(m.gear ?? []).length > 0 ? ` (${(m.gear ?? []).length})` : ''}
            </summary>
            <div className="spacer" />
            <GearEditor
              items={m.gear ?? []}
              onChange={(gear) =>
                update({
                  members: band.members.map((x) =>
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
        <button
          className="btn ghost block"
          onClick={() =>
            update({
              members: [...band.members, { id: makeId(), name: '', instrument: '' }],
            })
          }
        >
          ＋ Ajouter un musicien
        </button>

        <div className="rowactions">
          <button
            className="btn"
            disabled={inviteBusy}
            onClick={() => void openInvite()}
          >
            {inviteBusy ? '…' : '📨 Inviter un musicien'}
          </button>
          <button
            className="btn ghost"
            disabled={publicPayload === null}
            onClick={() => setShare(true)}
          >
            Page publique / QR
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(`Supprimer le groupe « ${band.name} » ?`)) {
                deleteBand(band.id);
                navigate('/artist');
              }
            }}
          >
            Supprimer
          </button>
        </div>
        <p className="help">
          L'invitation contient le répertoire du groupe (morceaux de ses
          setlists). Si le musicien a un compte Sing2Me, il rejoint le groupe
          en un clic et apparaît ici avec ✓. Sinon, il peut te renvoyer sa
          « carte de musicien » (l'ouvrir ici met à jour la liste manuelle).
        </p>
        <div className="spacer" />
        <button
          className="btn ghost small"
          onClick={() => setEditing(false)}
        >
          ← Terminer
        </button>
          </>
        )}
      </div>

      {addOpen && (
        <Modal title="Ajouter un membre" onClose={() => setAddOpen(false)}>
          <p className="help" style={{ marginTop: 0 }}>
            Cherche un musicien qui a déjà Sing2Me (il devra accepter), ou
            envoie-lui un lien / email.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={dirQuery}
              placeholder="Nom du musicien…"
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
              {dirBusy ? '…' : 'Chercher'}
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
                    <div className="title">{person.name || '(sans nom)'}</div>
                    {person.instrument !== '' && (
                      <div className="sub">{person.instrument}</div>
                    )}
                  </div>
                  {invited.has(person.user_id) ? (
                    <span style={{ color: 'var(--accent)', fontWeight: 650 }}>
                      ✓ Invité
                    </span>
                  ) : (
                    <button
                      className="btn ghost small"
                      onClick={() => void invitePerson(person)}
                    >
                      Inviter
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
            🔗 Inviter par lien / email
          </button>
        </Modal>
      )}
      {invite && invitePayload && (
        <ShareModal
          title={`Inviter dans « ${band.name} »`}
          payload={invitePayload}
          onClose={() => setInvite(false)}
        />
      )}
      {share && publicPayload && (
        <ShareModal
          title={`Page publique — ${band.name}`}
          payload={publicPayload}
          onClose={() => setShare(false)}
        />
      )}
      {/* « ⋯ » de l'en-tête : tout l'avancé du groupe. */}
      {headerMenu && (
        <MenuSheet
          title={band.name || 'Groupe'}
          items={[
            {
              label: 'Modifier le groupe',
              icon: 'edit',
              onClick: () => setEditing(true),
            },
            {
              label: 'Page publique / QR',
              icon: 'qr',
              onClick: () => setShare(true),
            },
            {
              label: 'Supprimer le groupe',
              icon: 'trash',
              danger: true,
              onClick: () => setConfirmDel(true),
            },
          ]}
          onClose={() => setHeaderMenu(false)}
        />
      )}
      {confirmDel && (
        <ConfirmSheet
          title={`Supprimer « ${band.name || 'ce groupe'} » ?`}
          message="Le groupe est retiré de ton app. Tes morceaux personnels restent dans ta bibliothèque."
          confirmLabel="Supprimer le groupe"
          danger
          onConfirm={() => {
            deleteBand(band.id);
            navigate('/bands');
          }}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </>
  );
}
