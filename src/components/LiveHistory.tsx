/**
 * Historique des directs (b176) — sur l'onglet Live.
 *
 * Comment un direct est reconstitué : le serveur ne stocke pas « un concert »
 * mais trois choses séparées — les séances (`live_sessions`), les morceaux
 * archivés à chaque changement de partition (`live_stats`) et les mots du
 * public (`live_messages`). On rattache les deux dernières à la première par
 * leur CRÉNEAU HORAIRE (début → fin, ou début → maintenant si le direct
 * tourne encore). C'est volontairement du recoupement côté client : ça marche
 * avec les données déjà en base, sans migration à rejouer.
 *
 * Le nom donné après coup vit dans les préférences (`prefs.liveNames`) :
 * côté serveur une séance n'a qu'une date, l'artiste seul sait que c'était
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
  LiveMessage,
  LiveSession,
  LiveStat,
} from '../lib/live';
import { useStore } from '../store';

/** Un direct passé, avec tout ce qui s'y est produit. */
interface PastLive {
  id: string;
  startedAt: string;
  endedAt: string | null;
  uniques: number;
  songs: LiveStat[];
  messages: LiveMessage[];
  hearts: number;
  /** Qui jouait : '' = soi (solo), sinon le nom du groupe. */
  band: string;
  /** Setlist tournée, '' si aucune (ou SQL pas encore rejoué). */
  setlist: string;
}

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

  useEffect(() => {
    if (prefs.liveKey.trim() === '') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [se, st, ms] = await Promise.all([
          fetchAudienceSessions(prefs.liveKey),
          fetchLiveStats(prefs.liveKey, namesKey === '' ? [] : namesKey.split(',')),
          fetchMessages(prefs.liveKey, namesKey === '' ? [] : namesKey.split(',')),
        ]);
        if (cancelled) return;
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

  /**
   * Un live est reconstitué à partir des MORCEAUX ARCHIVÉS (b179), pas de la
   * table des séances.
   *
   * Pourquoi ce changement : la séance n'est créée qu'en « best-effort » au
   * lancement — si son écriture échoue, rien n'est journalisé et le direct
   * démarre quand même. L'historique dépendait donc du maillon le plus
   * fragile de la chaîne. Les morceaux joués, eux, sont archivés à chaque
   * changement de partition et sont bel et bien là.
   *
   * Deux morceaux séparés de plus de TROU_MS appartiennent à deux concerts
   * différents : personne ne joue une chanson, s'arrête trois heures, puis
   * reprend le même set. La séance, quand elle existe, sert alors seulement
   * à ajouter le nombre de spectateurs.
   */
  const lives = useMemo<PastLive[]>(() => {
    const TROU_MS = 3 * 60 * 60 * 1000;
    // Les mots peuvent arriver juste avant le 1er morceau ou après le
    // dernier : on élargit un peu le créneau de chaque côté.
    const MARGE_MS = 30 * 60 * 1000;
    const mine = new Set(names.map((n) => n.trim().toLowerCase()));
    const aMoi = (v: string | null | undefined) => {
      const w = String(v ?? '').trim().toLowerCase();
      return w === '' || mine.size === 0 || mine.has(w);
    };

    const joues = [...stats]
      .filter((x) => Number.isFinite(new Date(x.played_at).getTime()))
      .sort((a, b) => a.played_at.localeCompare(b.played_at));

    // Découpage en concerts par écart de temps.
    const groupes: LiveStat[][] = [];
    for (const s of joues) {
      const dernier = groupes[groupes.length - 1];
      const precedent = dernier?.[dernier.length - 1];
      const ecart = precedent
        ? new Date(s.played_at).getTime() -
          new Date(precedent.played_at).getTime()
        : Infinity;
      if (!dernier || ecart > TROU_MS) groupes.push([s]);
      else dernier.push(s);
    }

    const mesSeances = (sessions ?? []).filter((s) => aMoi(s.artist_name));

    return groupes
      .map((songs) => {
        const debut = new Date(songs[0].played_at).getTime();
        const fin = new Date(songs[songs.length - 1].played_at).getTime();
        // Séance correspondante (si elle a bien été enregistrée) : elle seule
        // connaît le nombre de spectateurs uniques.
        const seance = mesSeances.find((se) => {
          const d = new Date(se.started_at).getTime();
          // Séance encore ouverte : elle couvre TOUT ce qui suit son début.
          // La borner à « maintenant » la faisait rater les morceaux joués
          // à la seconde près, et dépendre de l'horloge du téléphone.
          const f = se.ended_at ? new Date(se.ended_at).getTime() : Infinity;
          return d <= fin + MARGE_MS && f >= debut - MARGE_MS;
        });
        const msgs = messages.filter((m) => {
          const at = new Date(m.created_at).getTime();
          return (
            Number.isFinite(at) &&
            at >= debut - MARGE_MS &&
            at <= fin + MARGE_MS
          );
        });
        return {
          // Identifiant stable (sert au nom donné après coup) : la séance si
          // on l'a, sinon l'heure du premier morceau.
          id: seance?.id ?? `t:${songs[0].played_at}`,
          startedAt: seance?.started_at ?? songs[0].played_at,
          // « en cours » ne se devine pas : seule une séance ouverte le dit.
          endedAt: seance
            ? seance.ended_at
            : songs[songs.length - 1].played_at,
          uniques: seance?.uniques ?? 0,
          songs,
          messages: msgs,
          hearts: songs.reduce((n, x) => n + x.hearts, 0),
          // Le `performer` archivé porte le nom du groupe quand c'en était
          // un ; s'il vaut mon nom d'artiste, c'était en solo.
          band: (() => {
            const p = (
              songs.find((x) => (x.performer ?? '') !== '')?.performer ??
              seance?.artist_name ??
              ''
            ).trim();
            return p === '' || p.toLowerCase() === artist.name.trim().toLowerCase()
              ? ''
              : p;
          })(),
          setlist:
            songs.find((x) => (x.setlist_name ?? '') !== '')?.setlist_name ?? '',
        };
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, stats, messages, namesKey]);

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
