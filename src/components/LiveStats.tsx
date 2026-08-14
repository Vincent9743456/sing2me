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
 * Réduit à l'ESSENTIEL (b310, demande de Vincent) : quatre chiffres, rien
 * d'autre. Le détail replié (morceau par morceau, séances, fanbase, bouton
 * de report manuel) a été retiré — les ❤ et les mots du public descendent
 * de toute façon tout seuls dans la bibliothèque, et l'historique des lives
 * porte déjà le détail par concert. Un écran = une mission.
 */
import React, { useEffect, useRef, useState } from 'react';

import { useToast } from './Feedback';
import { t } from '../i18n';
import {
  fetchHistoriqueLive,
  fetchMessages,
  heartTotals,
  LiveMessage,
  LiveSession,
  LiveStat,
  messagesBySong,
  PastLiveRow,
} from '../lib/live';
import { liveReady } from '../lib/liveAuth';
import { buildPastLives } from '../lib/pastlives';
import { fetchFollowerStats, FollowerStats } from '../lib/fanbase';
import { useStore } from '../store';

export function LiveStats() {
  const { prefs, artist, bands, songs, saveSong, resetAt } = useStore();
  const toast = useToast();
  const [stats, setStats] = useState<LiveStat[] | null>(null);
  const [messages, setMessages] = useState<LiveMessage[] | null>(null);
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [rows, setRows] = useState<PastLiveRow[]>([]);
  const [followers, setFollowers] = useState<FollowerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Mon nom d'artiste ET celui de mes groupes : les ❤ et les mots reçus
  // pendant un concert du groupe appartiennent à chaque membre (b139/b168).
  const names = [artist.name, ...bands.map((b) => b.name)]
    .map((n) => n.trim())
    .filter((n) => n !== '');
  const namesKey = names.join(',');
  // cloudId de mes groupes : c'est ce qui dit au serveur quels lives sont
  // les miens (un live de groupe appartient à tous ses membres, b188).
  const cloudKey = bands
    .map((b) => (b.cloudId ?? '').trim())
    .filter((c) => c !== '')
    .join(',');

  useEffect(() => {
    if (!liveReady(prefs.liveKey) || namesKey === '') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cids = cloudKey === '' ? [] : cloudKey.split(',');
    void (async () => {
      setLoading(true);
      try {
        // UN appel pour lives + morceaux + séances (b339) : le serveur
        // renvoyait déjà les trois ensemble, on l'appelait trois fois.
        const [h, ms, fo] = await Promise.all([
          fetchHistoriqueLive(prefs.liveKey, namesKey.split(','), cids),
          fetchMessages(prefs.liveKey, namesKey.split(',')),
          fetchFollowerStats(prefs.liveKey, artist.name),
        ]);
        if (cancelled) return;
        setRows(h.rows);
        setStats(h.stats);
        setMessages(ms);
        setSessions(h.sessions);
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
  }, [prefs.liveKey, namesKey, cloudKey]);

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
  if (!liveReady(prefs.liveKey)) return null;

  /*
   * TOUS les chiffres de cette carte viennent de MES lives — la même liste
   * que l'onglet Live, à la ligne près (b182, complété b203).
   *
   * Seul le nombre de lives passait par là. Les ❤ étaient la somme de TOUTES
   * les lignes rendues par le serveur, et les spectateurs celle de TOUTES les
   * séances — y compris celles des lives que j'ai retirés de mon historique,
   * ceux d'avant une réinitialisation, et celles qui ne m'appartiennent pas.
   * Le compteur de spectateurs ignorait au passage le plancher de b201 :
   * l'onglet Live annonçait « 👥 1 » sur six lignes pendant que la fiche
   * artiste affichait « 0 spectateurs » (constat de Vincent).
   *
   * Un seul calcul, quatre cartes qui ne peuvent plus se contredire.
   */
  const caches = prefs.hiddenLives ?? [];
  const lives = buildPastLives({
    rows,
    sessions,
    stats: stats ?? [],
    messages: messages ?? [],
    names,
    bands: bands.map((b) => ({ cloudId: b.cloudId ?? '', name: b.name })),
    me: [artist.name, prefs.userName],
    artistName: artist.name,
    depuis: resetAt?.lives,
  }).filter((l) => !caches.includes(l.id));
  const nbLives = lives.length;
  const totalHearts = lives.reduce((n, l) => n + l.hearts, 0);
  const totalPublic = lives.reduce((n, l) => n + l.uniques, 0);
  // Même règle : les mots comptés sont ceux de MES lives.
  const nbMessages = lives.reduce((n, l) => n + l.messages.length, 0);
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
        </>
      )}
      <div className="spacer" />
    </>
  );
}
