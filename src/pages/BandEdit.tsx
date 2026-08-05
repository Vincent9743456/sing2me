/**
 * Profil d'un groupe : identité publique, membres, invitations.
 * Connecté : le groupe est publié dans le cloud à la première invitation,
 * et les musiciens qui ont un compte le rejoignent en un clic (liste des
 * membres réels ✓ affichée ici).
 */
import React, { useEffect, useMemo, useState } from 'react';

import { useAccount } from '../components/Account';
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
  inviteToBand,
  removeBandMember,
  searchProfiles,
} from '../lib/bands';
import {
  bandToProfile,
  duplicateVersion,
  notesForShare,
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

export function BandEdit({ id }: { id: string }) {
  const {
    bands,
    saveBand,
    deleteBand,
    setlists,
    songs,
    saveSong,
    clearBandRemoval,
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
  // Vue par défaut = fiche mise en forme ; « Modifier » ouvre le formulaire.
  const [editing, setEditing] = useState(false);
  const [myId, setMyId] = useState('');
  // Ajout d'un membre : recherche dans l'annuaire ou repli lien/email.
  const [addOpen, setAddOpen] = useState(false);
  const [dirQuery, setDirQuery] = useState('');
  const [dirResults, setDirResults] = useState<DirectoryPerson[]>([]);
  const [dirBusy, setDirBusy] = useState(false);
  const [dirMsg, setDirMsg] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  // Répertoire : ajout de morceaux au groupe (bouton dédié, hors discussion).
  const [repOpen, setRepOpen] = useState(false);

  /**
   * Ajoute un morceau du répertoire personnel au répertoire du groupe :
   * on lui crée sa version « groupe » (sans changer la version affichée) ;
   * le fil de discussion reçoit une annonce automatique et la synchro le
   * propage aux autres membres (en proposition à accepter).
   */
  function addToRepertoire(song: Song) {
    if (!band || versionForBand(song, band.id)) return;
    const prev = song.activeVersionId;
    saveSong(
      switchVersion(duplicateVersion(song, band.name || 'Groupe', band.id), prev),
    );
    clearBandRemoval(band.id, normalizeTitle(song.title));
    void announceBandSong(
      band.cloudId,
      prefs.userName || artist.name || 'Moi',
      song.title,
      song.artist,
    );
  }

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
    } catch (e) {
      setDirMsg(e instanceof Error ? e.message : 'Invitation impossible.');
    }
  }

  const invitePayload = useMemo<SharePayload | null>(() => {
    if (!band) return null;
    const bandSetlists = setlists.filter((sl) => sl.bandId === band.id);
    const ids = new Set(
      bandSetlists.flatMap((sl) => sl.items.map((i) => i.songId)),
    );
    const source = ids.size > 0 ? songs.filter((s) => ids.has(s.id)) : songs;
    const included = source.map((s) => ({
      ...s,
      versions: [],
      mySetup: undefined,
      idea: undefined,
      noSolo: undefined,
      rehearsalNotes: notesForShare(s.rehearsalNotes, 'groupe'),
    }));
    return {
      v: 1,
      type: 'setlist',
      view: 'complete',
      invite: {
        band: band.name || 'notre groupe',
        from: prefs.userName || artist.name || 'Un musicien',
        bandId: band.id,
        cloudId: cloudRef?.cloudId,
        token: cloudRef?.token,
      },
      setlist: { name: `Répertoire — ${band.name || 'groupe'}`, comment: '' },
      songs: included,
      itemKeys: included.map((s) => s.key),
      itemNotes: included.map(() => ''),
    };
  }, [band, setlists, songs, prefs.userName, artist.name, cloudRef]);

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
  // évite le créateur affiché deux fois quand il devient membre cloud).
  const manualMembers = band.members.filter(
    (m) => m.name.trim() === '' || !cloudNames.has(m.name.trim().toLowerCase()),
  );

  return (
    <>
      <TopBar
        title={band.name || 'Groupe'}
        onBack={() => navigate('/bands')}
      />
      <div className="page">
        {!editing && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {band.photo !== '' ? (
                <img
                  src={band.photo}
                  alt={band.name}
                  title="Changer la photo du groupe"
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid var(--border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setEditing(true)}
                />
              ) : (
                <button
                  title="Ajouter une photo du groupe"
                  onClick={() => setEditing(true)}
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: '50%',
                    background: 'var(--surface-high)',
                    border: '1px dashed var(--border-strong)',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    cursor: 'pointer',
                    color: 'var(--text-dim)',
                    gap: 2,
                  }}
                >
                  👥
                  <span style={{ fontSize: '0.7rem' }}>＋ photo</span>
                </button>
              )}
              <h1 style={{ margin: '12px 0 2px', fontSize: '1.4rem' }}>
                {band.name || 'Groupe'}
              </h1>
              {band.bio !== '' ? (
                <p
                  className="help"
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxWidth: 480,
                    margin: '4px auto 0',
                  }}
                >
                  {band.bio}
                </p>
              ) : (
                <button className="slot" onClick={() => setEditing(true)}>
                  ＋ Ajoute une bio du groupe
                </button>
              )}
            </div>
            {band.links.some((l) => l.url.trim() !== '') ? (
              <LinkPreviews links={band.links} showChips />
            ) : (
              <button className="slot" onClick={() => setEditing(true)}>
                ＋ Ajoute les liens du groupe (Spotify, Instagram, YouTube…)
              </button>
            )}
            <h2 className="pagetitle">Musiciens</h2>
            {(cloudMembers.length > 0 || manualMembers.length > 0) && (
              <div className="list">
                {cloudMembers.map((m) => {
                  const isMe = m.user_id === myId;
                  return (
                    <div
                      className="row"
                      key={m.user_id}
                      onClick={isMe ? () => navigate('/artist') : undefined}
                      style={{ cursor: isMe ? 'pointer' : 'default' }}
                      title={isMe ? 'Voir mon profil artiste' : undefined}
                    >
                      <Avatar
                        name={m.name}
                        photo={isMe ? artist.photo || m.photo : m.photo}
                      />
                      <div className="grow">
                        <div className="title">
                          {m.name || '(sans nom)'}{' '}
                          <span
                            style={{ color: 'var(--accent)' }}
                            title="Compte Sing2Me"
                          >
                            ✓
                          </span>
                        </div>
                        {m.instrument !== '' && (
                          <div className="sub">{m.instrument}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {manualMembers.map((m) => {
                  const isMe =
                    m.verified === true &&
                    meKey !== '' &&
                    m.name.trim().toLowerCase() === meKey;
                  return (
                    <div
                      className="row"
                      key={m.id}
                      onClick={isMe ? () => navigate('/artist') : undefined}
                      style={{ cursor: isMe ? 'pointer' : 'default' }}
                      title={isMe ? 'Voir mon profil artiste' : undefined}
                    >
                      <Avatar name={m.name} photo={isMe ? artist.photo : ''} />
                      <div className="grow">
                        <div className="title">{m.name || '(sans nom)'}</div>
                        {m.instrument !== '' && (
                          <div className="sub">{m.instrument}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              className="btn ghost block"
              disabled={inviteBusy}
              onClick={() => void openAddMember()}
              title="Inviter un musicien : annuaire, lien ou email (il rejoint avec son compte = acceptation)"
            >
              {inviteBusy ? '…' : '＋ Ajouter un membre'}
            </button>
            <div className="rowactions">
              <button className="btn" onClick={() => setEditing(true)}>
                Modifier
              </button>
              <button
                className="btn ghost"
                title="Ajouter des morceaux de ton répertoire au répertoire du groupe"
                onClick={() => setRepOpen(true)}
              >
                <Icon name="music" size={15} /> Répertoire
              </button>
              <button
                className="btn ghost"
                onClick={() => navigate(`/band/${band.id}/chat`)}
              >
                <Icon name="message" size={15} /> Discussion
              </button>
              <button
                className="btn ghost"
                disabled={publicPayload === null}
                onClick={() => setShare(true)}
              >
                Page publique / QR
              </button>
            </div>
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
      {repOpen && (
        <Modal
          title={`Répertoire — ${band.name || 'groupe'}`}
          onClose={() => setRepOpen(false)}
        >
          <p className="help" style={{ marginTop: 0 }}>
            Ajoute des morceaux de ta bibliothèque au répertoire du groupe. Ils
            arrivent chez les autres membres en proposition à accepter, et le
            fil de discussion en est informé.
          </p>
          {songs.filter((s) => s.idea !== true && (s.pendingBandId ?? '') === '')
            .length === 0 && (
            <p className="help">Ta bibliothèque est vide pour l'instant.</p>
          )}
          {[...songs]
            .filter((s) => s.idea !== true && (s.pendingBandId ?? '') === '')
            .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
            .map((song) => {
              const inRep = versionForBand(song, band.id) !== null;
              return (
                <div
                  className="row"
                  key={song.id}
                  onClick={() => {
                    if (!inRep) addToRepertoire(song);
                  }}
                  style={{ cursor: inRep ? 'default' : 'pointer' }}
                >
                  <div className="grow">
                    <div className="title">{song.title || '(sans titre)'}</div>
                    <div className="sub">{song.artist}</div>
                  </div>
                  {inRep ? (
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      ✓ Au répertoire
                    </span>
                  ) : (
                    <span className="chevron">
                      <Icon name="plus" size={16} />
                    </span>
                  )}
                </div>
              );
            })}
          <div className="spacer" />
          <button
            className="btn ghost block"
            onClick={() => setRepOpen(false)}
          >
            Fermer
          </button>
        </Modal>
      )}
    </>
  );
}
