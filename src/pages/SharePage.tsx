/**
 * Page publique : reconstruite entièrement depuis le lien de partage.
 * Aucune application ni compte requis pour le destinataire.
 */
import React, { useEffect, useState } from 'react';

import { useAccount } from '../components/Account';
import { LinkPreviews } from '../components/LinkPreviews';
import { LogoMark } from '../components/Logo';
import { ShareModal } from '../components/ShareModal';
import { StagePlan } from '../components/StagePlan';
import { SongBody } from '../components/SongBody';
import { TipBox } from '../components/TipBox';
import { t } from '../i18n';
import { findSameSong } from '../lib/importer';
import { migrateSong } from '../lib/model';
import { getValidSession } from '../lib/auth';
import { joinBand, savePendingInvite } from '../lib/bands';
import { decodeShare, fetchSharedPayload } from '../lib/share';
import { useWakeLock } from '../lib/wakelock';
import { DndHint } from '../components/ui';
import { navigate } from '../router';
import { useStore } from '../store';
import { emptyBand, makeId, SharePayload, ViewMode } from '../types';

function DateLine({
  c,
}: {
  c: {
    title: string;
    date: string;
    time: string;
    venue: string;
    venueUrl?: string;
    eventUrl?: string;
  };
}) {
  const label =
    c.date !== ''
      ? new Date(`${c.date}T${c.time || '00:00'}`).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div className="grow">
        <div className="title">{c.title}</div>
        <div className="sub">
          {[label, c.time].filter((x) => x !== '').join(' · ')}
          {c.venue !== '' && (
            <>
              {label !== '' || c.time !== '' ? ' · ' : ''}
              {c.venueUrl ? (
                <a href={c.venueUrl} target="_blank" rel="noreferrer">
                  📍 {c.venue}
                </a>
              ) : (
                c.venue
              )}
            </>
          )}
        </div>
      </div>
      {c.eventUrl ? (
        <a
          className="btn ghost small"
          href={c.eventUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t('📅 Événement')}
        </a>
      ) : null}
    </div>
  );
}

function ArtistHead({ payload }: { payload: SharePayload }) {
  const artist = payload.artist;
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
      {artist.links.length > 0 && <LinkPreviews links={artist.links} />}
    </div>
  );
}

export function SharePage({
  data,
  shortId,
}: {
  data: string;
  /** Lien court : contenu chargé depuis le serveur */
  shortId?: string;
}) {
  const { songs, saveSong, bands, saveBand, artist, prefs } = useStore();
  const account = useAccount();
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState(false);
  const [added, setAdded] = useState(false);
  const [card, setCard] = useState<SharePayload | null>(null);
  const [memberDone, setMemberDone] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  /**
   * Rejoint le groupe. Si l'invité n'est pas connecté, on mémorise
   * l'invitation et on l'envoie créer son compte : l'adhésion se termine
   * ensuite toute seule (voir AccountProvider). Sans clic supplémentaire,
   * sans saisie : on utilise le nom du compte.
   */
  async function joinCloudBand() {
    const inv = payload?.invite;
    if (!inv?.cloudId || !inv.token || joinBusy) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const s = await getValidSession();
      if (!s) {
        // Pas encore de compte : on mémorise l'invitation et on dirige vers
        // la création de compte (lien magique). L'adhésion sera automatique.
        savePendingInvite({
          cloudId: inv.cloudId,
          token: inv.token,
          band: inv.band,
        });
        navigate('/artist');
        return;
      }
      const name = (
        artist.name ||
        prefs.userName ||
        (account?.email ?? '').split('@')[0] ||
        'Musicien'
      ).trim();
      const bandName = await joinBand(s, inv.cloudId, inv.token, name, '');
      // Le groupe existe désormais aussi dans MON application, relié au
      // cloud : le répertoire partagé se synchronisera automatiquement.
      if (!bands.some((b) => b.cloudId === inv.cloudId)) {
        saveBand({
          ...emptyBand(),
          name: bandName || inv.band,
          cloudId: inv.cloudId,
          owned: false,
          members: [
            {
              id: makeId(),
              name,
              instrument: '',
              verified: true,
              gear: artist.gear ? artist.gear.map((g) => ({ ...g })) : [],
            },
          ],
        });
      }
      setJoined(bandName || inv.band);
    } catch (e) {
      setJoinError(
        e instanceof Error ? e.message : t("L'adhésion a échoué — réessaie."),
      );
    } finally {
      setJoinBusy(false);
    }
  }

  // Un musicien qui suit sa partition depuis le lien : écran toujours allumé
  useWakeLock(payload?.view === 'complete');

  /** Côté musicien invité : construit sa carte à renvoyer au groupe. */
  function makeCard() {
    if (!payload?.invite) return;
    let name = (artist.name || prefs.userName).trim();
    if (name === '') {
      const asked = prompt(
        t("Ton nom d'artiste (il remplacera ton nom dans le groupe)"),
      );
      if (asked === null || asked.trim() === '') return;
      name = asked.trim();
    }
    const instrument = (
      prompt(t('Ton instrument (facultatif — chant, guitare, basse…)')) ?? ''
    ).trim();
    setCard({
      v: 1,
      type: 'member',
      view: 'paroles',
      member: {
        bandId: payload.invite.bandId ?? '',
        bandName: payload.invite.band,
        name,
        instrument,
      },
    });
  }

  function addToLibrary() {
    if (!payload) return;
    const list =
      payload.type === 'song' && payload.song
        ? [payload.song]
        : (payload.songs ?? []);
    let count = 0;
    let skipped = 0;
    for (const s of list) {
      if (findSameSong(songs, s.title, s.lyrics)) {
        skipped++;
        continue;
      }
      saveSong(migrateSong({ ...s, id: makeId() }));
      count++;
    }
    setAdded(true);
    const skippedPart =
      skipped > 0
        ? ' ' +
          (skipped > 1
            ? t('({n} déjà présents)', { n: skipped })
            : t('({n} déjà présent)', { n: skipped }))
        : '';
    const base =
      count > 1
        ? t('{n} morceaux ajoutés à ta bibliothèque', { n: count })
        : t('{n} morceau ajouté à ta bibliothèque', { n: count });
    alert(base + skippedPart + '.');
  }

  useEffect(() => {
    let cancelled = false;
    const load =
      shortId !== undefined && shortId !== ''
        ? fetchSharedPayload(shortId)
        : decodeShare(data);
    load
      .then((p) => {
        // compatibilité anciens liens + migration du modèle des morceaux
        if (p.view === undefined) {
          p.view = p.withChords ? 'complete' : 'paroles';
        }
        if (p.song) p.song = migrateSong(p.song);
        if (p.songs) p.songs = p.songs.map(migrateSong);
        if (!cancelled) setPayload(p);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data, shortId]);

  if (error) {
    return (
      <div className="public">
        <p style={{ textAlign: 'center' }}>
          {t('Ce lien de partage est invalide ou incomplet.')}
        </p>
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="public">
        <p className="help" style={{ textAlign: 'center' }}>
          {t('Ouverture…')}
        </p>
      </div>
    );
  }

  const cardBand =
    payload.type === 'member' && payload.member
      ? (bands.find((b) => b.id === payload.member?.bandId) ??
        bands.find((b) => b.name === payload.member?.bandName) ??
        null)
      : null;

  return (
    <div className="public">
      {payload.view === 'complete' && <DndHint />}
      <ArtistHead payload={payload} />

      {payload.type === 'invite' && payload.invite && (
        <div
          className="card"
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: 'var(--sp-5)',
          }}
        >
          <LogoMark size={96} />
          <h1 style={{ margin: 0 }}>
            {t("{from} t'invite à rejoindre « {band} »", {
              from: payload.invite.from,
              band: payload.invite.band,
            })}
          </h1>
          {/* L'invitation est NOMINATIVE (b251) : on le dit à celui qui
              l'ouvre, sinon un lien transféré ressemble à un lien public. */}
          {(payload.invite.for ?? '') !== '' && (
            <p className="help" style={{ margin: 0 }}>
              {t(
                'Cette invitation est nominative : elle a été créée pour {nom}, et ne peut servir qu’une fois.',
                { nom: payload.invite.for ?? '' },
              )}
            </p>
          )}
          <div
            className="hstack"
            style={{
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              color: 'var(--text-dim)',
              fontSize: '0.86rem',
            }}
          >
            <span>✓ {t('Gratuit')}</span>
            <span>✓ {t('Le répertoire du groupe arrive tout seul')}</span>
            <span>✓ {t('Tes morceaux restent à toi')}</span>
          </div>
          {joined !== null ? (
            <p style={{ color: 'var(--accent)', fontWeight: 700, margin: 0 }}>
              {t(
                '✓ Tu fais partie de « {band} » ! Ouvre ton onglet Groupes.',
                { band: joined },
              )}
            </p>
          ) : !payload.invite.cloudId ? (
            <p className="help" style={{ margin: 0 }}>
              {t(
                "Pour rejoindre en un clic, demande à {from} d'ouvrir l'invitation en étant connecté(e) à son compte, puis de te renvoyer le lien.",
                { from: payload.invite.from },
              )}
            </p>
          ) : account?.email != null ? (
            <button
              className="btn block"
              disabled={joinBusy}
              onClick={() => void joinCloudBand()}
            >
              {joinBusy
                ? '…'
                : t('🤝 Rejoindre « {band} »', { band: payload.invite.band })}
            </button>
          ) : (
            <>
              <button
                className="btn block"
                onClick={() => {
                  const inv = payload.invite;
                  if (inv?.cloudId && inv.token) {
                    savePendingInvite({
                      cloudId: inv.cloudId,
                      token: inv.token,
                      band: inv.band,
                    });
                  }
                  navigate('/artist');
                }}
              >
                {t('Créer mon compte gratuit pour rejoindre')}
              </button>
              <p className="help" style={{ margin: 0 }}>
                {t('Tu deviens membre du groupe')}{' '}
                <strong>{t('automatiquement')}</strong>{' '}
                {t(
                  "après la création de ton compte. Déjà inscrit(e) ? Le même bouton te connecte.",
                )}
              </p>
            </>
          )}
          {joinError && (
            <p style={{ color: 'var(--danger)', margin: 0 }}>{joinError}</p>
          )}
        </div>
      )}

      {payload.type === 'member' && payload.member && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: 2 }}>🎸 {payload.member.name}</h1>
          <p className="help" style={{ marginTop: 4 }}>
            {t('a créé son profil DodoSongs')}
            {payload.member.instrument !== ''
              ? ` — ${payload.member.instrument}`
              : ''}
            {payload.member.bandName !== ''
              ? ` · ${t('groupe « {band} »', { band: payload.member.bandName })}`
              : ''}
          </p>
          {memberDone !== null ? (
            <p style={{ color: 'var(--accent)' }}>✓ {memberDone}</p>
          ) : cardBand ? (
            <div style={{ textAlign: 'left' }}>
              <p className="help">
                {t(
                  'Remplace un musicien de « {band} » par ce profil, ou ajoute-le :',
                  { band: cardBand.name },
                )}
              </p>
              {cardBand.members.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {m.name || t('(sans nom)')}
                    {m.instrument !== '' && (
                      <span className="stauthor"> · {m.instrument}</span>
                    )}
                  </span>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      const member = payload.member;
                      if (!member) return;
                      saveBand({
                        ...cardBand,
                        members: cardBand.members.map((x) =>
                          x.id === m.id
                            ? {
                                ...x,
                                name: member.name,
                                instrument:
                                  member.instrument || x.instrument,
                                verified: true,
                              }
                            : x,
                        ),
                      });
                      setMemberDone(
                        `${m.name || t('(sans nom)')} → ${member.name}`,
                      );
                    }}
                  >
                    {t('Remplacer')}
                  </button>
                </div>
              ))}
              <button
                className="btn ghost block"
                onClick={() => {
                  const member = payload.member;
                  if (!member) return;
                  saveBand({
                    ...cardBand,
                    members: [
                      ...cardBand.members,
                      {
                        id: makeId(),
                        name: member.name,
                        instrument: member.instrument,
                        verified: true,
                      },
                    ],
                  });
                  setMemberDone(
                    t('{name} ajouté au groupe', { name: member.name }),
                  );
                }}
              >
                {t('＋ Ajouter comme nouveau musicien')}
              </button>
            </div>
          ) : (
            <p className="help">
              {payload.member.bandName !== ''
                ? t(
                    "Cette carte répond à une invitation de groupe : ouvre ce lien sur l'appareil où le groupe « {band} » est géré pour mettre à jour ses musiciens.",
                    { band: payload.member.bandName },
                  )
                : t(
                    "Cette carte répond à une invitation de groupe : ouvre ce lien sur l'appareil où le groupe est géré pour mettre à jour ses musiciens.",
                  )}
            </p>
          )}
        </div>
      )}

      {payload.type === 'song' && payload.song && (
        <>
          <h1 style={{ marginBottom: 2 }}>{payload.song.title}</h1>
          <p className="help" style={{ marginTop: 0 }}>
            {[
              payload.song.artist,
              payload.view !== 'paroles' && payload.song.key !== ''
                ? t('Tonalité {key}', { key: payload.song.key })
                : '',
              payload.view !== 'paroles' && payload.song.capo > 0
                ? t('Capo {n}', { n: payload.song.capo })
                : '',
            ]
              .filter((x) => x !== '')
              .join(' · ')}
          </p>
          {payload.view === 'complete' &&
            payload.song.rehearsalNotes.length > 0 && (
              <div className="notesbox">
                <div className="label">{t('Notes de répétition')}</div>
                {payload.song.rehearsalNotes
                  .map((n) => (
                    <div key={n.id}>
                      💬 {n.text}
                      {n.author !== '' && <em className="stauthor"> — {n.author}</em>}
                    </div>
                  ))}
              </div>
            )}
          <SongBody song={payload.song} view={payload.view as ViewMode} />
        </>
      )}

      {payload.type === 'setlist' && (
        <>
          <h1 style={{ marginBottom: 2, textAlign: 'center' }}>
            {payload.setlist?.name}
          </h1>
          {payload.setlist?.comment !== '' && (
            <p className="help" style={{ textAlign: 'center' }}>
              {payload.setlist?.comment}
            </p>
          )}
          {payload.view === 'complete' && payload.setlist?.setup && (
            <details className="stfold" style={{ margin: '10px 0 16px' }}>
              <summary>{t('Sono & scène')}</summary>
              <div className="spacer" />
              {payload.setlist.setup.positions.length > 0 && (
                <StagePlan
                  positions={payload.setlist.setup.positions}
                  readOnly
                />
              )}
              {payload.setlist.setup.gear !== '' && (
                <div className="notesbox" style={{ marginTop: 10 }}>
                  <div className="label">{t('Matériel')}</div>
                  {payload.setlist.setup.gear}
                </div>
              )}
              {payload.setlist.setup.wiring !== '' && (
                <div className="notesbox">
                  <div className="label">{t('Branchements')}</div>
                  {payload.setlist.setup.wiring}
                </div>
              )}
              {payload.setlist.setup.sound !== '' && (
                <div className="notesbox">
                  <div className="label">{t('Effets & réglages sono')}</div>
                  {payload.setlist.setup.sound}
                </div>
              )}
            </details>
          )}
          {(payload.songs ?? []).map((song, i) => (
            <details key={song.id} className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {i + 1}. {song.title}
                {song.artist !== '' && (
                  <span className="stauthor"> — {song.artist}</span>
                )}
                {payload.view !== 'paroles' && payload.itemKeys?.[i]
                  ? ` · ${payload.itemKeys[i]}`
                  : ''}
                {payload.itemNotes?.[i] ? (
                  <span style={{ color: 'var(--accent)' }}>
                    {' '}
                    · {payload.itemNotes[i]}
                  </span>
                ) : null}
              </summary>
              <div className="spacer" />
              {payload.view === 'complete' &&
                song.rehearsalNotes.length > 0 && (
                  <div className="notesbox">
                    <div className="label">{t('Notes de répétition')}</div>
                    {song.rehearsalNotes
                          .map((n) => (
                        <div key={n.id}>
                          💬 {n.text}
                          {n.author !== '' && (
                            <em className="stauthor"> — {n.author}</em>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              <SongBody song={song} view={payload.view as ViewMode} />
            </details>
          ))}
        </>
      )}

      {payload.view === 'complete' &&
        (payload.type === 'song' || payload.type === 'setlist') && (
          <div className="joinbox">
            <div>
              <strong>
                {payload.invite
                  ? t("{from} t'invite à rejoindre « {band} » sur DodoSongs 🎸", {
                      from: payload.invite.from,
                      band: payload.invite.band,
                    })
                  : t('Tu joues dans le groupe ?')}
              </strong>
              <p className="help" style={{ margin: '4px 0 0' }}>
                {payload.type === 'song'
                  ? t(
                      'Récupère ce morceau dans ton propre DodoSongs (gratuit) : répertoire chez toi, transposition, notes personnelles…',
                    )
                  : t(
                      'Récupère ces morceaux dans ton propre DodoSongs (gratuit) : répertoire chez toi, transposition, notes personnelles…',
                    )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {payload.invite?.cloudId &&
                payload.invite.token &&
                account?.email != null &&
                (joined !== null ? (
                  <span style={{ color: 'var(--accent)', alignSelf: 'center' }}>
                    {t('✓ Tu fais partie de « {band} » !', { band: joined })}
                  </span>
                ) : (
                  <button
                    className="btn"
                    disabled={joinBusy}
                    onClick={() => void joinCloudBand()}
                  >
                    {joinBusy
                      ? '…'
                      : t('🤝 Rejoindre « {band} »', {
                          band: payload.invite.band,
                        })}
                  </button>
                ))}
              {added ? (
                <>
                  {payload.invite && !payload.invite.cloudId && (
                    <button className="btn" onClick={makeCard}>
                      {t('📇 Ma carte pour le groupe')}
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => navigate('/')}>
                    {t('Ouvrir ma bibliothèque')}
                  </button>
                </>
              ) : (
                <button
                  className={`btn ${payload.invite?.cloudId ? 'ghost' : ''}`}
                  onClick={addToLibrary}
                >
                  {t('➕ Ajouter à ma bibliothèque')}
                </button>
              )}
            </div>
          </div>
        )}

      {joinError && (
        <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{joinError}</p>
      )}
      {payload.type !== 'invite' &&
        payload.invite?.cloudId &&
        account?.email == null && (
          <p className="help" style={{ textAlign: 'center' }}>
            {t(
              '💡 Avec un compte DodoSongs (gratuit, onglet Artiste → Mon compte), tu rejoindrais ce groupe en un clic.',
            )}
          </p>
        )}
      {added && payload.invite && !payload.invite.cloudId && (
        <p className="help" style={{ textAlign: 'center' }}>
          {t(
            "📇 Renvoie ta carte de musicien à celui qui t'a invité : ton nom d'artiste remplacera ton nom dans le groupe.",
          )}
        </p>
      )}

      {payload.event &&
        (payload.event.venueUrl !== '' || payload.event.eventUrl !== '') && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              flexWrap: 'wrap',
              margin: '10px 0',
            }}
          >
            {payload.event.venueUrl !== '' && (
              <a
                className="btn ghost"
                href={payload.event.venueUrl}
                target="_blank"
                rel="noreferrer"
              >
                📍 {payload.event.venue || t('Le lieu')}
              </a>
            )}
            {payload.event.eventUrl !== '' && (
              <a
                className="btn ghost"
                href={payload.event.eventUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("📅 L'événement")}
              </a>
            )}
          </div>
        )}

      {payload.view === 'paroles' &&
        payload.type !== 'member' &&
        payload.type !== 'invite' && <TipBox artist={payload.artist ?? null} />}

      {payload.concerts && payload.concerts.length > 0 && (
        <>
          <h2 className="pagetitle" style={{ textAlign: 'center' }}>
            {t('Prochaines dates')}
          </h2>
          {payload.concerts.map((c, i) => (
            <DateLine key={i} c={c} />
          ))}
        </>
      )}

      <div className="footer">
        <a className="ctabanner" href={location.origin + location.pathname}>
          <LogoMark size={44} /> {t('Téléchargez')} <strong>DodoSongs</strong>{' '}
          {t('— votre songbook, gratuit')}
        </a>
        <p className="help" style={{ textAlign: 'center', marginTop: 6 }}>
          <a href="#/cgu" style={{ color: 'var(--text-dim)' }}>
            {t("Conditions d'utilisation")}
          </a>
          {' · '}
          <a href="#/report" style={{ color: 'var(--text-dim)' }}>
            {t('Signaler un contenu')}
          </a>
        </p>
      </div>

      {card && (
        <ShareModal
          title={t('Ma carte de musicien — à envoyer au groupe')}
          payload={card}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}
