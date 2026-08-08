import { LiveBanner } from '../components/LiveBanner';
import React, { useMemo, useState } from 'react';

import { ShareModal } from '../components/ShareModal';
import { Icon } from '../components/Icon';
import { Empty, Field, TopBar } from '../components/ui';
import { t } from '../i18n';
import {
  fetchLiveStats,
  fetchMessages,
  LiveMessage,
  LiveStat,
} from '../lib/live';
import { navigate } from '../router';
import { useStore } from '../store';
import { Concert, emptyConcert, SharePayload } from '../types';

function concertDateLabel(c: Concert): string {
  if (c.date === '') return t('Date à définir');
  const d = new Date(`${c.date}T${c.time || '00:00'}`);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) + (c.time ? ` · ${c.time}` : '');
}

export function isUpcoming(c: Concert): boolean {
  if (c.date === '') return true;
  const end = new Date(`${c.date}T${c.time || '00:00'}`);
  end.setHours(end.getHours() + 6);
  return end.getTime() >= Date.now();
}

export function Concerts() {
  const { concerts } = useStore();
  const sorted = useMemo(
    () =>
      [...concerts].sort((a, b) =>
        (a.date + a.time).localeCompare(b.date + b.time),
      ),
    [concerts],
  );
  const upcoming = sorted.filter(isUpcoming);
  const past = sorted.filter((c) => !isUpcoming(c)).reverse();

  return (
    <>
      {/* Même patron que Morceaux/Setlists : un vrai bouton de création en
          haut du contenu, pas de « + » discret dans l'en-tête. */}
      <TopBar title={t('Concerts')} />
      <div className="page">
        <LiveBanner />
        <div
          className="hstack"
          style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}
        >
          <button className="btn" onClick={() => navigate('/concert/new')}>
            <Icon name="plus" size={16} /> {t('Planifier un concert')}
          </button>
        </div>
        {concerts.length === 0 && (
          <Empty>
            {t('Aucun concert planifié.')}
            <br />
            {t(
              'Date, lieu, setlist : tout au même endroit pour préparer ta prochaine date.',
            )}
          </Empty>
        )}
        {upcoming.length > 0 && (
          <h2 className="pagetitle">{t('À venir')}</h2>
        )}
        <div className="list">
          {upcoming.map((c) => (
            <ConcertRow key={c.id} concert={c} />
          ))}
        </div>
        {past.length > 0 && <h2 className="pagetitle">{t('Passés')}</h2>}
        <div className="list">
          {past.map((c) => (
            <ConcertRow key={c.id} concert={c} />
          ))}
        </div>
      </div>
    </>
  );
}

function ConcertRow({ concert }: { concert: Concert }) {
  const { bands, artist, prefs } = useStore();
  const who =
    (concert.bandId ?? '') !== ''
      ? (bands.find((b) => b.id === concert.bandId)?.name ?? t('Groupe'))
      : `${t('Solo')}${
          prefs.userName || artist.name
            ? ` · ${prefs.userName || artist.name}`
            : ''
        }`;
  return (
    <div
      className="row"
      onClick={() => navigate(`/concert/${concert.id}`)}
    >
      <div className="grow">
        <div className="title">{concert.title || t('(sans titre)')}</div>
        <div className="sub">
          {[
            concertDateLabel(concert),
            who,
            concert.venue,
            concert.visibility === 'prive' ? t('🔒 privé') : '',
          ]
            .filter((x) => x !== '')
            .join(' · ')}
        </div>
      </div>
      {concert.venueUrl !== '' && (
        <button
          className="btn ghost small"
          title={t('Page du lieu : {lieu}', {
            lieu: concert.venue || concert.venueUrl,
          })}
          onClick={(e) => {
            e.stopPropagation();
            window.open(concert.venueUrl, '_blank', 'noopener');
          }}
        >
          <Icon name="pin" size={16} />
        </button>
      )}
      {concert.eventUrl !== '' && (
        <button
          className="btn ghost small"
          title={t('Événement (Facebook, billetterie…)')}
          onClick={(e) => {
            e.stopPropagation();
            window.open(concert.eventUrl, '_blank', 'noopener');
          }}
        >
          <Icon name="calendar" size={16} />
        </button>
      )}
      <span className="chevron"><Icon name="chevron-right" size={18} /></span>
    </div>
  );
}

export function ConcertEdit({ id }: { id: string | null }) {
  const {
    concerts,
    setlists,
    songs,
    artist,
    bands,
    saveConcert,
    deleteConcert,
    prefs,
  } = useStore();
  const [inter, setInter] = useState<{
    stats: LiveStat[];
    messages: LiveMessage[];
  } | null>(null);
  const [interError, setInterError] = useState<string | null>(null);
  const existing = id ? concerts.find((c) => c.id === id) : undefined;
  const [draft, setDraft] = useState<Concert>(() =>
    existing ? { ...existing } : emptyConcert(),
  );
  const [share, setShare] = useState(false);
  const isNew = existing === undefined;

  function update(patch: Partial<Concert>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  const payload = useMemo<SharePayload | null>(() => {
    const setlist = setlists.find((s) => s.id === draft.setlistId);
    const included = setlist
      ? setlist.items
          .map((it) => songs.find((s) => s.id === it.songId))
          .filter((s): s is NonNullable<typeof s> => s !== undefined)
          .map((s) => ({
            ...s,
            versions: [],
            mySetup: undefined,
            idea: undefined,
            noSolo: undefined,
            rehearsalNotes: [],
            structure: s.structure.map((r) => ({ ...r, comment: '' })),
          }))
      : [];
    const futureDates = concerts
      .filter((c) => c.visibility === 'public' && c.id !== draft.id && isUpcoming(c))
      .map((c) => ({
        title: c.title,
        date: c.date,
        time: c.time,
        venue: c.venue,
        venueUrl: c.venueUrl,
        eventUrl: c.eventUrl,
      }));
    return {
      v: 1,
      type: 'setlist',
      view: 'paroles',
      setlist: {
        name: draft.title || setlist?.name || 'Concert',
        comment: [concertDateLabel(draft), draft.venue, draft.description]
          .filter((x) => x !== '')
          .join(' · '),
      },
      songs: included,
      itemKeys: included.map(() => ''),
      itemNotes: included.map(() => ''),
      artist: artist.name !== '' ? artist : undefined,
      concerts: futureDates,
      event:
        draft.venueUrl !== '' || draft.eventUrl !== ''
          ? {
              venue: draft.venue,
              venueUrl: draft.venueUrl,
              eventUrl: draft.eventUrl,
            }
          : undefined,
    };
  }, [draft, setlists, songs, artist, concerts]);

  function onSave() {
    if (draft.title.trim() === '') {
      alert(t('Donne un titre à ton concert.'));
      return;
    }
    saveConcert(draft);
    navigate('/concerts');
  }

  return (
    <>
      <TopBar
        live={false}
        title={isNew ? t('Nouveau concert') : draft.title || t('Concert')}
        onBack={() => history.back()}
      />
      <div className="page">
        <Field label={t('Titre')}>
          <input
            type="text"
            value={draft.title}
            placeholder={t('Fête de la musique — Port-Louis')}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field label={t('Qui joue ?')}>
          <select
            value={draft.bandId ?? ''}
            onChange={(e) => update({ bandId: e.target.value })}
          >
            <option value="">
              {t('Solo')}
              {artist.name !== '' ? ` — ${artist.name}` : ''}
            </option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || t('Groupe sans nom')}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label={t('Date')}>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </Field>
          <Field label={t('Heure')}>
            <input
              type="time"
              value={draft.time}
              onChange={(e) => update({ time: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('Lieu')}>
          <input
            type="text"
            value={draft.venue}
            placeholder={t('Le Kestrel Bar, Tamarin…')}
            onChange={(e) => update({ venue: e.target.value })}
          />
        </Field>
        <Field label={t('Page du lieu (site, Google Maps, Facebook…)')}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={draft.venueUrl}
              placeholder="https://…"
              onChange={(e) => update({ venueUrl: e.target.value })}
            />
            <button
              className="btn ghost"
              style={{ flexShrink: 0 }}
              title={t('Chercher le lieu sur Google, puis colle le lien ici')}
              disabled={draft.venue.trim() === '' && draft.title.trim() === ''}
              onClick={() =>
                window.open(
                  'https://www.google.com/search?q=' +
                    encodeURIComponent(draft.venue.trim() || draft.title.trim()),
                  '_blank',
                  'noopener',
                )
              }
            >
              🔍 Google
            </button>
            {draft.venueUrl !== '' && (
              <button
                className="btn ghost"
                style={{ flexShrink: 0 }}
                title={t('Ouvrir la page du lieu')}
                onClick={() => window.open(draft.venueUrl, '_blank', 'noopener')}
              >
                ↗
              </button>
            )}
          </div>
        </Field>
        <Field label={t('Événement (Facebook, billetterie…)')}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={draft.eventUrl}
              placeholder="https://facebook.com/events/…"
              onChange={(e) => update({ eventUrl: e.target.value })}
            />
            {draft.eventUrl !== '' && (
              <button
                className="btn ghost"
                style={{ flexShrink: 0 }}
                title={t("Ouvrir l'événement")}
                onClick={() => window.open(draft.eventUrl, '_blank', 'noopener')}
              >
                ↗
              </button>
            )}
          </div>
        </Field>
        <Field label={t('Description')}>
          <textarea
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </Field>
        <Field label={t('Setlist')}>
          <select
            value={draft.setlistId}
            onChange={(e) => {
              const setlistId = e.target.value;
              const sl = setlists.find((s) => s.id === setlistId);
              // Choisir une setlist de groupe précise « qui joue ».
              update(
                sl && (sl.bandId ?? '') !== ''
                  ? { setlistId, bandId: sl.bandId }
                  : { setlistId },
              );
            }}
          >
            <option value="">{t('— Aucune —')}</option>
            {setlists.map((s) => {
              const bn =
                (s.bandId ?? '') !== ''
                  ? (bands.find((b) => b.id === s.bandId)?.name ?? '')
                  : t('Solo');
              return (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {bn !== '' ? ` · ${bn}` : ''}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label={t('Visibilité')}>
          <select
            value={draft.visibility}
            onChange={(e) =>
              update({ visibility: e.target.value as Concert['visibility'] })
            }
          >
            <option value="public">
              {t('Public (apparaît sur la page artiste)')}
            </option>
            <option value="prive">{t('Privé')}</option>
          </select>
        </Field>

        <div className="rowactions">
          <button className="btn" onClick={onSave}>
            {t('Enregistrer')}
          </button>
          {draft.setlistId !== '' && (
            <button
              className="btn ghost"
              onClick={() => navigate(`/stage/${draft.setlistId}`)}
            >
              ▶ {t('Mode scène')}
            </button>
          )}
          <button className="btn ghost" onClick={() => setShare(true)}>
            {t('QR public')}
          </button>
          {!isNew && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(t('Supprimer « {titre} » ?', { titre: draft.title }))) {
                  deleteConcert(draft.id);
                  navigate('/concerts');
                }
              }}
            >
              {t('Supprimer')}
            </button>
          )}
        </div>
        <p className="help">
          {t(
            'Le QR public affiche au spectateur : la setlist et les paroles (sans accords), le profil artiste avec les liens de streaming, et les prochaines dates publiques.',
          )}
        </p>

        {!isNew && (
          <>
            <h2 className="pagetitle">{t('Interactions du public')}</h2>
            <p className="help">
              {t(
                "Les ❤ et messages reçus pendant ce concert (le direct doit avoir été lancé le jour du concert pour qu'ils lui soient rattachés).",
              )}
            </p>
            <button
              className="btn ghost small"
              onClick={async () => {
                setInterError(null);
                try {
                  const [stats, messages] = await Promise.all([
                    fetchLiveStats(prefs.liveKey, artist.name),
                    fetchMessages(prefs.liveKey, artist.name),
                  ]);
                  setInter({
                    stats: stats.filter((s) => s.concert_id === draft.id),
                    messages: messages.filter((m) => m.concert_id === draft.id),
                  });
                } catch (e) {
                  setInterError(
                    e instanceof Error ? e.message : t('Chargement impossible.'),
                  );
                }
              }}
            >
              {t('Voir les interactions')}
            </button>
            {interError && (
              <p style={{ color: 'var(--danger)' }}>{interError}</p>
            )}
            {inter !== null && (
              <div className="card" style={{ marginTop: 10 }}>
                {inter.stats.length === 0 && inter.messages.length === 0 && (
                  <p className="help">
                    {t(
                      'Rien pour ce concert (pas encore joué, ou direct lancé sans concert planifié ce jour-là).',
                    )}
                  </p>
                )}
                {inter.stats.length > 0 && (
                  <>
                    <div className="help" style={{ marginBottom: 6 }}>
                      {t('❤ PAR CHANSON — {n} au total', {
                        n: inter.stats.reduce((sum, s) => sum + s.hearts, 0),
                      })}
                    </div>
                    {inter.stats.map((st, i) => (
                      <div className="strow" key={i}>
                        <span style={{ flex: 1 }}>{st.song_title}</span>
                        <span style={{ color: 'var(--live)', fontWeight: 700 }}>
                          ❤ {st.hearts}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {inter.messages.length > 0 && (
                  <>
                    <div className="help" style={{ margin: '12px 0 6px' }}>
                      {t('💬 MESSAGES ({n})', { n: inter.messages.length })}
                    </div>
                    {inter.messages.map((m, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        « {m.body} »
                        <span className="stauthor">
                          {' '}
                          — {m.author !== '' ? m.author : t('anonyme')}
                          {m.song_title !== '' && (
                            <>
                              {' '}
                              {t('· pendant « {titre} »', {
                                titre: m.song_title,
                              })}
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {share && payload && (
        <ShareModal
          title={t('Page publique du concert')}
          payload={payload}
          onClose={() => setShare(false)}
        />
      )}
    </>
  );
}
