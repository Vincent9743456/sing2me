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
import { ShareModal } from '../components/ShareModal';
import { Field, TopBar } from '../components/ui';
import { getValidSession } from '../lib/auth';
import {
  CloudMember,
  ensureCloudBand,
  fetchBandMembers,
  removeBandMember,
} from '../lib/bands';
import { bandToProfile, notesForShare } from '../lib/model';
import { resizePhoto } from '../lib/photo';
import { navigate } from '../router';
import { useStore } from '../store';
import { makeId, SharePayload } from '../types';
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

export function BandEdit({ id }: { id: string }) {
  const {
    bands,
    saveBand,
    deleteBand,
    setlists,
    songs,
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

  // Membres réels (comptes) du groupe publié
  useEffect(() => {
    const cid = band?.cloudId;
    if (!cid || account?.email == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await getValidSession();
        if (!s || cancelled) return;
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
        <TopBar title="Groupe" onBack={() => navigate('/artist')} />
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

  return (
    <>
      <TopBar
        title={band.name || 'Groupe'}
        onBack={() => navigate('/artist')}
      />
      <div className="page">
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
      </div>

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
    </>
  );
}
