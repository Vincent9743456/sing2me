/**
 * Statistiques des directs, sur la fiche Artiste (b171).
 *
 * Pourquoi ce composant : ces chiffres étaient enfermés dans le mode
 * « Modifier » de la fiche, derrière un bouton « Voir les statistiques ».
 * Consulter ses résultats n'a rien à voir avec modifier son profil — on les
 * affiche donc en lecture, et on les charge tout seul.
 *
 * PRIVÉ par construction : ce composant vit dans l'onglet Artiste de l'app
 * (compte obligatoire) et n'est importé par aucune page publique. Rien de ce
 * qui est ici ne doit jamais apparaître sur la page du QR.
 *
 * Le détail (morceau par morceau, séances, mots reçus) reste replié : un
 * écran = une mission, l'avancé ne coûte rien à qui ne le cherche pas.
 */
import React, { useEffect, useRef, useState } from 'react';

import { useToast } from './Feedback';
import { t } from '../i18n';
import {
  fetchAudienceSessions,
  fetchLiveStats,
  fetchMessages,
  heartTotals,
  LiveMessage,
  LiveSession,
  LiveStat,
  messagesBySong,
} from '../lib/live';
import { fetchFollowerStats, FollowerStats } from '../lib/fanbase';
import { useStore } from '../store';

/** Date courte lisible (reste en fr-FR, voir rapport i18n). */
function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}
function jourHeure(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function LiveStats() {
  const { prefs, artist, bands, songs, saveSong } = useStore();
  const toast = useToast();
  const [stats, setStats] = useState<LiveStat[] | null>(null);
  const [messages, setMessages] = useState<LiveMessage[] | null>(null);
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [followers, setFollowers] = useState<FollowerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Mon nom d'artiste ET celui de mes groupes : les ❤ et les mots reçus
  // pendant un concert du groupe appartiennent à chaque membre (b139/b168).
  const names = [artist.name, ...bands.map((b) => b.name)]
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const namesKey = names.join(',');

  useEffect(() => {
    if (prefs.liveKey.trim() === '' || namesKey === '') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [st, ms, se, fo] = await Promise.all([
          fetchLiveStats(prefs.liveKey, namesKey.split(',')),
          fetchMessages(prefs.liveKey, namesKey.split(',')),
          fetchAudienceSessions(prefs.liveKey),
          fetchFollowerStats(prefs.liveKey, artist.name),
        ]);
        if (cancelled) return;
        setStats(st);
        setMessages(ms);
        setSessions(se);
        setFollowers(fo);
        setError(null);
      } catch (e) {
        // Hors ligne ou serveur muet : on le dit sans casser la fiche.
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('Chargement impossible.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.liveKey, namesKey]);

  // Report AUTOMATIQUE (instruction Vincent, b175) : les ❤ descendaient déjà
  // tout seuls dans la bibliothèque, les mots du public attendaient un clic.
  // Dès que les chiffres sont là, les deux sont recopiés — sans rien dire,
  // c'est de la tenue de livres, pas une action de l'artiste.
  const reporte = useRef(false);
  useEffect(() => {
    if (loading || stats === null || messages === null) return;
    if (reporte.current) return;
    reporte.current = true;
    reporter(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, stats, messages]);

  // Le direct n'est pas configuré : rien à montrer, et surtout rien à
  // expliquer ici — le réglage vit dans « Modifier ».
  if (prefs.liveKey.trim() === '') return null;

  const totalHearts = (stats ?? []).reduce((n, s) => n + s.hearts, 0);
  // Nombre de lives (b180) : même découpage que l'historique de l'onglet
  // Live — deux morceaux séparés de plus de 3 h = deux concerts. Compté
  // sur les morceaux archivés, pas sur les séances : celles-ci peuvent
  // manquer sans qu'on le sache (voir LiveHistory).
  const nbLives = (() => {
    const TROU_MS = 3 * 60 * 60 * 1000;
    const joues = [...(stats ?? [])]
      .map((x) => new Date(x.played_at).getTime())
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b);
    let n = 0;
    let precedent = -Infinity;
    for (const at of joues) {
      if (at - precedent > TROU_MS) n++;
      precedent = at;
    }
    return n;
  })();
  const totalPublic = (sessions ?? []).reduce((n, s) => n + s.uniques, 0);
  const nbMessages = messages?.length ?? 0;
  const nbFollowers = followers?.count ?? 0;
  const rien =
    !loading &&
    error === null &&
    nbLives === 0 &&
    totalHearts === 0 &&
    totalPublic === 0 &&
    nbMessages === 0 &&
    nbFollowers === 0;

  /** Recopie ❤ et mots du public sur les morceaux de la bibliothèque. */
  function reporter(silencieux = false) {
    const totals = heartTotals(stats ?? []);
    const bySong = messagesBySong(messages ?? []);
    let n = 0;
    for (const s of songs) {
      const total = totals.get(s.title);
      const known = new Set(s.fanMessages.map((m) => m.id));
      const fresh = bySong
        .get(s.title)
        .map((m) => ({
          id: `${m.created_at}|${m.author}|${m.body.slice(0, 40)}`,
          author: m.author,
          text: m.body,
          createdAt: m.created_at,
        }))
        .filter((m) => !known.has(m.id));
      const heartsChanged = total !== undefined && total !== s.hearts;
      if (heartsChanged || fresh.length > 0) {
        saveSong({
          ...s,
          hearts: heartsChanged ? (total as number) : s.hearts,
          fanMessages: [...s.fanMessages, ...fresh],
        });
        n++;
      }
    }
    if (silencieux) return; // report de fond : pas de bandeau intempestif
    toast.show(
      n === 0
        ? t('La bibliothèque est déjà à jour.')
        : n > 1
          ? t('❤ et messages reportés sur {n} morceaux.', { n })
          : t('❤ et messages reportés sur {n} morceau.', { n }),
    );
  }

  return (
    <>
      <h2 className="pagetitle">{t('Tes lives')}</h2>
      {loading && stats === null ? (
        <p className="help">{t('Chargement…')}</p>
      ) : error !== null ? (
        <p className="help">
          {t('Chiffres indisponibles pour l’instant — ils reviendront.')}
        </p>
      ) : rien ? (
        <p className="help">{t('Pas encore de données — lance un direct !')}</p>
      ) : (
        <>
          <div className="statgrid">
            <div className="statcard">
              <div className="statvalue">{nbLives}</div>
              <div className="statlabel">🔴 {t('lives joués')}</div>
            </div>
            <div className="statcard">
              <div className="statvalue">{totalHearts}</div>
              <div className="statlabel">❤ {t('reçus')}</div>
            </div>
            <div className="statcard">
              <div className="statvalue">{totalPublic}</div>
              <div className="statlabel">
                👥 {t('spectateurs (toutes séances)')}
              </div>
            </div>
            <div className="statcard">
              <div className="statvalue">{nbFollowers}</div>
              <div className="statlabel">⭐ {t('suiveurs')}</div>
            </div>
          </div>

          <details className="stfold">
            <summary>{t('Voir le détail')}</summary>
            <div className="spacer" />

            {sessions !== null && sessions.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 8 }}>
                  👥 {t('AUDIENCE DE TES CONCERTS')}
                </div>
                {sessions.map((s) => (
                  <div className="strow" key={s.id}>
                    <span style={{ flex: 1 }}>
                      {jourHeure(s.started_at)}
                      {s.ended_at === null && (
                        <em className="stauthor"> · {t('en cours')}</em>
                      )}
                    </span>
                    <strong style={{ whiteSpace: 'nowrap' }}>
                      {s.uniques > 1
                        ? t('{n} spectateurs', { n: s.uniques })
                        : t('{n} spectateur', { n: s.uniques })}
                    </strong>
                  </div>
                ))}
              </div>
            )}

            {/* Les mots du public vivent dans l'historique des lives
                (décision Vincent, b178) : ils appartiennent au concert où
                ils ont été écrits, pas à une pile hors sol. */}
            {stats !== null && stats.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 8 }}>
                  ❤ {t('MORCEAU PAR MORCEAU')}
                </div>
                {stats.map((st, i) => (
                  <div className="strow" key={i}>
                    <span className="stlabel">{jour(st.played_at)}</span>
                    <span style={{ flex: 1 }}>
                      {st.song_title}
                      {st.concert_title !== '' && (
                        <span className="stauthor"> · {st.concert_title}</span>
                      )}
                    </span>
                    <span style={{ color: 'var(--live)', fontWeight: 700 }}>
                      ❤ {st.hearts}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {followers !== null && followers.sharedEmails.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 4 }}>
                  ⭐ {t('TA FANBASE')}
                </div>
                <p className="help" style={{ marginTop: 8, marginBottom: 4 }}>
                  {t('Emails partagés avec toi ({n}) :', {
                    n: followers.sharedEmails.length,
                  })}
                </p>
                <div className="help" style={{ wordBreak: 'break-all' }}>
                  {followers.sharedEmails.join(', ')}
                </div>
              </div>
            )}

            {(stats?.length ?? 0) > 0 && (
              <button className="btn ghost small" onClick={() => reporter()}>
                ↻ {t('Reporter ❤ et messages dans la bibliothèque')}
              </button>
            )}
          </details>
        </>
      )}
      <div className="spacer" />
    </>
  );
}
