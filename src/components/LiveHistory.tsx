/**
 * Historique des directs (b176) — sur l'onglet Live.
 *
 * Ce composant AFFICHE ; il ne décide pas de ce qu'est un live. Ce découpage
 * vit dans `src/lib/pastlives.ts`, partagé avec le compteur de la fiche
 * Artiste : un direct = un appui sur GO LIVE, borné par la ligne que le
 * serveur enregistre à ce moment-là. Les morceaux archivés et les mots du
 * public s'y rattachent par leur horaire.
 *
 * Le nom donné après coup vit dans les préférences (`prefs.liveNames`) :
 * côté serveur un direct n'a qu'une date, l'artiste seul sait que c'était
 * « la soirée chez Marco ».
 */
import React, { useEffect, useMemo, useState } from 'react';

import { PromptSheet } from './Feedback';
import { Icon } from './Icon';
import { t } from '../i18n';
import {
  fetchAudienceSessions,
  fetchDiag,
  fetchLiveStats,
  fetchMessages,
  fetchPastLives,
  LiveMessage,
  LiveSession,
  LiveStat,
  PastLiveRow,
} from '../lib/live';
import { buildPastLives, PastLive } from '../lib/pastlives';
import { useStore } from '../store';

function jourLong(iso: string): string {
  const d = new Date(iso);
  // Dates en fr-FR (voir rapport i18n) : format court, lisible d'un coup.
  return `${d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LiveHistory() {
  const { prefs, artist, bands, savePrefs } = useStore();
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [rows, setRows] = useState<PastLiveRow[]>([]);
  const [stats, setStats] = useState<LiveStat[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PastLive | null>(null);

  const names = [artist.name, ...bands.map((b) => b.name)]
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const namesKey = names.join(',');
  // Un live de groupe porte le NOM DU GROUPE, pas le mien : sans ces deux
  // repères (qui a lancé, quel groupe), mon propre concert disparaissait de
  // mon historique dès que le groupe n'était pas encore dans ma bibliothèque.
  const cloudKey = bands
    .map((b) => (b.cloudId ?? '').trim())
    .filter((c) => c !== '')
    .join(',');
  const meKey = [artist.name, prefs.userName]
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n !== '')
    .join(',');

  useEffect(() => {
    if (prefs.liveKey.trim() === '') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [se, st, ms, lv] = await Promise.all([
          fetchAudienceSessions(prefs.liveKey),
          fetchLiveStats(prefs.liveKey, namesKey === '' ? [] : namesKey.split(',')),
          fetchMessages(prefs.liveKey, namesKey === '' ? [] : namesKey.split(',')),
          fetchPastLives(prefs.liveKey),
        ]);
        if (cancelled) return;
        setRows(lv);
        setSessions(se);
        setStats(st);
        setMessages(ms);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.liveKey, namesKey]);

  // La définition d'« un live » vit dans src/lib/pastlives.ts : l'onglet Live
  // et le compteur de la fiche Artiste doivent compter la MÊME chose.
  const lives = useMemo<PastLive[]>(
    () =>
      buildPastLives({
        rows,
        sessions,
        stats,
        messages,
        names,
        bandCloudIds: cloudKey === '' ? [] : cloudKey.split(','),
        me: meKey === '' ? [] : meKey.split(','),
        artistName: artist.name,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sessions, stats, messages, namesKey, cloudKey, meKey],
  );

  function nomDe(live: PastLive): string {
    return (prefs.liveNames ?? {})[live.id] ?? '';
  }
  function renommer(live: PastLive, nom: string) {
    const next = { ...(prefs.liveNames ?? {}) };
    if (nom.trim() === '') delete next[live.id];
    else next[live.id] = nom.trim().slice(0, 80);
    savePrefs({ ...prefs, liveNames: next });
  }

  if (prefs.liveKey.trim() === '') return null;
  if (loading) {
    return (
      <>
        <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
        <p className="help">{t('Chargement…')}</p>
      </>
    );
  }
  if (failed) {
    return (
      <>
        <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
        <p className="help">
          {t('Historique indisponible pour l’instant — il reviendra.')}
        </p>
      </>
    );
  }
  if (lives.length === 0) {
    return (
      <>
        <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
        <p className="help">
          {t('Aucun live pour l’instant — lance-en un depuis le bouton GO LIVE.')}
        </p>
        {/* Un écran vide ne dit pas POURQUOI il est vide : ici, on peut le
            demander (b178). Les directs sont journalisés dans une table
            distincte, et son absence passait jusqu'ici inaperçue. */}
        <Diagnostic liveKey={prefs.liveKey} />
      </>
    );
  }

  const ouvert = lives.find((l) => l.id === open) ?? null;

  return (
    <>
      <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
      <div className="list">
        {lives.map((l) => (
          <div
            className="row"
            key={l.id}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpen(l.id === open ? null : l.id)}
          >
            <div className="grow">
              <div className="title">
                {nomDe(l) !== '' ? nomDe(l) : jourLong(l.startedAt)}
                {l.endedAt === null && (
                  <span className="stauthor"> · {t('en cours')}</span>
                )}
              </div>
              <div className="sub">
                {nomDe(l) !== '' && <>{jourLong(l.startedAt)} · </>}
                {l.band !== '' ? l.band : t('Solo')}
                {l.setlist !== '' && <> · {l.setlist}</>}
                {' · '}
                {t('❤ {h} · 💬 {m} · 👥 {u}', {
                  h: l.hearts,
                  m: l.messages.length,
                  u: l.uniques,
                })}
              </div>
            </div>
            <Icon name="chevron-right" size={16} />
          </div>
        ))}
      </div>

      {ouvert && (
        <div
          className="stagelist"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
        >
          <div className="inner">
            <button className="btn block" onClick={() => setOpen(null)}>
              {t('← Fermer')}
            </button>
            <h2 style={{ textAlign: 'center', margin: '16px 0 2px' }}>
              {nomDe(ouvert) !== '' ? nomDe(ouvert) : jourLong(ouvert.startedAt)}
            </h2>
            <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
              {jourLong(ouvert.startedAt)}
              {ouvert.endedAt !== null && <> → {heure(ouvert.endedAt)}</>}
              {' · '}
              {ouvert.band !== '' ? ouvert.band : t('Solo')}
              {ouvert.setlist !== '' && <> · {ouvert.setlist}</>}
            </p>
            <div className="rowactions" style={{ justifyContent: 'center' }}>
              <button
                className="btn ghost small"
                onClick={() => setRenaming(ouvert)}
              >
                {t('✏️ Nommer ce live')}
              </button>
            </div>

            <div className="statgrid" style={{ marginTop: 'var(--sp-3)' }}>
              <div className="statcard">
                <div className="statvalue">{ouvert.hearts}</div>
                <div className="statlabel">❤ {t('reçus')}</div>
              </div>
              <div className="statcard">
                <div className="statvalue">{ouvert.messages.length}</div>
                <div className="statlabel">💬 {t('mots du public')}</div>
              </div>
              <div className="statcard">
                <div className="statvalue">{ouvert.uniques}</div>
                <div className="statlabel">👥 {t('spectateurs')}</div>
              </div>
            </div>

            {ouvert.songs.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 8 }}>
                  🎵 {t('MORCEAUX JOUÉS')}
                </div>
                {ouvert.songs
                  .slice()
                  .sort((a, b) => a.played_at.localeCompare(b.played_at))
                  .map((s, i) => (
                    <div className="strow" key={i}>
                      <span className="stlabel">{heure(s.played_at)}</span>
                      <span style={{ flex: 1 }}>{s.song_title}</span>
                      {s.hearts > 0 && (
                        <span style={{ color: 'var(--live)', fontWeight: 700 }}>
                          ❤ {s.hearts}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {ouvert.messages.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 8 }}>
                  💬 {t('MOTS DU PUBLIC')}
                </div>
                {ouvert.messages.map((m, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    « {m.body} »
                    <div className="stauthor">
                      — {m.author !== '' ? m.author : t('anonyme')} ·{' '}
                      {heure(m.created_at)}
                      {m.song_title !== '' && (
                        <>{t(' · pendant « {titre} »', { titre: m.song_title })}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ouvert.songs.length === 0 && ouvert.messages.length === 0 && (
              <p className="help" style={{ textAlign: 'center' }}>
                {t('Rien n’a été enregistré pendant ce live.')}
              </p>
            )}
          </div>
        </div>
      )}

      {renaming && (
        <PromptSheet
          title={t('Nommer ce live')}
          placeholder={t('Par exemple : soirée chez Marco')}
          initialValue={nomDe(renaming)}
          confirmLabel={t('Enregistrer')}
          onSubmit={(v) => {
            renommer(renaming, v);
            setRenaming(null);
          }}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  );
}

/**
 * « Pourquoi c'est vide ? » (b178) — replié par défaut, en petits
 * caractères : ça ne s'adresse pas à l'usage courant, mais ça évite un
 * aller-retour d'une journée quand un écran reste à zéro sans raison.
 */
function Diagnostic({ liveKey }: { liveKey: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDiag>>>(null);
  const [asked, setAsked] = useState(false);
  return (
    <details
      className="stfold"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || asked) return;
        setAsked(true);
        void fetchDiag(liveKey).then(setData);
      }}
    >
      <summary>{t('Pourquoi c’est vide ?')}</summary>
      <div className="spacer" />
      {data === null ? (
        <p className="help">{t('Vérification…')}</p>
      ) : data.configured === false ? (
        <p className="help">{data.note ?? t('Le direct n’est pas configuré.')}</p>
      ) : (
        <div className="card">
          {data.tables.map((tb) => (
            <div className="strow" key={tb.table}>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {tb.table}
              </span>
              <span className="stauthor" style={{ fontSize: '0.78rem' }}>
                {!tb.ok
                  ? t('inaccessible : {d}', { d: tb.detail || '?' })
                  : tb.rows === 0
                    ? t('vide')
                    : t('{n} ligne(s)', { n: tb.rows ?? 0 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
