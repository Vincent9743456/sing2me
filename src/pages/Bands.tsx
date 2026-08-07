/**
 * Onglet Groupes : tous tes groupes au premier niveau — leur fiche,
 * leur espace de discussion, et la création en un geste.
 */
import { LiveBanner } from '../components/LiveBanner';
import React, { useEffect, useState } from 'react';

import { useAccount } from '../components/Account';
import { Icon } from '../components/Icon';
import { useNotifications } from '../components/Notifications';
import { Empty, Field, TopBar } from '../components/ui';
import { getValidSession } from '../lib/auth';
import {
  BandDeparture,
  fetchBandDepartures,
  fetchMyInvites,
  inviteToBand,
  PendingInvite,
  respondInvite,
} from '../lib/bands';
import { dedupeMusicians } from '../lib/model';
import { creatorMember } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { emptyBand } from '../types';

export function Bands() {
  const { bands, artist, prefs, saveBand } = useStore();
  const account = useAccount();
  const notifications = useNotifications();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  // Musiciens partis de MES groupes, à réinviter (b142).
  const [departures, setDepartures] = useState<BandDeparture[]>([]);
  const [reinviteBusy, setReinviteBusy] = useState('');
  const [inviteBusy, setInviteBusy] = useState('');

  // Ouvrir l'onglet Groupes = « j'ai vu les arrivées » : on efface cette
  // partie de la pastille (les invitations restent tant qu'on n'a pas répondu).
  const memberNews = notifications.memberNews;
  useEffect(() => {
    if (memberNews.length > 0) notifications.acknowledgeMembers();
    // au montage uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invitations reçues (annuaire) : acceptation obligatoire.
  useEffect(() => {
    if (account?.email == null) return;
    let cancelled = false;
    void (async () => {
      const s = await getValidSession();
      if (!s || cancelled) return;
      const list = await fetchMyInvites(s);
      if (!cancelled) setInvites(list);
      // Départs à traiter dans MES groupes (b142) : un musicien qui a
      // réinitialisé son application n'a plus le groupe — il faut le
      // réinviter, et ça ne se devine pas.
      const gone = await fetchBandDepartures(s);
      if (!cancelled) setDepartures(gone);
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.email]);

  /** Renvoie la demande à un musicien parti (b142). */
  async function reinvite(d: BandDeparture) {
    setReinviteBusy(d.userId);
    try {
      const s = await getValidSession();
      if (!s) return;
      await inviteToBand(s, d.bandId, d.userId);
      setDepartures((list) => list.filter((x) => x.userId !== d.userId));
    } catch {
      /* silencieux : la carte reste, on pourra réessayer */
    } finally {
      setReinviteBusy('');
    }
  }

  async function respond(inv: PendingInvite, accept: boolean) {
    setInviteBusy(inv.id);
    try {
      const s = await getValidSession();
      if (!s) return;
      await respondInvite(
        s,
        inv.id,
        accept,
        prefs.userName || artist.name || 'Moi',
        '',
      );
      // Accepter = rejoindre : on crée le groupe en local (le répertoire
      // partagé se synchronise ensuite tout seul).
      if (accept && !bands.some((b) => b.cloudId === inv.band_id)) {
        saveBand({
          ...emptyBand(),
          name: inv.band_name || 'Groupe',
          cloudId: inv.band_id,
          owned: false, // j'ai REJOINT ce groupe : je n'en suis pas le créateur
          members: [creatorMember(artist, prefs.userName)],
        });
      }
      setInvites((list) => list.filter((x) => x.id !== inv.id));
      notifications.refresh();
    } catch {
      // best-effort
    } finally {
      setInviteBusy('');
    }
  }

  function cancelCreate() {
    setCreating(false);
    setNewName('');
  }

  function confirmCreate() {
    const b = {
      ...emptyBand(),
      name: newName.trim() || 'Mon groupe',
      owned: true, // je CRÉE ce groupe : j'en suis le propriétaire
      members: [creatorMember(artist, prefs.userName)],
    };
    saveBand(b);
    cancelCreate();
    navigate(`/band/${b.id}`);
  }

  return (
    <>
      <TopBar title="Groupes" />
      <div className="page">
        <LiveBanner />
        {memberNews.length > 0 && (
          <>
            {memberNews.map((n) => (
              <div
                className="card"
                key={n.key}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderColor: 'var(--accent)',
                }}
              >
                🎉 <strong>{n.memberName}</strong> a rejoint{' '}
                <strong>« {n.bandName} »</strong>.
              </div>
            ))}
            <div className="spacer" />
          </>
        )}
        {/* Un musicien a quitté un de mes groupes (b142) : le plus
            souvent parce qu'il a réinitialisé son application. Il ne
            reviendra pas tout seul — la demande doit être renvoyée. */}
        {departures.length > 0 && (
          <>
            <h2 className="pagetitle" style={{ marginTop: 0 }}>
              À réinviter
            </h2>
            {departures.map((d) => (
              <div
                className="card"
                key={`${d.bandId}|${d.userId}`}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderColor: 'var(--accent)',
                }}
              >
                <div>
                  <strong>{d.name || 'Un musicien'}</strong> n'a plus accès à{' '}
                  <strong>« {d.bandName || 'ton groupe'} »</strong> — son
                  application a été réinitialisée.
                </div>
                <div className="rowactions">
                  <button
                    className="btn"
                    disabled={reinviteBusy === d.userId}
                    onClick={() => void reinvite(d)}
                  >
                    {reinviteBusy === d.userId ? '…' : '↻ Lui renvoyer la demande'}
                  </button>
                </div>
              </div>
            ))}
            <div className="spacer" />
          </>
        )}
        {invites.length > 0 && (
          <>
            <h2 className="pagetitle" style={{ marginTop: 0 }}>
              Invitations reçues
            </h2>
            {invites.map((inv) => (
              <div
                className="card"
                key={inv.id}
                style={{ padding: '10px 12px', marginBottom: 8 }}
              >
                <div>
                  <strong>{inv.from_name || 'Un musicien'}</strong> t'invite à
                  rejoindre{' '}
                  <strong>« {inv.band_name || 'un groupe'} »</strong>.
                </div>
                <div className="rowactions">
                  <button
                    className="btn"
                    disabled={inviteBusy === inv.id}
                    onClick={() => void respond(inv, true)}
                  >
                    Accepter
                  </button>
                  <button
                    className="btn ghost"
                    disabled={inviteBusy === inv.id}
                    onClick={() => void respond(inv, false)}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
            <div className="spacer" />
          </>
        )}
        {bands.length === 0 && !creating ? (
          <Empty>
            Joue à plusieurs : crée ton groupe, invite les autres, et
            partagez répertoire, setlists et discussions.
          </Empty>
        ) : (
          <div className="list">
            {bands.map((band) => (
              <div className="row" key={band.id}>
                <div
                  className="hstack grow"
                  style={{ cursor: 'pointer', gap: 10 }}
                  onClick={() => navigate(`/band/${band.id}`)}
                >
                  {band.photo !== '' ? (
                    <img
                      src={band.photo}
                      alt=""
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '1.4rem' }}>👥</span>
                  )}
                  <div className="grow">
                    <div className="title">{band.name || '(sans nom)'}</div>
                    {/* Une personne, une ligne (b141) : le même musicien
                        pouvait apparaître deux fois — prénom d'invitation
                        (« Marco ») et identifiant de son compte
                        (« marco.bosio »). */}
                    {(() => {
                      const people = dedupeMusicians(
                        band.members.filter((m) => m.name.trim() !== ''),
                      );
                      const n = people.length;
                      return (
                        <div className="sub">
                          {n} musicien{n > 1 ? 's' : ''}
                          {n > 0
                            ? ` · ${people.map((m) => m.name).join(', ')}`
                            : ''}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <button
                  className="btn ghost small"
                  title="Espace du groupe : discussion, répéts, concerts"
                  onClick={() => navigate(`/band/${band.id}/chat`)}
                >
                  <Icon name="message" size={15} /> Discussion
                  {band.cloudId != null &&
                    (notifications.unreadByBand[band.cloudId] ?? 0) > 0 && (
                      <span className="pillcount">
                        {notifications.unreadByBand[band.cloudId]}
                      </span>
                    )}
                </button>
                <span
                  className="chevron"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/band/${band.id}`)}
                >
                  ›
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="spacer" />
        {creating ? (
          <div>
            <Field label="Nom du groupe">
              <input
                type="text"
                value={newName}
                placeholder="Mon groupe"
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreate();
                  else if (e.key === 'Escape') cancelCreate();
                }}
              />
            </Field>
            <div className="rowactions">
              <button className="btn" onClick={confirmCreate}>
                Créer le groupe
              </button>
              <button className="btn ghost" onClick={cancelCreate}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="btn block" onClick={() => setCreating(true)}>
            ＋ Créer un groupe
          </button>
        )}
        <p className="help" style={{ textAlign: 'center' }}>
          Tu invites les autres ensuite, depuis la fiche du groupe.
        </p>
      </div>
    </>
  );
}
